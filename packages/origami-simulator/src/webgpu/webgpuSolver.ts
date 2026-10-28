/// <reference types="@webgpu/types" />
import type { OrigamiModel } from '../model.js';
import type { CursorRay, PullOutcome, PullSummary } from '../pull.js';
import type { MotionSample, SolverBackend, SolverShape } from '../solverBackend.js';
import type { FoldProfile, SimulatorDiagnostics, SimulatorOptions } from '../types.js';
import { packModel, timeStepFor, type PackedModel, type SolverMaterial } from '../webgl/packing.js';
import { GpuCore, workgroupsFor } from './gpuCore.js';
import { MotionReduction } from './motionReduction.js';
import { CREASE_GEO_CALC, NORMAL_CALC, POSITION_CALC, THETA_CALC, VELOCITY_CALC, WORKGROUP_SIZE } from './passes.js';
import { materialArrays, packParams, packStaticData, type StaticLayout } from './packing.js';

/**
 * Something this backend does not do yet. The plan
 * (implementation-plans/simulator-webgpu-backend.md) ports these in later
 * steps; until then the backend says so rather than doing something nearby.
 */
export class WebGpuUnsupportedOperationError extends Error {
  constructor(readonly operation: string, detail?: string) {
    super(`The WebGPU solver does not support ${operation} yet${detail ? `: ${detail}` : ''}`);
    this.name = 'WebGpuUnsupportedOperationError';
  }
}

/** The buffers one step reads and writes, for one ping-pong parity. */
interface Side {
  lastPos: GPUBuffer;
  curPos: GPUBuffer;
  lastVel: GPUBuffer;
  curVel: GPUBuffer;
  lastTheta: GPUBuffer;
  curTheta: GPUBuffer;
}

interface Pipelines {
  normalCalc: GPUComputePipeline;
  thetaCalc: GPUComputePipeline;
  updateCreaseGeo: GPUComputePipeline;
  velocityCalc: GPUComputePipeline;
  positionCalc: GPUComputePipeline;
}

/**
 * The GPU solver on WebGPU: the Euler step as five compute passes over storage
 * buffers, fed the same packed model as {@link WebglSolver}. Its correctness is
 * parity with WebglSolver and ReferenceSolver (bench/webgpuSpike.bench.ts), not
 * anything asserted here.
 *
 * Bind groups are built once, one set per ping-pong parity, and a whole
 * `step(count)` is one compute pass in one submit. Encoding per dispatch, as
 * the port the passes come from does, halves the speed in Safari.
 *
 * Motion is sampled asynchronously ({@link sampleMotion}), so
 * {@link SimulationClock} acts on each sample when it lands. Reads that the
 * interface still makes synchronous, and the pull, pose, fixed nodes and
 * Verlet, throw {@link WebGpuUnsupportedOperationError}.
 */
export class WebgpuSolver implements SolverBackend {
  readonly id = 'webgpu';
  readonly posed = false;
  readonly pulling = false;

  private material: SolverMaterial;
  private foldPercent: number;
  private dt: number;
  private parity = 0;
  private currentStep = 0;
  private maxStrain = 0;
  private disposed = false;
  /** Each parity's five bind groups, built once; see {@link groupsFor}. */
  private readonly groups: GPUBindGroup[][];

  private constructor(
    private readonly core: GpuCore,
    private readonly ownsCore: boolean,
    private readonly model: OrigamiModel,
    private readonly packed: PackedModel,
    private readonly layout: StaticLayout,
    private readonly buffers: {
      staticData: GPUBuffer;
      params: GPUBuffer;
      normals: GPUBuffer;
      creaseGeo: GPUBuffer;
      pos: readonly [GPUBuffer, GPUBuffer];
      vel: readonly [GPUBuffer, GPUBuffer];
      theta: readonly [GPUBuffer, GPUBuffer];
    },
    private readonly pipe: Pipelines,
    private readonly motion: MotionReduction,
    material: SolverMaterial,
    foldPercent: number
  ) {
    this.material = material;
    this.foldPercent = foldPercent;
    this.dt = timeStepFor(packed, material);
    this.groups = this.sides.map((side) => this.groupsFor(side));
    this.writeParams();
  }

  /**
   * Build a solver for `model`. Pass `core` to share a device, as a renderer
   * drawing from the solver's buffers must; without one the solver acquires
   * and owns its own.
   *
   * @throws {WebGpuUnavailableError} when no device can be had.
   * @throws {WebGpuUnsupportedOperationError} for Verlet integration.
   */
  static async create(model: OrigamiModel, options: SimulatorOptions = {}, core?: GpuCore): Promise<WebgpuSolver> {
    if (options.integrationType === 'verlet') throw new WebGpuUnsupportedOperationError('Verlet integration');
    const device = core ?? (await GpuCore.create());
    try {
      const material: SolverMaterial = {
        axialStiffness: options.axialStiffness ?? 20,
        creaseStiffness: options.creaseStiffness ?? 0.7,
        panelStiffness: options.panelStiffness ?? 0.7,
        faceStiffness: options.faceStiffness ?? 0.2,
        damping: options.damping ?? 0.45,
        timeStepScale: options.timeStepScale ?? 1,
      };
      const packed = packModel(model, material);
      const layout = packStaticData(packed, material);
      const dims = packed.dims;
      const zeros = () => new Float32Array(dims.textureDim * dims.textureDim * 4);
      const buffers = {
        staticData: device.storageBuffer(layout.data, 'staticData'),
        params: device.buffer({ label: 'params', size: 28 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
        normals: device.storageBuffer(new Float32Array(Math.max(1, dims.faces) * 4), 'normals'),
        creaseGeo: device.storageBuffer(new Float32Array(Math.max(1, dims.creases) * 4), 'creaseGeo'),
        pos: [device.storageBuffer(zeros(), 'posA'), device.storageBuffer(zeros(), 'posB')] as const,
        vel: [device.storageBuffer(zeros(), 'velA'), device.storageBuffer(zeros(), 'velB')] as const,
        theta: [device.storageBuffer(packed.thetaInit, 'thetaA'), device.storageBuffer(packed.thetaInit, 'thetaB')] as const,
      };
      const pipe: Pipelines = {
        normalCalc: await device.computePipeline(NORMAL_CALC, 'normalCalc'),
        thetaCalc: await device.computePipeline(THETA_CALC, 'thetaCalc'),
        updateCreaseGeo: await device.computePipeline(CREASE_GEO_CALC, 'updateCreaseGeo'),
        velocityCalc: await device.computePipeline(VELOCITY_CALC, 'velocityCalc'),
        positionCalc: await device.computePipeline(POSITION_CALC, 'positionCalc'),
      };
      const motion = await MotionReduction.create(device, buffers.vel, dims.nodes);
      return new WebgpuSolver(
        device,
        core === undefined,
        model,
        packed,
        layout,
        buffers,
        pipe,
        motion,
        material,
        clampPercent(options.foldPercent ?? 0)
      );
    } catch (error) {
      if (core === undefined) device.dispose();
      throw error;
    }
  }

  /** The buffers for each parity: side 0 reads the A buffers, side 1 the B ones. */
  private get sides(): [Side, Side] {
    const { pos, vel, theta } = this.buffers;
    return [
      { lastPos: pos[0], curPos: pos[1], lastVel: vel[0], curVel: vel[1], lastTheta: theta[0], curTheta: theta[1] },
      { lastPos: pos[1], curPos: pos[0], lastVel: vel[1], curVel: vel[0], lastTheta: theta[1], curTheta: theta[0] },
    ];
  }

  /** The five passes' bind groups for one parity, in dispatch order. */
  private groupsFor(side: Side): GPUBindGroup[] {
    const { staticData: sd, params, normals, creaseGeo } = this.buffers;
    const group = (pipeline: GPUComputePipeline, buffers: GPUBuffer[]) =>
      this.core.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
    return [
      group(this.pipe.normalCalc, [sd, side.lastPos, normals, params]),
      group(this.pipe.thetaCalc, [sd, side.lastPos, normals, side.lastTheta, side.curTheta, params]),
      group(this.pipe.updateCreaseGeo, [sd, side.lastPos, creaseGeo, params]),
      group(this.pipe.velocityCalc, [sd, side.lastPos, side.lastVel, normals, side.curTheta, creaseGeo, side.curVel, params]),
      group(this.pipe.positionCalc, [sd, side.curVel, side.lastPos, side.curPos, params]),
    ];
  }

  get stepCount(): number {
    return this.currentStep;
  }

  get vertexCount(): number {
    return this.packed.dims.nodes;
  }

  /** True once the device has gone away; every result is stale. */
  get deviceLost(): boolean {
    return this.core.lost;
  }

  step(count: number): void {
    if (count <= 0) return;
    this.core.assertLive();
    const { faces, creases, nodes } = this.packed.dims;
    const passes: Array<[GPUComputePipeline, number]> = [
      [this.pipe.normalCalc, faces],
      [this.pipe.thetaCalc, creases],
      [this.pipe.updateCreaseGeo, creases],
      [this.pipe.velocityCalc, nodes],
      [this.pipe.positionCalc, nodes],
    ];
    const encoder = this.core.device.createCommandEncoder({ label: 'solver step' });
    const pass = encoder.beginComputePass();
    for (let s = 0; s < count; s += 1) {
      const groups = this.groups[this.parity]!;
      passes.forEach(([pipeline, size], i) => {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, groups[i]!);
        pass.dispatchWorkgroups(workgroupsFor(size, WORKGROUP_SIZE));
      });
      this.parity ^= 1;
    }
    pass.end();
    this.core.device.queue.submit([encoder.finish()]);
    this.currentStep += count;
  }

  /**
   * The motion as of every step submitted so far, read back asynchronously.
   * The velocity buffer's alpha holds each node's strain, so one reduction
   * answers both, as `WebglSolver.maxVelocity` does from its texture.
   */
  async sampleMotion(): Promise<MotionSample> {
    const sample = await this.motion.sample(this.parity);
    this.maxStrain = sample.maxStrain;
    return sample;
  }

  setFoldPercent(percent: number): void {
    this.foldPercent = clampPercent(percent);
    this.writeParams();
  }

  setFoldProfile(_profile: FoldProfile | null): void {
    // As WebglSolver: fold profiles are handled by backend selection, which
    // gives them the reference solver.
  }

  setMaterial(options: Partial<SimulatorOptions>): void {
    if (options.integrationType === 'verlet') throw new WebGpuUnsupportedOperationError('Verlet integration');
    this.material = {
      axialStiffness: options.axialStiffness ?? this.material.axialStiffness,
      creaseStiffness: options.creaseStiffness ?? this.material.creaseStiffness,
      panelStiffness: options.panelStiffness ?? this.material.panelStiffness,
      faceStiffness: options.faceStiffness ?? this.material.faceStiffness,
      damping: options.damping ?? this.material.damping,
      timeStepScale: options.timeStepScale ?? this.material.timeStepScale,
    };
    if (options.foldPercent !== undefined) this.foldPercent = clampPercent(options.foldPercent);
    this.dt = timeStepFor(this.packed, this.material);
    const arrays = materialArrays(this.packed, this.material);
    this.core.write(this.buffers.staticData, this.layout.offsets.beamMeta * 16, arrays.beamMeta);
    this.core.write(this.buffers.staticData, this.layout.offsets.creaseMeta * 16, arrays.creaseMeta);
    this.writeParams();
  }

  /** Back to the flat sheet at rest, as WebglSolver.reset does. */
  reset(): void {
    const zeros = new Float32Array(this.packed.dims.textureDim * this.packed.dims.textureDim * 4);
    for (const buffer of [...this.buffers.pos, ...this.buffers.vel]) this.core.write(buffer, 0, zeros);
    for (const buffer of this.buffers.theta) this.core.write(buffer, 0, this.packed.thetaInit);
    this.parity = 0;
    this.currentStep = 0;
    this.maxStrain = 0;
  }

  /** Zero the velocities and keep the fold, as WebglSolver.arrestDynamics does for Euler. */
  arrestDynamics(): void {
    const zeros = new Float32Array(this.packed.dims.textureDim * this.packed.dims.textureDim * 4);
    for (const buffer of this.buffers.vel) this.core.write(buffer, 0, zeros);
  }

  setFixedNodes(mask: Uint8Array | null): void {
    if (mask !== null && mask.some((value) => value !== 0)) throw new WebGpuUnsupportedOperationError('fixed nodes');
  }

  readDiagnostics(): SimulatorDiagnostics {
    return { ...this.model.prepared.diagnostics, usedCpuFallback: false, maxNodalStrain: this.maxStrain };
  }

  /**
   * Absolute vertex positions, read back asynchronously: what
   * {@link readPositions} gives on the other backends. Fills `into` (length
   * `vertexCount * 3`) and resolves to the number of floats written.
   */
  async readPositionsAsync(into: Float32Array): Promise<number> {
    const raw = await this.core.readBuffer(this.buffers.pos[this.parity]);
    const original = this.model.originalPositions;
    const count = Math.min(into.length, this.packed.dims.nodes * 3);
    for (let i = 0; i < count / 3; i += 1) {
      into[i * 3] = (original[i * 3] ?? 0) + raw[i * 4]!;
      into[i * 3 + 1] = (original[i * 3 + 1] ?? 0) + raw[i * 4 + 1]!;
      into[i * 3 + 2] = (original[i * 3 + 2] ?? 0) + raw[i * 4 + 2]!;
    }
    return count;
  }

  readPositions(_into: Float32Array): number {
    throw new WebGpuUnsupportedOperationError('synchronous readPositions', 'use readPositionsAsync');
  }

  readShape(_into: SolverShape): void {
    throw new WebGpuUnsupportedOperationError('readShape');
  }

  writeShape(_shape: SolverShape, _keep: boolean): void {
    throw new WebGpuUnsupportedOperationError('writeShape');
  }

  readColors(_into: Float32Array): number {
    throw new WebGpuUnsupportedOperationError('synchronous readColors');
  }

  readStrain(_into: Float32Array): number {
    throw new WebGpuUnsupportedOperationError('synchronous readStrain');
  }

  beginPull(): void {
    throw new WebGpuUnsupportedOperationError('pulling');
  }

  movePull(_ray: CursorRay): void {
    // Nothing to do without a pull, and there is never one.
  }

  endPull(_outcome: PullOutcome): PullSummary {
    throw new WebGpuUnsupportedOperationError('pulling');
  }

  releasePose(): void {
    // Nothing is ever posed.
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const { staticData, params, normals, creaseGeo, pos, vel, theta } = this.buffers;
    this.motion.dispose();
    for (const buffer of [staticData, params, normals, creaseGeo, ...pos, ...vel, ...theta]) this.core.release(buffer);
    if (this.ownsCore) this.core.dispose();
  }

  private writeParams(): void {
    const dims = this.packed.dims;
    const params = packParams(
      {
        nodes: dims.nodes,
        faces: dims.faces,
        creases: dims.creases,
        creasePercent: this.foldPercent / 100,
        dt: this.dt,
        axialStiffness: this.material.axialStiffness,
        faceStiffness: this.material.faceStiffness,
      },
      this.layout.offsets
    );
    this.core.write(this.buffers.params, 0, params);
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 100 ? 100 : value;
}
