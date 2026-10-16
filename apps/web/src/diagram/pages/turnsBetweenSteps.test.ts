import { describe, expect, it } from 'vitest';
import { createDiagram, createTurn, PAGE_SETTINGS, type DiagramDocument } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { diagramLayoutSteps, layoutDiagram } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { adoptPageArrangements } from './pageArrangements';
import { cellSlots } from './stepPlaces';

/**
 * A turn prints only between two steps (Zach, 12 Oct): one before the first
 * step or after the last has no step on that side, so the pages leave it out,
 * though the document keeps it for the Steps view.
 */
const over = (id: string) => createTurn({ kind: 'turn-over', axis: 'vertical' }, () => id);

function diagramOf(entries: DiagramDocument['steps']): DiagramDocument {
  return { ...createDiagram(), steps: entries };
}

describe('turns on the pages', () => {
  it('keeps a turn between two steps, and leaves out one before the first and one after the last', () => {
    const document = diagramOf([over('turn-lead'), cpStep('s1'), over('turn-mid'), cpStep('s2'), over('turn-tail')]);
    const steps = diagramLayoutSteps(document);
    expect(steps.map((step) => step.id)).toEqual(['s1', 's2']);
    expect(steps[0]!.turnsBefore).toEqual([]);
    expect(steps[1]!.turnsBefore.map((turn) => turn.id)).toEqual(['turn-mid']);
    expect(steps.every((step) => step.turnsAfter.length === 0)).toBe(true);
    // The document keeps all three.
    expect(document.steps).toHaveLength(5);
  });

  it('signs a flow page as it draws it: the store holds what the layout packed for a diagram with turns at its ends', () => {
    const steps = Array.from({ length: 7 }, (_, index) => cpStep(`s${index}`));
    const document: DiagramDocument = {
      ...diagramOf([over('turn-lead'), ...steps, over('turn-tail')]),
      // No title block, so the seven take pages of four and three.
      page: { ...createDiagram().page, layout: 'flow', stepsPerPage: 4, titleBlock: PAGE_SETTINGS.titleBlock.legacy },
    };
    const packed = layoutDiagram(document, estimateTextSetter).packed ?? {};
    expect(Object.keys(packed)).toEqual(['s0', 's4']);
    // The store signs each page as the layout does, so it takes in both pages and holds them.
    expect(cellSlots(document).signatures).toEqual(Object.values(packed).map((arrangement) => arrangement.signature));
    const adopted = adoptPageArrangements(document, packed);
    expect(Object.keys(adopted.pageArrangements ?? {})).toEqual(['s0', 's4']);
    expect(layoutDiagram(adopted, estimateTextSetter).packed).toBeUndefined();
  });

  it('lays a diagram of turns alone out as one empty page, none of them drawn', () => {
    const layout = layoutDiagram(diagramOf([over('turn-a'), over('turn-b')]), estimateTextSetter);
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0]!.cells).toHaveLength(0);
    expect(layout.pages[0]!.turns).toHaveLength(0);
  });
});
