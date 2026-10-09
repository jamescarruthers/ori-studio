import { useMemo } from 'react';
import type { FoldedSceneInk } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { UserBounds } from '../../cp-workspace/renderer/camera';
import type { FillGeometry } from '../../cp-workspace/renderer/types';
import type { Point } from '../../lib/geometry';
import type { PaperScene } from '../../lib/paper/paperScene';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import type { FoldStateSummary } from '../engine/foldEngineWire';
import { boundsOf, boundsToUser, transformLine, type Bounds } from './foldCanvasGeometry';
import { refusedFaceInks } from './foldCanvasModel';
import { foldMovingTint } from './foldPaneOverlays';
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
 * state on screen, with a located fold's line and its moving set lit over the
 * paper; and the crease pattern — of the previewed fold's landed state while
 * there is one, the creases it adds drawn as its instruction. The painter is
 * the shared one (`paperSceneToFoldedGeometry`, which the pane calls), with
 * the `fold` policy.
 */
export function useFoldCanvasPaint(
  view: FoldStateView,
  preview: FoldToolPreview,
  display: FoldPaneDisplay,
  hoveredFlap: number | null,
  inks: FoldCanvasInks | null
): FoldCanvasPaint {
  const { scene, summary, index } = view;
  const sheet = summary?.sheet;
  const offset = useMemo(() => (scene && sheet ? foldedDisplayOffset(scene, sheet) : NO_OFFSET), [scene, sheet]);
  const sheetBounds = useMemo(() => (sheet ? boundsOf(sheet.map(([x, y]) => ({ x, y }))) : null), [sheet]);

  const foldedScene = useMemo(() => {
    if (!scene) return null;
    const base = foldedPaneScene(scene, display, offset);
    const action = preview.action;
    return action ? withFoldLine(base, action.line, action.direction, offset) : base;
  }, [scene, display, offset, preview.action]);
  const foldedInk = useMemo<FoldedSceneInk>(
    () => ({
      policy: PAPER_STYLE_POLICIES.fold,
      faces: inks && scene ? refusedFaceInks(scene, preview, inks.danger) : undefined,
    }),
    [scene, preview, inks]
  );
  const { analysis, refused, section } = preview;
  // While the reverse fold's opening is being chosen, the way it opens is
  // lit instead: its blocks over the paper, the upper block lit again.
  const opening = preview.reverse && preview.reverse.ways.length > 1 ? preview.reverse.way : null;
  const tint = useMemo(() => {
    if (!index || !inks || !analysis || refused) return null;
    const lit = opening
      ? {
          faces: opening.openings.flatMap((each) => [...each.lower, ...each.upper]),
          hovered: opening.openings.flatMap((each) => each.upper),
        }
      : {
          faces: analysis.moving,
          hovered: hoveredFlap === null ? [] : (section?.flaps[hoveredFlap]?.faces ?? []),
        };
    return foldMovingTint(
      index,
      {
        line: transformLine(index.scene.view_transform, analysis.line),
        sign: analysis.side === 'positive' ? 1 : -1,
        ...lit,
      },
      inks.accent
    );
  }, [index, inks, analysis, refused, section, hoveredFlap, opening]);
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
