import { afterEach, describe, expect, it, vi } from 'vitest';
import frozen from '../document/__fixtures__/diagram-held-pages.json';
import { isTurn, type DiagramArrangedStep, type DiagramDocument, type DiagramStep } from '../document/diagramDocument';
import { readDiagram, writeDiagram } from '../document/diagramFile';
import { layoutDiagram } from './diagramPages';
import { estimateTextSetter } from './estimateTextSetter';
import { PACKER_VERSION } from './flowArrangement';
import { adoptPageArrangements, followPageArrangements, heldPageArrangements, repackPages } from './pageArrangements';
import { pageOffset } from './pagePlacement';

/**
 * A diagram saved with its flow pages packed and held, and steps placed by
 * hand (`document/__fixtures__/diagram-held-pages.json`: nine steps on two
 * flow pages, a turn, a frame moved on each page, part offsets, a pinned size
 * and a pinned caption measure), as this build wrote it on 2026-10-12 — its
 * pages signed `pack-3:`, before arrangements recorded their packer.
 *
 * Saved layout never moves because the app changed
 * (`implementation-plans/diagram-document-evolution.md`): every later build
 * opens it with every page held as saved — none packed afresh, nothing
 * adopted, every step in the box it was saved in, every placement as it was.
 * A change to what a page's signature covers, or to the packer, that would
 * re-pack it fails here first. Never regenerate it: a file saved is saved.
 */
const read = (): DiagramDocument => readDiagram(JSON.parse(JSON.stringify(frozen)))!.document;

const stepsOf = (document: DiagramDocument) => document.steps.filter((entry): entry is DiagramStep => !isTurn(entry));

/** The box each step was saved in, by its id. */
function savedBoxes(document: DiagramDocument): Map<string, DiagramArrangedStep['box']> {
  return new Map(Object.values(document.pageArrangements ?? {}).flatMap((arrangement) => Object.entries(arrangement.steps).map(([id, step]) => [id, step.box])));
}

describe('a diagram saved with its pages held', () => {
  afterEach(() => {
    vi.doUnmock('./flowArrangement');
    vi.resetModules();
  });

  it('opens with every page held: none packed afresh, nothing adopted, nothing dropped', () => {
    const document = read();
    expect(Object.keys(document.pageArrangements ?? {})).toEqual(['step-1', 'step-6']);
    // Saved before packers were recorded.
    expect(Object.values(document.pageArrangements!).map((arrangement) => arrangement.packer)).toEqual([undefined, undefined]);
    const layout = layoutDiagram(document, estimateTextSetter);
    expect(layout.packed).toBeUndefined();
    expect(layout.pages.map((page) => page.packing?.packed)).toEqual([false, false]);
    expect(Object.keys(heldPageArrangements(document))).toEqual(['step-1', 'step-6']);
    expect(adoptPageArrangements(document, {})).toBe(document);
    expect(followPageArrangements(document, document)).toBe(document);
  });

  it('draws every step in the box it was saved in, a moved frame moved from it, every placement as saved', () => {
    const document = read();
    const places = new Map(stepsOf(document).map((step) => [step.id, step.place]));
    const boxes = savedBoxes(document);
    const cells = layoutDiagram(document, estimateTextSetter).pages.flatMap((page) => page.cells);
    expect(cells.map((cell) => cell.stepId)).toEqual(stepsOf(document).map((step) => step.id));
    for (const cell of cells) {
      const [x, y, w, h] = boxes.get(cell.stepId)!;
      const [dx, dy] = pageOffset(places.get(cell.stepId), 'frame', Boolean(cell.rightToLeft));
      expect([cell.cellMm.x, cell.cellMm.y, cell.cellMm.w, cell.cellMm.h], cell.stepId).toEqual([x + dx, y + dy, w, h]);
      expect(cell.placed?.offsets, cell.stepId).toEqual(places.get(cell.stepId));
    }
    expect(stepsOf(document).filter((step) => step.place?.frame).map((step) => step.id)).toEqual(['step-2', 'step-7']);
  });

  it('draws every picture where and as large as it was saved, its caption set the wider gap under it: a look, not a move (Zach, 2026-10-13)', () => {
    // Each step's picture as drawn and its caption's first baseline, as this build drew the file with a 2 mm gap
    // between them (`CAPTION_TOP_MM`). Its boxes were packed for that gap: held, they keep it, and the captions,
    // a look, take the new one — each a millimetre lower, placed ones too, which keep their offsets from home.
    const before: Record<string, readonly [readonly number[], number]> = {
      'step-1': [[72.0784, 33, 65.8333, 65.8333], 104.0333],
      'step-2': [[116.8284, 111.93, 65.8333, 65.8333], 182.9633],
      'step-3': [[24.3284, 113.93, 65.8333, 65.8333], 184.9633],
      'step-4': [[24.3284, 190.61, 65.8333, 65.8333], 261.6433],
      'step-5': [[134.6127, 188.77, 40.2646, 40.2646], 234.2346],
      'step-6': [[69.1278, 200.13, 71.7345, 71.7345], 277.0645],
      'step-7': [[120.8778, 123.13, 71.7345, 71.7345], 201.2645],
      'step-8': [[21.3778, 117.13, 71.7345, 71.7345], 194.0645],
      'step-9': [[21.3778, 34.13, 71.7345, 71.7345], 111.0645],
    };
    const round = (value: number) => Math.round(value * 1e4) / 1e4;
    const layout = layoutDiagram(read(), estimateTextSetter);
    expect(layout.packed).toBeUndefined();
    const cells = layout.pages.flatMap((page) => page.cells);
    expect(cells.map((cell) => cell.stepId)).toEqual(Object.keys(before));
    for (const cell of cells) {
      const [picture, baseline] = before[cell.stepId]!;
      expect([cell.drawMm.x, cell.drawMm.y, cell.drawMm.w, cell.drawMm.h].map(round), cell.stepId).toEqual(picture);
      expect(cell.text.firstBaseline, cell.stepId).toBeCloseTo(baseline + 1, 4);
    }
  });

  it('writes back as it was read, every page setting it left unsaid now said at the value it was packed by', () => {
    const written = JSON.parse(JSON.stringify(writeDiagram(read())));
    const unsaid = {
      pathWidthMm: 20,
      pathColor: '#ecece8',
      firstPageSide: 'left',
      flowBands: 'auto',
      flowPreferBands: 0.5,
      flowBendSteps: true,
      flowNesting: 0.8,
      flowSteadiness: 0.85,
      // Saved before there was a title block: its first page has none.
      titleBlock: { enabled: false, heightShare: 0.27 },
    };
    expect(written).toEqual({ ...frozen, page: { ...frozen.page, ...unsaid } });
    // Read again, it is the same diagram, every page still held.
    const again = readDiagram(written)!.document;
    expect(again).toEqual(read());
    expect(layoutDiagram(again, estimateTextSetter).packed).toBeUndefined();
  });

  it('packs a page the user re-packs with this build’s packer, and records it; the other page holds as saved', () => {
    const document = repackPages(read(), 0);
    const layout = layoutDiagram(document, estimateTextSetter);
    expect(Object.keys(layout.packed ?? {})).toEqual(['step-1']);
    const adopted = adoptPageArrangements(document, layout.packed!);
    expect(adopted.pageArrangements!['step-1']!.packer).toBe(PACKER_VERSION);
    expect(adopted.pageArrangements!['step-6']).toEqual(read().pageArrangements!['step-6']);
  });

  it('holds every page in a build with another packer, which packs only the pages re-packed there', async () => {
    // A later build: its packer's version bumped, and every arrangement it packs stamped with it.
    vi.resetModules();
    const LATER = 'pack-later';
    expect(LATER).not.toBe(PACKER_VERSION);
    vi.doMock('./flowArrangement', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./flowArrangement')>();
      return {
        ...actual,
        PACKER_VERSION: LATER,
        packedArrangement: (...args: Parameters<typeof actual.packedArrangement>) => ({ ...actual.packedArrangement(...args), packer: LATER }),
      };
    });
    const later = {
      ...(await import('./diagramPages')),
      ...(await import('./pageArrangements')),
      ...(await import('../document/diagramFile')),
      ...(await import('./estimateTextSetter')),
    };
    const document = later.readDiagram(JSON.parse(JSON.stringify(frozen)))!.document;
    const opened = later.layoutDiagram(document, later.estimateTextSetter);
    expect(opened.packed).toBeUndefined();
    expect(later.adoptPageArrangements(document, {})).toBe(document);
    // Re-packed there, a page takes that build's packing, and says so.
    const repacked = later.repackPages(document, 1);
    const packed = later.layoutDiagram(repacked, later.estimateTextSetter).packed ?? {};
    expect(Object.keys(packed)).toEqual(['step-6']);
    const adopted = later.adoptPageArrangements(repacked, packed);
    expect(adopted.pageArrangements!['step-6']!.packer).toBe(LATER);
    expect(adopted.pageArrangements!['step-1']).toEqual(document.pageArrangements!['step-1']);
  });
});
