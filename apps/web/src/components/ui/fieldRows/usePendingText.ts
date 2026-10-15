import { useCallback, useEffect, useRef, useState } from 'react';
import { registerCanvasSessionEnder } from '../../../cp-workspace/canvasObjects/canvasSessions';
import { registerPendingEditFlush } from '../../../lib/pendingEdits';

/** Sessions are numbered across every field, so two fields can never share one. */
let lastSession = 0;

/** What is typed but not yet committed, and where it commits to. */
interface PendingEdit {
  text: string;
  /**
   * The `onCommit` that was current when this run of typing began. A pending
   * edit belongs to the thing it was typed into: if the field is re-pointed
   * mid-run — at another step, or at a diagram that replaced its own — the
   * draft still lands where it was written, and that callback can refuse it.
   */
  commit: (text: string, session: number) => void;
  session: number;
}

/**
 * A text field's typing, committed as it goes (`TextAreaRow`'s, and any field
 * that commits as that row does).
 *
 * Commits after `idleMs` without typing, on blur, before any undo or redo
 * runs, before a save or any question about unsaved work (`pendingEdits`),
 * and when the field goes away — so nothing typed is ever lost, and an undo
 * always has the latest text to undo. Each commit carries the session it
 * belongs to (one per focus), so a consumer that records history can make one
 * sitting at the field one entry. A draft that matches the value commits
 * nothing.
 *
 * The field shows `shown`, and calls `begin` on focus, `change` with each new
 * text and `end` on blur.
 */
export function usePendingText({
  value,
  idleMs,
  onCommit,
}: {
  value: string;
  idleMs: number;
  onCommit: (value: string, session: number) => void;
}) {
  // Shown while there is uncommitted typing; otherwise the field shows `value`,
  // so an undo or a reload reaches it at once.
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<PendingEdit | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(0);
  const latest = useRef({ onCommit, value });
  useEffect(() => {
    latest.current = { onCommit, value };
  });

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const edit = pending.current;
    if (!edit) return;
    pending.current = null;
    setDraft(null);
    if (edit.text !== latest.current.value) edit.commit(edit.text, edit.session);
  }, []);

  // An undo about to run commits this first, so the undo takes it back rather
  // than running under a draft that would write the old text again. A document
  // replacement commits it too: the callback it was typed against decides
  // whether it still has anywhere to go.
  useEffect(() => registerCanvasSessionEnder(flush, 'session'), [flush]);
  useEffect(() => registerPendingEditFlush(flush), [flush]);
  useEffect(() => flush, [flush]);

  const begin = () => {
    lastSession += 1;
    session.current = lastSession;
  };

  return {
    shown: draft ?? value,
    begin,
    change(text: string) {
      // A change can arrive without a focus event (a test, an assistive
      // tool setting the value); it still needs a session of its own.
      if (session.current === 0) begin();
      pending.current = {
        text,
        commit: pending.current?.commit ?? latest.current.onCommit,
        session: session.current,
      };
      setDraft(text);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, idleMs);
    },
    end() {
      flush();
      session.current = 0;
    },
  };
}
