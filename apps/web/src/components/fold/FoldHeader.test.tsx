import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../store/workspaceStore/useWorkspaceCapabilities', () => ({ useWorkspaceCapabilities: () => ({}) }));

import i18n from '../../i18n';
import { buildFoldActions, type FoldActionContext, type FoldActionDeps } from '../../fold/foldActions';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldHeader } from './FoldHeader';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = i18n.t.bind(i18n);

const CONTEXT: FoldActionContext = {
  step: { id: 'fstep-1', followers: 0 },
  state: 'ready',
  path: 'ready',
  atTip: true,
  readOnly: false,
  foldKind: 'valley',
  sheet: 'square',
  stepCount: 1,
};

function deps(): FoldActionDeps {
  return {
    t,
    setFoldKind: vi.fn(),
    turn: vi.fn(),
    rotate: vi.fn(),
    unfold: vi.fn(),
    deleteStep: vi.fn(),
    importCp: vi.fn(),
    sendToEdit: vi.fn(),
    sendToDiagram: vi.fn(),
    exportFold: vi.fn(),
    exportSteps: vi.fn(),
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (props: Partial<ComponentProps<typeof FoldHeader>> & { bound?: FoldActionDeps; context?: FoldActionContext }) => {
  const { bound = deps(), context = CONTEXT, ...rest } = props;
  act(() =>
    root.render(
      <TooltipProvider>
        <FoldHeader
          view="fold"
          onViewChange={() => {}}
          stepCount={1}
          actions={buildFoldActions(context, bound)}
          drawerSlot={() => {}}
          {...rest}
        />
      </TooltipProvider>
    )
  );
  return bound;
};

const button = (name: string) =>
  [...host.querySelectorAll('button')].find((each) => each.textContent === name) as HTMLButtonElement | undefined;
const tabs = () => [...host.querySelectorAll('[role="tab"]')];

describe('FoldHeader', () => {
  it('offers the two views as tabs, the one on show selected, and counts the steps', () => {
    render({ view: 'steps', stepCount: 3 });
    expect(tabs().map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([
      ['Fold', 'false'],
      ['Steps', 'true'],
    ]);
    expect(host.textContent).toContain('3 steps');
  });

  it('switches the view from a tab', () => {
    const onViewChange = vi.fn();
    render({ onViewChange });
    act(() => {
      tabs()[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(onViewChange).toHaveBeenCalledWith('steps');
  });

  it('runs the catalog’s verbs for the whole sequence, as it words and gates them', () => {
    const bound = render({});
    act(() => button('Import CP…')?.click());
    act(() => button('Send to Edit')?.click());
    act(() => button('Export FOLD…')?.click());
    expect(bound.importCp).toHaveBeenCalledOnce();
    expect(bound.sendToEdit).toHaveBeenCalledOnce();
    expect(bound.exportFold).toHaveBeenCalledOnce();
    // Export steps… is behind the caret.
    expect(host.querySelector('button[aria-label="More ways to export"]')).not.toBeNull();
  });

  it('says why a verb cannot run', () => {
    render({ context: { ...CONTEXT, path: 'broken', sheet: 'polygon', stepCount: 2 } });
    expect(button('Send to Edit')).toMatchObject({ disabled: true, title: 'A step on this path no longer folds.' });
    expect(button('Import CP…')).toMatchObject({ disabled: true, title: 'Import CP needs a square or rectangle sheet.' });
  });

  it('keeps to one row on a phone: the tabs their icons, no count, and the verbs in one menu', async () => {
    const { PHONE_MEDIA_QUERY } = await import('../../platform/phoneLayout');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === PHONE_MEDIA_QUERY,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    const run = vi.fn();
    const bound = render({
      stepCount: 3,
      sendToEdit: {
        label: 'Send to Edit',
        title: 'Send it',
        disabled: false,
        menuLabel: 'More',
        run,
        actions: [],
      },
    });
    expect(host.querySelector('[data-phone]')).not.toBeNull();
    // Named still, by their titles, out of sight.
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Fold', 'Steps']);
    expect(host.querySelector('[role="tab"] [data-hidden]')).not.toBeNull();
    expect(host.textContent).not.toContain('3 steps');
    // No verb on the row itself.
    for (const name of ['Import CP…', 'Send to Edit', 'Export FOLD…']) {
      expect(button(name), name).toBeUndefined();
      expect(host.querySelector(`button[aria-label="${name}"]`), name).toBeNull();
    }
    const more = host.querySelector<HTMLButtonElement>('button[aria-label="Import, send and export"]');
    act(() => {
      more?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    });
    const rows = [...document.querySelectorAll<HTMLElement>('[role="menu"] [role^="menuitem"]')];
    expect(rows.map((row) => row.textContent)).toEqual([
      'Unfold to step…',
      'Repeat on the other side…',
      'Import CP…',
      'Send to Edit',
      'Export FOLD…',
      'Export steps…',
    ]);
    act(() => rows.find((row) => row.textContent === 'Import CP…')?.click());
    expect(bound.importCp).toHaveBeenCalledOnce();
  });

  it('makes Send to Edit the shared button when given its model, with no caret: there is one Send to Edit', () => {
    const run = vi.fn();
    render({
      sendToEdit: {
        label: 'Send to Edit',
        title: 'Open the folded state in Edit',
        disabled: false,
        menuLabel: 'More ways to send to Edit',
        run,
        actions: [],
      },
    });
    act(() => button('Send to Edit')?.click());
    expect(run).toHaveBeenCalledOnce();
    expect(host.querySelector('button[aria-label="More ways to send to Edit"]')).toBeNull();
  });

  it('shows the split button’s own gate and says why it is disabled, as the model words it', () => {
    // The model is built over the catalog's Send to Edit (`useFoldSendToEditButton`), so its reason is the catalog's.
    render({
      context: { ...CONTEXT, path: 'broken' },
      sendToEdit: {
        label: 'Send to Edit',
        title: 'A step on this path no longer folds.',
        disabled: true,
        menuLabel: 'More',
        run: vi.fn(),
        actions: [],
      },
    });
    expect(button('Send to Edit')).toMatchObject({ disabled: true, title: 'A step on this path no longer folds.' });
  });
});
