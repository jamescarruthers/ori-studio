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
import { creasePatternPaneLines, type FoldCreasePatternLines } from './foldCreasePatternLines';
import { foldMovingTint, foldTargetsTint, joinFills } from './foldPaneOverlays';
import { foldedDisplayOffset, foldedPaneScene, withFoldLine, type FoldPaneDisplay } from './foldPaneScenes';
import type { FoldCanvasInks } from './useFoldCanvasInks';
import type { FoldStateView } from './useFoldStateView';
import type { FoldToolPreview } from './useFoldToolPreview';

export interface FoldCanvasPaint {
  /** The folded form, as paper in the user's style. */
  folded: {
    scene: PaperScene | null;
    ink: FoldedSceneInk;
    /** In user space: the sheet and the folded form. */
    contentBounds: UserBounds | null;
    offset: Point;
    /** The moving set, lit over the paper on the pane's overlay fill channel. */
    tint: FillGeometry | null;
  };
  /** The crease pattern, as Edit's document lines (`creasePatternPaneLines`). */
  creasePattern: {
    lines: FoldCreasePatternLines | null;
    /** In user space: the sheet. */
    contentBounds: UserBounds | null;
    /** The state the crease pattern is of: the previewed fold's, while one has landed. */
    summary: FoldStateSummary | null;
  };
}

/**
 * The spread the folded pane draws: the step's at rest, none once a tool has
 * a pick in hand (`picking`) or has located a fold. A reference is picked on
 * the spread paper where the pane draws it (`useFoldPaneSpread`); from then
 * on the paper lies flat, so the picks, the lines they locate, what moves and
 * the layers a fold is picked through are drawn where they lie.
 */
export function restingSpread(
  spread: LayerSpreadOptions | null,
  preview: Pick<FoldToolPreview, 'action' | 'analysis'>,
  picking = false
): LayerSpreadOptions | null {
  return picking || preview.action !== null || preview.analysis !== null ? null : spread;
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
 * set lit over the paper, a tuck's listed targets lit too, through the shared
 * paper painter (`paperSceneToFoldedGeometry`, which the pane calls) with the
 * `fold` policy; and the crease pattern — of the previewed fold's landed
 * state while there is one, the creases it adds its instruction — as the
 * lines Edit's document would hold, which the canvas inks as Edit does
 * (`useFoldCreasePatternStrokes`).
 *
 * The folded form's layers are spread by `spread`: the step's
 * (`foldStepSpread`) while the pane is at rest, none once a tool picks or
 * locates a fold (`restingSpread`) — the line, the moving set lit over it and
 * the layers it is picked through are the engine's, unspread, and must lie on
 * the paper they describe. Under either kind of spread most faces move, a
 * face on top of its stack among them, so what is picked and hovered on the
 * spread paper is found and drawn where the spread puts it
 * (`useFoldPaneSpread`), not here.
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

  // A crimp's second line, beside its picture's first: the other letter on
  // the near layer, as a pleat's two creases are.
  const secondLine = preview.action ? (preview.crimp?.lines.second ?? null) : null;
  const foldedScene = useMemo(() => {
    if (!scene) return null;
    const base = foldedPaneScene(scene, display, offset, spread);
    const action = preview.action;
    if (!action) return base;
    const along = withFoldLine(base, action.line, action.direction, offset);
    if (!secondLine) return along;
    return withFoldLine(along, secondLine, action.direction === 'valley' ? 'mountain' : 'valley', offset);
  }, [scene, display, offset, spread, preview.action, secondLine]);
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
  const cpLines = useMemo(
    () =>
      cpSource && cpSummary
        ? creasePatternPaneLines(cpSource, { display, step: cpSummary.step, instruction: landed?.added ?? null })
        : null,
    [cpSource, cpSummary, display, landed]
  );
  const cpBounds = useMemo(() => (sheetBounds ? boundsToUser(sheetBounds) : null), [sheetBounds]);

  return {
    folded: { scene: foldedScene, ink: foldedInk, contentBounds: foldedBounds, offset, tint },
    creasePattern: { lines: cpLines, contentBounds: cpBounds, summary: cpSummary },
  };
}
