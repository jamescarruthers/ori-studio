import type { TFunction } from 'i18next';
export function repeatFailure(t: TFunction, code: string): string {
  switch (code) {
    case 'repeat_return_target':
      return t(
        'panels:fold.repeat.returnTarget',
        'This unfold returns to a step before the selected range. Include that part of the sequence in the repeat.',
      );
    case 'repeat_view_axis':
      return t(
        'panels:fold.repeat.viewAxis',
        'This range needs a turn-over about an oblique axis. Repeat the folds separately from that view change.',
      );
    case 'repeat_axis':
      return t(
        'panels:fold.repeat.noAxis',
        'This starting model has no verified matching pair of sides. Choose a different range.',
      );
    case 'repeat_unsupported':
      return t(
        'panels:fold.repeat.unsupported',
        'This range includes a Collapse or another Repeat that cannot yet be mirrored. Choose a range of fold operations.',
      );
    case 'repeat_limit':
    case 'repeat_order_limit':
      return t('panels:fold.repeat.limit', 'This repeat exceeds the search limit. Try a shorter range.');
    case 'repeat_order':
      return t(
        'panels:fold.repeat.orderConflict',
        'The original layer relationships cannot be preserved on the other side.',
      );
    case 'repeat_reference':
      return t(
        'panels:fold.repeat.reference',
        'A reference does not have a matching point on the other side.',
      );
    case 'repeat_extra_material':
    case 'repeat_material':
    case 'repeat_creases':
      return t(
        'panels:fold.repeat.materialConflict',
        'Repeating would change additional paper or creases. The two sides cannot be folded independently in this range.',
      );
    case 'repeat_unavailable':
      return t(
        'panels:fold.repeat.unavailable',
        'The source states are unavailable or changed. Wait for replay, then reopen Repeat.',
      );
    default:
      return t(
        'panels:fold.repeat.refused',
        'The mirrored operation was refused by the fold engine ({{code}}). No steps were added.',
        { code },
      );
  }
}
