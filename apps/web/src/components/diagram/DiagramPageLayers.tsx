import { AlignLeft, Hash, Image, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clashTag } from '../../diagram/pages/clashLabels';
import { usePageLayers, type PageLayerPart, type PageLayerRow } from '../../diagram/pages/usePageLayers';
import { Badge } from '../ui/Badge';
import { DiagramLayerControls, DiagramLayerList, DiagramLayerRow } from './DiagramLayerList';
import { DiagramStepPlacement } from './DiagramStepPlacement';
import styles from './DiagramPageLayers.module.css';

const PART_ICONS: Readonly<Record<PageLayerPart, LucideIcon>> = { number: Hash, picture: Image, text: AlignLeft };

/**
 * The Layers pane in the Pages view: the steps on the current page as
 * Annotate lists its marks (`usePageLayers`) — a press on one selects it with
 * its whole frame, the selected one opens into its Number, Picture and Text,
 * and a press on one of those selects it, as the presses on the page do — and
 * under the list the selection's placement (`DiagramStepPlacement`).
 */
export function DiagramPageLayers() {
  const { t } = useTranslation();
  const layers = usePageLayers();
  const partLabels: Record<PageLayerPart, string> = {
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  const moved = <Badge tone="neutral">{t('panels:diagram.placement.moved', 'Moved')}</Badge>;
  const badges = (row: PageLayerRow) =>
    row.moved || row.clash ? (
      <>
        {row.moved && moved}
        {row.clash && <Badge tone="neutral">{clashTag(row.clash, t)}</Badge>}
      </>
    ) : null;
  return (
    <div className={styles.layers}>
      <DiagramLayerList
        label={t('panels:diagram.layers.pageList', 'Steps on page {{number}}', { number: layers.pageName })}
        empty={layers.rows.length === 0 ? t('panels:diagram.layers.pageEmpty', 'No steps on this page.') : null}
      >
        {layers.rows.map((row) => (
          <li key={row.step.id}>
            <DiagramLayerRow
              glyph={<span className={styles.number}>{row.number}</span>}
              name={row.text || t('panels:diagram.pages.step', 'Step {{number}}', { number: row.number })}
              badge={badges(row)}
              pressed={row.pressed}
              onPress={() => layers.selectStep(row.step.id)}
              data={{ 'data-layer-step': row.step.id }}
            />
            {row.parts && (
              <DiagramLayerList
                nested
                label={t('panels:diagram.layers.parts', 'Parts of step {{number}}', { number: row.number })}
              >
                {row.parts.map(({ part, moved: partMoved, pressed, disabled }) => {
                  const Icon = PART_ICONS[part];
                  return (
                    <li key={part}>
                      <DiagramLayerRow
                        glyph={<Icon size={17} aria-hidden="true" className={styles.partIcon} />}
                        name={partLabels[part]}
                        badge={partMoved ? moved : null}
                        pressed={pressed}
                        disabled={disabled}
                        onPress={() => layers.selectPart(part)}
                        data={{ 'data-layer-part': part }}
                      />
                    </li>
                  );
                })}
              </DiagramLayerList>
            )}
          </li>
        ))}
      </DiagramLayerList>
      {layers.selected && (
        <DiagramLayerControls>
          <DiagramStepPlacement step={layers.selected} />
        </DiagramLayerControls>
      )}
    </div>
  );
}
