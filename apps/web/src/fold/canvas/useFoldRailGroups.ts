import { useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { foldRailGroups, type FoldRailGroup } from '../tools/foldRailGroups';
import type { FoldReadOnlyReason } from '../tools/foldToolCatalog';
import { foldTools, useFoldTools } from '../tools/foldToolState';
import { useFoldCursor, useFoldSessionState } from '../session/useFoldSession';
import { foldCanvasVerbs, subscribeFoldCanvasVerbs } from './foldCanvasCommands';

/**
 * Why nothing can change from the step on screen, or null while something
 * can: a newer build's sequence (D7), or a step locked behind one (D6).
 */
export function useFoldReadOnly(): FoldReadOnlyReason | null {
  const readOnly = useFoldSessionState((snapshot) => snapshot.readOnly);
  const cursor = useFoldCursor();
  if (readOnly) return 'newer';
  return cursor.status === 'locked' ? 'locked' : null;
}

/**
 * The rail's groups (`foldRailGroups`) for every surface that shows the Fold
 * tools — the rail beside the canvas, and the phone's tool sheet in the
 * header — bound to the tools and, for a turn, to the canvas's session verbs.
 */
export function useFoldRailGroups(): readonly FoldRailGroup[] {
  const { t } = useTranslation();
  const tool = useFoldTools((state) => state.tool);
  const lineMode = useFoldTools((state) => state.lineMode);
  const readOnly = useFoldReadOnly();
  // A turn is a step: it goes through the canvas's session verbs, which are
  // there only while a canvas is.
  const verbs = useSyncExternalStore(subscribeFoldCanvasVerbs, foldCanvasVerbs, () => null);
  return useMemo(() => {
    const tools = foldTools();
    return foldRailGroups(
      t,
      { tool, lineMode, readOnly },
      {
        selectTool: tools.selectTool,
        selectLineMode: tools.selectLineMode,
        turn: (turn) => verbs?.turn(turn),
      }
    );
  }, [t, tool, lineMode, readOnly, verbs]);
}
