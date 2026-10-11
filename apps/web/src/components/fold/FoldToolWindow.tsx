import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import type { FoldKeyLabel, FoldKind, FoldShortcutId } from '../../fold/tools/foldToolCatalog';
import type { FoldToolWindowModel } from '../../fold/tools/foldToolWindow';
import { STORAGE_KEYS } from '../../lib/storage';
import { useIsPhoneLayout } from '../../platform/phoneLayout';
import { Button } from '../ui/Button';
import { FieldRow } from '../ui/fieldRows/FieldRow';
import { NumberRow } from '../ui/fieldRows/NumberRow';
import { SegmentedRow } from '../ui/fieldRows/SegmentedRow';
import { SelectRow } from '../ui/fieldRows/SelectRow';
import { TextRow } from '../ui/fieldRows/TextRow';
import { SegmentedControl } from '../ui/SegmentedControl';
import { ToolHintInstructions } from '../ui/tools/ToolHintInstructions';
import { ToolHintWindow } from '../ui/tools/ToolHintWindow';
import { FoldCrossSectionPicker } from './FoldCrossSectionPicker';
import { FoldFlapChips } from './FoldFlapChips';
import { FoldKindMark } from './FoldKindMark';
import { FoldRefusalNotice } from './FoldRefusalNotice';
import { FoldChoiceStepperRow, FoldReverseChoices, FoldReverseKindControl } from './reverse/FoldReverseControls';
import { hasVertexChoices } from '../../fold/tools/vertex/vertexToolWindow';
import { FoldVertexChoices, FoldVertexDirection } from './vertex/FoldVertexControls';
import styles from './FoldToolWindow.module.css';

/**
 * The Fold canvas's tool window: the app's window chrome (`ToolHintWindow`)
 * with what the tool in hand has to say inside it — how to locate the line and
 * the line mode while it is being located; then the fold's kind, the moving
 * side, the layers at the line, a refusal with its fixes, and Cancel / commit.
 *
 * One renderer for every Fold tool. What a tool shows is its model, built in
 * `fold/tools/foldToolWindow.ts`; nothing here knows which tool it draws.
 * Enter and Escape reach the commit and the cancel through the workspace's
 * keys, not these buttons; the buttons name those keys in their titles.
 *
 * Mounted outside any element with a context-menu handler: the window is
 * portaled, and portal events still bubble through React (`ToolHintWindow`).
 *
 * On a phone it starts collapsed to its title bar, so the paper stays in view
 * while points are picked, and opens by itself while a fold waits to be
 * decided and committed; a tap on the bar opens or closes it.
 */
export function FoldToolWindow({
  container,
  model,
  keyLabel,
  onFrame,
}: {
  /** The viewport cell the window anchors to. */
  container: HTMLElement | null;
  model: FoldToolWindowModel | null;
  /** The label of a Fold key; without it the buttons name none. */
  keyLabel?: FoldKeyLabel;
  /** The window's frame, as it mounts and goes: what a phone's pane fits its paper above (`useFoldWindowInset`). */
  onFrame?: (frame: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhoneLayout();
  if (!model) return null;
  const titled = (label: string, shortcut: FoldShortcutId) => {
    const key = keyLabel?.(shortcut);
    return key ? `${label} (${key})` : label;
  };
  const { instructions, lineMode, secondLine, kind, movingSide, layers, refusal, divide, compound, tuck, vertex, footer } =
    model;

  return (
    <ToolHintWindow
      container={container}
      collapseKey={STORAGE_KEYS.foldToolHintCollapsed}
      title={model.title}
      meta={model.meta}
      ariaLabel={t('tools:fold.window.label', 'Fold tool options')}
      // A phone's pane is the paper the tool picks points on: the open window
      // would cover it, so it starts as its title bar, and opens by itself
      // once there is a fold to decide and commit.
      startsCollapsed={phone}
      needsAttention={phone && model.phase === 'preview'}
      // Open, it keeps to a third of a phone's height, so the fold it
      // previews stays in view above it.
      height={phone ? 'capped' : 'default'}
      onFrame={onFrame}
    >
      <div className={styles.section}>
        <ToolHintInstructions
          heading={instructions.heading}
          items={instructions.items}
          ordered
          current={instructions.current}
        />
        {instructions.notes.map((note) => (
          <p key={note} className={styles.note}>
            {note}
          </p>
        ))}
      </div>
      {/* No dividers: the window divides its own sections. */}
      {divide && (
        <div className={styles.section} data-fold-divide="">
          <SegmentedRow
            label={divide.mode.label}
            value={divide.mode.value}
            options={divide.mode.options}
            disabled={divide.disabled}
            onChange={(mode) => divide.mode.set(mode === 'ratio' ? 'ratio' : 'count')}
          />
          {divide.parts && (
            <NumberRow
              label={divide.parts.label}
              value={divide.parts.value}
              min={divide.parts.min}
              max={divide.parts.max}
              step={1}
              disabled={divide.disabled}
              onCommit={divide.parts.set}
            />
          )}
          {divide.ratio && (
            <>
              <TextRow
                label={divide.ratio.left.label}
                value={divide.ratio.left.value}
                disabled={divide.disabled}
                onCommit={divide.ratio.left.set}
              />
              <TextRow
                label={divide.ratio.right.label}
                value={divide.ratio.right.value}
                disabled={divide.disabled}
                onCommit={divide.ratio.right.set}
              />
              <p className={styles.note}>{divide.ratio.readout}</p>
            </>
          )}
          <Button size="sm" variant="secondary" disabled={divide.clear.disabled} onClick={divide.clear.run}>
            {divide.clear.label}
          </Button>
        </div>
      )}
      {lineMode && (
        <div className={styles.section}>
          <SelectRow
            label={lineMode.label}
            value={lineMode.value}
            options={lineMode.options}
            disabled={lineMode.disabled}
            divider={false}
            onChange={lineMode.set}
          />
          {/* A crimp's second line, located after the first: a select as the first's is, the names too long for a segment. */}
          {secondLine && (
            <SelectRow
              label={secondLine.label}
              value={secondLine.value}
              options={secondLine.options}
              disabled={secondLine.disabled}
              divider={false}
              onChange={secondLine.set}
            />
          )}
        </div>
      )}
      {kind && (
        <div className={styles.section}>
          <FieldRow label={kind.label} kind="segmented" divider={false} disabled={kind.disabled}>
            <SegmentedControl<FoldKind>
              size="sm"
              iconsOnly
              aria-label={kind.label}
              value={kind.value}
              disabled={kind.disabled}
              options={kind.options.map((option) => ({
                value: option.value,
                label: option.label,
                icon: <FoldKindMark kind={option.value} />,
                // A letter names nothing to someone who has not met it.
                tooltip: option.label,
              }))}
              onChange={kind.set}
            />
          </FieldRow>
        </div>
      )}
      {compound && (
        <div className={styles.section} data-fold-reverse-kind="">
          <FoldReverseKindControl controls={compound} />
        </div>
      )}
      {vertex && (
        <div className={styles.section} data-fold-vertex="">
          <FoldVertexDirection controls={vertex} />
        </div>
      )}
      {vertex && hasVertexChoices(vertex) && (
        <div className={styles.section} data-fold-choices="">
          <FoldVertexChoices controls={vertex} />
        </div>
      )}
      {movingSide && (
        <div className={styles.section}>
          <FieldRow label={movingSide.label} kind="static" divider={false} disabled={movingSide.disabled}>
            <Button
              size="sm"
              variant="secondary"
              title={titled(movingSide.swapLabel, movingSide.shortcut)}
              disabled={movingSide.disabled}
              onClick={movingSide.swap}
            >
              <ArrowLeftRight size={13} aria-hidden="true" />
              {movingSide.swapLabel}
            </Button>
          </FieldRow>
        </div>
      )}
      {layers && (
        <div className={styles.section} data-fold-layers="">
          <div className={styles.layersHeader}>
            <span className={styles.heading}>{layers.title}</span>
            {layers.summary && <span className={styles.summary}>{layers.summary}</span>}
          </div>
          {layers.picker ? (
            <FoldCrossSectionPicker
              model={layers.picker}
              disabled={layers.disabled}
              onToggle={layers.toggle}
              onHover={layers.hover}
            />
          ) : (
            <p className={styles.note} role="status">
              {layers.finding}
            </p>
          )}
          {layers.picker && <p className={styles.note}>{layers.help}</p>}
          <FoldFlapChips
            chips={layers.chips}
            disabled={layers.disabled}
            onToggle={layers.toggle}
            onHover={layers.hover}
          />
        </div>
      )}
      {compound && (compound.opening || compound.order) && (
        <div className={styles.section} data-fold-choices="">
          <FoldReverseChoices controls={compound} />
        </div>
      )}
      {/* A tuck's layers to tuck against, which the folded paper lights, and its order. */}
      {tuck && (tuck.note || tuck.target || tuck.order) && (
        <div className={styles.section} data-fold-tuck="">
          {tuck.note && <p className={styles.note}>{tuck.note}</p>}
          {tuck.target && <FoldChoiceStepperRow stepper={tuck.target} />}
          {tuck.order && <FoldChoiceStepperRow stepper={tuck.order} />}
        </div>
      )}
      {refusal && (
        <div className={styles.section}>
          <FoldRefusalNotice notice={refusal} />
        </div>
      )}
      {footer && (
        <div className={styles.section} data-footer="">
          <div className={styles.footer}>
            <Button
              size="sm"
              variant="secondary"
              title={titled(footer.cancel.label, footer.cancel.shortcut)}
              disabled={footer.cancel.disabled}
              onClick={footer.cancel.run}
            >
              {footer.cancel.label}
            </Button>
            <Button
              size="sm"
              variant="primary"
              title={titled(footer.commit.label, footer.commit.shortcut)}
              disabled={footer.commit.disabled}
              onClick={footer.commit.run}
            >
              {footer.commit.label}
            </Button>
          </div>
        </div>
      )}
    </ToolHintWindow>
  );
}
