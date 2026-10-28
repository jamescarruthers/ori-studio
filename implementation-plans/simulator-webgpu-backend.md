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

A third run in **Safari** (WebGPU adapter `apple / metal-3`), which matters
because WKWebView, the Tauri app's webview on macOS, uses the same engine:

| Fixture | Vertices | `maxVelocity` gl / gpu (ms) | 1000 normal passes gl / gpu (ms) |
| --- | ---: | ---: | ---: |
| miura-8x8 | 81 | 0.105 / 0.445 | 1.8 / 4.7 |
| miura-32x32 | 1089 | 0.115 / 0.435 | 2.1 / 4.9 |
| boxpleat-24 | 625 | 0.060 / 0.305 | 1.6 / 4.4 |
| miura-56x56 | 3249 | 0.145 / 0.400 | 1.7 / 5.2 |
| miura-80x80 | 6561 | 0.220 / 0.385 | 1.7 / 6.2 |

Parity was again exact on every fixture. Safari's WebGPU round trip is slower
than the other browser's (0.3–0.6 ms), and its per-dispatch cost about the same.

What it shows:

- **Parity holds on a real GPU, in both browsers.** Exact normals and bit-identical motion on
  Metal, as on SwiftShader.
- **Both APIs are bound by per-pass overhead, not by GPU work.** The 1000-pass
  times barely move from 81 to 6561 vertices, so even the largest fixture
  leaves the GPU mostly idle.
- **WebGPU costs more per pass here, not less.** About 4–6 µs a dispatch
  against about 1.5 µs a WebGL2 draw (each batch includes one read to finish
  it, about 0.3 ms on the WebGPU side). The solver runs five passes a step, so
  at 100 steps a frame WebGL2 spends under 1 ms and WebGPU 2–3 ms. The
  many-steps-per-submit gain the deferred plan counted on does not show up on
  this machine.
- **The readback WebGPU would remove costs little.** WebGL2's synchronous
  `maxVelocity()` costs 0.04–0.28 ms and grows with size. WebGPU's async read
  is a flat ~0.3 ms round trip. They meet only at the largest fixture. One
  caveat: both were timed with nothing queued, so neither includes waiting
  for a backlog of steps.

### Decision (2026-10-28): no-go

On Apple silicon WebGL2 is not the bottleneck at any fixture size, and WebGPU
is slower at the thing it was meant to do better. With the Tauri webviews
still unconfirmed, nothing here justifies a second GPU backend. **WebGL2 stays
the only GPU backend.** The spike code stays in the tree as a measurement
tool.

What would reopen this: a Windows or Linux run where WebGPU's per-dispatch cost
beats WebGL2's; a model size where GPU work, not overhead, dominates the tick;
or a feature WebGL2 cannot do at all (more than 16 inputs to a pass, for
example).

## Affected Areas

- `packages/origami-simulator/src/webgpu/` — new, spike only, not exported
- `packages/origami-simulator/bench/webgpuSpikeHarness/`,
  `bench/webgpuSpike.bench.ts` — new
- `packages/origami-simulator/package.json` — `@webgpu/types`, bench script
- Later, if built: `SolverBackend` / `SimulationClock` (async readback),
  `apps/web/src/simulator/simulatorSession.ts` (backend ladder),
  `MeshRenderer` (WGSL port)

## Checklist

- [x] Re-check WebGPU support, including the Tauri webviews (WKWebView and
      WebKitGTK undocumented; need a probe on each)
- [x] Spike: device acquisition, normals pass, motion reduction
- [x] Spike harness: parity against WebGL2, NaN case, timings
- [x] Run the harness headless here (SwiftShader); record results — parity
      exact, timings not meaningful
- [x] Run the harness on real hardware: Apple M1 Pro, twice in one browser and
      once in Safari (Windows and Linux not run; not needed for a no-go,
      needed to reopen)
- [ ] Probe `navigator.gpu` inside the Tauri app on macOS and Linux (moot
      after the no-go; needed to reopen)
- [x] Profile on real hardware: per-pass overhead dominates; the GPU is
      mostly idle even at 6561 vertices
- [x] Go/no-go recorded here: no-go
- [ ] If go: async readback in `SolverBackend` and `SimulationClock`
- [ ] If go: remaining passes, both integrators, pull and pose, fixed nodes
- [ ] If go: WGSL `MeshRenderer`, backend ladder, parity gate in CI
