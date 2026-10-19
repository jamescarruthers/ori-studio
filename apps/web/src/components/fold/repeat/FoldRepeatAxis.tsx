import type { FoldMarkPoint } from '../../../fold/canvas/foldPicking';
import { useTranslation } from 'react-i18next';
import type { FoldEngineStateHandle } from '../../../fold/engine/foldEnginePort';
import type { FoldScene } from '../../../fold/engine/foldEngineWire';
import { useRepeatAxis } from '../../../fold/repeat/useRepeatAxis';
import type { RepeatSymmetry } from '../../../fold/repeat/repeatGeometry';
import {
  FOLD_LINE_MODES,
  isFoldLineMode,
  lineModeLabel,
  lineModeSteps,
} from '../../../fold/tools/foldToolCatalog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../ui/Select';
import { Button } from '../../ui/Button';
import styles from './FoldRepeat.module.css';

export function FoldRepeatAxis({
  scene,
  state,
  axes,
  marks,
  accept,
}: {
  scene: FoldScene;
  state: FoldEngineStateHandle;
  axes: readonly RepeatSymmetry[];
  marks: readonly FoldMarkPoint[];
  accept: (axis: number) => void;
}) {
  const { t } = useTranslation();
  const m = useRepeatAxis(scene, state, axes, marks, accept);
  const points = scene.faces.flatMap((f) => f.outline);
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(...xs) - x,
    h = Math.max(...ys) - y;
  const pad = Math.max(w, h) * 0.12,
    extent = Math.hypot(w, h);
  const eventPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget,
      inverse = svg.getScreenCTM()?.inverse();
    if (!inverse) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    return { point: { x: p.x, y: -p.y }, radius: 10 * Math.hypot(inverse.a, inverse.b) };
  };
  const highlights = [...m.picks, ...(m.hover ? [m.hover] : [])];
  const axis = m.line;
  return (
    <div className={styles.axisPicker}>
      <div className={styles.setup}>
        <Select
          value={m.mode}
          onValueChange={(v) => {
            if (isFoldLineMode(v)) m.selectMode(v);
          }}
        >
          <SelectTrigger aria-label={t('panels:fold.repeat.locate', 'Locate axis')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLD_LINE_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {lineModeLabel(t, mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className={styles.message}>
          {lineModeSteps(t, m.mode)[m.picks.length] ??
            t('panels:fold.repeat.axisLocated', 'Axis located. Review the line below.')}
        </p>
        <svg
          className={styles.axisCanvas}
          viewBox={`${x - pad} ${-y - h - pad} ${w + 2 * pad} ${h + 2 * pad}`}
          role="img"
          aria-label={t('panels:fold.repeat.axisCanvas', 'Locate symmetry axis on the starting model')}
          onPointerMove={(e) => {
            const p = eventPoint(e);
            if (p) m.move(p.point, p.radius, e.altKey);
          }}
          onPointerDown={(e) => {
            const p = eventPoint(e);
            if (p) m.click(p.point, p.radius, e.altKey);
          }}
        >
          <g transform="scale(1,-1)">
            {scene.faces.map((f, i) => (
              <polygon
                key={i}
                className={styles.paper}
                points={f.outline.map((p) => `${p.x},${p.y}`).join(' ')}
              />
            ))}
            {highlights.map((pick, i) =>
              pick.kind === 'segment' ? (
                <line
                  key={i}
                  className={styles.axis}
                  x1={pick.scene[0].x}
                  y1={pick.scene[0].y}
                  x2={pick.scene[1].x}
                  y2={pick.scene[1].y}
                />
              ) : pick.scene ? (
                <circle
                  key={i}
                  className={styles.point}
                  cx={pick.scene.x}
                  cy={pick.scene.y}
                  r={extent / 100}
                />
              ) : null,
            )}
            {axis && (
              <line
                className={styles.axis}
                x1={axis.n[0] * axis.d - axis.n[1] * extent}
                y1={axis.n[1] * axis.d + axis.n[0] * extent}
                x2={axis.n[0] * axis.d + axis.n[1] * extent}
                y2={axis.n[1] * axis.d - axis.n[0] * extent}
              />
            )}
          </g>
        </svg>
        {m.roots.length > 1 && (
          <div className={styles.row}>
            <Button size="sm" onClick={() => m.setRoot((m.root + m.roots.length - 1) % m.roots.length)}>
              ‹
            </Button>
            <span>
              {t('panels:fold.repeat.orderCount', '{{number}} of {{count}}', {
                number: m.root + 1,
                count: m.roots.length,
              })}
            </span>
            <Button size="sm" onClick={() => m.setRoot((m.root + 1) % m.roots.length)}>
              ›
            </Button>
          </div>
        )}
        {m.complete && m.line && m.match < 0 && (
          <p className={styles.message}>
            {t(
              'panels:fold.repeat.invalidAxis',
              'This line does not pair matching material and layers in the starting model.',
            )}
          </p>
        )}
        <div className={styles.row}>
          <Button size="sm" variant="primary" disabled={m.match < 0} onClick={() => accept(m.match)}>
            {t('panels:fold.repeat.useAxis', 'Use axis')}
          </Button>
          <Button size="sm" onClick={m.clear}>
            {t('panels:fold.repeat.clearPicks', 'Clear picks')}
          </Button>
        </div>
      </div>
    </div>
  );
}
