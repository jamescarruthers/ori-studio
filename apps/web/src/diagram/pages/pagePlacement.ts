import type { DiagramStepPlace } from '../document/diagramDocument';
import type { DiagramPagesLayout, LayoutCell, LayoutStep, TextSetter } from './diagramPageLayout';
import {
  STEP_NUMBER_ASCENT_MM,
  STEP_NUMBER_SIZE_MM,
  STEP_TEXT_LEADING_MM,
  STEP_TEXT_SIZE_MM,
  TEXT_DESCENT_MM,
} from './stepType';

/** A step number's width where it was never set (`placeCell` measures it): two figures' room, mm. */
const UNMEASURED_NUMBER_MM = 10;

export type PagePart = 'frame' | 'number' | 'picture' | 'text';
export interface PageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Page axes, even on a page read upward. Only the frame's horizontal component follows reading order. */
export function pageOffset(
  place: DiagramStepPlace | undefined,
  part: PagePart,
  rightToLeft: boolean,
): [number, number] {
  const [x, y] = place?.[part] ?? [0, 0];
  return [part === 'frame' && rightToLeft ? -x : x, y];
}

export function translateCell(cell: LayoutCell, part: PagePart, dx: number, dy: number): LayoutCell {
  if (dx === 0 && dy === 0) return cell;
  const move = <T extends { x: number; y: number }>(value: T): T => ({ ...value, x: value.x + dx, y: value.y + dy });
  const frame = part === 'frame';
  return {
    ...cell,
    cellMm: frame ? move(cell.cellMm) : cell.cellMm,
    pictureMm: frame || part === 'picture' ? move(cell.pictureMm) : cell.pictureMm,
    drawMm: frame || part === 'picture' ? move(cell.drawMm) : cell.drawMm,
    inkMm: cell.inkMm && (frame || part === 'picture') ? move(cell.inkMm) : cell.inkMm,
    numberAt: frame || part === 'number' ? move(cell.numberAt) : cell.numberAt,
    numberMm: cell.numberMm && (frame || part === 'number') ? move(cell.numberMm) : cell.numberMm,
    text:
      frame || part === 'text'
        ? { ...cell.text, x: cell.text.x + dx, firstBaseline: cell.text.firstBaseline + dy }
        : cell.text,
  };
}

/**
 * Add measured hit geometry and apply offsets after the automatic layout has
 * finished sizing. The homes the Pages view draws a moved part's ghost at
 * (`homeParts`): the frame's, the step's parts together where the layout
 * puts them; a part's, where it sits in its frame once the frame has moved,
 * since its offset is from there.
 */
export function placeCell(cell: LayoutCell, step: LayoutStep, rightToLeft: boolean, setter: TextSetter): LayoutCell {
  const number = setter.line(String(cell.number), STEP_NUMBER_SIZE_MM, 700);
  let next: LayoutCell = {
    ...cell,
    rightToLeft,
    numberMm: { x: cell.numberAt.x, y: cell.numberAt.y - STEP_NUMBER_ASCENT_MM, w: number.widthMm, h: STEP_NUMBER_SIZE_MM },
  };
  const frame = partBox(next, 'frame');
  next = translateCell(next, 'frame', ...pageOffset(step.place, 'frame', rightToLeft));
  next.homeParts = { frame, number: partBox(next, 'number'), picture: partBox(next, 'picture'), text: partBox(next, 'text') };
  for (const part of ['number', 'picture', 'text'] as const) {
    next = translateCell(next, part, ...pageOffset(step.place, part, rightToLeft));
  }
  return next;
}

/** The fields of a placement that move or resize a step's picture, which the flow lane runs through. */
const LANE_FIELDS: readonly (keyof DiagramStepPlace)[] = ['frame', 'picture', 'scale'];

/**
 * Whether the flow lane follows a placed step as a hand put it (`LaneStop.placed`):
 * its frame or its picture moved, or its picture's scale pinned. The lane
 * runs through the step's picture, so a step whose number or caption alone
 * was placed — moved, or its caption's measure pinned — has its picture
 * where the layout puts it, and the band runs through it as through any other.
 */
export function laneFollowsPlacement(cell: Pick<LayoutCell, 'placed'>): boolean {
  const offsets = cell.placed?.offsets;
  return !!offsets && LANE_FIELDS.some((field) => offsets[field] !== undefined);
}

/** A step's picture's box as drawn: what a flow row bowing over it keeps inside (`LaneStop.picture`). */
export function lanePicture(cell: LayoutCell): { left: number; right: number; top: number; bottom: number } {
  const picture = partBox(cell, 'picture');
  return { left: picture.x, right: picture.x + picture.w, top: picture.y, bottom: picture.y + picture.h };
}

export function partBox(cell: LayoutCell, part: PagePart): PageBox {
  switch (part) {
    case 'frame': {
      const boxes = [
        partBox(cell, 'number'),
        partBox(cell, 'picture'),
        ...(cell.text.lines.length ? [partBox(cell, 'text')] : []),
      ];
      const x = Math.min(...boxes.map((b) => b.x)),
        y = Math.min(...boxes.map((b) => b.y));
      return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
    }
    case 'number':
      return (
        cell.numberMm ?? {
          x: cell.numberAt.x,
          y: cell.numberAt.y - STEP_NUMBER_ASCENT_MM,
          w: UNMEASURED_NUMBER_MM,
          h: STEP_NUMBER_SIZE_MM,
        }
      );
    case 'picture':
      return cell.inkMm ?? cell.drawMm;
    case 'text':
      // From the first line's cap height to the last line's descenders.
      return {
        x: cell.text.x,
        y: cell.text.firstBaseline - STEP_TEXT_SIZE_MM,
        w: Math.max(0, ...cell.text.lines.map((line) => line.widthMm)),
        h: cell.text.lines.length
          ? (cell.text.lines.length - 1) * STEP_TEXT_LEADING_MM + (STEP_TEXT_SIZE_MM + TEXT_DESCENT_MM)
          : 0,
      };
  }
}

const CELL_PARTS = ['number', 'picture', 'text'] as const;

/**
 * One thing is said of where a step lands (Zach, 2026-10-12): a step with a
 * part past the margin — or past the paper's edge, which lies past the margin
 * too and may clip the part out of sight — is marked `outsideMargin`. Every
 * step, not only one placed by hand: a held page keeps a step's box while its
 * picture changes, so a new pose can carry a picture nobody moved past the
 * paper's edge, where it would print clipped (the automatic layouts of the
 * four real diagrams checked put no step there). Derived, never stored in the
 * document. Nothing else is said: a step over another, over a symbol or over
 * its own parts, or the path bending round it, shows on the page as plainly
 * as it would print.
 */
export function markOutsideMargin(layout: DiagramPagesLayout): void {
  const { widthMm: w, heightMm: h, marginMm: m } = layout.paper;
  for (const page of layout.pages)
    for (const cell of page.cells) {
      const outside = CELL_PARTS.some((part) => {
        const b = partBox(cell, part);
        return b.w > 0 && b.h > 0 && (b.x < m || b.y < m || b.x + b.w > w - m || b.y + b.h > h - m);
      });
      if (outside) cell.outsideMargin = true;
      else delete cell.outsideMargin;
    }
}

/** The steps with a part past the margin (`markOutsideMargin`), in print order. */
export function outsideMarginSteps(layout: Pick<DiagramPagesLayout, 'pages'>): number[] {
  return layout.pages.flatMap((page) => page.cells.filter((cell) => cell.outsideMargin).map((cell) => cell.number));
}
