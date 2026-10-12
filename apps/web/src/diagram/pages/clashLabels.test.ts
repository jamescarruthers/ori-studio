import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { DiagramPagesLayout, LayoutCell } from './diagramPageLayout';
import { clashSentence, clashTag } from './clashLabels';
import { cellClashGroup, clashGroup, clashingStepsByGroup, type PlacementClash } from './pagePlacement';

/** The English defaults, interpolated: what an untranslated build shows. */
const t = ((_key: string, fallback: string, values: Record<string, unknown> = {}) =>
  fallback.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name]))) as unknown as TFunction;

const cell = (number: number, clashes?: PlacementClash[]) => ({ number, ...(clashes ? { clashes } : {}) }) as LayoutCell;

describe('placement clashes, as they are said', () => {
  it('groups the kinds: overlaps of every sort, the paper, the margin, the path', () => {
    expect((['step', 'glyph', 'parts', 'paper', 'margin', 'path'] as const).map(clashGroup)).toEqual([
      'overlap',
      'overlap',
      'overlap',
      'paper',
      'margin',
      'path',
    ]);
    // A step's one tag on the page is its most pressing clash.
    expect(cellClashGroup(cell(1, [{ kind: 'path' }, { kind: 'margin' }]))).toBe('margin');
    expect(cellClashGroup(cell(1, [{ kind: 'path' }, { kind: 'glyph' }]))).toBe('overlap');
    expect(cellClashGroup(cell(1, [{ kind: 'path' }]))).toBe('path');
    expect(cellClashGroup(cell(1))).toBeNull();
  });

  it('lists the steps of each group once, in print order', () => {
    const layout = {
      pages: [
        { cells: [cell(1), cell(2, [{ kind: 'step', steps: [3] }, { kind: 'parts' }, { kind: 'paper' }])] },
        { cells: [cell(3, [{ kind: 'path' }]), cell(4, [{ kind: 'margin' }, { kind: 'path' }])] },
      ],
    } as unknown as DiagramPagesLayout;
    expect(clashingStepsByGroup(layout)).toEqual({ overlap: [2], paper: [2], margin: [4], path: [3, 4] });
  });

  it('tags a step past the paper as off the paper, never as past the margin, and a path warning as the path', () => {
    expect(clashTag('overlap', t)).toBe('Overlaps');
    expect(clashTag('paper', t)).toBe('Off the paper');
    expect(clashTag('margin', t)).toBe('Outside margin');
    expect(clashTag('path', t)).toBe('Path doubles back');
  });

  it('says each group in a sentence of its own, about one step or several', () => {
    expect(clashSentence('overlap', [4], t, 'en')).toBe('Step 4 is placed over another step, a symbol, or its own parts.');
    expect(clashSentence('overlap', [4, 7], t, 'en')).toBe(
      'Steps 4 and 7 are placed over other steps, symbols, or their own parts.'
    );
    expect(clashSentence('paper', [2], t, 'en')).toBe('Part of step 2 is off the paper.');
    expect(clashSentence('margin', [2, 3, 9], t, 'en')).toBe('Parts of steps 2, 3, and 9 cross the margin.');
    expect(clashSentence('path', [5], t, 'en')).toBe('Where step 5 is placed, the path doubles back or crosses itself.');
    // Nothing about overlapping in a path warning, nor about the paper at the margin.
    expect(clashSentence('path', [5, 6], t, 'en')).not.toMatch(/overlap|placed over/);
    expect(clashSentence('margin', [2], t, 'en')).not.toContain('paper');
  });
});
