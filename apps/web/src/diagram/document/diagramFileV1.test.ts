// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { diagramLayoutSteps } from '../pages/diagramPages';
import { paginate } from '../pages/pagePlan';
import frozen from './__fixtures__/diagram-v1.json';
import { isKnownAnnotation, isTurn, snapshotDiagramStyle, type DiagramStep } from './diagramDocument';
import { readDiagram, writeDiagram } from './diagramFile';

/**
 * A diagram as the Diagram workspace launched with it (format v1, frozen
 * 2026-10-10, and before launch given the flow's page counts on 2026-10-11;
 * the plan's Contracts › The v1 file): every kind of step, picture, render,
 * turn and mark it writes — linked steps shown each way, a spread, a
 * remembered pose, uploads, References steps with their pulled marks, turns,
 * an enlarged step and its area, a step placed by hand, a label with every
 * option, a mark behind a flap, a page of its own count and a page break —
 * in one diagram on a set-up page with its own steps per page, as this build
 * wrote it.
 *
 * Every saved diagram is read by today's reader. A change that reads this file
 * otherwise, or writes it back otherwise, changes what saved diagrams mean, and
 * fails here first. Regenerate it only for a change to the format meant as
 * one, with the reader for this shape kept beside the new one.
 */
describe('a diagram saved at launch (format v1)', () => {
  const read = () => readDiagram(JSON.parse(JSON.stringify(frozen)))!;
  const steps = (document: { steps: readonly unknown[] }) =>
    (document.steps as Parameters<typeof isTurn>[0][]).filter((entry): entry is DiagramStep => !isTurn(entry));

  it('opens editable, with nothing carried as a newer build’s', () => {
    const { document, readOnly } = read();
    expect(readOnly).toBe(false);
    expect(document.newer).toBeUndefined();
    expect(document.steps.filter((entry) => entry.unknown !== undefined)).toEqual([]);
    for (const step of steps(document)) {
      expect(step.annotations.every(isKnownAnnotation), step.id).toBe(true);
    }
    expect(Object.values(document.assets).every((asset) => !('unknown' in asset))).toBe(true);
  });

  it('holds what it was frozen to hold', () => {
    const { document } = read();
    const all = steps(document);
    expect(document.steps.filter(isTurn).map((turn) => turn.kind)).toEqual(['turn-over', 'rotate']);
    const sources = new Set(all.map((step) => step.source?.kind ?? 'none'));
    expect([...sources].sort()).toEqual(['cp', 'none', 'references-step', 'upload']);
    const renders = new Set(all.flatMap((step) => (step.source?.kind === 'cp' ? [step.source.render.mode] : [])));
    expect([...renders].sort()).toEqual(['crease-pattern', 'folded-3d', 'folded-flat', 'simulated']);
    const pictures = new Set(all.flatMap((step) => (step.picture ? [step.picture.kind] : [])));
    expect([...pictures].sort()).toEqual(['asset', 'fixed', 'scene', 'step-diagram']);
    expect(all.filter((step) => step.zoom !== undefined)).toHaveLength(1);
    expect(all.filter((step) => step.place !== undefined)).toHaveLength(1);
    const marks = new Set(all.flatMap((step) => step.annotations.flatMap((mark) => (isKnownAnnotation(mark) ? [mark.kind] : []))));
    expect(marks.size).toBeGreaterThanOrEqual(25);
    expect(document.page).toMatchObject({ layout: 'flow', columns: 4, rows: 3, stepsPerPage: 7 });
    // Saved before the title block: its first page has none.
    expect(document.page.titleBlock).toEqual({ enabled: false, heightShare: 0.27 });
    expect(document.titleBlockContent).toBeUndefined();
    expect(all.flatMap((step) => (step.pageSteps !== undefined ? [[step.id, step.pageSteps]] : []))).toEqual([['step-2', 3]]);
    expect(all.filter((step) => step.breakBefore).map((step) => step.id)).toEqual(['step-marks']);
  });

  it('cuts its pages by its steps per page, its page count and its break', () => {
    const { document } = read();
    const pages = paginate(steps(document), document.page);
    // 7 a page; cut short by step-2's own 3; and the break at step-marks, which starts the last page, laid out for 7.
    expect(pages.map((page) => [page.firstStepId, page.steps.length, page.ownCount, page.layoutCount])).toEqual([
      ['step-cp', 7, false, 7],
      ['step-spread', 4, false, 4],
      ['step-2', 3, true, 3],
      ['step-find', 4, false, 4],
      ['step-marks', 1, false, 7],
    ]);
  });

  it('only adds the explicit preset snapshot, and says the page settings it left unsaid, preserving the frozen legacy file', () => {
    const written = JSON.parse(JSON.stringify(writeDiagram(read().document)));
    // Every page setting is said (2026-10-12, `diagram-document-evolution.md`): the packing it did not say, at the
    // legacy values it was packed by, and the title block it was saved before (2026-10-14): none.
    const packing = { flowBands: 'auto', flowPreferBands: 0.5, flowBendSteps: true, flowNesting: 0.8, flowSteadiness: 0.85 };
    const titleBlock = { enabled: false, heightShare: 0.27 };
    expect(written).toEqual({
      ...frozen,
      style: snapshotDiagramStyle(read().document.style),
      page: { ...frozen.page, ...packing, titleBlock },
    });
    expect(readDiagram(written)!.document).toEqual(read().document);
    expect(writeDiagram(readDiagram(written)!.document)).toEqual(written);
  });

  it('lays out every step, the placed one where it was put', () => {
    const { document } = read();
    const layout = diagramLayoutSteps(document);
    expect(layout).toHaveLength(steps(document).length);
    const placed = steps(document).find((step) => step.place !== undefined)!;
    expect(layout.find((step) => step.id === placed.id)?.place).toEqual(placed.place);
  });
});
