import { useTranslation } from 'react-i18next';
import { useFoldSequenceView } from '../../fold/sequence/useFoldSequenceView';
import { useFoldStepPane } from '../../fold/sequence/useFoldStepPane';
import { useFoldSession } from '../../fold/session/useFoldSession';
import { FoldStepPane } from '../fold/FoldStepPane';
import { Notice } from '../ui/Notice';
import styles from './FoldStepPanel.module.css';

/**
 * Fold's Step pane: what the step on show does — its kind, its layers, its
 * crease-pattern diff and its sentence — then the fold a tool is making
 * (`implementation-plans/fold-workspace.md`, D14).
 *
 * A composition site: the rows are `FoldStepPane`'s, their data
 * `useFoldStepPane`'s, from the same view of the sequence the strip and the
 * grid read. It reads the session without holding it — the Fold panel holds
 * it — and offers a retry when the replay stopped short.
 */
export function FoldStepPanel() {
  const { t } = useTranslation();
  const session = useFoldSession({ retain: false });
  const view = useFoldSequenceView();
  const pane = useFoldStepPane(view);
  return (
    <section className="panel-shell" aria-label={t('panels:sidePane.step', 'Step')}>
      <div className={`panel-body ${styles.body}`}>
        {view.failed && (
          <div className={styles.notice}>
            <Notice
              tone="danger"
              actions={[{ id: 'retry', label: t('panels:fold.sequence.retry', 'Try again'), run: session.retry }]}
            >
              {t('panels:fold.sequence.replayFailed', 'The steps could not all be folded.')}
            </Notice>
          </div>
        )}
        <FoldStepPane
          step={pane.step}
          pending={pane.pending}
          startSide={view.paper.startSide}
          branch={pane.branch}
          fixes={pane.fixes}
        />
      </div>
    </section>
  );
}
