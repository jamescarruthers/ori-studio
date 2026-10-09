import { useCallback, useEffect, useState, type DragEvent as ReactDragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react';
import { dragCarriesFiles } from '../../../lib/fileDrop';
import { useLayoutStore } from '../../../store/layoutStore';
import { useFoldSessionState } from '../../../fold/session/useFoldSession';
import type { FoldSessionSnapshot } from '../../../fold/session/foldSessionState';
import type { FoldImportFlowState, FoldImportRequest } from '../../../fold/io/foldImportFlow';
import { foldImportFileSource, foldImportFormatOf } from '../../../fold/io/foldImportFiles';
import { foldImportNotice } from '../../../fold/io/foldImportRefusal';
import { foldStepIsNumbered } from '../../../fold/io/foldStepPages';
import { useFoldImportUiStore, type FoldImportOpening } from '../../../fold/io/foldImportUiStore';
import { useFoldImportFlow } from '../../../fold/io/useFoldImport';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { useModalDialog } from '../../ui/useModalDialog';
import { FoldRefusalNotice } from '../FoldRefusalNotice';
import { FoldImportOrders } from './FoldImportOrders';
import { FoldImportPicker } from './FoldImportPicker';
import styles from './FoldImportDialog.module.css';

/**
 * Import CP's dialog (plan D16), mounted at the app root while Fold is the
 * workspace on screen and the store says it is open (`foldImportUiStore`).
 */
export function FoldImportModal() {
  const opening = useFoldImportUiStore((store) => store.opening);
  const shown = useLayoutStore((store) => store.activeWorkspace === 'fold');
  if (!opening || !shown) return null;
  return <FoldImportDialog key={opening.id} opening={opening} />;
}

/** A file read off a pick or a drop, as the flow imports it. */
async function fileRequest(file: File): Promise<FoldImportRequest> {
  if (foldImportFormatOf(file.name) === null) return { kind: 'file', name: file.name, source: null };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { kind: 'file', name: file.name, source: foldImportFileSource(file.name, bytes) };
  } catch {
    return { kind: 'file', name: file.name, source: null, unreadable: true };
  }
}

/** Where the step goes, said under the choices (the design's footnote). */
function placement(t: TFunction, snapshot: Pick<FoldSessionSnapshot, 'sequence' | 'cursor' | 'activePath'>): string {
  const steps = snapshot.sequence?.steps ?? [];
  if (steps.length === 0) {
    return t(
      'dialogs:foldImport.placement.empty',
      'Starts the sequence on the crease pattern’s sheet, folded along its creases. Use it when a state can’t be reached one fold at a time.'
    );
  }
  const byId = new Map(steps.map((node) => [node.id, node]));
  let number = 0;
  for (const id of snapshot.activePath) {
    const op = byId.get(id)?.op;
    if (op && foldStepIsNumbered(op)) number += 1;
    if (id === snapshot.cursor) break;
  }
  const at = snapshot.cursor === null ? 0 : number;
  const branches = snapshot.cursor !== (snapshot.activePath.at(-1) ?? null);
  const where =
    at === 0
      ? t(
          'dialogs:foldImport.placement.afterSheet',
          'Adds a step after the flat sheet, its folded state computed from the creases.'
        )
      : t(
          'dialogs:foldImport.placement.afterStep',
          'Adds a step after step {{number}}, its folded state computed from the creases.',
          { number: at }
        );
  const branch = branches ? ` ${t('dialogs:foldImport.placement.branch', 'It starts a new branch.')}` : '';
  return `${where}${branch} ${t(
    'dialogs:foldImport.placement.why',
    'Use it when the next state can’t be reached one fold at a time.'
  )}`;
}

function workingLabel(t: TFunction, state: FoldImportFlowState): string {
  if (state.phase !== 'working') return '';
  const { request } = state;
  switch (request.kind) {
    case 'file':
      return t('dialogs:foldImport.working.file', 'Importing {{name}}…', { name: request.name });
    case 'sample':
      return t('dialogs:foldImport.working.sample', 'Importing the sample…');
    case 'edit-folded-figure':
      return t('dialogs:foldImport.working.figure', 'Importing Edit’s folded figure…');
  }
}

/**
 * The dialog: what to import — a file, by the picker or a drop anywhere on
 * the dialog, a sample, or Edit's folded figure — and, when the pattern's
 * creases leave several layer orders, which. A shortcut barrier
 * (`useModalDialog`): Escape, the close button and a press on the backdrop
 * close it, and closing lets go of whatever the engine holds for it. It
 * closes itself once the step is committed.
 */
function FoldImportDialog({ opening }: { opening: FoldImportOpening }) {
  const { t } = useTranslation();
  const close = useFoldImportUiStore((store) => store.close);
  const { flow, state } = useFoldImportFlow(opening.request);
  const { rootRef, documentRef, keepFocus } = useModalDialog(close, opening.returnFocus);
  const sequence = useFoldSessionState((snapshot) => snapshot.sequence);
  const cursor = useFoldSessionState((snapshot) => snapshot.cursor);
  const activePath = useFoldSessionState((snapshot) => snapshot.activePath);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (state.phase === 'done') close();
  }, [state.phase, close]);

  const importFile = useCallback(
    async (file: File) => {
      const request = await fileRequest(file);
      void flow?.open(request);
    },
    [flow]
  );

  // A file dropped anywhere on the dialog is imported: the dialog covers the
  // workspace, whose own target would otherwise never see the drag, and the
  // browser would open the file in place of the app.
  const onDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!dragCarriesFiles({ types: Array.from(event.dataTransfer.types), items: event.dataTransfer.items })) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    const into = event.relatedTarget;
    if (!(into instanceof Node) || !event.currentTarget.contains(into)) setDragging(false);
  };
  const onDrop = (event: ReactDragEvent<HTMLElement>) => {
    setDragging(false);
    const [file] = Array.from(event.dataTransfer.files);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void importFile(file);
  };

  const title = t('dialogs:foldImport.title', 'Import crease pattern');
  const choosing = state.phase === 'choosing' ? state : null;
  const verbs = { searchLonger: () => void flow?.searchLonger() };
  const notice =
    state.phase === 'refused'
      ? foldImportNotice(t, state.refusal, verbs)
      : state.phase === 'failed'
        ? // A failure is no refusal the user can act on: said plainly, reported by the flow's hook.
          foldImportNotice(t, { kind: 'engine', refused: { refusal: { code: 'import_internal' } } }, verbs)
        : null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-shortcut-barrier=""
      className={styles.backdrop}
      onMouseDown={close}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={documentRef}
        role="document"
        tabIndex={-1}
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        onBlur={keepFocus}
      >
        <div className={styles.bar}>
          <span className={styles.title}>{title}</span>
          <IconButton size="sm" aria-label={t('dialogs:common.closeNamed', 'Close {{name}}', { name: title })} onClick={close}>
            <X size={15} />
          </IconButton>
        </div>
        <div className={styles.body}>
          {choosing ? (
            <FoldImportOrders
              opened={choosing.opened}
              choice={choosing.choice}
              previews={choosing.previews}
              disabled={choosing.committing}
              onChoose={(component, order) => flow?.choose(component, order)}
            />
          ) : (
            <FoldImportPicker
              dragging={dragging}
              busy={state.phase === 'working'}
              onRequest={(request) => void flow?.open(request)}
            />
          )}
          <div className={styles.status} role="status">
            {state.phase === 'working' ? workingLabel(t, state) : null}
          </div>
          {notice && <FoldRefusalNotice notice={notice} />}
        </div>
        <div className={styles.footer}>
          <p className={styles.placement}>{placement(t, { sequence, cursor, activePath })}</p>
          {choosing && (
            <div className={styles.actions}>
              <Button size="sm" variant="ghost" disabled={choosing.committing} onClick={() => flow?.reset()}>
                {t('dialogs:foldImport.back', 'Back')}
              </Button>
              <Button size="sm" variant="primary" disabled={choosing.committing} onClick={() => void flow?.commit()}>
                {t('dialogs:foldImport.import', 'Import')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
