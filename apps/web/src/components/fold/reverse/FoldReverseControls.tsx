import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FoldReverseKind } from '../../../fold/engine/foldEngineReverseWire';
import type { FoldChoiceStepper, FoldReverseControls } from '../../../fold/tools/reverse/reverseToolWindow';
import { Button } from '../../ui/Button';
import { FieldRow } from '../../ui/fieldRows/FieldRow';
import { SegmentedControl } from '../../ui/SegmentedControl';
import styles from './FoldReverseControls.module.css';

/**
 * The reverse fold's kind in the Fold tool window (`reverseToolWindow`):
 * Inside and Outside, the one that does not fit disabled with why in its
 * tooltip, and a line saying what fits here.
 */
export function FoldReverseKindControl({ controls }: { controls: FoldReverseControls }) {
  const { kind } = controls;
  return (
    <>
      <FieldRow label={kind.label} kind="segmented" divider={false} disabled={kind.disabled}>
        <SegmentedControl<FoldReverseKind>
          size="sm"
          aria-label={kind.label}
          value={kind.value}
          disabled={kind.disabled}
          options={kind.options.map((option) => ({
            value: option.value,
            label: option.short,
            disabled: option.disabled,
            tooltip: option.reason ? `${option.label} - ${option.reason}` : option.label,
          }))}
          onChange={kind.set}
        />
      </FieldRow>
      {kind.note && <p className={styles.note}>{kind.note}</p>}
    </>
  );
}

/** A listed choice the folder steps through (`choiceStepper`): every compound tool's, the vertex folds' too. */
export function FoldChoiceStepperRow({ stepper }: { stepper: FoldChoiceStepper }) {
  return (
    <FieldRow label={stepper.label} kind="static" divider={false}>
      <span className={styles.stepper} data-fold-choice={stepper.label}>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${stepper.label}: ${stepper.previous.label}`}
          title={stepper.previous.label}
          disabled={stepper.previous.disabled}
          onClick={stepper.previous.run}
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </Button>
        <span className={styles.value} aria-live="polite">
          {stepper.value}
        </span>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`${stepper.label}: ${stepper.next.label}`}
          title={stepper.next.label}
          disabled={stepper.next.disabled}
          onClick={stepper.next.run}
        >
          <ChevronRight size={13} aria-hidden="true" />
        </Button>
      </span>
    </FieldRow>
  );
}

/** The ways the tip opens and the layer orders it leaves, each a stepper, when there is a choice to make. */
export function FoldReverseChoices({ controls }: { controls: FoldReverseControls }) {
  if (!controls.opening && !controls.order) return null;
  return (
    <>
      {controls.opening && <FoldChoiceStepperRow stepper={controls.opening} />}
      {controls.order && <FoldChoiceStepperRow stepper={controls.order} />}
    </>
  );
}
