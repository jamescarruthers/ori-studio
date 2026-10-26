import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FoldModelLine, FoldOp, SheetPoint } from '../document/foldSequenceDocument';
import { createFoldEngineCalls } from '../engine/foldEngineCalls';
import { createFoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import type { FoldIsometry, FoldScene } from '../engine/foldEngineWire';
import { prepareRepeat, type RepeatPrepared, type RepeatSourceStep } from './repeatPreparation';
import { compose, modelMap, reflection, RepeatFailure, verifiedSymmetry } from './repeatGeometry';
import { verifyMaterial, type RepeatMeasure } from './repeatVerification';

/**
 * Repeat of a step whose moved paper crosses the axis (`heldGauge`): the
 * engine moves the side of a pleat's mountain line that holds its valley,
 * and a fold the side its moving point is on, often the big side. Measured
 * against the paper the source left in place, the mirror of such a step
 * moves paper the source moved too, and Repeat refused it. Every case is
 * built here from scratch over the real engine in-process; skipped when the
 * bridge has not been built.
 */
const WASM = resolve(process.cwd(), 'src/generated/oristudio-fold-wasm/oristudio_fold_wasm_bg.wasm');

async function engine() {
  const wasm = await import('../../generated/oristudio-fold-wasm/oristudio_fold_wasm');
  wasm.initSync({ module: readFileSync(WASM) });
  const raw = new wasm.FoldEngine();
  return { ...createFoldEngineCalls(raw), ...createFoldEngineCompoundCalls(raw) };
}
type Engine = Awaited<ReturnType<typeof engine>>;

const free = (a: SheetPoint, b: SheetPoint) => ({ via: 'free' as const, through: [a, b] as [SheetPoint, SheetPoint] });
const every = { scope: 'all' } as const;
/** The diagonal y = x, from the bottom left corner to the top right, and the vertical centre line. */
const diagonal: FoldModelLine = { n: [-Math.SQRT1_2, Math.SQRT1_2], d: 0 };
const middle: FoldModelLine = { n: [1, 0], d: 0.5 };
/** The sheet points across each, exactly. */
const swap = ([x, y]: SheetPoint): SheetPoint => [y, x];
const flipX = ([x, y]: SheetPoint): SheetPoint => [1 - x, y];

/** Mountain y = x + 1/4, valley y = x + 0.15: the side of its mountain that holds its valley moves, the big side, across y = x. */
const pleat: FoldOp = { kind: 'pleat', line: free([0, 0.25], [0.75, 1]), second: free([0, 0.15], [0.85, 1]), moving: [0.9, 0.1], seed: every };
/** Its mirror across y = x, folded by hand. */
const mirroredPleat: FoldOp = { kind: 'pleat', line: free([0.25, 0], [1, 0.75]), second: free([0.15, 0], [1, 0.85]), moving: [0.1, 0.9], seed: every };
/** A book: the top half folded down onto the bottom. */
const book: FoldOp = { kind: 'valley', line: free([0, 0.5], [1, 0.5]), moving: [0.5, 0.9], seed: every };
const precrease = (a: SheetPoint, b: SheetPoint, moving: SheetPoint): FoldOp => ({ kind: 'precrease', direction: 'valley', line: free(a, b), moving, seed: every });

function sheet(e: Engine): number {
  const landed = e.sheet({ shape: { kind: 'square' }, startSide: 'front' });
  if (landed.status !== 'ok') throw new Error('sheet');
  return landed.state;
}

/** Fold `ops` from `state` in turn; the last state. */
function fold(e: Engine, state: number, ops: readonly FoldOp[]): number {
  let current = state;
  for (const op of ops) {
    const landed = e.step(current, op);
    if (landed.status !== 'ok') throw new Error(`${op.kind}: ${JSON.stringify(landed.refusal)}`);
    current = landed.state;
  }
  return current;
}

/** `ops` folded from `start` as a repeat's source, then prepared across `axis`. */
function repeated(e: Engine, start: number, ops: readonly FoldOp[], axis: FoldModelLine) {
  const steps: RepeatSourceStep[] = [];
  let current = start;
  for (const [k, op] of ops.entries()) {
    const after = fold(e, current, [op]);
    steps.push({ id: `s${k}`, op, before: current, after });
    current = after;
  }
  const prepared = prepareRepeat(e, { parent: current, axis, steps, source: { first: 's0', last: steps.at(-1)!.id, revision: 'test' } });
  return { steps, parent: current, prepared };
}

function ready(prepared: RepeatPrepared) {
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared));
  return prepared;
}

/** What Repeat measured each mirrored step against, each folded again from the one before it. */
function measured(e: Engine, steps: readonly RepeatSourceStep[], parent: number, prepared: RepeatPrepared, axis: FoldModelLine): RepeatMeasure[] {
  let before = parent;
  return ready(prepared).op.steps.map((entry, k) => {
    const landed = fold(e, before, [entry.op]);
    const measure = verifyMaterial(e.scene(steps[k]!.before), e.scene(steps[k]!.after), e.scene(before), e.scene(landed), reflection(axis));
    before = landed;
    return measure;
  });
}

/** Repeat's verdict on a mirrored step: what it measured it against, or the code it refused it with. */
function verdict(...args: Parameters<typeof verifyMaterial>): string {
  try {
    return verifyMaterial(...args);
  } catch (error) {
    if (error instanceof RepeatFailure) return error.code;
    throw error;
  }
}

/** A step by free lines, its lines and moving point taken across the axis (`across`): its mirror, folded by hand. */
function takenAcross(op: FoldOp, across: (p: SheetPoint) => SheetPoint): FoldOp {
  if (!('line' in op) || op.line.via !== 'free' || !('moving' in op) || !op.moving) throw new Error('a free line and a moving point');
  const line = ({ through }: { through: readonly [SheetPoint, SheetPoint] }) => free(across(through[0]), across(through[1]));
  return { ...op, line: line(op.line), moving: across(op.moving), ...('second' in op && op.second.via === 'free' ? { second: line(op.second) } : {}) } as FoldOp;
}

/** `scene` with every face moved by `g` in its model frame. */
function moved(scene: FoldScene, g: FoldIsometry): FoldScene {
  return { ...scene, face_transforms: scene.faces.map((_, i) => compose(scene.view_transform, compose(g, modelMap(scene, i)))) };
}

describe.skipIf(!existsSync(WASM))('Repeat of a step whose moved paper crosses the axis', () => {
  it('repeats a pleat moving its big side across y = x as its mirror folded by hand', async () => {
    const e = await engine();
    const start = sheet(e);
    const { steps, parent, prepared } = repeated(e, start, [pleat], diagonal);
    const { op, matched } = ready(prepared);
    expect(matched).toEqual([0]);
    const byHand = fold(e, parent, [mirroredPleat]);
    expect(op.steps[0]!.expect).toBe(e.fingerprint(byHand));
    // Its mirror moves the big side across the axis too: measured against
    // the paper the pleat left in place, it was refused.
    expect(verifyMaterial(e.scene(start), e.scene(parent), e.scene(parent), e.scene(byHand), reflection(diagonal))).toBe('held');
    expect(measured(e, steps, parent, prepared, diagonal)).toEqual(['held']);
    const grouped = e.step(parent, op);
    if (grouped.status !== 'ok') throw new Error(JSON.stringify(grouped.refusal));
    expect(verifiedSymmetry(e.scene(grouped.state), diagonal)?.side).toBe('same');
  });

  it.each([
    {
      what: 'the pleat over its lines and their mirrors precreased, the view turned over',
      setup: [
        precrease([0, 0.25], [0.75, 1], [0.05, 0.95]),
        precrease([0, 0.15], [0.85, 1], [0.05, 0.95]),
        precrease([0.25, 0], [1, 0.75], [0.95, 0.05]),
        precrease([0.15, 0], [1, 0.85], [0.95, 0.05]),
        { kind: 'turn', axis: 'vertical' },
      ] as FoldOp[],
      ops: [pleat],
      axis: diagonal,
      across: swap,
      measures: ['held'],
    },
    {
      what: 'a pleat through a book moving its big side across x = 1/2',
      setup: [book],
      ops: [{ kind: 'pleat', line: free([0.2, 0], [0.2, 0.5]), second: free([0.3, 0], [0.3, 0.5]), moving: [0.9, 0.25], seed: every }] as FoldOp[],
      axis: middle,
      across: flipX,
      measures: ['held'],
    },
    {
      what: 'an inside crimp through a book moving its big side across x = 1/2',
      setup: [book],
      ops: [{ kind: 'crimp', crimp: 'inside', line: free([0.2, 0], [0.2, 0.5]), second: free([0.3, 0], [0.3, 0.5]), moving: [0.9, 0.25], seed: every }] as FoldOp[],
      axis: middle,
      across: flipX,
      measures: ['held'],
    },
    {
      what: 'a precrease, then the pleat',
      setup: [],
      ops: [precrease([0, 0.25], [0.75, 1], [0.05, 0.95]), pleat],
      axis: diagonal,
      across: swap,
      measures: ['unmoved', 'held'],
    },
    {
      what: 'the pleat, then a valley of the corner beyond it',
      setup: [],
      ops: [pleat, { kind: 'valley', line: free([0, 0.8], [0.2, 1]), moving: [0.05, 0.95], seed: every }] as FoldOp[],
      axis: diagonal,
      across: swap,
      measures: ['held', 'unmoved'],
    },
  ])('repeats $what as the same steps mirrored by hand', async ({ setup, ops, axis, across, measures }) => {
    const e = await engine();
    const start = fold(e, sheet(e), setup);
    expect(verifiedSymmetry(e.scene(start), axis)?.side).toBe('same');
    const { steps, parent, prepared } = repeated(e, start, ops, axis);
    const { op } = ready(prepared);
    expect(measured(e, steps, parent, prepared, axis)).toEqual(measures);
    const byHand = fold(e, parent, ops.map((each) => takenAcross(each, across)));
    expect(op.steps.at(-1)!.expect).toBe(e.fingerprint(byHand));
    const grouped = e.step(parent, op);
    if (grouped.status !== 'ok') throw new Error(JSON.stringify(grouped.refusal));
    expect(verifiedSymmetry(e.scene(grouped.state), axis)?.side).toBe('same');
  });

  it.each([
    { what: 'a valley along y = x + 0.6', op: { kind: 'valley', line: free([0, 0.6], [0.4, 1]), moving: [0.9, 0.1], seed: every } as FoldOp, small: [0.05, 0.95] as SheetPoint, axis: diagonal, across: swap },
    { what: 'a valley along x = 0.2', op: { kind: 'valley', line: free([0.2, 0], [0.2, 1]), moving: [0.9, 0.5], seed: every } as FoldOp, small: [0.1, 0.5] as SheetPoint, axis: middle, across: flipX },
    { what: 'a mountain along x = 0.2', op: { kind: 'mountain', line: free([0.2, 0], [0.2, 1]), moving: [0.9, 0.5], seed: every } as FoldOp, small: [0.1, 0.5] as SheetPoint, axis: middle, across: flipX },
  ])('repeats $what moving its big side across the axis as both small sides folded by hand', async ({ op, small, axis, across }) => {
    const e = await engine();
    const start = sheet(e);
    const { steps, parent, prepared } = repeated(e, start, [op], axis);
    expect(measured(e, steps, parent, prepared, axis)).toEqual(['held']);
    // From the sheet: the small side folded, then its mirror. The source
    // turned the big side over instead, so its repeat does too.
    const smallSide = { ...op, moving: small } as FoldOp;
    const byHand = fold(e, start, [smallSide, takenAcross(smallSide, across)]);
    expect(ready(prepared).op.steps[0]!.expect).toBe(e.fingerprint(byHand));
  });

  describe('the mirrored pleat, judged against the big-side pleat across y = x', () => {
    async function judged(target: FoldOp) {
      const e = await engine();
      const start = sheet(e);
      const parent = fold(e, start, [pleat]);
      const landed = fold(e, parent, [target]);
      return verdict(e.scene(start), e.scene(parent), e.scene(parent), e.scene(landed), reflection(diagonal));
    }

    it('passes measured against the paper the pleat moved', async () => {
      expect(await judged(mirroredPleat)).toBe('held');
    });

    it.each([
      ['its lines traded', { kind: 'pleat', line: free([0.15, 0], [1, 0.85]), second: free([0.25, 0], [1, 0.75]), moving: [0.95, 0.05], seed: every }],
      ['a mirror at the wrong offset, y = x − 0.3 and y = x − 0.2', { kind: 'pleat', line: free([0.3, 0], [1, 0.7]), second: free([0.2, 0], [1, 0.8]), moving: [0.1, 0.9], seed: every }],
      ['a wider mirror', { kind: 'pleat', line: free([0.3, 0], [1, 0.7]), second: free([0.15, 0], [1, 0.85]), moving: [0.1, 0.9], seed: every }],
      ['a narrower mirror', { kind: 'pleat', line: free([0.22, 0], [1, 0.78]), second: free([0.15, 0], [1, 0.85]), moving: [0.1, 0.9], seed: every }],
      ['a lone valley on the mirrored valley line', { kind: 'valley', line: free([0.15, 0], [1, 0.85]), moving: [0.1, 0.9], seed: every }],
      ['a valley along y = x + 0.05, across the axis', { kind: 'valley', line: free([0, 0.05], [0.95, 1]), moving: [0.1, 0.9], seed: every }],
    ] as [string, FoldOp][])('refuses %s', async (_what, target) => {
      expect(await judged(target)).toBe('repeat_material');
    });
  });

  it('refuses the same shape turned over: a mirror holding still the big side the source turned over', async () => {
    const e = await engine();
    const start = sheet(e);
    const valley: FoldOp = { kind: 'valley', line: free([0, 0.6], [0.4, 1]), moving: [0.9, 0.1], seed: every };
    const parent = fold(e, start, [valley]);
    // The corner across the axis folded behind: the state is symmetric, but
    // the big side the source turned over stays as it lay.
    const landed = fold(e, parent, [{ kind: 'mountain', line: free([0.6, 0], [1, 0.4]), moving: [0.9, 0.1], seed: every }]);
    expect(verifiedSymmetry(e.scene(landed), diagonal)?.side).toBe('same');
    expect(verdict(e.scene(start), e.scene(parent), e.scene(parent), e.scene(landed), reflection(diagonal))).toBe('repeat_material');
  });

  it.each([
    ['a pleat moving the corner beyond it', { kind: 'pleat', line: free([0, 0.15], [0.85, 1]), second: free([0, 0.25], [0.75, 1]), moving: [0.05, 0.95], seed: every }],
    ['a valley moving the corner beyond it', { kind: 'valley', line: free([0, 0.6], [0.4, 1]), moving: [0.05, 0.95], seed: every }],
  ] as [string, FoldOp][])('measures %s, all on one side of the axis, against the paper it left in place', async (_what, op) => {
    const e = await engine();
    const { steps, parent, prepared } = repeated(e, sheet(e), [op], diagonal);
    expect(measured(e, steps, parent, prepared, diagonal)).toEqual(['unmoved']);
  });

  it('refuses a source that moved every face alike, whatever its mirror did: held still, no paper is left to measure', async () => {
    const e = await engine();
    const before = e.scene(sheet(e));
    const after = moved(before, [1, 0, 0.1, 0, 1, 0]);
    const turned = moved(after, [0, -1, 1, 1, 0, 0]);
    expect(verdict(before, after, after, turned, reflection(middle))).toBe('repeat_material');
  });
});
