import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { DiagramPagesLayout, LayoutCell } from './diagramPageLayout';
import { outsideMarginNote, outsideMarginSentence, outsideMarginTag } from './marginLabels';
import { outsideMarginSteps } from './pagePlacement';

/** The English defaults, interpolated: what an untranslated build shows. */
const t = ((_key: string, fallback: string, values: Record<string, unknown> = {}) =>
  fallback.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name]))) as unknown as TFunction;

const cell = (number: number, outsideMargin = false) => ({ number, ...(outsideMargin ? { outsideMargin: true } : {}) }) as LayoutCell;

describe('a placement past the margin, as it is said', () => {
  it('lists the steps placed past the margin once each, in print order', () => {
    const layout = {
      pages: [{ cells: [cell(1), cell(2, true)] }, { cells: [cell(3), cell(4, true)] }],
    } as unknown as DiagramPagesLayout;
    expect(outsideMarginSteps(layout)).toEqual([2, 4]);
    expect(outsideMarginSteps({ pages: [{ cells: [cell(1)] }] } as unknown as DiagramPagesLayout)).toEqual([]);
  });

  it('tags the step, notes it in the Step pane and says it in a sentence about one step or several', () => {
    expect(outsideMarginTag(t)).toBe('Outside margin');
    expect(outsideMarginNote(t)).toBe('Part of this step crosses the margin.');
    expect(outsideMarginSentence([2], t, 'en')).toBe('Part of step 2 crosses the margin.');
    expect(outsideMarginSentence([2, 3, 9], t, 'en')).toBe('Parts of steps 2, 3, and 9 cross the margin.');
  });
});
