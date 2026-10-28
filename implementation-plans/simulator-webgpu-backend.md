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
- [ ] Run the harness on real hardware (Apple silicon, Windows dGPU, Linux)
- [ ] Probe `navigator.gpu` inside the Tauri app on macOS and Linux
- [ ] Profile the WebGL2 tick on `miura-56x56` / `miura-80x80` on real hardware
- [ ] Go/no-go recorded here
- [ ] If go: async readback in `SolverBackend` and `SimulationClock`
- [ ] If go: remaining passes, both integrators, pull and pose, fixed nodes
- [ ] If go: WGSL `MeshRenderer`, backend ladder, parity gate in CI
