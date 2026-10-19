import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { type CpSegment, resolveCpSegments } from '../../lib/creasePatternSegmentation';
import { ensureCpSheetArtifacts } from '../sheets/cpSheetArtifacts';
import { ensureCpSheetIndex, peekCpSheetIndex } from '../sheets/cpSheetIndex';
import { resolveSelectedSheet } from '../sheets/selectedSheet';

/** A sheet as the region an inline simulation is built from. */
export interface SelectedSegmentMatch {
  /** The sheet's one segment, from its own faces (`ensureCpSheetArtifacts`). */
  segment: CpSegment;
  /** The sheet's id: its place in the sheet index. */
  segmentId: number;
  /** The 1-based `line_segments` ids of every line on the sheet. */
  cpLineIds: number[];
}

/**
 * The sheet a set of crease ids makes up exactly, as the region a simulation is
 * built from, or `null` when they span more than one sheet, leave part of one
 * unselected, or include a line inside no sheet.
 *
 * A simulation is always of a *region* — the simulation fold is built from a
 * segment's faces, so it needs a closed piece of paper — and every caller that
 * wants to open one has to answer this question first. Shared rather than
 * duplicated because the two callers reach it from opposite directions: the
 * selection toolbar and `Shift+S` ask about the live selection, while the
 * non-flat fold dialog asks about the ids the fold was already scoped to, which
 * by then may no longer be selected.
 *
 * Takes ids rather than a whole selection for that second caller: only `lines`
 * participates in the match, and a caller holding a captured id list should not
 * have to fabricate the rest of a selection to ask.
 *
 * The match is the sheet index's, and only that sheet's faces are built (see
 * `ensureCpSheetArtifacts`): tens of milliseconds, however many sheets the
 * canvas holds. The segment is the whole sheet, its id the sheet's position.
 */
export async function resolveInlineSimulationRegion(
  document: OristudioCpDocumentSnapshot | null | undefined,
  lineIds: readonly number[]
): Promise<SelectedSegmentMatch | null> {
  if (!document || lineIds.length === 0) return null;
  const index = peekCpSheetIndex(document) ?? (await ensureCpSheetIndex(document));
  const selected = resolveSelectedSheet(index, lineIds);
  if (!selected) return null;
  const [segment] = resolveCpSegments(await ensureCpSheetArtifacts(document, selected.sheet));
  if (!segment) return null;
  return { segment, segmentId: selected.sheet, cpLineIds: [...selected.cpLineIds] };
}
