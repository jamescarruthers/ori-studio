import { useRef } from 'react';
import { useNearView } from '../../diagram/pictures/useStepPictureUrl';
import { useFoldCardPicture, type FoldCardPictureSource } from '../../fold/sequence/useFoldCardPictures';
import styles from './DiagramFoldPicture.module.css';

/** The carousel's folded-paper picture, requested only as the import card comes into view. */
export function DiagramFoldPicture({ source }: { source: FoldCardPictureSource }) {
  const element = useRef<HTMLSpanElement>(null);
  const near = useNearView(element);
  const picture = useFoldCardPicture(near ? source : null);
  return (
    <span ref={element} className={styles.frame}>
      {picture && <img className={styles.picture} src={picture} alt="" draggable={false} decoding="async" data-fold-picture="paper" />}
    </span>
  );
}
