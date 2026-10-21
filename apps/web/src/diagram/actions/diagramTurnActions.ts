import type { TFunction } from 'i18next';
import { rotateAmountLabel } from '../../cp-workspace/references/stepDiagramGeometry';
import { DEFAULT_ROTATION } from '../annotate/annotationModel';
import type { DiagramRotation, DiagramTurnKind } from '../document/diagramDocument';
import { isCustomRotation, withRotationAmount, withRotationDirection } from '../document/diagramRotation';
import type { DiagramStepAction, DiagramStepCommand } from './diagramActions';

/**
 * The verbs a turn between steps offers (D22), in the order its context menu
 * shows them: what it is — a turn-over or a rotation — and how it turns, then
 * moving it and deleting it. The step verbs' shape (`diagramActions.ts`), so
 * the menu draws them the same way; the Step pane shows what a turn is as
 * controls of its own, from the same labels (`turnLabels`).
 */
export type DiagramTurnActionId =
  | 'turn-over'
  | 'rotate'
  | 'axis-vertical'
  | 'axis-horizontal'
  | 'rotate-eighth'
  | 'rotate-quarter'
  | 'rotate-half'
  | 'rotate-custom'
  | 'rotate-cw'
  | 'rotate-ccw';

export interface DiagramTurnActionState {
  /** The turn; a newer build's (`unknown`) offers only its moves and Delete. */
  turn: DiagramTurnKind & { unknown?: unknown };
  /** Its 0-based place among the steps and turns, and how many there are. */
  index: number;
  count: number;
  readOnly: boolean;
}

export interface DiagramTurnActionDeps {
  t: TFunction;
  /** Make the turn this one. */
  set: (kind: DiagramTurnKind) => void;
  move: (direction: 'earlier' | 'later') => void;
  remove: () => void;
}

/** The words for what a turn is and how it turns: the menu's rows and the Step pane's controls. */
export function turnLabels(t: TFunction) {
  return {
    kind: {
      'turn-over': t('panels:diagram.turns.turnOver', 'Turn Over'),
      rotate: t('panels:diagram.turns.rotate', 'Rotate'),
    },
    axis: {
      vertical: t('panels:diagram.annotations.sideToSide', 'Side to Side'),
      horizontal: t('panels:diagram.annotations.topToBottom', 'Top to Bottom'),
    },
    amount: {
      eighth: t('panels:diagram.turns.eighth', '1/8 Turn'),
      quarter: t('panels:diagram.turns.quarter', '1/4 Turn'),
      half: t('panels:diagram.turns.half', '1/2 Turn'),
    },
    /** The Step pane's fourth Amount, an angle of the author's own, and its field. */
    custom: t('panels:diagram.turns.custom', 'Custom'),
    angle: t('panels:diagram.turns.angle', 'Angle'),
    direction: {
      cw: t('panels:diagram.annotations.clockwise', 'Clockwise'),
      ccw: t('panels:diagram.annotations.counterclockwise', 'Counterclockwise'),
    },
  } as const;
}

/** What a turn says it is, in a few words: "Turn over", "Rotate 1/4 turn clockwise", or "Rotate 135° clockwise". */
export function turnName(turn: DiagramTurnKind & { unknown?: unknown }, t: TFunction): string {
  if (turn.unknown !== undefined) return t('panels:diagram.turns.newer', 'Turn from a newer Ori Studio');
  if (turn.kind === 'turn-over') {
    return turn.axis === 'horizontal'
      ? t('panels:diagram.turns.turnOverTopToBottom', 'Turn over, top to bottom')
      : t('panels:diagram.turns.turnOverSideToSide', 'Turn over, side to side');
  }
  const { direction } = turn.rotate;
  if (isCustomRotation(turn.rotate)) {
    const angle = rotateAmountLabel(turn.rotate);
    return direction === 'cw'
      ? t('panels:diagram.turns.rotateAngleClockwise', 'Rotate {{angle}} clockwise', { angle })
      : t('panels:diagram.turns.rotateAngleCounterclockwise', 'Rotate {{angle}} counterclockwise', { angle });
  }
  const fraction = rotateAmountLabel(turn.rotate);
  return direction === 'cw'
    ? t('panels:diagram.turns.rotateClockwise', 'Rotate {{fraction}} turn clockwise', { fraction })
    : t('panels:diagram.turns.rotateCounterclockwise', 'Rotate {{fraction}} turn counterclockwise', { fraction });
}

/** The numbers of the steps either side of a turn; null at an end. */
export interface TurnBetween {
  before: number | null;
  after: number | null;
}

/**
 * A turn's name for assistive tech, which says where it is as well as what it
 * is: "Turn over, side to side, between steps 3 and 4". The grid's chip and
 * the Pages view's glyph both read it.
 */
export function turnLabel(turn: DiagramTurnKind & { unknown?: unknown }, between: TurnBetween, t: TFunction): string {
  const name = turnName(turn, t);
  const where =
    between.before !== null && between.after !== null
      ? t('panels:diagram.turns.between', 'between steps {{before}} and {{after}}', { ...between })
      : between.after !== null
        ? t('panels:diagram.turns.beforeFirst', 'before step {{after}}', { ...between })
        : between.before !== null
          ? t('panels:diagram.turns.afterLast', 'after step {{before}}', { ...between })
          : '';
  return where ? t('panels:diagram.turns.chipLabel', '{{name}}, {{where}}', { name, where }) : name;
}

/** Where a turn prints, as a line of its own: "Between steps 3 and 4", or before the first or after the last. */
export function turnPlace(between: TurnBetween, t: TFunction): string | null {
  if (between.before !== null && between.after !== null) {
    return t('panels:diagram.turns.betweenSteps', 'Between steps {{before}} and {{after}}', { ...between });
  }
  if (between.after !== null) return t('panels:diagram.turns.beforeStep', 'Before step {{after}}', { ...between });
  if (between.before !== null) return t('panels:diagram.turns.afterStep', 'After step {{before}}', { ...between });
  return null;
}

/**
 * A turn's card's words (D24): its title, where a step has its number, and
 * how it turns — "Turn over" and "Side to side", "Rotate" and "1/4 turn
 * clockwise" or "135° clockwise". A newer build's says only that it is one.
 */
export function turnCardWords(turn: DiagramTurnKind & { unknown?: unknown }, t: TFunction): { title: string; how: string } {
  if (turn.unknown !== undefined) {
    return { title: t('panels:diagram.turns.cardTurn', 'Turn'), how: turnName(turn, t) };
  }
  if (turn.kind === 'turn-over') {
    return {
      title: t('panels:diagram.turns.cardTurnOver', 'Turn over'),
      how:
        turn.axis === 'horizontal'
          ? t('panels:diagram.turns.howTopToBottom', 'Top to bottom')
          : t('panels:diagram.turns.howSideToSide', 'Side to side'),
    };
  }
  const { direction } = turn.rotate;
  const title = t('panels:diagram.turns.cardRotate', 'Rotate');
  if (isCustomRotation(turn.rotate)) {
    const angle = rotateAmountLabel(turn.rotate);
    return {
      title,
      how:
        direction === 'cw'
          ? t('panels:diagram.turns.howAngleClockwise', '{{angle}} clockwise', { angle })
          : t('panels:diagram.turns.howAngleCounterclockwise', '{{angle}} counterclockwise', { angle }),
    };
  }
  const fraction = rotateAmountLabel(turn.rotate);
  return {
    title,
    how:
      direction === 'cw'
        ? t('panels:diagram.turns.howClockwise', '{{fraction}} turn clockwise', { fraction })
        : t('panels:diagram.turns.howCounterclockwise', '{{fraction}} turn counterclockwise', { fraction }),
  };
}

export function buildDiagramTurnActions(
  state: DiagramTurnActionState,
  deps: DiagramTurnActionDeps
): DiagramStepAction[] {
  const { t } = deps;
  const labels = turnLabels(t);
  const readOnlyHint = t(
    'panels:diagram.actions.readOnlyHint',
    'This diagram was made with a newer Ori Studio and opens read-only'
  );
  const { turn } = state;
  const choose = (id: DiagramTurnActionId, label: string, checked: boolean, next: DiagramTurnKind): DiagramStepCommand => ({
    kind: 'command',
    id,
    label,
    checked,
    radio: true,
    disabled: state.readOnly,
    ...(state.readOnly ? { hint: readOnlyHint } : {}),
    run: () => deps.set(next),
  });
  const rotation: DiagramRotation = turn.kind === 'rotate' ? turn.rotate : DEFAULT_ROTATION;
  const axis = turn.kind === 'turn-over' ? turn.axis : 'vertical';
  const how: DiagramStepAction[] =
    turn.kind === 'turn-over'
      ? (['vertical', 'horizontal'] as const).map((value) =>
          choose(`axis-${value}`, labels.axis[value], axis === value, { kind: 'turn-over', axis: value })
        )
      : [
          ...(['eighth', 'quarter', 'half'] as const).map((amount) =>
            choose(`rotate-${amount}`, labels.amount[amount], rotation.amount === amount, {
              kind: 'rotate',
              rotate: withRotationAmount(rotation, amount),
            })
          ),
          // A menu takes no number: an angle of the author's own is shown as
          // one more of the set, checked, and set in the Step pane.
          ...(isCustomRotation(rotation)
            ? [choose('rotate-custom', rotateAmountLabel(rotation), true, { kind: 'rotate', rotate: rotation })]
            : []),
          { kind: 'separator', id: 'after-amount' },
          ...(['cw', 'ccw'] as const).map((direction) =>
            choose(`rotate-${direction}`, labels.direction[direction], rotation.direction === direction, {
              kind: 'rotate',
              rotate: withRotationDirection(rotation, direction),
            })
          ),
        ];
  const command = (
    id: 'move-earlier' | 'move-later' | 'delete',
    label: string,
    run: () => void,
    blocked: boolean,
    hint?: string
  ): DiagramStepCommand => ({
    kind: 'command',
    id,
    label,
    disabled: state.readOnly || blocked,
    ...(state.readOnly ? { hint: readOnlyHint } : blocked && hint ? { hint } : {}),
    ...(id === 'delete' ? { danger: true, shortcutId: 'edit.delete' as const } : {}),
    ...(id === 'move-earlier' ? { shortcutId: 'diagram.moveStepEarlier' as const } : {}),
    ...(id === 'move-later' ? { shortcutId: 'diagram.moveStepLater' as const } : {}),
    run,
  });
  // A newer build's turn is not this build's to change: what it is is a stand-in.
  const what: DiagramStepAction[] =
    turn.unknown !== undefined
      ? []
      : [
          choose('turn-over', labels.kind['turn-over'], turn.kind === 'turn-over', { kind: 'turn-over', axis }),
          choose('rotate', labels.kind.rotate, turn.kind === 'rotate', { kind: 'rotate', rotate: rotation }),
          { kind: 'separator', id: 'after-kind' },
          ...how,
          { kind: 'separator', id: 'after-how' },
        ];
  return [
    ...what,
    command(
      'move-earlier',
      t('panels:diagram.actions.moveEarlier', 'Move Earlier'),
      () => deps.move('earlier'),
      state.index <= 0,
      t('panels:diagram.turns.firstHint', 'Already first')
    ),
    command(
      'move-later',
      t('panels:diagram.actions.moveLater', 'Move Later'),
      () => deps.move('later'),
      state.index >= state.count - 1,
      t('panels:diagram.turns.lastHint', 'Already last')
    ),
    { kind: 'separator', id: 'after-move' },
    command('delete', t('panels:diagram.turns.delete', 'Delete Turn'), deps.remove, false),
  ];
}
