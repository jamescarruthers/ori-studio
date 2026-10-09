import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TurnKind } from '../../../lib/steps/turn';
import { TurnGlyph } from './TurnGlyph';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

function draw(turn: TurnKind) {
  act(() => root.render(<TurnGlyph turn={turn} />));
  const svg = host.querySelector('svg')!;
  const [, , width, height] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
  const inks = [...svg.querySelectorAll('path, text')].flatMap((shape) =>
    ['stroke', 'fill'].map((name) => shape.getAttribute(name)).filter((ink) => ink !== null && ink !== 'none')
  );
  return { svg, width, height, inks };
}

describe('TurnGlyph', () => {
  it.each<[string, TurnKind]>([
    ['a turn over', { kind: 'turn-over', axis: 'vertical' }],
    ['a turn over top to bottom', { kind: 'turn-over', axis: 'horizontal' }],
    ['a rotation', { kind: 'rotate', rotate: { amount: 'quarter', direction: 'ccw' } }],
  ])('draws %s in one ink, the glyph’s own colour, framed square round it', (_, turn) => {
    const { svg, width, height, inks } = draw(turn);
    expect(width).toBeGreaterThan(0);
    expect(width).toBe(height);
    expect(inks.length).toBeGreaterThan(0);
    expect(new Set(inks)).toEqual(new Set(['currentColor']));
    // One copy: no paper to clip a second copy to.
    expect(svg.querySelector('clipPath')).toBeNull();
  });

  it('writes how far a rotation turns in its middle', () => {
    expect(draw({ kind: 'rotate', rotate: { amount: 'half', direction: 'cw' } }).svg.querySelector('text')?.textContent).toBe('1/2');
  });
});
