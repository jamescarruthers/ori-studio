import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CpSurfaceControls } from '../../../cp-workspace/surface/useCpSurface';
import { ToolOptionLayer } from '../../../cp-workspace/toolOptions/ToolOptionLayer';
import type { CpToolOptionWindow } from '../../../cp-workspace/toolOptions/toolOptionWindow';
import { altModifierLabel } from '../../../lib/platform';
import { useInheritedPaperStyle } from '../../../cp-workspace/paper/objectPaperStyle';
import { useIsCoarsePointerSurface } from '../../../platform/pointerSurface';
import { useIsPhoneLayout } from '../../../platform/phoneLayout';
import { useSettingsStore } from '../../../store/settingsStore';
import { useThemeStore } from '../../../store/themeStore';
import { useFoldSession } from '../../../fold/session/useFoldSession';
import { foldTools, useFoldTools } from '../../../fold/tools/foldToolState';
import { foldToolWindow } from '../../../fold/tools/foldToolWindow';
import { useFoldShortcutLabels } from '../../../fold/tools/useFoldShortcutLabels';
import { foldToolKindControl, registerFoldCanvasVerbs } from '../../../fold/canvas/foldCanvasCommands';
import { registerFoldKindControl } from '../../../fold/sequence/foldCommands';
import {
  chooserBounds,
  chooserKeys,
  foldAlongOverlay,
  foldChoiceNote,
  foldCrimpWindowView,
  foldFreeLineStart,
  foldLocatedLines,
  foldReverseWindowView,
  foldShownPicks,
  foldSinkWindowView,
  foldTuckWindowView,
  foldVertexWindowView,
  foldWindowPreview,
} from '../../../fold/canvas/foldCanvasModel';
import { useFoldFanMarks } from '../../../fold/canvas/vertex/useFoldFanMarks';
import { useFoldPetalMarks } from '../../../fold/canvas/vertex/useFoldPetalMarks';
import { useFoldSwivelMarks } from '../../../fold/canvas/vertex/useFoldSwivelMarks';
import { useFoldVertexMarks } from '../../../fold/canvas/vertex/useFoldVertexMarks';
import { foldPaneOverlay, joinFills } from '../../../fold/canvas/foldPaneOverlays';
import { setFoldPaneDisplay, useFoldPaneDisplay } from '../../../fold/canvas/foldPaneDisplay';
import type { FoldHit, FoldPaneId } from '../../../fold/canvas/foldPicking';
import { revealFoldedPane, useFoldPhonePane } from '../../../fold/canvas/foldPhonePane';
import { useFoldCanvasInks } from '../../../fold/canvas/useFoldCanvasInks';
import { restingSpread, useFoldCanvasPaint } from '../../../fold/canvas/useFoldCanvasPaint';
import { useFoldCreasePatternStrokes } from '../../../fold/canvas/useFoldCreasePatternStrokes';
import { foldCanvasChoice, marksMadeAt, useFoldCanvasVerbs } from '../../../fold/canvas/useFoldCanvasVerbs';
import { useFoldCanvasShortcuts } from '../../../fold/canvas/useFoldCanvasShortcuts';
import { useFoldReadOnly } from '../../../fold/canvas/useFoldRailGroups';
import { useFoldPaneSpread } from '../../../fold/canvas/useFoldPaneSpread';
import { useFoldStateView } from '../../../fold/canvas/useFoldStateView';
import { useFoldToolPreview } from '../../../fold/canvas/useFoldToolPreview';
import { useFoldStepLetters } from '../../../fold/canvas/useFoldStepLetters';
import { useFoldWindowInset } from '../../../fold/canvas/useFoldWindowInset';
import { useFoldWovenInterval } from '../../../fold/canvas/useFoldWovenInterval';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { shownFoldSequence } from '../../../store/workspaceStore/foldState';
import { FoldToolWindow } from '../FoldToolWindow';
import { FoldActionLayer } from './FoldActionLayer';
import { FoldPane } from './FoldPane';
import { FoldPhoneBarControls } from './FoldPhoneBarControls';
import { FoldViewportToolbar } from './FoldViewportToolbar';
import { useFoldPanePlayback } from '../../../fold/canvas/useFoldPanePlayback';
import {
  useFoldStepPlaySpreads,
  useFoldStepSpread,
  useFoldStepSpreadShown,
} from '../../../fold/sequence/useFoldStepSpread';
import { FoldPlaybackControls } from '../FoldPlaybackControls';
import styles from './FoldCanvas.module.css';

/**
 * The Fold workspace's canvas (plan D11, D13, D14): the folded form on the
 * left, painted through the shared paper painter in the user's paper style,
 * and its crease pattern on the right, drawn as Edit's canvas draws one
 * (`useFoldCreasePatternStrokes`) — each a `FoldPane` on `useCpSurface`;
 * the tool window over the viewport's corner; the viewport
 * toolbar along the bottom, with the step's transport (Play draws the step
 * from its parent on the folded pane, `useFoldPanePlayback`). The tool rail
 * is the panel's, down its whole side (`FoldWorkspaceRail`). A crease pattern
 * dropped on it is the panel's to import (`useFoldDrop`, in `FoldPanel`). On
 * a phone, one pane at a time, and the rail's tools in a sheet opened from
 * the bar, beside the pane switch (`FoldPhoneBarControls`); the tool window
 * starts as its title bar, so the paper stays in view while points are
 * picked (`FoldToolWindow`).
 *
 * A composition site: what the tools do is `fold/tools` (the state, the
 * registry, the step builder) and `fold/canvas` (picking, the pipeline to the
 * session, the verbs, the keys); this mounts them and hands each surface its
 * part. `sendToEdit` is the toolbar's slot for that verb, which the panel
 * supplies.
 */
export function FoldCanvas({ sendToEdit }: { sendToEdit?: ReactNode }) {
  const { t } = useTranslation();
  // The composition site holds the engine: while the canvas is up, the worker runs and the sequence replays.
  const session = useFoldSession();
  const view = useFoldStateView();
  const tools = foldTools();
  const toolState = useFoldTools((state) => state);
  const preview = useFoldToolPreview(session, view, toolState);
  // The folded form's layers spread as the step on screen says, its switch on
  // the bar — at rest: flat once a tool picks, or locates a fold. Spread, the
  // paper is picked, hovered and lettered where it is drawn.
  const picking = toolState.picks.length > 0;
  const stepSpread = useFoldStepSpreadShown(view.cursorId);
  const shownSpread = restingSpread(stepSpread, preview, picking);
  const paneSpread = useFoldPaneSpread(view, shownSpread);
  const { verbs, queued } = useFoldCanvasVerbs(session, tools, view, preview, paneSpread.index);
  useEffect(() => registerFoldCanvasVerbs(verbs), [verbs]);
  // The menus' and the step cards' Valley / Mountain / Precrease arm the tools' fold.
  useEffect(() => registerFoldKindControl(foldToolKindControl(tools)), [tools]);

  const phone = useIsPhoneLayout();
  const coarse = useIsCoarsePointerSurface();
  const phonePane = useFoldPhonePane();
  const readOnly = useFoldReadOnly();
  const style = useInheritedPaperStyle();
  const wheelGesture = useSettingsStore((state) => state.cpWheelGesture);
  const snapRadius = useSettingsStore((state) => state.cpSnapRadius);
  const { shortcuts, keyLabel } = useFoldShortcutLabels();
  const theme = useThemeStore((state) => state.currentTheme);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [toolWindowFrame, setToolWindowFrame] = useState<HTMLElement | null>(null);
  // A phone's tool window spans the pane: the paper is fitted above it.
  const inset = useFoldWindowInset(viewport, toolWindowFrame, phone);
  const inks = useFoldCanvasInks(viewport, theme.name);
  // Shared with the step strip, whose cards are the folded pane's pictures.
  const display = useFoldPaneDisplay();
  const [zoomPercent, setZoomPercent] = useState(100);

  // --- The camera verbs of both panes: the toolbar and the zoom keys drive them together.
  const folded = useRef<CpSurfaceControls | null>(null);
  const creases = useRef<CpSurfaceControls | null>(null);
  const eachPane = useCallback((run: (controls: CpSurfaceControls) => void) => {
    for (const controls of [folded.current, creases.current]) if (controls) run(controls);
  }, []);
  const zoomIn = useCallback(() => eachPane((controls) => controls.zoomIn()), [eachPane]);
  const zoomOut = useCallback(() => eachPane((controls) => controls.zoomOut()), [eachPane]);
  const fit = useCallback(() => eachPane((controls) => controls.fit()), [eachPane]);
  const setZoom = useCallback((percent: number) => eachPane((controls) => controls.setZoomPercent(percent)), [eachPane]);
  const camera = useMemo(
    () => ({ zoomIn, zoomOut, fit, actualSize: () => setZoom(100), setZoomPercent: setZoom }),
    [zoomIn, zoomOut, fit, setZoom]
  );
  useFoldCanvasShortcuts(camera);

  // --- What each pane paints, and frames: the camera fits on a new sequence or sheet, and the folded
  // pane fits again when the step on screen changes to a form that has left it — never a camera the
  // user has moved.
  const summary = view.summary;
  const spread = useFoldStepSpread(view.cursorId, 'canvas_bar');
  // A rabbit ear's given creases, and the regions its paper that stays is picked among, from its clicks;
  // a petal fold's hinge, and the flaps below it the pointer finds.
  const fanMarks = useFoldFanMarks(view.index, toolState);
  const petalMarks = useFoldPetalMarks(session, view.index, toolState);
  // A swivel's edges that can swing, then the lines its edge lands on, and the swivel under the pointer.
  const swivelMarks = useFoldSwivelMarks(view.index, toolState, preview.vertex?.reach ?? null, inks);
  const pending = fanMarks?.pending ?? petalMarks.pending ?? swivelMarks.pending;
  const regions = fanMarks?.regions ?? petalMarks.regions;
  const paint = useFoldCanvasPaint(view, preview, display, toolState.hoveredFlap, inks, shownSpread, pending);
  const foldedTint = useMemo(() => joinFills(paint.folded.tint, swivelMarks.tint), [paint.folded.tint, swivelMarks.tint]);
  // The crease pattern as Edit's canvas draws one, not as paper.
  const cpStrokes = useFoldCreasePatternStrokes(paint.creasePattern.lines, viewport, theme.name);
  const sequenceId = useWorkspaceStore((state) => shownFoldSequence(state)?.document.id ?? 'blank');
  const sheetKey = summary ? summary.sheet.map(([x, y]) => `${x},${y}`).join(';') : 'none';
  const framingKey = `${sequenceId}:${sheetKey}`;

  // --- The step on screen played from its parent, on the folded pane, with its transport on the bar.
  // A phone shows one pane: a play turns it to the folded form, where the frames are drawn. The
  // play eases between the spreads the pane shows the parent and the step at rest.
  const playSpreads = useFoldStepPlaySpreads(session.cursorId);
  const playback = useFoldPanePlayback({
    stepId: session.cursorId,
    sheet: summary?.sheet ?? null,
    display,
    reveal: phone ? revealFoldedPane : undefined,
    spreads: playSpreads && {
      before: restingSpread(playSpreads.before, preview, picking),
      after: restingSpread(playSpreads.after, preview, picking),
    },
  });

  // --- The tool's feedback on each pane: a crimp's first line while its
  // second is located; a vertex fold's vertex and choices on the folded one
  // (its creases are paper, `useFoldCanvasPaint`).
  const freeFrom = foldFreeLineStart(toolState);
  const crimpLines = preview.crimp?.lines ?? null;
  const located = useMemo(
    () => foldLocatedLines(toolState.tool, preview.action !== null, crimpLines),
    [toolState.tool, preview.action, crimpLines]
  );
  const previewMarks = useFoldVertexMarks(view.index, preview.vertex, toolState.compound.squashTarget, inks?.overlay ?? null);
  const vertexMarks = previewMarks ?? swivelMarks.marks;
  const swivelOffered = swivelMarks.offered;
  // A partial precrease's line on each pane, and its points along it.
  const along = useMemo(
    () => foldAlongOverlay(preview.extent, toolState.extent, toolState.extentPicks),
    [preview.extent, toolState.extent, toolState.extentPicks]
  );
  // A swivel's pivot once its vertex is drawn in its place.
  const shownPicks = foldShownPicks(toolState, preview, swivelMarks.hovered !== null);
  const overlayFor = useCallback(
    (pane: FoldPaneId) => (hovered: FoldHit | null) =>
      inks
        ? foldPaneOverlay({
            pane,
            scene: view.scene,
            picks: shownPicks,
            hovered: hovered?.pane === pane ? hovered : null,
            freeFrom,
            located,
            marks: view.marks,
            inks: inks.overlay,
            tool: pane === 'folded' ? vertexMarks : null,
            spread: paneSpread.map,
            along: along?.[pane] ?? null,
            regions: regions?.[pane] ?? null,
            offered: swivelOffered?.[pane] ?? null,
          })
        : { points: null, strokes: null },
    [inks, view.scene, view.marks, shownPicks, freeFrom, located, vertexMarks, paneSpread.map, along, regions, swivelOffered]
  );
  const foldedOverlay = useMemo(() => overlayFor('folded'), [overlayFor]);
  const creaseOverlay = useMemo(() => overlayFor('crease-pattern'), [overlayFor]);

  // --- The letters the step's sentence names its references by, on the folded pane.
  const letters = useFoldStepLetters(session, view, preview, picking, paneSpread.map);

  // --- The tool window, and the root chooser over the folded pane.
  const sequence = useWorkspaceStore((state) => shownFoldSequence(state)?.document ?? null);
  const marksHere = marksMadeAt(sequence, session.cursorId).length;
  const woven = useFoldWovenInterval(preview.section);
  // The folded pane's hover: a woven section's stack, a petal fold's flap, a
  // swivel's line; the crease pattern's, the flap and the line.
  const { onHover: onWovenHover } = woven;
  const { onHover: onPetalHover } = petalMarks;
  const { onHover: onSwivelHover } = swivelMarks;
  const onFoldedHover = useCallback(
    (hit: FoldHit | null) => {
      onWovenHover(hit);
      onPetalHover(hit);
      onSwivelHover(hit);
    },
    [onWovenHover, onPetalHover, onSwivelHover]
  );
  const onCreaseHover = useCallback(
    (hit: FoldHit | null) => {
      onPetalHover(hit);
      onSwivelHover(hit);
    },
    [onPetalHover, onSwivelHover]
  );
  const reverseView = foldReverseWindowView(toolState, preview);
  const crimpView = foldCrimpWindowView(toolState, preview);
  const tuckView = foldTuckWindowView(toolState, preview);
  const vertexView = foldVertexWindowView(toolState, preview);
  const sinkView = foldSinkWindowView(toolState, preview, view.scene?.view.flipped ?? false);
  const windowModel = foldToolWindow(
    t,
    {
      tool: toolState.tool,
      foldAndUnfold: toolState.foldAndUnfold,
      lineMode: toolState.lineMode,
      readOnly,
      picks: toolState.picks.length,
      preview: foldWindowPreview(toolState, preview, woven.interval, queued),
      divide: { settings: toolState.divide, marks: marksHere },
      ...(reverseView ? { reverse: reverseView } : {}),
      secondLineMode: toolState.secondLineMode,
      ...(crimpView ? { crimp: crimpView } : {}),
      ...(tuckView ? { tuck: tuckView } : {}),
      ...(vertexView ? { vertex: vertexView } : {}),
      ...(sinkView ? { sink: sinkView } : {}),
      extent: { mode: toolState.extent, picked: toolState.extentPicks.length },
      rotate: { rotation: toolState.rotation },
    },
    {
      ...verbs,
      setDivide: tools.setDivide,
      otherKind: verbs.setReverseKind,
      tuckTarget: verbs.tuckTarget,
      setRotation: tools.setRotation,
    },
    { coarse, alt: altModifierLabel(), keyLabel }
  );
  // The chooser over the folded pane: the deepest choice with more than one answer.
  const choice = foldCanvasChoice(preview, toolState);
  const bounds = chooserBounds(preview, view.scene);
  const chooser: CpToolOptionWindow | null =
    choice && bounds
      ? {
          bounds,
          index: choice.index,
          count: choice.count,
          note: foldChoiceNote(t, choice.kind, chooserKeys(keyLabel, coarse)),
          onStep: (delta) => verbs.stepChoice(delta),
          onApply: () => verbs.commit(),
          onCancel: () => verbs.cancel(),
        }
      : null;

  const showFolded = !phone || phonePane === 'folded';
  const showCreases = !phone || phonePane === 'crease-pattern';
  const paneProps = {
    style,
    framingKey,
    inset,
    wheelGesture,
    snapRadius,
    inkKey: theme.name,
    onPick: verbs.pick,
  };

  return (
    <div className={styles.root} data-fold-canvas="">
      <div className={styles.viewport} ref={setViewport}>
        <div className={styles.panes} data-split={showFolded && showCreases ? '' : undefined}>
          {showFolded && (
            <FoldPane
              ref={folded}
              pane="folded"
              scene={paint.folded.scene}
              ink={paint.folded.ink}
              tint={foldedTint}
              offset={paint.folded.offset}
              contentBounds={paint.folded.contentBounds}
              keepInViewKey={paint.folded.keepInView}
              hitTest={(at, radii) => verbs.hitTest('folded', at, radii)}
              overlay={foldedOverlay}
              onHover={onFoldedHover}
              onZoomPercentChange={setZoomPercent}
              posedScene={playback.frames}
              layers={(camera) => (
                <>
                  {inks && (
                    <FoldActionLayer
                      action={preview.action}
                      letters={letters}
                      view={camera}
                      style={style}
                      outline={view.scene?.subfaces.flatMap((cell) => cell.polygon) ?? []}
                      ground={inks.ground}
                    />
                  )}
                  {/* A phone's pane is narrow and the tool window covers its bottom: the chooser stays in view. */}
                  <ToolOptionLayer
                    option={chooser}
                    view={camera}
                    keepInView={phone ? { coveredBottom: inset?.bottom ?? 0 } : undefined}
                  />
                </>
              )}
              ariaLabel={t(
                'panels:fold.canvas.foldedLabel',
                'The folded form. Click its points and creases to locate a fold; drag to pan, scroll to zoom.'
              )}
              {...paneProps}
            />
          )}
          {showCreases && (
            <FoldPane
              ref={creases}
              pane="crease-pattern"
              scene={null}
              creases={cpStrokes}
              contentBounds={paint.creasePattern.contentBounds}
              hitTest={(at, radii) => verbs.hitTest('crease-pattern', at, radii)}
              overlay={creaseOverlay}
              onHover={onCreaseHover}
              onZoomPercentChange={showFolded ? undefined : setZoomPercent}
              ariaLabel={t(
                'panels:fold.canvas.creasePatternLabel',
                'The crease pattern so far, front up. Click its points and creases to locate a fold.'
              )}
              {...paneProps}
            />
          )}
        </div>
        <FoldViewportToolbar
          zoomPercent={zoomPercent}
          camera={camera}
          display={display}
          onDisplay={setFoldPaneDisplay}
          spread={spread?.toggle ?? null}
          playback={<FoldPlaybackControls playback={playback} shortcuts={shortcuts} compact={phone} />}
          phoneControls={phone ? <FoldPhoneBarControls /> : undefined}
          sendToEdit={sendToEdit}
        />
      </div>
      <FoldToolWindow container={viewport} model={windowModel} keyLabel={keyLabel} onFrame={setToolWindowFrame} />
    </div>
  );
}
