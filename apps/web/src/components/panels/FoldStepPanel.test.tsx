import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const menu = vi.hoisted(() => ({ handleMenuAction: vi.fn() }));
vi.mock('../../commands/menuActions', () => ({ handleMenuAction: menu.handleMenuAction }));

/** The app's session is the worker-bound one; these tests hand the pane one over a fake engine. */
const app = vi.hoisted(() => ({ session: null as import('../../fold/session/foldSession').FoldSession | null }));
vi.mock('../../store/workspaceStore/foldSession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/workspaceStore/foldSession')>()),
  foldSession: () => {
    if (!app.session) throw new Error('no session');
    return app.session;
  },
}));

import { valleyAt } from '../../fold/document/foldSequence.fixtures';
import type { FoldEngineCalls } from '../../fold/engine/foldEngineCalls';
import { diagonalHalfScene, squareScene } from '../../fold/sequence/foldScene.fixtures';
import { clearFoldStateFrames } from '../../fold/sequence/useFoldStateFrames';
import { createFoldSession } from '../../fold/session/foldSession';
import { fakeFoldEngine, inProcessFoldRuntime, settle } from '../../fold/session/foldSession.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { foldSessionDocumentSource } from '../../store/workspaceStore/foldSession';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldStepPanel } from './FoldStepPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The fake engine, with a scene and a step summary: every step folds the square in half along its diagonal. */
function engine(): FoldEngineCalls {
  const fake = fakeFoldEngine({ refuse: (op) => (op.kind === 'mountain' ? 'layer_order' : null) });
  return {
    ...fake,
    scene: (state) => (fake.trail(state)?.length === 1 ? squareScene() : diagonalHalfScene()),
    stepSummary: () => ({
      status: 'ok',
      summary: {
        counts: { mountain: 0, valley: 1, flat: 0 },
        diff: { added: [4], reversed: [], unfolded: [], refolded: [] },
        layers: 1,
      },
    }),
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  menu.handleMenuAction.mockClear();
  clearFoldStateFrames();
  app.session = createFoldSession({
    document: foldSessionDocumentSource(useWorkspaceStore),
    runtime: inProcessFoldRuntime(engine),
  });
  app.session.retain();
  await settle();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TooltipProvider>
        <FoldStepPanel />
      </TooltipProvider>
    )
  );
  await act(async () => settle());
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  app.session?.dispose();
  app.session = null;
});

const rows = () =>
  Object.fromEntries(
    [...host.querySelectorAll('[data-field-row]')].map((row) => [
      row.querySelector('[data-field-label]')?.textContent ?? '',
      row.querySelector('[data-field-value]')?.textContent ?? '',
    ])
  );

describe('the Fold Step pane', () => {
  it('shows the flat sheet, then the step on screen with the engine’s summary of it', async () => {
    expect(host.querySelector('h3')?.textContent).toBe('Flat sheet');

    await act(async () => {
      await app.session!.commitStep(valleyAt(0.5));
      await settle();
    });
    expect(host.querySelector('h3')?.textContent).toBe('Step 1');
    expect(host.textContent).toContain('Valley fold along the line drawn, through all layers.');
    expect(rows()).toMatchObject({ Operation: 'Valley fold', Layers: '1', Changes: 'Adds 1 crease (0 M, 1 V)', Valley: '1' });
  });

  it('says folding away from the tip starts a branch', async () => {
    await act(async () => {
      await app.session!.commitStep(valleyAt(0.5));
      await app.session!.commitStep(valleyAt(0.25));
      await settle();
      useWorkspaceStore.getState().moveFoldCursor(useWorkspaceStore.getState().foldSequences[0]!.document.steps[0]!.id);
      await settle();
    });
    expect(host.textContent).toContain('You are at step 1 of 2: folding here starts a new branch.');
  });

  it('shows the fold a tool is making, and what committing it would change', async () => {
    await act(async () => {
      await app.session!.preview(valleyAt(0.5));
      await settle();
    });
    const pending = [...host.querySelectorAll('[role="group"]')].find((group) => group.getAttribute('aria-label') === 'Pending fold');
    expect(pending?.textContent).toContain('Valley fold along the line drawn, through all layers.');
    expect(pending?.textContent).toContain('Adds 1 crease (0 M, 1 V)');

    await act(async () => {
      await app.session!.preview({ ...valleyAt(0.5), kind: 'mountain' });
      await settle();
    });
    expect(host.textContent).toContain('Resolve the issue in the tool window to see the creases it makes.');
  });

  it('offers a broken step its Delete, through the verb every surface runs', async () => {
    useWorkspaceStore.getState().installFoldSequences(
      [
        {
          document: {
            formatVersion: 1,
            id: 'fold-broken',
            title: '',
            paper: { shape: { kind: 'square' }, startSide: 'front' },
            steps: [{ id: 'fstep-m', parent: null, op: { ...valleyAt(0.5), kind: 'mountain' } }],
          },
          readOnlyRaw: null,
        },
      ],
      { v: 1, sequenceId: 'fold-broken', cursor: 'fstep-m', activeChild: {} }
    );
    await act(async () => settle());
    const notice = host.querySelector('[data-tone="warning"]');
    expect(notice?.textContent).toContain('This step no longer folds');
    act(() => notice?.querySelector('button')?.click());
    expect(menu.handleMenuAction).toHaveBeenCalledWith('fold.delete-step');
  });
});
