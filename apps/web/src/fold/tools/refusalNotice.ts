/**
 * A refused fold, as the tool window says it (plan D14, Refusals and fixes):
 * what went wrong in a sentence a folder reads, and the engine's fixes as
 * buttons — include flap N, fold the other way, pick a flap, use the landmark
 * line. The engine decides which fixes exist; this only names them and binds
 * each to its verb.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { NoticeAction } from '../../components/ui/Notice';
import type { FoldFix, FoldFlap, FoldLine, FoldRefusalCode, FoldRefused, FoldSide } from './engineContracts';
import type { FoldKind } from './foldToolCatalog';

/** The calls a fix makes; the store binds them. */
export interface FoldFixVerbs {
  /** Add these flaps (engine indices) to the seed. */
  includeFlaps: (flaps: readonly number[]) => void;
  /** The same fold, the other way. */
  foldOtherWay: () => void;
  /** Fold this flap alone. */
  pickFlap: (flap: FoldFlap) => void;
  /** Fold along this line instead, moving the same side. */
  useLine: (line: FoldLine, side: FoldSide) => void;
}

export interface FoldRefusalNoticeModel {
  /** The refusal's code, for the surface's analytics (D18 `fold refused`). */
  code: FoldRefusalCode;
  title: string;
  text: string;
  actions: readonly NoticeAction[];
}

/** What the notice is read against: the fold asked for, and how its flaps are numbered on screen. */
export interface FoldRefusalContext {
  kind: FoldKind;
  /** A flap's number on screen, by its engine index (`flapNumbers`). */
  flapNumber: (flap: number) => number;
  /** Nothing can change: the fixes are shown, but none can be taken. */
  readOnly: boolean;
}

function words(t: TFunction, refused: FoldRefused, context: FoldRefusalContext): { title: string; text: string } {
  const { refusal } = refused;
  switch (refusal.code) {
    case 'no_moving_side':
      return {
        title: t('tools:fold.refusal.noMovingSide.title', 'Nothing to fold'),
        text: t(
          'tools:fold.refusal.noMovingSide.text',
          'No paper lies on the side of the line that would move. Swap the moving side, or move the line onto the paper.'
        ),
      };
    case 'near_miss':
      return {
        title: t('tools:fold.refusal.nearMiss.title', 'Too close to a point'),
        text: t(
          'tools:fold.refusal.nearMiss.text',
          'The line passes just beside a point of the paper: too close to fold cleanly, too far to go through it.'
        ),
      };
    case 'witness_not_in_face':
    case 'seed_not_on_moving_side':
      return {
        title: t('tools:fold.refusal.pickAgain.title', 'Pick again'),
        text: t(
          'tools:fold.refusal.pickAgain.text',
          'That spot is not inside a layer on the moving side. Pick inside a layer, away from its creases.'
        ),
      };
    case 'empty_seed':
      return {
        title: t('tools:fold.refusal.emptySeed.title', 'Nothing to fold'),
        text: t('tools:fold.refusal.emptySeed.text', 'No layer is picked. Pick at least one flap to move.'),
      };
    case 'nothing_stays':
      return {
        title: t('tools:fold.refusal.nothingStays.title', 'Everything would move'),
        text: t(
          'tools:fold.refusal.nothingStays.text',
          'Every layer is on the moving side, so nothing would stay put. Pick a flap to fold.'
        ),
      };
    case 'closure_adds_flaps': {
      const [only] = refusal.added;
      return {
        title: t('tools:fold.refusal.closureAddsFlaps.title', 'More flaps would move'),
        text:
          refusal.added.length === 1 && only !== undefined
            ? t('tools:fold.refusal.closureAddsFlaps.textOne', 'Folding these layers moves flap {{number}} too.', {
                number: context.flapNumber(only),
              })
            : t('tools:fold.refusal.closureAddsFlaps.textMany', {
                count: refusal.added.length,
                defaultValue_one: 'Folding these layers moves {{count}} more flap too.',
                defaultValue_other: 'Folding these layers moves {{count}} more flaps too.',
              }),
      };
    }
    case 'layer_order':
      return {
        title: t('tools:fold.refusal.collision.title', 'Collision'),
        text: t('tools:fold.refusal.collision.text', 'The moving layers would pass through layers in their way.'),
      };
    case 'short_crease':
    case 'thin_piece':
    case 'degenerate_split':
      return {
        title: t('tools:fold.refusal.tooSmall.title', 'Too small to fold'),
        text: t(
          'tools:fold.refusal.tooSmall.text',
          'The fold would leave a crease or a strip of paper thinner than the paper itself.'
        ),
      };
    case 'sliver':
      return {
        title: t('tools:fold.refusal.sliver.title', 'A point lands just inside an edge'),
        text: t(
          'tools:fold.refusal.sliver.text',
          'A point of the moving layers would land a hair’s breadth inside another layer’s edge.'
        ),
      };
    case 'precrease_unfold_moved_more':
      return {
        title: t('tools:fold.refusal.precreaseUnfold.title', 'This precrease cannot unfold'),
        text: t('tools:fold.refusal.precreaseUnfold.text', 'Unfolding it would move more layers than folding it did.'),
      };
    case 'tuck_target_moves':
      return {
        title: t('tools:fold.refusal.tuckTarget.title', 'The layer to tuck under would move'),
        text: t('tools:fold.refusal.tuckTarget.text', 'Pick a layer that stays put to tuck the flap against.'),
      };
    // The sheet, and a state the engine itself could not make valid: nothing
    // a folder asked for by name, so nothing to say beyond that it cannot be.
    case 'sheet_too_few_points':
    case 'sheet_not_finite':
    case 'sheet_not_convex':
    case 'sheet_side_too_short':
    case 'sheet_not_in_unit_frame':
    case 'invalid_rectangle':
    case 'invalid_sides':
    case 'duplicate_id':
    case 'unknown_vertex':
    case 'crease_unknown_vertex':
    case 'unused_vertex':
    case 'face_too_small':
    case 'missing_crease':
    case 'crease_face_count':
    case 'non_convex_face':
    case 'area_mismatch':
    case 'unknown_root':
    case 'unreached_face':
    case 'residual':
    case 'hinge_orientation':
    case 'folded_image':
    case 'prediction_mismatch':
      return {
        title: t('tools:fold.refusal.invalid.title', 'This fold cannot be made'),
        text: t('tools:fold.refusal.invalid.text', 'It would not land on a valid flat model.'),
      };
  }
}

function otherWayLabel(t: TFunction, kind: FoldKind): string {
  switch (kind) {
    case 'valley':
      return t('tools:fold.fix.mountainInstead', 'Mountain fold instead');
    case 'mountain':
      return t('tools:fold.fix.valleyInstead', 'Valley fold instead');
    case 'precrease':
      return t('tools:fold.fix.precreaseOtherWay', 'Precrease the other way');
  }
}

function fixActions(
  t: TFunction,
  fix: FoldFix,
  position: number,
  context: FoldRefusalContext,
  verbs: FoldFixVerbs
): NoticeAction[] {
  const disabled = context.readOnly;
  switch (fix.fix) {
    case 'include_flaps': {
      const [only] = fix.flaps;
      if (only === undefined) return [];
      return [
        {
          id: `include-${position}`,
          label:
            fix.flaps.length === 1
              ? t('tools:fold.fix.includeFlap', 'Include flap {{number}}', { number: context.flapNumber(only) })
              : t('tools:fold.fix.includeFlaps', {
                  count: fix.flaps.length,
                  defaultValue_one: 'Include the {{count}} flap',
                  defaultValue_other: 'Include the {{count}} flaps',
                }),
          run: () => verbs.includeFlaps(fix.flaps),
          disabled,
        },
      ];
    }
    case 'opposite_direction':
      return [{ id: `other-way-${position}`, label: otherWayLabel(t, context.kind), run: verbs.foldOtherWay, disabled }];
    case 'pick_flap':
      // The engine lists these flaps in its own flap order, the order the
      // section's flaps are in, so their numbers are the chips' numbers.
      return fix.flaps.map((flap, index) => ({
        id: `pick-${position}-${index}`,
        label: t('tools:fold.fix.pickFlap', 'Fold flap {{number}} only', { number: context.flapNumber(index) }),
        run: () => verbs.pickFlap(flap),
        disabled,
      }));
    case 'use_line':
      return [
        {
          id: `line-${position}`,
          label: t('tools:fold.fix.useLine', 'Use the landmark line'),
          run: () => verbs.useLine(fix.line, fix.side),
          disabled,
        },
      ];
  }
}

/** The notice for a refused fold: its words, and a button per fix the engine offers. */
export function foldRefusalNotice(
  t: TFunction,
  refused: FoldRefused,
  context: FoldRefusalContext,
  verbs: FoldFixVerbs
): FoldRefusalNoticeModel {
  return {
    code: refused.refusal.code,
    ...words(t, refused, context),
    actions: refused.fixes.flatMap((fix, position) => fixActions(t, fix, position, context, verbs)),
  };
}

/** The flaps a refusal's fixes say are in the way: the chips mark them. */
export function neededFlaps(refused: FoldRefused | null): Set<number> {
  const needed = new Set<number>();
  for (const fix of refused?.fixes ?? []) {
    if (fix.fix === 'include_flaps') fix.flaps.forEach((flap) => needed.add(flap));
  }
  return needed;
}
