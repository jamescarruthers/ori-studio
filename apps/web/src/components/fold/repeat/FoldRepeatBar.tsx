import { FoldOrderChooser } from '../orders/FoldOrderChooser';
import { useState } from 'react';
import { FoldRepeatAxis } from './FoldRepeatAxis';
import { useTranslation } from 'react-i18next';
import { useFoldRepeatUi, type FoldRepeatOpening } from '../../../fold/repeat/foldRepeatUi';
import { useFoldRepeat } from '../../../fold/repeat/useFoldRepeat';
import { repeatAxisName, repeatFailure } from '../../../fold/repeat/repeatWords';
import { foldReturnEntryLabel } from '../../../fold/return/foldReturnWords';
import type { FoldScene } from '../../../fold/engine/foldEngineWire';
import type { FoldModelLine } from '../../../fold/document/foldSequenceDocument';
import { Toggle } from '../../ui/Toggle';
import { Button } from '../../ui/Button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../ui/Select';
import styles from './FoldRepeat.module.css';

function AxisPicture({ scene, axis }: { scene: FoldScene; axis?: FoldModelLine }) {
  const points = scene.faces.flatMap((f) => f.outline);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(...xs) - x,
    h = Math.max(...ys) - y;
  const pad = Math.max(w, h) * 0.1,
    size = Math.hypot(w, h);
  return (
    <svg
      className={styles.picture}
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
            x1={axis.n[0] * axis.d - axis.n[1] * size}
            y1={axis.n[1] * axis.d + axis.n[0] * size}
            x2={axis.n[0] * axis.d + axis.n[1] * size}
            y2={axis.n[1] * axis.d - axis.n[0] * size}
          />
        )}
      </g>
    </svg>
  );
}
function Picker({ opening }: { opening: FoldRepeatOpening }) {
  const { t } = useTranslation();
  const [locating, setLocating] = useState(false);
  const m = useFoldRepeat(opening, locating);
  const blocked = m.result?.status === 'blocked' ? m.result : null;
  const choice = m.result?.status === 'choice' ? m.result : null;
  // What a refusal's advice may offer: another axis, and a range starting after the operation that stopped.
  const otherAxis = m.axes.length > 1;
  return (
    <section className={styles.bar} aria-label={t('panels:fold.repeat.title', 'Repeat on the other side')}>
      {m.baseline && <AxisPicture scene={m.baseline} axis={m.axes[m.axis]?.display} />}
      <div className={styles.setup}>
        <strong>{t('panels:fold.repeat.title', 'Repeat on the other side')}</strong>
        <div className={styles.row}>
          <span>{t('panels:fold.repeat.from', 'Start with')}</span>
          <Select value={m.first} onValueChange={m.setFirst} disabled={m.busy}>
            <SelectTrigger
              className={styles.select}
              aria-label={t('panels:fold.repeat.first', 'First source step')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {m.candidates.map((e) => (
                <SelectItem key={e.id} value={e.id!} disabled={!e.session.state}>
                  {foldReturnEntryLabel(t, e, m.candidates)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={m.axis < 0 ? '' : String(m.axis)}
            onValueChange={(v) => m.setAxis(Number(v))}
            disabled={m.busy}
          >
            <SelectTrigger
              className={styles.select}
              aria-label={t('panels:fold.repeat.axis', 'Symmetry axis')}
            >
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
          <Button size="sm" disabled={!m.baseline || m.busy} onClick={() => setLocating(!locating)}>
            {t('panels:fold.repeat.locate', 'Locate axis')}
          </Button>
        </div>
        {locating && m.baseline && m.base && (
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
        )}
        {!opening.rebuild && (
          <label className={styles.row}>
            <Toggle checked={m.individual} disabled={m.busy} onChange={m.setIndividual} />
            {t('panels:fold.repeat.individual', 'Show as individual steps')}
          </label>
        )}
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
        {/* A preparation under way speaks over the last one's block, which it is about to replace. */}
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
        <div className={styles.row}>
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
        </div>
      </div>
    </section>
  );
}
export function FoldRepeatBar() {
  const opening = useFoldRepeatUi((s) => s.opening);
  return opening ? <Picker key={opening.id} opening={opening} /> : null;
}
