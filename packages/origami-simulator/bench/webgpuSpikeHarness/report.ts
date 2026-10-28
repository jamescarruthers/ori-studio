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
