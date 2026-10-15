import { useTranslation } from 'react-i18next';
import { useFoldReturnUi, type FoldReturnOpening } from '../../../fold/return/foldReturnUi';
import { useFoldReturn } from '../../../fold/return/useFoldReturn';
import { foldReturnEntryLabel, foldReturnFailure } from '../../../fold/return/foldReturnWords';
import { foldCardPictureSource, useFoldCardPicture } from '../../../fold/sequence/useFoldCardPictures';
import type { FoldPathEntry } from '../../../fold/sequence/foldSequencePath';
import { Button } from '../../ui/Button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../ui/Select';
import styles from './FoldReturn.module.css';

function Target({ entry }: { entry: FoldPathEntry }) {
  const picture = useFoldCardPicture(foldCardPictureSource(entry.session.state, entry.session.fingerprint));
  return picture ? <img className={styles.picture} alt="" src={picture} /> : null;
}
function Picker({ opening }: { opening: FoldReturnOpening }) {
  const { t } = useTranslation();
  const model = useFoldReturn(opening);
  const selected = model.candidates.find((entry) => entry.id === model.target);
  return <div className={styles.bar} role="region" aria-label={t('panels:fold.return.title', 'Unfold preview')}>
    {selected && <Target entry={selected} />}
    <div className={styles.description}>
      <strong>{t('panels:fold.return.target', 'Return to')}</strong>
      <p role="status">{model.current?.code ? foldReturnFailure(t, model.current.code)
        : model.noop ? t('panels:fold.return.noop', 'The paper is already in this pose with these creases.')
          : model.current?.fingerprint ? t('panels:fold.return.preview', 'Preview shown below. All creases are retained.')
            : t('panels:fold.return.loading', 'Preparing unfold preview…')}</p>
    </div>
    <Select value={model.target ?? '__sheet__'} onValueChange={(v) => model.setTarget(v === '__sheet__' ? null : v)} disabled={model.busy || opening.lastOnly}>
      <SelectTrigger className={styles.target} aria-label={t('panels:fold.return.target', 'Return to')}><SelectValue /></SelectTrigger>
      <SelectContent>{[...model.candidates].reverse().map((entry) =>
        <SelectItem key={entry.key} value={entry.id ?? '__sheet__'} disabled={!entry.session.state}>{foldReturnEntryLabel(t, entry, model.candidates)}</SelectItem>
      )}</SelectContent>
    </Select>
    <Button size="sm" variant="primary" disabled={!model.canCommit} onClick={() => void model.commit()}>
      {opening.rebuild ? t('panels:fold.return.rebuild', 'Rebuild unfold') : t('panels:fold.return.append', 'Append unfold step')}
    </Button>
    <Button size="sm" disabled={model.busy} onClick={model.close}>{t('common:cancel', 'Cancel')}</Button>
  </div>;
}
export function FoldReturnBar() {
  const opening = useFoldReturnUi((s) => s.opening);
  return opening ? <Picker key={opening.id} opening={opening} /> : null;
}
