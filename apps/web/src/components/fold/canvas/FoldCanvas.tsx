import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CpSurfaceControls } from '../../../cp-workspace/surface/useCpSurface';
import { ToolOptionLayer } from '../../../cp-workspace/toolOptions/ToolOptionLayer';
import type { CpToolOptionWindow } from '../../../cp-workspace/toolOptions/toolOptionWindow';
import { altModifierLabel } from '../../../lib/platform';
import { useInheritedPaperStyle } from '../../../cp-workspace/paper/objectPaperStyle';
import { shortcutLabelForAction } from '../../../keyboard/shortcuts';
import { useIsCoarsePointerSurface } from '../../../platform/pointerSurface';
import { useIsPhoneLayout } from '../../../platform/phoneLayout';
import { useSettingsStore } from '../../../store/settingsStore';
import { useShortcutStore } from '../../../store/shortcutStore';
import { useThemeStore } from '../../../store/themeStore';
import { useFoldSession } from '../../../fold/session/useFoldSession';
import { foldTools, useFoldTools } from '../../../fold/tools/foldToolState';
import type { FoldKeyLabel } from '../../../fold/tools/foldToolCatalog';
import { foldToolWindow } from '../../../fold/tools/foldToolWindow';
import { foldToolKindControl, registerFoldCanvasVerbs } from '../../../fold/canvas/foldCanvasCommands';
import { registerFoldKindControl } from '../../../fold/sequence/foldCommands';
import {
  chooserBounds,
  foldChoiceNote,
  foldPromptWords,
  foldReverseWindowView,
  foldWindowPreview,
  sceneLayers,
} from '../../../fold/canvas/foldCanvasModel';
import { foldPaneOverlay } from '../../../fold/canvas/foldPaneOverlays';
import { setFoldPaneDisplay, useFoldPaneDisplay } from '../../../fold/canvas/foldPaneDisplay';
import type { FoldHit, FoldPaneId } from '../../../fold/canvas/foldPicking';
import { revealFoldedPane, useFoldPhonePane } from '../../../fold/canvas/foldPhonePane';
import { useFoldCanvasInks } from '../../../fold/canvas/useFoldCanvasInks';
import { useFoldCanvasPaint } from '../../../fold/canvas/useFoldCanvasPaint';
import { foldCanvasChoice, marksMadeAt, useFoldCanvasVerbs } from '../../../fold/canvas/useFoldCanvasVerbs';
import { useFoldCanvasShortcuts } from '../../../fold/canvas/useFoldCanvasShortcuts';
import { useFoldRailGroups, useFoldReadOnly } from '../../../fold/canvas/useFoldRailGroups';
import { useFoldStateView } from '../../../fold/canvas/useFoldStateView';
import { useFoldToolPreview } from '../../../fold/canvas/useFoldToolPreview';
import { useFoldStepLetters } from '../../../fold/canvas/useFoldStepLetters';
import { useFoldWindowInset } from '../../../fold/canvas/useFoldWindowInset';
import { useFoldWovenInterval } from '../../../fold/canvas/useFoldWovenInterval';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { shownFoldSequence } from '../../../store/workspaceStore/foldState';
import { ViewportStatusReadout } from '../../ui/ViewportStatusReadout';
import { FoldKindMark } from '../FoldKindMark';
import { FoldToolRail } from '../FoldToolRail';
import { FoldToolWindow } from '../FoldToolWindow';
import { FoldActionLayer } from './FoldActionLayer';
import { FoldAltLatchToggle } from './FoldAltLatchToggle';
import { FoldPane } from './FoldPane';
import { FoldPhoneBarControls } from './FoldPhoneBarControls';
import { FoldViewportToolbar } from './FoldViewportToolbar';
import { useFoldPanePlayback } from '../../../fold/canvas/useFoldPanePlayback';
import { FoldPlaybackControls } from '../FoldPlaybackControls';
import styles from './FoldCanvas.module.css';

/**
 * The Fold workspace's canvas (plan D11, D13, D14): the folded form on the
 * left and its crease pattern on the right, each a `FoldPane` on
 * `useCpSurface` painted through the shared paper painter in the user's
 * paper style; the tool rail down the left; the tool window over the
 * viewport's corner; the viewport toolbar along the bottom, with the step's
 * transport (Play draws the step from its parent on the folded pane,
 * `useFoldPanePlayback`). A crease pattern dropped on it is the panel's to
 * import (`useFoldDrop`, in `FoldPanel`). On a phone, one pane at a time,
 * and the rail's tools in a sheet opened from the bar, beside the pane switch
 * (`FoldPhoneBarControls`); the tool window starts as its title bar, so the
 * paper stays in view while points are picked (`FoldToolWindow`).
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
  const { verbs, queued } = useFoldCanvasVerbs(session, tools, view, preview);
  useEffect(() => registerFoldCanvasVerbs(verbs), [verbs]);
  // The menus' and the step cards' Valley / Mountain / Precrease arm the tools' fold.
  useEffect(() => registerFoldKindControl(foldToolKindControl(tools)), [tools]);

  const phone = useIsPhoneLayout();
  const coarse = useIsCoarsePointerSurface();
  const phonePane = useFoldPhonePane();
  const groups = useFoldRailGroups();
  const readOnly = useFoldReadOnly();
  const style = useInheritedPaperStyle();
  const wheelGesture = useSettingsStore((state) => state.cpWheelGesture);
  const snapRadius = useSettingsStore((state) => state.cpSnapRadius);
  const overrides = useShortcutStore((state) => state.overrides);
  const defaultsSource = useShortcutStore((state) => state.defaultsSource);
  const shortcuts = useMemo(() => ({ overrides, defaultsSource }), [overrides, defaultsSource]);
  const keyLabel = useCallback<FoldKeyLabel>((id) => shortcutLabelForAction(id, shortcuts), [shortcuts]);
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

  // --- What each pane paints, and frames: the camera fits on a new sequence or sheet, never on a fold.
  const summary = view.summary;
  const paint = useFoldCanvasPaint(view, preview, display, toolState.hoveredFlap, inks);
  const landed = preview.landed;
  const cpSummary = paint.creasePattern.summary;
  const sequenceId = useWorkspaceStore((state) => shownFoldSequence(state)?.document.id ?? 'blank');
  const sheetKey = summary ? summary.sheet.map(([x, y]) => `${x},${y}`).join(';') : 'none';
  const framingKey = `${sequenceId}:${sheetKey}`;

  // --- The step on screen played from its parent, on the folded pane, with its transport on the bar.
  // A phone shows one pane: a play turns it to the folded form, where the frames are drawn.
  const playback = useFoldPanePlayback({
    stepId: session.cursorId,
    sheet: summary?.sheet ?? null,
    display,
    reveal: phone ? revealFoldedPane : undefined,
  });

  // --- The tool's feedback on each pane.
  const firstPick = toolState.picks[0];
  const freeFrom = toolState.lineMode === 'free' && firstPick?.kind === 'free' && toolState.picks.length === 1 ? firstPick : null;
  const overlayFor = useCallback(
    (pane: FoldPaneId) => (hovered: FoldHit | null) =>
      inks
        ? foldPaneOverlay({
            pane,
            scene: view.scene,
            picks: toolState.picks,
            hovered: hovered?.pane === pane ? hovered : null,
            freeFrom,
            marks: view.marks,
            inks: inks.overlay,
          })
        : { points: null, strokes: null },
    [inks, view.scene, view.marks, toolState.picks, freeFrom]
  );
  const foldedOverlay = useMemo(() => overlayFor('folded'), [overlayFor]);
  const creaseOverlay = useMemo(() => overlayFor('crease-pattern'), [overlayFor]);

  // --- The letters the step's sentence names its references by, on the folded pane.
  const letters = useFoldStepLetters(session, view, preview, toolState.picks.length > 0);

  // --- The tool window, and the root chooser over the folded pane.
  const sequence = useWorkspaceStore((state) => shownFoldSequence(state)?.document ?? null);
  const marksHere = marksMadeAt(sequence, session.cursorId).length;
  const woven = useFoldWovenInterval(preview.section);
  const reverseView = foldReverseWindowView(toolState, preview);
  const windowModel = foldToolWindow(
    t,
    {
      tool: toolState.tool,
      lineMode: toolState.lineMode,
      readOnly,
      picks: toolState.picks.length,
      preview: foldWindowPreview(toolState, preview, woven.interval, queued),
      divide: { settings: toolState.divide, marks: marksHere },
      ...(reverseView ? { reverse: reverseView } : {}),
    },
    { ...verbs, setDivide: tools.setDivide, otherKind: verbs.setReverseKind },
    { coarse, alt: altModifierLabel() }
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
          note: foldChoiceNote(t, choice.kind),
          onStep: (delta) => verbs.stepChoice(delta),
          onApply: () => verbs.commit(),
          onCancel: () => verbs.cancel(),
        }
      : null;

  // --- The status chips.
  const layers = sceneLayers(view.scene);
  const prompt = foldPromptWords(t, toolState);
  const stepNumber = summary?.step ?? 0;
  const foldedStatus = (
    <ViewportStatusReadout hideOnPhone>
      <span>{t('panels:fold.canvas.folded', 'Folded')}</span>
      <span>{t('panels:fold.canvas.step', 'Step {{number}}', { number: stepNumber })}</span>
      <span>{t('panels:fold.canvas.layers', { count: layers, defaultValue_one: '{{count}} layer', defaultValue_other: '{{count}} layers' })}</span>
      {prompt && <span className={styles.prompt}>{prompt}</span>}
    </ViewportStatusReadout>
  );
  const counts = cpSummary?.creases;
  const creaseStatus = (
    <ViewportStatusReadout hideOnPhone>
      <span>{t('panels:fold.canvas.creasePattern', 'Crease pattern')}</span>
      <span className={styles.count}>
        <FoldKindMark kind="mountain" /> {counts?.mountain ?? 0}
      </span>
      <span className={styles.count}>
        <FoldKindMark kind="valley" /> {counts?.valley ?? 0}
      </span>
      {landed && <span>{t('panels:fold.canvas.adds', 'Dashed: creases this fold adds')}</span>}
    </ViewportStatusReadout>
  );

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
    <div
      className={styles.root}
      data-fold-canvas=""
      data-rail={phone ? undefined : ''}
    >
      {!phone && (
        <FoldToolRail groups={groups} keyLabel={keyLabel} header={coarse ? <FoldAltLatchToggle fill /> : undefined} />
      )}
      <div className={styles.viewport} ref={setViewport}>
        <div className={styles.panes} data-split={showFolded && showCreases ? '' : undefined}>
          {showFolded && (
            <FoldPane
              ref={folded}
              pane="folded"
              scene={paint.folded.scene}
              ink={paint.folded.ink}
              tint={paint.folded.tint}
              offset={paint.folded.offset}
              contentBounds={paint.folded.contentBounds}
              hitTest={(at, radii) => verbs.hitTest('folded', at, radii)}
              overlay={foldedOverlay}
              onHover={woven.onHover}
              onZoomPercentChange={setZoomPercent}
              status={foldedStatus}
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
                  <ToolOptionLayer option={chooser} view={camera} />
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
              scene={paint.creasePattern.scene}
              ink={paint.creasePattern.ink}
              contentBounds={paint.creasePattern.contentBounds}
              hitTest={(at, radii) => verbs.hitTest('crease-pattern', at, radii)}
              overlay={creaseOverlay}
              onZoomPercentChange={showFolded ? undefined : setZoomPercent}
              status={creaseStatus}
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
          playback={<FoldPlaybackControls playback={playback} shortcuts={shortcuts} compact={phone} />}
          phoneControls={phone ? <FoldPhoneBarControls /> : undefined}
          sendToEdit={sendToEdit}
        />
      </div>
      <FoldToolWindow container={viewport} model={windowModel} keyLabel={keyLabel} onFrame={setToolWindowFrame} />
    </div>
  );
}
