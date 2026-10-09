import { useCallback, useEffect, useRef } from 'react';
import { focusOwnsArrowKeys } from '../../diagram/actions/diagramShortcuts';
import {
  registerViewportShortcutExecutor,
  releaseShortcutViewportSurface,
  setActiveShortcutViewportSurface,
} from '../../keyboard/shortcutRuntime';
import type { FoldShortcutId, ViewportShortcutId } from '../../keyboard/shortcuts';
import { registerFoldShortcutHandler } from '../foldShortcutScope';
import {
  FOLD_LINE_MODE_SHORTCUTS,
  FOLD_MODEL_TURNS,
  FOLD_TOOL_SHORTCUTS,
  type FoldLineModeId,
  type FoldToolId,
} from '../tools/foldToolCatalog';
import { foldCanvasVerbs } from './foldCanvasCommands';

/** Marks a pane of the Fold canvas: where Enter belongs to the canvas, which commits. */
export const FOLD_PANE_ATTRIBUTE = 'data-fold-pane';

/**
 * Whether Enter at this focus is the canvas's: focus on nothing, or on a pane
 * (a press focuses it). Anything else that holds focus — a button, a tab, a
 * field — keeps its own Enter, as the Diagram's steps leave it.
 */
export function focusLeavesEnterToFold(element: Element | null): boolean {
  if (element === null || element === element.ownerDocument.body) return true;
  return element.closest(`[${FOLD_PANE_ATTRIBUTE}]`) !== null;
}

const TOOL_BY_SHORTCUT = new Map<FoldShortcutId, FoldToolId>(
  (Object.entries(FOLD_TOOL_SHORTCUTS) as [FoldToolId, FoldShortcutId][]).map(([tool, id]) => [id, tool])
);
const LINE_MODE_BY_SHORTCUT = new Map<FoldShortcutId, FoldLineModeId>(
  (Object.entries(FOLD_LINE_MODE_SHORTCUTS) as [FoldLineModeId, FoldShortcutId][]).map(([mode, id]) => [id, mode])
);

/**
 * The canvas's tool keys (D14 Keyboard): what each claims, or declines. Pure
 * over the verbs and the focus, so the whole table is testable without a
 * canvas.
 */
export function runFoldCanvasShortcut(id: FoldShortcutId, focus: Element | null): boolean {
  const verbs = foldCanvasVerbs();
  if (!verbs) return false;
  const tool = TOOL_BY_SHORTCUT.get(id);
  if (tool !== undefined) {
    // A planned tool takes no key: it falls through rather than doing nothing.
    if (tool === 'inside-reverse') return false;
    verbs.selectTool(tool);
    return true;
  }
  const mode = LINE_MODE_BY_SHORTCUT.get(id);
  if (mode !== undefined) {
    verbs.selectLineMode(mode);
    return true;
  }
  switch (id) {
    case 'fold.turnOver':
      verbs.turn(FOLD_MODEL_TURNS['turn-over']);
      return true;
    case 'fold.rotate':
      verbs.turn(FOLD_MODEL_TURNS.rotate);
      return true;
    case 'fold.swapSide':
      verbs.swapSide();
      return true;
    case 'fold.previousCandidate':
    case 'fold.nextCandidate':
      // A control that moves with the arrows keeps them; with one root or none, the step keys may have them.
      if (focusOwnsArrowKeys(focus)) return false;
      return verbs.stepRoot(id === 'fold.nextCandidate' ? 1 : -1);
    case 'fold.commit':
      if (!focusLeavesEnterToFold(focus)) return false;
      return verbs.commit();
    default:
      // Another Fold surface's key: its own handler answers it.
      return false;
  }
}

/** The camera verbs of the canvas's panes, which the viewport's zoom keys drive. */
export interface FoldCanvasCamera {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actualSize: () => void;
}

/**
 * Bind the Fold canvas's keys while it is mounted, focus-independently
 * (AGENTS.md › Panel components): its tool rows in the `fold` scope's shared
 * executor (`registerFoldShortcutHandler`), and the `fold` viewport surface —
 * Escape's cancel ladder, and the zoom keys on the panes' cameras.
 *
 * The canvas claims the viewport surface on mount and on every press inside
 * it (`onPointerDownCapture`, returned here), and gives it up on unmount, so
 * the next workspace's viewport keys never go to a canvas that is gone.
 */
export function useFoldCanvasShortcuts(camera: FoldCanvasCamera): { onPointerDownCapture: () => void } {
  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  });

  useEffect(() => {
    setActiveShortcutViewportSurface('fold');
    const offScope = registerFoldShortcutHandler((id) => runFoldCanvasShortcut(id, document.activeElement));
    const offViewport = registerViewportShortcutExecutor('fold', (id: ViewportShortcutId) => {
      switch (id) {
        case 'viewport.cancel':
          return foldCanvasVerbs()?.cancel() ?? false;
        case 'viewport.zoomIn':
          cameraRef.current.zoomIn();
          return true;
        case 'viewport.zoomOut':
          cameraRef.current.zoomOut();
          return true;
        case 'viewport.fit':
          cameraRef.current.fit();
          return true;
        case 'viewport.actualSize':
          cameraRef.current.actualSize();
          return true;
        default:
          return false;
      }
    });
    return () => {
      offScope();
      offViewport();
      releaseShortcutViewportSurface('fold');
    };
  }, []);

  const onPointerDownCapture = useCallback(() => setActiveShortcutViewportSurface('fold'), []);
  return { onPointerDownCapture };
}
