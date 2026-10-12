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
    setVertexLineBy: vi.fn(),
    precreaseLine: vi.fn(),
    precreaseKite: vi.fn(),
    petalByEnds: vi.fn(),
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
  fourths: 0,
  fourth: 0,
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

  it('words a finger’s clicks as taps, as its choose step does', () => {
    const ear = foldToolWindow(t, view(vertex({ tool: 'rabbit-ear' })), verbs(), finger);
    expect(ear?.instructions.items).toEqual([
      'Tap the triangle’s first corner.',
      'Tap its second corner.',
      'Tap its third corner.',
      'Tap the paper that stays put.',
      'Choose the options, then tap Rabbit ear.',
    ]);
    expect(ear?.instructions.notes).toEqual([
      'Points snap to corners, marks, crease crossings and midpoints: a tap anywhere else picks nothing.',
      'Turn on Free point to put a point anywhere.',
    ]);
    const squash = foldToolWindow(t, view(vertex()), verbs(), finger);
    expect(squash?.instructions.items[0]).toBe('Tap the flap to squash.');
  });

  it('says what a swivel is above its steps, then its pivot, its edge and the line it lands on', () => {
    const calls = verbs();
    const swivel = foldToolWindow(t, view(vertex({ tool: 'swivel', lineBy: 'crease' })), calls, mouse);
    expect(swivel?.instructions.intro).toMatch(/^Swivels an edge onto a line, pivoting at a point/);
    expect(swivel?.instructions.items).toEqual([
      'Click the pivot.',
      'Click the edge that moves: a raw edge or a folded edge.',
      'Click the line it should land on: a crease or an edge.',
      'Pick the ridge and the direction, then press Enter.',
    ]);
    // Said in the steps, so not again under the direction.
    expect(swivel?.vertex?.note).toBeNull();
    // The line it lands on, by a crease or edge or by two points.
    expect(swivel?.vertex?.lineBy).toMatchObject({
      label: 'Lands on',
      value: 'crease',
      options: [{ short: 'Crease or edge' }, { short: 'Two points' }],
    });
    expect(swivel?.meta).toBe('2 settings');
    swivel?.vertex?.lineBy?.set('points');
    expect(calls.setVertexLineBy).toHaveBeenCalledWith('points');
    const points = foldToolWindow(t, view(vertex({ tool: 'swivel', lineBy: 'points' })), calls, mouse);
    expect(points?.instructions.items.slice(2, 4)).toEqual([
      'Click a point on the line it should land on.',
      'Click a second point on that line.',
    ]);
    // A finger taps, and has no key to hold.
    const touch = foldToolWindow(t, view(vertex({ tool: 'swivel' })), calls, finger);
    expect(touch?.instructions.items).toEqual([
      'Tap the pivot.',
      'Tap the edge that moves: a raw edge or a folded edge.',
      'Tap the line it should land on: a crease or an edge.',
      'Pick the ridge and the direction, then tap Swivel fold.',
    ]);
    expect(touch?.instructions.notes).toEqual([
      'Points snap to corners, marks, crease crossings and midpoints: a tap anywhere else picks nothing.',
      'Turn on Free point to put a point anywhere.',
    ]);
  });

  it('starts a petal fold on its hinge crease, or its two ends, then the flap that lifts', () => {
    const calls = verbs();
    const crease = foldToolWindow(t, view(vertex({ tool: 'petal', lineBy: 'crease' })), calls, mouse);
    expect(crease?.lineMode).toBeNull();
    expect(crease?.instructions.intro).toMatch(/^Lifts a flap’s lower point up along a hinge/);
    expect(crease?.instructions.items).toEqual([
      'Select the hinge crease.',
      'Click the flap below the hinge: the part that lifts lights up under the pointer.',
      'Choose Valley or Mountain, then press Enter.',
    ]);
    expect(crease?.instructions.notes[0]).toBe('Only precreases can be the hinge: one lights up under the pointer.');
    // A finger has no pointer to light one up under.
    const tapped = foldToolWindow(t, view(vertex({ tool: 'petal', lineBy: 'crease' })), calls, finger);
    expect(tapped?.instructions.notes).toEqual(['Only precreases can be the hinge: tap one across the flap.']);
    expect(crease?.vertex?.lineBy).toMatchObject({
      label: 'Hinge',
      value: 'crease',
      options: [{ short: 'Hinge crease' }, { short: 'Two endpoints' }],
    });
    crease?.vertex?.lineBy?.set('points');
    expect(calls.setVertexLineBy).toHaveBeenCalledWith('points');
    const ends = foldToolWindow(t, view(vertex({ tool: 'petal', lineBy: 'points' }), { picks: 1 }), calls, mouse);
    expect(ends?.instructions.items.slice(0, 3)).toEqual([
      'Click one end of the hinge, where a kite crease meets the flap’s edge.',
      'Click its other end, where the other kite crease meets the edge.',
      'Click the flap below the hinge: the part that lifts lights up under the pointer.',
    ]);
    expect(ends?.instructions.current).toBe(1);
    expect(ends?.instructions.notes[0]).toMatch(/^Points snap to corners/);
    // The hinge named: the flap's step, and what lights up.
    const region = foldToolWindow(t, view(vertex({ tool: 'petal', lineBy: 'points' }), { picks: 2 }), calls, mouse);
    expect(region?.instructions.current).toBe(2);
    expect(region?.instructions.notes[0]).toBe(
      'Paper below the hinge lights up where a petal fold can lift it: a click elsewhere says why not.'
    );
    expect(ends?.vertex?.note).toBeNull();
    // Previewing: what the direction does, another flap, and the commit by key or button.
    const previewing = foldToolWindow(t, view(vertex({ tool: 'petal' }), { preview: preview() }), calls, mouse);
    expect(previewing?.instructions.intro).toBeUndefined();
    expect(previewing?.instructions.items).toEqual([
      'Valley lifts the flap toward you, Mountain away from you. Click another flap below the hinge to lift that one.',
      'Press Enter, or click Petal fold, to fold.',
    ]);
    // A finger taps.
    const touch = foldToolWindow(t, view(vertex({ tool: 'petal', lineBy: 'points' })), calls, finger);
    expect(touch?.instructions.items.slice(0, 3)).toEqual([
      'Tap one end of the hinge, where a kite crease meets the flap’s edge.',
      'Tap its other end, where the other kite crease meets the edge.',
      'Tap the flap below the hinge, the part that lifts.',
    ]);
  });

  it('says what a petal fold creases itself as the flap lifts', () => {
    const said = (hinge: boolean, kites: number) =>
      foldToolWindow(t, view(vertex({ tool: 'petal', petalScores: { hinge, kites } }), { preview: preview() }), verbs(), mouse)
        ?.vertex?.note;
    expect(said(true, 2)).toBe(
      'The fold creases the hinge through the top layer and both kite creases through the top two layers as the flap lifts.'
    );
    expect(said(true, 1)).toMatch(/^The fold creases the hinge through the top layer and one kite crease/);
    expect(said(true, 0)).toBe(
      'The fold creases the hinge through the top layer as the flap lifts. The kite creases are there already.'
    );
    expect(said(false, 2)).toMatch(/^The fold creases both kite creases through the top two layers/);
    expect(said(false, 1)).toMatch(/^The fold creases one kite crease/);
    expect(said(false, 0)).toBe('Every crease it folds is there already: it refolds the hinge and the kite creases.');
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

  it('steps a fan’s fourth crease among those that land, and layers, and offers no ridge: the fourth crease is the ear’s', () => {
    const calls = verbs();
    const ear = vertex({
      tool: 'rabbit-ear',
      // Of three candidates, two land: only they are offered.
      fourths: 2,
      fourth: 1,
      layers: 4,
      fanLayers: 2,
    });
    const model = foldToolWindow(t, view(ear, { preview: preview() }), calls, mouse);
    const controls = model?.vertex;
    expect(controls?.emergent?.value).toBe('2 of 2');
    expect(controls?.emergentNote).toBe('2 fourth creases fit with this paper staying put.');
    expect(controls?.layers?.value).toBe('Top 2 of 4');
    expect(controls).not.toHaveProperty('ridge');
    // Direction, fourth crease, layers.
    expect(model?.meta).toBe('3 settings');
    expect(model?.instructions.items[0]).toBe(
      'Choose the fourth crease and the layers. Click other paper to change what stays put.'
    );
    expect(foldToolWindow(t, view(ear, { preview: preview() }), calls, finger)?.instructions.items[0]).toBe(
      'Choose the fourth crease and the layers. Tap other paper to change what stays put.'
    );
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

  it('keeps a fan’s fourth crease row with one that lands, or none, and says in its place what helps', () => {
    const calls = verbs();
    const ear = vertex({ tool: 'rabbit-ear', fourths: 1, fourth: 0, layers: 1 });
    const one = foldToolWindow(t, view(ear, { preview: preview() }), calls, mouse)?.vertex;
    expect(one?.emergent).toMatchObject({ value: '1 of 1', previous: { disabled: true }, next: { disabled: true } });
    expect(one?.emergentNote).toBe('One fourth crease fits with this paper staying put.');
    one?.emergent?.next.run();
    expect(calls.stepEmergent).not.toHaveBeenCalled();
    // None lands: no step, so nothing to refuse, and the row says so where it always is.
    const none = foldToolWindow(t, view({ ...ear, fourths: 0, known: false }, { preview: preview() }), calls, mouse);
    expect(none?.vertex?.emergent).toMatchObject({ value: 'None', next: { disabled: true } });
    expect(none?.vertex?.emergentNote).toBe('No fourth crease fits with this paper staying put: click other paper to stay.');
    expect(none?.refusal).toBeNull();
    expect(none?.footer?.commit.disabled).toBe(true);
    const touch = foldToolWindow(t, view({ ...ear, fourths: 0, known: false }, { preview: preview() }), calls, finger);
    expect(touch?.vertex?.emergentNote).toBe('No fourth crease fits with this paper staying put: tap other paper to stay.');
    // Nor would other paper staying: pick again.
    const nowhere = { ...ear, fourths: 0, known: false, fourthElsewhere: false };
    expect(foldToolWindow(t, view(nowhere, { preview: preview() }), calls, mouse)?.vertex?.emergentNote).toBe(
      'No fourth crease fits these creases, whichever paper stays: press Esc and pick again.'
    );
    expect(foldToolWindow(t, view(nowhere, { preview: preview() }), calls, finger)?.vertex?.emergentNote).toBe(
      'No fourth crease fits these creases, whichever paper stays: tap Cancel and pick again.'
    );
    // Other paper would: said so, as before the answer is in.
    expect(
      foldToolWindow(t, view({ ...nowhere, fourthElsewhere: true }, { preview: preview() }), calls, mouse)?.vertex?.emergentNote
    ).toBe('No fourth crease fits with this paper staying put: click other paper to stay.');
  });

  it('steps a swivel’s ridge by name among those that land, and says what its vertex is', () => {
    const calls = verbs();
    const swivel = vertex({ tool: 'swivel', lineBy: 'crease', fourths: 2, fourth: 1, ridge: 'end' });
    const model = foldToolWindow(t, view(swivel, { preview: preview() }), calls, mouse);
    const controls = model?.vertex;
    expect(controls?.emergent).toMatchObject({ label: 'Ridge', value: 'Toward the edge’s end' });
    expect(controls?.emergentNote).toBe('Either ridge lets it fold flat: step to the other.');
    // Every layer at its vertex: no layers to step.
    expect(controls?.layers).toBeNull();
    expect(controls?.note).toMatch(/^The creases meet at the dot: the pivot, moved onto the line halfway/);
    expect(model?.instructions.items[0]).toBe('Step Ridge to the other crease that can rise, and choose Valley or Mountain.');
    // Direction, the line it lands on, the ridge.
    expect(model?.meta).toBe('3 settings');
    controls?.emergent?.previous.run();
    expect(calls.stepEmergent).toHaveBeenCalledWith(-1);
    // One lands: named, its arrows off.
    const one = foldToolWindow(t, view({ ...swivel, fourths: 1, fourth: 0, ridge: 'foot' }, { preview: preview() }), calls, mouse);
    expect(one?.vertex?.emergent).toMatchObject({ value: 'Square to the edge', next: { disabled: true } });
    expect(one?.vertex?.emergentNote).toBe('Only this ridge lets it fold flat.');
    const none = foldToolWindow(t, view({ ...swivel, fourths: 0, fourth: 0 }, { preview: preview() }), calls, mouse);
    expect(none?.vertex?.emergent?.value).toBe('None');
    expect(none?.vertex?.emergentNote).toBe('Neither ridge lets it fold flat: the notice below says why.');
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
    expect(petal?.refusal?.actions.map((action) => action.label)).toEqual(['Precrease the hinge first']);
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
      swivel_not_an_edge: { code: 'swivel_not_an_edge', point: [0.5, 0.3] },
      swivel_target_parallel: { code: 'swivel_target_parallel', faces: [0] },
      swivel_pivot_on_edge: { code: 'swivel_pivot_on_edge', faces: [0] },
      swivel_edge_short: { code: 'swivel_edge_short', faces: [0] },
      swivel_edge_stays: { code: 'swivel_edge_stays', faces: [0] },
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
    expect(titles.size).toBeGreaterThan(14);
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

  it('words a petal fold with no flap by what the engine names of it: a hinge that misses the flap, or too near its closed point', () => {
    const noFlap = (cause: 'no_ends' | 'no_corner', detail?: object) =>
      foldRefusalNotice(t, refused({ code: 'petal_no_flap', faces: [1], cause, ...(detail ? { detail } : {}) } as FoldRefusalBody), vertexContext('petal'), verbs());
    expect(noFlap('no_ends', { kind: 'misses_flap' })).toMatchObject({
      title: 'The hinge misses the flap',
      text: expect.stringMatching(/lies wholly on one side of the hinge/),
    });
    expect(noFlap('no_corner', { kind: 'past_corner', corner: [0.1, 0.1] })).toMatchObject({
      title: 'The hinge is too near the closed point',
      text: expect.stringMatching(/Move the hinge farther from the flap’s closed point/),
    });
    expect(noFlap('no_ends').title).toBe('The hinge does not cross the flap');
    expect(noFlap('no_corner').title).toBe('No point to lift');
  });

  it('words a swivel by its edge in its own words: its ridge, its pivot, and the plain fold along the bisector', () => {
    const calls = verbs();
    const swivel = vertexContext('swivel', { swivel: 'edge' });
    const short = foldRefusalNotice(
      t,
      refused({ code: 'swivel_edge_short', faces: [0] }, [{ fix: 'use_line', line: { n: [0.38, -0.92], d: 0 }, side: 'negative' }]),
      swivel,
      calls
    );
    expect(short.title).toBe('The edge ends before it would turn');
    expect(short.actions.map((action) => action.label)).toEqual(['Fold the edge onto the line instead']);
    short.actions[0]?.run();
    expect(calls.useLine).toHaveBeenCalledTimes(1);
    const blocked = foldRefusalNotice(
      t,
      refused({ code: 'fan_ray_blocked', faces: [1] }, [{ fix: 'use_emergent', direction: [0.5, -0.5] }]),
      swivel,
      calls
    );
    expect(blocked.text).toMatch(/Pick another pivot, or another line for the edge to land on/);
    expect(blocked.actions.map((action) => action.label)).toEqual(['Use the other ridge']);
    blocked.actions[0]?.run();
    expect(calls.takeEmergent).toHaveBeenCalledWith([0.5, -0.5]);
    expect(foldRefusalNotice(t, refused({ code: 'fan_center', faces: [1] }), swivel, calls).text).toMatch(/pick another pivot/);
    // Read away from its tool, a swivel by its edge's own code is still its own.
    const bare = foldRefusalNotice(t, refused({ code: 'swivel_target_parallel', faces: [0] }), { ...swivel, vertex: undefined }, calls);
    expect(bare.title).toBe('The line runs parallel to the edge');
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
    const crease = foldRefusalNotice(t, refused(line), vertexContext('petal'), calls);
    expect(crease.title).toBe('Precrease the hinge first');
    expect(crease.text).toMatch(/^The hinge crease does not run through every layer/);
    expect(crease.actions.map((action) => action.label)).toEqual(['Precrease the hinge first']);
    const ends = foldRefusalNotice(t, refused(line), vertexContext('petal', { hinge: 'points' }), calls);
    expect(ends.text).toMatch(/^The hinge crosses paper of the second layer/);
    ends.actions[0]?.run();
    expect(calls.precreaseLine).toHaveBeenCalledTimes(1);

    const kiteBody = { code: 'petal_not_precreased' as const, faces: [1], missing: 'kite' as const };
    const kite = foldRefusalNotice(t, refused(kiteBody), vertexContext('petal', { hinge: 'crease' }), calls);
    expect(kite.title).toBe('The kite creases are not there');
    expect(kite.actions.map((action) => action.label)).toEqual(['Crease the kites as it folds', 'Precrease the kite']);
    kite.actions.forEach((action) => action.run());
    expect(calls.petalByEnds).toHaveBeenCalledTimes(1);
    expect(calls.precreaseKite).toHaveBeenCalledTimes(1);
    // By its ends, the fold creases the kite already: only the Precrease tool is left to offer.
    const byEnds = foldRefusalNotice(t, refused(kiteBody), vertexContext('petal', { hinge: 'points' }), calls);
    expect(byEnds.actions.map((action) => action.label)).toEqual(['Precrease the kite']);
    // Read-only: shown, none taken.
    const locked = foldRefusalNotice(t, refused(line), { ...vertexContext('petal'), readOnly: true }, calls);
    expect(locked.actions.every((action) => action.disabled)).toBe(true);
  });
});
