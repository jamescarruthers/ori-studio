/**
 * The pure queries every Fold surface asks of a landed state, one function
 * each, so the session asks the engine once per state however many surfaces
 * want the answer (`FoldSession.query`): the canvas and the step playback
 * read the same scene, the strip builds its frames from it, and the Step pane
 * and the tool's preview read the same step summary — a committed preview's
 * answers are the committed step's.
 */
import { isFoldParentReleased, type FoldActionGeometry, type FoldScene, type FoldStepSummarised } from '../engine/foldEngineWire';
import type { FoldStateCall } from './foldSession';

/** The state's scene. */
export const FOLD_SCENE_QUERY: FoldStateCall<FoldScene> = (engine, state) => engine.scene(state);

/**
 * The engine's summary of the step that landed a state: its counts, its diff
 * and its layers (plan D14). None when refused, or when the state's parent is
 * no longer held: a surface shows what it knows without it.
 */
export const FOLD_STEP_SUMMARY_QUERY: FoldStateCall<FoldStepSummarised> = async (engine, state) => {
  try {
    const answer = await engine.stepSummary(state);
    return answer.status === 'ok' ? { summary: answer.summary } : { summary: null };
  } catch (error) {
    if (isFoldParentReleased(error)) return { summary: null };
    throw error;
  }
};

/**
 * The picture of the step that landed a state, on its parent, wrapped so an
 * answer of "none" (a turn, a rotation, an import) is told from no answer
 * yet. A fold whose parent is no longer held has none either, and its motion
 * crossfades.
 */
export const FOLD_STEP_ACTION_QUERY: FoldStateCall<{ action: FoldActionGeometry | null }> = async (engine, state) => {
  try {
    const acted = await engine.stepAction(state);
    return { action: acted.status === 'ok' ? acted.action : null };
  } catch (error) {
    if (isFoldParentReleased(error)) return { action: null };
    throw error;
  }
};
