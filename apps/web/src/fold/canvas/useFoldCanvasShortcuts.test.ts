import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleShortcutRuntimeKeyDown } from '../../keyboard/shortcutRuntime';
import { getResolvedShortcuts, SHORTCUT_DEFINITIONS } from '../../keyboard/shortcuts';
import { registerFoldShortcutHandler } from '../foldShortcutScope';
import { registerFoldCanvasVerbs } from './foldCanvasCommands';
import type { FoldCanvasVerbs } from './useFoldCanvasVerbs';
import { focusLeavesEnterToFold, runFoldCanvasShortcut } from './useFoldCanvasShortcuts';

function verbs(roots = 1): FoldCanvasVerbs {
  return {
    selectTool: vi.fn(),
    selectLineMode: vi.fn(),
    turn: vi.fn(),
    hitTest: vi.fn(),
    pick: vi.fn(),
    swapSide: vi.fn(),
    toggleFlap: vi.fn(),
    hoverFlap: vi.fn(),
    includeFlaps: vi.fn(),
    foldOtherWay: vi.fn(),
    pickFlap: vi.fn(),
    useLine: vi.fn(),
    stepRoot: vi.fn(() => roots > 1),
    commit: vi.fn(() => true),
    cancel: vi.fn(() => true),
    clearMarks: vi.fn(),
  };
}

let release: (() => void) | null = null;
afterEach(() => {
  release?.();
  release = null;
  document.body.replaceChildren();
});

describe('the Fold canvas’s keys', () => {
  it('declines every key while no canvas is mounted', () => {
    expect(runFoldCanvasShortcut('fold.toolValley', null)).toBe(false);
  });

  it('takes a tool, a line mode and a model verb by their keys', () => {
    const bound = verbs();
    release = registerFoldCanvasVerbs(bound);
    expect(runFoldCanvasShortcut('fold.toolMountain', null)).toBe(true);
    expect(bound.selectTool).toHaveBeenCalledWith('mountain');
    expect(runFoldCanvasShortcut('fold.lineAxiom5', null)).toBe(true);
    expect(bound.selectLineMode).toHaveBeenCalledWith('axiom-5');
    expect(runFoldCanvasShortcut('fold.turnOver', null)).toBe(true);
    expect(bound.turn).toHaveBeenCalledWith({ kind: 'turn-over', axis: 'vertical' });
    // A planned tool takes no key: the chord falls through.
    expect(runFoldCanvasShortcut('fold.toolInsideReverse', null)).toBe(false);
  });

  it('commits on Enter unless a focused control owns it', () => {
    const bound = verbs();
    release = registerFoldCanvasVerbs(bound);
    const pane = document.createElement('div');
    pane.setAttribute('data-fold-pane', 'folded');
    const button = document.createElement('button');
    document.body.append(pane, button);
    expect(focusLeavesEnterToFold(document.body)).toBe(true);
    expect(focusLeavesEnterToFold(pane)).toBe(true);
    expect(focusLeavesEnterToFold(button)).toBe(false);
    expect(runFoldCanvasShortcut('fold.commit', button)).toBe(false);
    expect(runFoldCanvasShortcut('fold.commit', pane)).toBe(true);
    expect(bound.commit).toHaveBeenCalledTimes(1);
  });

  it('steps the roots on Shift+arrows while there are several, and leaves the keys to a control that uses them', () => {
    const one = verbs(1);
    release = registerFoldCanvasVerbs(one);
    expect(runFoldCanvasShortcut('fold.nextCandidate', null)).toBe(false);
    release();
    const two = verbs(2);
    release = registerFoldCanvasVerbs(two);
    expect(runFoldCanvasShortcut('fold.previousCandidate', null)).toBe(true);
    expect(two.stepRoot).toHaveBeenCalledWith(-1);
    const tabs = document.createElement('div');
    tabs.setAttribute('role', 'tablist');
    document.body.append(tabs);
    expect(runFoldCanvasShortcut('fold.nextCandidate', tabs)).toBe(false);
  });

  it('binds the tool rows in the fold scope, one chord each', () => {
    const rows = SHORTCUT_DEFINITIONS.filter((definition) => definition.scope === 'fold');
    const chords = rows.flatMap((row) => getResolvedShortcuts(row.id).map((chord) => JSON.stringify(chord)));
    expect(new Set(chords).size).toBe(chords.length);
    expect(getResolvedShortcuts('fold.lineFree')).toEqual([{ key: 'f' }]);
    expect(getResolvedShortcuts('fold.commit')).toEqual([{ key: 'enter' }]);
  });
});

describe('the fold scope’s shared executor', () => {
  const press = (key: string) =>
    handleShortcutRuntimeKeyDown(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }), {
      context: { activeEditingContext: 'fold' },
      menu: () => undefined,
    });

  it('asks every Fold surface’s handler in turn, a second never replacing the first', () => {
    const tools = vi.fn((id: string) => id === 'fold.toolValley');
    const steps = vi.fn((id: string) => id === 'fold.commit');
    const offTools = registerFoldShortcutHandler(tools);
    const offSteps = registerFoldShortcutHandler(steps);
    expect(press('v')).toBe(true);
    expect(tools).toHaveBeenCalledWith('fold.toolValley');
    expect(press('Enter')).toBe(true);
    expect(steps).toHaveBeenCalledWith('fold.commit');
    offTools();
    // The other surface still has the keyboard.
    expect(press('Enter')).toBe(true);
    offSteps();
    // With none left, the scope is out of the stack and the key falls through.
    expect(press('v')).toBe(false);
  });
});
