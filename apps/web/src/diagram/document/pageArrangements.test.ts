import { describe, expect, it } from 'vitest';
import { createDiagram, withPageArrangements, withoutPageArrangements, type DiagramPageArrangement } from './diagramDocument';
import { readPageArrangement, roundPageArrangement, samePageArrangement } from './pageArrangements';

/**
 * A packed flow page's arrangement as it is kept (`diagram-flow-packing.md`,
 * Decision 1): rounded as the store adopts it, compared field for field, and
 * set or dropped on a document. The file's reading and writing are held in
 * `diagramFile.test.ts`, with the rest of the file.
 */

const RAW: DiagramPageArrangement = {
  signature: 'pack-1:abc',
  k: 1.23456789,
  steps: {
    a: { box: [12.3456, -0.004, 0.001, 80.107], scale: { mmPerUnit: 0.123456789 }, band: 1 },
    b: { box: [99.999, 40, 30, 20], scale: { frameMm: 41.23456789 }, band: 0, bend: true },
  },
};

describe('roundPageArrangement', () => {
  it('keeps lengths to a hundredth of a mm and scales to six significant digits', () => {
    expect(roundPageArrangement(RAW)).toEqual({
      signature: 'pack-1:abc',
      k: 1.23457,
      steps: {
        // Never a negative zero, never a box of no width.
        a: { box: [12.35, 0, 0.01, 80.11], scale: { mmPerUnit: 0.123457 }, band: 1 },
        b: { box: [100, 40, 30, 20], scale: { frameMm: 41.2346 }, band: 0, bend: true },
      },
    });
    expect(Object.is(roundPageArrangement(RAW).steps.a!.box[1], 0)).toBe(true);
  });

  it('is what the file reads back, and rounding again changes nothing', () => {
    const rounded = roundPageArrangement(RAW);
    expect(readPageArrangement(JSON.parse(JSON.stringify(rounded)))).toEqual(rounded);
    expect(roundPageArrangement(rounded)).toEqual(rounded);
  });

  it('says a step stands in a bend only where it does', () => {
    const notInBend = { ...RAW, steps: { a: { ...RAW.steps.a!, bend: false as unknown as true } } };
    expect('bend' in roundPageArrangement(notInBend).steps.a!).toBe(false);
  });
});

describe('samePageArrangement', () => {
  it('compares field for field, whatever the order of the steps', () => {
    const rounded = roundPageArrangement(RAW);
    const reordered = { ...rounded, steps: { b: rounded.steps.b!, a: rounded.steps.a! } };
    expect(samePageArrangement(rounded, reordered)).toBe(true);
    expect(samePageArrangement(undefined, undefined)).toBe(true);
    expect(samePageArrangement(rounded, undefined)).toBe(false);
    const changed = (patch: Partial<DiagramPageArrangement>) => samePageArrangement(rounded, { ...rounded, ...patch });
    expect(changed({ signature: 'pack-1:abd' })).toBe(false);
    expect(changed({ k: 1.2 })).toBe(false);
    expect(changed({ steps: { a: rounded.steps.a! } })).toBe(false);
    expect(changed({ steps: { ...rounded.steps, c: rounded.steps.a! } })).toBe(false);
    const step = (patch: object) => changed({ steps: { ...rounded.steps, a: { ...rounded.steps.a!, ...patch } } });
    expect(step({ box: [12.35, 0, 0.02, 80.11] })).toBe(false);
    expect(step({ band: 2 })).toBe(false);
    expect(step({ bend: true })).toBe(false);
    expect(step({ scale: { frameMm: 0.123457 } })).toBe(false);
    expect(step({ scale: { mmPerUnit: 0.123457 } })).toBe(true);
  });
});

describe('withPageArrangements / withoutPageArrangements', () => {
  const arrangement = roundPageArrangement(RAW);

  it('sets them, and gives back the same document when they say what it holds', () => {
    const document = createDiagram();
    const arranged = withPageArrangements(document, { a: arrangement });
    expect(arranged.pageArrangements).toEqual({ a: arrangement });
    expect(withPageArrangements(arranged, { a: roundPageArrangement(RAW) })).toBe(arranged);
    expect(withPageArrangements(document, {})).toBe(document);
    // None left: no field at all.
    expect('pageArrangements' in withPageArrangements(arranged, {})).toBe(false);
  });

  it('drops the pages it names, or every one, and gives back the same document when none is stored there', () => {
    const arranged = withPageArrangements(createDiagram(), { a: arrangement, b: arrangement });
    expect(withoutPageArrangements(arranged, ['a']).pageArrangements).toEqual({ b: arrangement });
    expect(withoutPageArrangements(arranged, ['c'])).toBe(arranged);
    expect('pageArrangements' in withoutPageArrangements(arranged, null)).toBe(false);
    expect('pageArrangements' in withoutPageArrangements(arranged, ['a', 'b'])).toBe(false);
    const empty = createDiagram();
    expect(withoutPageArrangements(empty, null)).toBe(empty);
  });

  it('lets go of a newer build’s for the pages it names, and keeps the rest of what that build wrote', () => {
    const document = { ...createDiagram(), newer: { pageArrangements: { a: { tilt: 1 }, b: { tilt: 2 } }, hanStyle: 'xx' } };
    expect(withoutPageArrangements(document, ['a']).newer).toEqual({ pageArrangements: { b: { tilt: 2 } }, hanStyle: 'xx' });
    expect(withoutPageArrangements(document, null).newer).toEqual({ hanStyle: 'xx' });
    const only = { ...createDiagram(), newer: { pageArrangements: { a: { tilt: 1 } } } };
    expect('newer' in withoutPageArrangements(only, ['a'])).toBe(false);
  });
});
