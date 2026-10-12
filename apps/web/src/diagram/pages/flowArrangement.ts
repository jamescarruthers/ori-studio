/**
 * A flow page's arrangement (`implementation-plans/diagram-flow-packing.md`,
 * Decisions 1 and 3): kept from what the packer found (`flowPacking.ts`), and
 * a step drawn from its place in it — its number, picture and caption in its
 * box — whether its page was packed just now or is held as the file keeps it.
 * The layout draws a page it packs from the arrangement as kept, rounded, so
 * the page draws the same once the store adopts it and it is held.
 *
 * A held step keeps its box and its printed scale, so nothing another step
 * does moves or resizes it. Its own new picture, caption or (enlarged) Size
 * may no longer fit the box: that is said ({@link arrangedOverflow}), never
 * mended here — only a re-pack moves anything.
 *
 * Pure.
 */
import type { DiagramArrangedStep, DiagramPageArrangement, DiagramPlaceScale } from '../document/diagramDocument';
import { roundPageArrangement } from '../document/pageArrangements';
import {
  CAPTION_TOP_MM,
  NUMBER_ROOM_MM,
  PICTURE_SIDE_MM,
  captionWidthFor,
  type FlowPagePacking,
  type PackRect,
} from './flowPacking';
import { STEP_TEXT_LEADING_MM } from './stepType';

/**
 * How far past its box a step's picture or caption may reach and still fit
 * its place, mm: room for what keeping lengths to a hundredth of a mm and
 * measuring a picture's marks at the scale it prints at, not the one it was
 * packed by, leave.
 */
export const ARRANGED_SLACK_MM = 0.5;

/** The least a printed scale is kept at: a stored scale is a positive number. */
const LEAST_SCALE = 0.01;

/** Which part of a step no longer fits its box: its picture by itself, or its caption under it. */
export type ArrangedOverflow = 'picture' | 'caption';

/**
 * The page as packed, kept as its arrangement, rounded as the store keeps it
 * (`roundPageArrangement`): each step's box; its printed scale, its reference
 * scale (`scales`) times the page's, in its own measure — or, for a step with
 * none, its picture box's side as a frame; its band; whether it stands in a
 * bend; and an enlarged step's Size (`zoomScales`), which its scale was
 * packed for.
 */
export function packedArrangement(
  packing: FlowPagePacking,
  scales: ReadonlyMap<string, DiagramPlaceScale>,
  signature: string,
  zoomScales: ReadonlyMap<string, number> = new Map()
): DiagramPageArrangement {
  const steps: Record<string, DiagramArrangedStep> = {};
  for (const step of packing.steps) {
    const reference = scales.get(step.id);
    const scale: DiagramPlaceScale = !reference
      ? { frameMm: Math.max(LEAST_SCALE, step.picture.w) }
      : 'mmPerUnit' in reference
        ? { mmPerUnit: reference.mmPerUnit * packing.k }
        : { frameMm: reference.frameMm * packing.k };
    const zoomScale = zoomScales.get(step.id);
    steps[step.id] = {
      box: [step.box.x, step.box.y, step.box.w, step.box.h],
      scale,
      band: step.band,
      ...(step.bend ? { bend: true as const } : {}),
      ...(zoomScale !== undefined ? { zoomScale } : {}),
    };
  }
  return roundPageArrangement({ signature, k: packing.k, steps });
}

/** A step's box, as a rectangle. */
export function arrangedBox(step: DiagramArrangedStep): PackRect {
  const [x, y, w, h] = step.box;
  return { x, y, w, h };
}

/**
 * The measure a step's caption is set at in its box: the one it was packed
 * at, read back from the box, which is its picture's width and side room —
 * or, for a picture too narrow for the least measure, that measure. Read back
 * from the box as kept, it is never narrower than it was packed at, so the
 * caption never needs more lines than the box was cut for; and it is the
 * box's whatever the step's picture is now.
 */
export function arrangedCaptionWidth(box: PackRect): number {
  return captionWidthFor(box.w - PICTURE_SIDE_MM);
}

/** How tall a caption of `lines` lines stands under its picture, mm: nothing with none. */
function captionHeight(lines: number): number {
  return lines > 0 ? CAPTION_TOP_MM + lines * STEP_TEXT_LEADING_MM : 0;
}

/**
 * The room a step's box leaves its picture, mm: its width less the side
 * room, its height less its number and a caption of `lines` lines. What a
 * picture of another measure than the one kept — a new picture — is fitted
 * into, and an empty step's placeholder fills.
 */
export function arrangedPictureRoom(box: PackRect, lines: number): { w: number; h: number } {
  return {
    w: Math.max(0, box.w - PICTURE_SIDE_MM),
    h: Math.max(0, box.h - NUMBER_ROOM_MM - captionHeight(lines)),
  };
}

/**
 * What of a step no longer fits its box ({@link ARRANGED_SLACK_MM} allowed),
 * with its picture `picture` mm at its kept scale and its caption set in
 * `lines` lines: its picture, where that by itself — with its side room and
 * its number — needs more of the box than it has; else its caption, where
 * under the picture it runs out of the box's foot; null where both fit.
 */
export function arrangedOverflow(box: PackRect, picture: { w: number; h: number }, lines: number): ArrangedOverflow | null {
  if (picture.w + PICTURE_SIDE_MM > box.w + ARRANGED_SLACK_MM || NUMBER_ROOM_MM + picture.h > box.h + ARRANGED_SLACK_MM) {
    return 'picture';
  }
  return NUMBER_ROOM_MM + picture.h + captionHeight(lines) > box.h + ARRANGED_SLACK_MM ? 'caption' : null;
}

/**
 * A freshly packed box grown to hold its step as it prints: its picture
 * `picture` mm, measured at the scale it prints at, and its caption of
 * `lines` lines. The packing reckons a picture's marks at the size they take
 * at its reference scale, but a mark's pt-size part need not keep its reach
 * as the picture's scale changes, so a picture can print a little larger
 * than packed, and its page would say at once that it no longer fits. Where
 * it needs more than half the slack a held step is allowed
 * ({@link ARRANGED_SLACK_MM}), the box grows by what it lacks — wider about
 * its middle, taller at its foot — and moves back, by no more than it grew,
 * where that would take it out of `area`. The same box otherwise.
 */
export function grownToHold(box: PackRect, picture: { w: number; h: number }, lines: number, area: PackRect): PackRect {
  const lackW = picture.w + PICTURE_SIDE_MM - box.w;
  const lackH = NUMBER_ROOM_MM + picture.h + captionHeight(lines) - box.h;
  const growW = lackW > ARRANGED_SLACK_MM / 2 ? lackW : 0;
  const growH = lackH > ARRANGED_SLACK_MM / 2 ? lackH : 0;
  if (growW === 0 && growH === 0) return box;
  const [w, h] = [box.w + growW, box.h + growH];
  let x = box.x - growW / 2;
  x += Math.min(growW / 2, Math.max(0, area.x - x)) - Math.min(growW / 2, Math.max(0, x + w - (area.x + area.w)));
  const y = box.y - Math.min(growH, Math.max(0, box.y + h - (area.y + area.h)));
  return { x, y, w, h };
}

/**
 * Whether every step's box lies inside `area` ({@link ARRANGED_SLACK_MM}
 * allowed): false only for a page no plan fitted, packed at the least scale
 * and overflowing (`FlowPagePacking.fits`), which a held page says alike.
 */
export function arrangementFits(arrangement: DiagramPageArrangement, area: PackRect): boolean {
  return Object.values(arrangement.steps).every(({ box: [x, y, w, h] }) => {
    const slack = ARRANGED_SLACK_MM;
    return x >= area.x - slack && y >= area.y - slack && x + w <= area.x + area.w + slack && y + h <= area.y + area.h + slack;
  });
}
