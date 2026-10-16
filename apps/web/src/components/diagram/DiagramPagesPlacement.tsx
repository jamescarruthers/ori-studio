import { Pin } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { CaptionGrip } from '../../diagram/pages/captionMeasure';
import type { PreparedDiagramPages } from '../../diagram/pages/diagramPages';
import type { LayoutCell, LayoutPage } from '../../diagram/pages/diagramPageLayout';
import { printedFrameMm } from '../../diagram/pages/pagePictures';
import { outsideMarginTag } from '../../diagram/pages/marginLabels';
import { partBox, type PageBox, type PagePart } from '../../diagram/pages/pagePlacement';
import { placementBlocker } from '../../diagram/document/stepPlace';
import { stepById } from '../../diagram/document/diagramDocument';
import type { usePagePlacement } from '../../diagram/pages/usePagePlacement';
import { composedPageUrl } from '../../diagram/pages/useDiagramPages';
import { PAGES_PX_PER_MM } from '../../diagram/pages/usePagesView';
import styles from './DiagramPagesPlacement.module.css';

/**
 * The elements a press on which is a placement's, never the camera's pan.
 * react-zoom-pan-pinch's `panning.excluded` takes class names, not elements
 * or attributes, so the Pages view hands it this module's own (hashed) names:
 * the only module classes exported for another component's use.
 */
export const PAGE_PLACEMENT_PAN_EXCLUDED = [styles.drag, styles.handle];

type Placement = ReturnType<typeof usePagePlacement>;
const mm = (value: number) => value * PAGES_PX_PER_MM;
/**
 * The selected caption's grips (`diagram-caption-resize.md`): the midpoints
 * of its box's left and right edges, which set its width, and of its foot,
 * which sets how many lines it takes.
 */
const CAPTION_GRIPS: readonly { grip: CaptionGrip; at: (box: PageBox) => [number, number] }[] = [
  { grip: 'left', at: (box) => [box.x, box.y + box.h / 2] },
  { grip: 'right', at: (box) => [box.x + box.w, box.y + box.h / 2] },
  { grip: 'bottom', at: (box) => [box.x + box.w / 2, box.y + box.h] },
];
const position = (box: PageBox): CSSProperties => ({
  left: mm(box.x),
  top: mm(box.y),
  width: mm(box.w),
  height: mm(box.h),
});

/** Screen-only selection, grips, home ghosts and the lifted SVG. None enters an export. */
export function DiagramPagesPlacement({
  page,
  index,
  placement,
}: {
  page: LayoutPage;
  index: number;
  placement: Placement;
}) {
  const { t, i18n } = useTranslation();
  // A length in the readout, to a tenth of a mm, as the language writes it: 1.5, or 1,5 in German.
  const tenths = (value: number) =>
    new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const { draft, selected, part } = placement;
  const cell = page.cells.find((c) => c.stepId === selected);
  const document = useWorkspaceStore((s) => s.diagram);
  const step = document && selected ? stepById(document, selected) : null;
  // The draft on this page, lifted whatever is selected; its readouts only on its own step.
  const lifted = draft?.page === index ? draft : null;
  const local = lifted?.cell.stepId === selected ? lifted : null;
  const editable = placement.enabled && step && !placementBlocker(step);
  const chosen = cell && part ? partBox(cell, part) : null;
  const baseCell = local?.cell ?? cell;
  const home = part ? baseCell?.homeParts?.[part] : null;
  const moved = step?.place && part && step.place[part];
  const size = cell && step && document ? printedFrameMm(step, document.assets, document.style, cell) : null;
  const auto = baseCell?.placed?.auto;
  const autoSize =
    baseCell && step && document
      ? printedFrameMm(step, document.assets, document.style, auto ? { ...baseCell, ...auto } : baseCell)
      : null;
  const labels: Record<PagePart, string> = {
    frame: t('panels:diagram.placement.frame', 'Frame'),
    number: t('panels:diagram.placement.number', 'Number'),
    picture: t('panels:diagram.placement.picture', 'Picture'),
    text: t('panels:diagram.placement.text', 'Text'),
  };
  return (
    <>
      {lifted && <LiftedPicture draft={lifted} pages={placement.pages} />}
      {/* The one thing said of a placement: a part past the margin (`markOutsideMargin`). */}
      {page.cells.map(
        (c) =>
          c.outsideMargin && (
            <div
              key={c.stepId}
              className={styles.margin}
              style={position(partBox(c, 'frame'))}
              data-outside-margin={c.stepId}
            >
              <span>{outsideMarginTag(t)}</span>
            </div>
          )
      )}
      {editable && cell && (
        <>
          {(['number', 'picture', 'text'] as const)
            .filter((p) => part !== 'frame' && (p !== 'text' || cell.text.lines.length > 0))
            .map((p) => (
              <div
                key={p}
                data-place-part={p}
                aria-hidden="true"
                className={`${styles.target} ${part === p ? styles.drag : ''}`}
                data-selected={part === p || undefined}
                style={position(partBox(cell, p))}
                onPointerDown={(event) => placement.start(event, index, local?.cell ?? cell, p)}
                onPointerMove={placement.move}
                onPointerUp={placement.end}
                onPointerCancel={placement.cancel}
                onLostPointerCapture={placement.lost}
                onClick={(event) => {
                  event.stopPropagation();
                  useWorkspaceStore.getState().selectDiagramPagesPart(p);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                }}
              />
            ))}
          {chosen && <div className={styles.selection} data-place-selection={part} style={position(chosen)} />}
          {part === 'picture' &&
            chosen &&
            (['left', 'middle', 'right'] as const).map((grip, i) => (
              <div
                key={grip}
                data-place-scale={grip}
                aria-hidden="true"
                className={styles.handle}
                style={{ left: mm(chosen.x + (chosen.w * i) / 2), top: mm(chosen.y + chosen.h) }}
                onPointerDown={(event) => placement.start(event, index, local?.cell ?? cell, 'picture', grip)}
                onPointerMove={placement.move}
                onPointerUp={placement.end}
                onPointerCancel={placement.cancel}
                onLostPointerCapture={placement.lost}
                onClick={(event) => event.stopPropagation()}
              />
            ))}
          {part === 'text' &&
            chosen &&
            CAPTION_GRIPS.map(({ grip, at }) => {
              const [x, y] = at(chosen);
              return (
                <div
                  key={grip}
                  data-place-caption={grip}
                  aria-hidden="true"
                  className={styles.handle}
                  style={{ left: mm(x), top: mm(y) }}
                  onPointerDown={(event) => placement.start(event, index, local?.cell ?? cell, 'text', false, grip)}
                  onPointerMove={placement.move}
                  onPointerUp={placement.end}
                  onPointerCancel={placement.cancel}
                  onLostPointerCapture={placement.lost}
                  onClick={(event) => event.stopPropagation()}
                />
              );
            })}
          {chosen && ((part === 'picture' && step.place?.scale) || (part === 'text' && step.place?.textWidth)) && (
            <span className={styles.pin} style={{ left: mm(chosen.x), top: mm(chosen.y) }} aria-hidden="true">
              <Pin size={10} />
            </span>
          )}
          {home && chosen && (moved || local?.dx || local?.dy) && (
            <>
              <div className={styles.home} style={position(home)} />
              <svg className={styles.guide} aria-hidden="true">
                <line
                  x1={mm(home.x + home.w / 2)}
                  y1={mm(home.y + home.h / 2)}
                  x2={mm(chosen.x + chosen.w / 2)}
                  y2={mm(chosen.y + chosen.h / 2)}
                />
              </svg>
            </>
          )}
          {local && (local.dx !== 0 || local.dy !== 0 || local.factor !== 1 || local.caption) && (
            <>
              <div
                className={styles.chip}
                style={{ left: mm(chosen?.x ?? cell.cellMm.x), top: mm((chosen?.y ?? cell.cellMm.y) - 7) }}
              >
                {local.caption && local.captionFrom
                  ? local.pointer?.caption === 'bottom'
                    ? t('panels:diagram.placement.dragLines', {
                        count: local.caption.text.lines.length,
                        mm: tenths(local.caption.width),
                        defaultValue_one: '{{count}} line · {{mm}} mm',
                        defaultValue_other: '{{count}} lines · {{mm}} mm',
                      })
                    : t('panels:diagram.placement.dragSize', '{{mm}} mm · auto {{auto}} mm', {
                        mm: tenths(local.caption.width),
                        auto: tenths(local.captionFrom.auto),
                      })
                  : local.pointer?.size
                    ? t('panels:diagram.placement.dragSize', '{{mm}} mm · auto {{auto}} mm', {
                        mm: size === null ? '' : tenths(size),
                        auto: autoSize === null ? '' : tenths(autoSize),
                      })
                    : t('panels:diagram.placement.dragMove', '{{part}} · {{x}}, {{y}} mm', {
                        part: labels[local.part],
                        x: tenths(local.dx),
                        y: tenths(local.dy),
                      })}
                {local.snap?.number && (
                  <> · {t('panels:diagram.placement.matchStep', '= step {{number}}', { number: local.snap.number })}</>
                )}
                {local.caption?.snap === 'picture' && (
                  <> · {t('panels:diagram.placement.matchPicture', '= picture')}</>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * A caption a grip is resizing, composed from the preview's layout, by what
 * it draws: a few at a time, since its lines rewrap only now and then as the
 * grip moves, and each preview is new pages.
 */
const liftedCaptions = new Map<string, string>();
const LIFTED_CAPTIONS_KEPT = 16;
function liftedCaptionUrl(pages: PreparedDiagramPages, page: number, stepId: string, text: LayoutCell['text']): string {
  const { widthMm, heightMm } = pages.layout.paper;
  const runs = text.lines.map((line) => line.runs.map(({ font, text, xMm }) => [font, text, xMm]));
  const key = JSON.stringify([widthMm, heightMm, text.x, text.firstBaseline, runs]);
  let url = liftedCaptions.get(key);
  if (url === undefined) {
    url = composedPageUrl(pages, page, { band: false, only: { stepId, part: 'text' } });
    const oldest = liftedCaptions.keys().next();
    if (liftedCaptions.size >= LIFTED_CAPTIONS_KEPT && !oldest.done) liftedCaptions.delete(oldest.value);
    liftedCaptions.set(key, url);
  }
  return url;
}

function LiftedPicture({ draft, pages }: { draft: NonNullable<Placement['draft']>; pages: PreparedDiagramPages | null }) {
  const { base, cell, part, page, dx, dy, factor, pointer, caption } = draft;
  const picture = partBox(cell, 'picture');
  const only = (part: PagePart) => composedPageUrl(base, page, { band: false, only: { stepId: cell.stepId, part } });
  if (caption)
    return (
      <img
        alt=""
        draggable={false}
        className={styles.lifted}
        src={liftedCaptionUrl(pages ?? base, page, cell.stepId, caption.text)}
      />
    );
  if (!pointer?.size)
    return (
      <img
        alt=""
        draggable={false}
        className={styles.lifted}
        src={only(part)}
        style={{ transform: `translate(${mm(dx)}px, ${mm(dy)}px)` }}
      />
    );
  return (
    <>
      <img alt="" draggable={false} className={styles.lifted} src={only('number')} />
      <img
        alt=""
        draggable={false}
        className={styles.lifted}
        src={only('picture')}
        style={{
          transformOrigin: `${mm(picture.x + picture.w / 2)}px ${mm(picture.y)}px`,
          transform: `scale(${factor})`,
        }}
      />
      <img
        alt=""
        draggable={false}
        className={styles.lifted}
        src={only('text')}
        style={{ transform: `translateY(${mm(picture.h * (factor - 1))}px)` }}
      />
    </>
  );
}
