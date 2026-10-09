/**
 * The sheet a Fold sequence starts from, as the Paper tab offers it (plan D7):
 * a square, a rectangle — the design's presets 1:√2, 3:4 and 2:1, or any
 * w:h — or a regular polygon of 3 to 8 sides.
 *
 * Tagged as the engine's `SheetShape` is (`crates/oristudio-fold/src/sheet.rs`,
 * `shape`: `square` | `rectangle` | `regular`), so a shape passes to the
 * bridge as it is. A rectangle is kept at longer side 1, as the document
 * stores it; a polygon by its side count, which the document derives from its
 * points.
 *
 * Pure: no DOM, no store.
 */

export type FoldPaperShape =
  | { shape: 'square' }
  | { shape: 'rectangle'; width: number; height: number }
  | { shape: 'regular'; sides: number };

/** Which side of the paper faces the viewer before the first fold. */
export type FoldStartSide = 'front' | 'back';

/** The kinds of sheet the tab offers, one control each. */
export type FoldPaperShapeKind = FoldPaperShape['shape'];

/** The side counts a regular polygon sheet may have (plan D7). */
export const REGULAR_SIDES = { min: 3, max: 8 } as const;

/** The polygon a sheet becomes when the user picks Polygon: the hexagon, the commonest. */
const DEFAULT_SIDES = 6;

/**
 * The engine's minimum feature, a fraction of the sheet: a rectangle whose
 * shorter side is narrower is refused (`sheet_side_too_short`), so the tab
 * never offers one.
 */
const MIN_FEATURE = 1e-3;

/** How close two proportions are to be the same one. */
const ASPECT_TOLERANCE = 1e-6;

export type RectanglePresetId = 'iso' | 'threeFour' | 'twoOne';

export interface RectanglePreset {
  id: RectanglePresetId;
  /** The ratio as written, width first — a label in every language. */
  label: string;
  width: number;
  height: number;
}

/** A4 and its family: what a rectangle starts as. */
const ISO_PRESET: RectanglePreset = { id: 'iso', label: '1:√2', width: Math.SQRT1_2, height: 1 };

/** The design's rectangles, width : height, at longer side 1. */
export const RECTANGLE_PRESETS: readonly RectanglePreset[] = [
  ISO_PRESET,
  { id: 'threeFour', label: '3:4', width: 0.75, height: 1 },
  { id: 'twoOne', label: '2:1', width: 1, height: 0.5 },
];

/**
 * A `width : height` at longer side 1, or null when it is not one the engine
 * folds: not finite, not positive, or so narrow its shorter side is under the
 * minimum feature.
 */
export function normalizeAspect(width: number, height: number): { width: number; height: number } | null {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null;
  const longer = Math.max(width, height);
  const normalized = { width: width / longer, height: height / longer };
  return Math.min(normalized.width, normalized.height) < MIN_FEATURE ? null : normalized;
}

/**
 * The sheet a `width : height` makes: a rectangle at longer side 1, or the
 * square when the two sides agree. Null for proportions the engine refuses.
 */
export function rectangleShape(width: number, height: number): FoldPaperShape | null {
  const normalized = normalizeAspect(width, height);
  if (!normalized) return null;
  if (Math.abs(normalized.width - normalized.height) <= ASPECT_TOLERANCE) return { shape: 'square' };
  return { shape: 'rectangle', ...normalized };
}

/** The preset a rectangle is, by its proportions; null for a custom one. */
export function rectanglePresetOf(width: number, height: number): RectanglePreset | null {
  const normalized = normalizeAspect(width, height);
  if (!normalized) return null;
  return (
    RECTANGLE_PRESETS.find(
      (preset) =>
        Math.abs(preset.width - normalized.width) <= ASPECT_TOLERANCE &&
        Math.abs(preset.height - normalized.height) <= ASPECT_TOLERANCE
    ) ?? null
  );
}

/** A side count the tab accepts: a whole number of sides from 3 to 8, or null. */
export function regularSides(sides: number): number | null {
  if (!Number.isFinite(sides)) return null;
  const whole = Math.round(sides);
  return whole >= REGULAR_SIDES.min && whole <= REGULAR_SIDES.max ? whole : null;
}

/**
 * The sheet a kind becomes when it is picked: a kind keeps the shape it has,
 * and a new one starts at its first offer — the first rectangle preset, or the
 * hexagon.
 */
export function shapeOfKind(kind: FoldPaperShapeKind, current: FoldPaperShape): FoldPaperShape {
  if (kind === current.shape) return current;
  switch (kind) {
    case 'square':
      return { shape: 'square' };
    case 'rectangle':
      return { shape: 'rectangle', width: ISO_PRESET.width, height: ISO_PRESET.height };
    case 'regular':
      return { shape: 'regular', sides: DEFAULT_SIDES };
  }
}

/**
 * Whether two shapes are the same sheet. Changing to the same sheet is no
 * change, so it never starts a sequence over.
 */
export function sameShape(a: FoldPaperShape, b: FoldPaperShape): boolean {
  switch (a.shape) {
    case 'square':
      return b.shape === 'square';
    case 'rectangle': {
      if (b.shape !== 'rectangle') return false;
      const left = normalizeAspect(a.width, a.height);
      const right = normalizeAspect(b.width, b.height);
      return (
        left !== null &&
        right !== null &&
        Math.abs(left.width - right.width) <= ASPECT_TOLERANCE &&
        Math.abs(left.height - right.height) <= ASPECT_TOLERANCE
      );
    }
    case 'regular':
      return b.shape === 'regular' && a.sides === b.sides;
  }
}
