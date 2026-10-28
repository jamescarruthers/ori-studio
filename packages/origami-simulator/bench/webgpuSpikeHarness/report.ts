// The spike's result shapes and their text form, shared by the page (main.ts)
// and the Node driver (../webgpuSpike.bench.ts). Kept apart from main.ts, which
// touches the DOM as it loads.
import type { MotionSample } from '../../src/webgpu/motionReduction.js';

export interface SpikeOptions {
  foldPercent: number;
  steps: number;
  /** Passes per timed batch. */
  batch: number;
  /** Calls averaged for each readback timing. */
  samples: number;
}

export interface SpikeRow {
  fixture: string;
  vertices: number;
  faces: number;
  /** Largest per-component difference between the two normals passes. */
  normalsMaxAbs: number;
  webgl: MotionSample;
  webgpu: MotionSample;
  /** Both motion figures identical, NaN included. */
  motionExact: boolean;
  /** A NaN velocity and an infinite strain each reported as NaN. */
  nonFiniteCaught: boolean;
  /** Mean ms for WebglSolver.maxVelocity(): a whole-texture readPixels and a CPU scan. */
  webglMaxVelocityMs: number;
  /** Mean ms from MotionReduction.sample() to its 12 bytes landing. */
  webgpuSampleMs: number;
  /** ms for `batch` normal passes and one read of the result, each API. */
  webglNormalsBatchMs: number;
  webgpuNormalsBatchMs: number;
  error?: string;
}

export interface SpikeReport {
  adapter: string;
  webglRenderer: string;
  rows: SpikeRow[];
  error?: string;
}

/** The report as the text the bench prints and the page shows. */
export function formatReport(report: SpikeReport): string {
  const head = [`WebGPU adapter: ${report.adapter}`, `WebGL2 renderer: ${report.webglRenderer}`];
  if (report.error) return [...head, `ERROR: ${report.error}`].join('\n');
  const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(3).padStart(9) : String(value).padStart(9));
  const lines = report.rows.map((row) =>
    row.error
      ? `${row.fixture.padEnd(14)} ERROR: ${row.error}`
      : `${row.fixture.padEnd(14)} v=${String(row.vertices).padStart(5)} f=${String(row.faces).padStart(5)} | ` +
        `normals Δ ${row.normalsMaxAbs.toExponential(1)}  motion ${row.motionExact ? 'exact' : 'DIFFERS'}  ` +
        `non-finite ${row.nonFiniteCaught ? 'caught' : 'MISSED'} | ` +
        `maxVelocity gl ${fmt(row.webglMaxVelocityMs)} gpu ${fmt(row.webgpuSampleMs)} ms | ` +
        `normals×batch gl ${fmt(row.webglNormalsBatchMs)} gpu ${fmt(row.webgpuNormalsBatchMs)} ms`
  );
  return [...head, ...lines].join('\n');
}

export interface FullStepOptions {
  foldPercent: number;
  /** Steps per solve: what the app runs per displayed frame. */
  stepsPerSolve: number;
  /** Solves queued between syncs, as the WebGPU port's own benchmark does. */
  solvesPerSync: number;
  /** Timed milliseconds per solver per fixture. */
  durationMs: number;
}

/** One fixture's full-step comparison; see fullStep.ts. */
export interface FullStepRow {
  fixture: string;
  vertices: number;
  /** Largest displacement difference from WebglSolver after `stepsPerSolve` steps from flat. */
  maxAbs: number;
  /** Steps per second, each solver alone, synced every `solvesPerSync` solves. */
  webgl: number;
  /**
   * WebglSolver as the original Origami Simulator drives it: the whole position
   * texture read back after every solve, so the CPU waits for each frame.
   */
  webglReadback: number;
  asWritten: number;
  cached: number;
  error?: string;
}

export interface FullStepReport {
  adapter: string;
  options: FullStepOptions;
  rows: FullStepRow[];
  error?: string;
}

/** Steps per second as the bench prints and the page shows them. */
export function formatFullStep(report: FullStepReport): string {
  const { stepsPerSolve, solvesPerSync } = report.options;
  const head = [
    `Full Euler step, steps per second (${stepsPerSolve} steps per solve, synced every ${solvesPerSync} solves)`,
    `WebGPU adapter: ${report.adapter}`,
  ];
  if (report.error) return [...head, `ERROR: ${report.error}`].join('\n');
  const rate = (value: number) => String(Math.round(value)).padStart(8);
  const ratio = (value: number, base: number) => `${(value / base).toFixed(2)}x`.padStart(6);
  const lines = report.rows.map((row) =>
    row.error
      ? `${row.fixture.padEnd(14)} ERROR: ${row.error}`
      : `${row.fixture.padEnd(14)} v=${String(row.vertices).padStart(5)} | Δ ${row.maxAbs.toExponential(1)} | ` +
        `WebGL2 ${rate(row.webgl)} | WebGL2 + readback ${rate(row.webglReadback)} ${ratio(row.webglReadback, row.webgl)} | port as written ${rate(row.asWritten)} ${ratio(row.asWritten, row.webgl)} | ` +
        `port, cached ${rate(row.cached)} ${ratio(row.cached, row.webgl)}`
  );
  return [...head, ...lines].join('\n');
}
