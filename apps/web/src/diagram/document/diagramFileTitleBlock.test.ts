import { describe, expect, it } from 'vitest';

import saved from './__fixtures__/diagram-title-block.json';
import { setStepText, setTitleBlockContent, type DiagramDocument } from './diagramDocument';
import { readDiagram, writeDiagram } from './diagramFile';
import { layoutDiagram } from '../pages/diagramPages';
import { estimateTextSetter } from '../pages/estimateTextSetter';
import { heldPageArrangements } from '../pages/pageArrangements';
import { cellSlots } from '../pages/stepPlaces';
import { resolveTitleBlock } from '../pages/titleBlockContent';

/**
 * Three diagrams saved with the first page's title block on
 * (`implementation-plans/diagram-title-block.md`, The file; 2026-10-14), as
 * this build writes them: a flow whose model is a chosen step, with no
 * pattern and a byline in Korean; a grid at a share of its own, whose
 * pattern is a chosen step and whose model is of a kind only a newer build
 * reads — its own picture, naming an asset nothing else names; and a flow of
 * eight steps with no model and the pattern unsaid, Auto, its two pages
 * saved as this build packed them, the first under the block.
 *
 * A change that reads them otherwise, or writes them back otherwise, changes
 * what saved title blocks mean, and fails here first.
 */
type SavedDiagram = Record<string, unknown> & { titleBlockContent?: Record<string, unknown> };
const fixture = () => JSON.parse(JSON.stringify(saved)) as SavedDiagram[];
const read = (index: number) => readDiagram(fixture()[index])!;
const written = (document: DiagramDocument) => JSON.parse(JSON.stringify(writeDiagram(document))) as Record<string, unknown>;

describe('a diagram saved with a title block', () => {
  it('opens editable, its block on as saved, each part it reads as set', () => {
    const flow = read(0);
    expect(flow.readOnly).toBe(false);
    expect(flow.document.newer).toBeUndefined();
    expect(flow.document.page.titleBlock).toEqual({ enabled: true, heightShare: 0.27 });
    expect(flow.document.titleBlockContent).toEqual({
      model: { kind: 'step', stepId: 'step-model' },
      pattern: { kind: 'none' },
      byline: '디자인: 김민수\n종이: 35 cm 정사각형',
    });
    const grid = read(1);
    expect(grid.readOnly).toBe(false);
    expect(grid.document.page).toMatchObject({ layout: 'grid', titleBlock: { enabled: true, heightShare: 0.33 } });
    // The model it has no name for is Auto here: no model said, so the last step with a picture.
    expect(grid.document.titleBlockContent).toEqual({ pattern: { kind: 'step', stepId: 'step-swan' } });
    const shown = resolveTitleBlock(grid.document);
    expect([shown.model.from, shown.model.step?.id]).toEqual(['auto', 'step-swan']);
    expect([shown.pattern.from, shown.pattern.step?.id]).toEqual(['step', 'step-swan']);
    expect(grid.document.newer).toEqual({ titleBlockContent: { model: fixture()[1]!.titleBlockContent!.model } });
    const auto = read(2);
    expect(auto.readOnly).toBe(false);
    expect(auto.document.newer).toBeUndefined();
    expect(auto.document.titleBlockContent).toEqual({ model: { kind: 'none' } });
    const autoShown = resolveTitleBlock(auto.document);
    expect([autoShown.model.from, autoShown.model.step]).toEqual(['none', null]);
    expect([autoShown.pattern.from, autoShown.pattern.step?.id]).toEqual(['auto', 'step-lily-8']);
  });

  it('cuts the first page under the block from the file: seven of nine steps a page', () => {
    expect(cellSlots(read(2).document).pages.map((page) => page.length)).toEqual([7, 1]);
  });

  it('opens the flow of eight with its pages held as they were packed under the block: none packed afresh', () => {
    const { document } = read(2);
    const slots = cellSlots(document);
    expect(Object.keys(document.pageArrangements ?? {})).toEqual(['step-lily-1', 'step-lily-8']);
    expect(slots.signatures).toEqual(Object.values(document.pageArrangements!).map((arrangement) => arrangement.signature));
    expect(heldPageArrangements(document, slots)).toEqual(document.pageArrangements);
    const layout = layoutDiagram(document, estimateTextSetter);
    expect(layout.packed).toBeUndefined();
    expect(layout.pages.map((page) => page.packing?.packed)).toEqual([false, false]);
    // Every step in the box it was saved in, the first page's under the block.
    const { block } = layout.pages[0]!.titleBlock!.geometry;
    for (const [index, page] of layout.pages.entries()) {
      for (const cell of page.cells) {
        const [x, y, w, h] = document.pageArrangements![page.cells[0]!.stepId]!.steps[cell.stepId]!.box;
        expect([cell.cellMm.x, cell.cellMm.y, cell.cellMm.w, cell.cellMm.h], cell.stepId).toEqual([x, y, w, h]);
        if (index === 0) expect(cell.cellMm.y, cell.stepId).toBeGreaterThan(block.y + block.h);
      }
    }
  });

  it('writes each back exactly, byte for byte', () => {
    fixture().forEach((diagram, index) => {
      expect(JSON.stringify(written(read(index).document)), String(index)).toBe(JSON.stringify(diagram));
    });
  });

  it('keeps the asset only the newer build’s model names, through an edit and a save', () => {
    const { document } = read(1);
    const edited = setStepText(document, 'step-base', 'Fold in half.');
    const again = written(edited);
    expect(Object.keys(again.assets as object)).toEqual(['asset-own']);
    expect(again.titleBlockContent).toEqual(fixture()[1]!.titleBlockContent);
  });

  it('lets go of the newer build’s model, and its asset, once the model is set here; another part set keeps it', () => {
    const { document } = read(1);
    const byline = setTitleBlockContent(document, { byline: 'Design: Lang' });
    expect(written(byline).titleBlockContent).toEqual({ ...fixture()[1]!.titleBlockContent, byline: 'Design: Lang' });
    const chosen = setTitleBlockContent(document, { model: { kind: 'step', stepId: 'step-swan' } });
    expect(chosen.newer).toBeUndefined();
    const again = written(chosen);
    expect(again.titleBlockContent).toEqual({ model: { kind: 'step', stepId: 'step-swan' }, pattern: { kind: 'step', stepId: 'step-swan' } });
    expect(again.assets).toEqual({});
  });
});
