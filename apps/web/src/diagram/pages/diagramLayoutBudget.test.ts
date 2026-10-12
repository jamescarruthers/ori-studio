import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  createTurn,
  insertSteps,
  setPageSetup,
  type DiagramDocument,
  type DiagramEntry,
  type DiagramPageSetup,
  type DiagramStep,
  type KnownDiagramAnnotation,
} from '../document/diagramDocument';
import { cpStep, referencesStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import { layoutDiagram } from './diagramPages';
import { fontTextSetter } from './fontTextSetter';
import { adoptPageArrangements } from './pageArrangements';

/**
 * The layout's time budget (`implementation-plans/diagram-flow-pages.md`,
 * Goal): a diagram's pages lay out in milliseconds, so every edit can lay them
 * out again on the main thread — a 50-step diagram in at most 50 ms on an
 * M1-class desktop. #443's packing search took 4.6 s for the 28-step crane,
 * and 1.3 s for every character typed into a caption.
 */

const WORDS = [
  'Fold in half.',
  'Fold the bottom edge up to the top edge, crease firmly, then unfold.',
  'Squash-fold the flap so the crease lines up with the centre, then turn the model over and repeat behind.',
  '',
  'Turn over.',
];

const ARROW: KnownDiagramAnnotation = { id: 'arrow', kind: 'valley-arrow', from: [0.2, 0.3], to: [0.8, 0.3], bend: 0.1 };
const PUSH: KnownDiagramAnnotation = { id: 'push', kind: 'push-arrow', from: [-0.2, 0.6], to: [0.3, 0.6] };

/** Fifty steps — crease patterns with arrows, References cards — with their words and a turn every seventh. */
function fiftySteps(page: Partial<DiagramPageSetup> = {}): DiagramDocument {
  const entries: DiagramEntry[] = [];
  for (let index = 0; index < 50; index += 1) {
    const id = `step-${index}`;
    const base = index % 5 === 2 ? referencesStep(id) : cpStep(id);
    const annotations = index % 5 === 2 ? base.annotations : index % 3 === 0 ? [ARROW, PUSH] : [ARROW];
    const step: DiagramStep = { ...base, text: WORDS[index % WORDS.length]!, annotations };
    if (index % 7 === 6) entries.push(createTurn({ kind: 'turn-over', axis: 'vertical' }, () => `turn-${index}`));
    entries.push(step);
  }
  const document = insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-budget' }), entries, 0);
  return setPageSetup(document, page);
}

/**
 * The slowest a layout may take here: about 3× the median measured locally
 * as the whole web suite runs around it (29–37 ms on an M-series Mac, Node
 * 22, 11 October 2026; 18–24 ms alone), for a CI runner as loaded and slower.
 * A search like #443's fails it by forty times. What every edit of a caption
 * or a picture costs: a flow diagram's pages held as they were packed
 * (`diagram-flow-packing.md`; 10–11 ms alone, 12 October 2026).
 */
const BUDGET_MS = 100;

/**
 * The slowest a layout that packs every flow page afresh may take: an edit
 * that re-cuts the pages, or a file saved before packing, opened. Its six
 * pages packed, each picture measured at its reference scale too: 41–49 ms
 * alone, about 130 ms as the whole suite runs (12 October 2026).
 */
const PACKING_BUDGET_MS = 300;

const setterFor = (document: DiagramDocument) =>
  fontTextSetter((key, weight) => FIXTURE_FONTS.font(key, weight)?.metrics ?? null, document.hanStyle);

/** The median time, in ms, of laying out a fresh copy of the diagram, after two layouts to warm the code. */
function medianLayoutMs(make: () => DiagramDocument): number {
  const layOut = (document: DiagramDocument) => layoutDiagram(document, setterFor(document));
  layOut(make());
  layOut(make());
  const times = Array.from({ length: 7 }, () => {
    // A fresh copy each time: nothing kept on the steps themselves is warm.
    const document = make();
    const start = performance.now();
    layOut(document);
    return performance.now() - start;
  });
  return times.sort((a, b) => a - b)[3]!;
}

describe('the layout’s time budget', () => {
  it('lays out a 50-step diagram with annotations and turns in milliseconds, in the flow and on a grid', () => {
    for (const page of [{ layout: 'flow' }, { layout: 'flow', stepsPerPage: 7 }, { layout: 'grid', columns: 3, rows: 4 }] as const) {
      // A flow diagram's pages as they are held once packed and adopted, as the store does.
      const fresh = fiftySteps(page);
      const held = adoptPageArrangements(fresh, layoutDiagram(fresh, setterFor(fresh)).packed ?? {});
      expect(medianLayoutMs(() => ({ ...held, steps: held.steps.map((entry) => ({ ...entry })) })), JSON.stringify(page)).toBeLessThan(BUDGET_MS);
      // And packed afresh.
      expect(medianLayoutMs(() => fiftySteps(page)), `${JSON.stringify(page)} packed`).toBeLessThan(PACKING_BUDGET_MS);
    }
  });
});
