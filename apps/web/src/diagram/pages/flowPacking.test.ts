import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOW_PACKING } from '../document/diagramDocument';
import { FIXTURE_FONTS } from '../fonts/diagramFonts.fixtures';
import type { TextSetter } from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { craneSteps, PROTOTYPE_AREA } from './flowPacking.fixtures';
import {
  bandGroups,
  packFlowPage,
  packingArea,
  PACKED_TURN_GUTTER_MM,
  PAGE_SCALE,
  STEP_GAP_MM,
  type FlowPageInput,
  type FlowPackingSettings,
  type FlowPagePacking,
  type PackStep,
} from './flowPacking';
import { fontTextSetter } from './fontTextSetter';
import { STEP_NUMBER_ASCENT_MM, STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';

const setter = estimateTextSetter;

/** One page of `steps` on the prototype's page: the first page, a right-hand turn after it, Zach's defaults. */
function pack(steps: readonly PackStep[], input: Partial<Omit<FlowPageInput, 'settings'>> & { settings?: Partial<FlowPackingSettings> } = {}) {
  const { settings, ...rest } = input;
  return packFlowPage(
    {
      steps,
      layoutCount: steps.length,
      area: PROTOTYPE_AREA,
      up: false,
      handsOver: false,
      kPrev: null,
      ...rest,
      settings: { ...DEFAULT_FLOW_PACKING, ...settings },
    },
    setter
  );
}

/** The crane cut into pages of `perPage`, packed in turn as the prototype packs them: page 1 a left page, spreads after. */
function packCrane(perPage: number, settings: Partial<FlowPackingSettings> = {}, text: TextSetter = setter): FlowPagePacking[] {
  const steps = craneSteps(text);
  const pages: PackStep[][] = [];
  for (let i = 0; i < steps.length; i += perPage) pages.push(steps.slice(i, i + perPage));
  let kPrev: number | null = null;
  return pages.map((page, pageIndex) => {
    const packed = packFlowPage(
      {
        steps: page,
        layoutCount: pageIndex === pages.length - 1 ? perPage : page.length,
        area: PROTOTYPE_AREA,
        up: pageIndex % 2 === 1,
        handsOver: pageIndex % 2 === 0 && pageIndex < pages.length - 1,
        settings: { ...DEFAULT_FLOW_PACKING, ...settings },
        kPrev,
      },
      text
    );
    kPrev = packed.k;
    return packed;
  });
}

/** `count` steps alike: a picture `width` × `height` mm and a short caption. */
function alike(count: number, width = 40, height = 40): PackStep[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index + 1}`,
    size: { width, height },
    numberWidth: 4,
    text: 'Fold in half.',
    turnsBefore: false,
  }));
}

const area = PROTOTYPE_AREA;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- The prototype's packing, as it stands in artifacts/layout-review/proto2/template.html ---
// Kept, line for line, as the reference the port is held to: the port's
// caching and pruning must never change what it packs. Only its caption
// wrapping is the setter's rather than a canvas's.

interface ProtoStep {
  id: string;
  text: string;
  turns: readonly unknown[];
  wMm: number;
  hMm: number;
  phantom?: boolean;
}
interface ProtoOpts {
  bands: 'auto' | number;
  prefer: number;
  seats: 'on' | 'off';
  nest: number;
  steady: number;
  kMax: number;
}
interface ProtoPlan {
  bands: number[];
  seats: number[];
}
const TXT = 3.2;
const LEAD = 4.1;
const GAP_X = 5;
const GAP_Y = 6;
const TURN_GAP = 13;
const gapBefore = (s: ProtoStep) => (s.turns.length ? TURN_GAP : GAP_X);
// The prototype's caption cache, by text and then by measure (its key was the two joined).
const lineCache = new Map<string, Map<number, readonly unknown[]>>();
function lines(text: string, widthMm: number) {
  let byWidth = lineCache.get(text);
  if (!byWidth) lineCache.set(text, (byWidth = new Map()));
  let set = byWidth.get(widthMm);
  if (!set) byWidth.set(widthMm, (set = setter.paragraph(text, widthMm, TXT, Number.MAX_SAFE_INTEGER).lines));
  return set;
}
function box(s: ProtoStep, k: number) {
  const pw = s.wMm * k;
  const ph = s.hMm * k;
  const tw = Math.round(Math.min(50, Math.max(28, pw)));
  const ls = lines(s.text, tw);
  return { pw, ph, tw, ls, w: Math.max(pw + 4, tw), h: 5 + ph + (ls.length ? 2 + ls.length * LEAD : 0) };
}
function compositions(n: number, parts: number): number[][] {
  const out: number[][] = [];
  const rec = (left: number, k: number, acc: number[]) => {
    if (k === 1) {
      if (left >= 1) out.push([...acc, left]);
      return;
    }
    for (let a = 1; a <= left - (k - 1); a++) rec(left - a, k - 1, [...acc, a]);
  };
  rec(n, parts, []);
  return out;
}
function fits(items: ProtoStep[], plan: ProtoPlan, k: number) {
  const { bands, seats } = plan;
  let i = 0;
  let totalH = 0;
  const bandRows: { row: ProtoStep[]; seatAfter: ProtoStep | null }[] = [];
  for (let b = 0; b < bands.length; b++) {
    const row = items.slice(i, i + bands[b]!);
    i += bands[b]!;
    const seatAfter = b < seats.length && seats[b] ? items[i++]! : null;
    bandRows.push({ row, seatAfter });
  }
  for (let b = 0; b < bandRows.length; b++) {
    const { row } = bandRows[b]!;
    const boxes = row.map((s) => box(s, k));
    let width = boxes.reduce((a, x) => a + x.w, 0) + row.slice(1).reduce((a, s) => a + gapBefore(s), 0);
    const before = b > 0 ? bandRows[b - 1]!.seatAfter : null;
    const after = bandRows[b]!.seatAfter;
    if (before) width += box(before, k).w + GAP_X;
    if (after) width += box(after, k).w + GAP_X;
    if (width > area.w) return null;
    totalH += Math.max(...boxes.map((x) => x.h));
  }
  totalH += GAP_Y * (bandRows.length - 1);
  if (totalH > area.h) return null;
  return bandRows;
}
function bestScale(items: ProtoStep[], plan: ProtoPlan, kMax: number) {
  if (!fits(items, plan, 0.25)) return 0;
  let lo = 0.25;
  let hi = kMax;
  if (fits(items, plan, hi)) return hi;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2;
    if (fits(items, plan, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
/** A plan seating a step in a bend with no real step after it: a short last page's last step, or a stand-in. */
function seatBeforeNoStep(items: ProtoStep[], plan: ProtoPlan): boolean {
  let i = 0;
  return plan.bands.some((count, b) => {
    i += count;
    if (!(b < plan.seats.length && plan.seats[b])) return false;
    const seat = i++;
    return items[seat + 1]?.phantom === true || items[seat]!.phantom === true;
  });
}
function packPage(items: ProtoStep[], opts: ProtoOpts, kPrev: number | null, oddOnly: boolean) {
  const n = items.length;
  const bandChoices = opts.bands === 'auto' ? (n <= 4 ? [1, 2, 3] : [2, 3, 4, 5]) : [Number(opts.bands)];
  let best: { score: number; k: number; plan: ProtoPlan; B: number; s: number } | null = null;
  for (const B of bandChoices) {
    if (B > n) continue;
    if (oddOnly && B % 2 === 0 && opts.bands === 'auto') continue;
    const seatCombos: number[][] = [];
    const maxSeats = opts.seats === 'on' ? B - 1 : 0;
    for (let mask = 0; mask < 1 << (B - 1); mask++) {
      const seats = Array.from({ length: B - 1 }, (_, j) => (mask >> j) & 1);
      const count = seats.reduce((a, x) => a + x, 0);
      if (count <= maxSeats && (count === 0 || opts.seats === 'on')) seatCombos.push(seats);
    }
    for (const seats of seatCombos) {
      const s = seats.reduce((a, x) => a + x, 0);
      if (n - s < B) continue;
      for (const bands of compositions(n - s, B)) {
        const plan = { bands, seats };
        // Decided in the port, not the prototype: a step stands in a bend only with a real step after it.
        if (seatBeforeNoStep(items, plan)) continue;
        const cap = kPrev ? Math.min(opts.kMax, kPrev * (1 + 0.6 * (1 - opts.steady))) : opts.kMax;
        const k = bestScale(items, plan, cap);
        if (!k) continue;
        const rows = fits(items, plan, k)!;
        const fill = rows.map(({ row }) => row.reduce((a, x) => a + box(x, k).w, 0) / area.w);
        const mean = fill.reduce((a, x) => a + x, 0) / fill.length;
        const uneven = Math.sqrt(fill.reduce((a, x) => a + (x - mean) ** 2, 0) / fill.length);
        const steady = kPrev ? Math.abs(Math.log(k / kPrev)) : 0;
        const score = Math.log(k) - opts.prefer * 0.4 * Math.abs(B - 3) - 0.025 * s - 0.6 * uneven - opts.steady * 1.5 * steady;
        if (!best || score > best.score + 1e-9) best = { score, k, plan, B, s };
      }
    }
  }
  return best;
}
function layoutPage(items: ProtoStep[], best: { k: number; plan: ProtoPlan }, opts: ProtoOpts, pageIndex: number) {
  const { k, plan } = best;
  const up = pageIndex % 2 === 1;
  const rows = fits(items, plan, k)!;
  const bandHs = rows.map(({ row }) => Math.max(...row.map((s) => box(s, k).h)));
  const used = bandHs.reduce((a, x) => a + x, 0);
  const spare = area.h - used;
  const gap = rows.length > 1 ? spare / (rows.length - 1 + 1) : 0;
  const placed: { s: ProtoStep; bx: ReturnType<typeof box>; x: number; y: number; band: number; seat?: boolean }[] = [];
  let y = area.y + gap / 2;
  const bandTops = new Array<number>(rows.length);
  for (let v = 0; v < rows.length; v++) {
    const b = up ? rows.length - 1 - v : v;
    bandTops[b] = y;
    y += bandHs[b]! + gap;
  }
  rows.forEach(({ row, seatAfter }, b) => {
    const top = bandTops[b]!;
    const bandH = bandHs[b]!;
    const rtl = b % 2 === 1;
    const before = b > 0 ? rows[b - 1]!.seatAfter : null;
    const boxes = row.map((s) => box(s, k));
    const leftCol = (rtl ? seatAfter : before) ? box((rtl ? seatAfter : before)!, k).w + GAP_X : 0;
    const rightCol = (rtl ? before : seatAfter) ? box((rtl ? before : seatAfter)!, k).w + GAP_X : 0;
    const avail = area.w - leftCol - rightCol;
    const seq = row.map((s, i) => ({ s, bx: boxes[i]!, need: i === 0 ? 0 : gapBefore(s), x: 0 }));
    const sum = seq.reduce((a, it) => a + it.bx.w + it.need, 0);
    const space = (avail - sum) / seq.length;
    const lefts: number[] = [];
    let cursor = space / 2;
    for (const it of seq) {
      cursor += it.need;
      lefts.push(cursor);
      cursor += it.bx.w + space;
    }
    seq.forEach((it, i) => {
      it.x = rtl ? area.x + leftCol + avail - lefts[i]! - it.bx.w : area.x + leftCol + lefts[i]!;
    });
    seq.forEach(({ s, bx, x }, i) => {
      const slack = bandH - bx.h;
      const dip = ((i % 2 === 0 ? -1 : 1) * opts.nest * slack) / 2;
      placed.push({ s, bx, x, y: top + slack / 2 + dip, band: b });
    });
    if (seatAfter) {
      const bx = box(seatAfter, k);
      const nextTop = bandTops[b + 1]!;
      const mid = (top + bandH / 2 + (nextTop + bandHs[b + 1]! / 2)) / 2;
      const atRight = !rtl;
      placed.push({ s: seatAfter, bx, x: atRight ? area.x + area.w - bx.w : area.x, y: mid - bx.h / 2, band: b + 0.5, seat: true });
    }
  });
  return placed;
}
/** The prototype's `render`, page by page: the plan, scale and boxes of each page's own steps; null for a page it packs no way. */
function prototypeCrane(perPage: number, settings: Partial<FlowPackingSettings> = {}) {
  const all = { ...DEFAULT_FLOW_PACKING, ...settings };
  const opts: ProtoOpts = {
    bands: all.flowBands,
    prefer: all.flowPreferBands,
    seats: all.flowBendSteps ? 'on' : 'off',
    nest: all.flowNesting,
    steady: all.flowSteadiness,
    kMax: 1.4,
  };
  const steps: ProtoStep[] = craneSteps(setter).map((step) => ({
    id: step.id,
    text: step.text,
    turns: step.turnsBefore ? ['turn'] : [],
    wMm: step.size.width,
    hMm: step.size.height,
  }));
  const pages: ProtoStep[][] = [];
  for (let i = 0; i < steps.length; i += perPage) pages.push(steps.slice(i, i + perPage));
  let kPrev: number | null = null;
  return pages.map((items, pageIndex) => {
    const handsOver = pageIndex % 2 === 0 && pageIndex < pages.length - 1;
    const last = pageIndex === pages.length - 1;
    const padded =
      last && items.length < perPage
        ? [...items, ...Array.from({ length: perPage - items.length }, (_, i) => ({ ...items[i % items.length]!, turns: [], phantom: true }))]
        : items;
    const best = packPage(padded, opts, kPrev, handsOver);
    if (!best) return null;
    kPrev = best.k;
    const placed = layoutPage(padded, best, opts, pageIndex).filter((p) => !p.s.phantom);
    return {
      k: best.k,
      bands: best.plan.bands,
      bends: best.plan.seats.map(Boolean),
      boxes: placed.map((p) => ({ id: p.s.id, x: p.x, y: p.y, w: p.bx.w, h: p.bx.h, band: Math.floor(p.band), bend: p.seat === true })),
    };
  });
}

/** Every page of the crane at `perPage` packs as the prototype packs it, under each of `variants`. */
function expectPrototype(perPage: number, variants: readonly Partial<FlowPackingSettings>[]) {
  for (const settings of variants) {
    const reference = prototypeCrane(perPage, settings);
    packCrane(perPage, settings).forEach((page, pageIndex) => {
      const ref = reference[pageIndex]!;
      const where = `${perPage} a page, ${JSON.stringify(settings)}, page ${pageIndex + 1}`;
      expect(page.plan, where).toEqual({ bands: ref.bands, bends: ref.bends });
      expect(page.k, where).toBeCloseTo(ref.k, 12);
      expect(page.steps.map((step) => step.id), where).toEqual(ref.boxes.map((b) => b.id));
      page.steps.forEach((step, i) => {
        const b = ref.boxes[i]!;
        expect([step.box.x, step.box.y, step.box.w, step.box.h].every((value, j) => near(value, [b.x, b.y, b.w, b.h][j]!)), `${where}, ${step.id}`).toBe(true);
        expect({ band: step.band, bend: step.bend }, `${where}, ${step.id}`).toEqual({ band: b.band, bend: b.bend });
      });
    });
  }
}

const VARIANTS: readonly Partial<FlowPackingSettings>[] = [
  {},
  { flowPreferBands: 0 },
  { flowPreferBands: 1 },
  { flowBendSteps: false },
  { flowNesting: 0 },
  { flowNesting: 1 },
  { flowSteadiness: 0 },
  { flowSteadiness: 1 },
  { flowBands: 3 },
];

describe('packFlowPage: the prototype', () => {
  // Fixed counts the prototype packs as this does: odd ones (an even one on a spine page is Decision 7's), never past the steps.
  it('packs the crane at 4 and 7 a page as the prototype does', () => {
    expectPrototype(4, VARIANTS);
    expectPrototype(7, [...VARIANTS, { flowBands: 5 }]);
  });

  it('packs the crane at 9 a page as the prototype does', () => {
    expectPrototype(9, [...VARIANTS, { flowBands: 5 }]);
  });

  it('packs the crane at 10 a page as the prototype does', () => {
    expectPrototype(10, VARIANTS);
  });

  it('packs the crane at 13 a page as the prototype does', () => {
    expectPrototype(13, VARIANTS.slice(0, 5));
  });

  it('packs the crane at 13 a page as the prototype does, steadily or not', () => {
    expectPrototype(13, VARIANTS.slice(5));
  });
});

describe('packFlowPage: band counts', () => {
  it('tries 1–3 bands on a page of up to four, 2–5 on a longer one, odd only on a page that hands over at its spine', () => {
    expect(bandGroups('auto', 3, false)).toEqual([{ counts: [1, 2, 3], prefer: true }]);
    expect(bandGroups('auto', 2, false)).toEqual([{ counts: [1, 2], prefer: true }]);
    expect(bandGroups('auto', 4, true)).toEqual([{ counts: [1, 3], prefer: true }]);
    expect(bandGroups('auto', 10, false)).toEqual([{ counts: [2, 3, 4, 5], prefer: true }]);
    expect(bandGroups('auto', 10, true)).toEqual([{ counts: [3, 5], prefer: true }]);
  });

  it('holds a fixed count to the steps, and an even one on a spine page to the odd counts either side', () => {
    expect(bandGroups(4, 13, false)).toEqual([{ counts: [4], prefer: false }]);
    expect(bandGroups(3, 13, true)).toEqual([{ counts: [3], prefer: false }]);
    expect(bandGroups(4, 13, true)).toEqual([
      { counts: [3], prefer: false },
      { counts: [5], prefer: false },
    ]);
    expect(bandGroups(2, 13, true)).toEqual([
      { counts: [1], prefer: false },
      { counts: [3], prefer: false },
    ]);
    expect(bandGroups(4, 4, true)).toEqual([{ counts: [3], prefer: false }]);
    expect(bandGroups(5, 3, false)).toEqual([{ counts: [3], prefer: false }]);
    expect(bandGroups(5, 4, true)).toEqual([{ counts: [3], prefer: false }]);
  });

  it('packs nine steps alike into three bands of three', () => {
    expect(pack(alike(9)).plan).toEqual({ bands: [3, 3, 3], bends: [false, false] });
  });

  it('prefers three bands in Auto, as strongly as Prefer three bands says', () => {
    // The crane's second page at 7 a page: two bands pack it largest, three when they are preferred.
    const bandsAt = (flowPreferBands: number) => packCrane(7, { flowPreferBands })[1]!.plan.bands.length;
    expect(bandsAt(0)).toBe(2);
    expect(bandsAt(0.5)).toBe(3);
    expect(bandsAt(1)).toBe(3);
  });

  it('takes an odd number of bands on a page that hands over at its spine', () => {
    const crane = craneSteps(setter);
    const evens: number[] = [];
    for (let count = 2; count <= 13; count += 1) {
      for (const start of [0, 7, 14]) {
        const steps = crane.slice(start, start + count);
        expect(pack(steps, { handsOver: true }).plan.bands.length % 2, `${count} from step ${start + 1}`).toBe(1);
        const free = pack(steps).plan.bands.length;
        if (free % 2 === 0) evens.push(free);
      }
    }
    // The rule bites: the same pages take an even count where they need not end at the spine.
    expect(evens.length).toBeGreaterThan(0);
  });

  it('packs every page to a fixed count', () => {
    const steps = craneSteps(setter).slice(0, 13);
    for (const flowBands of [2, 3, 4, 5] as const) {
      expect(pack(steps, { settings: { flowBands } }).plan.bands.length).toBe(flowBands);
    }
  });

  it('packs a spine page given an even count at the odd count either side that packs larger', () => {
    const steps = craneSteps(setter).slice(0, 13);
    const three = pack(steps, { settings: { flowBands: 3 } });
    const five = pack(steps, { settings: { flowBands: 5 } });
    const larger = five.k > three.k ? five : three;
    const spine = pack(steps, { handsOver: true, settings: { flowBands: 4 } });
    expect(spine.plan).toEqual(larger.plan);
    expect(spine.k).toBe(larger.k);
    // Two: one band holds none of the crane's thirteen steps, so three; three tall steps pack larger in one.
    expect(pack(steps, { handsOver: true, settings: { flowBands: 2 } }).plan).toEqual(three.plan);
    const tall = alike(3, 20, 80);
    const oneBand = pack(tall, { handsOver: true, settings: { flowBands: 2 } });
    expect(oneBand.plan.bands).toEqual([3]);
    expect(oneBand.k).toBeGreaterThan(pack(tall, { settings: { flowBands: 3 } }).k);
  });

  it('holds a fixed count to the page’s steps', () => {
    expect(pack(alike(3), { settings: { flowBands: 5 } }).plan.bands).toHaveLength(3);
    expect(pack(alike(2), { handsOver: true, settings: { flowBands: 4 } }).plan.bands).toHaveLength(1);
  });
});

describe('packFlowPage: steps in bends', () => {
  it('stands a step in a bend only where that scores better than any plan without one', () => {
    let used = 0;
    for (const perPage of [4, 7, 9, 13]) {
      const allowed = packCrane(perPage);
      const without = packCrane(perPage, { flowBendSteps: false });
      allowed.forEach((page, pageIndex) => {
        if (page.plan.bends.some(Boolean)) {
          used += 1;
          // Page by page from the same scale before it, so the scores compare.
          const kPrev = pageIndex > 0 ? allowed[pageIndex - 1]!.k : null;
          const steps = craneSteps(setter).slice(pageIndex * perPage, (pageIndex + 1) * perPage);
          const input = { kPrev, up: pageIndex % 2 === 1, handsOver: pageIndex % 2 === 0 && pageIndex < allowed.length - 1, layoutCount: perPage };
          const best = pack(steps, { ...input, settings: { flowBendSteps: false } });
          expect(page.summary.score, `${perPage} a page, page ${pageIndex + 1}`).toBeGreaterThan(best.summary.score + 1e-9);
        } else if (pageIndex === 0) {
          expect(page.plan).toEqual(without[0]!.plan);
        }
      });
    }
    expect(used).toBeGreaterThan(0);
  });

  it('never stands a step in a bend when Steps in bends is off', () => {
    for (const perPage of [4, 5, 7, 9, 10, 13]) {
      for (const page of packCrane(perPage, { flowBendSteps: false })) {
        expect(page.plan.bends.some(Boolean)).toBe(false);
        expect(page.steps.some((step) => step.bend)).toBe(false);
      }
    }
  });

  it('stands a bend step at its band’s trailing edge, midway between the two bands it joins', () => {
    const pages = [...packCrane(4), ...packCrane(7), ...packCrane(13)];
    let seen = 0;
    for (const page of pages) {
      for (const step of page.steps.filter((s) => s.bend)) {
        seen += 1;
        const [band, next] = [page.bands[step.band]!, page.bands[step.band + 1]!];
        const edge = band.rightToLeft ? step.box.x : step.box.x + step.box.w;
        expect(edge).toBeCloseTo(band.rightToLeft ? area.x : area.x + area.w, 9);
        expect(step.box.y + step.box.h / 2).toBeCloseTo((band.top + band.height / 2 + next.top + next.height / 2) / 2, 9);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('packFlowPage: placement', () => {
  /** Each band's own steps, in reading order: none in a band of a short last page's stand-ins. */
  const bandSteps = (page: FlowPagePacking) =>
    page.bands.map((_, b) => page.steps.filter((step) => step.band === b && !step.bend));

  it('centres every step in its band with no nesting, and rises and dips each other one fully with all of it', () => {
    for (const flowNesting of [0, 1, 0.5]) {
      for (const page of packCrane(13, { flowNesting })) {
        bandSteps(page).forEach((steps, b) => {
          const { top, height } = page.bands[b]!;
          steps.forEach((step, j) => {
            const slack = height - step.box.h;
            const expected = top + slack / 2 + ((j % 2 === 0 ? -1 : 1) * flowNesting * slack) / 2;
            expect(step.box.y).toBeCloseTo(expected, 9);
          });
          if (flowNesting === 1 && steps.length >= 2) {
            // The first step of a band stands at its top, the second at its foot.
            expect(steps[0]!.box.y).toBeCloseTo(top, 9);
            expect(steps[1]!.box.y + steps[1]!.box.h).toBeCloseTo(top + height, 9);
          }
        });
      }
    }
  });

  it('keeps a turn’s gutter before a step with turns before it, and the step gap before every other, along its band as it reads', () => {
    const crane = craneSteps(setter);
    let turns = 0;
    for (const page of [...packCrane(7), ...packCrane(10)]) {
      for (const steps of bandSteps(page)) {
        steps.slice(1).forEach((step, j) => {
          const before = steps[j]!;
          const room = step.rightToLeft ? before.box.x - (step.box.x + step.box.w) : step.box.x - (before.box.x + before.box.w);
          const turning = crane.find((s) => s.id === step.id)!.turnsBefore;
          if (turning) turns += 1;
          expect(room).toBeGreaterThanOrEqual((turning ? PACKED_TURN_GUTTER_MM : STEP_GAP_MM) - 1e-9);
        });
      }
    }
    expect(turns).toBeGreaterThan(0);
  });

  it('turns every other band back, and stacks the bands from the foot on a page read up', () => {
    const down = pack(alike(9));
    const up = pack(alike(9), { up: true });
    expect(down.bands.map((band) => band.rightToLeft)).toEqual([false, true, false]);
    expect(up.bands.map((band) => band.rightToLeft)).toEqual([false, true, false]);
    expect(down.bands[0]!.top).toBeLessThan(down.bands[1]!.top);
    expect(up.bands[0]!.top).toBeGreaterThan(up.bands[1]!.top);
    // A band that turns back reads from the right.
    const second = down.steps.filter((step) => step.band === 1);
    expect(second[0]!.box.x).toBeGreaterThan(second[1]!.box.x);
  });

  it('keeps every step inside the area when the page fits', () => {
    for (const perPage of [4, 7, 9, 10, 13]) {
      for (const page of packCrane(perPage)) {
        expect(page.fits).toBe(true);
        for (const { box: b } of page.steps) {
          expect(b.x).toBeGreaterThanOrEqual(area.x - 1e-9);
          expect(b.y).toBeGreaterThanOrEqual(area.y - 1e-9);
          expect(b.x + b.w).toBeLessThanOrEqual(area.x + area.w + 1e-9);
          expect(b.y + b.h).toBeLessThanOrEqual(area.y + area.h + 1e-9);
        }
      }
    }
  });
});

describe('packFlowPage: a step’s box', () => {
  it('holds its number at the top left, its picture under it and its caption under that, each centred across', () => {
    const page = pack(craneSteps(setter).slice(0, 9));
    const step = page.steps[3]!;
    const { box: b, picture, caption } = step;
    const width = 48.79 * page.k;
    const measure = Math.round(Math.min(50, Math.max(28, width)));
    expect(picture.w).toBeCloseTo(width, 9);
    expect(picture.h).toBeCloseTo(48.79 * page.k, 9);
    expect(picture.y).toBeCloseTo(b.y + 5, 9);
    expect(picture.x + picture.w / 2).toBeCloseTo(b.x + b.w / 2, 9);
    expect(step.numberAt).toEqual({ x: b.x, y: b.y + STEP_NUMBER_ASCENT_MM });
    expect(caption.widthMm).toBe(measure);
    expect(caption.lines.map((line) => line.text)).toEqual(
      setter.paragraph('Collapse the base along the shown creases', measure, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines.map((line) => line.text)
    );
    expect(caption.x + measure / 2).toBeCloseTo(b.x + b.w / 2, 9);
    expect(caption.firstBaseline).toBeCloseTo(picture.y + picture.h + 2 + STEP_TEXT_SIZE_MM, 9);
    expect(b.w).toBeCloseTo(Math.max(width + 4, measure), 9);
    expect(b.h).toBeCloseTo(5 + picture.h + 2 + caption.lines.length * STEP_TEXT_LEADING_MM, 9);
  });

  it('gives a step with no caption no room for one, and never draws a box narrower than its number', () => {
    const [bare] = pack([{ ...alike(1)[0]!, text: '  ', numberWidth: 70 }]).steps;
    expect(bare!.caption.lines).toEqual([]);
    expect(bare!.box.h).toBeCloseTo(5 + bare!.picture.h, 9);
    expect(bare!.box.w).toBeGreaterThanOrEqual(70);
  });

  it('scales a picture with the page, its marks at their size', () => {
    const page = pack([{ ...alike(1)[0]!, size: { width: 40, height: 30 }, marks: { width: 10, height: 6 } }], { kPrev: 0.5 });
    const [step] = page.steps;
    expect(step!.picture.w).toBeCloseTo(30 * page.k + 10, 9);
    expect(step!.picture.h).toBeCloseTo(24 * page.k + 6, 9);
  });
});

describe('packFlowPage: scale', () => {
  // Pictures so small every plan fits at the largest scale: only the cap holds them.
  const tiny = alike(6, 5, 5);

  it('draws at most 1.4 times the reference size', () => {
    expect(pack(tiny).k).toBe(PAGE_SCALE.max);
  });

  it('holds a page’s scale to the page before’s, as steadily as asked', () => {
    expect(pack(tiny, { kPrev: 0.5 }).k).toBeCloseTo(0.5 * (1 + 0.6 * (1 - 0.85)), 12);
    expect(pack(tiny, { kPrev: 0.5, settings: { flowSteadiness: 1 } }).k).toBe(0.5);
    expect(pack(tiny, { kPrev: 0.5, settings: { flowSteadiness: 0 } }).k).toBeCloseTo(0.8, 12);
    expect(pack(tiny, { kPrev: 1.2, settings: { flowSteadiness: 0 } }).k).toBe(PAGE_SCALE.max);
    expect(pack(tiny, { kPrev: 0.5 }).summary.cap).toBeCloseTo(0.545, 12);
  });

  it('never caps a scale under the least the search starts from', () => {
    expect(pack(tiny, { kPrev: 0.01, settings: { flowSteadiness: 1 } }).k).toBe(PAGE_SCALE.min);
  });
});

describe('packFlowPage: a short last page', () => {
  it('packs a short last page as a full one, stand-ins shaped like its own steps filling the rest', () => {
    const crane = craneSteps(setter);
    const own = crane.slice(26);
    const short = pack(own, { layoutCount: 10 });
    expect(short.steps.map((step) => step.id)).toEqual(['crane-27', 'crane-28']);
    expect(short.summary.standIns).toBe(8);
    // As if its stand-ins were steps of their own: cyclic copies of its steps, with no turns before — but with
    // no step in a bend, since one stands there only with a real step after it, and here only stand-ins follow
    // the first step.
    const full = pack(
      Array.from({ length: 10 }, (_, i) => ({ ...own[i % own.length]!, id: `copy-${i}`, turnsBefore: i < own.length && own[i]!.turnsBefore })),
      { layoutCount: 10, settings: { flowBendSteps: false } }
    );
    expect(short.k).toBe(full.k);
    expect(short.plan).toEqual(full.plan);
    expect(short.steps.map((step) => step.box)).toEqual(full.steps.slice(0, 2).map((step) => step.box));
  });

  it('never stands a step in a bend with no real step after it: the page’s last step, or a stand-in', () => {
    const crane = craneSteps(setter);
    let seated = 0;
    for (let real = 2; real <= 8; real += 1) {
      for (const layoutCount of [7, 9, 10, 13]) {
        for (let start = 0; start + real <= crane.length; start += 3) {
          for (const up of [false, true]) {
            const page = pack(crane.slice(start, start + real), { layoutCount: Math.max(real + 1, layoutCount), up });
            const label = `${real} of ${layoutCount} from ${start}${up ? ', read up' : ''}`;
            expect(page.steps.at(-1)!.bend, label).toBe(false);
            seated += page.steps.filter((step) => step.bend).length;
          }
        }
      }
    }
    // Steps still stand in bends on short pages, with a step after them.
    expect(seated).toBeGreaterThan(0);
  });

  it('keeps a full page’s spacing on the crane’s last page', () => {
    const [, , last] = packCrane(13);
    expect(last!.steps).toHaveLength(2);
    expect(last!.summary.standIns).toBe(11);
  });
});

describe('packFlowPage: a page no plan fits', () => {
  it('shares its steps evenly over the band count that overflows least, draws them as large as that overflow allows, and says so', () => {
    const crane = craneSteps(setter);
    const steps = [...crane, ...crane].slice(0, 30).map((step, i) => ({ ...step, id: `m${i}` }));
    const page = pack(steps);
    expect(page.fits).toBe(false);
    expect(page.plan).toEqual({ bands: [6, 6, 6, 6, 6], bends: [false, false, false, false] });
    expect(page.steps).toHaveLength(30);
    expect(page.steps.every((step) => Number.isFinite(step.box.x) && Number.isFinite(step.box.y))).toBe(true);
    // Six steps a band overflow the page's width by the least each caption keeps, at any scale: the pictures are
    // drawn larger than the least scale (held there by a page before at it, steadily), and overflow no more.
    const least = pack(steps, { kPrev: PAGE_SCALE.min, settings: { flowSteadiness: 1 } });
    expect(least.k).toBe(PAGE_SCALE.min);
    expect(page.k).toBeGreaterThan(least.k * 1.2);
    const across = (packing: FlowPagePacking) =>
      Math.max(
        ...packing.bands.map((_, band) => {
          const boxes = packing.steps.filter((step) => step.band === band).map((step) => step.box);
          return Math.max(...boxes.map((box) => box.x + box.w)) - Math.min(...boxes.map((box) => box.x));
        })
      );
    expect(across(page)).toBeLessThanOrEqual(across(least) + 1e-6);
    const lowest = Math.max(...page.steps.map((step) => step.box.y + step.box.h));
    expect(lowest).toBeLessThanOrEqual(PROTOTYPE_AREA.y + PROTOTYPE_AREA.h + 1e-6);
  });

  it('packs nothing for a page of no steps', () => {
    const page = pack([]);
    expect(page.steps).toEqual([]);
    expect(page.fits).toBe(true);
  });
});

describe('packFlowPage: determinism', () => {
  it('packs the same input the same way every time, with a fresh setter or not', () => {
    for (const perPage of [7, 13]) {
      expect(packCrane(perPage)).toEqual(packCrane(perPage));
    }
    const fresh = () => fontTextSetter((key, weight) => FIXTURE_FONTS.font(key, weight)?.metrics ?? null, 'sc');
    expect(packCrane(10, {}, fresh())).toEqual(packCrane(10, {}, fresh()));
  });
});

describe('packingArea', () => {
  it('is the paper inside its margins, less the header and footer with their room when shown', () => {
    expect(packingArea({ widthMm: 210, heightMm: 297, marginMm: 12 }, 11, 8)).toEqual({ x: 12, y: 26, w: 186, h: 249 });
    expect(packingArea({ widthMm: 210, heightMm: 297, marginMm: 12 }, 0, 0)).toEqual({ x: 12, y: 12, w: 186, h: 273 });
    expect(packingArea({ widthMm: 148, heightMm: 210, marginMm: 10 }, 11, 0)).toEqual({ x: 10, y: 24, w: 128, h: 176 });
  });
});

/**
 * The slowest a 13-step page may pack (`implementation-plans/
 * diagram-flow-packing.md`, Goal: tens of milliseconds): about 3× the median
 * measured locally with a fresh font setter each time — the setter's first
 * faces are most of it — as the whole web suite runs around it (10.6 ms on
 * an M-series Mac, Node 22, 12 October 2026; 7.2–7.8 ms alone), for a CI
 * runner as loaded and slower. The plan allows 50.
 */
const BUDGET_MS = 32;

describe('the packing’s time budget', () => {
  it('packs a 13-step page in milliseconds', () => {
    const packOnce = () => {
      const fresh = fontTextSetter((key, weight) => FIXTURE_FONTS.font(key, weight)?.metrics ?? null, 'sc');
      const steps = craneSteps(fresh).slice(0, 13);
      const start = performance.now();
      packFlowPage(
        { steps, layoutCount: 13, area, up: false, handsOver: true, settings: DEFAULT_FLOW_PACKING, kPrev: null },
        fresh
      );
      return performance.now() - start;
    };
    packOnce();
    packOnce();
    const times = Array.from({ length: 7 }, packOnce).sort((a, b) => a - b);
    expect(times[3]).toBeLessThan(BUDGET_MS);
  });
});
