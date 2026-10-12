/**
 * Where everything on a diagram's pages goes (D10): which steps are on which
 * page, each step's cell, its number, its picture box and the lines of its
 * instruction, the flow band, the title tab and the page numbers — in mm, with
 * the origin at the page's top-left.
 *
 * The mockup's `layout()` is the reference, with two changes the Phase 0
 * pages adopted:
 * - the picture box starts below the step number, which the mockup's formula
 *   printed over the picture;
 * - an instruction that needs more lines than its slot takes them from its
 *   picture box, down to half the box, and only then is cut with "…" — but
 *   always keeps one line, in a cell too short for even that at half.
 *
 * A picture is drawn in its cell's room: the cell's width less the gutter,
 * and the height its text leaves — taller than the square box where the text
 * is short, so a tall model keeps its scale and its cell runs taller rather
 * than the model shrinking. The text then starts below it.
 *
 * Every step is fitted (D10, "Fit each"), the paper keeping one scale from
 * step to step while it can ({@link scaleRuns}): a run of steps shares the
 * largest scale at which each fits its room, and a new run zooms in where the
 * model has grown much smaller, or out where it has grown for good. A picture
 * in a cell whose box gave room to text, and no longer fits there at its
 * run's scale, is drawn smaller, alone. Pictures with no paper — uploads, 3D
 * captures — keep one size of frame the same way. In the flow these are the
 * pictures' reference scales, every step's found in one cell, the one a page
 * of the diagram's steps per page is cut into ({@link pageGrid}), which each
 * page's packing multiplies by its one page scale.
 *
 * Which steps go on which page are the page plan's (`pagePlan.ts`,
 * {@link paginate}). A grid page is cut into its columns × rows, and a row of
 * fewer steps than the page's longest stands them at even shares of the
 * page's width. A flow page is packed by its steps' shapes into bands and
 * then held as packed (`flowPacking.ts`, `flowArrangement.ts`;
 * `implementation-plans/diagram-flow-packing.md`): its bands turn back at
 * each end, a step may stand in the bend between two, and each page's bands
 * run so that the lane carries on across a printed spread
 * ({@link flowPagePlan}): a right page the lane comes into at its spine reads
 * from the bottom band up. The lane is one smooth curve through the pictures
 * ({@link flowLane}).
 *
 * A turn between two steps (D22) has no cell: its glyph prints in the gutter
 * between the two pictures — midway on a row; across a flow page's bend, on
 * the lane there; at the next picture's leading edge across a grid's row or a
 * page; at the last picture's trailing edge after it. A grid with any turn
 * keeps a gutter wide enough between all its pictures, so its one paper scale
 * stays one scale; a flow page keeps one before each step a turn comes
 * before.
 *
 * An enlarged step (Revision 2) is laid out as its window — what its frame
 * takes in, of its content where its frame is cut — in runs of its own, never
 * the Fit each runs: as large as its room allows, at most six times the area
 * it enlarges as that prints, or at its Size times that ({@link zoomScales}).
 * The enlarge arrow before one, when the step before it shows an area, takes
 * a turn's places and gutter, after any turns standing there; a flow page
 * keeps that gutter before every enlarged step after another, whether the
 * arrow prints or not, so a mark or a picture never re-packs a page.
 *
 * Measurement is injected ({@link TextSetter}): the composer sets text from
 * the font's own advances, tests with an estimate.
 *
 * Pure.
 */
import type {
  DiagramArrangedStep,
  DiagramPageArrangement,
  DiagramPageSetup,
  DiagramPageSide,
  DiagramPlaceScale,
  DiagramStepPlace,
  DiagramTurnKind,
} from '../document/diagramDocument';
import type { DiagramFontFace } from '../fonts/diagramFontFaces';
import {
  arrangedBox,
  arrangedCaptionWidth,
  arrangedOverflow,
  arrangedPictureRoom,
  arrangementFits,
  grownToHold,
  packedArrangement,
  type ArrangedOverflow,
} from './flowArrangement';
import { roundPageArrangement } from '../document/pageArrangements';
import {
  bendXAt,
  flowLane,
  flowPagePlan,
  pageSide,
  rowRightToLeft,
  type FlowPagePlan,
  type Lane,
  type LaneStop,
} from './flowLane';
import {
  PACKED_TURN_GUTTER_MM,
  PICTURE_SIDE_MM,
  packFlowPage,
  packingArea,
  stepPartsInBox,
  type PackRect,
  type PackStep,
} from './flowPacking';
import { PICTURE_HEIGHT_SHARE, TURN_GUTTER_MM, flowShape, paginate, printableArea, type PlannedPage } from './pagePlan';
import { holdsArrangement, keepsGlyphGutter, pageSignatures, titleShown } from './pageSignature';
import { printPaper, type PrintPaper } from './printPaper';
import { normalizeStepPlace } from '../document/placeValues';
import { pageOffset, partBox, placeCell, placementClashes, type PageBox, type PlacementClash } from './pagePlacement';
import type { Polygon } from './pagePolygons';
import { STEP_NUMBER_SIZE_MM, STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM, TEXT_DESCENT_MM } from './stepType';

// The type a step is set in, which placement's hit boxes measure too.
export { STEP_NUMBER_SIZE_MM, STEP_TEXT_LEADING_MM, STEP_TEXT_SIZE_MM } from './stepType';
/** The step number's baseline below the cell's top, and its inset from the cell's side. */
const STEP_NUMBER_BASELINE_MM = 7;
const STEP_NUMBER_INSET_MM = 1.5;
/** The picture box's top below the cell's top: under the number. */
const PICTURE_TOP_MM = 8;
// The picture box's share of a cell and the turn gutter choose a flow page's rows, so they live with its plan.
export { PICTURE_HEIGHT_SHARE, TURN_GUTTER_MM, flowShape } from './pagePlan';
/** The instruction's first baseline below the picture box. */
const TEXT_GAP_MM = 5;
/** The smallest a picture box gives way to text: half of it. */
const PICTURE_FLOOR = 0.5;
/** The header and the footer, when shown. */
export const HEADER_MM = 11;
export const FOOTER_MM = 8;
/** The title tab: its height, the text's inset and size, and the rule beside it. */
const TAB_HEIGHT_MM = 7;
const TAB_PADDING_MM = 4;
export const TITLE_SIZE_MM = 3.8;
const TITLE_BASELINE_MM = 4.9;
const TITLE_RULE_Y_MM = 6.8;
export const PAGE_NUMBER_SIZE_MM = 3.4;
const PAGE_NUMBER_RAISE_MM = 1.5;
/**
 * How far art that reaches the paper's edge runs on past it: the flow band
 * where the sequence goes on, and the title tab and rule on a page with no
 * margin. Past any bleed a print shop asks for, so the cut never shows paper.
 */
const OFF_PAGE_MM = 10;
/**
 * Flow: how far from the paper's edge a page with turns keeps its steps'
 * boxes, so a turn standing at the page's edge, held on the paper, clears the
 * pictures (whose boxes keep half their side room beside them): a turn's
 * gutter from the edge to the picture, as a grid keeps.
 */
const EDGE_TURN_ROOM_MM = TURN_GUTTER_MM - PICTURE_SIDE_MM / 2;
/** The room beside a picture box in its cell, together: the gutter between two pictures. */
const PICTURE_SIDE_ROOM_MM = 6;
/**
 * What a change of scale between two steps costs, against how
 * much smaller than it could be each picture is drawn — the log of the
 * ratio, summed over the pictures (`scaleRuns`). One: as much as five
 * pictures drawn a fifth smaller, or one at under two fifths of its size.
 */
export const FIT_RUN_BREAK = 1;
/** Scales this near each other are one: the larger drawn at the smaller, wherever in the diagram. */
export const FIT_SAME = 1.06;
/**
 * The least change of scale from one step to the next: a
 * smaller one does not read as a zoom, only as the paper changing size, so
 * two runs nearer than this are drawn as one at the smaller of their scales.
 */
export const FIT_ZOOM = 1.3;
/**
 * The most of its room what a picture's marks keep at their pt size may
 * take — letters, glyphs, heads — in a room cut down to a few mm for its
 * text: past it, they reach out of the room rather than the paper shrink to
 * a dot inside them. Where marks lie, which grows with the picture, is
 * always given room.
 */
export const MARKS_FLOOR = 0.5;
/**
 * A turn's glyph as it prints (`composeDiagramPage`, at the pictures' line
 * width), its ink measured with room for the stroke: the turn-over's long and
 * short sides — lying on its side when it turns top to bottom — and the
 * rotation's circle with its heads.
 */
const TURN_OVER_GLYPH_MM = { long: 11.6, short: 5.6 } as const;
const ROTATE_GLYPH_MM = 8.8;
/** The clear space between two turns standing in one gutter, one above another. */
export const TURN_STACK_CLEAR_MM = 1.5;
/**
 * Fill (Revision 2, Z4): an enlarged step prints as large as its room allows,
 * never smaller than the area it enlarges as that prints, nor more than six
 * times it; a Size is held the same.
 */
export const ZOOM_FILL = { min: 1, max: 6 } as const;

/** The box a turn's glyph prints in, in mm, centred on its place. */
export function turnGlyphMm(turn: DiagramTurnKind): { w: number; h: number } {
  if (turn.kind === 'rotate') return { w: ROTATE_GLYPH_MM, h: ROTATE_GLYPH_MM };
  const { long, short } = TURN_OVER_GLYPH_MM;
  return turn.axis === 'horizontal' ? { w: short, h: long } : { w: long, h: short };
}

/**
 * What stands in the gutter before a step: the turns between it and the step
 * before (D22), in order, then the enlarge arrow when one prints there
 * (Revision 2).
 */
type BetweenGlyph = ({ kind: 'turn' } & LayoutTurn) | { kind: 'enlarge'; arrowFrom: LayoutZoomArea };

/** The glyphs before a step, turns first. */
function glyphsBefore(step: LayoutStep): BetweenGlyph[] {
  const turns = step.turnsBefore.map((turn): BetweenGlyph => ({ kind: 'turn', ...turn }));
  const arrowFrom = step.zoom?.arrowFrom;
  return arrowFrom ? [...turns, { kind: 'enlarge', arrowFrom }] : turns;
}

/** The box a glyph prints in, in mm, centred on its place: an enlarge arrow's along its row, or aimed so. */
function glyphMm(glyph: BetweenGlyph, aim: LayoutArrowAim | null = null): { w: number; h: number } {
  if (glyph.kind === 'turn') return turnGlyphMm(glyph.turn);
  return aim ? glyph.arrowFrom.aimedBox(aim) : glyph.arrowFrom.box;
}

/** One run of a set line: a font and its text, placed from the line's start. */
export interface SetRun {
  font: string;
  text: string;
  xMm: number;
  widthMm: number;
}

export interface SetLine {
  text: string;
  widthMm: number;
  runs: SetRun[];
  /** The line ends in "…": text was cut after it. */
  ellipsis: boolean;
}

export interface SetText {
  lines: SetLine[];
  /** How many lines the whole text needs at this width. */
  linesNeeded: number;
}

/** How text is measured and set: the composer's font, or a test's estimate. */
export interface TextSetter {
  /** `text` broken into lines at most `widthMm` wide, at most `maxLines` of them (the last cut with "…"). */
  paragraph: (text: string, widthMm: number, sizeMm: number, maxLines: number) => SetText;
  /** One line: a title or a number, cut with "…" at `maxWidthMm` when one is given. */
  line: (text: string, sizeMm: number, weight: 400 | 700, maxWidthMm?: number) => SetLine;
  /**
   * A run of an upload's text (`uploadText.ts`), set in `face`, in the faces
   * that set it: its own, or for a character its own lacks, the first font
   * that has it. Nothing is measured: the upload places its own text.
   */
  runs: (text: string, face: DiagramFontFace) => { face: DiagramFontFace; text: string }[];
}

/** What the layout needs of a step. */
export interface LayoutStep {
  id: string;
  text: string;
  breakBefore: boolean;
  /** The page it starts holds this many steps (`DiagramStep.pageSteps`): in the flow only ({@link paginate}). */
  pageSteps?: number;
  /**
   * The picture with what its marks reach past it — annotations, a
   * References step's letters — for its scale, in two parts: where
   * its marks lie, which grows with the picture — its width and height in
   * document units when it knows its paper (`paper`), or per its frame's
   * longer side when it is only fitted (`fit`) — and what they reach past
   * that at their pt size, in mm (`marks`). Its frame alone in the first
   * units. And where the reach lies: how far past each edge of the frame, in
   * the same two parts (`sides`; across, `width` is the frame's and the left
   * and right sides' growth together, `marks` their pt parts) — absent, its
   * marks are taken as even on both sides. Null for a step with no picture.
   *
   * An enlarged step's picture is its window (`zoom`): its frame the
   * content box — the window, or for a cut frame the paper inside it and the
   * boundary's pieces — in the window's units, its longer side one, its marks
   * as any picture's; drawn at the window's printed longer side, in mm.
   */
  picture: {
    kind: 'paper' | 'fit' | 'zoom';
    width: number;
    height: number;
    frame: { width: number; height: number };
    marks: { width: number; height: number };
    sides?: ReachSides;
  } | null;
  /**
   * The largest scale at which the picture fits a room `across` × `down` mm,
   * where how far its marks reach depends on its scale: found by measuring
   * it there (`layoutDiagram`). Absent, `pictureFit` of `picture`.
   */
  fitIn?: (across: number, down: number) => number | null;
  /**
   * The most the picture is drawn at, alone, whatever its run's scale: one
   * whose marks reach out unevenly may hold its room at its fit and not at a
   * smaller scale its run draws it at (`layoutDiagram`).
   */
  atMost?: number;
  /**
   * Its picture measured at `scale`, in its own measure, for how far its
   * marks reach there (`layoutDiagram`): what a flow page is packed by, at
   * the picture's reference scale. Absent, `picture` as measured.
   */
  pictureAt?: (scale: number) => LayoutStep['picture'];
  /** The turns between the step before and this one (D22), in order. */
  turnsBefore: readonly LayoutTurn[];
  /** The turns after the last step; empty on every other. */
  turnsAfter: readonly LayoutTurn[];
  /** What sizes an enlarged step (Revision 2); absent on every other. */
  zoom?: LayoutZoom;
  /**
   * An enlarged step with no window to show yet — seeded by Insert Step
   * After, before its first picture lands its frame (Revision 2): it joins no
   * run of enlarged steps and parts none ({@link zoomScales}), and no arrow
   * prints before it. Absent on every other.
   */
  zoomPending?: true;
  /**
   * The step's hand placement (`implementation-plans/diagram-page-overrides.md`):
   * absent on a step placed by no one, a newer build's step, and one whose
   * placement only a newer build reads. Applied after the automatic layout,
   * before ribbon and symbol placement.
   */
  place?: DiagramStepPlace;
  /**
   * Its picture's paper and marks, each a convex outline in its ink box's
   * terms, so the box's empty corners stay free (`pictureFootprints`):
   * worked out only when a placement clash asks for them
   * (`placementClashes`), once per picture and measure. Absent, or
   * undefined when called, where only the box is known.
   */
  footprints?: () => readonly Polygon[] | undefined;
}

/**
 * The enlarge area an arrow leaves: on which step, which area there, and its
 * longer side in that step's picture units; and the box the arrow prints in,
 * mm, as its outline paints it (`enlargeArrowSizes`), which this module,
 * laying out and never painting, is handed — along a row, and aimed across a
 * flow page's bend.
 */
export interface LayoutZoomArea {
  stepId: string;
  areaId: string;
  share: number;
  box: { w: number; h: number };
  aimedBox: (aim: LayoutArrowAim) => { w: number; h: number };
}

/**
 * Which way an enlarge arrow points where it does not point along its row —
 * across a flow row's end, at the enlarged step it leads to (Zach,
 * 2026-10-07): the arrow that points right with its bow up, flipped about its
 * chord when `flipped` (its bow then on its right), turned `angle` radians
 * clockwise on the page, whose y runs down.
 */
export interface LayoutArrowAim {
  angle: number;
  flipped: boolean;
}

/**
 * What the layout needs of an enlarged step (Revision 2) to size it against
 * the area it enlarges, all derived from the document and never stored.
 */
export interface LayoutZoom {
  /**
   * The area the enlarge arrow before it leaves, when the step before it
   * shows one (`zoomIndex`); null where no arrow prints. What its size is
   * measured against.
   */
  arrowFrom: LayoutZoomArea | null;
  /** Its frame's longer side, in its whole picture's units. */
  frameShare: number;
  /** Its window's longer side, in its whole picture's units: one of the units it is laid out in. */
  windowShare: number;
  /**
   * Its whole picture, as the steps round it print theirs: by its pattern
   * units across its longer side when it knows its paper, else fitted. How
   * large its frame would print among them, with no arrow before it.
   */
  whole: { kind: 'paper'; units: number } | { kind: 'fit' };
  /** Its Size: so many times the area as it prints; null for Fill. */
  scale: number | null;
}

/**
 * How far a picture's reach lies past one edge of its frame, in mm at a
 * scale: `grows × scale + beyond`, as measured near that scale.
 */
export interface ReachLine {
  grows: number;
  beyond: number;
}

/** A picture's reach past each edge of its frame (`ReachLine`). */
export interface ReachSides {
  left: ReachLine;
  right: ReachLine;
  top: ReachLine;
  bottom: ReachLine;
}

/** A turn between two steps, as the layout places it. */
export interface LayoutTurn {
  id: string;
  turn: DiagramTurnKind;
}

export interface LayoutCell {
  stepId: string;
  /** 1-based, as printed. */
  number: number;
  /** Where the step is at home: its cell on a grid page, its box on a flow page, as its page's arrangement keeps it. */
  cellMm: { x: number; y: number; w: number; h: number };
  /** Its band on its flow page, from 0 in reading order (`flowPacking.ts`); a step in a bend, the band before it. In the flow only. */
  band?: number;
  /** It stands in the bend after its band, between that band and the next: in the flow only. */
  bend?: true;
  /**
   * Its picture or its caption no longer fits the box its flow page keeps for
   * it (`flowArrangement.ts`): its own new picture or caption, which is drawn
   * whole all the same, until a re-pack gives it another box. Absent where both fit.
   */
  overflow?: ArrangedOverflow;
  /**
   * Where each part is at home, for the Pages view's ghost of a moved one
   * (`placeCell`): the frame where the layout puts the step, each other part
   * where it sits in its frame, moved or not.
   */
  homeParts?: { frame: PageBox; number: PageBox; picture: PageBox; text: PageBox };
  numberMm?: PageBox;
  inkMm?: PageBox;
  /** Its row reads right to left: every other band of a flow page. Every grid row reads left to right. */
  rightToLeft?: boolean;
  placed?: {
    offsets: DiagramStepPlace;
    pin: 'applied' | 'kind' | 'empty' | null;
    auto: { mmPerUnit: number | null; frameMm: number | null; drawMm: PageBox };
  };
  clashes?: PlacementClash[];
  /** The picture's square box: where a fitted picture goes, and an empty step's placeholder. */
  pictureMm: { x: number; y: number; size: number };
  /**
   * Where the picture is drawn, centred: as wide as the cell's room, and as
   * tall as the square box or the picture at its scale, whichever is taller —
   * from the box's top. The text starts below it.
   */
  drawMm: { x: number; y: number; w: number; h: number };
  /** Millimetres per document unit for a paper picture; null when it is fitted (or there is none). */
  mmPerUnit: number | null;
  /**
   * The longer side a picture with no paper is drawn at, in mm, as its run
   * keeps it ({@link scaleRuns}) — an enlarged step's window's
   * ({@link zoomScales}). Null for a paper picture, and for a step with no
   * picture.
   */
  frameMm: number | null;
  /** The picture drawn smaller than its scale's run: its box gave room to text, or it reached too far. */
  scaleReduced: boolean;
  /**
   * An enlarged step's size against the area it enlarges (Revision 2): the
   * Size asked for (null for Fill), how many times the area it prints at, and
   * whether its room made it smaller than its run asked. Absent on a step that
   * is not enlarged, or one whose area's size is not known.
   */
  zoom?: { asked: number | null; printed: number; reduced: boolean };
  numberAt: { x: number; y: number };
  text: { x: number; firstBaseline: number; widthMm: number; lines: SetLine[] };
  /** The instruction did not fit even with the picture at its floor: it ends in "…". */
  textOverflow: boolean;
}

export interface LayoutPage {
  /** As printed: the setup's first number plus the page's index. */
  number: number;
  /** The side of its spread the page prints on: its number is at the outer corner. */
  side: DiagramPageSide;
  cells: LayoutCell[];
  /** The flow layout's lane, as drawn, or null. */
  band: Lane | null;
  flow?: Parameters<typeof flowLane>[0];
  /**
   * A flow page's arrangement, as drawn: its page scale, whether it was packed
   * by this layout (and is in {@link DiagramPagesLayout.packed}) rather than
   * held, and whether every box fits the page's area — false only for a page
   * no plan fitted even at the least scale, drawn overflowing. Absent on a
   * grid, and on the one page of a diagram with no steps.
   */
  packing?: { k: number; packed: boolean; fits: boolean };
  /**
   * The turns on the page (D22), in the document's order: each glyph's centre
   * and printed box, the step it comes before — null for those after the last
   * step — and whether the row it stands in reads right to left, as every
   * other flow row does (which ones, the page's plan says).
   */
  turns: (LayoutTurn & {
    at: { x: number; y: number };
    box: { w: number; h: number };
    beforeStepId: string | null;
    rightToLeft: boolean;
  })[];
  /**
   * The enlarge arrows on the page (Revision 2), in order: each placed as a
   * turn's glyph would be before its enlarged step, after any turns there;
   * the area it leaves; whether it reads right to left; and whether it
   * stands alone in the gutter of a row it shares with the area's step, where
   * the page lifts it to the area's height (`composeDiagramPage`).
   */
  zoomArrows: LayoutZoomArrow[];
  pageNumberAt: { x: number; y: number; anchor: 'start' | 'end' } | null;
}

/** An enlarge arrow as the layout places it ({@link LayoutPage.zoomArrows}). */
export interface LayoutZoomArrow {
  at: { x: number; y: number };
  box: { w: number; h: number };
  beforeStepId: string;
  areaStepId: string;
  areaId: string;
  rightToLeft: boolean;
  liftable: boolean;
  /** Across a flow row's end, aimed at the enlarged step it leads to; null where it points along its row. */
  aim: LayoutArrowAim | null;
}

export interface DiagramPagesLayout {
  paper: PrintPaper;
  pages: LayoutPage[];
  /**
   * The first page's cells: every grid page's. In the flow, the one cell
   * every step finds its reference scale in ({@link pageGrid}); each step
   * carries its own box.
   */
  cellMm: { w: number; h: number };
  /**
   * The arrangements this layout packed, by the step each page starts with:
   * every flow page that held none for its structure. What the store adopts
   * (`adoptDiagramPageArrangements`), so the next layout holds them. Absent
   * when nothing was packed.
   */
  packed?: Readonly<Record<string, DiagramPageArrangement>>;
  /** The title tab, when shown. */
  title: {
    tab: { x: number; y: number; w: number; h: number };
    textAt: { x: number; y: number };
    line: SetLine;
    rule: { x1: number; x2: number; y: number };
  } | null;
  /** The band's width, for the flow layout's path: the page setup's (`DiagramPageSetup.pathWidthMm`). */
  bandWidthMm: number;
  /** The band's ink: the page setup's path colour. */
  bandInk: string;
}

/**
 * The columns and rows a full page is cut into under a setup: a grid's own; a
 * flow page of its default steps per page, {@link flowShape}'s on the paper
 * inside its margins — the one cell every flow step finds its reference scale
 * in, whatever page it is on. A flow page's own rows are its plan's
 * (`pagePlan.ts`, {@link paginate}), which hold its own number of steps, odd
 * on a left page that hands over at its spine; no picture's size reads them.
 *
 * Read from the setup alone, never the title, and never less the header and
 * the footer: typing a title or turning page numbers on never re-cuts a page
 * (`implementation-plans/diagram-page-overrides.md`, Phase 1b).
 */
export function pageGrid(setup: DiagramPageSetup): { columns: number; rows: number } {
  if (setup.layout !== 'flow') return { columns: setup.columns, rows: setup.rows };
  return flowShape(setup.stepsPerPage, printableArea(setup));
}

/** Where a page's `k`th step stands in its rows: its row and its place along it, both in reading order, and how many the row holds. */
interface RowSlot {
  row: number;
  along: number;
  count: number;
}

/** Each place on a page, by `k`, from its plan's rows ({@link PlannedPage.rowCounts}): a grid's are its columns, row by row. */
function rowSlots(page: PlannedPage): RowSlot[] {
  return page.rowCounts.flatMap((count, row) => Array.from({ length: count }, (_, along) => ({ row, along, count })));
}

/**
 * A cell of a page cut into columns × rows (D10): as tall as the page inside
 * its margins, less the header and the footer, over the rows, and as wide as
 * the paper inside its margins over the columns; a picture's room across it,
 * the cell less the gutter between pictures; the square box, the lesser of
 * that and the cell's {@link PICTURE_HEIGHT_SHARE}; and the instruction's
 * width, as the mockup sets it.
 */
interface CellCut {
  cellW: number;
  cellH: number;
  roomW: number;
  fullBox: number;
  textWidth: number;
}

/** How a page is cut: its plan and its places in its rows, and its cells — a grid's by its plan, every flow page's the diagram's one reference cell. */
interface PageCut extends CellCut {
  page: PlannedPage;
  slots: RowSlot[];
}

/**
 * The largest scale at which a picture fits its cell's room: with its text
 * in full (`own`), and for the runs, with a long text's cut to its box left
 * aside (`shared`) — such a picture is drawn smaller alone.
 */
export interface ScaleFit {
  own: number;
  shared: number;
}

/**
 * The scale each picture is drawn at, in order, so that the
 * paper keeps one size from step to step where it can — a diagram's steps
 * draw the model alike — and changes it only where the model has grown
 * smaller or larger for long enough to be worth it, and by enough to read as
 * a zoom.
 *
 * The pictures are cut into runs, each drawn at one scale no picture in it is
 * too big for, so as to cost least: every picture drawn smaller than it could
 * be costs the log of how much smaller, and every change of scale between
 * runs {@link FIT_RUN_BREAK}. Two runs side by side are at least
 * {@link FIT_ZOOM} apart: a smaller change does not read as a zoom, only as
 * the paper changing size. So a model smaller for one step is drawn at its
 * neighbours' scale, one smaller for several zooms in, and a step that needs
 * more room (a flap's outline far above it) lowers its run or stands alone —
 * drawn a zoom under its neighbours if it needs a little more room than that
 * — whichever costs least. A run is drawn at its smallest picture's scale, or
 * some zooms under another's — under a run under another run — but never a
 * whole zoom under its own smallest: a
 * run that small would be there only to part the runs either side, letting
 * them differ by less than a zoom. The least-cost cut and scales among those
 * are found exactly (dynamic programming over where the last run starts and
 * its scale), read from the same end whichever is given, so where cuts tie
 * the same one is cut; a diagram that reads the same from either end is drawn
 * so ({@link mirroredRuns}).
 *
 * Runs whose scales are within {@link FIT_SAME} are then drawn at one,
 * wherever in the diagram, where that keeps each a zoom from its neighbours.
 * A picture is drawn at its run's scale, or its own when that is smaller
 * (`reduced`: a long instruction took its room). Pure.
 */
/**
 * The scales a run may be drawn at, as logs in order, each with the scale it
 * is: a picture's own, or any number of zooms under one — a run held a zoom
 * under one held a zoom under another — down to where no run could be drawn,
 * a whole zoom under the smallest picture. Only those some picture is less
 * than a zoom above: a run is never a whole zoom under all its pictures, so
 * no other can end one, and one fit far under the rest — a picture drawn at
 * nearly nothing — would otherwise add a level for every zoom between.
 */
export function runLevels(shares: readonly number[]): { levels: number[]; scaleAt: Map<number, number> } {
  const logs = shares.map(Math.log);
  const zoom = Math.log(FIT_ZOOM);
  const apart = zoom * (1 - 1e-9);
  const scaleAt = new Map<number, number>();
  shares.forEach((share, index) => scaleAt.set(logs[index]!, share));
  const real = logs.filter((_, index) => shares[index] !== Number.MIN_VALUE);
  const deepest = (real.length > 0 ? Math.min(...real) : 0) - apart;
  const sorted = [...logs].sort((a, b) => a - b);
  shares.forEach((share, index) => {
    for (let k = 1; logs[index]! - k * zoom > deepest; k += 1) {
      const level = logs[index]! - k * zoom;
      if (scaleAt.has(level)) continue;
      // A picture at or above the level and less than a zoom above it.
      if (!(sorted[firstAtLeast(sorted, level)]! < level + apart)) continue;
      scaleAt.set(level, share / FIT_ZOOM ** k);
    }
  });
  return { levels: [...scaleAt.keys()].sort((a, b) => a - b), scaleAt };
}

/** The first index of ascending `sorted` whose value is at least `value`; its length when none is. */
function firstAtLeast(sorted: readonly number[], value: number): number {
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** How near, as a share, two fits are that differ only by rounding. */
const MIRROR_SAME = 1e-9;

export function scaleRuns(fits: readonly ScaleFit[]): { scale: number; reduced: boolean }[] {
  const count = fits.length;
  if (count === 0) return [];
  // A fit of nothing — a room of no size — is a picture drawn at nothing, alone.
  const given = fits.map(({ shared }) => (Number.isFinite(shared) && shared > 0 ? shared : Number.MIN_VALUE));
  // A picture and its mirror that fit alike but for rounding — the same
  // picture in a room a row lower, its height a few ulps off — fit the same,
  // the smaller: so a diagram that reads the same either way is drawn so.
  const shares = given.map((share, index) => {
    const mirror = given[count - 1 - index]!;
    return Math.abs(share - mirror) <= MIRROR_SAME * Math.max(share, mirror) ? Math.min(share, mirror) : share;
  });
  // Read from one end whichever end is given — the one whose first picture
  // unlike its mirror's is the smaller — so where cuts tie, the same is cut.
  const turn = shares.findIndex((share, index) => share !== shares[count - 1 - index]);
  if (turn >= 0 && shares[turn]! > shares[count - 1 - turn]!) return scaleRuns([...fits].reverse()).reverse();
  const logs = shares.map(Math.log);
  const zoom = Math.log(FIT_ZOOM);
  const apart = zoom * (1 - 1e-9);
  const { levels, scaleAt } = runLevels(shares);
  const width = levels.length;
  // For each level, the highest a zoom or more below it and the lowest a zoom or more above it.
  const below = new Int32Array(width);
  const above = new Int32Array(width);
  for (let v = 0, u = -1; v < width; v += 1) {
    while (u + 1 < width && levels[u + 1]! <= levels[v]! - apart) u += 1;
    below[v] = u;
  }
  for (let v = width - 1, u = width; v >= 0; v -= 1) {
    while (u - 1 >= 0 && levels[u - 1]! >= levels[v]! + apart) u -= 1;
    above[v] = u;
  }

  // best[j][v]: the least the first j pictures cost with their last run at
  // level v; from[j][v], where that run starts, and before[j][v], the level
  // of the run before it (-1 for none).
  const best = new Float64Array((count + 1) * width).fill(Infinity);
  const from = new Int32Array((count + 1) * width);
  const before = new Int32Array((count + 1) * width);
  // next[i][v]: the least the first i pictures cost with their last run a
  // zoom or more from level v, and that run's level.
  const next = new Float64Array((count + 1) * width).fill(Infinity);
  const nextAt = new Int32Array((count + 1) * width).fill(-1);
  const lowest = new Float64Array(width);
  const lowestAt = new Int32Array(width);
  const highest = new Float64Array(width);
  const highestAt = new Int32Array(width);
  const ended = (i: number) => {
    const row = i * width;
    for (let u = 0; u < width; u += 1) {
      const cost = best[row + u]!;
      const better = u === 0 || cost < lowest[u - 1]!;
      lowest[u] = better ? cost : lowest[u - 1]!;
      lowestAt[u] = better ? u : lowestAt[u - 1]!;
    }
    for (let u = width - 1; u >= 0; u -= 1) {
      const cost = best[row + u]!;
      const better = u === width - 1 || cost < highest[u + 1]!;
      highest[u] = better ? cost : highest[u + 1]!;
      highestAt[u] = better ? u : highestAt[u + 1]!;
    }
    for (let v = 0; v < width; v += 1) {
      const down = below[v]! >= 0 ? lowest[below[v]!]! : Infinity;
      const up = above[v]! < width ? highest[above[v]!]! : Infinity;
      next[row + v] = Math.min(down, up);
      nextAt[row + v] = down <= up ? (below[v]! >= 0 ? lowestAt[below[v]!]! : -1) : highestAt[above[v]!]!;
    }
  };
  // Per level, the runs that may end at the next picture, by where they
  // start: since the last picture too small for the level, each keyed by
  // what it costs before its own pictures (`earlier − S(start) + start ×
  // level`, S the logs before a picture), so that one running best per level
  // stands for them all. A run is never drawn a whole zoom under its own
  // smallest picture — it would only part the runs either side, a step drawn
  // small to let them differ by less — so a start waits (`pending`) until its
  // run holds a picture less than a zoom above the level (`eligible`).
  const eligible = new Float64Array(width).fill(Infinity);
  const eligibleAt = new Int32Array(width).fill(-1);
  const pending = new Float64Array(width).fill(Infinity);
  const pendingAt = new Int32Array(width).fill(-1);
  let total = 0;
  for (let j = 1; j <= count; j += 1) {
    const i = j - 1;
    for (let v = 0; v < width; v += 1) {
      const level = levels[v]!;
      if (level > logs[i]!) {
        // A picture too small for the level: no run at it goes past it.
        eligible[v] = pending[v] = Infinity;
        eligibleAt[v] = pendingAt[v] = -1;
        continue;
      }
      const earlier = i === 0 ? 0 : next[i * width + v]! + FIT_RUN_BREAK;
      if (earlier < Infinity) {
        const key = earlier - total + i * level;
        // The later start on a tie: the shorter last run.
        if (key <= pending[v]!) {
          pending[v] = key;
          pendingAt[v] = i;
        }
      }
      if (logs[i]! < level + apart) {
        if (pending[v]! <= eligible[v]!) {
          eligible[v] = pending[v]!;
          eligibleAt[v] = pendingAt[v]!;
        }
        pending[v] = Infinity;
        pendingAt[v] = -1;
      }
      const start = eligibleAt[v]!;
      if (start < 0) continue;
      const at = j * width + v;
      best[at] = eligible[v]! + total + logs[i]! - j * level;
      from[at] = start;
      before[at] = start === 0 ? -1 : nextAt[start * width + v]!;
    }
    total += logs[i]!;
    if (j < count) ended(j);
  }
  // The cheapest end, the larger scale on a tie.
  let level = width - 1;
  for (let v = width - 1; v >= 0; v -= 1) if (best[count * width + v]! < best[count * width + level]!) level = v;
  let runs: { from: number; to: number; scale: number }[] = [];
  for (let j = count; j > 0; ) {
    const at = j * width + level;
    runs.unshift({ from: from[at]!, to: j, scale: scaleAt.get(levels[level]!)! });
    j = from[at]!;
    level = before[at]!;
  }
  if (turn < 0) runs = mirroredRuns(runs, logs);

  // Near enough is one, wherever in the diagram: each scale joins the
  // smallest within FIT_SAME below it that leads its own, so a chain of near
  // scales does not drift down. A run takes it only where it still reads as a
  // zoom from each neighbour, as drawn and as snapped, and is still less than
  // a whole zoom under its own smallest picture, as the cut keeps it — every
  // run decided at once, so the answer does not depend on which end is read
  // first.
  const leaders = new Map<number, number>();
  let leader = -Infinity;
  for (const scale of [...new Set(runs.map(({ scale }) => scale))].sort((a, b) => a - b)) {
    if (!(scale <= leader * FIT_SAME)) leader = scale;
    leaders.set(scale, leader);
  }
  const reads = (a: number, b: number) => a === b || Math.max(a, b) / Math.min(a, b) >= FIT_ZOOM * (1 - 1e-9);
  const snapped = runs.map(({ scale }) => leaders.get(scale)!);
  const holds = runs.map(({ from, to }, k) => {
    let smallest = Infinity;
    for (let i = from; i < to; i += 1) smallest = Math.min(smallest, logs[i]!);
    return Math.log(snapped[k]!) > smallest - apart;
  });
  const taken = runs.map(
    (_, k) =>
      holds[k]! &&
      [k - 1, k + 1].every((n) => n < 0 || n >= runs.length || (reads(snapped[k]!, runs[n]!.scale) && reads(snapped[k]!, snapped[n]!)))
  );
  runs.forEach((run, k) => {
    if (taken[k]) run.scale = snapped[k]!;
  });

  const scaleOf = new Float64Array(count);
  for (const { from, to, scale } of runs) scaleOf.fill(scale, from, to);
  return fits.map(({ own }, index) => {
    const run = scaleOf[index]!;
    const drawn = Math.min(run, own);
    return { scale: drawn, reduced: drawn < run * (1 - 1e-9) };
  });
}

/**
 * A diagram that reads the same from either end, drawn so: the runs' half
 * nearer one end mirrored onto the other, whichever half costs least so. A
 * cut of least cost has two halves, and the drawings each half makes alone,
 * mirrored, cost twice that half — so one of them costs no more than the cut
 * itself, and is one of least cost too. The first half on a tie.
 */
function mirroredRuns(
  runs: { from: number; to: number; scale: number }[],
  logs: readonly number[]
): { from: number; to: number; scale: number }[] {
  const count = logs.length;
  const drawn = new Float64Array(count);
  for (const { from, to, scale } of runs) drawn.fill(scale, from, to);
  const mirrored = (nearer: (k: number, mirror: number) => number) =>
    Array.from({ length: count }, (_, k) => drawn[nearer(k, count - 1 - k)]!);
  const costOf = (scales: number[]) =>
    scales.reduce((sum, scale, k) => sum + logs[k]! - Math.log(scale) + (k > 0 && scale !== scales[k - 1] ? FIT_RUN_BREAK : 0), 0);
  const [first, last] = [mirrored(Math.min), mirrored(Math.max)];
  const chosen = costOf(last) < costOf(first) ? last : first;
  const out: { from: number; to: number; scale: number }[] = [];
  chosen.forEach((scale, k) => {
    if (k > 0 && scale === chosen[k - 1]) out[out.length - 1]!.to = k + 1;
    else out.push({ from: k, to: k + 1, scale });
  });
  return out;
}

/**
 * The largest scale at which a picture fits a room `across` × `down` mm, in
 * mm per its unit, each way ({@link overrunFit}): its reach in the room
 * where it can be, and where it cannot — marks at their pt size larger than
 * the room — reaching out of it as little as it can, evenly, the paper as
 * large as that allows; never shrinking the paper for its marks past where
 * what grows with it takes {@link MARKS_FLOOR} of the room, nor letting the
 * paper itself out of it. Its reach as measured, near the scale it was
 * measured at; where it lies, by side, when measured (`sides`), else even.
 * Past the room, a `lip` each way the reach may hang into for nothing (a
 * step file's canvas round its box), and the scales sought from `from` up
 * rather than from the floor. Null for no picture, or one with no size.
 */
export function pictureFit(
  picture: LayoutStep['picture'],
  across: number,
  down: number,
  options: { lip?: { across: number; down: number }; from?: number } = {}
): number | null {
  if (!picture) return null;
  const sides = picture.sides ?? evenSides(picture);
  const { lip = { across: 0, down: 0 }, from } = options;
  const fit = Math.min(
    overrunFit(across, picture.frame.width, sides.left, sides.right, lip.across, from),
    overrunFit(down, picture.frame.height, sides.top, sides.bottom, lip.down, from)
  );
  return Number.isFinite(fit) && fit >= 0 ? fit : null;
}

/**
 * How far a picture's reach, measured at `scale`, hangs out of a room
 * `across` × `down` mm when drawn there, the more of the two ways, placed as
 * the page places it ({@link overrunFit}): nothing when it fits.
 */
export function pictureOverrun(picture: NonNullable<LayoutStep['picture']>, across: number, down: number, scale: number): number {
  const sides = picture.sides ?? evenSides(picture);
  const way = (room: number, frame: number, before: ReachLine, after: ReachLine) =>
    Math.max(...overrunLines(room, frame, before, after, 0).map(({ slope, at }) => slope * scale + at));
  return Math.max(way(across, picture.frame.width, sides.left, sides.right), way(down, picture.frame.height, sides.top, sides.bottom));
}

/**
 * The least scale {@link pictureFit} may draw a picture at in a room, as
 * measured: where what grows with it takes {@link MARKS_FLOOR} of the room
 * the way that lets it shrink further.
 */
export function pictureFloor(picture: NonNullable<LayoutStep['picture']>, across: number, down: number): number {
  const sides = picture.sides ?? evenSides(picture);
  return Math.min(
    overrunFloor(across, picture.frame.width, sides.left, sides.right),
    overrunFloor(down, picture.frame.height, sides.top, sides.bottom)
  );
}

/** A picture's reach past each edge when only its whole is known: half on either side. */
function evenSides(picture: NonNullable<LayoutStep['picture']>): ReachSides {
  const half = (grows: number, frame: number, beyond: number): ReachLine => ({ grows: (grows - frame) / 2, beyond: beyond / 2 });
  const across = half(picture.width, picture.frame.width, picture.marks.width);
  const down = half(picture.height, picture.frame.height, picture.marks.height);
  return { left: across, right: across, top: down, bottom: down };
}

/** A line in the scale: `slope × scale + at`. */
interface ScaleLine {
  slope: number;
  at: number;
}

/**
 * The largest scale, one way, at which a picture's reach hangs past its room
 * `room` mm (and a `lip` either side it may reach into for nothing) the
 * least it can, from its floor — what grows with the picture taking half the
 * room, or the paper half of it where nothing grows; or from `from`, when
 * given — to the paper filling the room. So a reach that fits is as large as
 * fits; marks larger than the room even at the floor leave the paper at the
 * floor; and a glyph larger
 * than the paper, which no scale makes smaller, leaves it as large as its
 * room where the glyph is centred on it, and as large as still lets the
 * reach be centred where it is not, rather than hang all over one side.
 *
 * The reach is placed as the page places it (`settle` in pagePictures.ts):
 * the paper in its room, the reach centred as far as that lets. Its frame
 * `frame` per scale, and past it `before` and `after`, each at least nothing;
 * the most it then hangs out on either side, with `a` past the near edge
 * and `b` past the far one, the paper `p` and the room `h`, is
 * `max(0, (a + b)/2, b, a − (h − p))` — the largest of lines in the scale,
 * so it is least, and stays least up to a point, as convex functions are.
 */
export function overrunFit(room: number, frame: number, before: ReachLine, after: ReachLine, lip = 0, from?: number): number {
  if (![room, frame, before.grows, before.beyond, after.grows, after.beyond, lip].every(Number.isFinite)) return Number.NaN;
  const paper = frame > 0 ? room / frame : Infinity;
  const floor = Math.min(paper, from ?? overrunFloor(room, frame, before, after));
  if (!(floor < Infinity)) return paper;
  const lines = overrunLines(room, frame, before, after, lip);
  const overrun = (scale: number) => Math.max(...lines.map(({ slope, at }) => slope * scale + at));
  // The least it hangs out: at an end, or where two lines cross.
  let least = overrun(floor);
  if (paper < Infinity) least = Math.min(least, overrun(paper));
  lines.forEach((one, i) =>
    lines.slice(i + 1).forEach((other) => {
      if (one.slope === other.slope) return;
      const crossing = (other.at - one.at) / (one.slope - other.slope);
      if (crossing > floor && crossing < paper) least = Math.min(least, overrun(crossing));
    })
  );
  // The largest scale at which no line is more than that.
  const tolerance = 1e-12 * Math.max(room, 1);
  let largest = paper;
  for (const { slope, at } of lines) if (slope > 0) largest = Math.min(largest, (least + tolerance - at) / slope);
  return Math.max(floor, largest);
}

/** One way's floor ({@link overrunFit}): what grows with the picture taking half the room, or the paper half of it where nothing grows; never past the paper filling it. */
function overrunFloor(room: number, frame: number, before: ReachLine, after: ReachLine): number {
  const paper = frame > 0 ? room / frame : Infinity;
  return Math.min(paper, ((1 - MARKS_FLOOR) * room) / Math.max(frame + before.grows + after.grows, frame));
}

/** One way's overrun as lines in the scale ({@link overrunFit}): the most of them is how far the reach hangs out. */
function overrunLines(room: number, frame: number, before: ReachLine, after: ReachLine, lip: number): ScaleLine[] {
  // Each side's reach, at least nothing: its line or none, whichever is more.
  const nears: ScaleLine[] = [
    { slope: 0, at: 0 },
    { slope: before.grows, at: before.beyond },
  ];
  const fars: ScaleLine[] = [
    { slope: 0, at: 0 },
    { slope: after.grows, at: after.beyond },
  ];
  const lines: ScaleLine[] = [{ slope: 0, at: 0 }];
  for (const near of nears) {
    // Past the near edge with the far one met: the paper at the room's far side.
    lines.push({ slope: frame + near.slope, at: near.at - room - lip });
    for (const far of fars) {
      // The reach centred: the room's overrun, split.
      lines.push({ slope: (near.slope + far.slope + frame) / 2, at: (near.at + far.at - room - 2 * lip) / 2 });
    }
  }
  // Past the far edge with the near one met.
  for (const far of fars) lines.push({ slope: frame + far.slope, at: far.at - room - lip });
  return lines;
}

/**
 * How far a picture reaches with its marks, in mm, drawn at `scale`: as
 * measured, near the scale it was measured at, and never less than its
 * frame.
 */
export function pictureExtent(picture: NonNullable<LayoutStep['picture']>, scale: number): { width: number; height: number } {
  return {
    width: Math.max(picture.width * scale + picture.marks.width, picture.frame.width * scale),
    height: Math.max(picture.height * scale + picture.marks.height, picture.frame.height * scale),
  };
}

/**
 * The pages of a diagram's steps, under its page setup: which steps go on
 * which page, `pagePlan.ts`'s ({@link paginate}).
 *
 * A grid page is cut into its cells. A flow page is drawn from its
 * arrangement (`implementation-plans/diagram-flow-packing.md`): the one
 * `arrangements` holds for it, under the step it starts with, while that was
 * packed for the page as it is (its signature, `pageSignature.ts`), each step
 * at its kept scale in its kept box; else one packed now (`flowPacking.ts`),
 * which the layout hands back (`DiagramPagesLayout.packed`) for the store to
 * adopt. Packing reads each picture at its reference scale: the one Fit each
 * gives it with every step of the diagram in one cell, the cell a page of its
 * steps per page is cut into ({@link pageGrid}, {@link scaleRuns}), whatever
 * page it is on, so a page's side, spine or own count sizes no picture.
 */
export function layoutDiagramPages(
  steps: readonly LayoutStep[],
  setup: DiagramPageSetup,
  title: string,
  setter: TextSetter,
  arrangements: Readonly<Record<string, DiagramPageArrangement>> = {}
): DiagramPagesLayout {
  const paper = printPaper(setup);
  const { widthMm: W, heightMm: H, marginMm: m } = paper;
  const flow = setup.layout === 'flow';
  const showTitle = titleShown(setup, title);
  const headH = showTitle ? HEADER_MM : 0;
  const footH = setup.pageNumbers.enabled ? FOOTER_MM : 0;
  const bandWidthMm = setup.pathWidthMm;
  // An enlarge arrow stands where a turn would, and keeps the gutter a turn keeps.
  const turning = steps.some(
    (step) => step.turnsBefore.length > 0 || step.turnsAfter.length > 0 || Boolean(step.zoom?.arrowFrom)
  );
  // A turn at a row's end prints in the half gutter outside the outer picture,
  // which a narrow margin cannot give: the boxes give up what it lacks.
  const outerShortfall = turning ? Math.max(0, TURN_GUTTER_MM / 2 - m) : 0;

  const planned = paginate(steps, setup);
  const cutInto = ({ columns, rows }: { columns: number; rows: number }): CellCut => {
    const cellW = (W - 2 * m) / columns;
    const cellH = (H - 2 * m - headH - footH) / rows;
    // A picture's room across the cell: the cell less the gutter between pictures.
    const roomW = Math.max(12, cellW - (turning ? TURN_GUTTER_MM : PICTURE_SIDE_ROOM_MM) - 2 * outerShortfall);
    const fullBox = Math.max(12, Math.min(roomW, cellH * PICTURE_HEIGHT_SHARE));
    return { cellW, cellH, roomW, fullBox, textWidth: cellW * 0.8 };
  };
  // A grid page is cut into its plan's cells. Every flow step finds its
  // reference scale in one cell, the diagram's ({@link pageGrid}), never its
  // own page's: a page's own rows turn on its side, its spine, its own count
  // and the odd rows a left page that hands over takes, which a picture's size
  // must not (`diagram-flow-packing.md`, Reference size).
  const referenceCut = flow ? cutInto(pageGrid(setup)) : null;
  const cuts = planned.map((page): PageCut => ({ ...(referenceCut ?? cutInto(page)), page, slots: rowSlots(page) }));
  const pagesOfSteps = planned.map((page) => page.steps.map((index) => ({ step: steps[index]!, index })));
  // Which way each page's rows run: in a grid, down and left to right; in a
  // flow, so that the lane carries on across each spread — every page's first
  // band from the left, as the packing reads them.
  const plans: FlowPagePlan[] = planned.map((_, pageIndex) =>
    flow
      ? flowPagePlan(pageIndex, planned.length, setup.firstPageSide, 1)
      : { side: pageSide(pageIndex, setup.firstPageSide), up: false, firstRightToLeft: false, entry: 'none', exit: 'none' }
  );

  // Each cell's box and text, before the scale is known: a grid page's, and
  // each flow step's in the one cell it finds its reference scale in.
  interface Placed {
    step: LayoutStep;
    index: number;
    /** Its cell: its grid page's, or the flow's one reference cell. */
    cut: CellCut;
    x: number;
    y: number;
    /** How far down the page the text's last line may sit. */
    slot: number;
    box: number;
    text: SetText;
    overflow: boolean;
  }
  /**
   * The top-left of a page's `k`th cell, rows down the page. A row stands its
   * steps at even shares of the page's width, each centred in its share — a
   * full row's cells side by side, a shorter row's spread across the page.
   */
  const cellAt = (pageIndex: number, k: number) => {
    // A flow step's reference cell: where on the page it stands changes nothing it measures.
    if (referenceCut) return { x: m, y: m + headH };
    const { page, cellW, cellH, slots } = cuts[pageIndex]!;
    const { row, along, count } = slots[k]!;
    const x = count === page.columns ? m + along * cellW : m + ((along + 0.5) / count) * (W - 2 * m) - cellW / 2;
    return { x, y: m + headH + row * cellH };
  };
  /** How far down the page the text of a page's `k`th cell may sit: by its cell. */
  const cellFoot = (pageIndex: number, k: number) => cellAt(pageIndex, k).y + cuts[pageIndex]!.cellH - TEXT_DESCENT_MM;
  const firstBaselineOf = (cellTop: number, box: number) => cellTop + PICTURE_TOP_MM + box + TEXT_GAP_MM;
  /** How many lines fit between a box and the foot of its slot. */
  const slotLines = (slot: number, cellTop: number, box: number) =>
    Math.max(0, Math.floor((slot - firstBaselineOf(cellTop, box)) / STEP_TEXT_LEADING_MM + 1e-9) + 1);
  const placedPages: Placed[][] = pagesOfSteps.map((entries, pageIndex) =>
    entries.map(({ step, index }, k) => {
      const cut = cuts[pageIndex]!;
      const { fullBox, textWidth } = cut;
      const { x, y } = cellAt(pageIndex, k);
      const slot = cellFoot(pageIndex, k);
      let box = fullBox;
      const full = setter.paragraph(step.text, textWidth, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER);
      let maxLines = slotLines(slot, y, box);
      if (full.linesNeeded > maxLines) {
        // Text first: the picture gives up the room the text's last line is
        // short of — measured, not counted in lines, since a slot can be
        // short of more than it holds — down to its floor.
        const lastBaseline = firstBaselineOf(y, box) + (full.linesNeeded - 1) * STEP_TEXT_LEADING_MM;
        box = Math.max(fullBox * PICTURE_FLOOR, box - (lastBaseline - slot));
        maxLines = slotLines(slot, y, box);
        if (maxLines === 0) {
          // A cell so short that half a picture leaves no line at all: the
          // picture gives way further, for one line — a cut instruction says
          // so; a missing one says nothing.
          box = Math.max(0, slot - (firstBaselineOf(y, box) - box));
          maxLines = slotLines(slot, y, box);
        }
      }
      const text =
        full.linesNeeded <= maxLines ? full : setter.paragraph(step.text, textWidth, STEP_TEXT_SIZE_MM, maxLines);
      return { step, index, cut, x, y, slot, box, text, overflow: full.linesNeeded > maxLines };
    })
  );

  // Each picture's room: across, the cell less its gutter; down, what its
  // text leaves, at least its box. It fits where both its sides do.
  const roomH = ({ y, slot, box, text }: Pick<Placed, 'y' | 'slot' | 'box' | 'text'>) =>
    Math.max(
      box,
      slot -
        (y + PICTURE_TOP_MM) -
        (text.lines.length > 0 ? TEXT_GAP_MM + (text.lines.length - 1) * STEP_TEXT_LEADING_MM : 0)
    );
  const fitOf = ({ step, cut, ...placed }: Placed): ScaleFit | null => {
    const down = roomH(placed);
    const fit = (across: number, room: number) => (step.fitIn ? step.fitIn(across, room) : pictureFit(step.picture, across, room));
    const own = fit(cut.roomW, down);
    const shared = fit(cut.roomW, Math.max(down, cut.fullBox));
    if (own !== null && step.atMost !== undefined) return shared === null ? null : { own: Math.min(own, step.atMost), shared };
    return own === null || shared === null ? null : { own, shared };
  };
  const scales = new Map<Placed, { mmPerUnit: number | null; frameMm: number | null; reduced: boolean }>();
  const all = placedPages.flat();
  // The paper in runs, by the mm per document unit; pictures with no paper
  // the same way by their frames, a run of their own. An enlarged step's
  // window is neither: no run takes it, or a lone enlargement would join its
  // neighbours' run and change their size.
  for (const kind of ['paper', 'fit'] as const) {
    const pictures = all.flatMap((placed) => {
      const fit = placed.step.picture?.kind === kind ? fitOf(placed) : null;
      return fit ? [{ placed, fit }] : [];
    });
    scaleRuns(pictures.map(({ fit }) => fit)).forEach(({ scale, reduced }, at) => {
      scales.set(pictures[at]!.placed, {
        mmPerUnit: kind === 'paper' ? scale : null,
        frameMm: kind === 'fit' ? scale : null,
        reduced,
      });
    });
  }
  const autoScales = new Map(scales);
  const pinStates = new Map<Placed, 'applied' | 'kind' | 'empty'>();
  for (const entry of all) {
    const pin = entry.step.place?.scale;
    if (!pin) continue;
    const picture = entry.step.picture;
    if (!picture) { pinStates.set(entry, 'empty'); continue; }
    const paperPin = 'mmPerUnit' in pin;
    if (entry.step.zoom || (picture.kind === 'paper') !== paperPin) { pinStates.set(entry, 'kind'); continue; }
    const units = paperPin ? Math.max(picture.frame.width, picture.frame.height) : 1;
    const value = Math.max(4, Math.min(Math.max(W, H) - 2 * m, (paperPin ? pin.mmPerUnit : pin.frameMm) * units)) / units;
    scales.set(entry, { mmPerUnit: paperPin ? value : null, frameMm: paperPin ? null : value, reduced: false });
    pinStates.set(entry, 'applied');
  }
  // Then the enlarged steps, every other scale known: an area's step may be on an earlier page, or after.
  const { read: zoomed, areas: zoomAreasOf } = zoomScales(all, fitOf, scales, (entry) => entry.cut.fullBox);

  const flowPages = flow
    ? arrangeFlowPages({
        placedPages,
        planned,
        plans,
        steps,
        setup,
        title,
        setter,
        arrangements,
        area: packingArea(paper, headH, footH),
        margin: m,
        // A step's reference scale: Fit each's in its cell, before any pin — an enlarged step's, its run's.
        referenceOf: (entry) => autoScales.get(entry) ?? (entry.step.zoom ? scales.get(entry) : undefined),
        pinned: (entry) => (pinStates.get(entry) === 'applied' ? scales.get(entry)! : null),
        pinState: (entry) => pinStates.get(entry) ?? null,
        zoomed,
        zoomAreasOf,
      })
    : null;

  const cellPages: LayoutCell[][] = flowPages?.cells ?? placedPages.map((placed) =>
    placed.map((entry) => {
      const { step, index, cut, x, y, box, text, overflow } = entry;
      const { cellW, cellH, roomW, textWidth } = cut;
      const pictureX = x + (cellW - box) / 2;
      const pictureY = y + PICTURE_TOP_MM;
      const scale = scales.get(entry);
      const at = scale?.mmPerUnit ?? scale?.frameMm ?? null;
      const extent = at !== null && step.picture ? pictureExtent(step.picture, at) : null;
      const pin = pinStates.get(entry) ?? null;
      // A picture taller at its scale than its box runs on down its room. Only
      // a scale pinned by hand draws past the room (Decision 3A): an enlarged
      // step's Size is held to it, as every other scale is.
      const pinned = pin === 'applied';
      const drawnH = extent?.height ?? 0;
      const drawH = pinned ? drawnH : Math.min(Math.max(box, drawnH), roomH(entry));
      const ink = extent ?? { width: box, height: box };
      const drawW = pinned ? Math.max(roomW, ink.width) : roomW;
      const auto = autoScales.get(entry);
      const autoAt = auto?.mmPerUnit ?? auto?.frameMm ?? null;
      const autoH = autoAt !== null && step.picture ? pictureExtent(step.picture, autoAt).height : 0;
      const place = normalizeStepPlace(step.place);
      const cell: LayoutCell = {
        stepId: step.id,
        number: index + 1,
        cellMm: { x, y, w: cellW, h: cellH },
        pictureMm: { x: pictureX, y: pictureY, size: box },
        drawMm: { x: x + (cellW - drawW) / 2, y: pictureY, w: drawW, h: drawH },
        inkMm: { x: x + (cellW - ink.width) / 2, y: pictureY + (drawH - ink.height) / 2, w: ink.width, h: ink.height },
        ...(place ? { placed: { offsets: place, pin, auto: { mmPerUnit: auto?.mmPerUnit ?? null, frameMm: auto?.frameMm ?? null, drawMm: { x: x + (cellW - roomW) / 2, y: pictureY, w: roomW, h: Math.min(Math.max(box, autoH), roomH(entry)) } } } } : {}),
        mmPerUnit: scale?.mmPerUnit ?? null,
        frameMm: scale?.frameMm ?? null,
        scaleReduced: scale?.reduced ?? false,
        ...(zoomed.has(entry) ? { zoom: zoomed.get(entry)! } : {}),
        numberAt: { x: x + STEP_NUMBER_INSET_MM, y: y + STEP_NUMBER_BASELINE_MM },
        text: {
          x: x + cellW * 0.1,
          firstBaseline: pictureY + drawH + TEXT_GAP_MM,
          widthMm: textWidth,
          lines: text.lines,
        },
        textOverflow: overflow,
      };
      // Placed by hand on top of its home: every grid row reads left to right.
      return placeCell(cell, step, false, setter);
    })
  );

  // The lane's stops on each flow page: every picture's centre as drawn, in
  // its band, a step in a bend turned through.
  const stopPages: LaneStop[][] = cellPages.map((cells) =>
    flow
      ? cells.map((cell): LaneStop => {
          const band = cell.band ?? 0;
          return {
            ...laneCentre(cell),
            row: band,
            rightToLeft: band % 2 === 1,
            ...(cell.bend ? { bend: true } : {}),
            ...(cell.placed ? { placed: true } : {}),
          };
        })
      : []
  );
  // Across a spread the lane meets the spine at one height: halfway between
  // where it leaves the left page and where it comes into the right one.
  const spineAt = (leftIndex: number) => {
    const out = stopPages[leftIndex]?.at(-1);
    const into = stopPages[leftIndex + 1]?.[0];
    return out && into ? (out.y + into.y) / 2 : null;
  };

  const pages: LayoutPage[] = placedPages.map((placed, pageIndex) => {
    const number = setup.pageNumbers.first + pageIndex;
    const plan = plans[pageIndex]!;
    const cells = cellPages[pageIndex]!;
    const cut = cuts[pageIndex]!;
    const halfWidth = bandWidthMm / 2;
    const last = cells.at(-1);
    const flowInput: Parameters<typeof flowLane>[0] | null =
      flow && last
        ? {
            stops: stopPages[pageIndex]!,
            plan,
            pageWidth: W,
            // A bend with no step in it turns at the paper's edge, half its margin in.
            apexInset: m / 2,
            halfWidth,
            offPage: OFF_PAGE_MM,
            spineIn: plan.entry === 'spine' ? spineAt(pageIndex - 1) : null,
            spineOut: plan.exit === 'spine' ? spineAt(pageIndex) : null,
            // The diagram's last page: the band ends just past its last step, at its box's edge.
            tail: plan.exit === 'none' ? Math.max(0, last.cellMm.w / 2 - halfWidth) : 0,
          }
        : null;
    const lane = flowInput ? flowLane(flowInput) : null;
    for (const index of lane?.warnings ?? []) {
      const cell = cells[index];
      if (cell?.placed) cell.clashes = [{ kind: 'path' }];
    }
    const band = setup.showPath ? (lane?.lane ?? null) : null;
    const { turns, zoomArrows } = placeTurns(
      placed.map(({ step }) => step),
      cells,
      flow ? (k) => cells[k]!.band ?? 0 : (k) => cut.slots[k]!.row,
      flow ? { plan, lane, apexInset: m / 2 } : null,
      W,
      H
    );
    const right = plan.side === 'right';
    const packing = flowPages?.packing[pageIndex];
    return {
      number,
      side: plan.side,
      cells,
      band,
      ...(flowInput ? { flow: flowInput } : {}),
      ...(packing ? { packing } : {}),
      turns,
      zoomArrows,
      pageNumberAt: setup.pageNumbers.enabled
        ? { x: right ? W - m : m, y: H - m - PAGE_NUMBER_RAISE_MM, anchor: right ? 'end' : 'start' }
        : null,
    };
  });

  let titleLayout: DiagramPagesLayout['title'] = null;
  if (showTitle) {
    // Cut to the page: the tab never runs past the margin, nor the title past the tab.
    const line = setter.line(title.trim(), TITLE_SIZE_MM, 700, W - 2 * m - 2 * TAB_PADDING_MM);
    const tabW = line.widthMm + 2 * TAB_PADDING_MM;
    // With no margin the tab and the rule reach the paper's edge: they run on past it.
    const reach = m > 0 ? 0 : OFF_PAGE_MM;
    titleLayout = {
      tab: { x: m - reach, y: m - reach, w: tabW + reach, h: TAB_HEIGHT_MM + reach },
      textAt: { x: m + TAB_PADDING_MM, y: m + TITLE_BASELINE_MM },
      line,
      rule: { x1: m + tabW, x2: W - m + reach, y: m + TITLE_RULE_Y_MM },
    };
  }

  const result: DiagramPagesLayout = {
    paper,
    pages,
    cellMm: { w: cuts[0]!.cellW, h: cuts[0]!.cellH },
    title: titleLayout,
    bandWidthMm,
    bandInk: setup.pathColor,
    ...(flowPages && Object.keys(flowPages.packed).length > 0 ? { packed: flowPages.packed } : {}),
  };
  const byId = new Map(steps.map((step) => [step.id, step]));
  placementClashes(result, (stepId) => byId.get(stepId)?.footprints?.());
  return result;
}

/** What a flow page reads of a step's cell: the step, its index, and its square picture box, which an empty step is laid out as. */
interface ReferenceCell {
  step: LayoutStep;
  index: number;
  box: number;
}

/** A picture's scale in a cell: mm per unit for a paper picture, else its frame's longer side; whether its room drew it smaller. */
type CellScale = { mmPerUnit: number | null; frameMm: number | null; reduced: boolean };

/**
 * The flow pages, each drawn from its arrangement, in order, since a page's
 * scale is held to the page before's (`flowPacking.ts`, steadiness): the one
 * `arrangements` holds for it while its signature is the page's and it places
 * every step on it; else one packed now from each step's reference scale
 * (`referenceOf`), kept as the store will keep it (`packedArrangement`) and
 * handed back in `packed`. Each page says its scale, whether it was packed
 * now, and whether it fits its area (`packing`).
 *
 * A step is drawn at its kept scale — a pin by hand over it, as anywhere —
 * its number at its box's top left, its picture centred under it and its
 * caption under that at the measure its box was packed for
 * (`flowArrangement.ts`). An enlarged step given another Size since its page
 * was packed is resized in its box for it, its own edit, as far as the box
 * holds it, and its read-out says what it prints. One whose picture, caption
 * or Size no longer fits its box says so (`LayoutCell.overflow`); nothing
 * moves for it.
 */
function arrangeFlowPages<T extends ReferenceCell>(input: {
  placedPages: readonly (readonly T[])[];
  planned: readonly PlannedPage[];
  plans: readonly FlowPagePlan[];
  steps: readonly LayoutStep[];
  setup: DiagramPageSetup;
  title: string;
  setter: TextSetter;
  arrangements: Readonly<Record<string, DiagramPageArrangement>>;
  area: PackRect;
  /** The page's margin: one too narrow for a turn at the page's edge has the area give up what it lacks. */
  margin: number;
  referenceOf: (entry: T) => CellScale | undefined;
  pinned: (entry: T) => CellScale | null;
  pinState: (entry: T) => 'applied' | 'kind' | 'empty' | null;
  zoomed: ReadonlyMap<T, NonNullable<LayoutCell['zoom']>>;
  zoomAreasOf: ReadonlyMap<T, { area: T; share: number }>;
}): {
  cells: LayoutCell[][];
  packing: (LayoutPage['packing'] | undefined)[];
  packed: Record<string, DiagramPageArrangement>;
} {
  const { placedPages, planned, plans, steps, setup, title, setter, arrangements, area } = input;
  const signatures = pageSignatures({ steps, pages: planned, setup, title });
  const packed: Record<string, DiagramPageArrangement> = {};
  const packing: (LayoutPage['packing'] | undefined)[] = [];
  // The longer side each picture's frame prints at, mm: what an enlarged step's read-out is measured against.
  const printedFrames = new Map<string, number>();

  /** A step's picture as its box draws it: at `scale`, with its marks; null with none to draw at it. */
  const sizeAt = (picture: LayoutStep['picture'], scale: CellScale | null) => {
    const at = scale?.mmPerUnit ?? scale?.frameMm ?? null;
    if (!picture || at === null) return null;
    const extent = pictureExtent(picture, at);
    return { w: extent.width, h: extent.height };
  };
  /**
   * A step's scale as its box keeps it, in its picture's own measure; a
   * picture of the other measure — a new one — fitted to the room its box
   * leaves it. Null for a step with no picture, or one that fits nowhere.
   */
  const keptScale = (step: LayoutStep, kept: DiagramPlaceScale, room: { w: number; h: number }): CellScale | null => {
    const picture = step.picture;
    if (!picture) return null;
    const paper = picture.kind === 'paper';
    if (paper && 'mmPerUnit' in kept) return { mmPerUnit: kept.mmPerUnit, frameMm: null, reduced: false };
    if (!paper && 'frameMm' in kept) return { mmPerUnit: null, frameMm: kept.frameMm, reduced: false };
    const fit = step.fitIn ? step.fitIn(room.w, room.h) : pictureFit(picture, room.w, room.h);
    if (fit === null || !(fit > 0)) return null;
    return { mmPerUnit: paper ? fit : null, frameMm: paper ? null : fit, reduced: false };
  };

  /**
   * An enlarged step whose Size has changed since its page was packed
   * (`DiagramArrangedStep.zoomScale`): its own edit, which resizes it in its
   * box. The window it now asks for — its kept window times the new Size over
   * the one it was packed at (for one packed at Fill, the Size it prints at
   * now, `printedNow`), or at Fill as large as its box's room allows, held to
   * 1–6 times its area as that prints (`areaMm`, when known) — and what of
   * that its box holds. Null where the Size is the one it was packed at, so
   * the step is drawn as kept.
   */
  const resizedWindow = (
    step: LayoutStep,
    place: DiagramArrangedStep,
    kept: CellScale | null,
    room: { w: number; h: number },
    areaMm: number | null,
    printedNow: number | null
  ): { wanted: number; drawn: number } | null => {
    const zoom = step.zoom;
    const keptWindow = kept?.frameMm;
    if (!zoom || step.picture?.kind !== 'zoom' || keptWindow == null || zoom.scale === (place.zoomScale ?? null)) return null;
    const inWindow = frameInWindowOf(zoom);
    const fit = step.fitIn ? step.fitIn(room.w, room.h) : pictureFit(step.picture, room.w, room.h);
    let wanted: number;
    if (zoom.scale === null) {
      if (fit === null) return null;
      wanted = areaMm === null ? fit : Math.min(ZOOM_FILL.max * areaMm, Math.max(ZOOM_FILL.min * areaMm, fit * inWindow)) / inWindow;
    } else {
      const was = place.zoomScale ?? printedNow;
      if (was === null || !(was > 0)) return null;
      wanted = (keptWindow * zoom.scale) / was;
    }
    if (!(wanted > 0) || !Number.isFinite(wanted)) return null;
    return { wanted, drawn: fit === null ? wanted : Math.min(wanted, fit) };
  };

  const arrangedCell = (entry: T, place: DiagramArrangedStep): LayoutCell => {
    const { step, index } = entry;
    const box = arrangedBox(place);
    const measure = arrangedCaptionWidth(box);
    const lines =
      step.text.trim() === '' ? [] : setter.paragraph(step.text, measure, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines;
    const room = arrangedPictureRoom(box, lines.length);
    const kept = keptScale(step, place.scale, room);
    // An enlarged step is measured against its area as that prints here: each page draws at its own scale.
    const run = input.zoomAreasOf.get(entry);
    const areaFrame = run ? printedFrames.get(run.area.step.id) : undefined;
    const areaMm = run && areaFrame !== undefined && areaFrame > 0 ? run.share * areaFrame : null;
    const cellZoom = input.zoomed.get(entry);
    const printedAt = (window: number) => (step.zoom && areaMm !== null ? (window * frameInWindowOf(step.zoom)) / areaMm : null);
    const keptPrinted = kept?.frameMm != null ? printedAt(kept.frameMm) : null;
    const resized = resizedWindow(step, place, kept, room, areaMm, keptPrinted ?? cellZoom?.printed ?? null);
    // Its scale before any pin: as kept, or an enlarged step's at its new Size, as far as its box holds it.
    const auto: CellScale | null = resized ? { mmPerUnit: null, frameMm: resized.drawn, reduced: resized.drawn < resized.wanted * (1 - 1e-9) } : kept;
    const drawn = input.pinned(entry) ?? auto;
    // An empty step's placeholder fills the room its box leaves a picture.
    const placeholder = Math.min(room.w, room.h);
    const autoSize = sizeAt(step.picture, auto) ?? { w: placeholder, h: placeholder };
    const drawnSize = sizeAt(step.picture, drawn) ?? autoSize;
    const parts = stepPartsInBox(box, drawnSize, measure);
    const square = Math.min(drawnSize.w, drawnSize.h);
    const offsets = normalizeStepPlace(step.place);
    // What it asks its box for: its kept scale, or the window a new Size asks for, whole.
    const asked = resized ? sizeAt(step.picture, { mmPerUnit: null, frameMm: resized.wanted, reduced: false }) : null;
    const overflow = arrangedOverflow(box, asked ?? sizeAt(step.picture, kept) ?? autoSize, lines.length);
    const frame = step.picture?.frame;
    const printedFrame = drawn?.mmPerUnit != null && frame ? drawn.mmPerUnit * Math.max(frame.width, frame.height) : drawn?.frameMm;
    if (printedFrame != null) printedFrames.set(step.id, printedFrame);
    // Its read-out says what it prints, against its area as that prints here, and whether its room cut it down.
    let zoom = cellZoom;
    if (zoom && step.zoom && drawn?.frameMm != null) {
      const printed = printedAt(drawn.frameMm) ?? (resized ? (zoom.printed * resized.drawn) / resized.wanted : zoom.printed);
      zoom = { asked: step.zoom.scale, printed, reduced: resized ? (auto?.reduced ?? false) : zoom.reduced };
    }
    const cell: LayoutCell = {
      stepId: step.id,
      number: index + 1,
      cellMm: { ...box },
      band: place.band,
      ...(place.bend ? { bend: true as const } : {}),
      pictureMm: { x: box.x + (box.w - square) / 2, y: parts.picture.y, size: square },
      drawMm: parts.picture,
      inkMm: { ...parts.picture },
      ...(offsets
        ? {
            placed: {
              offsets,
              pin: input.pinState(entry),
              auto: {
                mmPerUnit: auto?.mmPerUnit ?? null,
                frameMm: auto?.frameMm ?? null,
                drawMm: stepPartsInBox(box, autoSize, measure).picture,
              },
            },
          }
        : {}),
      mmPerUnit: drawn?.mmPerUnit ?? null,
      frameMm: drawn?.frameMm ?? null,
      scaleReduced: false,
      ...(zoom ? { zoom } : {}),
      numberAt: parts.numberAt,
      text: { x: parts.caption.x, firstBaseline: parts.caption.firstBaseline, widthMm: measure, lines },
      textOverflow: false,
      ...(overflow ? { overflow } : {}),
    };
    // Placed by hand on top of its home: a frame's offset runs along its band as the band reads.
    return placeCell(cell, step, place.band % 2 === 1, setter);
  };

  /**
   * Where a page's bands may go: its area, less what a margin too narrow for a
   * turn standing at the page's edge lacks — before its first step, on a bend,
   * after the diagram's last — where the page has any, so the glyph clears the
   * pictures as a grid's does. Its turns are in its signature.
   */
  const areaOf = (entries: readonly T[]): PackRect => {
    const turning = entries.some(({ step, index }) => keepsGlyphGutter(step, index) || step.turnsAfter.length > 0);
    const lacks = turning ? Math.max(0, EDGE_TURN_ROOM_MM - input.margin) : 0;
    return { ...area, x: area.x + lacks, w: area.w - 2 * lacks };
  };

  /**
   * A page just packed, each box grown to hold its step's picture measured at
   * the scale it prints at (`grownToHold`), as every later layout measures it
   * (`LayoutStep.pictureAt`): so a page never says at once that a step it
   * has just packed no longer fits, which Re-pack Page, packing the same,
   * could never mend.
   */
  const asMeasured = (arrangement: DiagramPageArrangement, entries: readonly T[], pageArea: PackRect): DiagramPageArrangement => {
    let grown = false;
    const placed: Record<string, DiagramArrangedStep> = { ...arrangement.steps };
    for (const { step } of entries) {
      const place = placed[step.id];
      const picture = step.picture;
      if (!place || !picture || !step.pictureAt) continue;
      // A picture of the measure its scale is kept in: one with none drew at its box's side.
      const paper = 'mmPerUnit' in place.scale;
      if (paper !== (picture.kind === 'paper')) continue;
      const at = 'mmPerUnit' in place.scale ? place.scale.mmPerUnit : place.scale.frameMm;
      const measured = step.pictureAt(at);
      if (!measured) continue;
      const extent = pictureExtent(measured, at);
      const box = arrangedBox(place);
      const lines =
        step.text.trim() === '' ? 0 : setter.paragraph(step.text, arrangedCaptionWidth(box), STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines.length;
      const held = grownToHold(box, { w: extent.width, h: extent.height }, lines, pageArea);
      if (held === box) continue;
      placed[step.id] = { ...place, box: [held.x, held.y, held.w, held.h] };
      grown = true;
    }
    return grown ? roundPageArrangement({ ...arrangement, steps: placed }) : arrangement;
  };

  let kPrev: number | null = null;
  const cells = placedPages.map((entries, pageIndex) => {
    const page = planned[pageIndex]!;
    const first = page.firstStepId;
    if (first === null || entries.length === 0) {
      packing.push(undefined);
      return [];
    }
    const pageArea = areaOf(entries);
    const stored = arrangements[first];
    const holds = holdsArrangement(
      stored,
      signatures[pageIndex],
      entries.map(({ step }) => step.id)
    );
    let arrangement = holds ? stored : null;
    if (!arrangement) {
      const plan = plans[pageIndex]!;
      const references = new Map<string, DiagramPlaceScale>();
      const packSteps = entries.map((entry) => packStep(entry, input.referenceOf(entry), setter, references));
      const found = packFlowPage(
        {
          steps: packSteps,
          layoutCount: page.layoutCount,
          area: pageArea,
          up: plan.up,
          handsOver: plan.exit === 'spine',
          settings: setup,
          kPrev,
        },
        setter
      );
      // An enlarged step's Size, which its scale is packed for.
      const zoomSizes = new Map(entries.flatMap(({ step }) => (step.zoom?.scale != null ? [[step.id, step.zoom.scale] as const] : [])));
      arrangement = asMeasured(packedArrangement(found, references, signatures[pageIndex]!, zoomSizes), entries, pageArea);
      packed[first] = arrangement;
    }
    kPrev = arrangement.k;
    packing.push({ k: arrangement.k, packed: !holds, fits: arrangementFits(arrangement, pageArea) });
    const kept = arrangement;
    return entries.map((entry) => arrangedCell(entry, kept.steps[entry.step.id]!));
  });
  return { cells, packing, packed };
}

/**
 * A step as the packing reads it (`flowPacking.ts`): its picture at its
 * reference scale with what its marks reach, measured there
 * (`LayoutStep.pictureAt`) — the part they take at their pt size apart — or,
 * with no picture or none it could be drawn at, its square
 * picture box; its number's width; its caption; and whether a turn or an
 * enlarge arrow may stand before it, which keeps their gutter — an arrow's
 * whether or not it prints now (`keepsGlyphGutter`). Its reference
 * scale is noted in `references`, in its own measure.
 */
function packStep(
  entry: ReferenceCell,
  reference: CellScale | undefined,
  setter: TextSetter,
  references: Map<string, DiagramPlaceScale>
): PackStep {
  const { step, index, box } = entry;
  const base = {
    id: step.id,
    numberWidth: setter.line(String(index + 1), STEP_NUMBER_SIZE_MM, 700).widthMm,
    text: step.text,
    turnsBefore: keepsGlyphGutter(step, index),
  };
  const at = reference ? (reference.mmPerUnit ?? reference.frameMm) : null;
  // Measured there: its marks reach as far as they do at that scale.
  const picture = at !== null && at > 0 && step.pictureAt ? step.pictureAt(at) : step.picture;
  if (!picture || at === null || !(at > 0)) return { ...base, size: { width: box, height: box } };
  references.set(step.id, reference!.mmPerUnit !== null ? { mmPerUnit: at } : { frameMm: at });
  const size = pictureExtent(picture, at);
  // What grows with the picture; the rest is its marks at their pt size, which no page scale changes.
  const grows = {
    width: Math.max(picture.width, picture.frame.width) * at,
    height: Math.max(picture.height, picture.frame.height) * at,
  };
  return {
    ...base,
    size,
    marks: { width: Math.max(0, size.width - grows.width), height: Math.max(0, size.height - grows.height) },
  };
}

/**
 * The size each enlarged step prints at (Revision 2, Z4), every other
 * picture's scale known (`scales`, which this adds the enlarged steps to):
 * in runs of their own — an enlarged step and those directly after it, up to
 * one that is not enlarged or one with an arrow before it, passing over one
 * with no window yet — each run measured against the area it enlarges as
 * that prints (`areaMm`): the area's longer side at its step's printed frame
 * when an arrow leaves it, else the run's first frame as its whole picture
 * would print among the steps round it. Every step of a run is measured
 * against that one area, whatever Size it asks for, so ×2 means the same all
 * along the run, a step captured from an earlier enlarged step included
 * (Zach, 2026-10-07): a Size starts no run of its own.
 *
 * - **Fill**: the run's Fill frames print at one size, the largest every one
 *   of them fits its room at, held to 1–6 times the area.
 * - **Size**: that many times the area, held the same.
 *
 * A step its room cannot hold at its run's size — a long instruction took
 * it — is drawn smaller, alone, and says so. A frame that is turned is
 * smaller than its window, which is what the step is laid out in. What each
 * prints at against its area is the read-out, by step (`read`); a run whose
 * area's size is not known fills its room, and has none. And for each step
 * of a run measured against an area an arrow leaves, that area's step and
 * the area's share of its picture (`areas`), so a flow page drawn at its own
 * scale can say the read-out as it prints.
 */
function zoomScales<T extends { step: LayoutStep }>(
  all: readonly T[],
  fitOf: (item: T) => ScaleFit | null,
  scales: Map<T, { mmPerUnit: number | null; frameMm: number | null; reduced: boolean }>,
  boxOf: (item: T) => number
): { read: Map<T, NonNullable<LayoutCell['zoom']>>; areas: Map<T, { area: T; share: number }> } {
  const read = new Map<T, NonNullable<LayoutCell['zoom']>>();
  const areas = new Map<T, { area: T; share: number }>();
  const byId = new Map(all.map((item) => [item.step.id, item]));
  /** The longer side `item`'s picture frame prints at, mm, at the scale it was given: an enlarged step's, its window's. */
  const printedFrame = (item: T): number | null => {
    const scale = scales.get(item);
    const picture = item.step.picture;
    if (!scale || !picture) return null;
    return scale.mmPerUnit !== null ? scale.mmPerUnit * Math.max(picture.frame.width, picture.frame.height) : scale.frameMm;
  };
  /**
   * How large `at`'s frame would print with no area to measure it by: its
   * share of its whole picture, at the scale the nearest step of its whole
   * picture's kind prints at — before it, else after — or, with none, its
   * whole picture filling its square box.
   */
  const amongNeighbours = (at: number): number => {
    const zoom = all[at]!.step.zoom!;
    const { kind } = zoom.whole;
    const nearest = (from: number, by: number): number | null => {
      for (let index = from; index >= 0 && index < all.length; index += by) {
        const other = all[index]!;
        if (other.step.zoom || other.step.picture?.kind !== kind) continue;
        const scale = scales.get(other);
        const value = kind === 'paper' ? scale?.mmPerUnit : scale?.frameMm;
        if (value !== null && value !== undefined && value > 0) return value;
      }
      return null;
    };
    const neighbour = nearest(at - 1, -1) ?? nearest(at + 1, 1);
    const whole = neighbour === null ? boxOf(all[at]!) : zoom.whole.kind === 'paper' ? neighbour * zoom.whole.units : neighbour;
    return zoom.frameShare * whole;
  };
  const frameInWindow = (item: T) => frameInWindowOf(item.step.zoom!);

  const runs: number[][] = [];
  let current: number[] | null = null;
  all.forEach(({ step }, at) => {
    // An enlarged step with no window yet, or no picture, is in no run, and parts none.
    if (step.zoomPending) return;
    if (!step.zoom) {
      current = null;
      return;
    }
    if (step.picture?.kind !== 'zoom') return;
    // Only an arrow, or a step that is not enlarged, starts another run: a Size does not.
    if (current && !step.zoom.arrowFrom) current.push(at);
    else runs.push((current = [at]));
  });

  for (const run of runs) {
    const first = all[run[0]!]!;
    const zoom = first.step.zoom!;
    const area = zoom.arrowFrom ? byId.get(zoom.arrowFrom.stepId) : undefined;
    const areaFrame = area ? printedFrame(area) : null;
    const areaMm = zoom.arrowFrom && areaFrame !== null ? zoom.arrowFrom.share * areaFrame : amongNeighbours(run[0]!);
    const known = Number.isFinite(areaMm) && areaMm > 0;
    const fits = run.map((at) => fitOf(all[at]!));
    const [least, most] = [ZOOM_FILL.min * areaMm, ZOOM_FILL.max * areaMm];
    const held = (mm: number) => (known ? Math.min(most, Math.max(least, mm)) : mm);
    /** The Size a step of the run asks for, against the run's area; null for Fill, or where the area's size is not known. */
    const sizeOf = (at: number) => (known ? all[at]!.step.zoom!.scale : null);
    // The printed frame its Fill steps ask for: the most every one of their rooms holds.
    const fillMm = held(
      Math.min(...run.map((at, n) => (sizeOf(at) === null && fits[n] ? fits[n]!.shared * frameInWindow(all[at]!) : Infinity)))
    );
    run.forEach((at, n) => {
      const item = all[at]!;
      const fit = fits[n];
      if (!fit) return;
      // Its Size times the run's area, or the run's Fill.
      const size = sizeOf(at);
      const frameMm = size !== null ? held(size * areaMm) : fillMm;
      if (!(frameMm > 0) || !Number.isFinite(frameMm)) return;
      const window = frameMm / frameInWindow(item);
      const drawn = Math.min(window, fit.own);
      const reduced = drawn < window * (1 - 1e-9);
      scales.set(item, { mmPerUnit: null, frameMm: drawn, reduced });
      if (known) read.set(item, { asked: item.step.zoom!.scale, printed: (drawn * frameInWindow(item)) / areaMm, reduced });
      if (known && area && zoom.arrowFrom && areaFrame !== null) areas.set(item, { area, share: zoom.arrowFrom.share });
    });
  }
  return { read, areas };
}

/**
 * How far a turn's or an arrow's glyph keeps from a flow step's number,
 * picture and caption, mm: less than a turn-over lying across keeps from the
 * picture beside it at a page's edge, held on the paper, where the margin is
 * only as wide as a turn needs (`EDGE_TURN_ROOM_MM`, 0.7 mm).
 */
export const GLYPH_CLEAR_MM = 0.5;

/**
 * The nearest place to `at` where a box `size` centred there stands
 * {@link GLYPH_CLEAR_MM} clear of every one of `obstacles`, its centre within
 * `bounds`: `at` itself where it already does; else the nearest of the places
 * that clear an obstacle's side, each way — where the least move lies, since
 * a move that clears a box ends against one of its sides — the first found on
 * a tie. `at` where there is none.
 */
export function clearSpot(
  at: { x: number; y: number },
  size: { w: number; h: number },
  obstacles: readonly { x: number; y: number; w: number; h: number }[],
  bounds: { x0: number; x1: number; y0: number; y1: number }
): { x: number; y: number } {
  const clear = GLYPH_CLEAR_MM - 1e-9;
  const [halfW, halfH] = [size.w / 2, size.h / 2];
  const free = (x: number, y: number) =>
    x >= bounds.x0 - 1e-9 &&
    x <= bounds.x1 + 1e-9 &&
    y >= bounds.y0 - 1e-9 &&
    y <= bounds.y1 + 1e-9 &&
    obstacles.every(
      (box) =>
        x + halfW + clear <= box.x || x - halfW - clear >= box.x + box.w || y + halfH + clear <= box.y || y - halfH - clear >= box.y + box.h
    );
  if (free(at.x, at.y)) return at;
  const xs = [at.x, ...obstacles.flatMap((box) => [box.x - halfW - GLYPH_CLEAR_MM, box.x + box.w + halfW + GLYPH_CLEAR_MM])];
  const ys = [at.y, ...obstacles.flatMap((box) => [box.y - halfH - GLYPH_CLEAR_MM, box.y + box.h + halfH + GLYPH_CLEAR_MM])];
  let nearest: { x: number; y: number } | null = null;
  let distance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const d = (x - at.x) ** 2 + (y - at.y) ** 2;
      if (d < distance - 1e-12 && free(x, y)) {
        nearest = { x, y };
        distance = d;
      }
    }
  }
  return nearest ?? at;
}

/** An enlarged step's frame's longer side as a share of its window's: one but for a turned rectangle. */
function frameInWindowOf({ frameShare, windowShare }: LayoutZoom): number {
  return windowShare > 0 && frameShare > 0 ? frameShare / windowShare : 1;
}

/** The middle of a picture as drawn, which a tall one has lower than its box's: where the lane passes behind it. */
function laneCentre(cell: LayoutCell): { x: number; y: number } {
  return { x: cell.pictureMm.x + cell.pictureMm.size / 2, y: cell.drawMm.y + cell.drawMm.h / 2 };
}

/**
 * Where the turns on a page print (D22): between two pictures on one row,
 * midway between them at their centres' height — on a flow page, between
 * their boxes, in the gutter the packing kept; across a flow page's bend with
 * no step in it, on the lane at the bend's apex, out at the page's edge
 * (`flowLane`, also when the lane is not shown); between a step in a bend
 * and its neighbour, midway between their pictures' centres; before a picture
 * that starts a grid's row or the page, at its leading edge — a page's first
 * step has no row on the page to turn from, and the lane comes in at its
 * leading side; after the last picture, at its trailing edge. Several in one
 * place stand one above another, each glyph clear of the next, the stack
 * centred on the place. Kept on the paper, and on a flow page clear of every
 * step's number, picture and caption, moved the least way off one it would
 * stand on ({@link clearSpot}): beside a step in a bend no gutter is kept for
 * it.
 *
 * An enlarge arrow (Revision 2) takes the same places, standing after the
 * turns before its step: a turn's places are the arrow's, so the two agree
 * however D22 places them. Alone in a row's gutter, beside the area's step,
 * it is `liftable`. Across a flow page's bend it is aimed from its place at
 * the middle of the enlarged step's picture (Zach, 2026-10-07), its bow on
 * the outside of the lane's bend, the way the row before it read: it leaves
 * heading on round the bend and comes into the step.
 */
function placeTurns(
  steps: readonly LayoutStep[],
  cells: readonly LayoutCell[],
  rowOf: (k: number) => number,
  flow: { plan: FlowPagePlan; lane: ReturnType<typeof flowLane>; apexInset: number } | null,
  pageWidth: number,
  pageHeight: number
): Pick<LayoutPage, 'turns' | 'zoomArrows'> {
  const placed: LayoutPage['turns'] = [];
  const zoomArrows: LayoutZoomArrow[] = [];
  const backwards = (k: number) => flow !== null && rowRightToLeft(flow.plan, rowOf(k));
  const centre = laneCentre;
  /**
   * The edge facing the gutter before (`lead`) or after a step, half a gutter
   * out: a grid picture's, its cell's gutter shared either side of it; a flow
   * step's box's, half the turn gutter the packing keeps beyond it.
   */
  const edge = (k: number, lead: boolean) => {
    const cell = cells[k]!;
    const left = lead !== backwards(k);
    if (flow) {
      const { x, w } = cell.cellMm;
      return { x: left ? x - PACKED_TURN_GUTTER_MM / 2 : x + w + PACKED_TURN_GUTTER_MM / 2, y: centre(cell).y };
    }
    const gutter = cell.cellMm.w - cell.pictureMm.size;
    const x = left ? cell.pictureMm.x - gutter / 2 : cell.pictureMm.x + cell.pictureMm.size + gutter / 2;
    return { x, y: centre(cell).y };
  };
  /** `glyphs` stood at `at`, held on the paper across: their place, an arrow's aim at `toward`, and each glyph's box and the stack's. */
  const standAt = (glyphs: readonly BetweenGlyph[], at: { x: number; y: number }, toward: { x: number; y: number } | null, outward: number) => {
    const x = Math.min(pageWidth - TURN_GUTTER_MM / 2, Math.max(TURN_GUTTER_MM / 2, at.x));
    const angle = toward ? Math.atan2(toward.y - at.y, toward.x - x) : 0;
    // Its bow on the `outward` side: the side unflipped is the one its turn puts its up on.
    const aim: LayoutArrowAim | null = toward ? { angle, flipped: Math.sin(angle) * outward < 0 } : null;
    const boxes = glyphs.map((glyph) => glyphMm(glyph, aim));
    const size = {
      w: Math.max(0, ...boxes.map((box) => box.w)),
      h: boxes.reduce((sum, box) => sum + box.h, 0) + (glyphs.length - 1) * TURN_STACK_CLEAR_MM,
    };
    return { at: { x, y: at.y }, aim, boxes, size };
  };
  /**
   * A step's part where the layout puts it, before any hand placement: a
   * glyph keeps clear of where the layout puts the steps, and a part placed
   * onto one is a clash for the page to say, not a reason to move the glyph.
   */
  const homePart = (cell: LayoutCell, part: 'number' | 'picture' | 'text'): PageBox => {
    if (!cell.placed || !cell.homeParts) return partBox(cell, part);
    const [dx, dy] = pageOffset(cell.placed.offsets, 'frame', Boolean(cell.rightToLeft));
    const home = cell.homeParts[part];
    return { ...home, x: home.x - dx, y: home.y - dy };
  };
  // On a flow page a glyph stands clear of every step's number, picture and caption (`clearSpot`).
  const obstacles = flow
    ? cells.flatMap((cell) => [homePart(cell, 'number'), homePart(cell, 'picture'), ...(cell.text.lines.length > 0 ? [homePart(cell, 'text')] : [])])
    : [];
  const onPaper = (size: { w: number; h: number }) => ({
    x0: TURN_GUTTER_MM / 2,
    x1: pageWidth - TURN_GUTTER_MM / 2,
    y0: size.h / 2,
    y1: pageHeight - size.h / 2,
  });
  /**
   * `glyphs` stood at `at`, in the row of the `k`th picture, which they go the
   * way of; an enlarge arrow among them aimed at `toward`, when given, its bow
   * `outward` (+1 to the page's right, −1 to its left). On a flow page, moved
   * the least way clear of every step's box where they would stand on one.
   */
  const stack = (
    glyphs: readonly BetweenGlyph[],
    at: { x: number; y: number },
    k: number,
    beforeStepId: string | null,
    { shared = false, toward = null, outward = 1 }: { shared?: boolean; toward?: { x: number; y: number } | null; outward?: number } = {}
  ) => {
    let stood = standAt(glyphs, at, toward, outward);
    if (flow) {
      const spot = clearSpot(stood.at, stood.size, obstacles, onPaper(stood.size));
      if (spot !== stood.at) {
        // An arrow aimed from its new place takes another box: clear of the boxes with either.
        const moved = standAt(glyphs, spot, toward, outward);
        const either = { w: Math.max(stood.size.w, moved.size.w), h: Math.max(stood.size.h, moved.size.h) };
        stood = standAt(glyphs, clearSpot(stood.at, either, obstacles, onPaper(either)), toward, outward);
      }
    }
    const { at: { x }, aim, boxes, size } = stood;
    let top = stood.at.y - size.h / 2;
    glyphs.forEach((glyph, index) => {
      const box = boxes[index]!;
      const middle = { x, y: top + box.h / 2 };
      if (glyph.kind === 'turn') {
        const { kind: _kind, ...turn } = glyph;
        placed.push({ ...turn, at: middle, box, beforeStepId, rightToLeft: backwards(k) });
      } else if (beforeStepId !== null) {
        zoomArrows.push({
          at: middle,
          box,
          beforeStepId,
          areaStepId: glyph.arrowFrom.stepId,
          areaId: glyph.arrowFrom.areaId,
          rightToLeft: backwards(k),
          // Alone between the area's step and its own on one row: the page lifts it to the area.
          liftable: shared && glyphs.length === 1 && cells[k - 1]?.stepId === glyph.arrowFrom.stepId,
          aim,
        });
      }
      top += box.h + TURN_STACK_CLEAR_MM;
    });
  };
  steps.forEach((step, k) => {
    const before = glyphsBefore(step);
    if (before.length > 0) {
      // A step in a bend has no row it shares with its neighbours.
      const inBend = flow !== null && k > 0 && Boolean(cells[k - 1]!.bend || cells[k]!.bend);
      if (k > 0 && rowOf(k - 1) === rowOf(k) && !inBend) {
        const a = centre(cells[k - 1]!);
        const b = centre(cells[k]!);
        const facing = (edge(k - 1, false).x + edge(k, true).x) / 2;
        stack(before, { x: facing, y: (a.y + b.y) / 2 }, k, step.id, { shared: true });
      } else if (k > 0 && flow) {
        const [previous, next] = [centre(cells[k - 1]!), centre(cells[k]!)];
        const outward = backwards(k - 1) ? -1 : 1;
        const { lane } = flow;
        let at: { x: number; y: number };
        if (inBend) {
          // Midway between the step in the bend and its neighbour's pictures, as the prototype stands it: its stack
          // then moves clear of both boxes.
          at = { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 };
        } else {
          // On the bend's apex, out at the page's edge, where the lane turns between the two bands.
          const y = (previous.y + next.y) / 2;
          const bend = lane?.bends.get(k);
          const onLane = lane && bend !== undefined ? bendXAt(lane.lane, bend, y) : null;
          at = { x: onLane ?? (outward > 0 ? pageWidth - flow.apexInset : flow.apexInset), y };
        }
        // An arrow there points at the step it leads to, not across the page.
        stack(before, at, k, step.id, { toward: next, outward });
      } else {
        stack(before, edge(k, true), k, step.id);
      }
    }
    if (step.turnsAfter.length > 0) {
      stack(
        step.turnsAfter.map((turn): BetweenGlyph => ({ kind: 'turn', ...turn })),
        edge(k, false),
        k,
        null
      );
    }
  });
  return { turns: placed, zoomArrows };
}
