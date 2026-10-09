import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FoldCrossSection } from '../engine/foldEngineWire';
import { FOLD_DIVIDE_DEFAULT, type FoldDivideSettings } from './foldToolState';
import {
  foldToolWindow,
  type FoldPreview,
  type FoldToolHost,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
} from './foldToolWindow';

const t = i18n.t.bind(i18n);

function verbs() {
  return {
    selectTool: vi.fn(),
    selectLineMode: vi.fn(),
    includeFlaps: vi.fn(),
    foldOtherWay: vi.fn(),
    pickFlap: vi.fn(),
    useLine: vi.fn(),
    swapSide: vi.fn(),
    toggleFlap: vi.fn(),
    hoverFlap: vi.fn(),
    cancel: vi.fn(),
    commit: vi.fn(),
  } satisfies FoldToolWindowVerbs;
}

const mouse: FoldToolHost = { coarse: false, alt: 'Option' };
const finger: FoldToolHost = { coarse: true, alt: 'Alt' };

const view = (extra: Partial<FoldToolWindowView> = {}): FoldToolWindowView => ({
  tool: 'valley',
  lineMode: 'axiom-2',
  readOnly: null,
  picks: 0,
  preview: null,
  ...extra,
});

/** Two flaps of two layers each at the line: the square folded in half twice. */
const section: FoldCrossSection = {
  line: { n: [0, 1], d: 0.5 },
  side: 'positive',
  from: { x: 0, y: 0.5 },
  to: { x: 1, y: 0.5 },
  flaps: [
    { faces: [2, 3], witness: [0.2, 0.7] },
    { faces: [0, 1], witness: [0.2, 0.2] },
  ],
  rows: [
    { faces: [3], spans: [[0, 1]], flap: 0 },
    { faces: [2], spans: [[0, 1]], flap: 0 },
    { faces: [1], spans: [[0, 1]], flap: 1 },
    { faces: [0], spans: [[0, 1]], flap: 1 },
  ],
  intervals: [{ start: 0, end: 1, faces: [3, 2, 1, 0], rows: [0, 1, 2, 3] }],
  order: { kind: 'layered', unordered: [] },
  layers: 4,
  joins: [{ upper: 0, lower: 1, at: 1 }],
};

const preview = (extra: Partial<FoldPreview> = {}): FoldPreview => ({
  section,
  interval: null,
  seed: 'all',
  added: [],
  refused: null,
  landing: false,
  ...extra,
});

describe('foldToolWindow while the line is located', () => {
  it('numbers the line mode’s clicks, marks the one in hand, and ends on picking the fold', () => {
    const model = foldToolWindow(t, view({ picks: 1 }), verbs(), mouse);
    expect(model?.phase).toBe('locate');
    expect(model?.title).toBe('Valley fold');
    expect(model?.meta).toBe('1 setting');
    expect(model?.instructions.items).toEqual([
      'Click the point to move.',
      'Click where it should land.',
      'Pick the fold and the layers, then press Enter.',
    ]);
    expect(model?.instructions.current).toBe(1);
    expect(model?.instructions.notes).toEqual([
      'Points snap to corners, marks, crease crossings, midpoints and edges.',
      'Hold Option to put a point down anywhere, without snapping.',
      'Esc clears the picks.',
    ]);
    expect(model?.kind).toBeNull();
    expect(model?.footer).toBeNull();
  });

  it('gives every line mode its own steps, in click order', () => {
    const steps = (lineMode: FoldToolWindowView['lineMode']) =>
      foldToolWindow(t, view({ lineMode }), verbs(), mouse)?.instructions.items.length;
    expect(steps('axiom-1')).toBe(3);
    expect(steps('axiom-5')).toBe(4);
    expect(steps('axiom-6')).toBe(5);
    expect(steps('free')).toBe(3);
    expect(steps('crease')).toBe(2);
  });

  it('offers no keys to a finger, and names the button it will tap', () => {
    const model = foldToolWindow(t, view({ tool: 'mountain' }), verbs(), finger);
    expect(model?.instructions.items.at(-1)).toBe('Pick the fold and the layers, then tap Mountain fold.');
    expect(model?.instructions.notes).toEqual([
      'Points snap to corners, marks, crease crossings, midpoints and edges.',
    ]);
    const free = foldToolWindow(t, view({ lineMode: 'free' }), verbs(), finger);
    expect(free?.instructions.notes).toEqual(['No snapping: the line goes exactly where you click.']);
  });

  it('keeps the step in hand inside the list once every reference is picked', () => {
    expect(foldToolWindow(t, view({ picks: 9 }), verbs(), mouse)?.instructions.current).toBe(2);
  });

  it('offers every line mode in the select, and passes on a choice that is one', () => {
    const calls = verbs();
    const select = foldToolWindow(t, view(), calls, mouse)?.lineMode;
    expect(select?.label).toBe('Locate line');
    expect(select?.value).toBe('axiom-2');
    expect(select?.options.map((option) => option.label)).toEqual([
      'Axiom 1: through two points',
      'Axiom 2: point onto point',
      'Axiom 3: edge onto edge',
      'Axiom 4: perpendicular through a point',
      'Axiom 5: point onto a line, through a point',
      'Axiom 6: two points onto two lines',
      'Axiom 7: point onto a line, perpendicular',
      'Free line',
      'Existing crease',
    ]);
    select?.set('crease');
    select?.set('not-a-mode');
    expect(calls.selectLineMode.mock.calls).toEqual([['crease']]);
  });
});

describe('foldToolWindow with a fold under preview', () => {
  it('shows the kind, the moving side, the layers and the footer, and binds each', () => {
    const calls = verbs();
    const model = foldToolWindow(t, view({ preview: preview() }), calls, mouse);
    expect(model?.phase).toBe('preview');
    expect(model?.meta).toBe('3 settings');
    expect(model?.instructions.items).toEqual(['Pick which layers move.', 'Press Enter to fold.']);
    expect(model?.lineMode).toBeNull();

    expect(model?.kind?.value).toBe('valley');
    expect(model?.kind?.options.map((option) => option.label)).toEqual(['Valley fold', 'Mountain fold', 'Precrease']);
    model?.kind?.set('precrease');
    expect(calls.selectTool).toHaveBeenCalledWith('precrease');

    expect(model?.movingSide?.swapLabel).toBe('Swap');
    model?.movingSide?.swap();
    expect(calls.swapSide).toHaveBeenCalledTimes(1);

    expect(model?.layers?.summary).toBe('4 of 4 layers moving');
    expect(model?.layers?.picker?.rows.map((row) => row.state)).toEqual(['picked', 'picked', 'picked', 'picked']);
    expect(model?.layers?.chips.map((chip) => chip.pressed)).toEqual([true, true]);
    model?.layers?.toggle(1);
    model?.layers?.hover(0);
    expect(calls.toggleFlap).toHaveBeenCalledWith(1);
    expect(calls.hoverFlap).toHaveBeenCalledWith(0);

    expect(model?.footer?.cancel.label).toBe('Cancel');
    expect(model?.footer?.cancel.shortcut).toBe('viewport.cancel');
    expect(model?.footer?.commit).toMatchObject({ label: 'Valley fold', shortcut: 'fold.commit', disabled: false });
    model?.footer?.commit.run();
    model?.footer?.cancel.run();
    expect(calls.commit).toHaveBeenCalledTimes(1);
    expect(calls.cancel).toHaveBeenCalledTimes(1);
    expect(model?.refusal).toBeNull();
  });

  it('reads a narrowed seed and what the fold moved besides', () => {
    const model = foldToolWindow(t, view({ preview: preview({ seed: [1], added: [] }) }), verbs(), mouse);
    expect(model?.layers?.summary).toBe('2 of 4 layers moving');
    expect(model?.layers?.chips.map((chip) => chip.pressed)).toEqual([false, true]);
    const anyway = foldToolWindow(t, view({ preview: preview({ seed: [1], added: [0] }) }), verbs(), mouse);
    expect(anyway?.layers?.summary).toBe('4 of 4 layers moving');
    expect(anyway?.layers?.chips.map((chip) => chip.added)).toEqual([true, false]);
  });

  it('says it is still finding the layers until the section arrives', () => {
    const model = foldToolWindow(t, view({ preview: preview({ section: null }) }), verbs(), mouse);
    expect(model?.layers?.picker).toBeNull();
    expect(model?.layers?.summary).toBeNull();
    expect(model?.layers?.finding).toBe('Finding the layers at the line…');
    expect(model?.layers?.chips).toEqual([]);
  });

  it('refuses to commit while the fold is landing, refused or read-only, and offers the fixes', () => {
    const commit = (extra: Partial<FoldToolWindowView>) =>
      foldToolWindow(t, view(extra), verbs(), mouse)?.footer?.commit.disabled;
    expect(commit({ preview: preview({ landing: true }) })).toBe(true);
    expect(commit({ preview: preview(), readOnly: 'locked' })).toBe(true);

    const calls = verbs();
    const refused = foldToolWindow(
      t,
      view({
        preview: preview({
          seed: [1],
          refused: {
            refusal: { code: 'closure_adds_flaps', added: [0] },
            fixes: [{ fix: 'include_flaps', flaps: [0] }, { fix: 'opposite_direction' }],
          },
        }),
      }),
      calls,
      mouse
    );
    expect(refused?.footer?.commit.disabled).toBe(true);
    expect(refused?.refusal?.title).toBe('More flaps would move');
    // The engine's flap 0 is the top flap at the line: Flap 1 on screen, as its chip says.
    expect(refused?.refusal?.actions.map((action) => action.label)).toEqual([
      'Include flap 1',
      'Mountain fold instead',
    ]);
    expect(refused?.layers?.chips.map((chip) => [chip.name, chip.needed])).toEqual([
      ['Flap 1', true],
      ['Flap 2', false],
    ]);
    refused?.refusal?.actions[0]?.run();
    expect(calls.includeFlaps).toHaveBeenCalledWith([0]);
  });

  it('holds the controls on a read-only sequence', () => {
    const model = foldToolWindow(t, view({ preview: preview(), readOnly: 'newer' }), verbs(), mouse);
    expect(model?.kind?.disabled).toBe(true);
    expect(model?.movingSide?.disabled).toBe(true);
    expect(model?.layers?.disabled).toBe(true);
    expect(model?.footer?.cancel.disabled).toBe(false);
    expect(foldToolWindow(t, view({ readOnly: 'newer' }), verbs(), mouse)?.lineMode?.disabled).toBe(true);
  });
});

describe('foldToolWindow for the other tools', () => {
  it('says how to use the Divide line', () => {
    const model = foldToolWindow(t, view({ tool: 'divide-line' }), verbs(), mouse);
    expect(model?.phase).toBe('divide');
    expect(model?.title).toBe('Divide line');
    expect(model?.meta).toBe('Instructions');
    expect(model?.instructions.items).toEqual([
      'Click an edge or crease to divide it.',
      'Use the new points as references for any fold.',
    ]);
  });

  it('has no window for the planned inside reverse fold', () => {
    expect(foldToolWindow(t, view({ tool: 'inside-reverse' }), verbs(), mouse)).toBeNull();
  });

  it('offers the Divide line’s count, its exact ratio, and clearing the marks made here', () => {
    const setDivide = vi.fn();
    const clearMarks = vi.fn();
    const divide = (settings: Partial<FoldDivideSettings>, marks = 2) => ({
      settings: { ...FOLD_DIVIDE_DEFAULT, ...settings },
      marks,
    });
    const bound = { ...verbs(), setDivide, clearMarks };
    const counted = foldToolWindow(t, view({ tool: 'divide-line', divide: divide({}) }), bound, mouse)?.divide;
    expect(counted?.parts).toMatchObject({ value: 2, min: 2, max: 32 });
    expect(counted?.ratio).toBeNull();
    expect(counted?.clear).toMatchObject({ label: 'Clear the 2 marks made here', disabled: false });
    counted?.clear.run();
    expect(clearMarks).toHaveBeenCalled();

    const ratio = foldToolWindow(t, view({ tool: 'divide-line', divide: divide({ mode: 'ratio' }, 0) }), bound, mouse)
      ?.divide;
    expect(ratio?.parts).toBeNull();
    expect(ratio?.ratio?.readout).toBe('Computed ratio 1 : 1');
    expect(ratio?.clear.disabled).toBe(true);
    // Edit's ratio fields' spelling: a radical is accepted, nonsense is not.
    expect(ratio?.ratio?.right.set('sqrt(2)')).toBe(true);
    expect(setDivide).toHaveBeenLastCalledWith({ ratio: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 2 } });
    expect(ratio?.ratio?.left.set('two')).toBe(false);
    // Without the verbs, a surface offers none.
    expect(foldToolWindow(t, view({ tool: 'divide-line', divide: divide({}) }), verbs(), mouse)?.divide).toBeNull();
  });
});
