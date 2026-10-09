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
    render({ context: { ...CONTEXT, path: 'broken', sheet: 'regular', stepCount: 2 } });
    expect(button('Send to Edit')).toMatchObject({ disabled: true, title: 'A step on this path no longer folds.' });
    expect(button('Import CP…')).toMatchObject({ disabled: true, title: 'Import CP needs a square or rectangle sheet.' });
  });

  it('gives Import CP and Send to Edit their icons alone on a phone, named by their labels', async () => {
    const { PHONE_MEDIA_QUERY } = await import('../../platform/phoneLayout');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === PHONE_MEDIA_QUERY,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    const bound = render({});
    const importCp = host.querySelector<HTMLButtonElement>('button[aria-label="Import CP…"]');
    expect(importCp?.textContent).toBe('');
    act(() => importCp?.click());
    expect(bound.importCp).toHaveBeenCalledOnce();
    expect(host.querySelector('button[aria-label="Send to Edit"]')).not.toBeNull();
    // The export keeps its words: it is the header's one primary verb.
    expect(button('Export FOLD…')).toBeDefined();
  });

  it('makes Send to Edit the shared split button when given its model, the variants behind the caret', () => {
    const run = vi.fn();
    render({
      sendToEdit: {
        label: 'Send to Edit',
        title: 'Open the folded state in Edit',
        disabled: false,
        menuLabel: 'More ways to send to Edit',
        run,
        actions: [{ id: 'precreases-as-aux', label: 'Precreases as Auxiliary Lines', onSelect: vi.fn() }],
      },
    });
    act(() => button('Send to Edit')?.click());
    expect(run).toHaveBeenCalledOnce();
    expect(host.querySelector('button[aria-label="More ways to send to Edit"]')).not.toBeNull();
    // The catalog's gate still holds over the button's own.
    render({
      context: { ...CONTEXT, path: 'broken' },
      sendToEdit: { label: 'Send to Edit', title: '', disabled: false, menuLabel: 'More', run, actions: [] },
    });
    expect(button('Send to Edit')?.disabled).toBe(true);
  });

  it('seats the phone’s pane switch beside the drawer’s slot', () => {
    render({ paneToggle: <button type="button">Crease pattern</button> });
    expect(button('Crease pattern')).toBeDefined();
  });
});
