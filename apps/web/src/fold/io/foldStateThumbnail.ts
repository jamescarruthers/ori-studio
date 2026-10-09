/**
 * A folded state drawn small, for a card that picks between states: Import
 * CP's layer orders (plan D16), each the state its order lands.
 *
 * Painted the way every folded figure is (plan D11): the engine's scene is
 * the kernel's folded paper scene, so it goes through `foldedFlatPaperScene`
 * and the shared painter in the style the app shows paper in, read through
 * the flat folded figure's policy — paper in its two colours, every fold an
 * edge, a precrease in the aux pen. The scene frame is y-up and the page is
 * y-down, so the projection flips y. The page is transparent and its hidden
 * faces dropped: a card shows what the reader would see.
 *
 * Pure: no React, no store.
 */

import { foldedFlatPaperScene } from '../../cp-workspace/folded/foldedFlatScene';
import type { Point } from '../../lib/geometry';
import type { PaperStyle } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES, surfacePaperStyle } from '../../lib/paper/paperStyleResolve';
import type { ScenePoint } from '../../lib/paper/paperScene';
import { paperSceneToSvg } from '../../lib/paper/paperSvg';
import type { FoldScene } from '../engine/foldEngineWire';

/** Scene px per unit of the sheet's longer side: a card's picture is about this wide. */
const THUMBNAIL_PX = 120;

/** The thumbnail page: a few mm across, with a hairline of room for the pens. */
const THUMBNAIL_PAGE = { sheet: { mm: 30 }, paddingMm: 0.5, background: null, keepHiddenFaces: false } as const;

/** The state as an SVG data URL, or null when it has nothing to draw. */
export function foldStateThumbnailUrl(scene: FoldScene, style: PaperStyle): string | null {
  const paper = foldedFlatPaperScene(scene, {
    markHidden: true,
    toScenePx: (point: Point): ScenePoint => [point.x * THUMBNAIL_PX, -point.y * THUMBNAIL_PX],
    scale: THUMBNAIL_PX,
  });
  if (paper.items.length === 0) return null;
  const { svg } = paperSceneToSvg(paper, surfacePaperStyle(style, PAPER_STYLE_POLICIES['folded-flat']), THUMBNAIL_PAGE, 'figure');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
