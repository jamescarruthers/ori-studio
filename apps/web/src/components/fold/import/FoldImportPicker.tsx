import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { FileUp, Layers } from 'lucide-react';
import { regionReferenceFor } from '../../../cp-workspace/regions/regionReference';
import { useCpPatternSheets } from '../../../cp-workspace/sheets/useCpPatternSheets';
import { type FoldSampleId } from '../../../fold/engine/foldEngineIoSamples';
import { foldStartingFigure } from '../../../fold/io/foldEditFigure';
import { FOLD_IMPORT_EXTENSIONS, foldImportFileSource } from '../../../fold/io/foldImportFiles';
import type { FoldImportRequest } from '../../../fold/io/foldImportFlow';
import { getFileService } from '../../../platform/fileService';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { PatternThumbnail } from '../../ui/PatternThumbnail';
import styles from './FoldImportPicker.module.css';

/** A sample's name, as the dialog and the menu say it. */
export function foldSampleName(t: TFunction, id: FoldSampleId): string {
  switch (id) {
    case 'preliminary-base':
      return t('dialogs:foldImport.sample.preliminaryBase', 'Square base');
    case 'waterbomb-base':
      return t('dialogs:foldImport.sample.waterbombBase', 'Waterbomb base');
    case 'pleat-in-eighths':
      return t('dialogs:foldImport.sample.pleatInEighths', 'Pleat in eighths');
  }
}

/**
 * What Import CP can bring in (plan D16): a crease-pattern file, by the
 * platform's picker or a drop on the dialog; a linked pattern from Edit;
 * or, when Edit has a flat folded figure, that figure with the layer order
 * Edit found. Each is one press; the dialog runs the import.
 */
export function FoldImportPicker({
  dragging,
  busy,
  onRequest,
}: {
  /** A file is being dragged over the dialog. */
  dragging: boolean;
  /** An import is under way: nothing new starts until it settles. */
  busy: boolean;
  onRequest: (request: FoldImportRequest) => void;
}) {
  const { t } = useTranslation();
  const sheets = useCpPatternSheets(true);
  const hasFigure = useWorkspaceStore((state) => foldStartingFigure(state) !== null);

  // Inside the press: a browser allows a picker only from a gesture.
  const pick = async () => {
    const file = await getFileService().openBinaryFile({
      title: t('dialogs:foldImport.pickTitle', 'Import Crease Pattern'),
      extensions: [...FOLD_IMPORT_EXTENSIONS],
      // As every document open offers it (`inputAccept`): none of these formats
      // is registered with Apple, and iOS greys out a file it cannot match. The
      // import reads the format from the name, and refuses one it cannot.
      mimeTypes: ['application/octet-stream'],
      filterName: 'Ori Studio',
    });
    if (!file) return;
    onRequest({ kind: 'file', name: file.name, source: foldImportFileSource(file.name, file.bytes) });
  };

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.drop}
        data-dragging={dragging || undefined}
        disabled={busy}
        onClick={() => void pick()}
      >
        <FileUp size={20} aria-hidden="true" />
        <span className={styles.dropTitle}>
          {t('dialogs:foldImport.drop', 'Drop a .cp, .fold, .ori or .orh file')}
        </span>
        <span className={styles.dropHint}>{t('dialogs:foldImport.browse', 'or click to browse')}</span>
      </button>

      <section className={styles.section} aria-labelledby="fold-import-patterns">
        <h3 id="fold-import-patterns" className={styles.heading}>
          {t('dialogs:foldImport.fromEdit', 'From Edit')}
        </h3>
        {sheets.status === 'ready' && sheets.sheets.length > 0 ? (
          <div className={styles.cards}>
            {sheets.sheets.map((sheet, index) => {
              const name = t('panels:diagram.picker.pattern', 'Pattern {{number}}', { number: index + 1 });
              return <button key={sheet.sheet.id} type="button" className={styles.card}
                aria-label={name} disabled={busy}
                onClick={() => onRequest({ kind: 'project-cp', region: regionReferenceFor(sheet.sheet) })}>
                <span className={styles.picture}>
                  {sheet.thumbnail && <PatternThumbnail thumbnail={sheet.thumbnail} auxInk="aux" />}
                </span>
                <span className={styles.name}>{name}</span>
              </button>;
            })}
          </div>
        ) : <p className={styles.note} role="status">{
          sheets.status === 'pending' ? t('panels:diagram.picker.pending', 'Finding the patterns…')
            : sheets.status === 'failed' ? t('panels:diagram.picker.failed', 'The crease pattern’s patterns couldn’t be found.')
              : sheets.status === 'no-pattern' ? t('panels:diagram.picker.noPattern', 'Open a crease pattern in Edit to link one.')
                : t('panels:diagram.picker.none', 'This crease pattern has no patterns to link yet.')
        }</p>}
      </section>

      {hasFigure && (
        <section className={styles.section} aria-labelledby="fold-import-edit">
          <h3 id="fold-import-edit" className={styles.heading}>
            {t('dialogs:foldImport.fromEdit', 'From Edit')}
          </h3>
          <button
            type="button"
            className={styles.row}
            disabled={busy}
            onClick={() => onRequest({ kind: 'edit-folded-figure' })}
          >
            <Layers size={18} aria-hidden="true" />
            <span className={styles.rowText}>
              <span className={styles.name}>{t('dialogs:foldImport.editFigure', 'Edit’s folded figure')}</span>
              <span className={styles.note}>
                {t(
                  'dialogs:foldImport.editFigureNote',
                  'The crease pattern Edit folded, with the layer order it found'
                )}
              </span>
            </span>
          </button>
        </section>
      )}
    </div>
  );
}
