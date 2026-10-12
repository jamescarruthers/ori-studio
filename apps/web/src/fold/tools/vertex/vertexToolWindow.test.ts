import { describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import type { FoldEngineRefused, FoldRefusalBody } from '../../engine/foldEngineWire';
import { foldToolWindow, type FoldPreview, type FoldToolHost, type FoldToolWindowVerbs, type FoldToolWindowView } from '../foldToolWindow';
import { foldRefusalNotice } from '../refusalNotice';
import { FOLD_VERTEX_REFUSAL_CODES } from './vertexRefusal';
import { hasVertexChoices, type FoldVertexWindowView } from './vertexToolWindow';

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
    cancel: vi.fn(),
    commit: vi.fn(),
    stepOrder: vi.fn(),
    setVertexDirection: vi.fn(),
    vertexOtherWay: vi.fn(),
    stepEmergent: vi.fn(),
    takeEmergent: vi.fn(),
    stepFanLayers: vi.fn(),
    resetSquashTarget: vi.fn(),
    useNearPrecrease: vi.fn(),
    precreaseLine: vi.fn(),
    precreaseKite: vi.fn(),
  } satisfies FoldToolWindowVerbs;
}

const mouse: FoldToolHost = { coarse: false, alt: 'Option' };
const finger: FoldToolHost = { coarse: true, alt: 'Alt' };

const vertex = (extra: Partial<FoldVertexWindowView> = {}): FoldVertexWindowView => ({
  tool: 'squash',
  direction: 'valley',
  described: true,
  known: true,
  target: 'hinge',
  emergents: [],
  emergent: 0,
  layers: 0,
  fanLayers: null,
  orders: 0,
  order: 0,
  ...extra,
});

const preview = (extra: Partial<FoldPreview> = {}): FoldPreview => ({
  section: null,
  interval: null,
  seed: 'all',
  added: [],
  refused: null,
  landing: false,
  ...extra,
});

const view = (shown: FoldVertexWindowView, extra: Partial<FoldToolWindowView> = {}): FoldToolWindowView => ({
  tool: shown.tool,
  lineMode: 'crease',
  readOnly: null,
  picks: 0,
  preview: null,
  vertex: shown,
  ...extra,
});

const refused = (refusal: FoldRefusalBody, fixes: FoldEngineRefused['fixes'] = []): FoldEngineRefused => ({
  status: 'refused',
  refusal,
  fixes,
  faces: [],
  vertices: [],
});

describe('a vertex fold’s window while its clicks are made', () => {
  it('numbers each tool’s clicks and says its precondition up front', () => {
    const squash = foldToolWindow(t, view(vertex()), verbs(), mouse);
    expect(squash).toMatchObject({ phase: 'locate', title: 'Squash fold', lineMode: null, movingSide: null });
    expect(squash?.instructions.items).toEqual(['Click the flap to squash.', 'Choose the options, then press Enter.']);
    expect(squash?.vertex?.note).toMatch(/free, held only along its hinge, and uncovered/);
    // Nothing to choose yet beside the direction.
    expect(squash?.vertex && hasVertexChoices(squash.vertex)).toBe(false);

    const ear = foldToolWindow(t, view(vertex({ tool: 'rabbit-ear' }), { picks: 3 }), verbs(), mouse);
    expect(ear?.instructions.items).toHaveLength(5);
    expect(ear?.instructions.current).toBe(3);
    expect(ear?.instructions.items[3]).toBe('Click the paper that stays put.');
    // A point click takes a landmark, never a place on an edge between them; the key frees it.
    expect(ear?.instructions.notes.slice(0, 2)).toEqual([
      'Points snap to corners, marks, crease crossings and midpoints: a click anywhere else picks nothing.',
      'Hold Option to put a point anywhere.',
    ]);
    expect(ear?.instructions.intro).toBeNull();
    expect(ear?.vertex?.note).toMatch(/incenter/);
  });

  it('says what a swivel is above its steps, and how to place its point in the first one', () => {
    const swivel = foldToolWindow(t, view(vertex({ tool: 'swivel' })), verbs(), mouse);
    expect(swivel?.instructions.intro).toMatch(/^Folds the paper about a point/);
    expect(swivel?.instructions.items).toEqual([
      'Hold Option and click where the creases meet: inside the paper, off every crease.',
      'Click a corner, midpoint or mark the first crease runs to.',
      'Click a point for the second crease.',
      'Click a point for the third crease.',
      'Click the part of the paper that stays put.',
      'Pick the fourth crease, then press Enter.',
    ]);
    // Said in the steps, so not again under the direction.
    expect(swivel?.vertex?.note).toBeNull();
    // A finger has no key to hold: the latch that frees a point, and the button.
    const touch = foldToolWindow(t, view(vertex({ tool: 'swivel' })), verbs(), finger);
    expect(touch?.instructions.items[0]).toBe(
      'Turn on Free point, then tap where the creases meet: inside the paper, off every crease.'
    );
    expect(touch?.instructions.items[5]).toBe('Pick the fourth crease, then tap Swivel fold.');
    expect(touch?.instructions.notes).toEqual([
      'Points snap to corners, marks, crease crossings and midpoints: a click anywhere else picks nothing.',
    ]);
  });

  it('locates a petal fold’s line H through the line modes, its precreases said before the first click', () => {
    const crease = foldToolWindow(t, view(vertex({ tool: 'petal' })), verbs(), mouse);
    expect(crease?.lineMode?.value).toBe('crease');
    expect(crease?.instructions.intro).toMatch(/first use the Precrease tool: fold each lower edge of the top flap/);
    expect(crease?.instructions.items).toEqual([
      'Click the precrease H, across the flap where the kite creases end.',
      'Click the flap below H, between the kite creases: the part that lifts.',
      'Choose Valley or Mountain, then press Enter.',
    ]);
    const ends = foldToolWindow(t, view(vertex({ tool: 'petal' }), { lineMode: 'axiom-1' }), verbs(), mouse);
    expect(ends?.instructions.items.slice(0, 3)).toEqual([
      'Click one end of H, where a kite crease meets the flap’s edge.',
      'Click the other end of H, where the other kite crease ends.',
      'Click the flap below H, between the kite creases: the part that lifts.',
    ]);
    expect(ends?.vertex?.note).toBeNull();
    // Previewing: what the direction does, and the commit by key or button.
    const previewing = foldToolWindow(t, view(vertex({ tool: 'petal' }), { preview: preview() }), verbs(), mouse);
    expect(previewing?.instructions.intro).toBeUndefined();
    expect(previewing?.instructions.items).toEqual([
      'Valley lifts the flap toward you, Mountain away from you: the preview shows which.',
      'Press Enter, or click Petal fold, to fold.',
    ]);
  });
});

describe('a vertex fold’s window while it previews', () => {
  it('offers a squash’s spine target, and the hinge back once it is aimed off it', () => {
    const calls = verbs();
    const onHinge = foldToolWindow(t, view(vertex(), { preview: preview() }), calls, mouse);
    expect(onHinge).toMatchObject({ phase: 'preview', meta: '2 settings' });
    expect(onHinge?.vertex?.target).toMatchObject({ label: 'Spine lands on', value: 'The hinge line', reset: null });
    const aimed = foldToolWindow(t, view(vertex({ target: 'point' }), { preview: preview() }), calls, mouse);
    expect(aimed?.vertex?.target?.value).toBe('The point clicked');
    aimed?.vertex?.target?.reset?.run();
    expect(calls.resetSquashTarget).toHaveBeenCalledTimes(1);
    aimed?.vertex?.direction.set('mountain');
    expect(calls.setVertexDirection).toHaveBeenCalledWith('mountain');
    expect(aimed?.footer?.commit).toMatchObject({ label: 'Squash fold', disabled: false });
  });

  it('steps a fan’s fourth crease and layers, says which do not fit, and offers no ridge: the fourth crease is the ear’s', () => {
    const calls = verbs();
    const ear = vertex({
      tool: 'rabbit-ear',
      emergents: [true, false, true],
      emergent: 1,
      layers: 4,
      fanLayers: 2,
    });
    const model = foldToolWindow(t, view(ear, { preview: preview() }), calls, mouse);
    const controls = model?.vertex;
    expect(controls?.emergent?.value).toBe('2 of 3');
    expect(controls?.emergentNote).toBe('This fourth crease does not fit here: step to another.');
    expect(controls?.layers?.value).toBe('Top 2 of 4');
    expect(controls).not.toHaveProperty('ridge');
    // Direction, fourth crease, layers.
    expect(model?.meta).toBe('3 settings');
    expect(model?.instructions.items[0]).toBe('Choose the fourth crease and the layers.');
    expect(controls?.note).toMatch(/a fourth the ear rises along, folded the other way/);
    controls?.emergent?.next.run();
    controls?.layers?.previous.run();
    expect(calls.stepEmergent).toHaveBeenCalledWith(1);
    expect(calls.stepFanLayers).toHaveBeenCalledWith(-1);
    // From the bottom, for a mountain; every layer, said so.
    const mountain = foldToolWindow(t, view({ ...ear, direction: 'mountain' }, { preview: preview() }), calls, mouse);
    expect(mountain?.vertex?.layers?.value).toBe('Bottom 2 of 4');
    const all = foldToolWindow(t, view({ ...ear, fanLayers: null }, { preview: preview() }), calls, mouse);
    expect(all?.vertex?.layers?.value).toBe('All 4');
  });

  it('steps the layer order when the fold leaves several', () => {
    const calls = verbs();
    const model = foldToolWindow(t, view(vertex({ orders: 3, order: 1 }), { preview: preview() }), calls, mouse);
    expect(model?.vertex?.order?.value).toBe('2 of 3');
    model?.vertex?.order?.next.run();
    expect(calls.stepOrder).toHaveBeenCalledWith(1);
  });

  it('holds the commit until the step is built, and offers nothing about a flap the engine refused', () => {
    const waiting = foldToolWindow(t, view(vertex({ known: false }), { preview: preview() }), verbs(), mouse);
    expect(waiting?.footer?.commit.disabled).toBe(true);
    const noFlap = refused({ code: 'squash_no_flap', faces: [0], cause: 'single_layer' });
    const model = foldToolWindow(
      t,
      view(vertex({ described: false, known: false }), { preview: preview({ refused: noFlap }) }),
      verbs(),
      mouse
    );
    expect(model?.vertex?.target).toBeNull();
    expect(model?.instructions.items).toEqual(['Press Esc and pick again: the notice below says what to change.']);
    expect(model?.refusal).toMatchObject({
      title: 'No flap to squash here',
      text: 'Only one layer lies here. Click a flap of two layers joined along a folded edge.',
    });
    expect(model?.footer?.commit.disabled).toBe(true);
    // A refusal with a fix to take says so first.
    const unprecreased = refused({ code: 'petal_not_precreased', faces: [], missing: 'line' });
    const petal = foldToolWindow(
      t,
      view(vertex({ tool: 'petal', described: false, known: false }), { preview: preview({ refused: unprecreased }) }),
      verbs(),
      mouse
    );
    expect(petal?.refusal?.actions.map((action) => action.label)).toEqual(['Precrease this line first']);
    expect(petal?.instructions.items).toEqual(['Click a fix below, or press Esc and pick again.']);
    const touch = foldToolWindow(
      t,
      view(vertex({ tool: 'petal', described: false, known: false }), { preview: preview({ refused: unprecreased }) }),
      verbs(),
      finger
    );
    expect(touch?.instructions.items).toEqual(['Tap a fix below, or tap Cancel and pick again.']);
  });
});

describe('a vertex fold’s refusals', () => {
  const vertexContext = (tool: FoldVertexWindowView['tool'], extra = {}) => ({
    kind: 'vertex' as const,
    flapNumber: (flap: number) => flap + 1,
    flapOf: null,
    readOnly: false,
    vertex: { tool, ...extra },
  });

  it('words every code of the family in the tool’s words, never as a fold that cannot be made', () => {
    const bodies: Record<(typeof FOLD_VERTEX_REFUSAL_CODES)[number], FoldRefusalBody> = {
      squash_no_flap: { code: 'squash_no_flap', faces: [0], cause: 'no_hinge' },
      squash_flap_not_free: { code: 'squash_flap_not_free', faces: [1] },
      squash_flap_covered: { code: 'squash_flap_covered', faces: [1] },
      squash_target_outside: { code: 'squash_target_outside' },
      petal_not_precreased: { code: 'petal_not_precreased', faces: [1], missing: 'kite' },
      petal_no_flap: { code: 'petal_no_flap', faces: [1], cause: 'no_corner' },
      fan_center: { code: 'fan_center', faces: [1] },
      fan_ray_blocked: { code: 'fan_ray_blocked', faces: [1] },
      fan_not_flat: { code: 'fan_not_flat' },
      fan_fourth_beside_stayer: { code: 'fan_fourth_beside_stayer' },
      fan_fourth_cannot_rise: { code: 'fan_fourth_cannot_rise' },
      fan_stayer_detached: { code: 'fan_stayer_detached', point: [0.5, 0.5] },
    };
    const titles = new Set<string>();
    for (const code of FOLD_VERTEX_REFUSAL_CODES) {
      const notice = foldRefusalNotice(t, refused(bodies[code]), vertexContext('squash'), verbs());
      expect(notice.title, code).not.toBe('This fold cannot be made');
      expect(notice.text, code).not.toBe('It would not land on a valid flat model.');
      titles.add(notice.title);
      // Read away from its tool, it is still worded, by the fold its code names.
      const bare = foldRefusalNotice(t, refused(bodies[code]), { ...vertexContext('squash'), vertex: undefined }, verbs());
      expect(bare.title, code).toBe(notice.title);
    }
    expect(titles.size).toBeGreaterThan(9);
    // Each cause says its own reason.
    for (const cause of ['single_layer', 'no_spine', 'no_hinge', 'upper_not_hinged'] as const) {
      const notice = foldRefusalNotice(t, refused({ code: 'squash_no_flap', faces: [0], cause }), vertexContext('squash'), verbs());
      expect(notice.text, cause).not.toBe('');
    }
    // A covered petal lifts; a covered squash opens.
    const petal = foldRefusalNotice(t, refused(bodies.squash_flap_covered), vertexContext('petal'), verbs());
    expect(petal.text).toMatch(/lift it the other way/);
    const ear = foldRefusalNotice(t, refused(bodies.fan_center), vertexContext('rabbit-ear'), verbs());
    expect(ear.text).toMatch(/incenter/);
    // A fourth crease beside the paper that stays: refused, offering the ones across from it.
    const calls = verbs();
    const beside = foldRefusalNotice(
      t,
      refused(bodies.fan_fourth_beside_stayer, [{ fix: 'use_emergent', direction: [0, -1] }]),
      vertexContext('rabbit-ear', { emergentNumber: () => 2 }),
      calls
    );
    expect(beside.title).toBe('The fourth crease is beside the paper that stays');
    expect(beside.text).toMatch(/rises along the fourth crease/);
    expect(beside.actions.map((action) => action.label)).toEqual(['Use fourth crease 2']);
    beside.actions[0]?.run();
    expect(calls.takeEmergent).toHaveBeenCalledWith([0, -1]);
  });

  it('makes every fix a button that acts: the other direction, a fourth crease that fits', () => {
    const calls = verbs();
    const notice = foldRefusalNotice(
      t,
      refused({ code: 'fan_ray_blocked', faces: [1] }, [
        { fix: 'opposite_direction' },
        { fix: 'use_emergent', direction: [0, 1] },
      ]),
      vertexContext('swivel', { emergentNumber: () => 3 }),
      calls
    );
    expect(notice.actions.map((action) => action.label)).toEqual(['Fold it the other way', 'Use fourth crease 3']);
    notice.actions.forEach((action) => action.run());
    expect(calls.vertexOtherWay).toHaveBeenCalledTimes(1);
    expect(calls.foldOtherWay).not.toHaveBeenCalled();
    expect(calls.takeEmergent).toHaveBeenCalledWith([0, 1]);
  });

  it('gives the refusals the engine offers no fix for the tools’ own buttons', () => {
    const calls = verbs();
    const target = foldRefusalNotice(t, refused({ code: 'squash_target_outside' }), vertexContext('squash'), calls);
    expect(target.actions.map((action) => action.label)).toEqual(['Put the spine onto the hinge']);
    target.actions[0]?.run();
    expect(calls.resetSquashTarget).toHaveBeenCalledTimes(1);

    const line = { code: 'petal_not_precreased' as const, faces: [], missing: 'line' as const };
    const far = foldRefusalNotice(t, refused(line), vertexContext('petal'), calls);
    expect(far.title).toBe('Precrease the line first');
    expect(far.actions.map((action) => action.label)).toEqual(['Precrease this line first']);
    const near = foldRefusalNotice(t, refused(line), vertexContext('petal', { nearPrecrease: true }), calls);
    expect(near.title).toBe('The line misses the precrease');
    expect(near.actions.map((action) => action.label)).toEqual(['Use the precrease', 'Precrease this line first']);
    near.actions.forEach((action) => action.run());
    expect(calls.useNearPrecrease).toHaveBeenCalledTimes(1);
    expect(calls.precreaseLine).toHaveBeenCalledTimes(1);

    const kite = foldRefusalNotice(
      t,
      refused({ code: 'petal_not_precreased', faces: [1], missing: 'kite' }),
      vertexContext('petal'),
      calls
    );
    expect(kite.actions.map((action) => action.label)).toEqual(['Precrease the kite']);
    kite.actions[0]?.run();
    expect(calls.precreaseKite).toHaveBeenCalledTimes(1);
    // Read-only: shown, none taken.
    const locked = foldRefusalNotice(t, refused(line), { ...vertexContext('petal'), readOnly: true }, calls);
    expect(locked.actions.every((action) => action.disabled)).toBe(true);
  });
});
