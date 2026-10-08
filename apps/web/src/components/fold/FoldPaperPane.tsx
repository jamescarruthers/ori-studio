import { useState } from 'react';
import { Hexagon, RectangleVertical, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  RECTANGLE_PRESETS,
  REGULAR_SIDES,
  rectanglePresetOf,
  rectangleShape,
  regularSides,
  sameShape,
  shapeOfKind,
  type FoldPaperShape,
  type FoldPaperShapeKind,
  type FoldStartSide,
} from '../../fold/paperShape';
import { usePaperDisplayStyle, type PaperDisplayRow } from '../../lib/paper/usePaperDisplayStyle';
import { useSettingsStore } from '../../store/settingsStore';
import { PaperColorRows } from '../paper/PaperColorRows';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { FieldRow, NumberRow, SegmentedRow, SelectRow } from '../ui/fieldRows';
import { Notice } from '../ui/Notice';
import { SegmentedControl } from '../ui/SegmentedControl';
import styles from './FoldPaperPane.module.css';

/**
 * The display-style rows this tab shows, and so all its reset touches: the
 * paper's two colours. Every pen is Settings ▸ Paper's, reached by the link.
 */
const FOLD_PAPER_ROWS: readonly PaperDisplayRow[] = ['paper.front', 'paper.back'];

/** The Proportions select's entry for a rectangle that is none of the presets. */
const CUSTOM = 'custom';

/**
 * The Paper tab: how the paper looks, and the sheet the sequence starts from
 * (plan D11).
 *
 * The colours are the app's display style, as Simulate's pane edits them
 * (`usePaperDisplayStyle`, counted as `paper style changed` with `source:
 * 'fold'`): a sequence has no colours of its own, and the folded form, the
 * crease pattern and an export all paint from the same style.
 *
 * The sheet is the sequence's document state, so it arrives in props and
 * leaves through callbacks. Which side starts up is labelled Front and Back
 * rather than by colour, because the presets disagree about which face is the
 * coloured one. A new shape starts the sequence over (plan D7): the store
 * replaces the shape and empties the steps as one undoable edit, and the tab
 * says so beforehand rather than asking.
 */
export function FoldPaperPane({
  shape,
  startSide,
  stepCount,
  readOnly = false,
  onShapeChange,
  onStartSideChange,
}: {
  shape: FoldPaperShape;
  startSide: FoldStartSide;
  /** Every step of the sequence, on every branch: what a new shape clears. */
  stepCount: number;
  /** A sequence from a newer build: its sheet cannot change. */
  readOnly?: boolean;
  /** Start over on a new sheet. Called only with a shape that differs from `shape`. */
  onShapeChange: (shape: FoldPaperShape) => void;
  onStartSideChange: (side: FoldStartSide) => void;
}) {
  const { t } = useTranslation();
  const paper = usePaperDisplayStyle('fold', FOLD_PAPER_ROWS);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const change = (next: FoldPaperShape | null) => {
    if (next && !sameShape(next, shape)) onShapeChange(next);
  };

  return (
    <div className={styles.pane}>
      <CollapsibleSection title={t('panels:fold.paper.colors', 'Colors')}>
        <PaperColorRows paper={paper} />
        <div className={styles.styleActions}>
          <Button variant="ghost" size="sm" onClick={() => openSettings('paper')}>
            {t('panels:fold.paper.editStyle', 'Edit paper style…')}
          </Button>
          <Button variant="ghost" size="sm" onClick={paper.reset}>
            {t('panels:fold.paper.resetColors', 'Reset colors')}
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('panels:fold.paper.sheet', 'Sheet')}>
        <SegmentedRow
          label={t('panels:fold.paper.start', 'Start')}
          help={t(
            'panels:fold.paper.startHelp',
            'Which side of the paper faces you before the first fold. The crease pattern is always drawn from the front.'
          )}
          value={startSide}
          disabled={readOnly}
          options={[
            {
              id: 'front',
              label: t('panels:fold.paper.frontUp', 'Front up'),
              icon: <span className={styles.swatch} style={{ background: paper.style.paper.front }} />,
            },
            {
              id: 'back',
              label: t('panels:fold.paper.backUp', 'Back up'),
              icon: <span className={styles.swatch} style={{ background: paper.style.paper.back }} />,
            },
          ]}
          onChange={(side) => {
            if (side === 'front' || side === 'back') onStartSideChange(side);
          }}
        />
        <FieldRow label={t('panels:fold.paper.shape', 'Shape')} kind="segmented" disabled={readOnly}>
          <SegmentedControl<FoldPaperShapeKind>
            size="sm"
            iconsOnly
            aria-label={t('panels:fold.paper.shape', 'Shape')}
            value={shape.shape}
            disabled={readOnly}
            options={[
              { value: 'square', label: t('panels:fold.paper.square', 'Square'), icon: <Square size={14} /> },
              {
                value: 'rectangle',
                label: t('panels:fold.paper.rectangle', 'Rectangle'),
                icon: <RectangleVertical size={14} />,
              },
              { value: 'regular', label: t('panels:fold.paper.polygon', 'Polygon'), icon: <Hexagon size={14} /> },
            ]}
            onChange={(kind) => change(shapeOfKind(kind, shape))}
          />
        </FieldRow>
        {shape.shape === 'rectangle' && (
          <RectangleRows shape={shape} readOnly={readOnly} onChange={change} />
        )}
        {shape.shape === 'regular' && (
          <NumberRow
            label={t('panels:fold.paper.sides', 'Sides')}
            value={shape.sides}
            min={REGULAR_SIDES.min}
            max={REGULAR_SIDES.max}
            step={1}
            normalize={Math.round}
            disabled={readOnly}
            onCommit={(sides) => {
              const whole = regularSides(sides);
              change(whole === null ? null : { shape: 'regular', sides: whole });
            }}
          />
        )}
        {stepCount > 0 && !readOnly && (
          <div className={styles.notice}>
            <Notice tone="warning">
              {t('panels:fold.paper.startsOver', {
                count: stepCount,
                defaultValue_one:
                  'Changing the shape starts over: the sequence’s {{count}} step is cleared. Undo brings it back.',
                defaultValue_other:
                  'Changing the shape starts over: the sequence’s {{count}} steps are cleared. Undo brings them back.',
              })}
            </Notice>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

/**
 * A rectangle's proportions: one of the presets, or Custom with its width and
 * height. A custom pair is kept as typed — 3 and 4 stay 3 and 4 — while it is
 * the shape the sequence has; when the shape changes from elsewhere (an undo),
 * the fields show the new one.
 */
function RectangleRows({
  shape,
  readOnly,
  onChange,
}: {
  shape: Extract<FoldPaperShape, { shape: 'rectangle' }>;
  readOnly: boolean;
  onChange: (shape: FoldPaperShape | null) => void;
}) {
  const { t } = useTranslation();
  const preset = rectanglePresetOf(shape.width, shape.height);
  // Custom was picked while the sheet is still a preset's, to type a new one.
  const [customPicked, setCustomPicked] = useState(false);
  const [typed, setTyped] = useState({ width: shape.width, height: shape.height });
  const typedShape = rectangleShape(typed.width, typed.height);
  const fields = typedShape && sameShape(typedShape, shape) ? typed : { width: shape.width, height: shape.height };
  const custom = preset === null || customPicked;
  const commit = (width: number, height: number) => {
    setTyped({ width, height });
    onChange(rectangleShape(width, height));
  };

  return (
    <>
      <SelectRow
        label={t('panels:fold.paper.proportions', 'Proportions')}
        value={custom ? CUSTOM : preset.id}
        disabled={readOnly}
        options={[
          ...RECTANGLE_PRESETS.map((option) => ({ id: option.id, label: option.label })),
          { id: CUSTOM, label: t('panels:fold.paper.custom', 'Custom') },
        ]}
        onChange={(id) => {
          const picked = RECTANGLE_PRESETS.find((option) => option.id === id);
          setCustomPicked(picked === undefined);
          if (picked) onChange(rectangleShape(picked.width, picked.height));
          else setTyped({ width: shape.width, height: shape.height });
        }}
      />
      {custom && (
        <>
          <NumberRow
            label={t('panels:fold.paper.width', 'Width')}
            value={fields.width}
            min={0.01}
            step={0.1}
            disabled={readOnly}
            onCommit={(width) => commit(width, fields.height)}
          />
          <NumberRow
            label={t('panels:fold.paper.height', 'Height')}
            value={fields.height}
            min={0.01}
            step={0.1}
            disabled={readOnly}
            onCommit={(height) => commit(fields.width, height)}
          />
        </>
      )}
    </>
  );
}
