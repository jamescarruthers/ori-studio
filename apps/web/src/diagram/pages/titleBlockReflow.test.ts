import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDiagram,
  defaultTitleBlockContent,
  insertSteps,
  setPageSetup,
  setTitleBlockContent,
  setTitleBlockRoom,
  stepById,
  stepsOf,
  type DiagramDocument,
  type DiagramPageSetup,
} from '../document/diagramDocument';
import { readDiagram, writeDiagram } from '../document/diagramFile';
import { setStepPlace } from '../document/stepPlace';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { layoutDiagram } from './diagramPages';
import type { DiagramPagesLayout } from './diagramPageLayout';
import { fontTextSetter } from './fontTextSetter';
import { adoptPageArrangements } from './pageArrangements';
import { pageSignature } from './pageSignature';
import { TITLE_BLOCK_MOST_SHARE, grownTitleBlockMm, paginate } from './pagePlan';
import { printPaper } from './printPaper';
import { cellSlots } from './stepPlaces';
import { measuresTitleBlock, noteTitleBlockEdit } from './titleBlockEdits';

/**
 * The header reflows (Zach, 2026-10-15: "Instead of saying that the rest of
 * the note doesn't fit, i would like it to actually reflow the content"): the
 * flow's title block grows to what its words need after an edit of them, up
 * to half the printable height; page 1 keeps its steps, packed smaller under
 * it, and no other page moves; a file opens as it was saved.
 */

const setter = fontTextSetter((key, weight) => FIXTURE_FONTS.font(key, weight)?.metrics ?? null, 'sc');
const layout = (document: DiagramDocument): DiagramPagesLayout => layoutDiagram(document, setter);

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.',
].join('\n');

/** Twenty steps, nine a flow page, under a new diagram's block and words — as opened, every page packed and held. */
function held(page: Partial<DiagramPageSetup> = {}): DiagramDocument {
  const steps = Array.from({ length: 20 }, (_, index) => cpStep(`s${index}`));
  const made = insertSteps(
    createDiagram({
      title: 'Crane',
      newId: () => 'diagram-1',
      titleBlockContent: defaultTitleBlockContent({
        subtitle: 'Origami diagram',
        author: 'Author',
        authorName: 'Your name here',
        steps: 'Steps',
        recommendedPaper: 'Recommended paper',
        paperSize: '15 cm × 15 cm',
      }),
    }),
    steps,
    0
  );
  const document = setPageSetup(made, { layout: 'flow', stepsPerPage: 9, ...page });
  return adoptPageArrangements(document, layout(document).packed ?? {});
}

/** `document` with its note set, as an edit leaves it: marked for its block's words to be measured. */
function edited(document: DiagramDocument, note: string): DiagramDocument {
  const next = setTitleBlockContent(document, { note });
  noteTitleBlockEdit(document, next);
  return next;
}

/** `document` with what its layout measured and packed taken in, as the store adopts them. */
function adopted(document: DiagramDocument, pages = layout(document)): DiagramDocument {
  const measured = pages.titleBlockRoom === undefined ? document : setTitleBlockRoom(document, pages.titleBlockRoom);
  return adoptPageArrangements(measured, pages.packed ?? {});
}

const blockOf = (pages: DiagramPagesLayout) => pages.pages[0]!.titleBlock!;
const counts = (document: DiagramDocument) => paginate(stepsOf(document), document.page).map((page) => page.steps.length);
const printable = (document: DiagramDocument) => {
  const { heightMm, marginMm } = printPaper(document.page);
  return heightMm - 2 * marginMm;
};

describe('the flow’s title block grows to its words after an edit of them', () => {
  it('grows for a long note and re-packs page 1 alone, every step kept on it, the note whole (Zach, 2026-10-15)', () => {
    const before = held();
    const was = layout(before);
    expect(was.packed).toBeUndefined();
    const share = blockOf(was).geometry.block.h;
    expect(share).toBeCloseTo(0.23 * printable(before), 9);

    const after = edited(before, LOREM);
    const pages = layout(after);
    const block = blockOf(pages);
    // Grown to the room its words need, measured to half a millimetre: the note printed whole.
    expect(pages.titleBlockRoom).toBeGreaterThan(share);
    expect(pages.titleBlockRoom! % 0.5).toBe(0);
    expect(block.geometry.block.h).toBe(pages.titleBlockRoom);
    expect(block.note!.cut).toBe(false);
    expect(block.note!.lines.length).toBeGreaterThanOrEqual(6);
    expect(block.scale).toBe(1);
    // The art as it was: it is sized by the block's share and stands at its top.
    expect(block.geometry.pattern).toEqual(blockOf(was).geometry.pattern);
    expect(block.geometry.model).toEqual(blockOf(was).geometry.model);
    // Page 1 keeps its steps, packed afresh under the block; no other page moves.
    expect(counts(after)).toEqual(counts(before));
    expect(pages.pages.map((page) => page.cells.map((cell) => cell.stepId))).toEqual(was.pages.map((page) => page.cells.map((cell) => cell.stepId)));
    expect(Object.keys(pages.packed ?? {})).toEqual(['s0']);
    const foot = block.geometry.block.y + block.geometry.block.h;
    for (const cell of pages.pages[0]!.cells) expect(cell.cellMm.y, cell.stepId).toBeGreaterThanOrEqual(foot - 1e-9);
    expect(pages.pages[0]!.packing!.k).toBeLessThan(was.pages[0]!.packing!.k);
    // Every later page as it was, held: its steps where they were. Only the path comes in where page 1's leaves now.
    for (const index of [1, 2]) {
      expect(pages.pages[index]!.cells).toEqual(was.pages[index]!.cells);
      expect(pages.pages[index]!.packing).toEqual(was.pages[index]!.packing);
    }
  });

  it('keeps the block at its share for words that fit it: nothing re-packs', () => {
    const before = held();
    const pages = layout(edited(before, 'Use thin paper.\nReverse fold the neck and the tail at the same angle.'));
    expect(pages.titleBlockRoom).toBeLessThan(blockOf(layout(before)).geometry.block.h);
    expect(blockOf(pages).geometry.block).toEqual(blockOf(layout(before)).geometry.block);
    expect(pages.packed).toBeUndefined();
    expect(pages.pages.map((page) => page.cells)).toEqual(layout(before).pages.map((page) => page.cells));
  });

  it('holds what it grew to once taken in, through a file, and opens a file as it was saved whatever its words need', () => {
    const after = edited(held(), LOREM);
    const pages = layout(after);
    expect(pages.titleBlockRoom).toBeGreaterThan(blockOf(layout(held())).geometry.block.h);
    const kept = adopted(after, pages);
    expect(kept.titleBlockContent?.room).toBe(pages.titleBlockRoom);
    // Taken in: page 1 holds what was packed for the grown block, and nothing is measured or packed again.
    const again = layout(kept);
    expect(again.packed).toBeUndefined();
    expect(again.titleBlockRoom).toBeUndefined();
    expect(again.pages.map((page) => page.cells)).toEqual(pages.pages.map((page) => page.cells));
    // Through a file: the room as said, every page as saved.
    const opened = readDiagram(JSON.parse(JSON.stringify(writeDiagram(kept))))!.document;
    expect(opened.titleBlockContent?.room).toBe(pages.titleBlockRoom);
    expect(measuresTitleBlock(opened)).toBe(false);
    // A room that is no length is dropped alone, as damage: the block at its share.
    const written = JSON.parse(JSON.stringify(writeDiagram(kept)));
    const damaged = readDiagram({ ...written, titleBlockContent: { ...written.titleBlockContent, room: 'tall' } })!.document;
    expect(damaged.titleBlockContent).toEqual({ ...kept.titleBlockContent, room: undefined });
    expect(layout(opened).pages.map((page) => page.cells)).toEqual(pages.pages.map((page) => page.cells));
    // A file whose words need more than it says — saved before blocks grew — opens as saved: the block at its share,
    // the note's end cut with "…", nothing packed.
    const unsaid = setTitleBlockContent(held(), { note: LOREM });
    const old = readDiagram(JSON.parse(JSON.stringify(writeDiagram(unsaid))))!.document;
    const oldPages = layout(old);
    expect(oldPages.packed).toBeUndefined();
    expect(blockOf(oldPages).geometry.block.h).toBeCloseTo(0.23 * printable(old), 9);
    expect(blockOf(oldPages).note!.cut).toBe(true);
    expect(blockOf(oldPages).note!.lines.at(-1)!.ellipsis).toBe(true);
  });

  it('grows no further than half the printable height, and cuts the note’s end with “…” there', () => {
    const long = Array.from({ length: 80 }, (_, index) => `Line ${index + 1} of a very long note.`).join('\n');
    const after = edited(held(), long);
    const pages = layout(after);
    const block = blockOf(pages);
    expect(block.geometry.block.h).toBeCloseTo(TITLE_BLOCK_MOST_SHARE * printable(after), 9);
    expect(block.note!.cut).toBe(true);
    expect(block.note!.lines.at(-1)!.ellipsis).toBe(true);
    expect(counts(after)).toEqual(counts(held()));
    expect(grownTitleBlockMm(after.page, 1000)).toBeCloseTo(TITLE_BLOCK_MOST_SHARE * printable(after), 9);
  });

  it('sets the description’s lines 1.4 times its size apart, and grows for them at that (Zach, 2026-10-15)', () => {
    // "increase the description line spacing a bit": it took a caption's 4.1 mm at 3.2 mm, 1.28 times its size.
    const lines = (count: number) => Array.from({ length: count }, (_, index) => `Use thin paper, note ${index + 1}.`).join('\n');
    const [three, six] = [layout(edited(held(), lines(3))), layout(edited(held(), lines(6)))];
    const set = blockOf(six).note!;
    expect(set.cut).toBe(false);
    expect(set.lines).toHaveLength(6);
    expect(set.leadingMm / set.sizeMm).toBeCloseTo(1.4, 9);
    // The block grows by the three lines more at that leading, measured to half a millimetre.
    expect(Math.abs(six.titleBlockRoom! - three.titleBlockRoom! - 3 * set.leadingMm)).toBeLessThanOrEqual(0.5);
  });

  it('grows for the description as it prints it, its indents and blank lines kept (Zach, 2026-10-15)', () => {
    // Four indented paragraphs, a blank line between each: "if I like indent a paragraph it should stay indented".
    const note = LOREM.split('\n')
      .slice(0, 4)
      .map((line) => `        ${line}`)
      .join('\n\n');
    const pages = layout(edited(held(), note));
    const block = blockOf(pages);
    const set = block.note!;
    expect(set.cut).toBe(false);
    expect(block.geometry.block.h).toBe(pages.titleBlockRoom);
    const typed = setter.paragraph(note, block.geometry.column.w, set.sizeMm, Number.MAX_SAFE_INTEGER, 400, 'pre-wrap').lines;
    expect(set.lines.map((line) => line.text)).toEqual(typed.map((line) => line.text));
    expect(set.lines.filter((line) => line.text === '')).toHaveLength(3);
    // Each paragraph's first line indented; a wrapped line of one at the margin.
    const firsts = set.lines.filter((line, index) => index === 0 || set.lines[index - 1]!.text === '');
    expect(firsts).toHaveLength(4);
    for (const line of firsts) expect(line.runs[0]!.xMm).toBeGreaterThan(5);
    for (const line of set.lines.filter((line) => line.text !== '' && !firsts.includes(line))) expect(line.runs[0]!.xMm).toBe(0);
    // Every line inside the grown block.
    const last = set.firstBaseline + (set.lines.length - 1) * set.leadingMm;
    expect(last + 0.24 * set.sizeMm).toBeLessThanOrEqual(block.geometry.block.y + block.geometry.block.h + 1e-9);
  });

  it('cuts an indented description with “…” at half the printable height, its blank lines counted', () => {
    const note = Array.from({ length: 40 }, (_, index) => `    Paragraph ${index + 1} of a very long description.`).join('\n\n');
    const after = edited(held(), note);
    const block = blockOf(layout(after));
    expect(block.geometry.block.h).toBeCloseTo(TITLE_BLOCK_MOST_SHARE * printable(after), 9);
    const set = block.note!;
    expect(set.cut).toBe(true);
    expect(set.lines.at(-1)!.ellipsis).toBe(true);
    expect(set.lines.some((line) => line.text === '')).toBe(true);
    const last = set.firstBaseline + (set.lines.length - 1) * set.leadingMm;
    expect(last + 0.24 * set.sizeMm).toBeLessThanOrEqual(block.geometry.block.y + block.geometry.block.h + 1e-9);
  });

  it('keeps a grid’s block in its whole rows: a note past them is cut with “…”', () => {
    const before = held({ layout: 'grid', columns: 3, rows: 6 });
    const pages = layout(edited(before, LOREM));
    expect(blockOf(pages).geometry.block).toEqual(blockOf(layout(before)).geometry.block);
    expect(blockOf(pages).note!.cut).toBe(true);
    expect(pages.pages.map((page) => page.cells)).toEqual(layout(before).pages.map((page) => page.cells));
  });

  it('signs page 1 with the grown height alone: a block at its share signs as before, and no other page reads it', () => {
    const document = held();
    const slots = cellSlots(document);
    const input = (titleBlockRoomMm?: number) => ({ steps: stepsOf(document).map((step) => ({ ...step, turnsBefore: [], turnsAfter: [] })), pages: paginate(stepsOf(document), document.page), setup: document.page, title: document.title, titleBlockRoomMm });
    const share = 0.23 * printable(document);
    expect(pageSignature(input(), 0)).toBe(slots.signatures[0]);
    expect(pageSignature(input(share - 1), 0)).toBe(pageSignature(input(), 0));
    expect(pageSignature(input(share + 1), 0)).not.toBe(pageSignature(input(), 0));
    expect(pageSignature(input(share + 1), 1)).toBe(pageSignature(input(), 1));
    // With the block off, a room says nothing.
    const off = setPageSetup(document, { titleBlock: { enabled: false, heightShare: 0.23 } });
    const offInput = (titleBlockRoomMm?: number) => ({ ...input(titleBlockRoomMm), setup: off.page });
    expect(pageSignature(offInput(share + 50), 0)).toBe(pageSignature(offInput(), 0));
  });
});

describe('through the store', () => {
  const state = () => useWorkspaceStore.getState();
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  });

  it('measures after an edit of the words, never on open; one Undo gives back the diagram, its hand placements too', () => {
    // A frame moved by hand on page 1, as the file was saved.
    const saved = setStepPlace(held(), 's1', { frame: [3, 2] });
    state().installDiagram({ document: saved, readOnly: false, raw: {} });
    expect(measuresTitleBlock(state().diagram!)).toBe(false);
    expect(layout(state().diagram!).packed).toBeUndefined();
    // A step's caption is no edit of the block's words.
    expect(state().setDiagramStepText('s5', 'Fold in half.')).toBe(true);
    expect(measuresTitleBlock(state().diagram!)).toBe(false);
    expect(state().setDiagramTitleBlockContent({ note: LOREM })).toBe(true);
    const edit = state().diagram!;
    expect(measuresTitleBlock(edit)).toBe(true);
    const pages = layout(edit);
    expect(state().adoptDiagramPageArrangements(pages.packed ?? {}, edit, pages.titleBlockRoom)).toBe(true);
    const grown = state().diagram!;
    expect(grown.titleBlockContent?.room).toBe(pages.titleBlockRoom);
    expect(Object.keys(grown.pageArrangements ?? {})).toContain('s0');
    // Taken in, not an edit: one undo step for the note, which gives back the diagram as it was.
    expect(state().diagramHistory.past).toHaveLength(2);
    expect(state().undoDiagram()).toBe(true);
    expect(state().diagram!.titleBlockContent?.note).toBeUndefined();
    expect(state().diagram!.pageArrangements).toEqual(saved.pageArrangements);
    expect(stepById(state().diagram!, 's1')!.place).toEqual({ frame: [3, 2] });
    expect(layout(state().diagram!).packed).toBeUndefined();
  });
});
