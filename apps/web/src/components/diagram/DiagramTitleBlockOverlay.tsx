import { useTranslation } from 'react-i18next';
import type { DiagramStep } from '../../diagram/document/diagramDocument';
import type { PageBox } from '../../diagram/pages/pagePlacement';
import { missingTitleBlockParts, type MissingTitleBlockPart, type ResolvedTitleBlock } from '../../diagram/pages/titleBlockContent';
import type { LayoutTitleBlock } from '../../diagram/pages/titleBlockGeometry';
import { PAGES_PX_PER_MM } from '../../diagram/pages/usePagesView';
import styles from './DiagramTitleBlockOverlay.module.css';

const at = ({ x, y, w, h }: PageBox) => ({
  left: x * PAGES_PX_PER_MM,
  top: y * PAGES_PX_PER_MM,
  width: w * PAGES_PX_PER_MM,
  height: h * PAGES_PX_PER_MM,
});

/**
 * The first page's title block on the Pages view, over the page and never in
 * it (`implementation-plans/diagram-title-block.md`, section 6): its outline,
 * and a box where a part it would show prints nothing, saying why — the
 * title, the crease pattern or the finished model. A press passes through to
 * the page, which brings the Page tab forward.
 */
export function DiagramTitleBlockOverlay({
  block,
  content,
  steps,
}: {
  block: LayoutTitleBlock;
  content: ResolvedTitleBlock;
  /** The diagram's steps, in order: what a step a part comes from is numbered by. */
  steps: readonly DiagramStep[];
}) {
  const { t } = useTranslation();
  const numberOf = (step: DiagramStep) => steps.findIndex((each) => each.id === step.id) + 1;
  const label = ({ part, step }: MissingTitleBlockPart) => {
    switch (part) {
      case 'title':
        return t('panels:diagram.pages.titleBlock.addTitle', 'Add a title');
      case 'pattern':
        return step
          ? t('panels:diagram.pages.titleBlock.stepNoPattern', 'Step {{number}} has no crease pattern', { number: numberOf(step) })
          : t('panels:diagram.pages.titleBlock.noPattern', 'No step is linked to a crease pattern');
      case 'model':
        return step
          ? t('panels:diagram.pages.titleBlock.stepNoPicture', 'Step {{number}} has no picture yet', { number: numberOf(step) })
          : t('panels:diagram.pages.titleBlock.noModel', 'No step has a picture yet');
    }
  };
  return (
    <>
      <div className={styles.outline} aria-hidden="true" data-title-block="" style={at(block.geometry.block)} />
      {missingTitleBlockParts(block, content).map((missing) => (
        <div
          key={missing.part}
          className={styles.placeholder}
          aria-hidden="true"
          data-title-block-missing={missing.part}
          style={at(missing.box)}
        >
          {label(missing)}
        </div>
      ))}
    </>
  );
}
