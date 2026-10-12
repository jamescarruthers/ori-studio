/**
 * A refused vertex fold — squash, petal fold, rabbit ear, swivel (plan Phase
 * 11, D14) — in a folder's words, for the one refusal notice
 * (`refusalNotice.ts`). Its preconditions are said first, since research
 * §5.3 found them, not the stacking, to be what stops these folds: every
 * squash that failed to close had its flap held off its hinge, every blocked
 * one was covered.
 *
 * Every fix the engine offers a vertex fold is a button — the other
 * direction, a fan's other fourth ray (`use_emergent`) — and so is what the
 * tools can do for a refusal the engine offers no fix for:
 *
 * - a squash's spine aimed outside its wedge goes back onto the hinge;
 * - a petal fold's H that runs along no precrease takes the precrease beside
 *   it when there is one (the landmark), or precreases the line first; its
 *   missing kite creases take the Precrease tool on the edge-to-edge axiom
 *   that makes them. The engine cannot offer these: it cannot know the
 *   kite's corner before the kite is creased.
 *
 * React-free and store-free; literal `t()` keys so the extractor sees them.
 */
import type { TFunction } from 'i18next';
import type { NoticeAction } from '../../../components/ui/Notice';
import type { FoldNoFlap, FoldNoPetal } from '../../engine/foldEngineSquashWire';
import type { FoldFix, FoldModelPoint, FoldRefusalBody } from '../../engine/foldEngineWire';

/** The vertex folds' refusal codes, which {@link vertexRefusalWords} words. */
export const FOLD_VERTEX_REFUSAL_CODES = [
  'squash_no_flap',
  'squash_flap_not_free',
  'squash_flap_covered',
  'squash_target_outside',
  'petal_not_precreased',
  'petal_no_flap',
  'fan_center',
  'fan_ray_blocked',
  'fan_not_flat',
  'fan_fourth_beside_stayer',
  'fan_fourth_cannot_rise',
  'fan_stayer_detached',
] as const;

export type FoldVertexRefusalCode = (typeof FOLD_VERTEX_REFUSAL_CODES)[number];

/** What a vertex fold's notice is read against. */
export interface FoldVertexRefusalContext {
  /** The tool the refusal is for: its words name what it folds. */
  tool: 'squash' | 'petal' | 'rabbit-ear' | 'swivel';
  /** A fan's fourth ray's number on screen (1-based), by its direction: what a `use_emergent` fix names. */
  emergentNumber?: (direction: FoldModelPoint) => number | null;
  /** A petal fold's H runs along no precrease, but one lies beside it: the landmark offered. */
  nearPrecrease?: boolean;
}

/**
 * The context a vertex fold's refusal is worded in when no tool gave one —
 * a notice read away from the tool that folded it: the fold its code names,
 * a fan's as a swivel's.
 */
export function vertexContextOf(code: string): FoldVertexRefusalContext {
  if (code.startsWith('petal')) return { tool: 'petal' };
  return code.startsWith('fan') ? { tool: 'swivel' } : { tool: 'squash' };
}

/** The calls a vertex fold's fixes make; the canvas binds them. */
export interface FoldVertexFixVerbs {
  /** The same fold, the other direction. */
  vertexOtherWay?: () => void;
  /** Fold the fan with this fourth ray, a direction in the parent's model frame. */
  takeEmergent?: (direction: FoldModelPoint) => void;
  /** Put a squash's spine back onto its hinge line. */
  resetSquashTarget?: () => void;
  /** Take the precrease beside a petal fold's H as H. */
  useNearPrecrease?: () => void;
  /** Precrease a petal fold's H first: the Precrease tool on the same line. */
  precreaseLine?: () => void;
  /** Precrease a petal fold's kite first: the Precrease tool on the edge-to-edge axiom. */
  precreaseKite?: () => void;
}

function noFlap(t: TFunction, cause: FoldNoFlap): string {
  switch (cause) {
    case 'single_layer':
      return t(
        'tools:fold.vertex.refusal.noFlap.singleLayer',
        'Only one layer lies here. Click a flap of two layers joined along a folded edge.'
      );
    case 'no_spine':
      return t(
        'tools:fold.vertex.refusal.noFlap.noSpine',
        'The two layers here are not joined by a fold, so the flap has no spine to open along.'
      );
    case 'no_hinge':
      return t(
        'tools:fold.vertex.refusal.noFlap.noHinge',
        'The flap folds over no hinge at either end of its spine, so there is nothing to press it flat against.'
      );
    case 'upper_not_hinged':
      return t(
        'tools:fold.vertex.refusal.noFlap.upperNotHinged',
        'The flap’s top layer is held by its spine alone: pressed flat, its hinge side would lie loose.'
      );
  }
}

function noPetal(t: TFunction, cause: FoldNoPetal): string {
  switch (cause) {
    case 'no_ends':
      return t(
        'tools:fold.vertex.refusal.noPetal.noEnds',
        'The line does not cross the flap’s two folded edges. Pick a precrease that runs from one edge of the flap to the other.'
      );
    case 'no_corner':
      return t(
        'tools:fold.vertex.refusal.noPetal.noCorner',
        'The kite creases do not meet below the line, so there is no point to lift.'
      );
  }
}

/** A vertex fold's refusal in a folder's words; null for any other code. */
export function vertexRefusalWords(
  t: TFunction,
  refusal: FoldRefusalBody,
  context: FoldVertexRefusalContext
): { title: string; text: string } | null {
  switch (refusal.code) {
    case 'squash_no_flap':
      return { title: t('tools:fold.vertex.refusal.noFlap.title', 'No flap to squash here'), text: noFlap(t, refusal.cause) };
    case 'squash_flap_not_free':
      return {
        title: t('tools:fold.vertex.refusal.notFree.title', 'The flap is held elsewhere'),
        text: t(
          'tools:fold.vertex.refusal.notFree.text',
          'The flap is joined to other paper away from its hinge. Only a flap held along its hinge alone opens flat: unfold what holds it first.'
        ),
      };
    case 'squash_flap_covered':
      return context.tool === 'petal'
        ? {
            title: t('tools:fold.vertex.refusal.petalCovered.title', 'The flap is covered'),
            text: t(
              'tools:fold.vertex.refusal.petalCovered.text',
              'Other layers lie over the flap on the side it lifts toward. Fold them out of the way first, or lift it the other way.'
            ),
          }
        : {
            title: t('tools:fold.vertex.refusal.covered.title', 'The flap is covered'),
            text: t(
              'tools:fold.vertex.refusal.covered.text',
              'Other layers lie over the flap, or inside it, on the side it opens toward. Fold them out of the way first, or squash it the other way.'
            ),
          };
    case 'squash_target_outside':
      return {
        title: t('tools:fold.vertex.refusal.targetOutside.title', 'The spine cannot land there'),
        text: t(
          'tools:fold.vertex.refusal.targetOutside.text',
          'The spine lands between where it lies and the hinge. Click a point inside the flap, or put it back onto the hinge.'
        ),
      };
    case 'petal_not_precreased':
      if (refusal.missing === 'kite') {
        return {
          title: t('tools:fold.vertex.refusal.kite.title', 'Precrease the kite first'),
          // What the button sets up, and what is left to click once it has.
          text: t(
            'tools:fold.vertex.refusal.kite.howTo',
            'A petal fold refolds creases already there. The button below takes the Precrease tool on Axiom 3: click a lower edge of the top flap, then its centre line, leave out the flaps behind under Layers, and press Enter. Crease the other edge the same way, then petal fold.'
          ),
        };
      }
      return context.nearPrecrease
        ? {
            title: t('tools:fold.vertex.refusal.lineNear.title', 'The line misses the precrease'),
            text: t(
              'tools:fold.vertex.refusal.lineNear.text',
              'A petal fold lifts the flap along a precrease. This line runs just beside one: use it, or precrease this line first.'
            ),
          }
        : {
            title: t('tools:fold.vertex.refusal.line.title', 'Precrease the line first'),
            text: t(
              'tools:fold.vertex.refusal.line.text',
              'A petal fold lifts the flap along a precrease through every layer below it. Precrease this line through all the layers, then petal fold.'
            ),
          };
    case 'petal_no_flap':
      return { title: t('tools:fold.vertex.refusal.noPetal.title', 'No flap to lift here'), text: noPetal(t, refusal.cause) };
    case 'fan_center':
      return {
        title: t('tools:fold.vertex.refusal.center.title', 'The creases cannot meet there'),
        text:
          context.tool === 'rabbit-ear'
            ? t(
                'tools:fold.vertex.refusal.center.textEar',
                'The triangle’s creases meet at its incenter, which lies on a crease or off the layers. Pick corners that put it inside the layers, away from their creases.'
              )
            : t(
                'tools:fold.vertex.refusal.center.textSwivelStep',
                'The point the creases meet at is on a crease or off the paper. Press Esc and place it again as step 1 says: inside the paper, away from every crease.'
              ),
      };
    case 'fan_ray_blocked':
      return {
        title: t('tools:fold.vertex.refusal.blocked.title', 'Paper is in the way'),
        // The two steppers that change it, by the names the window gives them.
        text: t(
          'tools:fold.vertex.refusal.blocked.steppers',
          'A crease would run into paper that does not fold with it, or paper would hold two parts of the fold together. Step Layers to fold more layers, or Fourth crease to another one.'
        ),
      };
    case 'fan_not_flat':
      return {
        title: t('tools:fold.vertex.refusal.notFlat.title', 'It cannot fold flat'),
        text: t(
          'tools:fold.vertex.refusal.notFlat.spread',
          'No fourth crease lets these creases lie flat: two of them point the same way, or two neighbours are half a turn or more apart. Press Esc and pick points spread more evenly round the meeting point.'
        ),
      };
    case 'fan_fourth_beside_stayer':
      return {
        title: t('tools:fold.vertex.refusal.fourthBesideStayer.title', 'The fourth crease is beside the paper that stays'),
        text: t(
          'tools:fold.vertex.refusal.fourthBesideStayer.text',
          'The flap rises along the fourth crease, so it lies across from the paper that stays put. Pick another fourth crease, or other paper to stay put.'
        ),
      };
    case 'fan_fourth_cannot_rise':
      return {
        title: t('tools:fold.vertex.refusal.fourthCannotRise.title', 'The fourth crease cannot rise here'),
        text: t(
          'tools:fold.vertex.refusal.fourthCannotRise.text',
          'The fourth crease folds the other way from the other three, and the angles between these creases do not let it. Pick another fourth crease, or other points.'
        ),
      };
    case 'fan_stayer_detached':
      return {
        title: t('tools:fold.vertex.refusal.stayer.title', 'Which paper stays?'),
        text: t(
          'tools:fold.vertex.refusal.stayer.text',
          'The paper picked to stay put is joined to no part of the fold. Pick paper the creases cut, or paper joined to it.'
        ),
      };
    default:
      return null;
  }
}

/**
 * A vertex fold no order of its layers lands, in its tool's words: the
 * engine checked its preconditions and found no way to stack what it folds.
 * Pointed the other way only when the engine says that way lands (its
 * `opposite_direction` fix).
 */
export function vertexNoOrderWords(
  t: TFunction,
  context: FoldVertexRefusalContext,
  otherWay: boolean
): { title: string; text: string } {
  return {
    title: noOrderTitle(t, context.tool),
    text: otherWay
      ? t(
          'tools:fold.vertex.refusal.noOrder.otherWay',
          'No way of stacking the layers lets it fold flat this way here. Folded the other way, it fits.'
        )
      : t(
          'tools:fold.vertex.refusal.noOrder.none',
          'No way of stacking the layers lets it fold flat here. Pick other points, or fold the layers in its way first.'
        ),
  };
}

function noOrderTitle(t: TFunction, tool: FoldVertexRefusalContext['tool']): string {
  switch (tool) {
    case 'squash':
      return t('tools:fold.vertex.refusal.noOrder.squash', 'It cannot be squashed flat here');
    case 'petal':
      return t('tools:fold.vertex.refusal.noOrder.petal', 'It cannot be petal-folded here');
    case 'rabbit-ear':
      return t('tools:fold.vertex.refusal.noOrder.rabbitEar', 'The ear cannot fold flat here');
    case 'swivel':
      return t('tools:fold.vertex.refusal.noOrder.swivel', 'It cannot swivel flat here');
  }
}

/**
 * A vertex fold's own fix as a button: the other direction, a fan's other
 * fourth ray. Null for any other fix, which the shared notice words; an
 * empty list when there is no verb to bind it to.
 */
export function vertexFixActions(
  t: TFunction,
  fix: FoldFix,
  position: number,
  disabled: boolean,
  context: FoldVertexRefusalContext,
  verbs: FoldVertexFixVerbs
): NoticeAction[] | null {
  switch (fix.fix) {
    case 'opposite_direction': {
      const { vertexOtherWay } = verbs;
      return vertexOtherWay
        ? [
            {
              id: `vertex-other-way-${position}`,
              label: t('tools:fold.vertex.fix.otherWay', 'Fold it the other way'),
              run: vertexOtherWay,
              disabled,
            },
          ]
        : [];
    }
    case 'use_emergent': {
      const { takeEmergent } = verbs;
      if (!takeEmergent) return [];
      const number = context.emergentNumber?.(fix.direction) ?? null;
      return [
        {
          id: `vertex-emergent-${position}`,
          label:
            number === null
              ? t('tools:fold.vertex.fix.emergent', 'Use the fourth crease that fits')
              : t('tools:fold.vertex.fix.emergentNumber', 'Use fourth crease {{number}}', { number }),
          run: () => takeEmergent(fix.direction),
          disabled,
        },
      ];
    }
    default:
      return null;
  }
}

/**
 * What the tools can do for a vertex fold's refusal beyond the engine's
 * fixes (see the module docs): a button each, or none.
 */
export function vertexExtraActions(
  t: TFunction,
  refusal: FoldRefusalBody,
  disabled: boolean,
  context: FoldVertexRefusalContext,
  verbs: FoldVertexFixVerbs
): NoticeAction[] {
  const action = (id: string, label: string, run: (() => void) | undefined): NoticeAction[] =>
    run ? [{ id, label, run, disabled }] : [];
  switch (refusal.code) {
    case 'squash_target_outside':
      return action(
        'vertex-reset-target',
        t('tools:fold.vertex.fix.resetTarget', 'Put the spine onto the hinge'),
        verbs.resetSquashTarget
      );
    case 'petal_not_precreased':
      if (refusal.missing === 'kite') {
        return action(
          'vertex-precrease-kite',
          t('tools:fold.vertex.fix.precreaseKite', 'Precrease the kite'),
          verbs.precreaseKite
        );
      }
      return [
        ...(context.nearPrecrease
          ? action('vertex-near-precrease', t('tools:fold.vertex.fix.usePrecrease', 'Use the precrease'), verbs.useNearPrecrease)
          : []),
        ...action('vertex-precrease-line', t('tools:fold.vertex.fix.precreaseLine', 'Precrease this line first'), verbs.precreaseLine),
      ];
    default:
      return [];
  }
}
