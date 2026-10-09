import { registerConditionalScopeExecutor } from '../keyboard/shortcutRuntime';
import type { FoldShortcutId } from '../keyboard/shortcuts';

/**
 * The `fold` scope's one executor, shared by every Fold surface that binds
 * keys in it (plan D14): the canvas's tools, the step strip's arrows, the
 * player's Space. The runtime holds one executor per surface
 * (`registerConditionalScopeExecutor`), and a second registration would
 * silently replace the first and leave its keys dead; so each surface
 * registers a handler here instead, and the executor asks them in turn. The
 * first to claim a chord has it; when none does, the chord falls through to
 * the next scope, as a declining executor's does.
 */
export type FoldShortcutHandler = (id: FoldShortcutId) => boolean;

const handlers = new Set<FoldShortcutHandler>();
let releaseScope: (() => void) | null = null;

function execute(id: FoldShortcutId): boolean {
  for (const handler of handlers) if (handler(id)) return true;
  return false;
}

/** Bind a Fold surface's keys while it is mounted; returns the release. */
export function registerFoldShortcutHandler(handler: FoldShortcutHandler): () => void {
  handlers.add(handler);
  releaseScope ??= registerConditionalScopeExecutor('fold', execute);
  return () => {
    handlers.delete(handler);
    if (handlers.size > 0) return;
    releaseScope?.();
    releaseScope = null;
  };
}
