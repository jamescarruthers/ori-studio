import { useFoldReturnUi } from '../return/foldReturnUi';
import { useMemo, useState } from 'react';
import { visibleMarks } from '../document/foldStepTree';
import { markPoints, type FoldMark, type FoldSequenceDocument } from '../document/foldSequenceDocument';
import type { FoldLandmarks, FoldScene, FoldStateSummary } from '../engine/foldEngineWire';
import type { FoldStateCall } from '../session/foldSession';
import type { FoldSessionNode } from '../session/foldSessionState';
import { FOLD_SCENE_QUERY } from '../session/foldStateQueries';
import { useFoldStateQuery, useFoldCursor, useFoldNodeQuery, useFoldSessionState } from '../session/useFoldSession';
import { foldPickIndex, type FoldMarkPoint, type FoldPickIndex } from './foldPicking';

/** What the canvas knows about the state on screen, from the engine and the document. */
export interface FoldStateView {
  /** The step on screen; null for the sheet. */
  cursorId: string | null;
  /**
   * The summary of the state the panes show: the step number, the counts,
   * the sheet's outline. While the step on screen loads, the last one shown
   * (see {@link FoldStateView.scene}).
   */
  summary: FoldStateSummary | null;
  /**
   * The scene the panes show. While the step on screen has yet to land, or
   * its scene is on its way, the last one shown stays up rather than leaving
   * the panes blank; null once the step on screen can have none (broken,
   * locked) and before anything was shown.
   */
  scene: FoldScene | null;
  landmarks: FoldLandmarks | null;
  /** The Divide-line marks a reader sees there (plan D6). */
  marks: readonly FoldMark[];
  /** Their points, as the landmark query takes them, each with its mark. */
  markPoints: readonly FoldMarkPoint[];
  /**
   * Everything a pointer move over either pane reads: null until the step
   * on screen's own scene is in, so nothing is located on the one before.
   */
  index: FoldPickIndex | null;
}

/** A state the panes can show: its scene and its summary, together. */
interface FoldPicture {
  scene: FoldScene;
  summary: FoldStateSummary;
}

const NO_MARKS: readonly FoldMark[] = [];

/** Every point each mark makes, with the mark it came from. */
export function foldMarkPoints(marks: readonly FoldMark[]): FoldMarkPoint[] {
  return marks.flatMap((mark) => markPoints(mark).map((at) => ({ at, mark: mark.id })));
}

/** The marks visible at the step on screen; empty before the first edit, when there is no sequence. */
export function foldMarksAt(sequence: FoldSequenceDocument | null, cursorId: string | null): readonly FoldMark[] {
  return sequence ? visibleMarks(sequence, cursorId) : NO_MARKS;
}

/** Whether the step on screen will have a picture once it loads: it is landing, or landed. */
const loading = (cursor: FoldSessionNode) => cursor.status !== 'broken' && cursor.status !== 'locked';

/**
 * The picture to show: the step on screen's own once it is in; while it
 * loads, the last one shown. Kept in state so it outlives the render that
 * showed it, and replaced only by a newer picture.
 */
function usePicture(fresh: FoldPicture | null, keep: boolean): FoldPicture | null {
  const [shown, setShown] = useState<FoldPicture | null>(fresh);
  if (fresh && (fresh.scene !== shown?.scene || fresh.summary !== shown.summary)) setShown(fresh);
  return fresh ?? (keep ? shown : null);
}

/**
 * The state on screen as the canvas reads it: its scene and landmarks from
 * the engine, asked once per state (and per set of marks), and the pick index
 * built from them once. Tier 1 of D14 reads only this.
 */
export function useFoldStateView(): FoldStateView {
  const cursor = useFoldCursor();
  const cursorId = useFoldSessionState((snapshot) => snapshot.cursor);
  const sequence = useFoldSessionState((snapshot) => snapshot.sequence);
  const marks = useMemo(() => foldMarksAt(sequence, cursorId), [sequence, cursorId]);
  const points = useMemo(() => foldMarkPoints(marks), [marks]);
  // The landmarks with the marks as point landmarks: a new call when the
  // marks change, the same call (and no new ask) while they stay.
  const pointsKey = points.map(({ at }) => `${at[0]},${at[1]}`).join(';');
  const landmarksQuery = useMemo<FoldStateCall<FoldLandmarks>>(
    () => (engine, state) => engine.landmarks(state, points.map(({ at }) => at)),
    // `points` is read through its key: an equal list must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointsKey]
  );
  const returning = useFoldReturnUi((s) => s.opening !== null);
  const pending = useFoldSessionState((s) => s.pending);
  const returned = returning && pending.status === 'landed' && pending.request.op.kind === 'unfold-to' ? pending : null;
  const scene = useFoldStateQuery(returned?.state ?? cursor.state, FOLD_SCENE_QUERY);
  const landmarks = useFoldNodeQuery(cursorId, landmarksQuery);
  const summary = returned?.summary ?? cursor.summary;
  const fresh = useMemo(() => (scene && summary ? { scene, summary } : null), [scene, summary]);
  const picture = usePicture(fresh, loading(cursor));
  const index = useMemo(() => (scene ? foldPickIndex(scene, landmarks, points) : null), [scene, landmarks, points]);
  return {
    cursorId,
    summary: picture?.summary ?? summary,
    scene: picture?.scene ?? null,
    landmarks,
    marks,
    markPoints: points,
    index: returning ? null : index,
  };
}
