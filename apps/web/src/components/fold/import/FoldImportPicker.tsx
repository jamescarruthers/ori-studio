import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { FileUp, Layers } from 'lucide-react';
import { FOLD_SAMPLES, type FoldSampleId } from '../../../fold/engine/foldEngineIoSamples';
import { foldStartingFigure } from '../../../fold/io/foldEditFigure';
import { FOLD_IMPORT_EXTENSIONS, foldImportFileSource, foldSampleSummary } from '../../../fold/io/foldImportFiles';
import type { FoldImportRequest } from '../../../fold/io/foldImportFlow';
import { getFileService } from '../../../platform/fileService';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { DiagramSheetThumbnail } from '../../diagram/DiagramSheetThumbnail';
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
 * platform's picker or a drop on the dialog; a sample that ships with Fold;
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
  const hasFigure = useWorkspaceStore((state) => foldStartingFigure(state) !== null);

  // Inside the press: a browser allows a picker only from a gesture.
  const pick = async () => {
    const file = await getFileService().openBinaryFile({
      title: t('dialogs:foldImport.pickTitle', 'Import Crease Pattern'),
      extensions: [...FOLD_IMPORT_EXTENSIONS],
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

      <section className={styles.section} aria-labelledby="fold-import-samples">
        <h3 id="fold-import-samples" className={styles.heading}>
          {t('dialogs:foldImport.samples', 'Samples')}
        </h3>
        <div className={styles.cards}>
          {FOLD_SAMPLES.map((sample) => {
            const summary = foldSampleSummary(sample);
            return (
              <button
                key={sample.id}
                type="button"
                className={styles.card}
                data-sample={sample.id}
                disabled={busy}
                onClick={() => onRequest({ kind: 'sample', sample: sample.id })}
              >
                <span className={styles.picture}>
                  {summary.thumbnail && <DiagramSheetThumbnail thumbnail={summary.thumbnail} />}
                </span>
                <span className={styles.name}>{foldSampleName(t, sample.id)}</span>
                <span className={styles.note}>
                  {t('dialogs:foldImport.creases', {
                    count: summary.creases,
                    defaultValue_one: '{{count}} crease',
                    defaultValue_other: '{{count}} creases',
                  })}
                </span>
              </button>
            );
          })}
        </div>
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
