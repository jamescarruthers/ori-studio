import { useTranslation } from 'react-i18next';
import type { TitleBlockPartChoices } from '../../diagram/pages/titleBlockChoices';
import { TITLE_BLOCK_BYLINE_LINES } from '../../diagram/pages/titleBlockGeometry';
import { useDiagramTitleBlock } from '../../diagram/pages/useDiagramTitleBlock';
import { SelectRow, TextAreaRow, ToggleRow, type SelectRowOption } from '../ui/fieldRows';

/**
 * The first page's title block, as rows the Page pane's Header & footer opens
 * with (`implementation-plans/diagram-title-block.md`, Phase 1c, H-16 A): the
 * toggle and, a step in under it while the page has a block, what the block
 * shows — the finished model and the crease pattern, each Auto (named by the
 * step it finds), a step, or None, and the byline under the title. Bound by
 * `useDiagramTitleBlock`, which offers only what the block can show.
 */
export function DiagramTitleBlockRows() {
  const { t } = useTranslation();
  const block = useDiagramTitleBlock();
  const { readOnly } = block;
  const step = (number: number) => t('panels:diagram.pagePane.titleBlock.step', 'Step {{number}}', { number });
  const auto = (number: number) => t('panels:diagram.pagePane.titleBlock.auto', 'Auto (step {{number}})', { number });
  const none = t('panels:diagram.pagePane.titleBlock.none', 'None');
  /** Auto, each step offered, and None. */
  const options = (part: TitleBlockPartChoices, autoNone: string): SelectRowOption[] => [
    { id: 'auto', label: part.autoNumber === null ? autoNone : auto(part.autoNumber) },
    ...part.steps.map((each) => ({ id: each.choice, label: step(each.number) })),
    { id: 'none', label: none },
  ];
  /** Why the step a part is set to shows nothing, as `cannot` says it for its number: on the row's note line, whole. */
  const reason = (part: TitleBlockPartChoices, cannot: (number: number) => string) => {
    const chosen = part.steps.find((each) => each.choice === part.value);
    return chosen && !chosen.gives ? cannot(chosen.number) : undefined;
  };
  return (
    <>
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
            help={t(
              'panels:diagram.pagePane.titleBlock.modelHelp',
              'The finished model, drawn from a step’s picture. Auto uses the last step with one.'
            )}
            note={reason(block.model, (number) =>
              t('panels:diagram.pages.titleBlock.stepNoPicture', 'Step {{number}} has no picture yet', { number })
            )}
            nested
            value={block.model.value}
            disabled={readOnly}
            options={options(block.model, t('panels:diagram.pagePane.titleBlock.autoNoPicture', 'Auto (no pictures)'))}
            onChange={block.setModel}
          />
          <SelectRow
            label={t('panels:diagram.pagePane.titleBlock.pattern', 'Crease pattern')}
            help={t(
              'panels:diagram.pagePane.titleBlock.patternHelp',
              'Drawn from the crease pattern a step links. Auto uses the last linked step; each pattern is listed once, by the step chosen for it or else the last step that links it.'
            )}
            note={reason(block.pattern, (number) =>
              t('panels:diagram.pages.titleBlock.stepNoPattern', 'Step {{number}} has no crease pattern', { number })
            )}
            nested
            value={block.pattern.value}
            disabled={readOnly}
            options={options(block.pattern, t('panels:diagram.pagePane.titleBlock.autoNoneLinked', 'Auto (none linked)'))}
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
            nested
            value={block.note}
            placeholder={t('panels:diagram.pagePane.titleBlock.bylinePlaceholder', 'Design: …\nPaper: 60 cm square')}
            rows={4}
            disabled={readOnly}
            onCommit={block.setNote}
          />
        </>
      )}
    </>
  );
}
