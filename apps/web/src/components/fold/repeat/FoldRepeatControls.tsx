import { useTranslation } from 'react-i18next';
import { useFoldSessionState } from '../../../fold/session/useFoldSession';
import { openFoldRepeat } from '../../../fold/repeat/foldRepeatUi';
import { foldNodeDigest } from '../../../fold/document/foldDigest';
import { useWorkspaceStore } from '../../../store/workspaceStore/store';
import { Button } from '../../ui/Button';
import styles from './FoldRepeat.module.css';

export function FoldRepeatControls() {
  const { t } = useTranslation();
  const snapshot = useFoldSessionState((s) => s);
  const node = snapshot.sequence?.steps.find((n) => n.id === snapshot.cursor);
  if (!node?.op) return null;
  const repeat = node.op.kind === 'repeat' ? node.op : null;
  const sourceAvailable = repeat && snapshot.sequence?.steps.some((s) => s.id === repeat.source.first);
  const sourceChanged =
    repeat &&
    snapshot.sequence &&
    foldNodeDigest(snapshot.sequence, repeat.source.last) !== repeat.source.revision;
  return (
    <div className={styles.controls}>
      <Button
        size="sm"
        disabled={snapshot.readOnly || !snapshot.nodes.get(node.id)?.state}
        onClick={() => openFoldRepeat()}
      >
        {t('panels:fold.repeat.open', 'Repeat on the other side…')}
      </Button>
      {repeat && (
        <>
          <p className={styles.message}>
            {t('panels:fold.repeat.savedCount', {
              count: repeat.steps.length,
              defaultValue_one: 'One operation, saved as a Repeat step.',
              defaultValue_other: '{{count}} operations, saved as one Repeat step.',
            })}
          </p>
          {sourceChanged && (
            <p className={styles.message}>
              {t('panels:fold.repeat.sourceChanged', 'Source steps changed. Update to rebuild this Repeat.')}
            </p>
          )}
          <Button
            size="sm"
            disabled={!sourceAvailable}
            onClick={() => useWorkspaceStore.getState().moveFoldCursor(repeat.source.first)}
          >
            {t('panels:fold.repeat.goSource', 'Go to source steps')}
          </Button>
          <Button
            size="sm"
            disabled={
              snapshot.readOnly || !sourceAvailable || !node.parent || !snapshot.nodes.get(node.parent)?.state
            }
            onClick={() => openFoldRepeat(node.id)}
          >
            {t('panels:fold.repeat.update', 'Update from source steps')}
          </Button>
        </>
      )}
    </div>
  );
}
