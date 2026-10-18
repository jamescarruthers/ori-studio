/**
 * The Layers pane's two regions (redesign, 2026-10-18): the list over the
 * inspector, each scrolling on its own, with a separator between them that a
 * drag moves. Until it is dragged the list is as tall as its rows, up to half
 * the pane; after, it is the height the drag left it, within these bounds.
 */

/** The shortest the list is dragged to: three rows. */
export const LAYERS_LIST_MIN_PX = 84;

/** What the inspector always keeps, so a drag never hides the selection's controls. */
export const LAYERS_INSPECTOR_MIN_PX = 120;

/**
 * The list's height for a drag that would make it `height`, in a pane whose
 * regions share `room` (the pane less its header and the separator): at least
 * {@link LAYERS_LIST_MIN_PX}, and at most what leaves the inspector its
 * minimum — or the minimum itself, in a pane too short for both.
 */
export function clampLayersListHeight(height: number, room: number): number {
  const most = Math.max(LAYERS_LIST_MIN_PX, room - LAYERS_INSPECTOR_MIN_PX);
  return Math.round(Math.min(Math.max(height, LAYERS_LIST_MIN_PX), most));
}
