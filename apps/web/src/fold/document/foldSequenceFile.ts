/**
 * Fold sequences as the project file stores them (`workspace.foldSequences`),
 * read leniently and written back exactly (plan D6, D7).
 *
 * The file's three rules (`lib/documentFile`) hold per sequence — a sequence
 * is a document with its own `formatVersion`, so a newer one opens read-only
 * on its own and is written back as it came — and a tree adds its own:
 *
 * - **A node with a malformed structure is dropped with its subtree.** An id
 *   that is not a non-empty string, or a parent that is neither `null` nor
 *   one, leaves nothing to hang the node on; its children become orphans.
 * - **A node with a malformed or unknown op is kept verbatim and locked.**
 *   Dropping it would silently take its subtree with it, so in a tree damage
 *   to an op is carried like a newer build's op: written back unchanged, and
 *   locking itself and everything below it. So is a node with choices that do
 *   not read, or a key this build does not know: either can change what the
 *   step folds.
 * - **The first of two nodes with one id wins**, as everywhere in the file
 *   (`readEntries`). The later node's children then hang on the first.
 * - **Orphans and cycles are dropped**: only nodes whose path reaches the
 *   sheet are kept, in their order in the file.
 * - **Unknown sequence-level keys are carried verbatim.** Unlike the
 *   Diagram's document fields, they do not open the sequence read-only: the
 *   steps hold everything that decides a state, and the paper — the one
 *   sequence-level field that does — opens it read-only when a newer build
 *   wrote it ({@link newerPaperField}).
 *
 * Marks are annotations, read by the file's plain rules: a malformed mark is
 * dropped, a newer build's carried. A malformed `expect` or note is dropped;
 * neither changes what a step folds.
 *
 * Every string a user typed passes through `xmlText` on the way in, so what
 * is stored can always be written into an SVG page.
 *
 * React-free and store-free.
 */

import {
  NEWER,
  finiteNumber,
  hasNewerKey,
  isRecord,
  readEntries,
  readVersioned,
  writeVersioned,
} from '../../lib/documentFile';
import type { FoldAxiom, ReferenceKind } from '../../lib/foldSentences';
import type { OristudioCpRatioExpression } from '../../lib/oristudioCpToolSettings';
import type { TurnOverAxis, TurnRotation } from '../../lib/steps/turn';
import { xmlText } from '../../lib/xmlEscape';
import {
  AXIOM_SLOTS,
  FOLD_CP_ORIGINS,
  FOLD_DIRECTIONS,
  FOLD_MARK_MAX_PARTS,
  FOLD_POLYGON_MAX_SIDES,
  FOLD_POLYGON_MIN_SIDES,
  FOLD_SEQUENCE_FORMAT_VERSION,
  FOLD_START_SIDES,
  SQUARE_PAPER,
  isKnownMark,
  isLockedStep,
  randomFoldId,
  rectangleShape,
  type FoldChoices,
  type FoldDirection,
  type FoldDivide,
  type FoldIdFactory,
  type FoldLineInput,
  type FoldLockedStep,
  type FoldMark,
  type FoldMarkEntry,
  type FoldModelLine,
  type FoldOp,
  type FoldOpeningChoice,
  type FoldPairChoice,
  type FoldPaper,
  type FoldPaperShape,
  type FoldRef,
  type FoldSeed,
  type FoldSequenceDocument,
  type FoldStep,
  type FoldStepNode,
  type SheetPoint,
} from './foldSequenceDocument';
import { FOLD_SHEET_KEY, childrenOf, foldStepTree } from './foldStepTree';

/** A sequence as the project holds it: its document, and the value a read-only one is written back as. */
export interface HeldFoldSequence {
  document: FoldSequenceDocument;
  /**
   * Set when a newer build wrote the sequence: it is shown as `document`, a
   * best-effort reading, never changed, and written back as this value.
   */
  readOnlyRaw: Record<string, unknown> | null;
}

export interface ReadFoldSequenceOptions {
  newId?: FoldIdFactory;
}

/**
 * Read `workspace.foldSequences`: every entry that is a record, in order. A
 * value that is not an array is no sequences. Two sequences with one id would
 * make every reader state and link that names one ambiguous, so a later one
 * is given a new id; it is not dropped, since it holds a user's steps.
 */
export function readFoldSequences(value: unknown, options: ReadFoldSequenceOptions = {}): HeldFoldSequence[] {
  if (!Array.isArray(value)) return [];
  const newId = options.newId ?? randomFoldId;
  const sequences: HeldFoldSequence[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const held = readFoldSequence(entry, { newId });
    if (!held) continue;
    const document = ids.has(held.document.id) ? { ...held.document, id: newId('fold') } : held.document;
    ids.add(document.id);
    sequences.push({ ...held, document });
  }
  return sequences;
}

/** Read one sequence; null for a value that is not a record. */
export function readFoldSequence(value: unknown, options: ReadFoldSequenceOptions = {}): HeldFoldSequence | null {
  const newId = options.newId ?? randomFoldId;
  const read = readVersioned(value, {
    version: FOLD_SEQUENCE_FORMAT_VERSION,
    read: (raw) => readDocument(raw, newId),
    newerField: newerPaperField,
  });
  return read && { document: read.document, readOnlyRaw: read.readOnly ? read.raw : null };
}

/**
 * The value written for `workspace.foldSequences`, or null for none: an
 * empty array writes no key, so a project without sequences is written byte
 * for byte as it was before Fold existed (plan D7).
 */
export function writeFoldSequences(sequences: readonly HeldFoldSequence[]): Record<string, unknown>[] | null {
  return sequences.length === 0 ? null : sequences.map(writeFoldSequence);
}

/** One sequence as written: a read-only one as it was read, any other with every field named here. */
export function writeFoldSequence({ document, readOnlyRaw }: HeldFoldSequence): Record<string, unknown> {
  return writeVersioned(document, readOnlyRaw, { version: FOLD_SEQUENCE_FORMAT_VERSION, write: writeSequenceFields });
}

// ---------------------------------------------------------------------------
// Reading the sequence

const SEQUENCE_KEYS = new Set(['formatVersion', 'id', 'title', 'paper', 'appearance', 'sheetMarks', 'steps']);

function readDocument(value: Record<string, unknown>, newId: FoldIdFactory): FoldSequenceDocument {
  const sheetMarks = readMarks(value.sheetMarks);
  const carried = Object.fromEntries(Object.entries(value).filter(([key]) => !SEQUENCE_KEYS.has(key)));
  return {
    formatVersion: FOLD_SEQUENCE_FORMAT_VERSION,
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : newId('fold'),
    title: typeof value.title === 'string' ? xmlText(value.title) : '',
    paper: readPaper(value.paper),
    ...(isRecord(value.appearance) ? { appearance: value.appearance } : {}),
    ...(sheetMarks.length > 0 ? { sheetMarks } : {}),
    steps: readSteps(value.steps),
    ...(Object.keys(carried).length > 0 ? { carried } : {}),
  };
}

/** A damaged paper reads as the square, front up; the steps then replay against it and break where they do not fit. */
function readPaper(value: unknown): FoldPaper {
  if (!isRecord(value)) return SQUARE_PAPER;
  return {
    shape: readShape(value.shape) ?? SQUARE_PAPER.shape,
    startSide: FOLD_START_SIDES.find((side) => side === value.startSide) ?? SQUARE_PAPER.startSide,
  };
}

/**
 * A shape, best-effort: a polygon of more sides than this build offers still
 * reads, for the read-only sequence that holds one ({@link newerPaperField}).
 */
function readShape(value: unknown): FoldPaperShape | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'square':
      return { kind: 'square' };
    case 'rectangle': {
      const aspect = readPoint(value.aspect);
      return aspect && rectangleShape(aspect[0], aspect[1]);
    }
    case 'polygon': {
      const points = readPoints(value.points);
      return points && points.length >= FOLD_POLYGON_MIN_SIDES ? { kind: 'polygon', points } : null;
    }
    default:
      return null;
  }
}

const PAPER_KEYS = new Set(['shape', 'startSide']);
const SHAPE_KEYS = new Map<string, ReadonlySet<string>>([
  ['square', new Set(['kind'])],
  ['rectangle', new Set(['kind', 'aspect'])],
  ['polygon', new Set(['kind', 'points'])],
]);

/**
 * The first field of a sequence's paper that a newer build wrote, or `null`.
 *
 * The paper decides every state of the sequence, so a paper this build would
 * read as something else — an unknown shape or side, a key it does not know,
 * a polygon of more sides than it offers — opens the sequence read-only, as a
 * newer `formatVersion` does, and the sequence is written back as it came. A
 * value of the wrong type is damage rather than news, and reads as the
 * square.
 */
export function newerPaperField(value: Record<string, unknown>): string | null {
  const paper = value.paper;
  if (!isRecord(paper)) return null;
  for (const key of Object.keys(paper)) if (!PAPER_KEYS.has(key)) return `paper.${key}`;
  if (typeof paper.startSide === 'string' && !FOLD_START_SIDES.some((side) => side === paper.startSide)) {
    return 'paper.startSide';
  }
  const shape = paper.shape;
  if (!isRecord(shape) || typeof shape.kind !== 'string') return null;
  const known = SHAPE_KEYS.get(shape.kind);
  if (!known) return 'paper.shape.kind';
  for (const key of Object.keys(shape)) if (!known.has(key)) return `paper.shape.${key}`;
  if (shape.kind === 'polygon' && Array.isArray(shape.points) && shape.points.length > FOLD_POLYGON_MAX_SIDES) {
    return 'paper.shape.points';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reading the steps

const STEP_KEYS = new Set(['id', 'parent', 'op', 'choices', 'expect', 'note', 'marks']);

function readSteps(value: unknown): FoldStepNode[] {
  return withinTree(readEntries<FoldStepNode>(value, readStep, lockStep));
}

/** A node's parent: `null` for the sheet, a non-empty id, or `undefined` for one that does not read. */
function readParent(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readStep(id: string, entry: Record<string, unknown>): FoldStep | typeof NEWER | null {
  const parent = readParent(entry.parent);
  if (parent === undefined) return null;
  if (hasNewerKey(entry, STEP_KEYS)) return NEWER;
  const op = readOp(entry.op);
  if (!op) return NEWER;
  const choices = entry.choices === undefined ? {} : readChoices(entry.choices);
  if (!choices) return NEWER;
  const marks = readMarks(entry.marks);
  return {
    id,
    parent,
    op,
    ...(Object.keys(choices).length > 0 ? { choices } : {}),
    ...(typeof entry.expect === 'string' ? { expect: entry.expect } : {}),
    ...(typeof entry.note === 'string' ? { note: xmlText(entry.note) } : {}),
    ...(marks.length > 0 ? { marks } : {}),
  };
}

/** A node `readStep` carried: only ever one whose parent read. */
function lockStep(id: string, entry: Record<string, unknown>): FoldLockedStep {
  return {
    id,
    parent: readParent(entry.parent) ?? null,
    unknown: entry,
    ...(typeof entry.note === 'string' ? { note: xmlText(entry.note) } : {}),
  };
}

/**
 * The nodes whose path reaches the sheet, in their order in the file: an
 * orphan, every node of a cycle, and everything that folds from either are
 * left out.
 */
function withinTree(nodes: FoldStepNode[]): FoldStepNode[] {
  const tree = foldStepTree(nodes);
  const kept = new Set<string>();
  const queue = [FOLD_SHEET_KEY];
  for (let at = 0; at < queue.length; at += 1) {
    for (const child of childrenOf(tree, queue[at])) {
      if (kept.has(child.id)) continue;
      kept.add(child.id);
      queue.push(child.id);
    }
  }
  return kept.size === nodes.length ? nodes : nodes.filter((node) => kept.has(node.id));
}

// ---------------------------------------------------------------------------
// Reading an op

const ALONG_LINE_KEYS = new Set(['kind', 'line', 'moving', 'seed']);
const OP_KEYS = new Map<string, ReadonlySet<string>>([
  ['valley', ALONG_LINE_KEYS],
  ['mountain', ALONG_LINE_KEYS],
  ['precrease', new Set([...ALONG_LINE_KEYS, 'direction'])],
  ['unfold', new Set(['kind', 'crease', 'direction', 'moving', 'seed'])],
  ['refold', new Set(['kind', 'crease', 'direction', 'moving', 'seed'])],
  ['turn', new Set(['kind', 'axis'])],
  ['rotate', new Set(['kind', 'rotate'])],
  ['cp-jump', new Set(['kind', 'cpJson', 'orderJson', 'origin'])],
]);

const TURN_AXES: readonly TurnOverAxis[] = ['vertical', 'horizontal'];
const ROTATION_AMOUNTS: readonly TurnRotation['amount'][] = ['eighth', 'quarter', 'half'];
const ROTATION_DIRECTIONS: readonly TurnRotation['direction'][] = ['cw', 'ccw'];
const ROTATION_KEYS = new Set(['amount', 'direction']);

/**
 * An op, or null for one this build cannot read: a kind it does not know, a
 * key it does not know, or a field that does not read. Only the structure is
 * judged here. Whether the inputs resolve — a point on the sheet, two free
 * points far enough apart — is the engine's to say on replay, as *broken*.
 */
function readOp(value: unknown): FoldOp | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  const keys = OP_KEYS.get(value.kind);
  if (!keys || hasNewerKey(value, keys)) return null;
  const kind = value.kind;
  switch (kind) {
    case 'valley':
    case 'mountain': {
      const along = readAlongLine(value);
      return along && { kind, ...along };
    }
    case 'precrease': {
      const along = readAlongLine(value);
      const direction = readDirection(value.direction);
      return along && direction && { kind, direction, ...along };
    }
    case 'unfold':
    case 'refold': {
      const crease = readPoint(value.crease);
      const direction = readDirection(value.direction);
      const motion = readMotion(value);
      return crease && direction && motion && { kind, crease, direction, ...motion };
    }
    case 'turn': {
      const axis = TURN_AXES.find((known) => known === value.axis);
      return axis ? { kind, axis } : null;
    }
    case 'rotate': {
      const rotate = readRotation(value.rotate);
      return rotate && { kind, rotate };
    }
    case 'cp-jump': {
      const origin = FOLD_CP_ORIGINS.find((known) => known === value.origin);
      const { cpJson, orderJson } = value;
      return origin && typeof cpJson === 'string' && typeof orderJson === 'string'
        ? { kind, cpJson, orderJson, origin }
        : null;
    }
    default:
      return null;
  }
}

function readDirection(value: unknown): FoldDirection | null {
  return FOLD_DIRECTIONS.find((direction) => direction === value) ?? null;
}

function readRotation(value: unknown): TurnRotation | null {
  if (!isRecord(value) || hasNewerKey(value, ROTATION_KEYS)) return null;
  const amount = ROTATION_AMOUNTS.find((known) => known === value.amount);
  const direction = ROTATION_DIRECTIONS.find((known) => known === value.direction);
  return amount && direction ? { amount, direction } : null;
}

/** A fold along a line's line, side and seed. */
function readAlongLine(
  value: Record<string, unknown>
): { line: FoldLineInput; moving?: SheetPoint; seed: FoldSeed } | null {
  const line = readLine(value.line);
  const motion = readMotion(value);
  return line && motion && { line, ...motion };
}

/** The moving side and the seed. The side is required when the seed is `all`, which does not imply one. */
function readMotion(value: Record<string, unknown>): { moving?: SheetPoint; seed: FoldSeed } | null {
  const seed = readSeed(value.seed);
  if (!seed) return null;
  if (value.moving === undefined) return seed.scope === 'all' ? null : { seed };
  const moving = readPoint(value.moving);
  return moving && { moving, seed };
}

const SEED_KEYS = new Map<string, ReadonlySet<string>>([
  ['all', new Set(['scope'])],
  ['depth', new Set(['scope', 'at', 'layers'])],
  ['flaps', new Set(['scope', 'at'])],
]);

function readSeed(value: unknown): FoldSeed | null {
  if (!isRecord(value) || typeof value.scope !== 'string') return null;
  const keys = SEED_KEYS.get(value.scope);
  if (!keys || hasNewerKey(value, keys)) return null;
  switch (value.scope) {
    case 'all':
      return { scope: 'all' };
    case 'depth': {
      const at = readPoint(value.at);
      const { layers } = value;
      return at && typeof layers === 'number' && Number.isInteger(layers) && layers > 0
        ? { scope: 'depth', at, layers }
        : null;
    }
    case 'flaps': {
      const at = readPoints(value.at);
      return at && at.length > 0 ? { scope: 'flaps', at } : null;
    }
    default:
      return null;
  }
}

const LINE_KEYS = new Map<string, ReadonlySet<string>>([
  ['axiom', new Set(['via', 'axiom', 'inputs'])],
  ['free', new Set(['via', 'through'])],
  ['crease', new Set(['via', 'at'])],
]);

function readLine(value: unknown): FoldLineInput | null {
  if (!isRecord(value) || typeof value.via !== 'string') return null;
  const keys = LINE_KEYS.get(value.via);
  if (!keys || hasNewerKey(value, keys)) return null;
  switch (value.via) {
    case 'axiom': {
      const axiom = readAxiom(value.axiom);
      if (axiom === null || !Array.isArray(value.inputs)) return null;
      const slots = AXIOM_SLOTS[axiom];
      if (value.inputs.length !== slots.length) return null;
      const inputs: FoldRef[] = [];
      for (const [k, slot] of slots.entries()) {
        const input = readRef(value.inputs[k], slot);
        if (!input) return null;
        inputs.push(input);
      }
      return { via: 'axiom', axiom, inputs };
    }
    case 'free': {
      const through = readPoints(value.through);
      return through && through.length === 2 ? { via: 'free', through: [through[0], through[1]] } : null;
    }
    case 'crease': {
      const at = readPoint(value.at);
      return at && { via: 'crease', at };
    }
    default:
      return null;
  }
}

function readAxiom(value: unknown): FoldAxiom | null {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6 || value === 7
    ? value
    : null;
}

const POINT_REF_KEYS = new Set(['kind', 'at']);
const MARK_REF_KEYS = new Set(['kind', 'at', 'mark']);
const EDGE_REF_KEYS = new Set(['kind', 'a', 'b']);

/** An axiom input of the kind its slot takes: a point (or a mark's point), or a line by two points. */
function readRef(value: unknown, slot: ReferenceKind): FoldRef | null {
  if (!isRecord(value)) return null;
  if (slot === 'line') {
    if (value.kind !== 'edge' || hasNewerKey(value, EDGE_REF_KEYS)) return null;
    const a = readPoint(value.a);
    const b = readPoint(value.b);
    return a && b && { kind: 'edge', a, b };
  }
  const at = readPoint(value.at);
  if (!at) return null;
  if (value.kind === 'point') return hasNewerKey(value, POINT_REF_KEYS) ? null : { kind: 'point', at };
  if (value.kind !== 'mark' || hasNewerKey(value, MARK_REF_KEYS)) return null;
  return typeof value.mark === 'string' && value.mark.length > 0 ? { kind: 'mark', at, mark: value.mark } : null;
}

// ---------------------------------------------------------------------------
// Reading choices

const CHOICE_KEYS = new Set(['root', 'completion', 'pocket', 'opening']);
const MODEL_LINE_KEYS = new Set(['n', 'd']);
const PAIR_KEYS = new Set(['above', 'below']);
const OPENING_KEYS = new Set(['upper']);

/** Choices, or null for ones this build cannot read. An empty list reads as no choice of its kind. */
function readChoices(value: unknown): FoldChoices | null {
  if (!isRecord(value) || hasNewerKey(value, CHOICE_KEYS)) return null;
  const choices: {
    root?: FoldModelLine;
    completion?: FoldPairChoice[];
    pocket?: [SheetPoint, SheetPoint];
    opening?: FoldOpeningChoice[];
  } = {};
  if (value.root !== undefined) {
    const root = readModelLine(value.root);
    if (!root) return null;
    choices.root = root;
  }
  if (value.completion !== undefined) {
    const completion = readList(value.completion, readPair);
    if (!completion) return null;
    if (completion.length > 0) choices.completion = completion;
  }
  if (value.pocket !== undefined) {
    const pocket = readPoints(value.pocket);
    if (!pocket || pocket.length !== 2) return null;
    choices.pocket = [pocket[0], pocket[1]];
  }
  if (value.opening !== undefined) {
    const opening = readList(value.opening, readOpening);
    if (!opening) return null;
    if (opening.length > 0) choices.opening = opening;
  }
  return choices;
}

function readModelLine(value: unknown): FoldModelLine | null {
  if (!isRecord(value) || hasNewerKey(value, MODEL_LINE_KEYS)) return null;
  const n = readPoint(value.n);
  const d = finiteNumber(value.d);
  return n && d !== null && (n[0] !== 0 || n[1] !== 0) ? { n, d } : null;
}

function readPair(value: unknown): FoldPairChoice | null {
  if (!isRecord(value) || hasNewerKey(value, PAIR_KEYS)) return null;
  const above = readPoint(value.above);
  const below = readPoint(value.below);
  return above && below && { above, below };
}

function readOpening(value: unknown): FoldOpeningChoice | null {
  if (!isRecord(value) || hasNewerKey(value, OPENING_KEYS)) return null;
  const upper = readPoints(value.upper);
  return upper && upper.length > 0 ? { upper } : null;
}

// ---------------------------------------------------------------------------
// Reading marks

const MARK_KEYS = new Set(['id', 'from', 'to', 'divide']);
const COUNT_DIVIDE_KEYS = new Set(['mode', 'parts']);
const RATIO_DIVIDE_KEYS = new Set(['mode', 'ratio']);
const RATIO_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const RATIO_KEY_SET = new Set<string>(RATIO_KEYS);

function readMarks(value: unknown): FoldMarkEntry[] {
  return readEntries<FoldMarkEntry>(value, readMark, (id, unknown) => ({ id, unknown }));
}

function readMark(id: string, entry: Record<string, unknown>): FoldMark | typeof NEWER | null {
  if (hasNewerKey(entry, MARK_KEYS)) return NEWER;
  const from = readPoint(entry.from);
  const to = readPoint(entry.to);
  const divide = readDivide(entry.divide);
  if (!from || !to || divide === null) return null;
  return divide === NEWER ? NEWER : { id, from, to, divide };
}

/** A division: a mode or a part count this build does not offer is a newer build's. */
function readDivide(value: unknown): FoldDivide | typeof NEWER | null {
  if (!isRecord(value) || typeof value.mode !== 'string') return null;
  switch (value.mode) {
    case 'count': {
      if (hasNewerKey(value, COUNT_DIVIDE_KEYS)) return NEWER;
      const { parts } = value;
      if (typeof parts !== 'number' || !Number.isInteger(parts) || parts < 2) return null;
      return parts > FOLD_MARK_MAX_PARTS ? NEWER : { mode: 'count', parts };
    }
    case 'ratio': {
      if (hasNewerKey(value, RATIO_DIVIDE_KEYS)) return NEWER;
      const ratio = readRatio(value.ratio);
      return ratio === null || ratio === NEWER ? ratio : { mode: 'ratio', ratio };
    }
    default:
      return NEWER;
  }
}

/** Edit's exact ratio `a + b√c : d + e√f`, both parts positive. */
function readRatio(value: unknown): OristudioCpRatioExpression | typeof NEWER | null {
  if (!isRecord(value)) return null;
  if (hasNewerKey(value, RATIO_KEY_SET)) return NEWER;
  const [a, b, c, d, e, f] = RATIO_KEYS.map((key) => finiteNumber(value[key]));
  if (a === null || b === null || c === null || d === null || e === null || f === null) return null;
  if (c < 0 || f < 0 || !(a + b * Math.sqrt(c) > 0) || !(d + e * Math.sqrt(f) > 0)) return null;
  return { a, b, c, d, e, f };
}

// ---------------------------------------------------------------------------
// Reading values

/** Two finite numbers. */
function readPoint(value: unknown): SheetPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = finiteNumber(value[0]);
  const y = finiteNumber(value[1]);
  return x !== null && y !== null ? [x, y] : null;
}

function readPoints(value: unknown): SheetPoint[] | null {
  return readList(value, readPoint);
}

/** Every entry of a list read by `read`, or null when the value is not a list or any entry does not read. */
function readList<T>(value: unknown, read: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const list: T[] = [];
  for (const entry of value) {
    const item = read(entry);
    if (item === null) return null;
    list.push(item);
  }
  return list;
}

// ---------------------------------------------------------------------------
// Writing

/** Every field but `formatVersion`, which `writeVersioned` writes first; the carried keys last, as they came. */
function writeSequenceFields(document: FoldSequenceDocument): Record<string, unknown> {
  const { sheetMarks, appearance, carried } = document;
  return {
    id: document.id,
    title: document.title,
    paper: writeFoldPaper(document.paper),
    ...(appearance ? { appearance } : {}),
    ...(sheetMarks && sheetMarks.length > 0 ? { sheetMarks: sheetMarks.map(writeMark) } : {}),
    steps: document.steps.map(writeStep),
    ...carried,
  };
}

/** The paper as written, and as `fh1` spells it. */
export function writeFoldPaper({ shape, startSide }: FoldPaper): Record<string, unknown> {
  return { shape: writeShape(shape), startSide };
}

function writeShape(shape: FoldPaperShape): Record<string, unknown> {
  switch (shape.kind) {
    case 'square':
      return { kind: shape.kind };
    case 'rectangle':
      return { kind: shape.kind, aspect: writePoint(shape.aspect) };
    case 'polygon':
      return { kind: shape.kind, points: shape.points.map(writePoint) };
  }
}

function writeStep(node: FoldStepNode): Record<string, unknown> {
  if (isLockedStep(node)) return node.unknown;
  const choices = node.choices ? writeFoldChoices(node.choices) : null;
  return {
    id: node.id,
    parent: node.parent,
    op: writeFoldOp(node.op),
    ...(choices ? { choices } : {}),
    ...(node.expect !== undefined ? { expect: node.expect } : {}),
    ...(node.note !== undefined ? { note: node.note } : {}),
    ...(node.marks && node.marks.length > 0 ? { marks: node.marks.map(writeMark) } : {}),
  };
}

/** An op as written — every field named, in a fixed order — and as `fh1` spells it. */
export function writeFoldOp(op: FoldOp): Record<string, unknown> {
  switch (op.kind) {
    case 'valley':
    case 'mountain':
      return { kind: op.kind, line: writeLine(op.line), ...writeMotion(op) };
    case 'precrease':
      return { kind: op.kind, line: writeLine(op.line), direction: op.direction, ...writeMotion(op) };
    case 'unfold':
    case 'refold':
      return { kind: op.kind, crease: writePoint(op.crease), direction: op.direction, ...writeMotion(op) };
    case 'turn':
      return { kind: op.kind, axis: op.axis };
    case 'rotate':
      return { kind: op.kind, rotate: { amount: op.rotate.amount, direction: op.rotate.direction } };
    case 'cp-jump':
      return { kind: op.kind, cpJson: op.cpJson, orderJson: op.orderJson, origin: op.origin };
  }
}

function writeMotion({ moving, seed }: { moving?: SheetPoint; seed: FoldSeed }): Record<string, unknown> {
  return { ...(moving ? { moving: writePoint(moving) } : {}), seed: writeSeed(seed) };
}

function writeSeed(seed: FoldSeed): Record<string, unknown> {
  switch (seed.scope) {
    case 'all':
      return { scope: seed.scope };
    case 'depth':
      return { scope: seed.scope, at: writePoint(seed.at), layers: seed.layers };
    case 'flaps':
      return { scope: seed.scope, at: seed.at.map(writePoint) };
  }
}

function writeLine(line: FoldLineInput): Record<string, unknown> {
  switch (line.via) {
    case 'axiom':
      return { via: line.via, axiom: line.axiom, inputs: line.inputs.map(writeRef) };
    case 'free':
      return { via: line.via, through: line.through.map(writePoint) };
    case 'crease':
      return { via: line.via, at: writePoint(line.at) };
  }
}

function writeRef(ref: FoldRef): Record<string, unknown> {
  switch (ref.kind) {
    case 'point':
      return { kind: ref.kind, at: writePoint(ref.at) };
    case 'mark':
      return { kind: ref.kind, at: writePoint(ref.at), mark: ref.mark };
    case 'edge':
      return { kind: ref.kind, a: writePoint(ref.a), b: writePoint(ref.b) };
  }
}

/** Choices as written, and as `fh1` spells them: null when there are none, so `{}` and none are one value. */
export function writeFoldChoices(choices: FoldChoices): Record<string, unknown> | null {
  const { root, completion, pocket, opening } = choices;
  const written = {
    ...(root ? { root: { n: writePoint(root.n), d: root.d } } : {}),
    ...(completion && completion.length > 0
      ? { completion: completion.map(({ above, below }) => ({ above: writePoint(above), below: writePoint(below) })) }
      : {}),
    ...(pocket ? { pocket: pocket.map(writePoint) } : {}),
    ...(opening && opening.length > 0
      ? { opening: opening.map(({ upper }) => ({ upper: upper.map(writePoint) })) }
      : {}),
  };
  return Object.keys(written).length > 0 ? written : null;
}

function writeMark(mark: FoldMarkEntry): Record<string, unknown> {
  if (!isKnownMark(mark)) return mark.unknown;
  return { id: mark.id, from: writePoint(mark.from), to: writePoint(mark.to), divide: writeDivide(mark.divide) };
}

function writeDivide(divide: FoldDivide): Record<string, unknown> {
  if (divide.mode === 'count') return { mode: divide.mode, parts: divide.parts };
  const { a, b, c, d, e, f } = divide.ratio;
  return { mode: divide.mode, ratio: { a, b, c, d, e, f } };
}

function writePoint(point: SheetPoint | readonly [number, number]): [number, number] {
  return [point[0], point[1]];
}
