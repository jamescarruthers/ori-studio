/**
 * A refused fold, as the tool window says it (plan D14, Refusals and fixes):
 * what went wrong in a sentence a folder reads, and the engine's fixes as
 * buttons — include flap N, fold the other way, pick a flap, use the landmark
 * line, land a point exactly on an edge. The engine decides which fixes exist;
 * this only names them and binds each to its verb.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { NoticeAction } from '../../components/ui/Notice';
import type { FoldNoOpening, FoldReverseKind } from '../engine/foldEngineReverseWire';
import type { FoldEngineRefused, FoldFix, FoldFlap, FoldRefusalCode } from '../engine/foldEngineWire';
import type { FoldKind } from './foldToolCatalog';

/** What a notice reads of a refusal: the bridge's, with or without its envelope. */
export type FoldRefused = Pick<FoldEngineRefused, 'refusal' | 'fixes'>;

/** A fold along another line: a near miss's landmark line, or a sliver remedy with its storable step. */
export type FoldUseLineFix = Extract<FoldFix, { fix: 'use_line' }>;

/** The calls a fix makes; the store binds them. */
export interface FoldFixVerbs {
  /** Add these flaps (engine indices) to the seed. */
  includeFlaps: (flaps: readonly number[]) => void;
  /** The same fold, the other way. */
  foldOtherWay: () => void;
  /** Fold this flap alone. */
  pickFlap: (flap: FoldFlap) => void;
  /**
   * Fold along this line instead, moving the same side: preview it as a model
   * line, and commit its `step` when it has one.
   */
  useLine: (fix: FoldUseLineFix) => void;
  /** The same reverse fold, or crimp, of the other kind. */
  otherKind?: (kind: FoldReverseKind) => void;
  /** The same tuck against this layer, by its face: one the engine listed as taking it. */
  tuckTarget?: (face: number) => void;
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
  /** A plain fold's kind, or the compound fold's family its fixes are worded for. */
  kind: FoldKind | 'reverse' | 'crimp' | 'tuck';
  /** A flap's number on screen, by its engine index (`flapNumbers`). */
  flapNumber: (flap: number) => number;
  /** Nothing can change: the fixes are shown, but none can be taken. */
  readOnly: boolean;
  /**
   * A tuck's: whether it goes under its target, and a listed layer's number
   * as its stepper counts it, by its face (null for one not listed).
   */
  tuck?: { under: boolean; targetNumber: (face: number) => number | null };
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
    // A line located from references that do not name paper of this state.
    case 'point_off_paper':
    case 'segment_too_short':
    case 'segment_not_on_a_face':
    case 'crease_not_found':
      return {
        title: t('tools:fold.refusal.offPaper.title', 'A reference is not on the paper'),
        text: t(
          'tools:fold.refusal.offPaper.text',
          'A point or edge the line was located from does not lie on the paper as it is folded now. Locate the line again.'
        ),
      };
    case 'free_line_too_short':
      return {
        title: t('tools:fold.refusal.pointsTooClose.title', 'The points are too close'),
        text: t(
          'tools:fold.refusal.pointsTooClose.text',
          'The two points land in the same place on the folded paper, so they make no line. Pick two points farther apart.'
        ),
      };
    case 'no_root':
      return {
        title: t('tools:fold.refusal.noRoot.title', 'No fold here'),
        text: t(
          'tools:fold.refusal.noRoot.text',
          'These references give no fold line on the paper as it is folded. Pick other references.'
        ),
      };
    case 'no_side':
    case 'side_on_line':
      return {
        title: t('tools:fold.refusal.noSide.title', 'Which side moves?'),
        text: t(
          'tools:fold.refusal.noSide.text',
          'Nothing says which side of the line moves. Pick a point off the line, on the side to move.'
        ),
      };
    case 'mover_stays':
      return {
        title: t('tools:fold.refusal.moverStays.title', 'The point would stay put'),
        text: t(
          'tools:fold.refusal.moverStays.text',
          'The layer that carries the point to move is not among the layers folding. Include its flap, or fold every layer.'
        ),
      };
    case 'crease_not_flat':
    case 'crease_not_folded':
      return {
        title: t('tools:fold.refusal.wrongCrease.title', 'Not that kind of crease'),
        text: t(
          'tools:fold.refusal.wrongCrease.text',
          'Unfold along a folded edge, and refold along a flat crease.'
        ),
      };
    // A stored step this build cannot fold as it is, an Import CP step among
    // them: nothing a folder asked for. The Import CP picker words its own
    // refusals; the import codes reach a notice only from a replay.
    case 'unexpected_choice':
    case 'root_missing':
    case 'import_not_finite':
    case 'import_no_border':
    case 'import_outline_loops':
    case 'import_outline_invalid':
    case 'import_shape_unsupported':
    case 'import_shape_mismatch':
    case 'import_crease_off_sheet':
    case 'import_conflicting_creases':
    case 'import_crease_not_chord':
    case 'import_disconnected_creases':
    case 'import_non_convex_face':
    case 'import_not_flat_foldable':
    case 'import_ambiguous_overlap':
    case 'import_no_order':
    case 'import_budget_exceeded':
    case 'import_order_open':
    case 'import_witness_not_in_face':
    case 'import_relation_one_face':
    case 'import_internal':
    case 'import_unreadable':
    case 'import_folded_form':
    case 'import_stored_unreadable':
    case 'import_order_broken':
    case 'import_figure_incomplete':
    case 'fold_export_too_large':
      return {
        title: t('tools:fold.refusal.unsupported.title', 'This step cannot be folded'),
        text: t('tools:fold.refusal.unsupported.text', 'This version of Ori Studio cannot fold it as it is stored.'),
      };
    // Compound folds (plan D4), one block per family. A choice still to make
    // reads as the chooser's prompt; a stored one that no longer resolves as
    // a step this build cannot fold as it is stored.
    case 'choice_needed':
      return choiceNeededWords(t, refusal.choice);
    case 'choice_broken':
      return {
        title: t('tools:fold.refusal.choiceBroken.title', 'A choice no longer fits'),
        text: t(
          'tools:fold.refusal.choiceBroken.text',
          'The opening or the layer order this step stored no longer fits the paper before it, so it cannot be folded as it is stored.'
        ),
      };
    // The reverse fold's.
    case 'reverse_no_opening':
      return {
        title: t('tools:fold.refusal.reverseNoOpening.title', 'This flap cannot open'),
        text: noOpening(t, refusal.cause, context.kind),
      };
    case 'reverse_kind_infeasible':
      return {
        title:
          refusal.kind === 'inside'
            ? t('tools:fold.refusal.insideInfeasible.title', 'It cannot go inside')
            : t('tools:fold.refusal.outsideInfeasible.title', 'It cannot wrap round the outside'),
        // The other kind is pointed to only when the engine says it lands.
        text: refused.fixes.some((fix) => fix.fix === 'other_kind')
          ? t(
              'tools:fold.refusal.kindInfeasible.text',
              'No way of stacking the layers lets the tip turn this way here. The other kind of reverse fold may fit.'
            )
          : t(
              'tools:fold.refusal.kindInfeasible.neither',
              'Neither kind of reverse fold fits here: no way of stacking the layers lets the tip turn. Move the line, or reverse other flaps.'
            ),
      };
    case 'reverse_tip_not_free':
      return {
        title: t('tools:fold.refusal.tipNotFree.title', 'Layers are in the way'),
        text: t(
          'tools:fold.refusal.tipNotFree.text',
          'Other layers lie where the tip would turn. Include their flaps in the fold, or reverse it somewhere else.'
        ),
      };
    // The crimp's (its tip at ℓ1 is a reverse fold's, whose refusals above
    // it shares).
    case 'crimp_lines_meet':
      return {
        title: t('tools:fold.refusal.crimpLinesMeet.title', 'The lines meet'),
        text: t(
          'tools:fold.refusal.crimpLinesMeet.text',
          'The two lines cross, or come too close, over the paper the crimp moves. Draw the second line clear of the first across the flap.'
        ),
      };
    case 'crimp_misses_tip':
      return {
        title: t('tools:fold.refusal.crimpMissesTip.title', 'The second line misses the flap'),
        text: t(
          'tools:fold.refusal.crimpMissesTip.text',
          'The second line crosses none of the paper beyond the first, so nothing would turn back. Draw it across the flap, beyond the first line.'
        ),
      };
    case 'crimp_no_opening':
      return {
        title: t('tools:fold.refusal.crimpNoOpening.title', 'This flap cannot open at the second line'),
        text: t(
          'tools:fold.refusal.crimpNoOpening.text',
          'Its layers part at the first line, but at the second one of them has ended, or has nothing to turn on. Move the second line, or crimp other flaps.'
        ),
      };
    case 'crimp_kind_infeasible':
      return {
        title:
          refusal.kind === 'inside'
            ? t('tools:fold.refusal.crimpInsideInfeasible.title', 'It cannot crimp inside')
            : t('tools:fold.refusal.crimpOutsideInfeasible.title', 'It cannot crimp round the outside'),
        // The other kind is pointed to only when the engine says it lands.
        text: refused.fixes.some((fix) => fix.fix === 'other_kind')
          ? t(
              'tools:fold.refusal.crimpKindInfeasible.text',
              'No way of stacking the layers lets the tip turn this way on both lines. The other kind of crimp may fit.'
            )
          : t(
              'tools:fold.refusal.crimpKindInfeasible.neither',
              'Neither kind of crimp fits here: no way of stacking the layers lets the tip turn on both lines. Move a line, or crimp other flaps.'
            ),
      };
    case 'crimp_tip_not_free':
      return {
        title: t('tools:fold.refusal.tipNotFree.title', 'Layers are in the way'),
        text: t(
          'tools:fold.refusal.crimpTipNotFree.text',
          'Other layers lie where the crimped paper would turn. Include their flaps in the crimp, or crimp it somewhere else.'
        ),
      };
    // The tuck's. With no layer named, the tools found none that takes it
    // (`tuckWithoutTarget`); with one, the engine found no order against it.
    case 'tuck_infeasible':
      if (refusal.target === null) {
        return {
          title: t('tools:fold.refusal.tuckNoTarget.title', 'No layer takes the tuck here'),
          text:
            refusal.placement === 'under'
              ? t(
                  'tools:fold.refusal.tuckNoTarget.under',
                  'No layer that stays can take the flap under it here. Fold it the other way, swap the moving side, or locate another line.'
                )
              : t(
                  'tools:fold.refusal.tuckNoTarget.over',
                  'No layer that stays can take the flap over it here. Fold it the other way, swap the moving side, or locate another line.'
                ),
        };
      }
      return {
        title:
          refusal.placement === 'under'
            ? t('tools:fold.refusal.tuckInfeasible.titleUnder', 'It cannot be tucked under that layer')
            : t('tools:fold.refusal.tuckInfeasible.titleOver', 'It cannot be tucked over that layer'),
        text: refused.fixes.some((fix) => fix.fix === 'tuck_target')
          ? t(
              'tools:fold.refusal.tuckInfeasible.text',
              'No way of stacking the layers puts the flap right against that layer. Another layer here takes it.'
            )
          : t(
              'tools:fold.refusal.tuckInfeasible.none',
              'No way of stacking the layers puts the flap right against that layer. Tuck fewer flaps, or locate another line.'
            ),
      };
    // The sheet, and a state the engine itself could not make valid: nothing
    // a folder asked for by name, so nothing to say beyond that it cannot be.
    // With them, the compound pipeline's own: no order at all, a search that
    // ran out, a pick that names nothing, a defect. And the vertex folds'
    // (from `squash_no_flap` on) and the sinks': no tool folds one yet, so
    // until their tools say them in their own words they read as a fold that
    // cannot be made.
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
    case 'vertex_off_sheet':
    case 'border_off_outline':
    case 'root_not_rigid':
    case 'view_not_finite':
    case 'unknown_root':
    case 'unreached_face':
    case 'residual':
    case 'hinge_orientation':
    case 'folded_image':
    case 'prediction_mismatch':
    case 'no_order':
    case 'budget_exceeded':
    case 'no_such_choice':
    case 'squash_no_flap':
    case 'squash_flap_not_free':
    case 'squash_flap_covered':
    case 'squash_target_outside':
    case 'petal_not_precreased':
    case 'petal_no_flap':
    case 'fan_center':
    case 'fan_ray_blocked':
    case 'fan_not_flat':
    case 'fan_ridge_not_ray':
    case 'fan_stayer_detached':
    case 'sink_several_points':
    case 'sink_point_open':
    case 'sink_outline_mixed':
    case 'sink_no_axis':
    case 'sink_line_tilted':
    case 'sink_no_pocket':
    case 'unsink_not_sunk':
    case 'internal':
      return {
        title: t('tools:fold.refusal.invalid.title', 'This fold cannot be made'),
        text: t('tools:fold.refusal.invalid.text', 'It would not land on a valid flat model.'),
      };
  }
}

/**
 * A choice a stored compound step still needs, as its chooser prompts for it.
 * A closed sink's pocket has no chooser yet (no sink tool is on the rail), so
 * a stored sink without one reads as a step this build cannot fold as it is
 * stored.
 */
function choiceNeededWords(
  t: TFunction,
  choice: 'opening' | 'pocket' | 'completion'
): { title: string; text: string } {
  switch (choice) {
    case 'opening':
      return {
        title: t('tools:fold.refusal.chooseOpening.title', 'Choose how it opens'),
        text: t('tools:fold.refusal.chooseOpening.text', 'The flap opens more than one way. Pick one to fold.'),
      };
    case 'completion':
      return {
        title: t('tools:fold.refusal.chooseOrder.title', 'Choose how the layers stack'),
        text: t(
          'tools:fold.refusal.chooseOrder.text',
          'The fold can land with its layers stacked more than one way. Pick one to fold.'
        ),
      };
    case 'pocket':
      return {
        title: t('tools:fold.refusal.unsupported.title', 'This step cannot be folded'),
        text: t('tools:fold.refusal.unsupported.text', 'This version of Ori Studio cannot fold it as it is stored.'),
      };
  }
}

/**
 * Why a flap of a reverse fold's tip has no opening (`NoOpening`), in a
 * folder's words. A crimp's tip opens as a reverse fold's does at its first
 * line, so it is refused for the same reasons, named as a crimp.
 */
function noOpening(t: TFunction, cause: FoldNoOpening, kind: FoldRefusalContext['kind']): string {
  switch (cause) {
    case 'no_spine':
      return kind === 'crimp'
        ? t(
            'tools:fold.refusal.crimpNoOpening.noSpine',
            'A single layer has no folded edge to crimp along. Crimp a flap of layers joined by a fold.'
          )
        : t(
            'tools:fold.refusal.reverseNoOpening.noSpine',
            'A single layer has no folded edge to reverse along. Reverse a flap of layers joined by a fold.'
          );
    case 'no_split':
      return t(
        'tools:fold.refusal.reverseNoOpening.noSplit',
        'Its layers cannot be parted along a fold without a lower layer ending up over an upper one.'
      );
    case 'no_body':
      return t(
        'tools:fold.refusal.reverseNoOpening.noBody',
        'Parted along its folds, one half would hang on nothing that stays put at the line.'
      );
    case 'bodies_cross':
      return t(
        'tools:fold.refusal.reverseNoOpening.bodiesCross',
        'Parted along its folds, the paper each half hangs on would cross the other’s.'
      );
  }
}

function otherWayLabel(t: TFunction, kind: FoldRefusalContext['kind']): string {
  switch (kind) {
    case 'valley':
      return t('tools:fold.fix.mountainInstead', 'Mountain fold instead');
    case 'mountain':
      return t('tools:fold.fix.valleyInstead', 'Valley fold instead');
    case 'precrease':
      return t('tools:fold.fix.precreaseOtherWay', 'Precrease the other way');
    // The engine never offers a reverse fold or a crimp the other way round;
    // it offers the other kind.
    case 'reverse':
    case 'crimp':
      return t('tools:fold.fix.swapInstead', 'Swap the moving side');
    case 'tuck':
      return t('tools:fold.fix.tuckOtherWay', 'Tuck the other way');
  }
}

/** A pick-a-flap fix's button, in the words of the fold it narrows. */
function pickFlapLabel(t: TFunction, kind: FoldRefusalContext['kind'], number: number): string {
  switch (kind) {
    case 'reverse':
      return t('tools:fold.fix.reverseFlap', 'Reverse flap {{number}} only', { number });
    case 'crimp':
      return t('tools:fold.fix.crimpFlap', 'Crimp flap {{number}} only', { number });
    case 'tuck':
      return t('tools:fold.fix.tuckFlap', 'Tuck flap {{number}} only', { number });
    default:
      return t('tools:fold.fix.pickFlap', 'Fold flap {{number}} only', { number });
  }
}

/** The other kind's button: a reverse fold's, or a crimp's. */
function otherKindLabel(t: TFunction, kind: FoldRefusalContext['kind'], other: FoldReverseKind): string {
  if (kind === 'crimp') {
    return other === 'inside'
      ? t('tools:fold.fix.insideCrimpInstead', 'Inside crimp instead')
      : t('tools:fold.fix.outsideCrimpInstead', 'Outside crimp instead');
  }
  return other === 'inside'
    ? t('tools:fold.fix.insideInstead', 'Inside reverse fold instead')
    : t('tools:fold.fix.outsideInstead', 'Outside reverse fold instead');
}

/** A tuck's other-target button: the layer by its number in the list the stepper steps through. */
function tuckTargetLabel(t: TFunction, context: FoldRefusalContext, face: number): string {
  const under = context.tuck?.under ?? true;
  const number = context.tuck?.targetNumber(face) ?? null;
  if (number === null) {
    return under
      ? t('tools:fold.fix.tuckUnderAnother', 'Tuck under the layer that fits instead')
      : t('tools:fold.fix.tuckOverAnother', 'Tuck over the layer that fits instead');
  }
  return under
    ? t('tools:fold.fix.tuckUnder', 'Tuck under listed layer {{number}} instead', { number })
    : t('tools:fold.fix.tuckOver', 'Tuck over listed layer {{number}} instead', { number });
}

/**
 * A line fix's button: a near miss's landmark line, or a sliver remedy that
 * turns the line about a point it keeps (O5) or slides it along the line it
 * stays square to (O7) until the point lands exactly on the edge.
 */
function lineFixLabel(t: TFunction, fix: FoldUseLineFix): string {
  const line = fix.step?.op.line;
  if (line?.via !== 'axiom') return t('tools:fold.fix.useLine', 'Use the landmark line');
  return line.axiom === 7
    ? t('tools:fold.fix.slideToEdge', 'Slide the line to land the point on the edge')
    : t('tools:fold.fix.turnToEdge', 'Turn the line to land the point on the edge');
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
        label: pickFlapLabel(t, context.kind, context.flapNumber(index)),
        run: () => verbs.pickFlap(flap),
        disabled,
      }));
    case 'use_line':
      return [{ id: `line-${position}`, label: lineFixLabel(t, fix), run: () => verbs.useLine(fix), disabled }];
    case 'other_kind': {
      const { otherKind } = verbs;
      if (!otherKind) return [];
      return [
        {
          id: `kind-${position}`,
          label: otherKindLabel(t, context.kind, fix.kind),
          run: () => otherKind(fix.kind),
          disabled,
        },
      ];
    }
    case 'tuck_target': {
      const { tuckTarget } = verbs;
      if (!tuckTarget) return [];
      return [
        {
          id: `target-${position}`,
          label: tuckTargetLabel(t, context, fix.face),
          run: () => tuckTarget(fix.face),
          disabled,
        },
      ];
    }
    case 'use_emergent':
      // A rabbit ear's or a swivel's, likewise.
      return [];
    case 'other_sink':
      // A sink's, likewise.
      return [];
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
