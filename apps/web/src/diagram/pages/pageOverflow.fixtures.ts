/**
 * A flow diagram whose one page is packed and held, then one of its steps
 * given a caption far longer than the box the page keeps for it: a step past
 * its place (`diagram-flow-packing.md`, Decision 3), drawn whole and said
 * nowhere (Zach, 2026-10-12), laid out with the real fonts. Node only, for
 * tests.
 */
import { createDiagram, insertSteps, PAGE_SETTINGS, setPageSetup, type DiagramDocument } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import type { LayoutCell } from './diagramPageLayout';
import { preparedPages, type PreparedDiagramPages } from './diagramPages';
import { ARRANGED_SLACK_MM } from './flowArrangement';
import { CAPTION_TOP_MM, NUMBER_ROOM_MM, PICTURE_SIDE_MM } from './flowPacking';
import { adoptPageArrangements } from './pageArrangements';
import { STEP_TEXT_LEADING_MM } from './stepType';

/**
 * What of a flow step prints past the box its page keeps for it
 * (`ARRANGED_SLACK_MM` allowed): its picture, where with its side room and its
 * number it needs more of the box than it has; else its caption, where under
 * the picture it runs out of the box's foot; null where both fit. Nothing on
 * the pages says this (Zach, 2026-10-12): the tests measure it to show what a
 * held page does with a step its own edit outgrew.
 */
export function pastItsBox(cell: LayoutCell): 'picture' | 'caption' | null {
  const box = cell.cellMm;
  const lines = cell.text.lines.length;
  const caption = lines > 0 ? CAPTION_TOP_MM + lines * STEP_TEXT_LEADING_MM : 0;
  if (cell.drawMm.w + PICTURE_SIDE_MM > box.w + ARRANGED_SLACK_MM || NUMBER_ROOM_MM + cell.drawMm.h > box.h + ARRANGED_SLACK_MM)
    return 'picture';
  return NUMBER_ROOM_MM + cell.drawMm.h + caption > box.h + ARRANGED_SLACK_MM ? 'caption' : null;
}

/** Step 3's caption, past the box packed for "Fold." */
export const LONG_CAPTION = 'Fold the corner up to the centre, crease it firmly, and unfold it again. '.repeat(4);

export function overflowingDiagram(subsetter: FontSubsetter): {
  /** Six steps on one flow page, its packing taken in as the Pages view takes it. */
  held: DiagramDocument;
  /** The same, step 3 (`s2`) given {@link LONG_CAPTION}: a caption edit, which never repacks the page. */
  overflowing: DiagramDocument;
  /** The pages of `overflowing`, step 3's caption printing past its box. */
  pages: PreparedDiagramPages;
} {
  const steps = Array.from({ length: 6 }, (_, index) => ({ ...cpStep(`s${index}`), text: 'Fold.' }));
  const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 6,
    // No title block, so the six share one page.
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
  });
  const held = adoptPageArrangements(base, preparedPages(base, FIXTURE_FONTS, subsetter).layout.packed ?? {});
  const overflowing = {
    ...held,
    steps: held.steps.map((entry) => (entry.id === 's2' ? { ...entry, text: LONG_CAPTION } : entry)),
  };
  return { held, overflowing, pages: preparedPages(overflowing, FIXTURE_FONTS, subsetter) };
}
