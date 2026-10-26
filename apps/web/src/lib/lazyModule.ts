import { useSyncExternalStore } from 'react';
import { importOrReload } from './importOrReload';

/**
 * A chunk of the app loaded through one `import()` the first time something needs it: the
 * workspace behind the landing page (`routing/workspaceGateway.ts`), Fold behind the workspace
 * (`workspaces/foldGateway.ts`).
 *
 * One door per chunk, so whoever asks — a route, a pane, a menu verb — shares one load, and
 * code that must not wait (a render) can read whether it has landed without asking for it.
 */
export interface LazyModule<T> {
  /** Load it, once, whoever asks. A failed load (offline, say) is forgotten, so the next ask retries. */
  load(): Promise<T>;
  /** It, if it has loaded, without asking for it. */
  loaded(): T | null;
  /** It once it has loaded, for a render: re-renders when it lands. Never asks for it. */
  useLoaded(): T | null;
  resetForTest(): void;
}

export interface LazyModuleOptions {
  /**
   * Whether a chunk that is not there reloads the page (`importOrReload`), as
   * a tab opened before a deploy needs. True by default. A chunk asked for by
   * a verb in the middle of the user's work passes false: offline, a reload
   * there would throw the page away, so its load fails like any other and
   * its owner says so (the Layer order gateways, `layerOrderLoadFailure.ts`).
   */
  readonly reload?: boolean;
}

export function lazyModule<T>(importer: () => Promise<T>, options: LazyModuleOptions = {}): LazyModule<T> {
  let loading: Promise<T> | null = null;
  let loaded: T | null = null;
  const listeners = new Set<() => void>();

  const load = (): Promise<T> => {
    if (loading) return loading;
    const pending = (options.reload === false ? importer() : importOrReload(importer)).then((module) => {
      loaded = module;
      for (const listener of listeners) listener();
      return module;
    });
    pending.catch(() => {
      if (loading === pending) loading = null;
    });
    loading = pending;
    return pending;
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const current = (): T | null => loaded;

  return {
    load,
    loaded: current,
    useLoaded: () => useSyncExternalStore(subscribe, current, () => null),
    resetForTest: () => {
      loading = null;
      loaded = null;
      listeners.clear();
    },
  };
}
