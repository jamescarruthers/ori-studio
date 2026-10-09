import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { foldRailGroups, foldRailTooltip, type FoldRailVerbs, type FoldToolsView } from './foldRailGroups';

const t = i18n.t.bind(i18n);

function verbs() {
  return { selectTool: vi.fn(), selectLineMode: vi.fn(), turn: vi.fn() } satisfies FoldRailVerbs;
}

const view = (extra: Partial<FoldToolsView> = {}): FoldToolsView => ({
  tool: 'valley',
  lineMode: 'axiom-2',
  readOnly: null,
  ...extra,
});

const item = (groups: ReturnType<typeof foldRailGroups>, id: string) => {
  const found = groups.flatMap((group) => group.items).find((each) => each.id === id);
  if (!found) throw new Error(`no rail item ${id}`);
  return found;
};

describe('foldRailGroups', () => {
  it('lists the folds, Reference points, Locate line, the model verbs and the planned folds, in that order', () => {
    const groups = foldRailGroups(t, view(), verbs());
    expect(groups.map((group) => [group.id, group.label])).toEqual([
      ['fold', 'Fold'],
      ['reference', 'Reference points'],
      ['locate', 'Locate line'],
      ['model', 'Model'],
      ['planned', 'Planned'],
    ]);
    expect(groups.map((group) => group.items.map((each) => each.id))).toEqual([
      ['valley', 'mountain', 'precrease', 'inside-reverse'],
      ['divide-line'],
      ['axiom-1', 'axiom-2', 'axiom-3', 'axiom-4', 'axiom-5', 'axiom-6', 'axiom-7', 'free', 'crease'],
      ['turn-over', 'rotate'],
      [
        'outside-reverse',
        'crimp',
        'tuck',
        'squash',
        'petal',
        'rabbit-ear',
        'swivel',
        'open-sink',
        'closed-sink',
        'unsink',
      ],
    ]);
    // A roadmap, out of the way until asked for; everything else open.
    expect(groups.filter((group) => group.collapsedByDefault).map((group) => group.id)).toEqual(['planned']);
  });

  it('names the axioms by the move a folder makes, and every item by its key', () => {
    const groups = foldRailGroups(t, view(), verbs());
    expect(item(groups, 'axiom-2').label).toBe('Axiom 2: point onto point');
    expect(item(groups, 'free').label).toBe('Free line');
    expect(item(groups, 'crease').label).toBe('Existing crease');
    expect(item(groups, 'turn-over').label).toBe('Turn over');
    expect(item(groups, 'rotate').label).toBe('Rotate');
    expect(item(groups, 'valley').shortcut).toBe('fold.toolValley');
    expect(item(groups, 'axiom-7').shortcut).toBe('fold.lineAxiom7');
    expect(item(groups, 'rotate').shortcut).toBe('fold.rotate');
    expect(item(groups, 'squash').shortcut).toBeNull();
  });

  it('shows the inside reverse fold and the later folds as planned: there to read, never taken', () => {
    const calls = verbs();
    const groups = foldRailGroups(t, view(), calls);
    for (const id of ['inside-reverse', 'squash', 'unsink']) {
      const planned = item(groups, id);
      expect(planned.kind).toBe('planned');
      expect(planned.available).toBe(false);
      expect(planned.reason).toBe('Planned: not in Ori Studio yet.');
      planned.select();
    }
    // The rail and the sheet refuse the press (`available: false`), and a planned item binds nothing besides.
    expect(calls.selectTool).not.toHaveBeenCalled();
    expect(calls.turn).not.toHaveBeenCalled();
  });

  it('marks the tool in hand and the line mode chosen, but no line mode under the Divide line', () => {
    let groups = foldRailGroups(t, view({ tool: 'mountain', lineMode: 'axiom-5' }), verbs());
    expect(groups.flatMap((group) => group.items).filter((each) => each.active).map((each) => each.id)).toEqual([
      'mountain',
      'axiom-5',
    ]);
    groups = foldRailGroups(t, view({ tool: 'divide-line', lineMode: 'axiom-5' }), verbs());
    expect(groups.flatMap((group) => group.items).filter((each) => each.active).map((each) => each.id)).toEqual([
      'divide-line',
    ]);
  });

  it('binds each item to its call: a tool, a line mode, a turn as a step of its own', () => {
    const calls = verbs();
    const groups = foldRailGroups(t, view(), calls);
    item(groups, 'precrease').select();
    item(groups, 'divide-line').select();
    item(groups, 'crease').select();
    item(groups, 'turn-over').select();
    item(groups, 'rotate').select();
    expect(calls.selectTool.mock.calls).toEqual([['precrease'], ['divide-line']]);
    expect(calls.selectLineMode.mock.calls).toEqual([['crease']]);
    expect(calls.turn.mock.calls).toEqual([
      [{ kind: 'turn-over', axis: 'vertical' }],
      [{ kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } }],
    ]);
    // Done at once: a verb is never the thing in hand.
    expect(item(groups, 'turn-over').active).toBe(false);
  });

  it('holds every tool on a read-only sequence, saying why', () => {
    const groups = foldRailGroups(t, view({ readOnly: 'newer' }), verbs());
    for (const id of ['valley', 'divide-line', 'axiom-1', 'free', 'turn-over']) {
      expect(item(groups, id).available).toBe(false);
      expect(item(groups, id).reason).toBe('This sequence is from a newer Ori Studio, so it opens read-only.');
    }
    // What is planned stays planned, whatever the sequence.
    expect(item(groups, 'inside-reverse').reason).toBe('Planned: not in Ori Studio yet.');
  });

  it('builds a tooltip from the name, the key and what it does, or why it cannot', () => {
    const groups = foldRailGroups(t, view(), verbs());
    expect(foldRailTooltip(item(groups, 'valley'), 'V')).toBe(
      'Valley fold (V) - Fold the moving side toward you, so it lands on top.'
    );
    expect(foldRailTooltip(item(groups, 'axiom-1'), undefined)).toBe(
      'Axiom 1: through two points - The line through two points.'
    );
    expect(foldRailTooltip(item(groups, 'petal'), undefined)).toBe('Petal fold - Planned: not in Ori Studio yet.');
  });
});
