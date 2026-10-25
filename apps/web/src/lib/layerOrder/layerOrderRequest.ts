/**
 * What every host hands the Layer order dialog, and what the dialog hands
 * back (`implementation-plans/layer-order-dialog.md`, "The shape of the
 * system"). The dialog reads no store and no host's document: an Edit figure,
 * an Edit selection, a Diagram step and Pose each build one request, and each
 * commits the one result through its own undo and its own kernel.
 *
 * Types only.
 */
import type {
  OristudioCpFoldedFigureModel,
  OristudioCpFoldedPaperScene,
  OristudioCpLineSegment,
} from '../../engine/oristudioCpTypes';
import type { PaperStyle } from '../paper/paperStyle';
import type { SurfaceStylePolicy } from '../paper/paperStyleResolve';
import type { LayerOrderRecord } from './layerOrderRecord';

/**
 * The fold the dialog analyses: exactly what the host handed its crease
 * kernel, so the dialog's faces are the host's faces, one for one (approach
 * 2). Given back at Apply and folded again as it is, never reselected from the
 * document, whose order can renumber faces.
 */
export interface LayerOrderSource {
  /** The creases folded, in the crease pattern's coordinates, in the order the kernel took them. */
  readonly segments: readonly OristudioCpLineSegment[];
  /** The face the fold starts from, as the kernel numbers it: the one that stays put, front up. */
  readonly startingFaceId: number;
  /** The auxiliary lines carried onto the folded paper. They fold nothing. */
  readonly auxSegments: readonly OristudioCpLineSegment[];
  /** The kernel's model the host folds with: its scale and rotation place the folded paper. */
  readonly model: OristudioCpFoldedFigureModel;
  /**
   * The face-ring digest of the fold: over its ring vertex indices and the
   * input coordinates, never a folded or derived float, so the host's kernel
   * and the dialog's agree on it. Checked when the dialog opens and again on
   * the new fold at Apply.
   */
  readonly digest: string;
}

/**
 * The paper the dialog paints its panes with, resolved by the host (approach
 * 3): each host picks its paper its own way, and the dialog never sees a
 * figure's pins or a Diagram's style.
 */
export interface LayerOrderLook {
  /** The effective style: the host's display style with whatever it pins applied. */
  readonly style: PaperStyle;
  /** The surface the style is read through. */
  readonly policy: SurfaceStylePolicy;
  /**
   * How far the host turns the folded paper on screen, in degrees, as a
   * Diagram step's `rotationDeg` does: the step's own, or an Edit figure's
   * on-canvas rotation in those terms. One map turns the scene and the pane.
   */
  readonly turnDeg: number;
  /** Open with the hidden layers showing through, as an Edit figure in Transparent3 does. */
  readonly xray: boolean;
}

export interface LayerOrderRequest {
  readonly source: LayerOrderSource;
  /** What is saved, if anything, with its points in the crease pattern's coordinates (`paperFrame.ts`). */
  readonly record: LayerOrderRecord | null;
  readonly look: LayerOrderLook;
  /**
   * The paper scene the host shows for this fold now, from either side: its
   * kernel's scene, over the same faces as `source` (the digest holds them
   * to it). With no record, the dialog opens on the order it draws, or the
   * fitting order closest to it (`layer_open_showing`, D19), and it letters
   * the faces from it before the engine answers, so a refusal can name one.
   * Left out, the dialog opens on the solver's first order.
   */
  readonly shown?: OristudioCpFoldedPaperScene | null;
  /** What the host calls the fold, after the dialog's title: a figure's name, "Selection", a step's. */
  readonly name?: string;
  /** Quieter, after the name: the design's credit when there is one ("Traditional", "by Birb"). */
  readonly byline?: string;
}

/**
 * What Apply hands the host to commit: one fold with the chosen order
 * (approach 4), one undo step, and the record to save.
 */
export interface LayerOrderApplied {
  /** The record to save, with its points in the crease pattern's coordinates. */
  readonly record: LayerOrderRecord;
  /**
   * The whole chosen order, for the kernel's seeded fold: flat pairs of the
   * kernel's face indices, `[upper, lower, upper, lower, …]`, the upper face
   * nearer a viewer of the starting face's front.
   */
  readonly relations: Uint32Array;
  /** The fold the dialog analysed, as the request gave it: what the host folds again. */
  readonly source: LayerOrderSource;
}
