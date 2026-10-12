import { trackDiagramPlacementReset, trackDiagramStepPlaced } from '../../analytics/trackDiagram';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { stepById, type DiagramPlaceReset } from '../document/diagramDocument';
import type { DiagramStepPlacePatch } from '../document/stepPlace';
import { setFrameScale } from '../zoom/zoomFrames';

/** How a commit that put a part back home was made, as the reset event names it. */
const RESET_VIA = { drag: 'drag_home', keys: 'keys', pane: 'pane' } as const;

/**
 * Commit a hand placement, and count it: as a placement, or — where the
 * store's normalised result leaves the part where the layout puts it (a drag
 * that snapped home, nudges back to where they started, a 0 typed) — as a
 * reset, by how it was made.
 */
export function commitPlacement(
  stepId: string,
  patch: DiagramStepPlacePatch,
  via: 'drag' | 'keys' | 'pane',
  options?: { loadId?: number; session?: number },
): boolean {
  if (!useWorkspaceStore.getState().setDiagramStepPlace(stepId, patch, options)) return false;
  const part =
    patch.scale !== undefined
      ? 'size'
      : ((['frame', 'number', 'picture', 'text'] as const).find((key) => patch[key] !== undefined) ?? 'frame');
  const { diagram } = useWorkspaceStore.getState();
  const place = diagram ? stepById(diagram, stepId)?.place : undefined;
  if (place?.[part === 'size' ? 'scale' : part] === undefined) trackDiagramPlacementReset(part, 'step', RESET_VIA[via]);
  else trackDiagramStepPlaced(part, via, diagram?.page.layout ?? 'flow');
  return true;
}

export function resetPlacement(stepId: string, part: DiagramPlaceReset, via: 'pane' | 'menu' = 'pane'): void {
  if (useWorkspaceStore.getState().resetDiagramStepPlace(stepId, part))
    trackDiagramPlacementReset(
      part === 'scale' ? 'size' : part === 'all' || part === 'position' ? 'step' : part,
      'step',
      via,
    );
}

export function resetPagePlacements(index: number | null): void {
  if (useWorkspaceStore.getState().resetDiagramPlaces(index))
    trackDiagramPlacementReset('step', index === null ? 'diagram' : 'page', 'pane');
}

export function commitZoomSize(stepId: string, scale: number | null, via: 'drag' | 'pane', loadId?: number): boolean {
  const store = useWorkspaceStore.getState();
  if (!store.diagram || !stepById(store.diagram, stepId)?.zoom) return false;
  const changed = store.editDiagramStepZoom(
    stepId,
    'Set enlarged size',
    (document) => setFrameScale(document, stepId, scale),
    { loadId },
  );
  if (changed) trackDiagramStepPlaced('size', via, store.diagram.page.layout);
  return changed;
}
