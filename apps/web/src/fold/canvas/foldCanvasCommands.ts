import type { FoldKindControl } from '../sequence/foldCommands';
import { isFoldKind } from '../tools/foldToolCatalog';
import type { FoldTools } from '../tools/foldToolState';
import type { FoldCanvasVerbs } from './useFoldCanvasVerbs';

/**
 * The fold kind the menus and the step cards arm (`registerFoldKindControl`),
 * as the tools hold it: the plain fold in hand, or none while another tool
 * is — a compound or vertex fold, a sink, the Divide line — so no kind reads
 * as chosen. Arming a kind takes that fold in hand, as V, M and P do.
 */
export function foldToolKindControl(tools: FoldTools): FoldKindControl {
  return {
    kind: () => {
      const tool = tools.store.getState().tool;
      return isFoldKind(tool) ? tool : null;
    },
    arm: (kind) => tools.selectTool(kind),
  };
}

/**
 * The Fold canvas's verbs, for what is not inside it: the keyboard's
 * executor (`useFoldCanvasShortcuts`) and the phone's header pills, which
 * sit in the panel's header beside the canvas. The canvas registers its
 * verbs while it is mounted; with none mounted there is nothing to press,
 * and every caller declines.
 *
 * One live set at a time, as `registerConditionalScopeExecutor` holds one
 * executor per surface: a newer registration replaces an older one, whose
 * release then leaves it be.
 */
let current: FoldCanvasVerbs | null = null;
const listeners = new Set<() => void>();

export function registerFoldCanvasVerbs(verbs: FoldCanvasVerbs): () => void {
  current = verbs;
  for (const listener of listeners) listener();
  return () => {
    if (current !== verbs) return;
    current = null;
    for (const listener of listeners) listener();
  };
}

/** The canvas's verbs, while one is mounted. */
export function foldCanvasVerbs(): FoldCanvasVerbs | null {
  return current;
}

/** How long a verb asked for before the canvas is up waits for it: a view switch mounts it in the same commit. */
const CANVAS_PATIENCE_MS = 2000;

/**
 * Run `act` on the canvas's verbs: at once while a canvas is mounted, or as
 * soon as one registers — the rail beside the Steps view opens the canvas
 * and then turns the model on it. Dropped if no canvas comes within
 * `patienceMs`, so a press never lands on a canvas opened much later.
 */
export function withFoldCanvasVerbs(act: (verbs: FoldCanvasVerbs) => void, patienceMs = CANVAS_PATIENCE_MS): void {
  if (current) {
    act(current);
    return;
  }
  const stop = () => {
    clearTimeout(timer);
    listeners.delete(listener);
  };
  const listener = () => {
    if (!current) return;
    const verbs = current;
    stop();
    act(verbs);
  };
  const timer = setTimeout(stop, patienceMs);
  listeners.add(listener);
}

/** Hear when a canvas comes or goes: shaped for `useSyncExternalStore`, with {@link foldCanvasVerbs}. */
export function subscribeFoldCanvasVerbs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
