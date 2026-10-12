import { Undo2 } from 'lucide-react';
import type { FoldDirection } from '../../../fold/document/foldSequenceDocument';
import type { FoldVertexControls } from '../../../fold/tools/vertex/vertexToolWindow';
import { Button } from '../../ui/Button';
import { FieldRow } from '../../ui/fieldRows/FieldRow';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { FoldChoiceStepperRow } from '../reverse/FoldReverseControls';
import styles from './FoldVertexControls.module.css';

/**
 * A vertex fold's direction in the Fold tool window (`vertexToolWindow`):
 * Valley and Mountain, each saying in its tooltip which way the paper turns,
 * and under them what the fold needs of the paper — its precondition, said
 * up front — unless the window's instructions already say it above the steps.
 */
export function FoldVertexDirection({ controls }: { controls: FoldVertexControls }) {
  const { direction } = controls;
  return (
    <>
      <FieldRow label={direction.label} kind="segmented" divider={false} disabled={direction.disabled}>
        <SegmentedControl<FoldDirection>
          size="sm"
          aria-label={direction.label}
          value={direction.value}
          disabled={direction.disabled}
          options={direction.options.map((option) => ({
            value: option.value,
            label: option.label,
            tooltip: option.tooltip,
          }))}
          onChange={direction.set}
        />
      </FieldRow>
      {controls.note && (
        <p className={styles.note} data-fold-vertex-note="">
          {controls.note}
        </p>
      )}
    </>
  );
}

/**
 * A vertex fold's choices: a squash's spine target, a fan's fourth crease
 * and layers, and the layer order — each only when there is a choice to
 * make.
 */
export function FoldVertexChoices({ controls }: { controls: FoldVertexControls }) {
  const { target, emergent, emergentNote, layers, order } = controls;
  return (
    <>
      {target && (
        <>
          <FieldRow label={target.label} kind="static" divider={false}>
            <span className={styles.target}>
              <span className={styles.value} aria-live="polite">
                {target.value}
              </span>
              {target.reset && (
                <Button
                  size="sm"
                  variant="secondary"
                  title={target.reset.label}
                  aria-label={target.reset.label}
                  disabled={target.reset.disabled}
                  onClick={target.reset.run}
                >
                  <Undo2 size={13} aria-hidden="true" />
                </Button>
              )}
            </span>
          </FieldRow>
          <p className={styles.note}>{target.help}</p>
        </>
      )}
      {emergent && <FoldChoiceStepperRow stepper={emergent} />}
      {emergentNote && (
        <p className={styles.note} role="status">
          {emergentNote}
        </p>
      )}
      {layers && <FoldChoiceStepperRow stepper={layers} />}
      {order && <FoldChoiceStepperRow stepper={order} />}
    </>
  );
}
