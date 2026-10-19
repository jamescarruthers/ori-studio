import { AlertTriangle, AlignLeft, Hash, Image, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { outsideMarginTag } from '../../diagram/pages/marginLabels';
import { useDiagramPageActions } from '../../diagram/pages/useDiagramPageActions';
import { usePageLayers, type PageLayerPart, type PageLayerRow } from '../../diagram/pages/usePageLayers';
import { Button } from '../ui/Button';
import { DiagramLayerList, DiagramLayerRow, DiagramLayersHeader } from './DiagramLayerList';
import { DiagramLayersSplit } from './DiagramLayersSplit';
import { DiagramPlacedMark } from './DiagramPlacedMark';
import { DiagramPageStepInspector } from './DiagramPageStepInspector';
import styles from './DiagramPageLayers.module.css';

const PART_ICONS: Readonly<Record<PageLayerPart, LucideIcon>> = { number: Hash, picture: Image, text: AlignLeft };

/**
 * The Layers pane in the Pages view: the steps on the current page as
 * Annotate lists its marks (`usePageLayers`) — under what the list holds, and
 * on a flow page Re-pack Page; a press on one selects it with its whole frame,
 * and its disclosure opens it into its Number, Picture and Text, a press on
 * one of which selects it, as the presses on the page do; its own Delete at
 * its end — and, under the
 * separator, the selection's inspector (`DiagramPageStepInspector`). A step placed
 * by hand, or a part of it past the margin, says so at its row's end
 * (redesign, 2026-10-18).
 */
export function DiagramPageLayers() {
  const { t } = useTranslation();
  const layers = usePageLayers();
  const { repackPage } = useDiagramPageActions('layers_pane');
  const partLabels: Record<PageLayerPart, string> = {
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  const placed = <DiagramPlacedMark />;
  const status = (row: PageLayerRow) =>
    row.moved || row.outsideMargin ? (
      <>
        {row.outsideMargin && (
          <AlertTriangle size={13} className={styles.warning} role="img" aria-label={outsideMarginTag(t)} />
        )}
        {row.moved && placed}
      </>
    ) : null;
  // With no diagram there is no page to name.
  const header = layers.pageName !== null && (
    <DiagramLayersHeader
      title={t('panels:diagram.pages.caption', 'Page {{number}}', { number: layers.pageName })}
      count={t('panels:diagram.layers.stepCount', {
        count: layers.rows.length,
        defaultValue_one: '{{count}} step',
        defaultValue_other: '{{count}} steps',
      })}
      action={
        repackPage && layers.rows.length > 0 ? (
          <Button size="sm" disabled={repackPage.disabled} title={repackPage.hint} onClick={repackPage.run}>
            {repackPage.label}
          </Button>
        ) : null
      }
    />
  );
  const list = (
    <DiagramLayerList
      label={t('panels:diagram.layers.pageList', 'Steps on page {{number}}', { number: layers.pageName })}
      empty={layers.rows.length === 0 ? t('panels:diagram.layers.pageEmpty', 'No steps on this page.') : null}
    >
      {layers.rows.map((row) => (
        <li key={row.step.id}>
          <DiagramLayerRow
            glyph={<span className={styles.number}>{row.number}</span>}
            name={row.text || t('panels:diagram.pages.step', 'Step {{number}}', { number: row.number })}
            status={status(row)}
            pressed={row.pressed}
            holdsSelection={row.holdsSelection}
            disclosure={
              row.parts
                ? {
                    expanded: row.open,
                    label: t('panels:diagram.layers.parts', 'Parts of step {{number}}', { number: row.number }),
                    onToggle: () => layers.toggleParts(row.step.id),
                  }
                : 'space'
            }
            remove={
              layers.canDelete
                ? {
                    label: t('panels:diagram.layers.deleteStep', 'Delete step {{number}}', { number: row.number }),
                    onRemove: () => layers.deleteStep(row.step.id),
                  }
                : undefined
            }
            onPress={() => layers.selectStep(row.step.id)}
            data={{ 'data-layer-step': row.step.id }}
          />
          {row.parts && row.open && (
            <DiagramLayerList
              nested
              label={t('panels:diagram.layers.parts', 'Parts of step {{number}}', { number: row.number })}
            >
              {row.parts.map(({ part, moved, pressed, disabled }) => {
                const Icon = PART_ICONS[part];
                return (
                  <li key={part}>
                    <DiagramLayerRow
                      glyph={<Icon size={16} aria-hidden="true" />}
                      name={partLabels[part]}
                      status={moved ? placed : null}
                      pressed={pressed}
                      disabled={disabled}
                      // No Delete of its own: the room kept, so its mark lines up with its step's.
                      remove={layers.canDelete ? 'space' : undefined}
                      onPress={() => layers.selectPart(row.step.id, part)}
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
  );
  return (
    <DiagramLayersSplit
      header={header}
      list={list}
      inspector={layers.selected ? <DiagramPageStepInspector step={layers.selected} /> : null}
    />
  );
}
