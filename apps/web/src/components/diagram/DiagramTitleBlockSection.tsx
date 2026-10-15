import { useTranslation } from 'react-i18next';
import type { TitleBlockPartChoices } from '../../diagram/pages/titleBlockChoices';
import { TITLE_BLOCK_BYLINE_LINES } from '../../diagram/pages/titleBlockGeometry';
import { useDiagramTitleBlock } from '../../diagram/pages/useDiagramTitleBlock';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { SelectRow, TextAreaRow, ToggleRow, type SelectRowOption } from '../ui/fieldRows';

/**
 * The Page pane's Title block section (`implementation-plans/diagram-title-block.md`,
 * section 7, T-15 A and T-19 A): the toggle for the first page's title block
 * and, while the page has one, what it shows — the finished model and the
 * crease pattern, each Auto (named by the step it finds), a step, or None,
 * and the byline under the title. Bound by `useDiagramTitleBlock`, which
 * offers only what the block can show.
 */
export function DiagramTitleBlockSection() {
  const { t } = useTranslation();
  const block = useDiagramTitleBlock();
  const { readOnly } = block;
  const step = (number: number) => t('panels:diagram.pagePane.titleBlock.step', 'Step {{number}}', { number });
  const auto = (number: number) => t('panels:diagram.pagePane.titleBlock.auto', 'Auto (step {{number}})', { number });
  const none = t('panels:diagram.pagePane.titleBlock.none', 'None');
  /** Auto, each step offered — one that can no longer give the part, as `cannot` names it — and None. */
  const options = (
    part: TitleBlockPartChoices,
    autoNone: string,
    cannot: (number: number) => string
  ): SelectRowOption[] => [
    { id: 'auto', label: part.autoNumber === null ? autoNone : auto(part.autoNumber) },
    ...part.steps.map((each) => ({ id: each.choice, label: each.gives ? step(each.number) : cannot(each.number) })),
    { id: 'none', label: none },
  ];
  return (
    <CollapsibleSection title={t('panels:diagram.pagePane.titleBlock.section', 'Title block')}>
      <ToggleRow
        label={t('panels:diagram.pagePane.titleBlock.show', 'Title block')}
        help={t(
          'panels:diagram.pagePane.titleBlock.showHelp',
          'The title, the crease pattern and the finished model, at the top of the first page.'
        )}
        note={block.fits ? undefined : t('panels:diagram.pagePane.titleBlock.needsRows', 'Needs two rows or more')}
        checked={block.shown}
        disabled={readOnly || !block.fits}
        onChange={block.setEnabled}
      />
      {block.shown && (
        <>
          <SelectRow
            label={t('panels:diagram.pagePane.titleBlock.model', 'Model')}
            value={block.model.value}
            disabled={readOnly}
            options={options(
              block.model,
              t('panels:diagram.pagePane.titleBlock.autoNoPicture', 'Auto (no pictures)'),
              (number) =>
                t('panels:diagram.pagePane.titleBlock.stepNoPicture', 'Step {{number}} (no picture)', { number })
            )}
            onChange={block.setModel}
          />
          <SelectRow
            label={t('panels:diagram.pagePane.titleBlock.pattern', 'Crease pattern')}
            value={block.pattern.value}
            disabled={readOnly}
            options={options(
              block.pattern,
              t('panels:diagram.pagePane.titleBlock.autoNoneLinked', 'Auto (none linked)'),
              (number) =>
                t('panels:diagram.pagePane.titleBlock.stepNotLinked', 'Step {{number}} (not linked)', { number })
            )}
            onChange={block.setPattern}
          />
          <TextAreaRow
            // One field per diagram: a draft never carries over to the one that replaces it.
            key={block.loadId}
            label={t('panels:diagram.pagePane.titleBlock.byline', 'Byline')}
            help={t(
              'panels:diagram.pagePane.titleBlock.bylineHelp',
              'Credits under the title, as you write them. Up to {{lines}} lines print; a long line wraps onto the next.',
              { lines: TITLE_BLOCK_BYLINE_LINES }
            )}
            value={block.byline}
            placeholder={t('panels:diagram.pagePane.titleBlock.bylinePlaceholder', 'Design: …\nPaper: 60 cm square')}
            rows={4}
            disabled={readOnly}
            onCommit={block.setByline}
          />
        </>
      )}
    </CollapsibleSection>
  );
}
