import { useMemo } from 'react';
import type { FoldedSceneInk } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { LayerSpreadOptions } from '../../cp-workspace/folded/foldedLayerSpread';
import type { UserBounds } from '../../cp-workspace/renderer/camera';
import type { FillGeometry } from '../../cp-workspace/renderer/types';
import type { Point } from '../../lib/geometry';
import type { PaperScene } from '../../lib/paper/paperScene';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import type { FoldStateSummary } from '../engine/foldEngineWire';
import { boundsOf, boundsToUser, transformLine, type Bounds } from './foldCanvasGeometry';
import { refusedFaceInks } from './foldCanvasModel';
import { foldMovingTint, foldTargetsTint, joinFills } from './foldPaneOverlays';
import {
  creasePatternPaneScene,
  foldedDisplayOffset,
  foldedPaneScene,
  withFoldLine,
  type FoldPaneDisplay,
} from './foldPaneScenes';
import type { FoldCanvasInks } from './useFoldCanvasInks';
import type { FoldStateView } from './useFoldStateView';
import type { FoldToolPreview } from './useFoldToolPreview';

/** What one pane paints, and what its camera frames. */
export interface FoldPanePaint {
  scene: PaperScene | null;
  ink: FoldedSceneInk;
  /** In user space: the sheet, and on the folded pane the folded form too. */
  contentBounds: UserBounds | null;
}

export interface FoldCanvasPaint {
  folded: FoldPanePaint & {
    offset: Point;
    /** The moving set, lit over the paper on the pane's overlay fill channel. */
    tint: FillGeometry | null;
  };
  creasePattern: FoldPanePaint & {
    /** The state the crease pattern is of: the previewed fold's, while one has landed. */
    summary: FoldStateSummary | null;
  };
}

const CREASE_INK: FoldedSceneInk = { policy: PAPER_STYLE_POLICIES.fold };

/**
 * The spread the folded pane draws: the step's at rest, none once the tools
 * locate a fold — its line, what moves and the layers it is picked through
 * are drawn on the paper unspread.
 */
export function restingSpread(
  spread: LayerSpreadOptions | null,
  preview: Pick<FoldToolPreview, 'action' | 'analysis'>
): LayerSpreadOptions | null {
  return preview.action !== null || preview.analysis !== null ? null : spread;
}
const NO_OFFSET: Point = { x: 0, y: 0 };

function union(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a || !b) return a ?? b;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * What each pane of the Fold canvas paints (plan D11): the folded form of the
 * state on screen, with a located fold's line — a crimp's two — and its moving
 * set lit over the paper, a tuck's listed targets lit too; and the crease
 * pattern — of the previewed fold's landed state while
 * there is one, the creases it adds drawn as its instruction. The painter is
 * the shared one (`paperSceneToFoldedGeometry`, which the pane calls), with
 * the `fold` policy.
 *
 * The folded form's layers are spread by `spread`, the step's
 * (`foldStepSpread`), while the pane is at rest. Once the tools locate a fold
 * the paper lies flat: its line, the moving set lit over it and the layers it
 * is picked through are the engine's, unspread, and must lie on the paper
 * they describe. The top layer never moves under either kind of spread, so a
 * point picked on it before then is where it looks.
 */
export function useFoldCanvasPaint(
  view: FoldStateView,
  preview: FoldToolPreview,
  display: FoldPaneDisplay,
  hoveredFlap: number | null,
  inks: FoldCanvasInks | null,
  spread: LayerSpreadOptions | null = null
): FoldCanvasPaint {
  const { scene, summary, index } = view;
  const sheet = summary?.sheet;
  const offset = useMemo(() => (scene && sheet ? foldedDisplayOffset(scene, sheet) : NO_OFFSET), [scene, sheet]);
  const sheetBounds = useMemo(() => (sheet ? boundsOf(sheet.map(([x, y]) => ({ x, y }))) : null), [sheet]);
  const shownSpread = restingSpread(spread, preview);

  // A crimp's second line, beside its picture's first: the other letter on
  // the near layer, as a pleat's two creases are.
  const secondLine = preview.action ? (preview.crimp?.lines.second ?? null) : null;
  const foldedScene = useMemo(() => {
    if (!scene) return null;
    const base = foldedPaneScene(scene, display, offset, shownSpread);
    const action = preview.action;
    if (!action) return base;
    const along = withFoldLine(base, action.line, action.direction, offset);
    if (!secondLine) return along;
    return withFoldLine(along, secondLine, action.direction === 'valley' ? 'mountain' : 'valley', offset);
  }, [scene, display, offset, shownSpread, preview.action, secondLine]);
  const foldedInk = useMemo<FoldedSceneInk>(
    () => ({
      policy: PAPER_STYLE_POLICIES.fold,
      faces: inks && scene ? refusedFaceInks(scene, preview, inks.danger) : undefined,
    }),
    [scene, preview, inks]
  );
  const { analysis, refused, section } = preview;
  // While the reverse fold's opening is being chosen — or a crimp's at its
  // first line — the way it opens is lit instead: its blocks over the paper,
  // the upper block lit again.
  const opens = preview.reverse ?? preview.crimp;
  const opening = opens && opens.ways.length > 1 ? opens.way : null;
  // A tuck's targets: every layer listed to tuck against, the one taken brightest.
  const tuck = preview.tuck;
  const tint = useMemo(() => {
    if (!index || !inks) return null;
    const targets = tuck
      ? foldTargetsTint(
          index,
          { listed: tuck.targets.map((target) => target.face), taken: tuck.target?.face ?? null },
          inks.accent
        )
      : null;
    if (!analysis || refused) return targets;
    const lit = opening
      ? {
          faces: opening.openings.flatMap((each) => [...each.lower, ...each.upper]),
          hovered: opening.openings.flatMap((each) => each.upper),
        }
      : {
          faces: analysis.moving,
          hovered: hoveredFlap === null ? [] : (section?.flaps[hoveredFlap]?.faces ?? []),
        };
    const moving = foldMovingTint(
      index,
      {
        line: transformLine(index.scene.view_transform, analysis.line),
        sign: analysis.side === 'positive' ? 1 : -1,
        ...lit,
      },
      inks.accent
    );
    return joinFills(targets, moving);
  }, [index, inks, analysis, refused, section, hoveredFlap, opening, tuck]);
  const foldedBounds = useMemo(() => {
    const form = scene
      ? boundsOf(scene.subfaces.flatMap((cell) => cell.polygon.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }))))
      : null;
    const framed = union(sheetBounds, form);
    return framed ? boundsToUser(framed) : null;
  }, [scene, offset, sheetBounds]);

  const landed = preview.landed;
  const cpSource = landed?.scene ?? scene;
  const cpSummary = landed?.summary ?? summary;
  const cpScene = useMemo(
    () =>
      cpSource && cpSummary
        ? creasePatternPaneScene(cpSource, {
            display,
            sheet: cpSummary.sheet,
            step: cpSummary.step,
            instruction: landed?.added ?? null,
          })
        : null,
    [cpSource, cpSummary, display, landed]
  );
  const cpBounds = useMemo(() => (sheetBounds ? boundsToUser(sheetBounds) : null), [sheetBounds]);

  return {
    folded: { scene: foldedScene, ink: foldedInk, contentBounds: foldedBounds, offset, tint },
    creasePattern: { scene: cpScene, ink: CREASE_INK, contentBounds: cpBounds, summary: cpSummary },
  };
}
