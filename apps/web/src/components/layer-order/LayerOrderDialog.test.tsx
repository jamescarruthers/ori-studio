/**
 * The Layer order dialog's shell, as a host meets it: its gateway, the app
 * root's mount and the dialog over the real engine runtime and worker shell,
 * with the global `Worker` replaced by a spy that runs the fake backend.
 *
 * Gates (row U4): importing the gateway and rendering the mount spawn no
 * worker and load no dialog code, only an open does; opening → ready → Apply
 * answers `applied`; Cancel answers `cancelled` and terminates the worker; a
 * refusal shows its copy; a lost engine shows so, and Try again reopens.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_LAYER_ORDER_FIGURE,
  FAKE_LAYER_ORDER_SOURCE,
  FakeLayerOrderWorker,
  createFakeLayerOrderBackend,
  fakeLayerOrderScene,
  type FakeLayerOrderBackend,
} from '../../layer-order/engine/layerOrderEngine.fixtures';
import type { LayerOrderLimits, LayerRefusal } from '../../layer-order/engine/layerOrderEngine';
import {
  openLayerOrderDialog,
  prefetchLayerOrderDialog,
  type LayerOrderDialogOutcome,
} from '../../layer-order/dialog/layerOrderDialogGateway';
import { resetLayerOrderDialogStoreForTest } from '../../layer-order/dialog/layerOrderDialogStore';
import { isShortcutBarrierOpen } from '../../keyboard/shortcutDispatcher';
import type { LayerOrderRequest } from '../../lib/layerOrder/layerOrderRequest';
import { DEFAULT_PAPER_STYLE } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import { byRole, queryByRole } from '../../test/roleQueries';
import { MODAL_FULL_SCREEN_QUERY } from '../ui/ModalFrame';
import { LayerOrderDialogMount } from './LayerOrderDialogMount';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('../../monitoring', () => ({ reportError: monitoring.reportError }));

/** D7's threshold as the session asks it, or the real one when `starts` is null. */
const budget = vi.hoisted(() => ({ starts: null as boolean | null }));
vi.mock('../../layer-order/layerOrderBudgets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../layer-order/layerOrderBudgets')>();
  return {
    ...actual,
    layerOrderCountStarts: (openPairs: number) => budget.starts ?? actual.layerOrderCountStarts(openPairs),
  };
});

/** A pane that throws once the session is ready, when asked: a dialog that crashes. */
const boom = vi.hoisted(() => ({ whenReady: false }));
vi.mock('./LayerOrderPanesPlaceholder', async (importOriginal) => {
  const original = await importOriginal<typeof import('./LayerOrderPanesPlaceholder')>();
  return {
    LayerOrderPanesPlaceholder: (props: Parameters<typeof original.LayerOrderPanesPlaceholder>[0]) => {
      if (boom.whenReady && props.status.kind === 'ready') throw new Error('a pane crashed');
      return original.LayerOrderPanesPlaceholder(props);
    },
  };
});

/** How often the dialog's chunk was loaded: its module evaluated. */
const chunk = vi.hoisted(() => ({ loads: 0 }));
vi.mock('./LayerOrderDialog', async (importOriginal) => {
  chunk.loads += 1;
  return importOriginal();
});

/** Every `new Worker(…)`, with what it was asked to run, each over a backend from {@link makeBackend}. */
const spawned: SpyWorker[] = [];
let makeBackend: () => FakeLayerOrderBackend = () => createFakeLayerOrderBackend();

class SpyWorker extends FakeLayerOrderWorker {
  readonly url: string;
  readonly options: unknown;

  constructor(url: URL | string, options?: unknown) {
    super(makeBackend());
    this.url = String(url);
    this.options = options;
    spawned.push(this);
  }
}

const SHOWN = fakeLayerOrderScene(FAKE_LAYER_ORDER_FIGURE, [2, 3, 0, 1], 'front');
const REQUEST: LayerOrderRequest = {
  source: FAKE_LAYER_ORDER_SOURCE,
  record: null,
  look: { style: DEFAULT_PAPER_STYLE, policy: PAPER_STYLE_POLICIES['folded-flat'], turnDeg: 0, xray: false },
  shown: SHOWN,
  name: 'Kabuto',
  byline: 'Traditional',
};
/** A host showing 1 over 0, which the creases forbid: the dialog opens on the closest order that folds (D19). */
const CANT_FOLD_REQUEST: LayerOrderRequest = {
  ...REQUEST,
  shown: fakeLayerOrderScene(FAKE_LAYER_ORDER_FIGURE, [1, 0, 2, 3], 'front'),
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  spawned.length = 0;
  makeBackend = () => createFakeLayerOrderBackend();
  budget.starts = null;
  boom.whenReady = false;
  monitoring.reportError.mockClear();
  vi.stubGlobal('Worker', SpyWorker);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  resetLayerOrderDialogStoreForTest();
  vi.unstubAllGlobals();
});

function mount() {
  act(() => root.render(<LayerOrderDialogMount />));
}

/** Let the fake worker's messages, a task each, and the renders they cause land. */
async function flush(turns = 10) {
  await act(async () => {
    for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Wait, two seconds at most, for `check`: the first open also loads the dialog's chunk. */
async function until(check: () => boolean, what: string) {
  const deadline = Date.now() + 2_000;
  while (!check() && Date.now() < deadline) await flush(5);
  if (!check()) throw new Error(`never: ${what}`);
}

const dialog = () => queryByRole(document, 'dialog', 'Layer order');
const openDialog = () => byRole(document, 'dialog', 'Layer order');
const button = (name: string | RegExp) => byRole(openDialog(), 'button', name);
const click = (element: Element) => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const working = () => openDialog().textContent?.includes('Working out the layer orders…') ?? false;
const isReady = () =>
  dialog() !== null && !working() && queryByRole(openDialog(), 'complementary', 'Layer order details') !== null;
const alert = (text: RegExp) => queryByRole(openDialog(), 'alert', text);

/** Open on `request` and wait for the dialog to be on screen; its answer, still to come. */
async function opened(request: LayerOrderRequest = REQUEST): Promise<{ outcome: Promise<LayerOrderDialogOutcome> }> {
  let outcome!: Promise<LayerOrderDialogOutcome>;
  act(() => {
    outcome = openLayerOrderDialog(request);
  });
  await until(() => dialog() !== null, 'the dialog opened');
  return { outcome };
}

/** A backend whose next open is held until released, with the release. */
function holdingOpen(): { release: () => void } {
  const held: { release: () => void } = { release: () => {} };
  makeBackend = () => {
    const backend = createFakeLayerOrderBackend();
    held.release = backend.hold('openShowing').release;
    return backend;
  };
  return { release: () => held.release() };
}

/** Backends whose opens refuse with `refusal`, the first `times` times across workers; the limits each open ran with. */
function refusing(refusal: LayerRefusal, times = Infinity): LayerOrderLimits[] {
  const seen: LayerOrderLimits[] = [];
  let left = times;
  makeBackend = () => {
    const backend = createFakeLayerOrderBackend();
    const open = backend.openShowing;
    backend.openShowing = async (source, relations, limits) => {
      seen.push(limits);
      if (left-- > 0) return { status: 'refused', refusal };
      return open(source, relations, limits);
    };
    return backend;
  };
  return seen;
}

describe('the Layer order dialog’s door', () => {
  it('spawns no worker and loads no dialog code until a host opens it; a prefetch loads code only', async () => {
    mount();
    await flush();
    expect(dialog()).toBeNull();
    expect(chunk.loads).toBe(0);
    expect(spawned).toHaveLength(0);

    const { outcome } = await opened();
    expect(chunk.loads).toBe(1);
    expect(spawned).toHaveLength(1);
    // The dialog's own worker file, as Vite names a worker it bundles.
    expect(new URL(spawned[0]!.url).pathname).toMatch(/\/src\/workers\/layerOrderWorker\.ts$/);
    expect(spawned[0]!.options).toEqual({ type: 'module' });

    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(spawned[0]!.terminated).toBe(true);

    prefetchLayerOrderDialog();
    await flush();
    expect(spawned).toHaveLength(1);
  });

  it('answers busy to a second open while one is up, and unavailable with nothing mounted', async () => {
    await expect(openLayerOrderDialog(REQUEST)).resolves.toEqual({ kind: 'unavailable' });
    mount();
    const { outcome } = await opened();
    await expect(openLayerOrderDialog(REQUEST)).resolves.toEqual({ kind: 'busy' });
    expect(spawned).toHaveLength(1);
    click(button('Close Layer order'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });
});

describe('the Layer order dialog’s session', () => {
  it('opens working, with Cancel; then ready; and Apply on the host’s own order changes nothing (D16)', async () => {
    const held = holdingOpen();
    mount();
    const { outcome } = await opened();
    await flush();

    // The Opening frame: the one sentence, the folded figure loading, Apply waiting.
    expect(working()).toBe(true);
    expect(byRole(openDialog(), 'status', 'Loading the folded figure')).toBeDefined();
    expect(byRole(openDialog(), 'region', 'Crease pattern')).toBeDefined();
    expect(button('Apply').getAttribute('aria-disabled')).toBe('true');
    expect(button('Apply').title).toBe('Nothing to apply yet');
    // A shortcut barrier: the workspace's keys and its menus' Undo stay behind it.
    expect(isShortcutBarrierOpen()).toBe(true);
    // The title row: "Layer order │ Kabuto Traditional" on a wide screen, and no pane switch.
    expect(button('Close Layer order').parentElement?.textContent).toBe('Layer orderKabutoTraditional');
    expect(queryByRole(openDialog(), 'group', 'Pane')).toBeNull();

    held.release();
    await until(isReady, 'the session opened');
    expect(byRole(openDialog(), 'region', 'Folded figure')).toBeDefined();
    expect(button('Apply').getAttribute('aria-disabled')).toBeNull();
    // The open, then what the panes draw; the count only after.
    expect(spawned[0]!.backend.calls.slice(0, 5)).toEqual(['openShowing', 'stacks', 'stacks', 'scene', 'scene']);

    // The order the host shows, held whole, with nothing added: the host writes nothing, and nothing is saved.
    click(button('Apply'));
    await expect(outcome).resolves.toEqual({ kind: 'unchanged' });
    expect(spawned[0]!.backend.calls).not.toContain('save');
    await flush();
    expect(dialog()).toBeNull();
    expect(isShortcutBarrierOpen()).toBe(false);
    expect(spawned[0]!.terminated).toBe(true);
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('Apply on an order that isn’t the host’s (D19) saves, and hands the host its fold', async () => {
    mount();
    const { outcome } = await opened(CANT_FOLD_REQUEST);
    await until(isReady, 'the session opened');
    click(button('Apply'));
    const answer = await outcome;
    if (answer.kind !== 'applied') throw new Error(`expected applied: ${answer.kind}`);
    expect(answer.applied.source).toBe(CANT_FOLD_REQUEST.source);
    // The closest order that folds, 0 over 1 over 2 over 3, as the host's kernel takes it.
    expect(Array.from(answer.applied.relations)).toEqual([0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3]);
    expect(answer.applied.record.constraints).toEqual([]);
    expect(spawned[0]!.backend.calls.slice(-2)).toEqual(['save', 'relations']);
    await flush();
    expect(spawned[0]!.terminated).toBe(true);
  });

  it('a press on the backdrop leaves it open: only Cancel, Escape and the close button close it', async () => {
    mount();
    const { outcome } = await opened();
    await until(isReady, 'the session opened');
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    act(() => {
      openDialog().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await flush();
    expect(settled).toBe(false);
    expect(dialog()).not.toBeNull();
    click(button('Close Layer order'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });

  it('Cancel while it opens terminates the worker at once and answers cancelled', async () => {
    holdingOpen();
    mount();
    const { outcome } = await opened();
    await flush();
    expect(working()).toBe(true);
    click(button('Cancel'));
    expect(spawned[0]!.terminated).toBe(true);
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(dialog()).toBeNull();
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('Escape cancels', async () => {
    mount();
    const { outcome } = await opened();
    await until(isReady, 'the session opened');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(spawned[0]!.terminated).toBe(true);
  });

  it('a refusal says why where the folded figure and the inspector would be, and Apply has nothing to apply', async () => {
    refusing({ code: 'source_digest_mismatch', expected: 'a', actual: 'b' });
    mount();
    const { outcome } = await opened();
    await until(() => alert(/couldn’t match its faces/) !== null, 'the refusal showed');
    // The board's form, naming what the host calls the fold, never the host.
    expect(alert(/couldn’t match its faces/)?.textContent).toBe(
      'Layer order couldn’t match its faces to the ones this figure was folded with, so it can’t open on Kabuto. Nothing was changed.'
    );
    expect(queryByRole(openDialog(), 'region', 'Folded figure')).toBeNull();
    expect(byRole(openDialog(), 'region', 'Crease pattern')).toBeDefined();
    expect(queryByRole(openDialog(), 'complementary', 'Layer order details')).toBeNull();
    expect(button('Apply').getAttribute('aria-disabled')).toBe('true');
    expect(button('Apply').title).toBe('Nothing to apply');
    // Nothing for the user to try.
    expect(queryByRole(openDialog(), 'button', 'Try again')).toBeNull();
    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('a non-convex face is named by its letter, from the host’s scene', async () => {
    refusing({ code: 'source_non_convex_face', face: 2 });
    mount();
    await opened();
    await until(() => alert(/isn’t convex/) !== null, 'the refusal showed');
    expect(alert(/isn’t convex/)?.textContent).toContain(
      'Face C isn’t convex. Layer order can’t work with non-convex faces yet.'
    );
  });

  it('an open that ran out says so quietly and offers Keep trying, which opens again with later limits', async () => {
    const seen = refusing({ code: 'session_timed_out', limit: 'deadline', nodes: 10 }, 1);
    mount();
    await opened();
    await until(() => queryByRole(openDialog(), 'button', 'Keep trying') !== null, 'Keep trying showed');
    // The quiet tone: a timeout is not a refusal.
    expect(byRole(openDialog(), 'status', /in time/).textContent).toContain('Couldn’t work out this figure’s layer orders in time.');
    expect(alert(/in time/)).toBeNull();
    click(button('Keep trying'));
    await until(isReady, 'the second open');
    expect(seen).toHaveLength(2);
    expect(seen[1]!.deadlineMs).toBeGreaterThan(seen[0]!.deadlineMs);
    expect(seen[1]!.maxNodes).toBeGreaterThan(seen[0]!.maxNodes);
    // On the same worker: a timeout is an answer, not a loss.
    expect(spawned).toHaveLength(1);

    // A crash after that: Try again opens with the limits the session last opened with, not the defaults.
    act(() => spawned[0]!.crash());
    await until(() => alert(/stopped unexpectedly/) !== null, 'the loss showed');
    click(button('Try again'));
    await until(isReady, 'the reopen');
    expect(seen).toHaveLength(3);
    expect(seen[2]).toEqual(seen[1]);
  });

  it('a record saved by a newer Ori Studio says so in the board’s words', async () => {
    refusing({ code: 'record_newer' });
    mount();
    await opened();
    await until(() => alert(/newer Ori Studio/) !== null, 'the refusal showed');
    expect(alert(/newer Ori Studio/)?.textContent).toBe('Made with a newer Ori Studio: its layer constraints can’t be changed here.');
  });

  it('a lost engine says so, reported once by the runtime; Try again opens on a fresh worker', async () => {
    let first = true;
    makeBackend = () => {
      const backend = createFakeLayerOrderBackend();
      if (first) backend.trapNext('openShowing');
      first = false;
      return backend;
    };
    mount();
    await opened();
    await until(() => alert(/stopped unexpectedly/) !== null, 'the loss showed');
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
    expect(monitoring.reportError.mock.calls[0]![1]).toMatchObject({ surface: 'layer-order:engine' });
    expect(spawned[0]!.terminated).toBe(true);

    click(button('Try again'));
    await until(isReady, 'the session reopened');
    expect(spawned).toHaveLength(2);
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
  });

  it('a worker the browser couldn’t load says so, reported to no one; Try again opens on a fresh worker', async () => {
    holdingOpen();
    mount();
    await opened();
    await flush();
    act(() => spawned[0]!.failToLoad());
    await until(() => alert(/couldn’t load/) !== null, 'the load failure showed');
    expect(alert(/couldn’t load/)?.textContent).toContain('Check your connection, then try again.');
    // Never the crash's sentence for a load.
    expect(alert(/stopped unexpectedly/)).toBeNull();
    expect(monitoring.reportError).not.toHaveBeenCalled();

    makeBackend = () => createFakeLayerOrderBackend();
    click(button('Try again'));
    await until(isReady, 'the session reopened');
    expect(spawned).toHaveLength(2);
    expect(monitoring.reportError).not.toHaveBeenCalled();
  });

  it('a Fold wasm that didn’t arrive says so, reported to no one; one that failed otherwise is reported once', async () => {
    let message = 'Failed to fetch';
    makeBackend = () => {
      const backend = createFakeLayerOrderBackend();
      backend.openShowing = async () => {
        throw { code: 'layer_order_engine_unavailable', message };
      };
      return backend;
    };
    mount();
    const { outcome } = await opened();
    await until(() => alert(/couldn’t load/) !== null, 'the load failure showed');
    expect(alert(/stopped unexpectedly/)).toBeNull();
    expect(monitoring.reportError).not.toHaveBeenCalled();

    // Offline, whatever the wording: still a load.
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    message = 'WebAssembly.Memory(): could not allocate memory';
    click(button('Try again'));
    await until(() => !working(), 'the second open answered');
    expect(alert(/couldn’t load/)).not.toBeNull();
    expect(alert(/stopped unexpectedly/)).toBeNull();
    expect(monitoring.reportError).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    click(button('Try again'));
    await until(() => alert(/stopped unexpectedly/) !== null, 'the failure showed');
    expect(monitoring.reportError).toHaveBeenCalledTimes(1);
    expect(monitoring.reportError.mock.calls[0]![1]).toEqual({ surface: 'layer-order:dialog', tags: { call: 'open' } });
    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });

  it('counts the solutions once open, and only when few enough pairs are open', async () => {
    const slices = (index: number) => spawned[index]!.backend.calls.filter((call) => call === 'countSlice').length;
    mount();
    let { outcome } = await opened();
    await until(isReady, 'the session opened');
    await until(() => slices(0) > 0, 'the count ran');
    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });

    // Past D7's threshold the count never starts.
    budget.starts = false;
    ({ outcome } = await opened());
    await until(isReady, 'the session opened');
    await flush(20);
    expect(slices(1)).toBe(0);
    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });

  it('a worker that dies after the open loses the session too', async () => {
    mount();
    await opened();
    await until(isReady, 'the session opened');
    act(() => spawned[0]!.crash());
    await until(() => alert(/stopped unexpectedly/) !== null, 'the loss showed');
    expect(button('Apply').getAttribute('aria-disabled')).toBe('true');
  });

  it('a record over its budget keeps the dialog open, with the reason in the foot', async () => {
    makeBackend = () => {
      const backend = createFakeLayerOrderBackend();
      backend.save = async () => ({ status: 'refused', refusal: { code: 'record_over_budget', bytes: 2, budget: 1 } });
      return backend;
    };
    mount();
    const { outcome } = await opened(CANT_FOLD_REQUEST);
    await until(isReady, 'the session opened');
    click(button('Apply'));
    await until(() => alert(/too large to save/) !== null, 'the reason showed');
    expect(alert(/too large to save/)?.textContent).toBe('This layer order is too large to save with the figure.');
    click(button('Cancel'));
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
  });

  it('a dialog that crashes answers cancelled at once, and its fallback stays until it is dismissed', async () => {
    boom.whenReady = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    let outcome!: Promise<LayerOrderDialogOutcome>;
    act(() => {
      outcome = openLayerOrderDialog(REQUEST);
    });
    await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
    await flush();
    // Reported by the boundary, the worker gone, and the fallback still on screen.
    expect(monitoring.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'a pane crashed' }),
      expect.objectContaining({ surface: 'overlay:layer-order' })
    );
    expect(spawned.every((worker) => worker.terminated)).toBe(true);
    expect(byRole(document, 'alert', /This dialog stopped working/)).toBeDefined();
    await flush();
    expect(queryByRole(document, 'alert', /This dialog stopped working/)).not.toBeNull();

    click(byRole(document, 'button', 'Dismiss'));
    expect(queryByRole(document, 'alert', /This dialog stopped working/)).toBeNull();

    // The next open is not busy, and opens.
    boom.whenReady = false;
    const { outcome: next } = await opened();
    await until(isReady, 'the next open');
    click(button('Cancel'));
    await expect(next).resolves.toEqual({ kind: 'cancelled' });
    vi.mocked(console.error).mockRestore();
  });
});

describe('the Layer order dialog as the whole screen (D6)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query === MODAL_FULL_SCREEN_QUERY,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList
    );
  });

  it('shows one pane at a time, switched from the title row', async () => {
    mount();
    await opened();
    await until(isReady, 'the session opened');
    const panes = byRole(openDialog(), 'group', 'Pane');
    expect(byRole(panes, 'button', 'Folded').getAttribute('aria-pressed')).toBe('true');
    expect(byRole(openDialog(), 'region', 'Folded figure')).toBeDefined();
    expect(queryByRole(openDialog(), 'region', 'Crease pattern')).toBeNull();
    // The name gives way to the switch.
    expect(openDialog().textContent).not.toContain('Kabuto');

    click(byRole(panes, 'button', 'Crease pattern'));
    await flush();
    expect(byRole(openDialog(), 'region', 'Crease pattern')).toBeDefined();
    expect(queryByRole(openDialog(), 'region', 'Folded figure')).toBeNull();
  });
});
