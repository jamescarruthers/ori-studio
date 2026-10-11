import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { FOLD_REFUSAL_CODES, type FoldRefusalBody } from '../engine/foldEngineWire';
import {
  foldRefusalNotice,
  neededFlaps,
  type FoldFixVerbs,
  type FoldRefused,
  type FoldRefusalContext,
  type FoldUseLineFix,
} from './refusalNotice';

const t = i18n.t.bind(i18n);

function verbs() {
  return { includeFlaps: vi.fn(), foldOtherWay: vi.fn(), pickFlap: vi.fn(), useLine: vi.fn() } satisfies FoldFixVerbs;
}

/** On screen, the engine's flap 0 is the second flap from the top, and its flap 1 the first. */
const context = (extra: Partial<FoldRefusalContext> = {}): FoldRefusalContext => ({
  kind: 'valley',
  flapNumber: (flap) => [2, 1, 3][flap] ?? flap + 1,
  readOnly: false,
  ...extra,
});

const line = { n: [0, 1] as const, d: 0.5 };

describe('foldRefusalNotice', () => {
  it('words every refusal the engine and the bridge can give', () => {
    for (const code of FOLD_REFUSAL_CODES) {
      const refusal = {
        code,
        added: [0],
        vertex: 1,
        distance: 1e-4,
        cause: 'band',
        face: 2,
        penetration: 1e-4,
      } as FoldRefusalBody;
      const notice = foldRefusalNotice(t, { refusal, fixes: [] }, context(), verbs());
      expect(notice.code).toBe(code);
      expect(notice.title, code).not.toBe('');
      expect(notice.text, code).not.toBe('');
    }
  });

  it('offers to include the flaps the closure would move, by their numbers on screen', () => {
    const calls = verbs();
    const refused: FoldRefused = {
      refusal: { code: 'closure_adds_flaps', added: [0] },
      fixes: [{ fix: 'include_flaps', flaps: [0] }],
    };
    const notice = foldRefusalNotice(t, refused, context(), calls);
    expect(notice.title).toBe('More flaps would move');
    expect(notice.text).toBe('Folding these layers moves flap 2 too.');
    expect(notice.actions.map((action) => action.label)).toEqual(['Include flap 2']);
    notice.actions[0]?.run();
    expect(calls.includeFlaps).toHaveBeenCalledWith([0]);

    const several = foldRefusalNotice(
      t,
      { refusal: { code: 'closure_adds_flaps', added: [0, 2] }, fixes: [{ fix: 'include_flaps', flaps: [0, 2] }] },
      context(),
      calls
    );
    expect(several.text).toBe('Folding these layers moves 2 more flaps too.');
    expect(several.actions.map((action) => action.label)).toEqual(['Include the 2 flaps']);
  });

  it('names the other way after the fold asked for', () => {
    const calls = verbs();
    const refused: FoldRefused = { refusal: { code: 'layer_order' }, fixes: [{ fix: 'opposite_direction' }] };
    const labels = (['valley', 'mountain', 'precrease'] as const).map(
      (kind) => foldRefusalNotice(t, refused, context({ kind }), calls).actions[0]?.label
    );
    expect(labels).toEqual(['Mountain fold instead', 'Valley fold instead', 'Precrease the other way']);
    const notice = foldRefusalNotice(t, refused, context(), calls);
    expect(notice.title).toBe('Collision');
    notice.actions[0]?.run();
    expect(calls.foldOtherWay).toHaveBeenCalledTimes(1);
  });

  it('offers each flap to fold alone when everything would move', () => {
    const calls = verbs();
    const flaps = [
      { faces: [0], witness: [0.2, 0.2] as const },
      { faces: [1], witness: [0.8, 0.8] as const },
    ];
    const notice = foldRefusalNotice(
      t,
      { refusal: { code: 'nothing_stays' }, fixes: [{ fix: 'pick_flap', flaps }] },
      context(),
      calls
    );
    expect(notice.title).toBe('Everything would move');
    // Not "turn over": the fix for everything moving is a flap (plan D3).
    expect(notice.text).toBe('Every layer is on the moving side, so nothing would stay put. Pick a flap to fold.');
    expect(notice.actions.map((action) => action.label)).toEqual(['Fold flap 2 only', 'Fold flap 1 only']);
    notice.actions[1]?.run();
    expect(calls.pickFlap).toHaveBeenCalledWith(flaps[1]);
  });

  it('points a reverse fold that cannot go one way to the other kind only when the engine says that one lands', () => {
    const refusal = { code: 'reverse_kind_infeasible', kind: 'inside', faces: [1] } as unknown as FoldRefusalBody;
    const other = foldRefusalNotice(t, { refusal, fixes: [{ fix: 'other_kind', kind: 'outside' }] }, context({ kind: 'reverse' }), {
      ...verbs(),
      otherKind: vi.fn(),
    });
    expect(other.text).toContain('The other kind of reverse fold may fit.');
    expect(other.actions.map((action) => action.label)).toEqual(['Outside reverse fold instead']);
    const neither = foldRefusalNotice(t, { refusal, fixes: [] }, context({ kind: 'reverse' }), verbs());
    expect(neither.title).toBe('It cannot go inside');
    expect(neither.text).toContain('Neither kind of reverse fold fits here');
    expect(neither.text).not.toContain('may fit');
    expect(neither.actions).toEqual([]);
  });

  it('offers the landmark line for a near miss', () => {
    const calls = verbs();
    const fix: FoldUseLineFix = { fix: 'use_line', line, side: 'positive' };
    const notice = foldRefusalNotice(
      t,
      { refusal: { code: 'near_miss', vertex: 4, distance: 4e-4, cause: 'band' }, fixes: [fix] },
      context(),
      calls
    );
    expect(notice.title).toBe('Too close to a point');
    expect(notice.actions.map((action) => action.label)).toEqual(['Use the landmark line']);
    notice.actions[0]?.run();
    expect(calls.useLine).toHaveBeenCalledWith(fix);
  });

  it('offers a sliver’s remedies by how they move the line, each with the step it commits', () => {
    const calls = verbs();
    const remedy = (axiom: 5 | 7): FoldUseLineFix => ({
      fix: 'use_line',
      line: { n: [1, 0], d: 0.8 },
      side: 'positive',
      step: {
        op: {
          kind: 'valley',
          line: {
            via: 'axiom',
            axiom,
            inputs:
              axiom === 5
                ? [
                    { kind: 'point', at: [0.8, 0] },
                    { kind: 'point', at: [1, 0] },
                    { kind: 'edge', a: [0.6, 0], b: [0.6, 0.5] },
                  ]
                : [
                    { kind: 'point', at: [1, 0] },
                    { kind: 'edge', a: [0.6, 0], b: [0.6, 0.5] },
                    { kind: 'edge', a: [0.3, 0], b: [1, 0] },
                  ],
          },
          seed: { scope: 'all' },
        },
        choices: { root: { n: [1, 0], d: 0.8 } },
      },
    });
    const notice = foldRefusalNotice(
      t,
      { refusal: { code: 'sliver', vertex: 3, face: 1, penetration: 1e-4 }, fixes: [remedy(5), remedy(7)] },
      context(),
      calls
    );
    expect(notice.title).toBe('A point lands just inside an edge');
    expect(notice.actions.map((action) => action.label)).toEqual([
      'Turn the line to land the point on the edge',
      'Slide the line to land the point on the edge',
    ]);
    notice.actions[1]?.run();
    expect(calls.useLine).toHaveBeenCalledWith(remedy(7));
  });

  it('says every crimp and tuck refusal in its own words, none as a fold that cannot be made', () => {
    const generic = foldRefusalNotice(t, { refusal: { code: 'internal' }, fixes: [] }, context(), verbs()).title;
    const titles: Record<string, string> = {
      crimp_lines_meet: 'The lines meet',
      crimp_misses_tip: 'The second line misses the flap',
      crimp_no_opening: 'This flap cannot open at the second line',
      crimp_kind_infeasible: 'It cannot crimp round the outside',
      crimp_tip_not_free: 'Layers are in the way',
      tuck_infeasible: 'It cannot be tucked over that layer',
      tuck_target_moves: 'The layer to tuck under would move',
    };
    for (const [code, title] of Object.entries(titles)) {
      const refusal = { code, faces: [1], kind: 'outside', target: 3, placement: 'over', blocking: [2] } as unknown as FoldRefusalBody;
      const notice = foldRefusalNotice(t, { refusal, fixes: [] }, context({ kind: code.startsWith('crimp') ? 'crimp' : 'tuck' }), verbs());
      expect(notice.title, code).toBe(title);
      expect(notice.title, code).not.toBe(generic);
    }
    const tipNotFree = foldRefusalNotice(
      t,
      { refusal: { code: 'crimp_tip_not_free', blocking: [2], faces: [2] } as unknown as FoldRefusalBody, fixes: [] },
      context({ kind: 'crimp' }),
      verbs()
    );
    expect(tipNotFree.text).toBe(
      'Other layers lie where the crimped paper would turn. Include their flaps in the crimp, or crimp it somewhere else.'
    );
    // A single-layer tip, refused as a reverse fold's is, named as a crimp.
    const singleLayer = { refusal: { code: 'reverse_no_opening', cause: 'no_spine' } as FoldRefusalBody, fixes: [] };
    expect(foldRefusalNotice(t, singleLayer, context({ kind: 'crimp' }), verbs()).text).toBe(
      'A single layer has no folded edge to crimp along. Crimp a flap of layers joined by a fold.'
    );
    expect(foldRefusalNotice(t, singleLayer, context({ kind: 'reverse' }), verbs()).text).toBe(
      'A single layer has no folded edge to reverse along. Reverse a flap of layers joined by a fold.'
    );
  });

  it('binds a tuck’s other layer, and its narrowed flaps, in a tuck’s words', () => {
    const calls = { ...verbs(), tuckTarget: vi.fn() };
    const flap = { faces: [1], witness: [0.2, 0.2] as [number, number] };
    const notice = foldRefusalNotice(
      t,
      {
        refusal: { code: 'tuck_infeasible', target: 3, placement: 'under', faces: [3] },
        fixes: [
          { fix: 'tuck_target', face: 5, at: [0.5, 0.5] },
          { fix: 'pick_flap', flaps: [flap] },
        ],
      },
      context({ kind: 'tuck', tuck: { under: true, targetNumber: (face) => (face === 5 ? 3 : null) } }),
      calls
    );
    expect(notice.actions.map((action) => action.label)).toEqual(['Tuck under listed layer 3 instead', 'Tuck flap 2 only']);
    notice.actions[0]?.run();
    expect(calls.tuckTarget).toHaveBeenCalledWith(5);
    notice.actions[1]?.run();
    expect(calls.pickFlap).toHaveBeenCalledWith(flap);
    // Without a verb to bind, a surface offers no other layer.
    const unbound = foldRefusalNotice(
      t,
      { refusal: { code: 'tuck_infeasible', target: 3, placement: 'under', faces: [3] }, fixes: [{ fix: 'tuck_target', face: 5, at: [0.5, 0.5] }] },
      context({ kind: 'tuck' }),
      verbs()
    );
    expect(unbound.actions).toEqual([]);
    expect(unbound.text).toBe('No way of stacking the layers puts the flap right against that layer. Another layer here takes it.');
  });

  it('keeps every fix in the engine’s order, and holds them on a read-only sequence', () => {
    const notice = foldRefusalNotice(
      t,
      {
        refusal: { code: 'layer_order' },
        fixes: [
          { fix: 'include_flaps', flaps: [1] },
          { fix: 'opposite_direction' },
        ],
      },
      context({ readOnly: true }),
      verbs()
    );
    expect(notice.actions.map((action) => [action.label, action.disabled])).toEqual([
      ['Include flap 1', true],
      ['Mountain fold instead', true],
    ]);
    expect(new Set(notice.actions.map((action) => action.id)).size).toBe(2);
  });
});

describe('neededFlaps', () => {
  it('is the flaps an include fix names, and none without a refusal', () => {
    expect(
      [...neededFlaps({ refusal: { code: 'layer_order' }, fixes: [{ fix: 'include_flaps', flaps: [2, 0] }, { fix: 'opposite_direction' }] })].sort()
    ).toEqual([0, 2]);
    expect(neededFlaps(null).size).toBe(0);
  });
});
