import { useCallback, useMemo } from 'react';
import { trackDiagramPageSetupChanged, type DiagramPageSetting } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  DEFAULT_DIAGRAM_STYLE,
  DEFAULT_PAGE_SETUP,
  defaultHanStyle,
  type DiagramHanStyle,
  type DiagramPageSetup,
  type DiagramStep,
  stepsOf,
} from '../document/diagramDocument';
import type { DiagramStyleChoice } from './diagramStyleChoices';
import { pageCapacity, paginate } from './pagePlan';

const NO_STEPS: readonly DiagramStep[] = [];

/**
 * The Page pane's store bindings (AGENTS.md › Panel components): the page
 * setup, a flow page's own count of steps, style and Han style, each change
 * one undo step and one count of which setting changed, and how many pages
 * the steps make.
 *
 * The flow path's colour is not here: its row binds itself
 * (`usePathColorPick`), so that a pick's moves re-render the row alone.
 */
export function useDiagramPageSetup() {
  const page = useWorkspaceStore((state) => state.diagram?.page ?? DEFAULT_PAGE_SETUP);
  const style = useWorkspaceStore((state) => state.diagram?.style ?? DEFAULT_DIAGRAM_STYLE);
  // A diagram not made yet takes the author's language's, as its first edit will.
  const hanStyle = useWorkspaceStore(
    (state) =>
      state.diagram?.hanStyle ?? defaultHanStyle(typeof document === 'undefined' ? null : document.documentElement.lang)
  );
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const steps = useWorkspaceStore((state) => (state.diagram ? stepsOf(state.diagram) : NO_STEPS));
  // A page without a count of its own holds this many: the grid's readout.
  const perPage = pageCapacity(page);
  const pageCount = useMemo(() => paginate(steps, page).length, [steps, page]);

  const setPage = useCallback((patch: Partial<DiagramPageSetup>, setting: DiagramPageSetting) => {
    if (useWorkspaceStore.getState().setDiagramPage(patch)) trackDiagramPageSetupChanged(setting);
  }, []);
  /** Give flow page `pageIndex` its own count of steps, or with null return it to the default. */
  const setPageSteps = useCallback((pageIndex: number, count: number | null) => {
    if (useWorkspaceStore.getState().setDiagramPageSteps(pageIndex, count)) {
      trackDiagramPageSetupChanged(count === null ? 'page_steps_reset' : 'page_steps');
    }
  }, []);
  const setStyle = useCallback((choice: DiagramStyleChoice) => {
    if (useWorkspaceStore.getState().setDiagramStyle(choice.style)) {
      trackDiagramPageSetupChanged('style', choice.analytics);
    }
  }, []);
  const setHanStyle = useCallback((next: DiagramHanStyle) => {
    if (useWorkspaceStore.getState().setDiagramHanStyle(next)) trackDiagramPageSetupChanged('han_style');
  }, []);

  return {
    page,
    style,
    hanStyle,
    readOnly,
    stepCount: steps.length,
    perPage,
    pageCount,
    setPage,
    setPageSteps,
    setStyle,
    setHanStyle,
  };
}
