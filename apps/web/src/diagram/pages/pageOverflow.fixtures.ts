/**
 * A flow diagram whose one page is packed and held, then one of its steps
 * given a caption far longer than the box the page keeps for it: the step
 * that "no longer fits its place" (`diagram-flow-packing.md`, Decision 3),
 * laid out with the real fonts. Node only, for tests.
 */
import { createDiagram, insertSteps, setPageSetup, type DiagramDocument } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import { preparedPages, type PreparedDiagramPages } from './diagramPages';
import { adoptPageArrangements } from './pageArrangements';

/** Step 3's caption, past the box packed for "Fold." */
export const LONG_CAPTION = 'Fold the corner up to the centre, crease it firmly, and unfold it again. '.repeat(4);

export function overflowingDiagram(subsetter: FontSubsetter): {
  /** Six steps on one flow page, its packing taken in as the Pages view takes it. */
  held: DiagramDocument;
  /** The same, step 3 (`s2`) given {@link LONG_CAPTION}: a caption edit, which never repacks the page. */
  overflowing: DiagramDocument;
  /** The pages of `overflowing`, step 3 reported past its place. */
  pages: PreparedDiagramPages;
} {
  const steps = Array.from({ length: 6 }, (_, index) => ({ ...cpStep(`s${index}`), text: 'Fold.' }));
  const base = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 6,
  });
  const held = adoptPageArrangements(base, preparedPages(base, FIXTURE_FONTS, subsetter).layout.packed ?? {});
  const overflowing = {
    ...held,
    steps: held.steps.map((entry) => (entry.id === 's2' ? { ...entry, text: LONG_CAPTION } : entry)),
  };
  return { held, overflowing, pages: preparedPages(overflowing, FIXTURE_FONTS, subsetter) };
}
