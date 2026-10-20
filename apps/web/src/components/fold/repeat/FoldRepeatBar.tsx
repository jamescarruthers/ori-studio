import { FoldOrderChooser } from '../orders/FoldOrderChooser';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FoldRepeatAxis } from './FoldRepeatAxis';
import { useTranslation } from 'react-i18next';
import { useFoldRepeatUi, type FoldRepeatOpening } from '../../../fold/repeat/foldRepeatUi';
import { useFoldRepeat } from '../../../fold/repeat/useFoldRepeat';
import { repeatAxisName, repeatFailure } from '../../../fold/repeat/repeatWords';
import { foldReturnEntryLabel } from '../../../fold/return/foldReturnWords';
import type { FoldScene } from '../../../fold/engine/foldEngineWire';
import type { FoldModelLine } from '../../../fold/document/foldSequenceDocument';
import { useIsPhoneLayout } from '../../../platform/phoneLayout';
import { Toggle } from '../../ui/Toggle';
import { Button } from '../../ui/Button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../ui/Select';
import styles from './FoldRepeat.module.css';

/**
 * The model before the range, with the chosen axis across it: the only place
 * the axis is drawn, since the canvas shows the step on screen. A phone shows
 * it as a thumbnail, beside the bar's title.
 */
function AxisPicture({ scene, axis, size }: { scene: FoldScene; axis?: FoldModelLine; size: 'full' | 'thumb' }) {
  const points = scene.faces.flatMap((f) => f.outline);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(...xs) - x,
    h = Math.max(...ys) - y;
  const pad = Math.max(w, h) * 0.1,
    span = Math.hypot(w, h);
  return (
    <svg
      className={styles.picture}
      data-size={size}
      viewBox={`${x - pad} ${-y - h - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      aria-hidden="true"
    >
      <g transform="scale(1,-1)">
        {scene.faces.map((f, i) => (
          <polygon
            key={i}
            className={styles.paper}
            points={f.outline.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}
        {axis && (
          <line
            className={styles.axis}
            x1={axis.n[0] * axis.d - axis.n[1] * span}
            y1={axis.n[1] * axis.d + axis.n[0] * span}
            x2={axis.n[0] * axis.d + axis.n[1] * span}
            y2={axis.n[1] * axis.d - axis.n[0] * span}
          />
        )}
      </g>
    </svg>
  );
}

/**
 * Repeat's setup, over the column. On a phone it keeps to three rows so the
 * canvas keeps the room to show the paper and, once previewed, the repeated
 * folds: the axis picture shrunk to a thumbnail beside the title and the
 * words that say where things stand (a refusal among them); the two choices
 * that make a repeat side by side; then the primary action and Cancel. The
 * rest — Locate axis, showing the steps individually, the count — waits
 * behind Options.
 */
function Picker({ opening }: { opening: FoldRepeatOpening }) {
  const { t } = useTranslation();
  const phone = useIsPhoneLayout();
  const [locating, setLocating] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsId = useId();
  const m = useFoldRepeat(opening, locating);
  const blocked = m.result?.status === 'blocked' ? m.result : null;
  const choice = m.result?.status === 'choice' ? m.result : null;
  // What a refusal's advice may offer: another axis, and a range starting after the operation that stopped.
  const otherAxis = m.axes.length > 1;
  const title = t('panels:fold.repeat.title', 'Repeat on the other side');
  const startWith = t('panels:fold.repeat.from', 'Start with');

  const picture = m.baseline && (
    <AxisPicture scene={m.baseline} axis={m.axes[m.axis]?.display} size={phone ? 'thumb' : 'full'} />
  );
  const firstSelect = (
    <Select value={m.first} onValueChange={m.setFirst} disabled={m.busy}>
      <SelectTrigger className={styles.select} aria-label={t('panels:fold.repeat.first', 'First source step')}>
        {phone ? (
          // No room for the label beside it: it leads the value instead.
          <span className={styles.labelledValue}>
            <span className={styles.fieldLabel}>{startWith}</span> <SelectValue />
          </span>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        {m.candidates.map((e) => (
          <SelectItem key={e.id} value={e.id!} disabled={!e.session.state}>
            {foldReturnEntryLabel(t, e, m.candidates)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const axisSelect = (
    <Select value={m.axis < 0 ? '' : String(m.axis)} onValueChange={(v) => m.setAxis(Number(v))} disabled={m.busy}>
      <SelectTrigger className={styles.select} aria-label={t('panels:fold.repeat.axis', 'Symmetry axis')}>
        <SelectValue placeholder={t('panels:fold.repeat.chooseAxis', 'Choose symmetry axis')} />
      </SelectTrigger>
      <SelectContent>
        {m.axes.map((axis, i) => (
          <SelectItem key={i} value={String(i)}>
            {repeatAxisName(t, axis.display)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const locateButton = (
    <Button size="sm" disabled={!m.baseline || m.busy} onClick={() => setLocating(!locating)}>
      {t('panels:fold.repeat.locate', 'Locate axis')}
    </Button>
  );
  const locator = locating && m.baseline && m.base && (
    <FoldRepeatAxis
      key={m.first}
      scene={m.baseline}
      state={m.base}
      axes={m.axes}
      marks={m.axisMarks}
      accept={(axis) => {
        m.setAxis(axis);
        setLocating(false);
      }}
    />
  );
  const individualToggle = !opening.rebuild && (
    <label className={styles.row}>
      <Toggle checked={m.individual} disabled={m.busy} onChange={m.setIndividual} />
      {t('panels:fold.repeat.individual', 'Show as individual steps')}
    </label>
  );
  const summary = (
    <p className={styles.message}>
      {m.individual
        ? t('panels:fold.repeat.individualCount', {
            count: m.count,
            defaultValue_one: 'Repeat {{count}} operation as an individual entry.',
            defaultValue_other: 'Repeat {{count}} operations through the current step as individual entries.',
          })
        : t('panels:fold.repeat.groupCount', {
            count: m.count,
            defaultValue_one: 'Repeat {{count}} operation as one numbered step.',
            defaultValue_other: 'Repeat {{count}} operations through the current step as one numbered step.',
          })}
    </p>
  );
  // A preparation under way speaks over the last one's block, which it is about to replace.
  const status = (
    <p className={`${styles.message} ${m.error || (blocked && !m.preparing) ? styles.error : ''}`} role="status">
      {m.error
        ? repeatFailure(t, m.error, { otherAxis, laterStart: false })
        : blocked && !m.preparing
          ? t('panels:fold.repeat.blockedAt', 'Stopped at source operation {{number}}: {{reason}}', {
              number: blocked.step + 1,
              reason: repeatFailure(t, blocked, { otherAxis, laterStart: blocked.step < m.count - 1 }),
            })
          : m.busy
            ? t('panels:fold.repeat.preparing', 'Preparing repeated folds…')
            : m.stopped
              ? t('panels:fold.repeat.stopped', 'Stopped before the repeat was ready. No steps were added.')
              : choice
              ? t(
                  'panels:fold.repeat.choiceAt',
                  'Source operation {{number}} has {{count}} matching layer orders. Choose one to continue.',
                  { number: choice.step + 1, count: choice.candidates.length },
                )
              : m.result?.status === 'ready'
                ? t(
                    'panels:fold.repeat.ready',
                    'The final folded result and CP are shown below. Ready to save.',
                  )
                : m.baseline && !m.axes.length
                  ? repeatFailure(t, { code: 'repeat_axis' })
                  : t(
                      'panels:fold.repeat.axisHint',
                      'The axis is shown on the model before the selected range.',
                    )}
    </p>
  );
  const actions = (
    <>
      {choice && m.choice === null && (
        <Button size="sm" onClick={() => void m.cycle(0)}>
          {t('panels:fold.repeat.chooseOrder', 'Choose layer order')}
        </Button>
      )}
      {choice && m.choice !== null && (
        <FoldOrderChooser
          index={m.choice}
          count={choice.candidates.length}
          exact
          ready={!m.busy && !m.error}
          waiting={m.busy}
          error={!!m.error}
          onStep={(delta) => void m.cycle(m.choice! + delta)}
          onBack={m.backFromChoice}
          onAccept={m.acceptChoice}
        />
      )}
      {!choice && m.result?.status !== 'ready' && (m.preparing ? (
        // In Preview repeat's place while the worker prepares; Escape stops it too.
        <Button size="sm" onClick={() => m.stop()}>
          {t('panels:fold.repeat.stop', 'Stop')}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={!m.canPreview} onClick={() => void m.prepare()}>
          {t('panels:fold.repeat.preview', 'Preview repeat')}
        </Button>
      ))}
      {m.result?.status === 'ready' && (
        <Button
          size="sm"
          variant="primary"
          disabled={m.busy || !!m.error}
          onClick={() => void m.commit()}
        >
          {opening.rebuild
            ? t('panels:fold.repeat.update', 'Update from source steps')
            : t('panels:fold.repeat.save', 'Save repeat')}
        </Button>
      )}
      <Button size="sm" onClick={m.close}>
        {t('common:cancel', 'Cancel')}
      </Button>
    </>
  );

  if (phone) {
    return (
      <section className={styles.bar} data-layout="phone" aria-label={title}>
        <div className={styles.head}>
          {picture}
          <div className={styles.headText}>
            <strong className={styles.title}>{title}</strong>
            {status}
          </div>
        </div>
        <div className={styles.fields}>
          {firstSelect}
          {axisSelect}
        </div>
        <div id={optionsId} className={styles.options} hidden={!optionsOpen}>
          {locateButton}
          {locator}
          {individualToggle}
          {summary}
        </div>
        <div className={styles.row}>
          {actions}
          <Button
            size="sm"
            variant="ghost"
            className={styles.optionsToggle}
            aria-expanded={optionsOpen}
            aria-controls={optionsId}
            onClick={() => {
              // Closing the options puts down an axis being located inside them.
              if (optionsOpen) setLocating(false);
              setOptionsOpen(!optionsOpen);
            }}
          >
            {t('panels:fold.repeat.options', 'Options')}
            <ChevronDown size={14} className={styles.chevron} data-open={optionsOpen || undefined} aria-hidden="true" />
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.bar} aria-label={title}>
      {picture}
      <div className={styles.setup}>
        <strong>{title}</strong>
        <div className={styles.row}>
          <span>{startWith}</span>
          {firstSelect}
          {axisSelect}
          {locateButton}
        </div>
        {locator}
        {individualToggle}
        {summary}
        {status}
        <div className={styles.row}>{actions}</div>
      </div>
    </section>
  );
}
export function FoldRepeatBar() {
  const opening = useFoldRepeatUi((s) => s.opening);
  return opening ? <Picker key={opening.id} opening={opening} /> : null;
}
