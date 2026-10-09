/**
 * A Diagram step's picture, captured from a step of a Fold sequence (plan
 * D17): the Fold session is held while it works — so it runs from the
 * Diagram with no Fold surface open — the step and the state it folds from
 * are waited for as the session replays them, the engine is asked what they
 * are, and the picture, its marks and its source are made from the answers
 * (`foldStepPicture`).
 *
 * Never folds anything itself: what a step lands is the session's replay of
 * the sequence, cached by its path, so a capture asks the engine only about
 * states it has landed. The session is injected, so this is tested over a
 * fake one; the app binds it in `foldStepActions.ts`.
 *
 * React-free and store-free.
 */

import type { TFunction } from 'i18next';
import { foldStepReady } from '../../fold/io/foldSessionWaits';
import { foldNodeSentenceStep } from '../../fold/sequence/foldSentenceStep';
import { foldStateFrame } from '../../fold/sequence/foldStateFrame';
import type { FoldSession } from '../../fold/session/foldSession';
import { foldStepSentence } from '../../fold/stepSentence';
import { xmlText } from '../../lib/xmlEscape';
import type { CapturedPicture } from '../capture/captureFolded';
import {
  randomDiagramId,
  type DiagramCpRender,
  type DiagramFoldMoment,
  type DiagramFoldStepSource,
  type DiagramIdFactory,
  type KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { storedFoldStepSource } from '../document/diagramFile';
import { foldStepPicture } from './foldStepPicture';

/** Which Fold step a picture is captured from, at which moment, in which pose. */
export interface FoldStepCaptureRequest {
  sequence: string;
  step: string;
  moment: DiagramFoldMoment;
  /** A crease pattern, or a flat fold at `foldCase` 1. */
  render: DiagramCpRender;
}

export type FoldStepCaptureResult =
  | {
      status: 'captured';
      /** The step's source as captured: its digests, thumbnail, render and sentence. */
      source: DiagramFoldStepSource;
      captured: CapturedPicture;
      /** The fold's line and arrow, tagged as the source's; empty when it brings none. */
      marks: KnownDiagramAnnotation[];
    }
  /** The step is gone from the sequence, or no longer folds. */
  | { status: 'missing' }
  /**
   * Fold cannot say: the sequence is not the one it shows (one is shown, plan
   * D7), a newer build made the step, or the engine could not be reached.
   */
  | { status: 'unknown'; why: 'not-shown' | 'locked' | 'unavailable' };

/**
 * The step's sentence, as Fold words it in its strip: from the states either
 * side of it and what the fold did. Absent for the state after the step,
 * whose words are the author's (the Finished step a pull ends with).
 */
function sentenceOf(
  t: TFunction,
  moment: DiagramFoldMoment,
  words: Parameters<typeof foldStepSentence>[1]
): string | undefined {
  return moment === 'before' ? xmlText(foldStepSentence(t, words)) : undefined;
}

/** Capture a Diagram step's picture from a Fold step, start to finish. */
export async function captureFoldStep(
  session: FoldSession,
  request: FoldStepCaptureRequest,
  { t, newId = randomDiagramId }: { t: TFunction; newId?: DiagramIdFactory }
): Promise<FoldStepCaptureResult> {
  const release = session.retain();
  try {
    const ready = await foldStepReady(session, request.sequence, request.step);
    if (ready.status !== 'ready') {
      switch (ready.reason) {
        case 'missing':
        case 'broken':
          return { status: 'missing' };
        case 'not-shown':
          return { status: 'unknown', why: 'not-shown' };
        case 'locked':
          return { status: 'unknown', why: 'locked' };
        case 'not-live':
          return { status: 'unknown', why: 'unavailable' };
      }
    }
    const own = await session.withState(ready.state, async (engine, id) => {
      const [scene, summary, acted, engineVersion] = await Promise.all([
        engine.scene(id),
        engine.summary(id),
        engine.stepAction(id),
        engine.engineVersion(),
      ]);
      return { scene, summary, action: acted.status === 'ok' ? acted.action : null, engineVersion };
    });
    const parent = await session.withState(ready.parentState, (engine, id) => engine.scene(id));
    if (own.status !== 'answered' || parent.status !== 'answered') return { status: 'unknown', why: 'unavailable' };
    const { scene, summary, action, engineVersion } = own.value;
    const shown = request.moment === 'after' ? scene : parent.value;
    const node = session.store.getState().sequence?.steps.find((step) => step.id === request.step);
    if (!node) return { status: 'missing' };
    const picture = foldStepPicture(
      {
        shown,
        own: { scene, step: summary.step, sheet: summary.sheet },
        moment: request.moment,
        action: request.moment === 'before' ? action : null,
      },
      request.render,
      newId
    );
    const sentence = sentenceOf(
      t,
      request.moment,
      foldNodeSentenceStep(node, {
        parent: foldStateFrame(parent.value),
        child: foldStateFrame(scene),
        report: ready.report,
      })
    );
    const source = storedFoldStepSource({
      kind: 'fold-step',
      sequence: request.sequence,
      step: request.step,
      moment: request.moment,
      path: ready.path,
      state: request.moment === 'after' ? ready.fingerprint : ready.parentFingerprint,
      engine: engineVersion,
      thumbnail: picture.thumbnail,
      render: request.render,
      ...(sentence !== undefined ? { sentence } : {}),
    });
    if (!source) throw new Error('The capture made a link the file cannot read');
    return { status: 'captured', source, captured: picture.captured, marks: picture.marks };
  } finally {
    release();
  }
}
