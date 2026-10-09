import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import {
  FOLD_LINE_MODES,
  FOLD_PLANNED_OPS,
  type FoldRailItemId,
  type FoldShortcutId,
} from '../../fold/tools/foldToolCatalog';
import { foldRailGroups, type FoldToolsView } from '../../fold/tools/foldRailGroups';
import { allByRole, byRole } from '../../test/roleQueries';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldToolGlyph } from './FoldToolGlyph';
import { FoldToolPickerSheet } from './FoldToolPickerSheet';
import { FoldToolRail } from './FoldToolRail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = i18n.t.bind(i18n);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  localStorage.clear();
});

function mount(node: React.ReactNode): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>));
  return host;
}

function verbs() {
  return { selectTool: vi.fn(), selectLineMode: vi.fn(), turn: vi.fn() };
}

const view: FoldToolsView = { tool: 'valley', lineMode: 'axiom-2', readOnly: null };

describe('FoldToolRail', () => {
  it('draws every group as a named section, the planned folds collapsed', () => {
    const rail = mount(<FoldToolRail groups={foldRailGroups(t, view, verbs())} />);
    expect(byRole(rail, 'complementary', 'Fold tools')).toBeTruthy();
    const toggles = [...rail.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')];
    expect(toggles.map((toggle) => [toggle.textContent, toggle.getAttribute('aria-expanded')])).toEqual([
      ['Fold', 'true'],
      ['Reference points', 'true'],
      ['Locate line', 'true'],
      ['Model', 'true'],
      ['Planned', 'false'],
    ]);
    expect(rail.querySelector('[aria-label="Squash fold"]')).toBeNull();
  });

  it('takes a tool, a line mode and a model verb from their buttons, and refuses a planned one', () => {
    const calls = verbs();
    const rail = mount(<FoldToolRail groups={foldRailGroups(t, view, calls)} />);
    act(() => byRole(rail, 'button', 'Mountain fold').click());
    act(() => byRole(rail, 'button', 'Axiom 6: two points onto two lines').click());
    act(() => byRole(rail, 'button', 'Turn over').click());
    const planned = byRole(rail, 'button', 'Inside reverse fold');
    act(() => planned.click());
    expect(calls.selectTool.mock.calls).toEqual([['mountain']]);
    expect(calls.selectLineMode.mock.calls).toEqual([['axiom-6']]);
    expect(calls.turn).toHaveBeenCalledWith({ kind: 'turn-over', axis: 'vertical' });
    expect(planned.getAttribute('aria-disabled')).toBe('true');
    // Shown as the tool and the line mode in hand.
    expect(byRole(rail, 'button', 'Valley fold').hasAttribute('data-active')).toBe(true);
    expect(byRole(rail, 'button', 'Axiom 2: point onto point').hasAttribute('data-active')).toBe(true);
  });

  it('names each tool’s key in its tooltip, from the layout the surface resolves', async () => {
    const keyLabel = (id: FoldShortcutId) => (id === 'fold.toolValley' ? 'V' : undefined);
    const rail = mount(<FoldToolRail groups={foldRailGroups(t, view, verbs())} keyLabel={keyLabel} />);
    await act(async () => byRole(rail, 'button', 'Valley fold').focus());
    const tip = allByRole(document.body, 'tooltip').map((element) => element.textContent);
    expect(tip).toContain('Valley fold (V) - Fold the moving side toward you, so it lands on top.');
  });
});

describe('FoldToolPickerSheet', () => {
  it('names every tool the rail shows, in its groups, and closes on a pick', () => {
    const calls = verbs();
    const close = vi.fn();
    const groups = foldRailGroups(t, view, calls);
    const sheet = mount(<FoldToolPickerSheet pickerId="fold-tools" groups={groups} close={close} />);
    expect(byRole(sheet, 'dialog', 'Fold tools')).toBeTruthy();
    expect([...sheet.querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual(
      groups.map((group) => group.label)
    );
    // The same items as the rail, one row each.
    expect([...sheet.querySelectorAll('[data-fold-tool]')].map((row) => row.getAttribute('data-fold-tool'))).toEqual(
      groups.flatMap((group) => group.items.map((item) => item.id))
    );
    act(() => byRole(sheet, 'button', /^Free line/).click());
    expect(calls.selectLineMode).toHaveBeenCalledWith('free');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('says why a planned tool cannot be taken, and does not take it', () => {
    const calls = verbs();
    const close = vi.fn();
    const sheet = mount(<FoldToolPickerSheet pickerId="fold-tools" groups={foldRailGroups(t, view, calls)} close={close} />);
    const row = byRole(sheet, 'button', 'Rabbit ear Planned: not in Ori Studio yet.');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    act(() => row.click());
    expect(close).not.toHaveBeenCalled();
  });
});

describe('FoldToolGlyph', () => {
  it('draws a glyph for every item the rail can show', () => {
    const ids: FoldRailItemId[] = [
      'valley',
      'mountain',
      'precrease',
      'inside-reverse',
      'divide-line',
      'turn-over',
      'rotate',
      ...FOLD_LINE_MODES,
      ...FOLD_PLANNED_OPS,
    ];
    const glyphs = mount(
      <>
        {ids.map((id) => (
          <span key={id} data-glyph={id}>
            <FoldToolGlyph id={id} />
          </span>
        ))}
      </>
    );
    for (const id of ids) {
      const glyph = glyphs.querySelector(`[data-glyph="${id}"]`);
      expect(glyph?.firstElementChild, id).not.toBeNull();
      // Decoration: the button around it carries the name.
      expect(glyph?.firstElementChild?.getAttribute('aria-hidden'), id).toBe('true');
    }
    expect(glyphs.querySelector('[data-glyph="valley"]')?.textContent).toBe('V');
    expect(glyphs.querySelector('[data-glyph="inside-reverse"]')?.textContent).toBe('IR');
  });
});
