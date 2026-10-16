import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { ExternalAnchor } from '../ui/ExternalAnchor';
import { InfoPopover } from '../ui/InfoPopover';
import styles from './DiagramAffineCredit.module.css';

export function DiagramAffineCredit() {
  const { t } = useTranslation();
  return (
    <InfoPopover label={t('panels:diagram.pose.affineCreditLabel', 'About affine spreading')}>
      <div className={styles.content}>
        <p className={styles.description}>
          {t('panels:diagram.pose.affineCredit', 'Affine distortion by Kei Morisue')}
        </p>
        <ExternalAnchor className={styles.link} href="https://kei-morisue.github.io/step-folder/">
          {t('panels:diagram.pose.visitDefox', 'Visit DEFOX')}
          <ExternalLink size={12} aria-hidden="true" />
        </ExternalAnchor>
      </div>
    </InfoPopover>
  );
}
