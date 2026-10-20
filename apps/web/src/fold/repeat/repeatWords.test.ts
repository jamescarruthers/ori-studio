import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import type { FoldRefusalBody } from '../engine/foldEngineWire';
import { foldRefusalNotice } from '../tools/refusalNotice';
import { repeatAxisName, repeatFailure } from './repeatWords';

const t = i18n.t.bind(i18n);

/** The tool window's words for a refusal, as a valley fold's window shows them. */
function toolWindowText(refusal: FoldRefusalBody): string {
  return foldRefusalNotice(
    t,
    { refusal, fixes: [] },
    { kind: 'valley', flapNumber: (flap) => flap + 1, flapOf: null, readOnly: false },
    { includeFlaps: () => {}, foldOtherWay: () => {}, pickFlap: () => {}, useLine: () => {} }
  ).text;
}

describe("Repeat's refusal words", () => {
  it('words a mirrored step the engine refused as the tool window does, never by its code', () => {
    for (const code of ['nothing_stays', 'no_root', 'witness_not_in_face'] as const) {
      const refusal = { code } as FoldRefusalBody;
      const words = repeatFailure(t, { code, refusal, op: 'valley' });
      expect(words).toBe(toolWindowText(refusal));
      expect(words).not.toContain(code);
    }
  });

  it('words a closure that takes more flaps, which reads the refusal itself', () => {
    const refusal = { code: 'closure_adds_flaps', added: [2] } as FoldRefusalBody;
    expect(repeatFailure(t, { code: refusal.code, refusal })).toBe('Folding these layers moves flap 3 too.');
  });

  it('says a refusal it was not handed no code at all', () => {
    const words = repeatFailure(t, { code: 'layer_order' });
    expect(words).not.toContain('layer_order');
    expect(words).toBe('The mirrored operation cannot be folded. No steps were added.');
  });

  it("keeps Repeat's own reasons in its own words", () => {
    expect(repeatFailure(t, { code: 'repeat_limit' })).toBe('This repeat exceeds the search limit. Try a shorter range.');
  });

  it('names a symmetry axis by the way it runs on screen, whichever way its normal points', () => {
    const s = Math.SQRT1_2;
    const name = (n: [number, number]) => repeatAxisName(t, { n, d: 0.5 });
    expect(name([1, 0])).toBe('Vertical axis');
    expect(name([-1, 0])).toBe('Vertical axis');
    expect(name([0, 1])).toBe('Horizontal axis');
    expect(name([0, -1])).toBe('Horizontal axis');
    // y up: the line y = x rises to the right.
    expect(name([s, -s])).toBe('Rising diagonal');
    expect(name([-s, s])).toBe('Rising diagonal');
    expect(name([s, s])).toBe('Falling diagonal');
    // Any other, by its angle from the horizontal.
    expect(name([-Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)])).toBe('Axis at 30°');
  });

  it("words a sink's refusal as the sink tool does", () => {
    const refusal = { code: 'no_order' } as FoldRefusalBody;
    expect(repeatFailure(t, { code: 'no_order', refusal, op: 'unsink' })).toBe(
      'No way of stacking the layers lets the sunk point come back out here.'
    );
  });
});
