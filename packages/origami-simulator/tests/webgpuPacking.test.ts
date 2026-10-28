import { describe, expect, it } from 'vitest';
import { makeMiura } from '../bench/fixtures.js';
import { OrigamiModel } from '../src/model.js';
import { prepareFoldModel } from '../src/prepare.js';
import { packBeamMeta, packCreaseMeta, packModel, type SolverMaterial } from '../src/webgl/packing.js';
import { NORMAL_CALC, VELOCITY_CALC } from '../src/webgpu/passes.js';
import { STATIC_ARRAYS, packParams, packStaticData, type StaticLayout } from '../src/webgpu/packing.js';

const MATERIAL: SolverMaterial = {
  axialStiffness: 20,
  creaseStiffness: 0.7,
  panelStiffness: 0.7,
  faceStiffness: 0.2,
  damping: 0.45,
  timeStepScale: 1,
};

function packed() {
  const model = new OrigamiModel(prepareFoldModel(makeMiura(4, 4), { triangulate: true }));
  return packModel(model, MATERIAL);
}

/** One array's region of staticData, by its offset and length. */
function region(data: Float32Array, offset: number, length: number): Float32Array {
  return data.subarray(offset * 4, offset * 4 + length);
}

/** One array's whole region of a layout: from its offset to the next array's. */
function arrayOf(layout: StaticLayout, name: (typeof STATIC_ARRAYS)[number]): Float32Array {
  const next = STATIC_ARRAYS[STATIC_ARRAYS.indexOf(name) + 1];
  const end = next === undefined ? layout.data.length / 4 : layout.offsets[next];
  return region(layout.data, layout.offsets[name], (end - layout.offsets[name]) * 4);
}

describe('WebGPU static layout', () => {
  it('holds every array the WebGL2 textures hold, byte for byte, at its offset', () => {
    const model = packed();
    const { data, offsets } = packStaticData(model, MATERIAL);
    const expected: Record<(typeof STATIC_ARRAYS)[number], Float32Array> = {
      originalPosition: model.originalPosition,
      externalForces: model.externalForces,
      mass: model.mass,
      meta: model.meta,
      meta2: model.meta2,
      beamMeta: packBeamMeta(model, MATERIAL),
      creaseMeta: packCreaseMeta(model, MATERIAL),
      creaseMeta2: model.creaseMeta2,
      creaseVectors: model.creaseVectors,
      nodeCreaseMeta: model.nodeCreaseMeta,
      nodeFaceMeta: model.nodeFaceMeta,
      faceVertexIndices: model.faceVertexIndices,
      nominalTriangles: model.nominalTriangles,
    };
    let total = 0;
    for (const name of STATIC_ARRAYS) {
      expect(region(data, offsets[name], expected[name].length), name).toEqual(expected[name]);
      total += expected[name].length;
    }
    expect(data.length).toBe(total);
  });

  it('lays the arrays end to end, in the order the kernels name their offsets', () => {
    const { offsets } = packStaticData(packed(), MATERIAL);
    const starts = STATIC_ARRAYS.map((name) => offsets[name]);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i += 1) expect(starts[i]).toBeGreaterThan(starts[i - 1]!);
  });

  it('rebuilds only the material arrays for a new material', () => {
    const model = packed();
    const before = packStaticData(model, MATERIAL);
    const after = packStaticData(model, { ...MATERIAL, axialStiffness: 40, creaseStiffness: 1.4 });
    expect(after.offsets).toEqual(before.offsets);
    for (const name of STATIC_ARRAYS) {
      const same = arrayOf(before, name).join() === arrayOf(after, name).join();
      expect(same, name).toBe(name !== 'beamMeta' && name !== 'creaseMeta');
    }
  });
});

describe('WebGPU params uniform', () => {
  it('puts the counts, the simulation values and every offset where Params declares them', () => {
    const { offsets } = packStaticData(packed(), MATERIAL);
    const params = packParams(
      { nodes: 25, faces: 32, creases: 40, creasePercent: 0.6, dt: 0.01, axialStiffness: 20, faceStiffness: 0.2 },
      offsets
    );
    expect(params.length).toBe(28);
    expect(Array.from(params.subarray(0, 3))).toEqual([25, 32, 40]);
    expect(params[4]).toBeCloseTo(0.6);
    expect(params[5]).toBeCloseTo(0.01);
    expect(params[8]).toBe(0); // calcFaceStrain off
    expect(Array.from(params.subarray(12, 25))).toEqual(STATIC_ARRAYS.map((name) => offsets[name]));
  });

  it('names the offsets in the kernels in the same order as STATIC_ARRAYS', () => {
    // The accessor for array i reads params.off{floor(i/4)}.{xyzw[i%4]}.
    const lanes = ['x', 'y', 'z', 'w'];
    const accessor = (name: string) => `s${name[0]!.toUpperCase()}${name.slice(1)}(i : u32)`;
    STATIC_ARRAYS.forEach((name, i) => {
      const slot = `params.off${Math.floor(i / 4)}.${lanes[i % 4]}`;
      const line = NORMAL_CALC.split('\n').find((text) => text.includes(accessor(name)));
      expect(line, name).toContain(slot);
    });
    expect(VELOCITY_CALC).toContain('fn sNominalTriangles');
  });
});
