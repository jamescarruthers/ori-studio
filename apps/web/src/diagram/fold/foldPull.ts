/**
 * Steps pulled from a Fold sequence into the Diagram (plan D17), as the
 * References browser pulls a plan's cards (D20): the shown sequence's active
 * path as cards, and what each adds.
 *
 * - **A fold** becomes a step showing the state before it, folded, its line
 *   and arrow as the step's marks, its sentence as the step's words — as a
 *   References card shows its step.
 * - **A turn or a rotation** becomes a turn between steps (D22), as a
 *   References turn-over card does.
 * - **Finished**, after the last fold, is the state the path ends at, with no
 *   words of Fold's: as References' Finished card ends a plan.
 *
 * Every picture is captured from the Fold session's replay
 * (`captureFoldStep`); nothing is folded here.
 *
 * React-free and store-free: the session is injected.
 */

import type { TFunction } from 'i18next';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import { isLockedStep, turnKindOf, type FoldSequenceDocument } from '../../fold/document/foldSequenceDocument';
import { foldStateSpread } from '../../fold/document/foldStepSpread';
import type { FoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import type { FoldSession } from '../../fold/session/foldSession';
import { foldStepSentence } from '../../fold/stepSentence';
import type { TurnKind } from '../../lib/steps/turn';
import { turnName } from '../../lib/steps/turnWords';
import {
  randomDiagramId,
  type DiagramCpRender,
  type DiagramFoldMoment,
  type DiagramIdFactory,
  type SentDiagramEntry,
  type SentFoldStep,
} from '../document/diagramDocument';
import type { PullCard } from '../references/referencesBrowserSelection';
import { captureFoldStep } from './foldStepCapture';

/** What pulling a Fold card adds: a step at a moment, or a turn between steps. */
export type FoldPullTarget =
  | { readonly kind: 'step'; readonly step: string; readonly moment: DiagramFoldMoment }
  | { readonly kind: 'turn'; readonly turn: TurnKind };

/** A card of the Fold browser: a step of the active path, a turn, or Finished. */
export interface FoldBrowserCard extends PullCard<FoldPullTarget> {
  /** The step's number on the path, as Fold numbers it; null for a turn or Finished. */
  readonly number: number | null;
  /** The step's words, or the turn's. */
  readonly sentence: string;
  /** The state it lands, as Fold's strip draws it; null while it has not landed. */
  readonly picture: SheetThumbnail | null;
}

/** How a pulled Fold step is shown: folded, as Fold shows it, from the front at no turn. */
export const FOLD_PULL_RENDER: Extract<DiagramCpRender, { mode: 'folded-flat' }> = {
  mode: 'folded-flat',
  side: 'front',
  rotationDeg: 0,
  foldCase: 1,
};

/**
 * How a pulled Fold step is shown, its layers spread as Fold spreads the
 * state it shows (`foldStateSpread`): the state before the step is its
 * parent's picture, the state after it the step's own. None when Fold shows
 * it unspread, or the sequence is not the one given.
 */
export function foldPullRender(
  document: FoldSequenceDocument | null,
  sequence: string,
  target: Pick<Extract<FoldPullTarget, { kind: 'step' }>, 'step' | 'moment'>
): DiagramCpRender {
  const spread = document?.id === sequence ? foldStateSpread(document, target.step, target.moment) : null;
  return spread ? { ...FOLD_PULL_RENDER, spread } : FOLD_PULL_RENDER;
}

/** Whether a path entry's state has landed, so a capture can be drawn from it. */
function landed(entry: FoldSequenceView['entries'][number]): boolean {
  return entry.session.state !== null && (entry.status === 'ok' || entry.status === 'changed');
}

/**
 * The cards of the sequence's active path, in order: every step after the
 * sheet, a turn or rotation as a turn card, and Finished after the last when
 * the path folds at all. A step that has not landed — still replaying,
 * broken, a newer build's — is listed, and cannot be added.
 */
export function foldBrowserCards(
  t: TFunction,
  { entries, frames, words }: Pick<FoldSequenceView, 'entries' | 'frames' | 'words'>
): FoldBrowserCard[] {
  const cards: FoldBrowserCard[] = [];
  entries.forEach((entry, index) => {
    const node = entry.node;
    if (!node || entry.id === null) return;
    const picture = frames[index]?.form ?? null;
    if (entry.kind === 'turn' && !isLockedStep(node) && (node.op.kind === 'turn' || node.op.kind === 'rotate')) {
      const turn = turnKindOf(node.op);
      cards.push({
        index: cards.length,
        kind: 'turn-over',
        number: null,
        sentence: turnName(turn, t),
        picture,
        step: landed(entry) ? { kind: 'turn', turn } : null,
      });
      return;
    }
    cards.push({
      index: cards.length,
      kind: 'fold',
      number: entry.number,
      sentence: foldStepSentence(t, words[index] ?? { op: 'unknown' }),
      picture,
      step: landed(entry) ? { kind: 'step', step: entry.id, moment: 'before' } : null,
    });
  });
  const tip = entries.at(-1);
  if (tip && tip.id !== null && entries.some((entry) => entry.kind === 'fold')) {
    cards.push({
      index: cards.length,
      kind: 'done',
      number: null,
      sentence: t('panels:diagram.fold.finishedSentence', 'The model as the steps leave it.'),
      picture: frames.at(-1)?.form ?? null,
      step: landed(tip) ? { kind: 'step', step: tip.id, moment: 'after' } : null,
    });
  }
  return cards;
}

/** What a pull of Fold targets came to: the entries to add, and how many steps could not be captured. */
export interface FoldPulled {
  sent: SentDiagramEntry[];
  /** Steps that could not be captured (gone, no longer folding, the engine stopped), left out. */
  failed: number;
}

/**
 * What pulling `targets` adds, in order: each step captured from the
 * session's replay folded, as Fold shows it, spread as Fold spreads it
 * ({@link foldPullRender}) — its marks lifted, its words Fold's — and each
 * turn as a turn. A step whose capture fails is left out
 * and counted; so is one too detailed to keep as a drawing, which a pull
 * has no bitmap for.
 */
export async function pullFoldTargets(
  session: FoldSession,
  sequence: string,
  targets: readonly FoldPullTarget[],
  { t, newId = randomDiagramId }: { t: TFunction; newId?: DiagramIdFactory }
): Promise<FoldPulled> {
  const sent: SentDiagramEntry[] = [];
  let failed = 0;
  // Held across every capture, so the engine is not started and stopped once a step.
  const release = session.retain();
  try {
    for (const target of targets) {
      if (target.kind === 'turn') {
        sent.push(target.turn);
        continue;
      }
      const render = foldPullRender(session.store.getState().sequence, sequence, target);
      const result = await captureFoldStep(
        session,
        { sequence, step: target.step, moment: target.moment, render },
        { t, newId }
      );
      if (result.status !== 'captured' || result.captured.kind !== 'picture' || result.captured.picture.kind !== 'scene') {
        failed += 1;
        continue;
      }
      const picture = result.captured.picture;
      const step: SentFoldStep = {
        source: result.source,
        picture,
        lifted: { picture, annotations: result.marks },
        text: result.source.sentence ?? '',
      };
      sent.push(step);
    }
  } finally {
    release();
  }
  return { sent, failed };
}
