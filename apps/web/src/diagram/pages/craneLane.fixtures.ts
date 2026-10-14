import { flowLane, type FlowPagePlan, type LaneStop } from './flowLane';

/**
 * Zach's crane_final (A4, a 12 mm margin, a 25 mm band), as the layout hands
 * its pages to the lane at #443's 8ca99df5e: each picture's centre, its row,
 * whether a hand placed it, and its box as drawn. The file whose turns chose
 * the lane's rule (`flowLane.ts`, Zach's "(b4)"): every turn on its three
 * pages stands on the margin, pages 1 and 2 each bowing twice to keep their
 * turns 22 mm round; on page 3, 23→24 bows 0.75 mm under step 25, and 26→27
 * is 29.8 mm round with no bow.
 */
export const CRANE = { pageWidth: 210, margin: 12, halfWidth: 12.5, offPage: 10 } as const;

/** One stop: x, y, row, read right to left, placed, and its picture's left, right, top and bottom; then its step's number. */
type Row = [number, number, number, boolean, boolean, number, number, number, number, number];

const stop = ([x, y, row, rightToLeft, placed, left, right, top, bottom]: Row): LaneStop => ({
  x,
  y,
  row,
  rightToLeft,
  ...(placed ? { placed: true } : {}),
  picture: { left, right, top, bottom },
});

const PAGES: { plan: FlowPagePlan; spineIn: number | null; spineOut: number | null; tail: number; rows: Row[] }[] = [
  {
    plan: { side: 'left', up: false, firstRightToLeft: false, entry: 'none', exit: 'spine' },
    spineIn: null,
    spineOut: 232.7433,
    tail: 0,
    rows: [
      [40.375, 62.404, 0, false, false, 14.051, 66.699, 36.08, 88.728, 1],
      [110.135, 62.404, 0, false, false, 83.811, 136.459, 36.08, 88.728, 2],
      [174.75, 58.3015, 0, false, false, 153.5585, 195.9415, 37.11, 79.493, 3],
      [166.085, 139.9146, 1, true, false, 136.1704, 195.9996, 110, 169.8292, 4],
      [100.555, 153.4979, 1, true, true, 75.197, 125.913, 132.54, 174.4558, 5],
      [36.17, 134.1205, 1, true, false, 13.9995, 58.3405, 111.95, 156.2909, 6],
      [38.77, 211.9905, 2, false, true, 16.5995, 60.9405, 189.82, 234.1609, 7],
      [99.105, 239.2205, 2, false, true, 69.2602, 128.9498, 217.05, 261.3909, 8],
      [171.22, 229.5044, 2, false, false, 149.0495, 193.3905, 195.19, 263.8188, 9],
    ],
  },
  {
    plan: { side: 'right', up: true, firstRightToLeft: false, entry: 'spine', exit: 'turn' },
    spineIn: 232.7433,
    spineOut: null,
    tail: 0,
    rows: [
      [37.215, 235.9823, 0, false, true, 12.312, 62.118, 201.85, 270.1146, 10],
      [86.26, 236.2869, 0, false, true, 71.7592, 100.7608, 201.89, 270.6837, 11],
      [130.31, 236.0123, 0, false, true, 112.6846, 147.9354, 201.88, 270.1446, 12],
      [172.87, 224.7615, 0, false, true, 162.9235, 182.8165, 188.1, 261.4229, 13],
      [171.82, 138.6423, 1, true, true, 161.7456, 181.8944, 102.51, 174.7746, 14],
      [126.35, 148.1382, 1, true, true, 116.275, 136.425, 111.81, 184.4664, 15],
      [80.93, 144.0351, 1, true, true, 70.8877, 90.9723, 107.64, 180.4302, 16],
      [33.525, 144.2823, 2, false, true, 19.937, 47.113, 108.15, 180.4146, 17],
      [57.95, 58.2593, 2, false, true, 40.4601, 75.4399, 26.5, 90.0187, 18],
      [114.99, 59.9123, 2, false, true, 98.6229, 131.3571, 29.78, 90.0446, 19],
      [176.16, 56.6623, 2, false, true, 159.7929, 192.5271, 26.53, 86.7946, 20],
    ],
  },
  {
    plan: { side: 'left', up: false, firstRightToLeft: false, entry: 'turn', exit: 'none' },
    spineIn: null,
    spineOut: null,
    tail: 13.72,
    rows: [
      [44.17, 67.8423, 0, false, true, 26.062, 62.278, 37.71, 97.9746, 21],
      [107.855, 71.9423, 0, false, true, 80.9075, 134.8025, 41.81, 102.0746, 22],
      [166.175, 76.0571, 0, false, true, 135.3647, 196.9853, 44.71, 107.4043, 23],
      [167.205, 159.3538, 1, true, true, 142.8512, 191.5588, 135, 183.7076, 24],
      [110.515, 150.9538, 1, true, true, 86.1612, 134.8688, 126.6, 175.3076, 25],
      [51.31, 149.2173, 1, true, true, 30.0416, 72.5784, 129.66, 168.7746, 26],
      [41.79, 221.2623, 2, false, true, 12.7418, 70.8382, 195.13, 247.3946, 27],
      [115.95, 241.59, 2, false, true, 80.95, 150.95, 206.59, 276.59, 28],
    ],
  },
];

/** The step numbers on each of the crane's pages, in reading order. */
export const CRANE_STEPS: readonly (readonly number[])[] = PAGES.map((page) => page.rows.map((row) => row[9]));

/** The lane's input for the crane's `index`th page. */
export function craneFlow(index: number): Parameters<typeof flowLane>[0] {
  const page = PAGES[index]!;
  return { ...CRANE, plan: page.plan, spineIn: page.spineIn, spineOut: page.spineOut, tail: page.tail, stops: page.rows.map(stop) };
}

export const CRANE_PAGES = PAGES.length;
