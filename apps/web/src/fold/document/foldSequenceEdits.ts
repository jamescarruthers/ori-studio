/**
 * The edits a Fold sequence takes (plan D6, D7). Each is one undo entry, and
 * each returns the document it was given when it changes nothing, so the
 * store kit records nothing for it.
 *
 * - **Committing is append-only.** A step is added under its parent, never
 *   inserted; committing at a node that already has children makes a branch.
 *   No middle step is edited in place.
 * - **The only in-place edits are annotations** — a step's note, and the
 *   marks made on a step or on the sheet. Neither can break a step: inputs
 *   hold resolved points, and both are outside `fh1` and `fs1`.
 * - **Delete takes a step and everything that follows it**, locked or not.
 * - **Changing the shape empties the sequence**: it replaces the shape and
 *   the steps as one edit, never appending a hidden sequence.
 *
 * Nothing locked is edited: a step this build cannot read, and everything
 * that folds from one, can only be deleted.
 *
 * Pure: no React, no store.
 */

import { xmlText } from '../../lib/xmlEscape';
import { foldPaperKey } from './foldDigest';
import {
  isLockedStep,
  randomFoldId,
  type FoldChoices,
  type FoldIdFactory,
  type FoldMarkEntry,
  type FoldOp,
  type FoldPaperShape,
  type FoldSequenceDocument,
  type FoldStep,
} from './foldSequenceDocument';
import { foldStepTree, lockedIds, subtreeIds } from './foldStepTree';

/** A step to commit: everything but its id, which the commit makes. */
export interface FoldStepDraft {
  parent: string | null;
  op: FoldOp;
  choices?: FoldChoices;
  /** The `fs1` of the state the preview landed. */
  expect?: string;
  /**
   * The sheet the sequence takes with its first step: an Import CP into an
   * empty sequence adopts the crease pattern's square or rectangle (plan
   * D16), and the step folds from that sheet. Only for a first step.
   */
  adopt?: FoldPaperShape;
}

/**
 * Commit a step under `draft.parent`: the document with it appended, and its
 * id. Null when the parent is not a step of the document, or is locked, or
 * when the draft adopts a sheet for a sequence that already has steps.
 *
 * A draft that adopts a sheet changes the shape as {@link setFoldPaperShape}
 * does, in the same edit — one undo entry for the import.
 */
export function appendFoldStep(
  document: FoldSequenceDocument,
  draft: FoldStepDraft,
  newId: FoldIdFactory = randomFoldId
): { document: FoldSequenceDocument; id: string } | null {
  const { parent } = draft;
  if (draft.adopt) {
    if (parent !== null || document.steps.length > 0) return null;
    document = setFoldPaperShape(document, draft.adopt);
  }
  if (parent !== null) {
    const tree = foldStepTree(document.steps);
    if (!tree.byId.has(parent) || lockedIds(tree).has(parent)) return null;
  }
  const step: FoldStep = {
    id: newId('fstep'),
    parent,
    op: draft.op,
    ...(draft.choices ? { choices: draft.choices } : {}),
    ...(draft.expect !== undefined ? { expect: draft.expect } : {}),
  };
  return { document: { ...document, steps: [...document.steps, step] }, id: step.id };
}

/** "Delete this step and what follows": the step and its subtree, locked or not. */
export function deleteFoldStep(document: FoldSequenceDocument, id: string): FoldSequenceDocument {
  const doomed = subtreeIds(foldStepTree(document.steps), id);
  if (doomed.size === 0) return document;
  return { ...document, steps: document.steps.filter((node) => !doomed.has(node.id)) };
}

/** Set a step's note; an empty note clears it. Locked steps keep theirs. */
export function setFoldStepNote(document: FoldSequenceDocument, id: string, note: string): FoldSequenceDocument {
  const text = xmlText(note);
  return editStep(document, id, (step) => {
    if ((step.note ?? '') === text) return step;
    const { note: _previous, ...rest } = step;
    return text.length > 0 ? { ...rest, note: text } : rest;
  });
}

/**
 * Replace the marks made on step `id`, or on the flat sheet for null. An
 * empty list clears them. A locked step keeps its marks.
 */
export function setFoldMarks(
  document: FoldSequenceDocument,
  id: string | null,
  marks: readonly FoldMarkEntry[]
): FoldSequenceDocument {
  if (id === null) {
    if (marks === document.sheetMarks || (marks.length === 0 && !document.sheetMarks?.length)) return document;
    const { sheetMarks: _previous, ...rest } = document;
    return marks.length > 0 ? { ...rest, sheetMarks: marks } : rest;
  }
  return editStep(document, id, (step) => {
    if (marks === step.marks || (marks.length === 0 && !step.marks?.length)) return step;
    const { marks: _previous, ...rest } = step;
    return marks.length > 0 ? { ...rest, marks } : rest;
  });
}

/**
 * Change the sheet's shape: the shape replaced, and the steps emptied, as one
 * edit (plan D7). The marks made on the flat sheet go too — the plan names
 * only the steps, but a mark divides an edge of the old sheet, which the new
 * one need not have, and an annotation at a place that is no longer one is
 * worse than none. The same shape changes nothing.
 */
export function setFoldPaperShape(document: FoldSequenceDocument, shape: FoldPaperShape): FoldSequenceDocument {
  const paper = { ...document.paper, shape };
  if (foldPaperKey(paper) === foldPaperKey(document.paper)) return document;
  const { sheetMarks: _marks, ...rest } = document;
  return { ...rest, paper, steps: [] };
}

/**
 * Apply `edit` to step `id` when it is a step this build may edit; the
 * document itself otherwise, or when `edit` changes nothing.
 */
function editStep(
  document: FoldSequenceDocument,
  id: string,
  edit: (step: FoldStep) => FoldStep
): FoldSequenceDocument {
  const tree = foldStepTree(document.steps);
  const node = tree.byId.get(id);
  if (!node || isLockedStep(node) || lockedIds(tree).has(id)) return document;
  const edited = edit(node);
  if (edited === node) return document;
  return { ...document, steps: document.steps.map((step) => (step === node ? edited : step)) };
}
