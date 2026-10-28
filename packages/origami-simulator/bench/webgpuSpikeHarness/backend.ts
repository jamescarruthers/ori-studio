/// <reference types="@webgpu/types" />
// Parity and behaviour checks for WebgpuSolver, run in a real browser by
// webgpuSpike.bench.ts or by hand from the harness page.
//
// The parity rows hold it to the same gate as WebglSolver (gpuParity.bench.ts):
// ReferenceSolver's positions within Tier C after the same steps from flat.
import { prepareFoldModel } from '../../src/prepare.js';
import { OrigamiModel } from '../../src/model.js';
import { ReferenceSolver } from '../../src/referenceSolver.js';
import { SimulationClock } from '../../src/simulationClock.js';
import { WebglSolver } from '../../src/webgl/webglSolver.js';
import type { GpuCore } from '../../src/webgpu/gpuCore.js';
import { WebgpuSolver } from '../../src/webgpu/webgpuSolver.js';
import { FIXTURES } from '../fixtures.js';
import type { BackendReport, BackendRow } from './report.js';

const FOLD_PERCENT = 60;
const STEP_COUNTS = [1, 10, 100];
/** A mid-run change: what the UI does when the fold slider or a material moves. */
const RETARGET = { foldPercent: 90, axialStiffness: 30, creaseStiffness: 1 };
/**
 * Settling to rest takes up to 20,000 steps, which is minutes per solver on a
 * software adapter at the largest sizes. The parity rows cover those; the
 * settle check runs on the rest.
 */
const SETTLE_MAX_VERTICES = 1100;

type Fixture = (typeof FIXTURES)[number];

function modelOf(fixture: Fixture): OrigamiModel {
  return new OrigamiModel(prepareFoldModel(fixture.build(), { triangulate: true }));
}

function maxAbs(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const delta = Math.abs(a[i]! - b[i]!);
    if (!(delta <= max)) max = Number.isNaN(delta) ? Number.POSITIVE_INFINITY : delta;
  }
  return max;
}

function referencePositions(fixture: Fixture, run: (solver: ReferenceSolver) => void): Float32Array {
  const model = modelOf(fixture);
  const solver = new ReferenceSolver(model, { foldPercent: FOLD_PERCENT });
  run(solver);
  return model.positions.slice(0, model.prepared.vertexCount * 3);
}

function webglSolver(fixture: Fixture): WebglSolver {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  return new WebglSolver(canvas, modelOf(fixture), { foldPercent: FOLD_PERCENT });
}

function releaseWebgl(solver: WebglSolver): void {
  const gl = (solver as unknown as { gl: { gl: WebGL2RenderingContext } }).gl.gl;
  solver.dispose();
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}

async function gpuPositions(core: GpuCore, fixture: Fixture, run: (solver: WebgpuSolver) => void): Promise<Float32Array> {
  const model = modelOf(fixture);
  const solver = await WebgpuSolver.create(model, { foldPercent: FOLD_PERCENT }, core);
  try {
    run(solver);
    const out = new Float32Array(model.prepared.vertexCount * 3);
    await solver.readPositionsAsync(out);
    return out;
  } finally {
    solver.dispose();
  }
}

/** Steps a second, `perSolve` steps per call, synced every 8 calls. */
async function stepsPerSecond(perSolve: number, durationMs: number, run: () => void, sync: () => unknown): Promise<number> {
  for (let i = 0; i < 3; i += 1) run();
  await sync();
  let solves = 0;
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    for (let i = 0; i < 8; i += 1) run();
    await sync();
    solves += 8;
  }
  return (solves * perSolve * 1000) / (performance.now() - start);
}

/** Settle the fixture to rest on both GPU solvers, recording the steps each took. */
async function settleBoth(core: GpuCore, fixture: Fixture, row: BackendRow): Promise<void> {
  const settling = await WebgpuSolver.create(modelOf(fixture), { foldPercent: FOLD_PERCENT }, core);
  try {
    const tick = await new SimulationClock({ chunkSteps: 100 }).settle(settling, 20_000);
    row.settle.gpu = tick.converged ? tick.steps : -1;
  } finally {
    settling.dispose();
  }
  const webglSettling = webglSolver(fixture);
  try {
    const tick = new SimulationClock({ chunkSteps: 100 }).runToConvergence(webglSettling, 20_000);
    row.settle.webgl = tick.converged ? tick.steps : -1;
  } finally {
    releaseWebgl(webglSettling);
  }
}

async function runFixture(core: GpuCore, fixture: Fixture, durationMs: number): Promise<BackendRow> {
  const vertices = modelOf(fixture).prepared.vertexCount;
  const row: BackendRow = {
    fixture: fixture.name,
    vertices,
    vsReference: {},
    vsWebgl: Number.NaN,
    retarget: Number.NaN,
    resetExact: false,
    arrestStill: false,
    settle: { gpu: null, webgl: null },
    stepsPerSecond: { gpu: 0, webgl: 0 },
  };
  try {
    for (const steps of STEP_COUNTS) {
      const reference = referencePositions(fixture, (solver) => solver.step(steps));
      row.vsReference[steps] = maxAbs(await gpuPositions(core, fixture, (solver) => solver.step(steps)), reference);
    }

    const last = STEP_COUNTS[STEP_COUNTS.length - 1]!;
    const webgl = webglSolver(fixture);
    try {
      webgl.step(last);
      const webglOut = new Float32Array(vertices * 3);
      webgl.readPositions(webglOut);
      row.vsWebgl = maxAbs(await gpuPositions(core, fixture, (solver) => solver.step(last)), webglOut);
    } finally {
      releaseWebgl(webgl);
    }

    const retarget = (solver: ReferenceSolver | WebgpuSolver) => {
      solver.step(50);
      solver.setMaterial(RETARGET);
      solver.step(50);
    };
    row.retarget = maxAbs(await gpuPositions(core, fixture, retarget), referencePositions(fixture, retarget));

    // Reset puts every node back on the flat sheet, bit for bit.
    const model = modelOf(fixture);
    const flat = model.originalPositions.slice(0, vertices * 3);
    const solver = await WebgpuSolver.create(model, { foldPercent: FOLD_PERCENT }, core);
    try {
      solver.step(100);
      solver.reset();
      const out = new Float32Array(vertices * 3);
      await solver.readPositionsAsync(out);
      row.resetExact = maxAbs(out, flat) === 0 && solver.stepCount === 0;

      solver.step(40);
      solver.arrestDynamics();
      row.arrestStill = (await solver.sampleMotion()).maxVelocity === 0;
    } finally {
      solver.dispose();
    }

    // The clock drives it to rest as it does WebglSolver.
    if (vertices <= SETTLE_MAX_VERTICES) await settleBoth(core, fixture, row);

    const timed = await WebgpuSolver.create(modelOf(fixture), { foldPercent: FOLD_PERCENT }, core);
    try {
      row.stepsPerSecond.gpu = await stepsPerSecond(100, durationMs, () => timed.step(100), () => timed.sampleMotion());
    } finally {
      timed.dispose();
    }
    const timedWebgl = webglSolver(fixture);
    try {
      row.stepsPerSecond.webgl = await stepsPerSecond(100, durationMs, () => timedWebgl.step(100), () => timedWebgl.sampleMotion());
    } finally {
      releaseWebgl(timedWebgl);
    }
  } catch (error) {
    row.error = error instanceof Error ? error.message : String(error);
  }
  return row;
}

export async function runBackendChecks(core: GpuCore, durationMs = 800): Promise<BackendReport> {
  const rows: BackendRow[] = [];
  for (const fixture of FIXTURES) {
    if (fixture.degenerate) continue;
    rows.push(await runFixture(core, fixture, durationMs));
  }
  return { rows };
}
