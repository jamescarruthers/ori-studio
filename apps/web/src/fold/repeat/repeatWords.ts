import type { TFunction } from 'i18next';
import type { FoldModelLine, FoldOpKind } from '../document/foldSequenceDocument';
import { FOLD_VERTEX_OP_KINDS } from '../document/foldSequenceDocument';
import type { FoldRefusalBody } from '../engine/foldEngineWire';
import type { FoldSinkToolId } from '../tools/foldToolCatalog';
import { foldRefusalWords, type FoldRefusalContext } from '../tools/refusalNotice';

/**
 * Why a repeat stopped: Repeat's own code, or the engine's refusal of a
 * source step's mirror — its code, the refusal itself and the kind of step
 * it was, when the engine said. The code is analytics' (`fold refused`); the
 * words never show it.
 */
export interface RepeatStop {
  code: string;
  refusal?: FoldRefusalBody;
  op?: FoldOpKind;
}

/** How near a named direction an axis is, in degrees, to be called by it. */
const AXIS_TOLERANCE_DEG = 0.01;

/**
 * A symmetry axis by the way it runs on screen (its `display` line, y up):
 * vertical, horizontal, the rising or the falling diagonal, or else its angle
 * from the horizontal, counter-clockwise. A shape's axes all cross its
 * middle, so no two run the same way and each name is the one axis.
 */
export function repeatAxisName(t: TFunction, line: FoldModelLine): string {
  // The line runs along (−n.y, n.x); its angle is taken modulo a half turn.
  const raw = (Math.atan2(line.n[0], -line.n[1]) * 180) / Math.PI;
  const angle = ((raw % 180) + 180) % 180;
  const near = (target: number) => Math.abs(angle - target) <= AXIS_TOLERANCE_DEG || Math.abs(angle - target - 180) <= AXIS_TOLERANCE_DEG;
  if (near(90)) return t('panels:fold.repeat.axisVertical', 'Vertical axis');
  if (near(0)) return t('panels:fold.repeat.axisHorizontal', 'Horizontal axis');
  if (near(45)) return t('panels:fold.repeat.axisRising', 'Rising diagonal');
  if (near(135)) return t('panels:fold.repeat.axisFalling', 'Falling diagonal');
  return t('panels:fold.repeat.axisAngle', 'Axis at {{degrees}}°', { degrees: Math.round(angle) });
}

/** What a refused step's words are read against: the fold family of the step whose mirror was refused. */
function refusalKindOf(op: FoldOpKind | undefined): Pick<FoldRefusalContext, 'kind' | 'sink'> {
  switch (op) {
    case 'mountain':
    case 'precrease':
    case 'pleat':
    case 'crimp':
    case 'tuck':
      return { kind: op };
    case 'inside-reverse':
    case 'outside-reverse':
      return { kind: 'reverse' };
    case 'open-sink':
    case 'closed-sink':
    case 'unsink':
      return { kind: 'sink', sink: { tool: op satisfies FoldSinkToolId } };
    default:
      return (FOLD_VERTEX_OP_KINDS as readonly string[]).includes(op ?? '') ? { kind: 'vertex' } : { kind: 'valley' };
  }
}

/**
 * Why a repeat stopped, in a sentence: Repeat's own reasons in its words, and
 * a source step's mirror the engine refused in the words the tool window
 * says that refusal in (`foldRefusalWords`).
 */
export function repeatFailure(t: TFunction, stop: RepeatStop): string {
  switch (stop.code) {
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
      return stop.refusal
        ? foldRefusalWords(t, stop.refusal, refusalKindOf(stop.op)).text
        : t('panels:fold.repeat.refusedPlain', 'The mirrored operation cannot be folded. No steps were added.');
  }
}
