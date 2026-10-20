import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { FOLD_PENDING_NODE } from '../session/foldSessionState';
import type { FoldPathEntry } from '../sequence/foldSequencePath';
import { foldToolWindow, type FoldToolHost, type FoldToolWindowVerbs, type FoldToolWindowView } from '../tools/foldToolWindow';
import type { FoldRepeatPhase, FoldRepeatWindowView } from './repeatToolWindow';

const t = i18n.t.bind(i18n);
const HOST: FoldToolHost = { coarse: false, alt: 'Option' };

const entry = (id: string | null, number: number): FoldPathEntry => ({
  id,
  key: id ?? 'sheet',
  node: null,
  kind: id === null ? 'sheet' : 'fold',
  number,
  status: 'ok',
  session: { ...FOLD_PENDING_NODE, status: 'ok', state: { generation: 1, id: number } },
  branches: null,
});
const entries = [entry(null, 0), entry('s1', 1), entry('s2', 2)];

function repeat(phase: FoldRepeatPhase, extra: Partial<FoldRepeatWindowView> = {}): FoldRepeatWindowView {
  return {
    range: { entries, starts: entries.slice(1), first: 's1', count: 2 },
    axes: [
      { n: [1, 0], d: 0.5 },
      { n: [0, 1], d: 0.5 },
    ],
    axis: 0,
    individual: false,
    rebuilding: false,
    phase,
    drawing: true,
    drawn: null,
    ...extra,
  };
}

function verbs() {
  return {
    selectTool: vi.fn(),
    selectLineMode: vi.fn(),
    swapSide: vi.fn(),
    toggleFlap: vi.fn(),
    cancel: vi.fn(),
    commit: vi.fn(),
    setFreeLineSnap: vi.fn(),
    repeat: {
      setFirst: vi.fn(),
      setAxis: vi.fn(),
      setIndividual: vi.fn(),
      stepOrder: vi.fn(),
      acceptOrder: vi.fn(),
      backFromOrder: vi.fn(),
    },
  } as unknown as FoldToolWindowVerbs & { repeat: NonNullable<FoldToolWindowVerbs['repeat']> };
}

function windowOf(state: FoldRepeatWindowView, calls = verbs()) {
  const view: FoldToolWindowView = { tool: 'repeat', lineMode: 'axiom-2', readOnly: null, picks: 0, preview: null, freeLineSnap: true, repeat: state };
  const model = foldToolWindow(t, view, calls, HOST);
  if (!model) throw new Error('no window');
  return model;
}

describe("Repeat's window", () => {
  it('offers the range start, the verified axes by name and how it is added, and adds the repeat previewed', () => {
    const calls = verbs();
    const model = windowOf(repeat({ kind: 'ready', busy: false }), calls);
    expect(model.title).toBe('Repeat on the other side');
    expect(model.steps).toMatchObject({ label: 'Start with', value: 's1', options: [{ id: 's1', label: 'Step 1' }, { id: 's2', label: 'Step 2' }] });
    expect(model.repeat?.axis).toMatchObject({
      label: 'Symmetry axis',
      value: '0',
      options: [
        { id: '0', label: 'Vertical axis' },
        { id: '1', label: 'Horizontal axis' },
      ],
    });
    expect(model.repeat?.individual).toMatchObject({ label: 'Show as individual steps', checked: false });
    expect(model.repeat?.summary).toBe('Repeat 2 operations through the current step as one numbered step.');
    // A free line draws the axis: the window offers its snapping, as every free line's.
    expect(model.freeLineSnap).toMatchObject({ label: 'Snap to points', checked: true });
    // One confirm: the preview is on the canvas, and the commit adds it.
    expect(model.instructions.items.at(-1)).toBe('Press Enter to add the repeated folds.');
    expect(model.instructions.current).toBe(2);
    expect(model.instructions.notes).toEqual(['The canvas shows the repeated folds and the creases they add.']);
    expect(model.footer?.commit).toMatchObject({ label: 'Repeat', disabled: false });
    expect(model.footer?.cancel.label).toBe('Cancel');
    model.repeat?.axis.set('1');
    model.steps?.set('s2');
    model.repeat?.individual?.set(true);
    expect(calls.repeat.setAxis).toHaveBeenCalledWith(1);
    expect(calls.repeat.setFirst).toHaveBeenCalledWith('s2');
    expect(calls.repeat.setIndividual).toHaveBeenCalledWith(true);
  });

  it('turns its cancel into Stop while the preview prepares, the range and axis still free to change', () => {
    const preparing = windowOf(repeat({ kind: 'preparing' }));
    expect(preparing.footer?.cancel.label).toBe('Stop');
    expect(preparing.footer?.commit).toMatchObject({ label: 'Repeat', disabled: true });
    expect(preparing.instructions.notes).toEqual(['Preparing repeated folds…']);
    expect(preparing.steps?.disabled).toBe(false);
    expect(preparing.repeat?.axis.disabled).toBe(false);
    // An axis may be drawn while it prepares: a new one prepares anew.
    expect(preparing.freeLineSnap).toMatchObject({ label: 'Snap to points' });
    // While the repeat is added, nothing changes under it.
    const adding = windowOf(repeat({ kind: 'ready', busy: true }, { drawing: false }));
    expect(adding.footer?.commit.disabled).toBe(true);
    expect(adding.steps?.disabled).toBe(true);
    expect(adding.repeat?.axis.disabled).toBe(true);
    expect(adding.freeLineSnap).toBeUndefined();
    // Stopped, the commit prepares it again.
    const stopped = windowOf(repeat({ kind: 'stopped' }));
    expect(stopped.footer?.commit).toMatchObject({ label: 'Repeat', disabled: false });
    expect(stopped.instructions.notes).toEqual(['Stopped before the repeat was ready. No steps were added.']);
    const rebuilt = windowOf(repeat({ kind: 'ready', busy: false }, { rebuilding: true }));
    expect(rebuilt.footer?.commit.label).toBe('Update from source steps');
    // A rebuild adds as the repeat was added.
    expect(rebuilt.repeat?.individual).toBeNull();
  });

  it('says to tap the commit on a touch screen', () => {
    const view: FoldToolWindowView = { tool: 'repeat', lineMode: 'axiom-2', readOnly: null, picks: 0, preview: null, freeLineSnap: true, repeat: repeat({ kind: 'ready', busy: false }) };
    const model = foldToolWindow(t, view, verbs(), { coarse: true, alt: 'Option' });
    expect(model?.instructions.items.at(-1)).toBe('Tap Repeat to add the repeated folds.');
  });

  it('says why a repeat stopped in its own words, with its advice', () => {
    const blocked = windowOf(
      repeat({ kind: 'blocked', step: 0, stop: { code: 'witness_not_in_face', refusal: { code: 'witness_not_in_face' } } })
    );
    expect(blocked.refusal).toMatchObject({
      code: 'witness_not_in_face',
      title: 'Cannot repeat',
      text: 'Stopped at source operation 1: The spot the mirrored fold picks is not inside a layer on the moving side. Try another axis, or start the range after this operation.',
    });
    expect(blocked.footer?.commit.disabled).toBe(true);
    const none = windowOf(repeat({ kind: 'failed', stop: { code: 'repeat_axis' } }, { axes: [], axis: -1, drawing: false }));
    expect(none.refusal?.code).toBe('repeat_axis');
    expect(none.footer?.commit.disabled).toBe(true);
  });

  it('refuses a drawn line that is no axis, offering the nearest in its place', () => {
    const calls = verbs();
    const model = windowOf(repeat({ kind: 'ready', busy: false }, { drawn: { nearest: 1 } }), calls);
    expect(model.refusal).toMatchObject({
      code: 'repeat_axis_drawn',
      title: 'Not a symmetry axis',
      text: 'This line does not pair matching material and layers in the starting model.',
    });
    expect(model.refusal?.actions.map((action) => action.label)).toEqual(['Use Horizontal axis']);
    model.refusal?.actions[0]?.run();
    expect(calls.repeat.setAxis).toHaveBeenCalledWith(1);
    expect(windowOf(repeat({ kind: 'preparing' }, { drawn: { nearest: -1 } })).refusal?.actions).toEqual([]);
  });

  it('chooses a layer order with the shared chooser, its own buttons in place of the footer', () => {
    const calls = verbs();
    const model = windowOf(repeat({ kind: 'choosing', step: 1, count: 3, index: 0, waiting: false, failed: false }), calls);
    expect(model.footer).toBeNull();
    expect(model.instructions.notes).toContain('Source operation 2 has 3 matching layer orders. Choose one to continue.');
    expect(model.repeat?.order).toMatchObject({ index: 0, count: 3, ready: true });
    model.repeat?.order?.step(1);
    model.repeat?.order?.accept();
    model.repeat?.order?.back();
    expect(calls.repeat.stepOrder).toHaveBeenCalledWith(1);
    expect(calls.repeat.acceptOrder).toHaveBeenCalledOnce();
    expect(calls.repeat.backFromOrder).toHaveBeenCalledOnce();
  });

  it('has nothing to offer at the flat sheet', () => {
    const model = windowOf(repeat({ kind: 'unavailable', why: 'sheet' }, { range: null, axes: null, axis: -1, drawing: false }));
    expect(model.steps).toBeNull();
    expect(model.instructions.notes).toEqual(['Fold a step first.']);
    expect(model.footer?.commit.disabled).toBe(true);
  });
});
