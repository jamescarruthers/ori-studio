import { useMemo } from 'react';
import { trackFoldStepNoteEdited, type FoldStepNoteAction } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { shownFoldSequence } from '../../store/workspaceStore/foldState';
import { isLockedStep, type FoldSequenceDocument } from '../document/foldSequenceDocument';
import { foldStepTree, lockedIds } from '../document/foldStepTree';

/** A step's note as the Step pane shows it and writes it (`FoldStep.note`). */
export interface FoldStepNote {
  /** The step it is of: one field per step, so a draft never carries over to the next. */
  stepId: string;
  /** Its note; empty for none. */
  text: string;
  /**
   * Whether it can be written here: not in a sequence a newer build wrote,
   * nor on a step it wrote, or one folded from that — those show their note
   * and keep it as it came.
   */
  editable: boolean;
  /** The field's text, committed: one undo step per sitting at the field (`session`). */
  set: (text: string, session: number) => void;
}

/** A step's note in a sequence; empty for none, or for no such step. */
export function foldStepNoteOf(document: FoldSequenceDocument, stepId: string): string {
  return document.steps.find((step) => step.id === stepId)?.note ?? '';
}

/** What a change of a note did: wrote one where there was none, rewrote it, or cleared it. */
export function foldStepNoteAction(before: string, after: string): FoldStepNoteAction {
  if (before.length === 0) return 'added';
  return after.length === 0 ? 'cleared' : 'changed';
}

/** The sitting last counted: a note edit is counted once per sitting, by its first change. */
let counted = 0;

/**
 * The note of step `stepId` of the shown sequence, bound to the store
 * (`setFoldStepNote`) and counted as `fold step note edited`. Null for the
 * flat sheet, a step the sequence does not hold, or no sequence.
 */
export function useFoldStepNote(stepId: string | null): FoldStepNote | null {
  const shown = useWorkspaceStore((state) => shownFoldSequence(state) ?? null);
  const loadId = useWorkspaceStore((state) => state.foldLoadId);
  return useMemo(() => {
    if (!shown || stepId === null) return null;
    const tree = foldStepTree(shown.document.steps);
    const node = tree.byId.get(stepId);
    if (!node) return null;
    return {
      stepId,
      text: node.note ?? '',
      editable: shown.readOnlyRaw === null && !isLockedStep(node) && !lockedIds(tree).has(stepId),
      set: (text, session) => {
        const store = useWorkspaceStore.getState();
        const held = shownFoldSequence(store);
        const before = held ? foldStepNoteOf(held.document, stepId) : '';
        if (!store.setFoldStepNote(stepId, text, { session, loadId })) return;
        if (session === counted) return;
        counted = session;
        const after = shownFoldSequence(useWorkspaceStore.getState());
        trackFoldStepNoteEdited(foldStepNoteAction(before, after ? foldStepNoteOf(after.document, stepId) : text));
      },
    };
  }, [shown, stepId, loadId]);
}
