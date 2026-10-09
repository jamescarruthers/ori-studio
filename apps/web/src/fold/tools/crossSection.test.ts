import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import {
  flapNumbers,
  foldFlapChips,
  foldLayersSummary,
  foldSectionPicker,
  type FoldSeedView,
} from './crossSection';
import type { FoldCrossSection, FoldSectionLayer } from './engineContracts';

const t = i18n.t.bind(i18n);

const layer = (faces: number[], span: [number, number], flap: number | null, unordered = false): FoldSectionLayer => ({
  faces,
  span,
  flap,
  unordered,
});

/**
 * A square folded in half, then in half again: four layers at the second
 * line, in two flaps the engine numbers by face id — so its flap 1 is the
 * bottom pair and flap 0 the top pair.
 */
const twice: FoldCrossSection = {
  flaps: [
    { faces: [2, 3], witness: [0.2, 0.7] },
    { faces: [0, 1], witness: [0.2, 0.2] },
  ],
  layers: [
    layer([3], [0, 1], 0),
    layer([2], [0, 1], 0),
    layer([1], [0, 1], 1),
    layer([0], [0, 1], 1),
  ],
  intervals: [{ span: [0, 1], faces: [3, 2, 1, 0], layers: [0, 1, 2, 3] }],
  joins: [
    { upper: 0, lower: 1, at: 1 },
    { upper: 2, lower: 3, at: 0 },
  ],
  depth: 4,
  woven: false,
};

const seed = (picked: number[], added: number[] = [], needed: number[] = []): FoldSeedView => ({
  picked: new Set(picked),
  added: new Set(added),
  needed: new Set(needed),
});

describe('flapNumbers', () => {
  it('numbers the flaps top to bottom by their first row, not by the engine’s face-id order', () => {
    const reordered: FoldCrossSection = {
      ...twice,
      layers: [twice.layers[2]!, twice.layers[3]!, twice.layers[0]!, twice.layers[1]!],
    };
    expect(flapNumbers(twice, 2)).toEqual([1, 2]);
    expect(flapNumbers(reordered, 2)).toEqual([2, 1]);
  });

  it('keeps the engine’s order for flaps with no row, after the rest, and without a section', () => {
    expect(flapNumbers({ ...twice, layers: [twice.layers[2]!] }, 3)).toEqual([2, 1, 3]);
    expect(flapNumbers(null, 3)).toEqual([1, 2, 3]);
  });
});

describe('foldSectionPicker', () => {
  it('names each row by its place and its flap, and says how it reads against the seed', () => {
    const picker = foldSectionPicker(t, twice, seed([0], [1]));
    expect(picker.label).toBe('Layers at the fold line, top to bottom');
    expect(picker.multiple).toBe(true);
    expect(picker.rows.map((row) => [row.label, row.state, row.tag])).toEqual([
      ['Layer 1, Flap 1', 'picked', 'Flap 1'],
      ['Layer 2, Flap 1', 'picked', null],
      ['Layer 3, Flap 2, moves with the fold', 'added', 'Flap 2'],
      ['Layer 4, Flap 2, moves with the fold', 'added', null],
    ]);
    expect(foldSectionPicker(t, twice, seed([1])).rows.map((row) => row.state)).toEqual([
      'excluded',
      'excluded',
      'picked',
      'picked',
    ]);
  });

  it('is one row for one physical layer a precrease crosses: the display layer, not its faces', () => {
    // A diagonal precrease, then folded in half across it: the bottom layer is
    // two faces joined across the flat crease, and one layer.
    const precreased: FoldCrossSection = {
      flaps: [{ faces: [2], witness: [0.8, 0.8] }],
      layers: [layer([2], [0, 1], 0), layer([0, 1], [0, 1], null)],
      intervals: [{ span: [0, 1], faces: [2, 1, 0], layers: [0, 1] }],
      joins: [],
      depth: 2,
      woven: false,
    };
    const picker = foldSectionPicker(t, precreased, seed([0]));
    expect(picker.rows).toHaveLength(2);
    expect(picker.rows[1]).toMatchObject({ label: 'Layer 2, stays put', flap: null, state: 'stays' });
    expect(foldLayersSummary(t, picker)).toBe('1 of 1 layer moving');
  });

  it('marks a row the stacks do not order against the one above, and places each bar along the line', () => {
    const beside: FoldCrossSection = {
      flaps: [{ faces: [0], witness: [0.1, 0.1] }, { faces: [1], witness: [0.9, 0.1] }],
      layers: [layer([0], [0, 0.4], 0), layer([1], [0.6, 1], 1, true)],
      intervals: [
        { span: [0, 0.4], faces: [0], layers: [0] },
        { span: [0.6, 1], faces: [1], layers: [1] },
      ],
      joins: [],
      depth: 1,
      woven: false,
    };
    const rows = foldSectionPicker(t, beside, seed([0, 1])).rows;
    expect(rows.map((row) => row.unordered)).toEqual([false, true]);
    expect(rows[1]?.label).toBe('Layer 2, Flap 2, beside layer 1');
    expect(rows.map((row) => [row.from, row.to])).toEqual([
      [0, 0.4],
      [0.6, 1],
    ]);
  });

  it('draws a bracket where a fold joins two rows, bulging past the side of the line it is on', () => {
    expect(foldSectionPicker(t, twice, seed([0, 1])).brackets).toEqual([
      { upper: 0, lower: 1, at: 1, side: 'end' },
      { upper: 2, lower: 3, at: 0, side: 'start' },
    ]);
  });

  it('shows one interval’s stack for a woven section, across the interval, with no brackets', () => {
    const woven: FoldCrossSection = {
      ...twice,
      woven: true,
      intervals: [
        { span: [0, 0.5], faces: [3, 1], layers: [0, 2] },
        { span: [0.5, 1], faces: [1, 3], layers: [2, 0] },
      ],
    };
    const first = foldSectionPicker(t, woven, seed([0, 1]));
    expect(first.woven).toBe(true);
    expect(first.label).toBe('Layers at the fold line under the pointer, top to bottom');
    expect(first.brackets).toEqual([]);
    expect(first.rows.map((row) => [row.label, row.from, row.to])).toEqual([
      ['Layer 1, Flap 1', 0, 1],
      ['Layer 2, Flap 2', 0, 1],
    ]);
    const second = foldSectionPicker(t, woven, seed([0, 1]), { interval: 1 });
    expect(second.rows.map((row) => row.flap)).toEqual([1, 0]);
  });

  it('marks the rows of a flap a refusal says is in the way', () => {
    const rows = foldSectionPicker(t, twice, seed([1], [], [0])).rows;
    expect(rows.map((row) => row.needed)).toEqual([true, true, false, false]);
  });
});

describe('foldFlapChips', () => {
  it('is a chip per flap in their numbered order, pressed while picked, with its rows at the line', () => {
    const chips = foldFlapChips(t, twice, seed([1], [0], [0]));
    expect(chips.map((chip) => [chip.flap, chip.name, chip.detail, chip.pressed, chip.added, chip.needed])).toEqual([
      [0, 'Flap 1', '2 layers', false, true, true],
      [1, 'Flap 2', '2 layers', true, false, false],
    ]);
    expect(chips.map((chip) => chip.label)).toEqual(['Flap 1, 2 layers, moves with the fold', 'Flap 2, 2 layers']);
  });
});

describe('foldLayersSummary', () => {
  it('counts display layers on the moving side, and those whose flap moves', () => {
    expect(foldLayersSummary(t, foldSectionPicker(t, twice, seed([0, 1])))).toBe('4 of 4 layers moving');
    expect(foldLayersSummary(t, foldSectionPicker(t, twice, seed([1])))).toBe('2 of 4 layers moving');
    expect(foldLayersSummary(t, foldSectionPicker(t, twice, seed([1], [0])))).toBe('4 of 4 layers moving');
  });
});
