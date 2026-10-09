import { useMemo } from 'react';
import { visibleMarks } from '../document/foldStepTree';
import { markPoints, type FoldMark, type FoldSequenceDocument } from '../document/foldSequenceDocument';
import type { FoldLandmarks, FoldScene, FoldStateSummary } from '../engine/foldEngineWire';
import type { FoldStateCall } from '../session/foldSession';
import { FOLD_SCENE_QUERY } from '../session/foldStateQueries';
import { useFoldCursor, useFoldNodeQuery, useFoldSessionState } from '../session/useFoldSession';
import { foldPickIndex, type FoldMarkPoint, type FoldPickIndex } from './foldPicking';

/** What the canvas knows about the state on screen, from the engine and the document. */
export interface FoldStateView {
  /** The step on screen; null for the sheet. */
  cursorId: string | null;
  /** Its summary, once it has landed: the step number, the counts, the sheet's outline. */
  summary: FoldStateSummary | null;
  scene: FoldScene | null;
  landmarks: FoldLandmarks | null;
  /** The Divide-line marks a reader sees there (plan D6). */
  marks: readonly FoldMark[];
  /** Their points, as the landmark query takes them, each with its mark. */
  markPoints: readonly FoldMarkPoint[];
  /** Everything a pointer move over either pane reads; null until the scene is in. */
  index: FoldPickIndex | null;
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
  const scene = useFoldNodeQuery(cursorId, FOLD_SCENE_QUERY);
  const landmarks = useFoldNodeQuery(cursorId, landmarksQuery);
  const index = useMemo(() => (scene ? foldPickIndex(scene, landmarks, points) : null), [scene, landmarks, points]);
  return { cursorId, summary: cursor.summary, scene, landmarks, marks, markPoints: points, index };
}
