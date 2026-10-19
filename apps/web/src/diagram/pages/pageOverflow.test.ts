import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { LayoutCell, LayoutPage } from './diagramPageLayout';
import { exportUnfitSentence, pageUnfitSentence } from './overflowLabels';
import { pageHoldsItsSteps, stepPageFits, unfitPages } from './pageOverflow';

/**
 * What a flow page reports of itself: only that it cannot hold its steps
 * (`diagram-flow-packing.md`, Decision 3) — the automatic layout failing. A
 * step past the place its page keeps for it is not said (Zach, 2026-10-12).
 */

/** `t` as the extractor reads it: the English default, its values put in. */
const t = ((_key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ''))) as unknown as TFunction;

const cell = (number: number) => ({ number }) as LayoutCell;
const page = (cells: LayoutCell[], fits = true, at: Partial<LayoutPage> = {}) =>
  ({ cells, packing: { k: 1, packed: false, fits }, number: 1, pageNumberAt: { x: 0, y: 0, anchor: 'end' }, ...at }) as LayoutPage;

describe('pageHoldsItsSteps', () => {
  it('is false only for a flow page no plan fits, and true on a grid page', () => {
    expect(pageHoldsItsSteps(page([cell(1), cell(2)]))).toBe(true);
    expect(pageHoldsItsSteps(page([cell(1), cell(2)], false))).toBe(false);
    expect(pageHoldsItsSteps({})).toBe(true);
  });
});

describe('stepPageFits', () => {
  it('says which steps the cards should warn of: a grid cell’s cut instruction, and nothing else', () => {
    const at = (stepId: string, patch: Partial<LayoutCell>) => ({ stepId, number: 1, textOverflow: false, ...patch }) as LayoutCell;
    const fits = stepPageFits({ pages: [page([at('cut', { textOverflow: true }), at('fine', {})]), page([at('flow', {})])] });
    expect([...fits]).toEqual([['cut', 'text-cut']]);
    expect(stepPageFits(null).size).toBe(0);
  });
});

describe('unfitPages', () => {
  it('lists the pages that cannot hold their steps by what they are captioned', () => {
    const layout = {
      pages: [
        page([cell(1), cell(2)], true, { number: 5 }),
        page([cell(3)], false, { number: 6 }),
        // A page that prints no number is captioned by its place.
        page([cell(4)], false, { number: 7, pageNumberAt: null }),
      ],
    };
    expect(unfitPages(layout)).toEqual([6, 3]);
  });
});

describe('unfit sentences', () => {
  it('speaks of one page, or of several, by how many', () => {
    expect(pageUnfitSentence(3, t)).toBe('Page 3 can’t hold its steps, even at the smallest size. Give it fewer steps.');
    expect(exportUnfitSentence([2], t, 'en')).toMatch(/^Page 2 can’t hold its steps/);
    expect(exportUnfitSentence([2, 5], t, 'en')).toMatch(/^Pages 2 and 5 can’t hold their steps/);
  });
});
