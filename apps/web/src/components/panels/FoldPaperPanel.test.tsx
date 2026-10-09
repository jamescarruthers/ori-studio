import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { valleyAt } from '../../fold/document/foldSequence.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldPaperPanel } from './FoldPaperPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const state = () => useWorkspaceStore.getState();
const paper = () => state().foldSequences[0]?.document.paper;

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TooltipProvider>
        <FoldPaperPanel />
      </TooltipProvider>
    )
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** A segmented control's option, by its group and its name, as `FoldPaperPane.test.tsx` finds them. */
const segment = (group: string, name: string) =>
  host.querySelector<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button[aria-label="${name}"]`) ??
  [...host.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button`)].find(
    (element) => element.textContent?.trim() === name
  );
const pressed = (group: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button`)]
    .filter((element) => element.getAttribute('aria-pressed') === 'true')
    .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim());

describe('the Fold Paper pane', () => {
  it('shows the square a project with no sequence starts from, front up', () => {
    expect(pressed('Shape')).toEqual(['Square']);
    expect(pressed('Start')).toEqual(['Front up']);
  });

  it('turns the sheet over as one undo step, keeping the steps', () => {
    act(() => {
      state().commitFoldStep({ parent: null, op: valleyAt(0.5) });
    });
    act(() => segment('Start', 'Back up')?.click());
    expect(paper()?.startSide).toBe('back');
    expect(state().foldSequences[0]?.document.steps).toHaveLength(1);
    expect(pressed('Start')).toEqual(['Back up']);
  });

  it('starts over on a new shape, stored as the document keeps it, and says so first', () => {
    act(() => {
      state().commitFoldStep({ parent: null, op: valleyAt(0.5) });
    });
    expect(host.textContent).toContain('Changing the shape starts over');
    act(() => segment('Shape', 'Polygon')?.click());
    const shape = paper()?.shape;
    expect(shape?.kind === 'polygon' ? shape.points.length : null).toBe(6);
    expect(state().foldSequences[0]?.document.steps).toEqual([]);
    expect(pressed('Shape')).toEqual(['Polygon']);
  });
});
