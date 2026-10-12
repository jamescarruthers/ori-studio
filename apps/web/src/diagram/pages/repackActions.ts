import type { TFunction } from 'i18next';
import { trackDiagramPagesRepacked, type DiagramRepackVia } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  buildDiagramPageActions,
  type DiagramPageActionState,
  type DiagramPageCommand,
} from '../actions/diagramPageActions';
import { stepsOf, type DiagramDocument } from '../document/diagramDocument';
import { paginate, type PlannedPage } from './pagePlan';

/**
 * Re-pack Page and Re-pack All Pages bound to the store
 * (`implementation-plans/diagram-flow-packing.md`, Decision 4): each one undo
 * step, counted with where it was pressed when it let an arrangement go.
 */

/** Re-pack Page on flow page `pageIndex` (from 0, as the layout numbers pages). Whether it changed. */
export function repackPage(pageIndex: number, via: DiagramRepackVia): boolean {
  if (!useWorkspaceStore.getState().repackDiagramPage(pageIndex)) return false;
  trackDiagramPagesRepacked('page', via);
  return true;
}

/** Re-pack All Pages. Whether it changed. */
export function repackAllPages(via: DiagramRepackVia): boolean {
  if (!useWorkspaceStore.getState().repackDiagramPages()) return false;
  trackDiagramPagesRepacked('all', via);
  return true;
}

/**
 * What the page verbs are gated on for the page that starts with step
 * `firstStepId` (null for a page with no steps): whether it — or any page —
 * holds an arrangement a re-pack would let go, a newer build's included, as
 * `repackPages` drops them.
 */
export function pageActionState(
  document: DiagramDocument,
  readOnly: boolean,
  firstStepId: string | null
): DiagramPageActionState {
  const own = document.pageArrangements ?? {};
  const newer = document.newer?.pageArrangements ?? {};
  const stored = (id: string) => Object.hasOwn(own, id) || Object.hasOwn(newer, id);
  return {
    flow: document.page.layout === 'flow',
    readOnly,
    pageStored: firstStepId !== null && stored(firstStepId),
    anyStored: Object.keys(own).length + Object.keys(newer).length > 0,
  };
}

/**
 * The page verbs for page `pageIndex` of `document`, `page` its steps' places
 * among the steps as `paginate` cuts it, bound and counted as pressed `via`.
 * None on a grid.
 */
export function bindDiagramPageActions(
  document: DiagramDocument,
  readOnly: boolean,
  pageIndex: number,
  page: Pick<PlannedPage, 'steps'>,
  t: TFunction,
  via: DiagramRepackVia
): DiagramPageCommand[] {
  const first = page.steps[0];
  const firstId = first === undefined ? null : (stepsOf(document)[first]?.id ?? null);
  return buildDiagramPageActions(pageActionState(document, readOnly, firstId), {
    t,
    repackPage: () => void repackPage(pageIndex, via),
    repackAll: () => void repackAllPages(via),
  });
}

/**
 * The page verbs for flow page `pageIndex` of the diagram as the store holds
 * it now: what a page's context menu offers as it opens. None on a grid, with
 * no diagram, or for a page that is not there.
 */
export function diagramPageActions(pageIndex: number, t: TFunction, via: DiagramRepackVia): DiagramPageCommand[] {
  const { diagram, diagramReadOnly } = useWorkspaceStore.getState();
  const page = diagram ? paginate(stepsOf(diagram), diagram.page)[pageIndex] : undefined;
  return diagram && page ? bindDiagramPageActions(diagram, diagramReadOnly, pageIndex, page, t, via) : [];
}
