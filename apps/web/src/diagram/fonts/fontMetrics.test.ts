import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FontReadError, readFontMetrics } from './fontMetrics';

const font = (name: string) => readFileSync(resolve(process.cwd(), 'src/diagram/fonts', name));

describe('readFontMetrics', () => {
  // The advances fontTools reads from the same files' hmtx.
  it.each([
    ['NotoSans-Regular.ttf', { A: 639, W: 930, ' ': 260, é: 564, Ж: 905, α: 623, f: 344, i: 258, '…': 791 }],
    ['NotoSans-Bold.ttf', { A: 692, W: 967, ' ': 260, é: 597, Ж: 997, α: 656, f: 387, i: 299, '…': 855 }],
  ])('reads %s’s advances as fontTools does', (name, advances) => {
    const metrics = readFontMetrics(font(name));
    expect(metrics.unitsPerEm).toBe(1000);
    for (const [character, advance] of Object.entries(advances)) {
      expect(metrics.has(character.codePointAt(0)!)).toBe(true);
      expect(metrics.advance(character.codePointAt(0)!)).toBe(advance);
    }
    expect([...metrics.codePoints()]).toHaveLength(1465);
    // Romanian, Vietnamese and a combining accent are in the bundle.
    for (const character of 'șțơưệ\u0301') expect(metrics.has(character.codePointAt(0)!)).toBe(true);
  });

  it('reads how far each glyph’s ink reaches above and below the baseline, from its outline', () => {
    // The glyf headers' yMax and yMin, as the bundled faces and the Chinese fixture have them.
    const inks = (name: string, characters: string) => {
      const metrics = readFontMetrics(font(name));
      return [...characters].map((character) => metrics.ink(character.codePointAt(0)!));
    };
    const [C, É, Å, l, g] = inks('NotoSans-Bold.ttf', 'CÉÅlg');
    expect(C!.top).toBe(724);
    expect(É!.top).toBe(934);
    expect(Å!.top).toBeGreaterThan(C!.top);
    expect(l!.top).toBeGreaterThan(C!.top);
    // Round letters overshoot the baseline a little; a descender reaches well under it.
    expect(C!.bottom).toBeLessThan(0);
    expect(C!.bottom).toBeGreaterThan(-20);
    expect(g!.bottom).toBeLessThan(-200);
    for (const ink of inks('fixtures/NotoSansSC-Bold.fixture.ttf', '将底角')) {
      expect(ink!.top).toBeGreaterThan(820);
      expect(ink!.top).toBeLessThan(900);
      expect(ink!.bottom).toBeLessThan(0);
      expect(ink!.bottom).toBeGreaterThan(-150);
    }
    // No ink for a space, nor for a glyph the font lacks.
    expect(inks('NotoSans-Bold.ttf', ' 鶴')).toEqual([null, null]);
  });

  it('knows what the bundled Latin font lacks', () => {
    const metrics = readFontMetrics(font('NotoSans-Regular.ttf'));
    expect(metrics.has('鶴'.codePointAt(0)!)).toBe(false);
    expect(metrics.has(0x1f600)).toBe(false);
  });

  it('refuses a file that is not a TrueType font', () => {
    expect(() => readFontMetrics(new Uint8Array([0, 1, 2, 3]))).toThrow(FontReadError);
    expect(() => readFontMetrics(new TextEncoder().encode('wOF2xxxxxxxxxxxxxxxx'))).toThrow(FontReadError);
  });
});
