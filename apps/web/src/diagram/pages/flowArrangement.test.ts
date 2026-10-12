import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOW_PACKING, type DiagramPlaceScale } from '../document/diagramDocument';
import { roundPageArrangement } from '../document/pageArrangements';
import { estimateTextSetter } from './estimateTextSetter';
import {
  ARRANGED_SLACK_MM,
  arrangedBox,
  arrangedCaptionWidth,
  arrangedOverflow,
  arrangedPictureRoom,
  arrangementFits,
  grownToHold,
  packedArrangement,
} from './flowArrangement';
import { craneSteps, PROTOTYPE_AREA } from './flowPacking.fixtures';
import { CAPTION_TOP_MM, NUMBER_ROOM_MM, PICTURE_SIDE_MM, captionWidthFor, packFlowPage, type FlowPagePacking } from './flowPacking';
import { STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';

const setter = estimateTextSetter;

/** The crane's first `count` steps packed on the prototype's page, as page 1. */
function packed(count: number, settings = DEFAULT_FLOW_PACKING): FlowPagePacking {
  const steps = craneSteps(setter).slice(0, count);
  return packFlowPage(
    { steps, layoutCount: count, area: PROTOTYPE_AREA, up: false, handsOver: true, settings, kPrev: null },
    setter
  );
}

/** Each step's reference scale, alternately a paper's and a frame's. */
function scalesOf(packing: FlowPagePacking): Map<string, DiagramPlaceScale> {
  return new Map(packing.steps.map((step, index) => [step.id, index % 2 ? { frameMm: 40 + index } : { mmPerUnit: 0.1 + index / 100 }]));
}

describe('a packed page kept as its arrangement', () => {
  it('keeps each step’s box, band and bend, and its reference scale times the page’s, rounded as the store keeps them', () => {
    const packing = packed(9);
    const scales = scalesOf(packing);
    const arrangement = packedArrangement(packing, scales, 'pack-1:abc');
    expect(arrangement).toEqual(roundPageArrangement(arrangement));
    expect(arrangement.signature).toBe('pack-1:abc');
    expect(arrangement.k).toBe(Number(packing.k.toPrecision(6)));
    expect(Object.keys(arrangement.steps)).toEqual(packing.steps.map((step) => step.id));
    for (const step of packing.steps) {
      const kept = arrangement.steps[step.id]!;
      kept.box.forEach((value, index) => expect(Math.abs(value - [step.box.x, step.box.y, step.box.w, step.box.h][index]!)).toBeLessThanOrEqual(0.005));
      expect(kept.band).toBe(step.band);
      expect(Boolean(kept.bend)).toBe(step.bend);
      const reference = scales.get(step.id)!;
      if ('mmPerUnit' in reference) expect(kept.scale).toEqual({ mmPerUnit: Number((reference.mmPerUnit * packing.k).toPrecision(6)) });
      else expect(kept.scale).toEqual({ frameMm: Number((reference.frameMm * packing.k).toPrecision(6)) });
    }
  });

  it('keeps a step with no reference scale at its picture box’s side, as a frame', () => {
    const packing = packed(4);
    const arrangement = packedArrangement(packing, new Map(), 'pack-1:abc');
    for (const step of packing.steps) expect(arrangement.steps[step.id]!.scale).toEqual({ frameMm: Number(step.picture.w.toPrecision(6)) });
  });
});

describe('a step drawn in its box', () => {
  it('sets its caption at the measure its box was packed for, never narrower, whatever its picture is now', () => {
    for (const count of [4, 9, 13]) {
      const packing = packed(count);
      const arrangement = packedArrangement(packing, scalesOf(packing), 'pack-1:abc');
      for (const step of packing.steps) {
        const width = arrangedCaptionWidth(arrangedBox(arrangement.steps[step.id]!));
        expect(width, step.id).toBeGreaterThanOrEqual(step.caption.widthMm);
        expect(width, step.id).toBeLessThanOrEqual(arrangement.steps[step.id]!.box[2]);
        // So never more lines than the box was cut for.
        const lines = setter.paragraph(craneSteps(setter).find((each) => each.id === step.id)!.text, width, STEP_TEXT_SIZE_MM, 99).lines;
        expect(lines.length, step.id).toBeLessThanOrEqual(step.caption.lines.length);
      }
    }
    // The least measure under a narrow picture; the most under a wide one.
    expect(arrangedCaptionWidth({ x: 0, y: 0, w: 28, h: 40 })).toBe(28);
    expect(arrangedCaptionWidth({ x: 0, y: 0, w: 80, h: 40 })).toBe(50);
    expect(arrangedCaptionWidth({ x: 0, y: 0, w: 37.5, h: 40 })).toBe(captionWidthFor(33.5));
  });

  it('leaves its picture its box less its side room, its number and its caption', () => {
    const box = { x: 10, y: 20, w: 40, h: 60 };
    expect(arrangedPictureRoom(box, 0)).toEqual({ w: 40 - PICTURE_SIDE_MM, h: 60 - NUMBER_ROOM_MM });
    expect(arrangedPictureRoom(box, 2)).toEqual({ w: 40 - PICTURE_SIDE_MM, h: 60 - NUMBER_ROOM_MM - CAPTION_TOP_MM - 2 * STEP_TEXT_LEADING_MM });
  });

  it('says its picture no longer fits where by itself it needs more of its box, else its caption where it runs out of the foot', () => {
    const box = { x: 0, y: 0, w: 40, h: 60 };
    const caption = (lines: number) => CAPTION_TOP_MM + lines * STEP_TEXT_LEADING_MM;
    // As packed: the picture its box's width less its side room, the caption filling the rest of its height.
    const fitted = { w: 40 - PICTURE_SIDE_MM, h: 60 - NUMBER_ROOM_MM - caption(3) };
    expect(arrangedOverflow(box, fitted, 3)).toBeNull();
    // Within the slack, still its place.
    expect(arrangedOverflow(box, { w: fitted.w + ARRANGED_SLACK_MM * 0.9, h: fitted.h + ARRANGED_SLACK_MM * 0.9 }, 3)).toBeNull();
    // A picture wider than its box, or taller than its box with no caption at all.
    expect(arrangedOverflow(box, { w: fitted.w + 1, h: fitted.h }, 3)).toBe('picture');
    expect(arrangedOverflow(box, { w: fitted.w, h: 60 }, 0)).toBe('picture');
    // A caption a line longer; or a taller picture that pushes it out of the foot.
    expect(arrangedOverflow(box, fitted, 4)).toBe('caption');
    expect(arrangedOverflow(box, { w: fitted.w, h: fitted.h + 2 }, 3)).toBe('caption');
    // A shorter caption, or none, fits.
    expect(arrangedOverflow(box, fitted, 0)).toBeNull();
  });

  it('says a page fits where every box lies in its area, and not where one runs past it', () => {
    const packing = packed(9);
    const arrangement = packedArrangement(packing, scalesOf(packing), 'pack-1:abc');
    expect(arrangementFits(arrangement, PROTOTYPE_AREA)).toBe(true);
    const narrower = { ...PROTOTYPE_AREA, w: PROTOTYPE_AREA.w - 20 };
    expect(arrangementFits(arrangement, narrower)).toBe(false);
  });
});

describe('a packed box grown to hold its step as it prints', () => {
  const area = { x: 10, y: 20, w: 190, h: 250 };
  const box = { x: 50, y: 60, w: 40, h: 60 };
  /** The picture the box holds exactly, with a caption of two lines under it. */
  const fits = { w: 40 - PICTURE_SIDE_MM, h: 60 - NUMBER_ROOM_MM - CAPTION_TOP_MM - 2 * STEP_TEXT_LEADING_MM };
  const expectBox = (actual: { x: number; y: number; w: number; h: number }, expected: typeof actual) =>
    (['x', 'y', 'w', 'h'] as const).forEach((side) => expect(actual[side], side).toBeCloseTo(expected[side], 9));

  it('stays as it was where it holds the step, or lacks no more than half the slack', () => {
    expect(grownToHold(box, fits, 2, area)).toBe(box);
    expect(grownToHold(box, { w: fits.w + ARRANGED_SLACK_MM / 2, h: fits.h + ARRANGED_SLACK_MM / 2 }, 2, area)).toBe(box);
  });

  it('grows by what it lacks, wider about its middle and taller at its foot', () => {
    expectBox(grownToHold(box, { w: fits.w + 1, h: fits.h + 0.6 }, 2, area), { x: 49.5, y: 60, w: 41, h: 60.6 });
  });

  it('moves back into its area, by no more than it grew', () => {
    const foot = { ...box, y: area.y + area.h - box.h };
    expectBox(grownToHold(foot, { w: fits.w, h: fits.h + 0.6 }, 2, area), { ...foot, y: foot.y - 0.6, h: 60.6 });
    const edge = { ...box, x: area.x };
    expectBox(grownToHold(edge, { w: fits.w + 1, h: fits.h }, 2, area), { ...edge, w: 41 });
    // Already out of it, on a page no plan fits: back no further than it grew.
    const out = { ...box, y: area.y + area.h };
    expectBox(grownToHold(out, { w: fits.w, h: fits.h + 0.6 }, 2, area), { ...out, y: out.y - 0.6, h: 60.6 });
  });
});
