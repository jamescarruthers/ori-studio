# Simulator WebGPU backend

## Goal

Decide, on evidence, whether the origami simulator should gain a WebGPU solver
and renderer above the WebGL2 ones, and build it if the evidence says so.

This is Phase 3 of `origami-simulator-performance.md`, which deferred WebGPU
until two things held: browser support had improved, and profiling showed the
WebGL2 backend was the bottleneck. This plan re-checks the first, measures the
second, and spikes the two parts of a port most likely to sink it.

## Approach

### Where support stands (checked 2026-10-28)

| Target | WebGPU |
| --- | --- |
| Chrome / Edge, Windows, macOS, ChromeOS | Shipped since 113 |
| Chrome, Android 12+ | Shipped since 121 (most GPUs) |
| Chrome, Linux | Intel Gen12+ since 144, NVIDIA on Wayland since 147; other set-ups behind a flag |
| Firefox, Windows | Shipped since 141 |
| Firefox, macOS | Shipped from 145 (Apple silicon, macOS 26) and 147 (all) |
| Firefox, Linux and Android | Nightly or flag only; Mozilla expects Linux in 2026 |
| Safari 26, macOS / iOS / iPadOS / visionOS | Shipped (caniuse rates macOS "partial") |
| WKWebView (Tauri, macOS) | Not documented by Apple or Tauri; probe needed |
| WebKitGTK (Tauri, Linux) | Not documented; probe needed |

caniuse puts global reach at 87.8% (85.8% full, 2.0% partial; September 2026
data), against about 95% for WebGL2. Sources: caniuse.com/webgpu and the gpuweb
implementation-status wiki.

So the reach argument has narrowed but not closed. Linux is still the weak
platform in every engine, and it is also where the simulator already has a
known GPU failure (`simulator-worker-gpu-capability.md`). A WebGPU backend can
only ever be a top rung of the ladder, with WebGL2 and the CPU reference beneath
it.

### What a port has to change

Most of the solver maps over: float textures become storage buffers, the CSR
layout carries over as is, the five fragment passes become five compute
dispatches, and the renderer reads the position buffer by `vertex_index`.
Three things do not:

1. **Readback is async.** `SolverBackend` reads synchronously (`maxVelocity`,
   `readPositions`, `readShape`, `readStrain`), and `SimulationClock` calls
   `maxVelocity()` every tick. WebGPU offers only `mapAsync`. The clock must act
   on the last completed sample rather than this tick's.
2. **Binding limits.** The force pass reads 15–16 textures; WebGPU guarantees
   only 8 storage buffers per stage (10 on the SwiftShader adapter here). The
   static topology has to be packed into fewer buffers, or the device must ask
   for a higher limit.
3. **Parity restarts.** Every shader is rewritten in WGSL, so the parity gate
   must run again from scratch, with `thetaCalc`'s `atan2` and 2π unwrap checked
   afresh.

### The spike

Prove the pattern on the smallest pieces that exercise all three, behind no
public API:

- `src/webgpu/gpuCore.ts` — adapter and device acquisition with typed failures,
  and buffer helpers.
- `src/webgpu/normalsPass.ts` — `normalCalc` as a compute shader over the same
  packed layout, checked against the WebGL2 pass on identical input.
- `src/webgpu/motionReduction.ts` — `maxVelocity()` and max strain as a GPU
  reduction with an async read of 12 bytes, replacing the whole-texture
  `readPixels` the WebGL2 backend makes every tick. Must agree with
  `WebglSolver.maxVelocity()` bit for bit, NaN included.
- `bench/webgpuSpikeHarness/` and `bench/webgpuSpike.bench.ts` — parity and
  timing, headless in CI-like Chromium or by hand on real hardware.

The harness page also runs in an ordinary browser, because this container has
no GPU: WebGL2 and WebGPU both run on SwiftShader here, so its timings show
shape, not real speed. The go/no-go numbers must come from real machines.

### Decision rule

Build the full backend only if, on real hardware (an Apple-silicon Mac and a
Windows machine with a discrete GPU at least):

- the WebGL2 tick on the largest fixtures is GPU-bound or readback-bound, not
  bound by something WebGPU would not change; and
- the spike's dispatch and readback costs beat their WebGL2 counterparts by
  enough to matter at those sizes.

Otherwise keep WebGL2 as the default and record the numbers here.

### Spike results

**Headless Chromium, SwiftShader for both APIs (2026-10-28).** Run with
`npm run bench:webgpu-spike`, 100 steps at 60% fold.

| Fixture | Vertices | Normals Δ | Motion | Non-finite | `maxVelocity` gl / gpu (ms) | 1000 normal passes gl / gpu (ms) |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| miura-8x8 | 81 | 0 | exact | caught | 0.18 / 2.96 | 21 / 36 |
| miura-32x32 | 1089 | 0 | exact | caught | 0.43 / 2.78 | 82 / 124 |
| boxpleat-24 | 625 | 0 | exact | caught | 0.23 / 2.63 | 64 / 68 |
| miura-56x56 | 3249 | 0 | exact | caught | 0.36 / 2.84 | 197 / 327 |
| miura-80x80 | 6561 | 0 | exact | caught | 0.61 / 3.80 | 201 / 375 |

What this settles:

- **Parity.** On every non-degenerate fixture the WGSL normals pass matches the
  GLSL one exactly on the same input, and the motion reduction matches
  `WebglSolver.maxVelocity()` bit for bit. A NaN velocity and an infinite
  strain each read as NaN. For this pass at least, transcribing GLSL to WGSL
  kept it exact.
- **The async readback works as designed.** Three words come back, not a
  whole texture, and the caller never blocks.

What it does not settle:

- **Speed.** Both APIs run on a CPU emulator here, so neither column says
  anything about a GPU. On SwiftShader WebGPU is slower in both, and the
  reduction's round trip (about 3 ms, mostly Chromium's IPC to its GPU process)
  is longer than WebGL2's synchronous read. That matters: if the round trip is
  similar on real hardware, the clock's convergence sample would arrive several
  ticks late at 60 fps. It cannot block, but it is stale.
- **The Tauri webviews.** No source documents WebGPU in WKWebView or WebKitGTK.
  Both need a `navigator.gpu` probe inside the app.

To get the real numbers, open the harness page on each machine. From the repo
root:

```bash
npm ci   # once; a bare `npx vite` without it fetches its own Vite, which cannot resolve earcut
npm run bench:webgpu-spike:serve -w @treemaker/origami-simulator
# the harness page opens; press Run
```

**Apple M1 Pro, ANGLE on Metal (2026-10-28).** Two runs by hand in one desktop
browser (not named; its WebGPU adapter line was not captured), which agreed to
within noise. The first is shown, with the second's figure in brackets where it
moved by more than 0.1 ms.

| Fixture | Vertices | Normals Δ | Motion | Non-finite | `maxVelocity` gl / gpu (ms) | 1000 normal passes gl / gpu (ms) |
| --- | ---: | ---: | --- | --- | ---: | ---: |
| miura-8x8 | 81 | 0 | exact | caught | 0.055 / 0.305 | 1.3 / 4.1 |
| miura-32x32 | 1089 | 0 | exact | caught | 0.100 / 0.280 | 1.5 (2.1) / 3.9 (4.3) |
| boxpleat-24 | 625 | 0 | exact | caught | 0.065 / 0.295 | 1.6 / 4.4 (4.0) |
| miura-56x56 | 3249 | 0 | exact | caught | 0.175 / 0.355 | 1.5 (1.8) / 4.9 |
| miura-80x80 | 6561 | 0 | exact | caught | 0.275 / 0.280 | 1.6 / 5.7 |

A third run, first reported as Safari (WebGPU adapter `apple / metal-3`). Its
WebGL2 renderer string, `ANGLE (Apple, ANGLE Metal Renderer …)`, is Chrome's;
Safari reports `Apple GPU` and an adapter of `apple / apple / apple / apple`
(see the full-step runs below). So this was most likely Chrome again:

| Fixture | Vertices | `maxVelocity` gl / gpu (ms) | 1000 normal passes gl / gpu (ms) |
| --- | ---: | ---: | ---: |
| miura-8x8 | 81 | 0.105 / 0.445 | 1.8 / 4.7 |
| miura-32x32 | 1089 | 0.115 / 0.435 | 2.1 / 4.9 |
| boxpleat-24 | 625 | 0.060 / 0.305 | 1.6 / 4.4 |
| miura-56x56 | 3249 | 0.145 / 0.400 | 1.7 / 5.2 |
| miura-80x80 | 6561 | 0.220 / 0.385 | 1.7 / 6.2 |

Parity was again exact on every fixture.

What the single-pass runs show, and what they do not:

- **Parity holds on a real GPU, in both browsers.** Exact normals and
  bit-identical motion on Metal, as on SwiftShader.
- **The batch timing flattered WebGL2.** It drew the normals pass 1000 times
  into one texture. ANGLE's Metal backend can merge consecutive draws to the
  same framebuffer into a single Metal render pass, so each draw cost about
  1.5 µs. A real step writes five textures in turn and gets no such merging:
  the full-step runs below put `WebglSolver` at about 40 µs a pass. The
  single-pass batch is kept, but read it as a test of parity, not of speed.
- **The readback WebGPU would remove costs little.** WebGL2's synchronous
  `maxVelocity()` costs 0.04–0.28 ms and grows with size. WebGPU's async read
  is a flat ~0.3 ms round trip. This finding stands.

### A full step: the earlier WebGPU port

An earlier WebGPU port of Origami Simulator
(github.com/jamescarruthers/OrigamiSimulatorWebGPU) measured a large speed-up
against the original simulator, whose WebGL `solve()` reads every position back
on each call (`third_party/origami-simulator/js/dynamic/dynamicSolver.js:186-200`).
To separate that readback from WebGPU itself, the harness runs that port's five
Euler kernels (`bench/webgpuSpikeHarness/userPortKernels.ts`, copied verbatim)
on the bytes a fresh `WebglSolver` holds, and times four ways to step the same
model:

- WebGL2: `WebglSolver` as Ori Studio runs it;
- WebGL2 + readback: the same, reading every position back after each solve,
  as the original does;
- the port as written: a compute pass and a new bind group per dispatch;
- the port, cached: bind groups built once, one compute pass per solve.

**Apple M1 Pro, Chrome (2026-10-28).** Steps per second, 100 steps per solve,
synced every 8 solves. Δ is the largest position difference from
`WebglSolver` after 100 steps from flat.

| Fixture | Vertices | Δ | WebGL2 | WebGL2 + readback | Port as written | Port, cached |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| miura-8x8 | 81 | 1.9e-8 | 5,018 | 4,820 (0.96×) | 24,082 (4.80×) | 26,529 (5.29×) |
| miura-16x16 | 289 | 1.5e-8 | 5,122 | 4,832 (0.94×) | 24,085 (4.70×) | 26,290 (5.13×) |
| boxpleat-24 | 625 | 7.5e-9 | 5,028 | 4,898 (0.97×) | 21,269 (4.23×) | 23,144 (4.60×) |
| miura-32x32 | 1089 | 1.1e-8 | 5,006 | 4,791 (0.96×) | 22,360 (4.47×) | 24,073 (4.81×) |
| miura-56x56 | 3249 | 9.3e-9 | 3,815 | 3,761 (0.99×) | 16,581 (4.35×) | 17,853 (4.68×) |
| miura-80x80 | 6561 | 7.5e-9 | 3,199 | 3,113 (0.97×) | 9,877 (3.09×) | 10,113 (3.16×) |

**Apple M1 Pro, Safari (2026-10-28).** Same settings. Safari's engine is the
one WKWebView, the Tauri app's macOS webview, uses.

| Fixture | Vertices | Δ | WebGL2 | WebGL2 + readback | Port as written | Port, cached |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| miura-8x8 | 81 | 2.2e-8 | 5,079 | 5,043 (0.99×) | 12,948 (2.55×) | 24,420 (4.81×) |
| miura-16x16 | 289 | 1.5e-8 | 5,123 | 5,055 (0.99×) | 11,736 (2.29×) | 23,910 (4.67×) |
| boxpleat-24 | 625 | 1.1e-8 | 5,053 | 4,902 (0.97×) | 12,963 (2.57×) | 20,664 (4.09×) |
| miura-32x32 | 1089 | 7.5e-9 | 5,063 | 4,920 (0.97×) | 13,054 (2.58×) | 20,870 (4.12×) |
| miura-56x56 | 3249 | 7.5e-9 | 3,922 | 3,879 (0.99×) | 12,352 (3.15×) | 17,225 (4.39×) |
| miura-80x80 | 6561 | 7.2e-9 | 3,236 | 3,159 (0.98×) | 9,050 (2.80×) | 9,938 (3.07×) |

Safari's timer is coarse (whole tenths of a millisecond in places), so its
single-pass readings are not worth comparing; the full-step runs last long
enough for it not to matter.

What it shows:

- **WebGPU is 3–5× faster than WebGL2 for a whole step** on every realistic
  model, falling to 3× at 6561 vertices, where GPU work starts to count.
- **The readback was not the earlier port's gain.** Reading positions back
  each solve costs WebGL2 only 1–6%. The speed-up is WebGPU's.
- **WebGL2's cost is per pass, and fixed.** It runs at about 5,000 steps a
  second whatever the size up to 1089 vertices: about 40 µs a pass, which is
  render-pass setup, not arithmetic.
- **Encoding matters in Safari.** Chrome gains only 3–10% from caching bind
  groups and sharing one compute pass; Safari roughly doubles, from 2.3–3.2×
  to 3–4.8×. So the backend builds its bind groups once and records a whole
  solve into one compute pass.
- **It reaches the performance plan's stretch goal.** That plan asks for 200+
  steps a frame at 60 fps on large models, 12,000 steps a second. WebGL2 gives
  3,200 at 6561 vertices; WebGPU gives about 10,000.

### Decision (2026-10-28): go

Build a WebGPU solver backend, above WebGL2 on the backend ladder. WebGL2 and
the CPU reference stay beneath it for Linux, Firefox on Linux and Android, and
anything else without WebGPU. Run it on Windows before relying on the size of
the gain there.

The earlier provisional no-go rested on the single-pass batch, which measured a
case ANGLE merges and the real solver never hits. It is withdrawn.

Order of work, each step gated by parity against `WebglSolver`:

1. Async readback in `SolverBackend` and `SimulationClock`: the clock acts on
   the latest motion sample that has landed (`MotionReduction`). **Done:**
   `SolverBackend.sampleMotion()` replaces `maxVelocity()` and may return a
   promise; the clock keeps one sample in flight, acts on each once when it
   lands, and drops one asked for before `invalidate`, `reset` or a recovery.
   `settle()` is the headless loop for either kind of backend. Still
   synchronous, for a later step: `readPositions`, `readShape` and
   `readStrain` (pins, picks, pulls, export), and the session's
   `runToConvergence` calls, which move to `settle()` with the backend.
2. The full Euler step, from the earlier port's kernels on Ori Studio's
   packing, with the NaN guards `WebglSolver` adds (beam skip, `acos` clamp,
   safe normalize), which those kernels lack.
3. Verlet, fixed nodes, pull and pose.
4. A WGSL `MeshRenderer` reading the position buffer, so frames stay on the
   GPU.
5. The backend ladder in `simulatorSession.ts`, with a probe that asks the
   worker for a WebGPU device before committing a canvas, as
   `simulator-worker-gpu-capability.md` does for WebGL2.
6. A `navigator.gpu` probe inside the Tauri app on macOS (WKWebView) and Linux
   (WebKitGTK), and a Windows run of this harness.

### Where it stands (2026-10-29)

Steps 2 to 5 are done. `WebgpuSolver` implements the whole `SolverBackend`
and is held to `ReferenceSolver` within Tier C (1e-3) on every fixture, for
Euler and Verlet, pinned and free, through every pull phase and a shape round
trip (`ORI_BENCH_ONLY=solver npm run bench:webgpu-spike`). Its synchronous
reads come from a mirror refreshed by each motion sample; `syncReads()` brings
the mirror up to the queue. `WebgpuMeshRenderer` draws the same picture as
`MeshRenderer` within 3% of pixels at one pixel of slack (`ORI_BENCH_ONLY=render`).

In the app:

- The worker asks for a device as it starts and compiles every shader on it
  (`WebgpuSolver.validateShaders`), so the synchronous `load` builds the solver
  at once (`WebgpuSolver.createNow`). `probeGpuRender` answers from that.
- The ladder is WebGPU, then WebGL2, then the reference solver. A canvas holds
  one kind of context for life, so once the render canvas takes WebGPU, the
  folded figures on it draw through `WebgpuFoldedMeshSource`, and a WebGPU
  failure falls to the reference solver, not to WebGL2.
- A lost device fails the live sessions as a lost GL context does, and the
  worker asks for a new device, which can configure the same canvas.
- `settle` and `sessionScene` wait on `SimulationClock.settle` and
  `syncReads()`.
- The welcome screen's figure (`StartFigureMesh`) draws on WebGPU where it
  can and WebGL2 where it cannot.

### Benchmark

`bench/backendBench/` times the three backends on the same models, the way the
app runs them: steps per second in the live loop (80 steps and a motion sample
per tick, samples pipelined), the load-time settle, and a 512px frame drawn and
waited for. Open it on real hardware:

    npm run bench:backends:serve -w @treemaker/origami-simulator

and narrow a run with the query string
(`?fixtures=miura-32x32,miura-80x80&backends=webgpu,webgl2&duration=4000`).
`npm run bench:backends` runs it headless, where both GPU APIs are SwiftShader
and only the fact that each backend ran means anything.

### Benchmark results: Chrome on the M1 Pro (2026-10-29)

The first twelve rows of a default run, the four smallest fixtures. The browser
reports itself as "Intel Mac OS X", as Chrome does on Apple silicon. Fold 60%,
80 steps per tick, 2000ms live loop, 60 frames at 512px.

| fixture | nodes | backend | steps/s | vs CPU | settle ms | steps | frame p50 | p95 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| book-fold | 4 | webgpu | 42k | 0.3x | 804 | 660 | 0.50 | 0.80 |
| book-fold | 4 | webgl2 | 4944 | 0.0x | 160 | 660 | 0.60 | 0.70 |
| book-fold | 4 | reference | 149k | 1.0x | 7 | 632 | - | - |
| bird-base | 9 | webgpu | 28k | 0.4x | 172 | 1800 | 0.50 | 0.90 |
| bird-base | 9 | webgl2 | 4833 | 0.1x | 432 | 1800 | 0.60 | 0.80 |
| bird-base | 9 | reference | 69k | 1.0x | 25 | 1776 | - | - |
| miura-8x8 | 81 | webgpu | 27k | 4.6x | 1315 | 20000! | 0.50 | 0.60 |
| miura-8x8 | 81 | webgl2 | 4985 | 0.9x | 4845 | 20000! | 0.70 | 0.80 |
| miura-8x8 | 81 | reference | 5835 | 1.0x | 3396 | 20000! | - | - |
| miura-16x16 | 289 | webgpu | 27k | 17.0x | 2022 | 20000! | 0.60 | 0.80 |
| miura-16x16 | 289 | webgl2 | 4796 | 3.1x | 4865 | 20000! | 0.60 | 1.00 |
| miura-16x16 | 289 | reference | 1560 | 1.0x | 13274 | 20000! | - | - |

`!`: hit the 20,000-step cap before settling, on every backend alike.

What it shows:

- **Live loop.** WebGPU runs about 27k steps/s from 9 to 289 nodes; WebGL2
  holds at about 4.9k. Both rates are flat across model size, so neither is
  bound by the solve at these sizes. WebGL2's ceiling is consistent with its
  synchronous `readPixels` motion sample stalling every tick: 4.9k steps/s is
  about 61 ticks of 80 steps. WebGPU pipelines its samples and does not stall.
  At 289 nodes WebGPU is 5.6x WebGL2 and 17x the CPU.
- **Settle.** For 20,000 steps on miura-16x16, WebGPU takes 2.0s, WebGL2 4.9s
  and the CPU 13.3s. WebGPU still waits on one sample per 20-step chunk here,
  so this is its worst case and it still leads.
- **Small models.** Below about 80 nodes the CPU solver is fastest, as it was
  before. The 804ms settle for book-fold on WebGPU is the first model run, so
  it likely carries first-use costs; bird-base, run next, settles in 172ms.
- **Frames.** Every GPU frame is 0.5 to 1.0ms on both APIs. Drawing is not
  the bottleneck at these sizes.

Still to record: the larger fixtures (miura-32x32 to miura-80x80,
boxpleat-24), where the solve should start to dominate, and Safari.

## Affected Areas

- `packages/origami-simulator/src/webgpu/` — `WebgpuSolver`, `WebgpuMeshRenderer`,
  `WebgpuCanvasTarget`, `GpuCore`, exported
- `packages/origami-simulator/bench/webgpuSpikeHarness/`,
  `bench/webgpuSpike.bench.ts` — new
- `packages/origami-simulator/package.json` — `@webgpu/types`, bench script
- `packages/origami-simulator/bench/backendBench/`, `bench/backendBench.bench.ts`
  — the backend benchmark
- `SolverBackend` / `SimulationClock` (async readback)
- `apps/web/src/simulator/simulatorSession.ts` (backend ladder),
  `foldedMeshSource.ts`, `useSimulatorRuntime.ts`, `SimulatorPanel.tsx`
- `apps/web/src/components/start/startFigureMesh.ts`

## Checklist

- [x] Re-check WebGPU support, including the Tauri webviews (WKWebView and
      WebKitGTK undocumented; need a probe on each)
- [x] Spike: device acquisition, normals pass, motion reduction
- [x] Spike harness: parity against WebGL2, NaN case, timings
- [x] Run the harness headless here (SwiftShader); record results — parity
      exact, timings not meaningful
- [x] Run the single-pass harness on an Apple M1 Pro (three runs, all most
      likely Chrome)
- [x] Full-step comparison against the earlier WebGPU port: parity 1e-7 on
      SwiftShader and on Metal
- [x] Full-step comparison on the M1 Pro: WebGPU 3–5× faster in Chrome and in
      Safari (cached encoding)
- [x] Go/no-go recorded here: go
- [ ] Full-step comparison on Windows
- [ ] Probe `navigator.gpu` inside the Tauri app on macOS and Linux
- [x] Async motion samples in `SolverBackend` and `SimulationClock`
- [x] Synchronous `readPositions`, `readShape`, `readStrain` from a mirror
  refreshed per sample, `syncReads()`; session onto `settle()`
- [x] Full Euler step on Ori Studio's packing, with `WebglSolver`'s NaN guards
- [x] Verlet, fixed nodes, pull and pose
- [x] WGSL `MeshRenderer`
- [x] Backend ladder and worker probe in `simulatorSession.ts`
- [x] Folded figures and the welcome-screen figure on WebGPU
- [x] Backend benchmark: WebGPU vs WebGL2 vs CPU (`bench/backendBench/`)
- [x] Run the backend benchmark on the M1 Pro in Chrome (small fixtures); record it here
- [ ] The same for the larger fixtures, and in Safari
- [ ] Parity gate for the WebGPU backend in CI
