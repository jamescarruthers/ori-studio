import { rectangle, separate, type Polygon } from './pagePolygons';
import type { DiagramStepPlace } from '../document/diagramDocument';
import type {
  DiagramPagesLayout,
  LayoutCell,
  LayoutPage,
  LayoutStep,
  LayoutZoomArrow,
  TextSetter,
} from './diagramPageLayout';
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
export interface PlacementClash {
  kind: 'step' | 'glyph' | 'margin' | 'paper' | 'path' | 'parts';
  steps?: number[];
}

/**
 * A step's picture as its paper and marks occupy it, each a convex outline
 * in its ink box's terms (0 to 1 across and down: `pictureFootprints`), so
 * the box's empty corners stay free; undefined where only the box is known.
 * Worked out only when asked for: for a placed step, and a step whose box
 * one meets ({@link placementClashes}).
 */
export type FootprintsOf = (stepId: string) => readonly Polygon[] | undefined;

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

/**
 * Whether the flow lane follows a placed step as a hand put it (`LaneStop.placed`):
 * any part moved or its picture's scale pinned. A step placed only by its
 * caption's measure (`DiagramStepPlace.textWidth`) stands where the layout
 * puts it, so the band runs through it as through any other.
 */
export function laneFollowsPlacement(cell: Pick<LayoutCell, 'placed'>): boolean {
  return !!cell.placed && Object.keys(cell.placed.offsets).some((field) => field !== 'textWidth');
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

/**
 * The outlines a part of a cell occupies, for clashes: its box, but a
 * picture's paper and marks where its footprints are known
 * ({@link FootprintsOf}), laid on its ink box as drawn — moved or resized
 * with it. Hit boxes stay rectangular ({@link partBox}).
 */
export function partPolygons(cell: LayoutCell, part: PagePart, footprintsOf?: FootprintsOf): readonly Polygon[] {
  const ink = cell.inkMm;
  if (part === 'picture' && ink && footprintsOf) {
    const footprints = footprintsOf(cell.stepId);
    if (footprints?.length) return footprints.map((polygon) => polygon.map((p) => ({ x: ink.x + p.x * ink.w, y: ink.y + p.y * ink.h })));
  }
  const box = partBox(cell, part);
  return box.w > 0 && box.h > 0 ? [rectangle(box.x, box.y, box.w, box.h)] : [];
}

function intersects(a: readonly Polygon[], b: readonly Polygon[]): boolean {
  return a.some((ap) => b.some((bp) => separate(ap, { x: 0, y: 0 }, bp, { x: 0, y: 0 }, -0.01)));
}

/** Two boxes overlap: what outlines inside them must, to clash. */
function boxesMeet(a: PageBox, b: PageBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const CELL_PARTS = ['number', 'picture', 'text'] as const;

/**
 * Manual placement is honored. Warnings are derived, never stored in the
 * document. A placed step's picture is checked as its footprints outline it
 * (`footprintsOf`), and another step's only where their boxes meet, so a
 * footprint is worked out only where it can decide a clash. The enlarge
 * arrows are checked where `arrowsOf` says a page prints them — lifted to
 * their areas (`placedZoomArrows`), which only the pictures as drawn can say
 * — else where the layout put them.
 */
export function placementClashes(
  layout: DiagramPagesLayout,
  footprintsOf?: FootprintsOf,
  arrowsOf?: (pageIndex: number) => readonly LayoutZoomArrow[],
): void {
  const { widthMm: w, heightMm: h, marginMm: m } = layout.paper;
  for (const [pageIndex, page] of layout.pages.entries())
    for (const cell of page.cells) {
      if (!cell.placed) continue;
      const parts = CELL_PARTS.map((part) => partPolygons(cell, part, footprintsOf));
      const boxes = CELL_PARTS.map((part) => partBox(cell, part)).filter((b) => b.w > 0 && b.h > 0);
      const clashes: PlacementClash[] = [...(cell.clashes?.filter((c) => c.kind === 'path') ?? [])];
      const outside = (inset: number) =>
        boxes.some((b) => b.x < inset || b.y < inset || b.x + b.w > w - inset || b.y + b.h > h - inset);
      if (outside(0)) clashes.push({ kind: 'paper' });
      else if (outside(m)) clashes.push({ kind: 'margin' });
      if (parts.some((shape, i) => parts.slice(i + 1).some((other) => intersects(shape, other))))
        clashes.push({ kind: 'parts' });
      const meets = (other: LayoutCell, part: PagePart) => {
        const box = partBox(other, part);
        return box.w > 0 && box.h > 0 && boxes.some((own) => boxesMeet(own, box));
      };
      const clashesWith = (other: LayoutCell) =>
        CELL_PARTS.some((part) => {
          if (!meets(other, part)) return false;
          const theirs = partPolygons(other, part, footprintsOf);
          return parts.some((own) => intersects(own, theirs));
        });
      const steps = page.cells.filter((other) => other !== cell && clashesWith(other)).map((other) => other.number);
      if (steps.length) clashes.push({ kind: 'step', steps });
      const glyphs = [...page.turns, ...(arrowsOf?.(pageIndex) ?? page.zoomArrows)].map(({ at, box }) => ({
        x: at.x - box.w / 2,
        y: at.y - box.h / 2,
        ...box,
      }));
      if (layout.title) glyphs.push(layout.title.tab);
      if (page.pageNumberAt)
        glyphs.push({
          x: page.pageNumberAt.x - (page.pageNumberAt.anchor === 'end' ? 10 : 0),
          y: page.pageNumberAt.y - 3.4,
          w: 10,
          h: 4,
        });
      if (glyphs.some((g) => parts.some((p) => intersects(p, [rectangle(g.x, g.y, g.w, g.h)]))))
        clashes.push({ kind: 'glyph' });
      cell.clashes = clashes.length ? clashes : undefined;
    }
}

export function pageClashingSteps(page: LayoutPage): number[] {
  return page.cells.filter((cell) => cell.clashes?.length).map((cell) => cell.number);
}

/**
 * What a clash is, as it is said: parts lying over others (another step, a
 * symbol, heading or page number, or the step's own parts), part of the step
 * past the paper's edge, past the margin, or the ribbon doubling back.
 */
export type ClashGroup = 'overlap' | 'paper' | 'margin' | 'path';

/** The groups, the most pressing first: what a step's one tag on the page says. */
export const CLASH_GROUPS: readonly ClashGroup[] = ['overlap', 'paper', 'margin', 'path'];

export function clashGroup(kind: PlacementClash['kind']): ClashGroup {
  return kind === 'step' || kind === 'glyph' || kind === 'parts' ? 'overlap' : kind;
}

/** A cell's most pressing clash, or null for a cell with none. */
export function cellClashGroup(cell: Pick<LayoutCell, 'clashes'>): ClashGroup | null {
  const groups = new Set(cell.clashes?.map((clash) => clashGroup(clash.kind)));
  return CLASH_GROUPS.find((group) => groups.has(group)) ?? null;
}

/** The steps with clashes, by group, each step once a group and in print order. */
export function clashingStepsByGroup(layout: DiagramPagesLayout): Record<ClashGroup, number[]> {
  const steps: Record<ClashGroup, number[]> = { overlap: [], paper: [], margin: [], path: [] };
  for (const cell of layout.pages.flatMap((page) => page.cells)) {
    const groups = new Set(cell.clashes?.map((clash) => clashGroup(clash.kind)));
    for (const group of CLASH_GROUPS) if (groups.has(group)) steps[group].push(cell.number);
  }
  return steps;
}
