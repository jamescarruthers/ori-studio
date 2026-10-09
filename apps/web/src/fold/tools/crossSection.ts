/**
 * The cross-section at the fold line, as the tool window shows it (plan D14):
 * the layer picker's rows, the flap chips and the "n of m layers moving" line,
 * from the engine's section and what the seed asks for.
 *
 * The engine does the geometry — the intervals, the display layers, their
 * order, the flaps. This decides what each row is called and how it reads:
 * picked, moved anyway, left behind, or staying put; where its bar runs; and
 * which flap is numbered 1. Every surface that names a flap — a chip, a row, a
 * refusal's fix — numbers it through {@link flapNumbers}, so "Flap 2" is the
 * same flap everywhere.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { FoldCrossSection, FoldSectionLayer } from './engineContracts';

/** What moves by request, and what the engine says moves besides. */
export interface FoldSeedView {
  /** The flaps the seed names (indices into the section's flaps). */
  picked: ReadonlySet<number>;
  /** The flaps the closure moves beyond those (`FoldAnalysis.added`). */
  added: ReadonlySet<number>;
  /** The flaps a refusal's "include" fix names: the ones in the way. */
  needed: ReadonlySet<number>;
}

/** How a row reads: its flap picked, moved anyway, left behind; or a layer that stays. */
export type FoldSectionRowState = 'picked' | 'added' | 'excluded' | 'stays';

export interface FoldSectionRow {
  /** Stable among the rows: the React key and the option's id suffix. */
  key: string;
  /** The row's number, 1 at the top. */
  layer: number;
  /** The option's accessible name. */
  label: string;
  /** Its flap (an index into the section's flaps), or null for a layer that stays. */
  flap: number | null;
  /** "Flap 2", on the first row of a run of the flap's rows; null on the rest. */
  tag: string | null;
  state: FoldSectionRowState;
  /** Its flap is in the way of the fold asked for (a refusal's fix names it). */
  needed: boolean;
  /** Placed beside the row above rather than under it (D14 cross-section, 3). */
  unordered: boolean;
  /** Where its bar runs, as fractions of the section's extent along the line. */
  from: number;
  to: number;
}

/** A bracket between two rows where a fold joins them, at a fraction along the line. */
export interface FoldSectionBracket {
  upper: number;
  lower: number;
  at: number;
  /** Which way it bulges: past the end of the rows it joins, or before their start. */
  side: 'start' | 'end';
}

export interface FoldSectionPickerModel {
  /** The listbox's accessible name. */
  label: string;
  /** Several flaps may be picked (a plain fold's seed); otherwise one. */
  multiple: boolean;
  rows: readonly FoldSectionRow[];
  brackets: readonly FoldSectionBracket[];
  /** The rows are one interval's stack, a woven section's (D14 cross-section, 3). */
  woven: boolean;
}

export interface FoldFlapChip {
  flap: number;
  /** "Flap 2": the chip's text. */
  name: string;
  /** "2 layers": its rows at the line. */
  detail: string;
  /** The chip's accessible name: its name, its rows, and whether it moves anyway. */
  label: string;
  pressed: boolean;
  added: boolean;
  needed: boolean;
}

/**
 * Each flap's number on screen (1-based), indexed by the engine's flap index:
 * top to bottom by the flap's first row at the line, as a folder reads the
 * stack. The engine orders its flaps by face id, which means nothing to a
 * reader. A flap with no row there keeps its engine order after the rest.
 */
export function flapNumbers(section: FoldCrossSection | null, flapCount: number): number[] {
  const order: number[] = [];
  for (const layer of section?.layers ?? []) {
    if (layer.flap !== null && layer.flap < flapCount && !order.includes(layer.flap)) order.push(layer.flap);
  }
  for (let flap = 0; flap < flapCount; flap += 1) {
    if (!order.includes(flap)) order.push(flap);
  }
  const numbers = new Array<number>(flapCount);
  order.forEach((flap, position) => {
    numbers[flap] = position + 1;
  });
  return numbers;
}

/** A flap's name, by its number on screen. */
export function flapName(t: TFunction, number: number): string {
  return t('tools:fold.flap.name', 'Flap {{number}}', { number });
}

function rowState(flap: number | null, seed: FoldSeedView): FoldSectionRowState {
  if (flap === null) return 'stays';
  if (seed.picked.has(flap)) return 'picked';
  return seed.added.has(flap) ? 'added' : 'excluded';
}

/**
 * The option's name. Whole sentences per case rather than clauses joined, so
 * a locale can order them (plan D14, Sentences).
 */
function rowLabel(
  t: TFunction,
  layer: number,
  flap: string | null,
  state: FoldSectionRowState,
  unordered: boolean
): string {
  const above = layer - 1;
  if (flap === null) {
    return unordered
      ? t('tools:fold.section.rowStaysBeside', 'Layer {{layer}}, stays put, beside layer {{above}}', { layer, above })
      : t('tools:fold.section.rowStays', 'Layer {{layer}}, stays put', { layer });
  }
  if (state === 'added') {
    return unordered
      ? t('tools:fold.section.rowAddedBeside', 'Layer {{layer}}, {{flap}}, moves with the fold, beside layer {{above}}', {
          layer,
          flap,
          above,
        })
      : t('tools:fold.section.rowAdded', 'Layer {{layer}}, {{flap}}, moves with the fold', { layer, flap });
  }
  return unordered
    ? t('tools:fold.section.rowBeside', 'Layer {{layer}}, {{flap}}, beside layer {{above}}', { layer, flap, above })
    : t('tools:fold.section.row', 'Layer {{layer}}, {{flap}}', { layer, flap });
}

/** The rows on show: every display layer, or for a woven section the stack of one interval. */
function shownLayers(
  section: FoldCrossSection,
  interval: number | null
): { layers: { layer: FoldSectionLayer; index: number }[]; span: readonly [number, number] | null } {
  if (section.woven) {
    const shown = section.intervals[interval ?? 0] ?? section.intervals[0];
    if (!shown) return { layers: [], span: null };
    const layers = shown.layers.flatMap((index) => {
      const layer = section.layers[index];
      return layer ? [{ layer, index }] : [];
    });
    return { layers, span: shown.span };
  }
  return { layers: section.layers.map((layer, index) => ({ layer, index })), span: null };
}

/**
 * The layer picker: a row per display layer, top to bottom, each named and
 * placed; and the brackets where a fold joins two of them. For a woven
 * section, the stack of the interval under the pointer (`interval`, else the
 * first), every row across the interval, and no brackets: there is no one
 * row order for them to join.
 */
export function foldSectionPicker(
  t: TFunction,
  section: FoldCrossSection,
  seed: FoldSeedView,
  { interval = null, multiple = true }: { interval?: number | null; multiple?: boolean } = {}
): FoldSectionPickerModel {
  const numbers = flapNumbers(section, section.flaps.length);
  const { layers, span } = shownLayers(section, interval);
  const spans = layers.map(({ layer }) => span ?? layer.span);
  const start = Math.min(...spans.map(([from]) => from));
  const extent = Math.max(...spans.map(([, to]) => to)) - start;
  // A section with no length (one point on the line, or no rows) draws each bar whole.
  const measured = extent > 0;
  const fraction = (at: number) => (measured ? Math.min(1, Math.max(0, (at - start) / extent)) : 0);

  const rows = layers.map(({ layer, index }, position): FoldSectionRow => {
    const flap = layer.flap !== null && layer.flap < numbers.length ? layer.flap : null;
    const name = flap === null ? null : flapName(t, numbers[flap] ?? flap + 1);
    const previous = layers[position - 1]?.layer.flap ?? null;
    // In a woven stack, the rows are ordered by the stack itself.
    const unordered = !section.woven && layer.unordered && position > 0;
    const state = rowState(flap, seed);
    const [from, to] = spans[position] ?? layer.span;
    return {
      key: `layer-${index}`,
      layer: position + 1,
      label: rowLabel(t, position + 1, name, state, unordered),
      flap,
      tag: name !== null && (position === 0 || previous !== flap) ? name : null,
      state,
      needed: flap !== null && seed.needed.has(flap),
      unordered,
      from: fraction(from),
      to: measured ? fraction(to) : 1,
    };
  });

  const brackets: FoldSectionBracket[] = section.woven
    ? []
    : section.joins.flatMap((join) => {
        const upper = section.layers[join.upper];
        if (!upper || !section.layers[join.lower] || join.upper === join.lower) return [];
        const middle = (upper.span[0] + upper.span[1]) / 2;
        return [
          {
            upper: Math.min(join.upper, join.lower),
            lower: Math.max(join.upper, join.lower),
            at: fraction(join.at),
            side: join.at >= middle ? ('end' as const) : ('start' as const),
          },
        ];
      });

  return {
    label: section.woven
      ? t('tools:fold.section.labelWoven', 'Layers at the fold line under the pointer, top to bottom')
      : t('tools:fold.section.label', 'Layers at the fold line, top to bottom'),
    multiple,
    rows,
    brackets,
    woven: section.woven,
  };
}

/** A chip per flap, in the order the flaps are numbered: the keyboard path to picking them (D14). */
export function foldFlapChips(t: TFunction, section: FoldCrossSection, seed: FoldSeedView): FoldFlapChip[] {
  const numbers = flapNumbers(section, section.flaps.length);
  return section.flaps
    .map((_, flap) => flap)
    .sort((a, b) => (numbers[a] ?? 0) - (numbers[b] ?? 0))
    .map((flap) => {
      const number = numbers[flap] ?? flap + 1;
      const count = section.layers.filter((layer) => layer.flap === flap).length;
      const pressed = seed.picked.has(flap);
      const added = !pressed && seed.added.has(flap);
      return {
        flap,
        name: flapName(t, number),
        detail: t('tools:fold.flap.layers', {
          count,
          defaultValue_one: '{{count}} layer',
          defaultValue_other: '{{count}} layers',
        }),
        label: added
          ? t('tools:fold.flap.chipAdded', {
              count,
              number,
              defaultValue_one: 'Flap {{number}}, {{count}} layer, moves with the fold',
              defaultValue_other: 'Flap {{number}}, {{count}} layers, moves with the fold',
            })
          : t('tools:fold.flap.chip', {
              count,
              number,
              defaultValue_one: 'Flap {{number}}, {{count}} layer',
              defaultValue_other: 'Flap {{number}}, {{count}} layers',
            }),
        pressed,
        added,
        needed: seed.needed.has(flap),
      };
    });
}

/**
 * "2 of 4 layers moving": the rows whose flap moves, of the rows on the moving
 * side — display layers, never faces (D14 cross-section, 2).
 */
export function foldLayersSummary(t: TFunction, picker: FoldSectionPickerModel): string {
  const candidates = picker.rows.filter((row) => row.flap !== null);
  const moving = candidates.filter((row) => row.state === 'picked' || row.state === 'added').length;
  return t('tools:fold.window.layersMoving', {
    count: candidates.length,
    moving,
    defaultValue_one: '{{moving}} of {{count}} layer moving',
    defaultValue_other: '{{moving}} of {{count}} layers moving',
  });
}
