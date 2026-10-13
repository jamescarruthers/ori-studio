/**
 * A flow page's packed arrangement as it is kept
 * (`implementation-plans/diagram-flow-packing.md`, Decision 1): its numbers
 * rounded, two compared, and the file's `pageArrangements` read and written.
 *
 * Apart from the document's model, as `placeValues.ts` is, so that the model
 * can compare arrangements without a cycle: nothing here imports its values.
 * Which arrangement a page holds, and when one goes, is the pages' to say
 * (`pages/pageArrangements.ts`).
 *
 * Pure, React-free and store-free.
 */
import type { DiagramArrangedStep, DiagramPageArrangement, DiagramPlaceScale } from './diagramDocument';
import { FLOW_BANDS_RANGE } from './pageRanges';
import { placeScale } from './placeValues';

/** The last band a step can be in: a page packs into five bands at most. */
const LAST_BAND = FLOW_BANDS_RANGE.max - 1;

/** A length to a hundredth of a mm, never a negative zero. */
function toHundredth(mm: number): number {
  const hundredths = Math.round(mm * 100);
  return hundredths === 0 ? 0 : hundredths / 100;
}

/** A scale to six significant digits. */
function toSixDigits(value: number): number {
  return Number(value.toPrecision(6));
}

/** A printed scale to six significant digits, in its own measure. */
function roundScale(scale: DiagramPlaceScale): DiagramPlaceScale {
  return 'mmPerUnit' in scale ? { mmPerUnit: toSixDigits(scale.mmPerUnit) } : { frameMm: toSixDigits(scale.frameMm) };
}

/**
 * An arrangement as it is kept: every length in mm to a hundredth (a box
 * never narrower or shorter than one), its page scale, each printed scale and
 * an enlarged step's Size to six significant digits, `bend` only where it
 * is true, and its packer as recorded. What the store
 * adopts, so a held page draws as it will after a save and a reload.
 */
export function roundPageArrangement(arrangement: DiagramPageArrangement): DiagramPageArrangement {
  const steps: Record<string, DiagramArrangedStep> = {};
  for (const [stepId, step] of Object.entries(arrangement.steps)) {
    const [x, y, w, h] = step.box;
    steps[stepId] = {
      box: [toHundredth(x), toHundredth(y), Math.max(0.01, toHundredth(w)), Math.max(0.01, toHundredth(h))],
      scale: roundScale(step.scale),
      band: step.band,
      ...(step.bend ? { bend: true as const } : {}),
      ...(step.zoomScale !== undefined ? { zoomScale: toSixDigits(step.zoomScale) } : {}),
    };
  }
  return {
    signature: arrangement.signature,
    ...(arrangement.packer !== undefined ? { packer: arrangement.packer } : {}),
    k: toSixDigits(arrangement.k),
    steps,
  };
}

/** Whether two arrangements, or their absence, say the same, field for field. */
export function samePageArrangement(
  a: DiagramPageArrangement | undefined,
  b: DiagramPageArrangement | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b || a.signature !== b.signature || a.packer !== b.packer || a.k !== b.k) return false;
  const ids = Object.keys(a.steps);
  return ids.length === Object.keys(b.steps).length && ids.every((id) => Object.hasOwn(b.steps, id) && sameArrangedStep(a.steps[id]!, b.steps[id]!));
}

function sameArrangedStep(a: DiagramArrangedStep, b: DiagramArrangedStep): boolean {
  return (
    a.box.every((value, index) => value === b.box[index]) &&
    a.band === b.band &&
    Boolean(a.bend) === Boolean(b.bend) &&
    a.zoomScale === b.zoomScale &&
    ('mmPerUnit' in a.scale
      ? 'mmPerUnit' in b.scale && a.scale.mmPerUnit === b.scale.mmPerUnit
      : 'frameMm' in b.scale && a.scale.frameMm === b.scale.frameMm)
  );
}

/** Whether two sets of arrangements, by page, say the same. */
export function samePageArrangements(
  a: Readonly<Record<string, DiagramPageArrangement>> | undefined,
  b: Readonly<Record<string, DiagramPageArrangement>> | undefined
): boolean {
  if (a === b) return true;
  const keys = Object.keys(a ?? {});
  return (
    keys.length === Object.keys(b ?? {}).length &&
    keys.every((key) => b !== undefined && Object.hasOwn(b, key) && samePageArrangement(a![key], b[key]))
  );
}

/** An arrangement written by a newer build: a field or a value this build has no name for. Carried as it came. */
export const NEWER_ARRANGEMENT: unique symbol = Symbol('newer arrangement');

const ARRANGEMENT_KEYS: ReadonlySet<string> = new Set(['signature', 'packer', 'k', 'steps']);
const ARRANGED_STEP_KEYS: ReadonlySet<string> = new Set(['box', 'scale', 'band', 'bend', 'zoomScale']);
const SCALE_KEYS: ReadonlySet<string> = new Set(['mmPerUnit', 'frameMm']);

/**
 * One page's stored arrangement. A field this build has no name for, at any
 * depth — a step's scale in another measure among them — or a band past the
 * five a page packs into, is a newer build's ({@link NEWER_ARRANGEMENT}),
 * whatever else it holds. Otherwise anything that does not read is damage,
 * and the whole arrangement is: a page cannot be held with a step it does
 * not know the place of. All but its packer, which says only what packed
 * it and never whether it holds: any string is kept as it came, and anything
 * else is let go alone, the page still held. Read as it came, unrounded, so a
 * file is written back as it was read.
 */
export function readPageArrangement(value: unknown): DiagramPageArrangement | typeof NEWER_ARRANGEMENT | null {
  if (!isRecord(value)) return null;
  let newer = hasNewerKey(value, ARRANGEMENT_KEYS);
  let damaged = typeof value.signature !== 'string' || !isPositive(value.k) || !isRecord(value.steps);
  const steps: Record<string, DiagramArrangedStep> = {};
  for (const [stepId, entry] of Object.entries(isRecord(value.steps) ? value.steps : {})) {
    const step = readArrangedStep(entry);
    if (step === NEWER_ARRANGEMENT) newer = true;
    else if (step === null) damaged = true;
    else steps[stepId] = step;
  }
  if (newer) return NEWER_ARRANGEMENT;
  if (damaged) return null;
  return {
    signature: value.signature as string,
    ...(typeof value.packer === 'string' ? { packer: value.packer } : {}),
    k: value.k as number,
    steps,
  };
}

/**
 * One step's place: a box of four finite numbers, its width and height above
 * zero; a printed scale as a pin keeps one; a whole band from 0, past the last
 * a newer build's; `bend` true, or false or unsaid for none; and an enlarged
 * step's Size as packed, a number above zero, or unsaid for Fill.
 */
function readArrangedStep(value: unknown): DiagramArrangedStep | typeof NEWER_ARRANGEMENT | null {
  if (!isRecord(value)) return null;
  const { box, scale, band, bend, zoomScale } = value;
  if (hasNewerKey(value, ARRANGED_STEP_KEYS) || (isRecord(scale) && hasNewerKey(scale, SCALE_KEYS))) return NEWER_ARRANGEMENT;
  if (typeof band === 'number' && Number.isInteger(band) && band > LAST_BAND) return NEWER_ARRANGEMENT;
  const read = placeScale(scale);
  if (!isBox(box) || !read || typeof band !== 'number' || !Number.isInteger(band) || band < 0) return null;
  if (bend !== undefined && typeof bend !== 'boolean') return null;
  if (zoomScale !== undefined && !isPositive(zoomScale)) return null;
  return {
    box: [box[0], box[1], box[2], box[3]],
    scale: read,
    band,
    ...(bend ? { bend: true as const } : {}),
    ...(zoomScale !== undefined ? { zoomScale } : {}),
  };
}

/**
 * The file's `pageArrangements`: this build's, and a newer build's as they
 * came, each under its key. Malformed entries are dropped alone; anything but
 * a record holds none.
 */
export function readPageArrangements(value: unknown): {
  arrangements: Record<string, DiagramPageArrangement>;
  newer: Record<string, unknown>;
} {
  const arrangements: Record<string, DiagramPageArrangement> = {};
  const newer: Record<string, unknown> = {};
  for (const [firstStepId, entry] of Object.entries(isRecord(value) ? value : {})) {
    const read = readPageArrangement(entry);
    if (read === NEWER_ARRANGEMENT) newer[firstStepId] = entry;
    else if (read) arrangements[firstStepId] = read;
  }
  return { arrangements, newer };
}

/**
 * The file's `pageArrangements`: `arrangements`, with a newer build's carried
 * ones in the place of any of this build's under their keys, in the order of
 * their keys, each arrangement's steps in the order of theirs and its fields
 * in the order this build writes them, so a save writes them one way. None
 * when there is none to write.
 */
export function writePageArrangements(
  arrangements: Readonly<Record<string, DiagramPageArrangement>> | undefined,
  newer: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  const entries = new Map<string, unknown>(Object.entries(arrangements ?? {}).map(([key, arrangement]) => [key, writePageArrangement(arrangement)]));
  for (const [key, entry] of Object.entries(newer ?? {})) entries.set(key, entry);
  if (entries.size === 0) return undefined;
  return Object.fromEntries([...entries].sort(([a], [b]) => byKey(a, b)));
}

function writePageArrangement(arrangement: DiagramPageArrangement): Record<string, unknown> {
  const steps = Object.entries(arrangement.steps).sort(([a], [b]) => byKey(a, b));
  return {
    signature: arrangement.signature,
    ...(arrangement.packer !== undefined ? { packer: arrangement.packer } : {}),
    k: arrangement.k,
    steps: Object.fromEntries(
      steps.map(([stepId, step]) => [
        stepId,
        {
          box: [...step.box],
          scale: { ...step.scale },
          band: step.band,
          ...(step.bend ? { bend: true } : {}),
          ...(step.zoomScale !== undefined ? { zoomScale: step.zoomScale } : {}),
        },
      ])
    ),
  };
}

function byKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isBox(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((each) => typeof each === 'number' && Number.isFinite(each)) &&
    value[2] > 0 &&
    value[3] > 0
  );
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasNewerKey(value: Record<string, unknown>, known: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !known.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
