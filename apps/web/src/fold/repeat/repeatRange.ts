/**
 * What the Repeat tool repeats, and across which axis (plan
 * `fold-sequence-tools`): the range — from a step the folder chooses through
 * the step on screen — the state before it, which its symmetry axes are found
 * on, which of those axes is taken, and which a drawn line is.
 *
 * Pure.
 */
import { lineThrough, modelLineOf, toPoint } from '../canvas/foldCanvasGeometry';
import type { FoldPick } from '../canvas/foldPicking';
import type { FoldModelLine } from '../document/foldSequenceDocument';
import type { FoldIsometry } from '../engine/foldEngineWire';
import type { FoldPathEntry } from '../sequence/foldSequencePath';
import { REPEAT_TOL, type RepeatSymmetry } from './repeatGeometry';

export interface RepeatRange {
  /**
   * The steps the range may start with, in path order: each step from the
   * first through the one on screen whose state, and whose parent's, have
   * landed — the only starts a repeat can be prepared from.
   */
  starts: readonly FoldPathEntry[];
  /** The range's first step. */
  first: FoldPathEntry;
  /** Its index in the path. */
  start: number;
  /** The state before the range — the flat sheet, or a step — on which its axes are found. */
  baseline: FoldPathEntry;
  /** How many operations the range holds, the step on screen's included. */
  count: number;
}

/**
 * The range from `chosen` — while it is one of the starts — or else from the
 * step on screen, through the step on screen; null at the flat sheet, and
 * while the step on screen has not landed.
 */
export function repeatRange(entries: readonly FoldPathEntry[], cursor: number, chosen: string | null): RepeatRange | null {
  if (cursor < 1 || cursor >= entries.length) return null;
  const starts = entries.slice(1, cursor + 1).filter((entry, k) => entry.session.state !== null && entries[k]!.session.state !== null);
  const here = entries[cursor]!;
  const first = starts.find((entry) => entry.id === chosen) ?? (starts.includes(here) ? here : null);
  if (!first) return null;
  const start = entries.indexOf(first);
  return { starts, first, start, baseline: entries[start - 1]!, count: cursor - start + 1 };
}

/** Two lines alike, whichever way each is written: Repeat's tolerance on its normal and offset. */
export function sameRepeatLine(a: FoldModelLine, b: FoldModelLine): boolean {
  const sign = a.n[0] * b.n[0] + a.n[1] * b.n[1] >= 0 ? 1 : -1;
  return (
    Math.hypot(a.n[0] - sign * b.n[0], a.n[1] - sign * b.n[1]) < REPEAT_TOL &&
    Math.abs(a.d - sign * b.d) < REPEAT_TOL
  );
}

/**
 * The axis Repeat takes among the range's verified axes: the one the folder
 * last chose or drew (`remembered`, its sheet line) while the range has it,
 * else the first; -1 when there is none. A remembered axis the range lacks
 * is not forgotten: the next range that has it takes it again.
 */
export function repeatAxisIndex(axes: readonly RepeatSymmetry[], remembered: FoldModelLine | null): number {
  const known = remembered ? axes.findIndex((axis) => sameRepeatLine(axis.sheet, remembered)) : -1;
  return known >= 0 ? known : axes.length > 0 ? 0 : -1;
}

/**
 * A line drawn on the model as the canvas shows it — the step on screen, or
 * the repeat it previews: on the folded pane, taken into the model's frame,
 * where the axes run as `model` says (the view turns the model, not the
 * paper's place in it); on the crease pattern, on the sheet, where they run
 * as `sheet` says.
 */
export interface RepeatDrawnLine {
  line: FoldModelLine;
  frame: 'model' | 'sheet';
}

/**
 * The drawn line's two ends — both on the crease pattern, or else as the
 * folded pane places them, under `viewTransform`, the view of the state they
 * were drawn on — as a line.
 */
export function repeatDrawnLine(picks: readonly FoldPick[], viewTransform: FoldIsometry | null): RepeatDrawnLine | null {
  const [p, q] = picks;
  if (picks.length !== 2 || p?.kind !== 'free' || q?.kind !== 'free') return null;
  if (p.pane === 'crease-pattern' && q.pane === 'crease-pattern' && p.sheet && q.sheet) {
    const line = lineThrough(toPoint(p.sheet), toPoint(q.sheet));
    return line ? { line, frame: 'sheet' } : null;
  }
  const line = viewTransform ? lineThrough(p.scene, q.scene) : null;
  return line && viewTransform ? { line: modelLineOf(viewTransform, line), frame: 'model' } : null;
}

const lineIn = (axis: RepeatSymmetry, frame: RepeatDrawnLine['frame']) => (frame === 'sheet' ? axis.sheet : axis.model);

/** The verified axis a drawn line is, within Repeat's tolerance; -1 for none. */
export function drawnRepeatAxis(axes: readonly RepeatSymmetry[], drawn: RepeatDrawnLine): number {
  return axes.findIndex((axis) => sameRepeatLine(lineIn(axis, drawn.frame), drawn.line));
}

/** How far off a drawn line may be, in degrees and as a share of the paper's span, for its nearest axis to be offered. */
const NEAR_DEGREES = 4;
const NEAR_SHARE = 0.04;

/**
 * The verified axis nearest a drawn line that is none of them, when one is
 * near enough to be what the folder meant — within a few degrees and a few
 * hundredths of the paper's span (`span`, in sheet units, which the scene
 * shares) — offered to take in its place, never taken for it; -1 when none is.
 */
export function nearestRepeatAxis(axes: readonly RepeatSymmetry[], drawn: RepeatDrawnLine, span: number): number {
  let best = -1;
  let score = Infinity;
  for (const [k, axis] of axes.entries()) {
    const line = lineIn(axis, drawn.frame);
    const dot = line.n[0] * drawn.line.n[0] + line.n[1] * drawn.line.n[1];
    const sign = dot >= 0 ? 1 : -1;
    const degrees = (Math.acos(Math.min(1, Math.abs(dot))) * 180) / Math.PI;
    const offset = Math.abs(line.d - sign * drawn.line.d) / Math.max(span, REPEAT_TOL);
    if (degrees > NEAR_DEGREES || offset > NEAR_SHARE) continue;
    const off = degrees / NEAR_DEGREES + offset / NEAR_SHARE;
    if (off < score) {
      best = k;
      score = off;
    }
  }
  return best;
}
