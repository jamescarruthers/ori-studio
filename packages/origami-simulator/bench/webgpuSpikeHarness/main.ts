/// <reference types="@webgpu/types" />
// Runs in a real browser, driven by webgpuSpike.bench.ts or opened by hand.
//
// For each fixture it folds with WebglSolver, then hands the WebGL2 textures to
// the WebGPU spike kernels and checks they compute the same thing from the same
// input: the normals pass to float32 rounding, the motion reduction bit for bit.
// Then it times each against its WebGL2 counterpart.
//
// Headless in this repo's containers both APIs run on SwiftShader, a CPU
// emulation, so the timings there show nothing about real GPUs. Open the page in
// a browser on real hardware for those:
//
//   npx vite packages/origami-simulator
//   → http://localhost:5173/bench/webgpuSpikeHarness/index.html
import { prepareFoldModel } from '../../src/prepare.js';
import { OrigamiModel } from '../../src/model.js';
import { WebglSolver } from '../../src/webgl/webglSolver.js';
import type { GlCore } from '../../src/webgl/glCore.js';
import type { PackedModel } from '../../src/webgl/packing.js';
import { GpuCore } from '../../src/webgpu/gpuCore.js';
import { NormalsPass } from '../../src/webgpu/normalsPass.js';
import { MotionReduction } from '../../src/webgpu/motionReduction.js';
import { FIXTURES } from '../fixtures.js';
import { formatReport, type SpikeOptions, type SpikeReport, type SpikeRow } from './report.js';

declare global {
  interface Window {
    runWebgpuSpike: (options?: Partial<SpikeOptions>) => Promise<SpikeReport>;
  }
}

const DEFAULTS: SpikeOptions = { foldPercent: 60, steps: 100, batch: 1000, samples: 20 };

/** What the spike needs from inside WebglSolver. Harness-only; the solver has no reason to expose it. */
interface SolverInternals {
  gl: GlCore;
  packed: PackedModel;
}

function maxAbsDiff(a: Float32Array, b: Float32Array, count: number): number {
  let max = 0;
  for (let i = 0; i < count; i += 1) {
    const delta = Math.abs(a[i]! - b[i]!);
    // A NaN on either side is a failure, not a zero.
    if (!(delta <= max)) max = Number.isNaN(delta) ? Number.POSITIVE_INFINITY : delta;
  }
  return max;
}

function sameNumber(a: number, b: number): boolean {
  return Object.is(a, b) || (a === 0 && b === 0);
}

async function meanMs(calls: number, run: () => unknown): Promise<number> {
  await run(); // warm: first calls compile, allocate and fault in
  const start = performance.now();
  for (let i = 0; i < calls; i += 1) await run();
  return (performance.now() - start) / calls;
}

function webglRendererName(): string {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no WebGL2';
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'WebGL2';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return name;
}

async function runFixture(
  core: GpuCore,
  fixture: (typeof FIXTURES)[number],
  options: SpikeOptions
): Promise<SpikeRow> {
  const model = new OrigamiModel(prepareFoldModel(fixture.build(), { triangulate: true }));
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const solver = new WebglSolver(canvas, model, { foldPercent: options.foldPercent });
  const { gl, packed } = solver as unknown as SolverInternals;
  const faces = packed.dims.faces;
  const nodes = packed.dims.nodes;
  const row: SpikeRow = {
    fixture: fixture.name,
    vertices: nodes,
    faces,
    normalsMaxAbs: Number.NaN,
    webgl: { maxVelocity: Number.NaN, maxStrain: Number.NaN },
    webgpu: { maxVelocity: Number.NaN, maxStrain: Number.NaN },
    motionExact: false,
    nonFiniteCaught: false,
    webglMaxVelocityMs: Number.NaN,
    webgpuSampleMs: Number.NaN,
    webglNormalsBatchMs: Number.NaN,
    webgpuNormalsBatchMs: Number.NaN,
  };
  const owned: GPUBuffer[] = [];
  const own = (buffer: GPUBuffer) => {
    owned.push(buffer);
    return buffer;
  };

  try {
    solver.step(options.steps);
    // The last step's normals are of the positions before it moved them;
    // recompute so both passes see the same input.
    gl.step('normalCalc', ['u_faceVertexIndices', 'u_lastPosition', 'u_originalPosition'], 'u_normals');
    const lastPosition = gl.readTexture('u_lastPosition');
    const lastVelocity = gl.readTexture('u_lastVelocity');
    const webglNormals = gl.readTexture('u_normals');

    // Normals: same input, same pass.
    const normals = own(core.storageBuffer(new Float32Array(Math.max(1, faces) * 4), 'normals'));
    const normalsPass = await NormalsPass.create(core, {
      faceCount: faces,
      faceVertexIndices: own(core.storageBuffer(packed.faceVertexIndices, 'faceVertexIndices')),
      lastPosition: own(core.storageBuffer(lastPosition, 'lastPosition')),
      originalPosition: own(core.storageBuffer(packed.originalPosition, 'originalPosition')),
      normals,
    });
    normalsPass.run();
    const gpuNormals = await core.readBuffer(normals);
    row.normalsMaxAbs = maxAbsDiff(webglNormals, gpuNormals, faces * 4);

    // Motion: the WebGL2 answer, then the reduction over the same velocity texture.
    row.webgl = { maxVelocity: solver.maxVelocity(), maxStrain: solver.readDiagnostics().maxNodalStrain ?? Number.NaN };
    const velocity = own(core.storageBuffer(lastVelocity, 'velocity'));
    const reduction = await MotionReduction.create(core, velocity, nodes);
    row.webgpu = await reduction.sample();
    row.motionExact =
      sameNumber(row.webgl.maxVelocity, row.webgpu.maxVelocity) &&
      sameNumber(row.webgl.maxStrain, row.webgpu.maxStrain);

    // A blown-up node must read as NaN, never as "converged".
    const middle = Math.floor(nodes / 2);
    const withNaN = lastVelocity.slice();
    withNaN[middle * 4 + 1] = Number.NaN;
    const withInfiniteStrain = lastVelocity.slice();
    withInfiniteStrain[middle * 4 + 3] = Number.POSITIVE_INFINITY;
    const nanSample = await (await MotionReduction.create(core, own(core.storageBuffer(withNaN, 'nan')), nodes)).sample();
    const infSample = await (
      await MotionReduction.create(core, own(core.storageBuffer(withInfiniteStrain, 'inf')), nodes)
    ).sample();
    row.nonFiniteCaught =
      Number.isNaN(nanSample.maxVelocity) &&
      Number.isNaN(nanSample.maxStrain) &&
      Number.isNaN(infSample.maxVelocity) &&
      Number.isNaN(infSample.maxStrain);

    // Timings. Each WebGL2 figure includes the sync read that ends it, and
    // each WebGPU one the async read that ends it, so the two are like for like.
    row.webglMaxVelocityMs = await meanMs(options.samples, () => solver.maxVelocity());
    row.webgpuSampleMs = await meanMs(options.samples, () => reduction.sample());
    row.webglNormalsBatchMs = await meanMs(1, () => {
      for (let i = 0; i < options.batch; i += 1) {
        gl.step('normalCalc', ['u_faceVertexIndices', 'u_lastPosition', 'u_originalPosition'], 'u_normals');
      }
      gl.readTexture('u_normals');
    });
    row.webgpuNormalsBatchMs = await meanMs(1, async () => {
      normalsPass.run(options.batch);
      await core.readBuffer(normals, 16);
    });
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error);
  } finally {
    for (const buffer of owned) core.release(buffer);
    solver.dispose();
  }
  return row;
}

window.runWebgpuSpike = async (overrides = {}) => {
  const options = { ...DEFAULTS, ...overrides };
  const webglRenderer = webglRendererName();
  let core: GpuCore;
  try {
    core = await GpuCore.create();
  } catch (error) {
    return { adapter: 'none', webglRenderer, rows: [], error: error instanceof Error ? error.message : String(error) };
  }
  const info = core.adapterInfo;
  const adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(' / ') || 'unknown';
  const rows: SpikeRow[] = [];
  try {
    for (const fixture of FIXTURES) {
      if (fixture.degenerate) continue;
      rows.push(await runFixture(core, fixture, options));
    }
  } finally {
    core.dispose();
  }
  return { adapter, webglRenderer, rows };
};

const button = document.getElementById('run');
const out = document.getElementById('out');
if (button && out) {
  button.addEventListener('click', async () => {
    out.textContent = 'running…';
    out.textContent = formatReport(await window.runWebgpuSpike());
  });
}
