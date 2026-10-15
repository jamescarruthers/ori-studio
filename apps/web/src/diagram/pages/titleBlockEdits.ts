/**
 * Which diagrams an edit left with the title block's words changed (Zach,
 * 2026-10-15: "actually reflow the content"): their layout measures the room
 * the words need (`DiagramTitles.room`, `'measure'`), grows the flow's block
 * to it, packs page 1 afresh where that moves it, and hands the room back for
 * the store to keep with the packing it adopts
 * (`DiagramTitleBlockContent.room`). Every other diagram is laid out with the
 * room it says — a diagram as it was opened is never among these, so a file
 * opens as it was saved, whatever the fonts would measure now.
 *
 * Kept beside the diagrams, not in them: a mark on an edit's result, which
 * the store's every edit passes on until a layout's room is taken in. An undo
 * goes back to a diagram that says its own room.
 */
import type { DiagramDocument } from '../document/diagramDocument';
import { hasTitleBlock } from './pagePlan';
import { titleBlockLook } from './titleBlockContent';

const edited = new WeakSet<DiagramDocument>();

/**
 * What the room the block's words need is read from: the words as printed
 * (the live step count's digits too), the pattern's size, which sets the
 * column's width, the paper and its margin, the block's share and the CJK
 * face. Empty where the first page has no flow block, which grows for none.
 */
export function titleBlockWordsKey(document: DiagramDocument): string {
  const { page } = document;
  if (page.layout !== 'flow' || !hasTitleBlock(page)) return '';
  const look = titleBlockLook(document);
  return JSON.stringify([
    look.subtitle,
    look.credits,
    look.note,
    look.sizes.patternSize,
    page.size,
    page.orientation,
    page.marginMm,
    page.titleBlock,
    document.hanStyle,
  ]);
}

/**
 * Note that `after`, an edit of `before` — null for a diagram the edit made —
 * has its block's words to measure: they changed, or `before`'s were still to
 * be measured.
 */
export function noteTitleBlockEdit(before: DiagramDocument | null, after: DiagramDocument): void {
  if (before === null || edited.has(before) || titleBlockWordsKey(before) !== titleBlockWordsKey(after)) edited.add(after);
}

/** Whether `document`'s layout measures its block's words ({@link noteTitleBlockEdit}). */
export function measuresTitleBlock(document: DiagramDocument): boolean {
  return edited.has(document);
}
