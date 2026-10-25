/**
 * What the Layer order dialog says when it has no session to show: each
 * refusal of an open by its code (E4, E5), and an engine that went away, as
 * the approved refusal frames word them (`Round4-States`, "Refusals"); and
 * why Apply could not save. Host-neutral: the same sentence in Edit, the
 * Diagram and Pose, and never an upstream's name.
 *
 * Copy only: `t` with literal keys, so the extractor sees every string.
 */
import type { TFunction } from 'i18next';
import type { FaceLetters } from '../../layer-order/engine/faceIndex';
import type { LayerRefusal } from '../../layer-order/engine/layerOrderEngine';
import type { LayerOrderSessionStatus } from '../../layer-order/dialog/useLayerOrderSession';

/** What the notice offers: Keep trying an open that ran out (a later deadline), Try again after a loss, or nothing. */
export type LayerOrderNoticeRetry = 'keep_trying' | 'try_again' | null;

export interface LayerOrderNotice {
  readonly text: string;
  readonly retry: LayerOrderNoticeRetry;
}

/** The notice in place of the folded pane and the inspector, or null while the session opens or is open. */
export function sessionNotice(
  t: TFunction,
  status: LayerOrderSessionStatus,
  letters: FaceLetters | null
): LayerOrderNotice | null {
  if (status.kind === 'lost') {
    return { text: t('dialogs:layerOrder.lost', 'Layer order stopped unexpectedly. Nothing was changed.'), retry: 'try_again' };
  }
  if (status.kind !== 'refused') return null;
  const { refusal } = status;
  if (refusal.code === 'session_timed_out') {
    return {
      text: t('dialogs:layerOrder.refused.timedOut', 'Couldn’t work out this figure’s layer orders in time.'),
      retry: 'keep_trying',
    };
  }
  return { text: refusalText(t, refusal, letters), retry: null };
}

function refusalText(t: TFunction, refusal: LayerRefusal, letters: FaceLetters | null): string {
  switch (refusal.code) {
    case 'source_non_convex_face': {
      const face = letters?.letterOf(refusal.face) ?? '';
      return face
        ? t(
            'dialogs:layerOrder.refused.nonConvexFace',
            'Face {{face}} isn’t convex. Layer order can’t work with non-convex faces yet.',
            { face }
          )
        : t(
            'dialogs:layerOrder.refused.nonConvex',
            'A face of this figure isn’t convex. Layer order can’t work with non-convex faces yet.'
          );
    }
    case 'source_digest_mismatch':
      return t(
        'dialogs:layerOrder.refused.digestMismatch',
        'Layer order couldn’t match its faces to the ones this figure was folded with, so it can’t open on it. Nothing was changed.'
      );
    case 'session_no_order':
      return t('dialogs:layerOrder.refused.noOrder', 'Layer order couldn’t be determined for this figure.');
    case 'source_ambiguous_overlap':
      return t(
        'dialogs:layerOrder.refused.ambiguousOverlap',
        'Some of this figure’s faces overlap too closely to tell which covers which, so Layer order can’t open on it. Nothing was changed.'
      );
    case 'source_tolerance':
      return t(
        'dialogs:layerOrder.refused.tolerance',
        'Some of this figure’s faces or creases are too small or too close together for Layer order to work with. Nothing was changed.'
      );
    case 'source_stacked_too_deep':
      return t(
        'dialogs:layerOrder.refused.tooDeep',
        'This figure stacks too many layers in one place for Layer order to work with yet. Nothing was changed.'
      );
    case 'source_too_many_faces':
      return t(
        'dialogs:layerOrder.refused.tooManyFaces',
        'This figure has {{faces}} faces, more than the {{limit}} Layer order can work with. Nothing was changed.',
        { faces: refusal.face_count, limit: refusal.limit }
      );
    case 'source_no_faces':
      return t('dialogs:layerOrder.refused.noFaces', 'This figure has no faces to put in order.');
    case 'record_newer':
      return t(
        'dialogs:layerOrder.refused.recordNewer',
        'This figure’s constraints were saved by a newer version of Ori Studio. Update Ori Studio to change them.'
      );
    case 'record_over_budget':
      return t(
        'dialogs:layerOrder.refused.recordTooLarge',
        'This figure’s saved constraints are too large to open. Nothing was changed.'
      );
    case 'record_damaged':
    case 'session_bad_record':
      return t(
        'dialogs:layerOrder.refused.recordUnreadable',
        'This figure’s saved constraints couldn’t be read, so Layer order can’t open on them. Nothing was changed.'
      );
    case 'source_kernel':
    case 'source_same_parity':
    case 'session_timed_out':
      return t(
        'dialogs:layerOrder.refused.unreadable',
        'Layer order couldn’t read how this figure folds, so it can’t open on it. Nothing was changed.'
      );
  }
}

/** Why Apply could not save: its record is over the budget, or the save refused for another reason. */
export function applyRefusalText(t: TFunction, refusal: LayerRefusal): string {
  return refusal.code === 'record_over_budget'
    ? t('dialogs:layerOrder.applyRefused.tooLarge', 'This layer order is too large to save with the figure.')
    : t('dialogs:layerOrder.applyRefused.other', 'Couldn’t save this layer order. Nothing was changed.');
}
