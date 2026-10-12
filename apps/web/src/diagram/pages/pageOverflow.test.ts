import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { LayoutCell, LayoutPage } from './diagramPageLayout';
import { exportOverflowSentence, exportUnfitSentence, pageOverflowSentence, pageUnfitSentence } from './overflowLabels';
import { layoutOverflow, pageOverflow } from './pageOverflow';

/**
 * What a flow page reports of the steps that no longer fit their places, and
 * of a page that cannot hold its steps (`diagram-flow-packing.md`, Decision 3).
 */

/** `t` as the extractor reads it: the English default, its values put in. */
const t = ((_key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ''))) as unknown as TFunction;

const cell = (number: number, overflow?: LayoutCell['overflow']) => ({ number, ...(overflow ? { overflow } : {}) }) as LayoutCell;
const page = (cells: LayoutCell[], fits = true, at: Partial<LayoutPage> = {}) =>
  ({ cells, packing: { k: 1, packed: false, fits }, number: 1, pageNumberAt: { x: 0, y: 0, anchor: 'end' }, ...at }) as LayoutPage;

describe('pageOverflow', () => {
  it('names the steps past their places, in print order, on a page that fits', () => {
    expect(pageOverflow(page([cell(10), cell(11, 'caption'), cell(12), cell(13, 'picture')]))).toEqual({
      steps: [11, 13],
      fits: true,
    });
  });

  it('says a page no plan fits, with or without a step past its place', () => {
    expect(pageOverflow(page([cell(1), cell(2)], false))).toEqual({ steps: [], fits: false });
  });

  it('has nothing to say of a page where every step fits, nor of a grid page', () => {
    expect(pageOverflow(page([cell(1), cell(2)]))).toBeNull();
    expect(pageOverflow({ cells: [cell(1)] })).toBeNull();
  });
});

describe('layoutOverflow', () => {
  it('gathers every page’s, the pages that cannot hold their steps by what they are captioned', () => {
    const layout = {
      pages: [
        page([cell(1), cell(2, 'caption')], true, { number: 5 }),
        page([cell(3)], false, { number: 6 }),
        // A page that prints no number is captioned by its place.
        page([cell(4, 'picture')], false, { number: 7, pageNumberAt: null }),
      ],
    };
    expect(layoutOverflow(layout)).toEqual({ steps: [2, 4], unfitPages: [6, 3] });
  });
});

describe('overflow sentences', () => {
  it('speaks of one step, or of several, by how many', () => {
    expect(pageOverflowSentence([11], 2, t, 'en')).toBe('Step 11 on page 2 no longer fits its place.');
    expect(pageOverflowSentence([11, 13], 2, t, 'en')).toBe('Steps 11 and 13 on page 2 no longer fit their places.');
    expect(pageUnfitSentence(3, t)).toBe('Page 3 can’t hold its steps, even at the smallest size. Give it fewer steps.');
    expect(exportOverflowSentence([4], t, 'en')).toMatch(/^Step 4 no longer fits its place/);
    expect(exportOverflowSentence([4, 9, 12], t, 'en')).toMatch(/^Steps 4, 9, and 12 no longer fit their places/);
    expect(exportUnfitSentence([2], t, 'en')).toMatch(/^Page 2 can’t hold its steps/);
    expect(exportUnfitSentence([2, 5], t, 'en')).toMatch(/^Pages 2 and 5 can’t hold their steps/);
  });
});
