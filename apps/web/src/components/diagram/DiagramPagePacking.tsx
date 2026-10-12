import { useTranslation } from 'react-i18next';
import type { DiagramPageSetting } from '../../analytics';
import {
  DEFAULT_FLOW_PACKING,
  FLOW_WEIGHT_RANGE,
  type DiagramFlowBands,
  type DiagramPageSetup,
} from '../../diagram/document/diagramDocument';
import { useDiagramPageActions } from '../../diagram/pages/useDiagramPageActions';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { SegmentedRow, SliderRow, ToggleRow } from '../ui/fieldRows';
import styles from './DiagramPagePacking.module.css';

const BANDS: readonly DiagramFlowBands[] = ['auto', 2, 3, 4, 5];

/** The weights move in twentieths, as the prototype's sliders did. */
const WEIGHT_STEP = 0.05;

type FlowWeight = 'flowPreferBands' | 'flowNesting' | 'flowSteadiness';

/**
 * The Page pane's Packing section (`implementation-plans/diagram-flow-packing.md`,
 * Decision 7), the flow's alone: how its pages are packed — Bands, Prefer three
 * bands while Bands is Auto, Steps in bends, Nesting and Scale steadiness —
 * and the way to pack them again, the current page (`useCurrentDiagramPage`)
 * or every one. A setting changes every page's structure, so every page is
 * packed again as it lands; a slider hands its value over where it is let go,
 * so a drag packs them once.
 */
export function DiagramPagePacking({
  page,
  readOnly,
  setPage,
}: {
  page: DiagramPageSetup;
  readOnly: boolean;
  /** One page-setup change: one undo step, and one count of `setting`. */
  setPage: (patch: Partial<DiagramPageSetup>, setting: DiagramPageSetting) => void;
}) {
  const { t, i18n } = useTranslation();
  const { repackPage, repackAll } = useDiagramPageActions('page_pane');
  const weight = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
  const weightRow = (key: FlowWeight, setting: DiagramPageSetting, label: string, help: string, nested = false) => (
    <SliderRow
      label={label}
      help={help}
      nested={nested}
      value={page[key]}
      min={FLOW_WEIGHT_RANGE.min}
      max={FLOW_WEIGHT_RANGE.max}
      step={WEIGHT_STEP}
      format={weight}
      disabled={readOnly}
      onCommit={(value) => setPage({ [key]: value }, setting)}
      onReset={
        page[key] !== DEFAULT_FLOW_PACKING[key]
          ? () => setPage({ [key]: DEFAULT_FLOW_PACKING[key] }, setting)
          : undefined
      }
    />
  );
  return (
    <CollapsibleSection title={t('panels:diagram.packing.title', 'Packing')}>
      <SegmentedRow
        label={t('panels:diagram.packing.bands', 'Bands')}
        help={t(
          'panels:diagram.packing.bandsHelp',
          'How many times the path crosses a page. Auto tries each count and keeps the one that prints the steps largest.'
        )}
        value={String(page.flowBands)}
        disabled={readOnly}
        options={BANDS.map((bands) => ({
          id: String(bands),
          label: bands === 'auto' ? t('panels:diagram.packing.bandsAuto', 'Auto') : String(bands),
        }))}
        onChange={(id) => setPage({ flowBands: id === 'auto' ? 'auto' : (Number(id) as DiagramFlowBands) }, 'flow_bands')}
      />
      {page.flowBands === 'auto' &&
        weightRow(
          'flowPreferBands',
          'flow_prefer_bands',
          t('panels:diagram.packing.preferBands', 'Prefer three bands'),
          t(
            'panels:diagram.packing.preferBandsHelp',
            'How strongly Auto keeps to three bands where another count would print the steps a little larger.'
          ),
          true
        )}
      <ToggleRow
        label={t('panels:diagram.packing.bendSteps', 'Steps in bends')}
        help={t(
          'panels:diagram.packing.bendStepsHelp',
          'Let a step stand at the page’s edge, where the path turns from one band into the next, when that packs the page better.'
        )}
        checked={page.flowBendSteps}
        disabled={readOnly}
        onChange={(flowBendSteps) => setPage({ flowBendSteps }, 'flow_bend_steps')}
      />
      {weightRow(
        'flowNesting',
        'flow_nesting',
        t('panels:diagram.packing.nesting', 'Nesting'),
        t(
          'panels:diagram.packing.nestingHelp',
          'How far the steps in a band rise and drop in turn, so that a tall step and a short one beside it fit together.'
        )
      )}
      {weightRow(
        'flowSteadiness',
        'flow_steadiness',
        t('panels:diagram.packing.steadiness', 'Scale steadiness'),
        t(
          'panels:diagram.packing.steadinessHelp',
          'How closely each page keeps to the size the page before it prints its steps at. Higher keeps the steps one size from page to page; lower lets each page fill itself.'
        )
      )}
      <div className={styles.actions}>
        {[repackPage, repackAll].map(
          (action) =>
            action && (
              <Button
                key={action.id}
                size="sm"
                disabled={action.disabled}
                title={action.hint}
                onClick={action.run}
              >
                {action.label}
              </Button>
            )
        )}
      </div>
    </CollapsibleSection>
  );
}
