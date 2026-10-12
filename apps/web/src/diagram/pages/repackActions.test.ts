import type { TFunction } from 'i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../store/workspaceStore';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  type DiagramPageArrangement,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { diagramPageActions, pageActionState, repackAllPages, repackPage } from './repackActions';
import { cellSlots } from './stepPlaces';

const analytics = vi.hoisted(() => ({ trackDiagramPagesRepacked: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

/** Re-pack Page and Re-pack All Pages bound to the store (`diagram-flow-packing.md`, Decision 4). */

const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction;
const state = () => useWorkspaceStore.getState();
const stored = () => Object.keys(state().diagram?.pageArrangements ?? {});

/** Eight steps on flow pages of four, s0–s3 and s4–s7, each page's packing taken in. */
function install() {
  const steps = Array.from({ length: 8 }, (_, index) => cpStep(`s${index}`));
  const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 4,
  });
  state().installDiagram({ document, readOnly: false, raw: {} });
  const slots = cellSlots(document);
  const packed: Record<string, DiagramPageArrangement> = Object.fromEntries(
    slots.pages.map((ids, page) => [
      ids[0]!,
      {
        signature: slots.signatures[page]!,
        k: 1,
        steps: Object.fromEntries(ids.map((id, at) => [id, { box: [12 + 40 * at, 30, 38, 60], scale: { frameMm: 30 }, band: 0 }] as const)),
      },
    ])
  );
  state().adoptDiagramPageArrangements(packed, document);
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

describe('repackPage and repackAllPages', () => {
  it('let one page’s arrangement go, or every one, each counted with where it was pressed', () => {
    install();
    expect(repackPage(1, 'context_menu')).toBe(true);
    expect(stored()).toEqual(['s0']);
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenCalledExactlyOnceWith('page', 'context_menu');
    expect(repackAllPages('page_pane')).toBe(true);
    expect(stored()).toEqual([]);
    expect(analytics.trackDiagramPagesRepacked).toHaveBeenLastCalledWith('all', 'page_pane');
  });

  it('count nothing where there was nothing to let go', () => {
    install();
    state().repackDiagramPages();
    expect(repackPage(0, 'notice')).toBe(false);
    expect(repackAllPages('page_pane')).toBe(false);
    expect(analytics.trackDiagramPagesRepacked).not.toHaveBeenCalled();
  });
});

describe('pageActionState', () => {
  it('says whether the page, and any page, holds an arrangement — a newer build’s too', () => {
    install();
    const document = state().diagram!;
    expect(pageActionState(document, false, 's4')).toEqual({ flow: true, readOnly: false, pageStored: true, anyStored: true });
    expect(pageActionState(document, false, 's1').pageStored).toBe(false);
    expect(pageActionState(document, false, null).pageStored).toBe(false);
    const newer = { ...document, pageArrangements: undefined, newer: { pageArrangements: { s0: { signature: 'pack-9:x' } } } };
    expect(pageActionState(newer, false, 's0')).toMatchObject({ pageStored: true, anyStored: true });
  });
});

describe('diagramPageActions', () => {
  it('binds a flow page’s verbs as the store holds it now, for a page that is there', () => {
    install();
    const [page, all] = diagramPageActions(1, t, 'context_menu');
    expect([page?.id, page?.disabled, all?.id, all?.disabled]).toEqual(['repack-page', false, 'repack-all', false]);
    page!.run();
    expect(stored()).toEqual(['s0']);
    expect(diagramPageActions(5, t, 'context_menu')).toEqual([]);
  });

  it('offers none on a grid, or with no diagram', () => {
    expect(diagramPageActions(0, t, 'context_menu')).toEqual([]);
    install();
    state().setDiagramPage({ layout: 'grid' });
    expect(diagramPageActions(0, t, 'context_menu')).toEqual([]);
  });
});
