import { describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { FOLD_REFUSAL_CODES, type FoldRefusal, type FoldRefused } from './engineContracts';
import { foldRefusalNotice, neededFlaps, type FoldFixVerbs, type FoldRefusalContext } from './refusalNotice';

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
  it('words every refusal the engine can give', () => {
    for (const code of FOLD_REFUSAL_CODES) {
      const refusal = { code, added: [0], vertex: 1, distance: 1e-4, cause: 'band', face: 2, penetration: 1e-4 } as FoldRefusal;
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

  it('offers the landmark line for a near miss', () => {
    const calls = verbs();
    const notice = foldRefusalNotice(
      t,
      {
        refusal: { code: 'near_miss', vertex: 4, distance: 4e-4, cause: 'band' },
        fixes: [{ fix: 'use_line', line, side: 'positive' }],
      },
      context(),
      calls
    );
    expect(notice.title).toBe('Too close to a point');
    expect(notice.actions.map((action) => action.label)).toEqual(['Use the landmark line']);
    notice.actions[0]?.run();
    expect(calls.useLine).toHaveBeenCalledWith(line, 'positive');
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
