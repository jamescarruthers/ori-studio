/**
 * A Layer order engine with no wasm, for tests: a backend that answers the
 * contract over a toy figure, and a worker that runs the real worker shell
 * (`workers/layerOrderWorkerApi.ts`) through comlink, so a runtime test
 * exercises everything but the bridge.
 *
 * **The toy figure** stacks every face on one spot. Its creases force some
 * pairs; the rest are open. An order is the one stack, and the fitting order
 * closest to the one on screen keeps each face where it was unless a face
 * that must be above it is not, which then moves just above it. That is
 * enough to give every verdict E5 gives, by the same rules: a pair asked both
 * ways is `opposed`, a pair against the creases is `forced`, a cycle is a
 * `conflict`; with no nodes, an answer that needs a search (one that would
 * move the order) times out, while one that deduction settles does not; a
 * constraint that is no question throws, as the bridge does. It has a paper
 * scene (each face a square on the crease pattern, all folded onto one), and
 * counts its solutions by brute force, standing in for E6's count.
 *
 * **Control.** Every call is logged ({@link FakeLayerOrderBackend.calls});
 * {@link FakeLayerOrderBackend.hold} keeps the next answer of a call back
 * until the test releases it; {@link FakeLayerOrderBackend.trapNext} makes
 * the next one fail as a trapped wasm call does. {@link FakeLayerOrderWorker}
 * delivers messages a task later, as a worker does, and can die
 * ({@link FakeLayerOrderWorker.crash}).
 */
import { expose, type Endpoint } from 'comlink';
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import type { Point } from '../../lib/geometry';
import {
  encodeLayerOrderRecord,
  type LayerOrderPair,
  type LayerOrderRecord,
} from '../../lib/layerOrder/layerOrderRecord';
import type { LayerOrderSource } from '../../lib/layerOrder/layerOrderRequest';
import { DEFAULT_FOLDED_MODEL } from '../../lib/orieditaNativeMetadata';
import { createLayerOrderWorkerApi, type LayerOrderBackend } from '../../workers/layerOrderWorkerApi';
import type { LayerFace } from './faceIndex';
import {
  LAYER_ORDER_CALL_FAILURES,
  SAVED_FACE_GONE,
  SAVED_FACE_INTACT,
  SAVED_PAIR_KEPT,
  type LayerCantFit,
  type LayerChangedSpots,
  type LayerConstraint,
  type LayerOrderEngine,
  type LayerOrderLimits,
  type LayerOrderOpened,
  type LayerSavedConstraintStatus,
  type LayerSide,
  type LayerStacks,
  type LayerTimedOut,
} from './layerOrderEngine';

// ---------------------------------------------------------------------------
// The toy figure

export interface FakeLayerOrderFigure {
  /** Where each face lies on the crease pattern: the centre of its square. */
  readonly facePoints: readonly (readonly [number, number])[];
  /** Per face, whether it shows its front from the front side. */
  readonly frontUp: readonly boolean[];
  /** The first order, top first from the front: every face, on one spot. */
  readonly order: readonly LayerFace[];
  /** What the creases force, `[upper, lower]`. */
  readonly forced: readonly (readonly [LayerFace, LayerFace])[];
}

/**
 * Four faces in a 2 × 2 grid on the crease pattern, two face up and two face
 * down: the creases force 0 above 1, and leave 0–2, 0–3, 1–2, 1–3 and 2–3
 * open.
 */
export const FAKE_LAYER_ORDER_FIGURE: FakeLayerOrderFigure = {
  facePoints: [
    [10, 10],
    [30, 10],
    [10, 30],
    [30, 30],
  ],
  frontUp: [true, false, true, false],
  order: [0, 1, 2, 3],
  forced: [[0, 1]],
};

/** A source for the toy figure: the fake reads none of it. */
export const FAKE_LAYER_ORDER_SOURCE: LayerOrderSource = {
  segments: [],
  startingFaceId: 0,
  auxSegments: [],
  model: DEFAULT_FOLDED_MODEL,
  digest: 'fake-figure',
};

/** Enough for anything the toy figure asks. */
export const FAKE_LIMITS: LayerOrderLimits = { maxNodes: 1_000, fastNodes: 128, deadlineMs: 1_000 };
/** No nodes at all: a search times out. */
export const FAKE_NO_NODES: LayerOrderLimits = { maxNodes: 0, fastNodes: 0, deadlineMs: 1_000 };

type Upper = readonly [upper: LayerFace, lower: LayerFace];

/** Which of the two faces lies above, by FOLD's sign rule (`constraintVerb`). */
function aboveOf([subject, object, sign]: LayerConstraint, frontUp: readonly boolean[]): Upper {
  const subjectAbove = (sign === 1) === frontUp[object];
  return subjectAbove ? [subject, object] : [object, subject];
}

/**
 * The order closest to `shown` that keeps every `edge`'s upper above its
 * lower, or null for a cycle: faces in the order shown, each preceded by
 * whichever of the faces that must be above it are not placed yet. An order
 * that already fits comes back unchanged.
 */
function closestOrder(shown: readonly LayerFace[], edges: readonly Upper[]): LayerFace[] | null {
  const rank = new Map(shown.map((face, i) => [face, i]));
  const uppers = new Map<LayerFace, LayerFace[]>();
  for (const [upper, lower] of edges) uppers.set(lower, [...(uppers.get(lower) ?? []), upper]);
  const order: LayerFace[] = [];
  const placed = new Set<LayerFace>();
  const placing = new Set<LayerFace>();
  const place = (face: LayerFace): boolean => {
    if (placed.has(face)) return true;
    if (placing.has(face)) return false;
    placing.add(face);
    const above = [...(uppers.get(face) ?? [])].sort((a, b) => rank.get(a)! - rank.get(b)!);
    if (!above.every(place)) return false;
    placing.delete(face);
    placed.add(face);
    order.push(face);
    return true;
  };
  return shown.every(place) ? order : null;
}

function stacksOf(order: readonly LayerFace[]): { front: LayerStacks; back: LayerStacks } {
  const offsets = Uint32Array.of(0, order.length);
  return {
    front: { offsets, faces: Uint32Array.from(order) },
    back: { offsets: offsets.slice(), faces: Uint32Array.from([...order].reverse()) },
  };
}

function changedBetween(before: readonly LayerFace[], after: readonly LayerFace[]): LayerChangedSpots {
  return {
    front: before[0] === after[0] ? new Uint32Array() : Uint32Array.of(0),
    back: before.at(-1) === after.at(-1) ? new Uint32Array() : Uint32Array.of(0),
  };
}

/** Every order of `faces`, in lexicographic order of positions. */
function permutations(faces: readonly LayerFace[]): LayerFace[][] {
  if (faces.length <= 1) return [[...faces]];
  return faces.flatMap((face, i) =>
    permutations([...faces.slice(0, i), ...faces.slice(i + 1)]).map((rest) => [face, ...rest])
  );
}

/**
 * The toy figure's paper scene from `side`, for an order: each face a 10 × 10
 * square about its point on the crease pattern, all folded onto the one spot.
 */
export function fakeLayerOrderScene(
  figure: FakeLayerOrderFigure,
  order: readonly LayerFace[],
  side: LayerSide
): OristudioCpFoldedPaperScene {
  const square = ([x, y]: readonly [number, number]): Point[] => [
    { x: x - 5, y: y - 5 },
    { x: x + 5, y: y - 5 },
    { x: x + 5, y: y + 5 },
    { x: x - 5, y: y + 5 },
  ];
  const spot = square([5, 5]);
  const edges = spot.map((from, i) => ({ from, to: spot[(i + 1) % spot.length]!, kind: 'border' as const }));
  return {
    schema_version: 3,
    flipped: side === 'back',
    sheet: 40,
    faces: figure.facePoints.map((_, k) => ({
      outline: spot,
      points: [0, 1, 2, 3].map((corner) => k * 4 + corner),
      front_up: figure.frontUp[k] === (side === 'front'),
      edges,
    })),
    subfaces: [{ polygon: spot, faces_top_to_bottom: side === 'front' ? [...order] : [...order].reverse() }],
    aux_lines: [],
    sheet_points: figure.facePoints.flatMap(square),
  };
}

// ---------------------------------------------------------------------------
// The backend

/** The backend, with the test's handles on it. */
export interface FakeLayerOrderBackend extends LayerOrderBackend {
  /** Every call answered or held, by name, in the order they reached the backend. */
  readonly calls: (keyof LayerOrderEngine)[];
  /** Keep the next answer of `call` back until `release` (a stand-in for a call that runs long). */
  hold(call: keyof LayerOrderEngine): { release(): void };
  /** Fail the next `call` as a trapped wasm call does. */
  trapNext(call: keyof LayerOrderEngine): void;
}

interface Session {
  constraints: LayerConstraint[];
  order: LayerFace[];
}

export function createFakeLayerOrderBackend(figure: FakeLayerOrderFigure = FAKE_LAYER_ORDER_FIGURE): FakeLayerOrderBackend {
  const faceCount = figure.order.length;
  const calls: (keyof LayerOrderEngine)[] = [];
  const holds = new Map<keyof LayerOrderEngine, Promise<void>[]>();
  const traps = new Set<keyof LayerOrderEngine>();
  let session: Session | null = null;

  /** Log the call, wait out a hold on it, and fail it if it is to trap. */
  const answering = async (call: keyof LayerOrderEngine): Promise<void> => {
    calls.push(call);
    const held = holds.get(call)?.shift();
    if (held) await held;
    if (traps.delete(call)) throw new WebAssembly.RuntimeError('unreachable');
  };

  const current = (): Session => {
    if (!session) {
      throw { code: LAYER_ORDER_CALL_FAILURES.sessionNotOpen, message: 'No layer order session is open.' };
    }
    return session;
  };

  const edgesOf = (constraints: readonly LayerConstraint[]): Upper[] => [
    ...figure.forced,
    ...constraints.map((constraint) => aboveOf(constraint, figure.frontUp)),
  ];

  /** The pairs neither the creases nor the constraints decide, by reachability. */
  const openPairsOf = ({ constraints }: Session): Uint32Array => {
    const edges = edgesOf(constraints);
    const reaches = (from: LayerFace, to: LayerFace): boolean => {
      const seen = new Set([from]);
      const stack = [from];
      while (stack.length > 0) {
        const face = stack.pop()!;
        for (const [upper, lower] of edges) {
          if (upper !== face || seen.has(lower)) continue;
          if (lower === to) return true;
          seen.add(lower);
          stack.push(lower);
        }
      }
      return false;
    };
    const pairs: number[] = [];
    for (let a = 0; a < faceCount; a += 1) {
      for (let b = a + 1; b < faceCount; b += 1) if (!reaches(a, b) && !reaches(b, a)) pairs.push(a, b);
    }
    return Uint32Array.from(pairs);
  };

  const opened = (now: Session): LayerOrderOpened => ({
    status: 'ok',
    faces: faceCount,
    front_up: Uint8Array.from(figure.frontUp, (up) => (up ? 1 : 0)),
    open_pairs: openPairsOf(now),
    spots: 1,
  });

  /** A constraint that is no question throws, as the bridge's `session_bad_constraint` does. */
  const question = (list: readonly LayerConstraint[]): void => {
    const index = list.findIndex(([s, o]) => !(s < faceCount && o < faceCount && s !== o));
    if (index >= 0) throw { code: 'session_bad_constraint', message: `constraint ${index} is no question` };
  };

  /** Check `list` against the creases: the closest order, a proof, or a timeout. */
  const check = (
    now: Session,
    list: readonly LayerConstraint[],
    limits: LayerOrderLimits
  ): { order: LayerFace[] } | LayerCantFit | LayerTimedOut => {
    const asked = list.map((constraint) => aboveOf(constraint, figure.frontUp));
    for (let i = 0; i < asked.length; i += 1) {
      const [upper, lower] = asked[i]!;
      const faces = Uint32Array.of(upper, lower).sort();
      if (figure.forced.some(([u, l]) => u === lower && l === upper)) {
        return { verdict: 'cant_fit', proof: { kind: 'forced' }, faces, constraints: Uint32Array.of(i) };
      }
      const opposite = asked.findIndex(([u, l]) => u === lower && l === upper);
      if (opposite >= 0) {
        return { verdict: 'cant_fit', proof: { kind: 'opposed' }, faces, constraints: Uint32Array.of(opposite, i).sort() };
      }
    }
    const order = closestOrder(now.order, edgesOf(list));
    if (!order) {
      return {
        verdict: 'cant_fit',
        proof: { kind: 'conflict', family: 'transitivity' },
        faces: Uint32Array.from(new Set(asked.flat())).sort(),
        constraints: Uint32Array.from(list, (_, i) => i),
      };
    }
    const moved = order.some((face, i) => face !== now.order[i]);
    if (moved && limits.maxNodes === 0) return { verdict: 'timed_out', limit: 'nodes', nodes: 0 };
    return { order };
  };

  const timedOutOpen = { status: 'refused', refusal: { code: 'session_timed_out', limit: 'nodes', nodes: 0 } } as const;

  return {
    calls,
    hold(call) {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      holds.set(call, [...(holds.get(call) ?? []), held]);
      return { release };
    },
    trapNext(call) {
      traps.add(call);
    },

    async open(_source, limits) {
      await answering('open');
      if (limits.maxNodes === 0) return timedOutOpen;
      session = { constraints: [], order: [...figure.order] };
      return opened(session);
    },

    async restore(_source, record, limits) {
      await answering('restore');
      if (limits.maxNodes === 0) return timedOutOpen;
      const now: Session = { constraints: [], order: [...figure.order] };
      session = now;
      const found = record.faces.map(({ at }) => figure.facePoints.findIndex(([x, y]) => x === at[0] && y === at[1]));
      const intact: LayerConstraint[] = [];
      const saved_constraints = record.constraints.map(([f, g, sign]): LayerSavedConstraintStatus => {
        const subject = found[f] ?? -1;
        const object = found[g] ?? -1;
        if (subject < 0 || object < 0) return { status: 'gone', cause: 'face_gone' };
        if (subject === object) return { status: 'gone', cause: 'same_face' };
        intact.push([subject, object, sign]);
        return { status: 'intact' };
      });
      const restored = {
        ...opened(now),
        saved_faces: {
          status: Uint8Array.from(found, (face) => (face < 0 ? SAVED_FACE_GONE : SAVED_FACE_INTACT)),
          face: Int32Array.from(found),
          area: new Float64Array(found.length).fill(Number.NaN),
        },
        saved_constraints,
        saved_order: new Uint8Array(record.order.length).fill(SAVED_PAIR_KEPT),
      };
      const checked = check(now, intact, limits);
      if (!('order' in checked)) {
        const outcome =
          checked.verdict === 'timed_out'
            ? { kind: 'timed_out' as const, limit: checked.limit, nodes: checked.nodes }
            : { kind: 'clash' as const, constraints: [...checked.constraints] };
        return { ...restored, constraints: [], outcome };
      }
      now.constraints = intact;
      now.order = checked.order;
      return { ...restored, open_pairs: openPairsOf(now), constraints: [...intact], outcome: { kind: 'applied' } };
    },

    async openPairs() {
      await answering('openPairs');
      return openPairsOf(current());
    },

    async constraints() {
      await answering('constraints');
      return [...current().constraints];
    },

    async preview(candidate, limits) {
      await answering('preview');
      const now = current();
      const list = [...now.constraints, candidate];
      question(list);
      const checked = check(now, list, limits);
      if (!('order' in checked)) return checked;
      return {
        verdict: 'fits',
        changed: changedBetween(now.order, checked.order),
        stacks: stacksOf(checked.order),
        stage: 'seeds_first',
        nodes: 1,
      };
    },

    async commit(constraints, limits) {
      await answering('commit');
      const now = current();
      question(constraints);
      const checked = check(now, constraints, limits);
      if (!('order' in checked)) return checked;
      const changed = changedBetween(now.order, checked.order);
      now.constraints = [...constraints];
      now.order = checked.order;
      return {
        verdict: 'committed',
        changed,
        stacks: stacksOf(now.order),
        open_pairs: openPairsOf(now),
        stage: 'seeds_first',
        nodes: 1,
      };
    },

    async stacks(side) {
      await answering('stacks');
      return stacksOf(current().order)[side];
    },

    async scene(side) {
      await answering('scene');
      return fakeLayerOrderScene(figure, current().order, side);
    },

    async save() {
      await answering('save');
      const now = current();
      const named = [...new Set([...now.constraints.flatMap(([s, o]) => [s, o]), ...now.order])].sort((a, b) => a - b);
      const indexOf = (face: LayerFace) => named.indexOf(face);
      const pair = (upper: LayerFace, lower: LayerFace): LayerOrderPair => [
        indexOf(upper),
        indexOf(lower),
        figure.frontUp[lower] ? 1 : -1,
      ];
      const free: LayerOrderPair[] = [];
      now.order.forEach((upper, i) => {
        for (const lower of now.order.slice(i + 1)) {
          if (!figure.forced.some(([u, l]) => u === upper && l === lower)) free.push(pair(upper, lower));
        }
      });
      const record: LayerOrderRecord = {
        faces: named.map((face) => ({ at: figure.facePoints[face]!, area: 100 })),
        constraints: now.constraints.map(([s, o, sign]) => [indexOf(s), indexOf(o), sign]),
        order: free,
      };
      const encoded = encodeLayerOrderRecord(record);
      if (!encoded.ok) throw { code: 'session_internal', message: 'the fake record would not encode' };
      return { status: 'ok', record, json: encoded.json };
    },

    async relations() {
      await answering('relations');
      const { order } = current();
      const pairs: [LayerFace, LayerFace][] = [];
      order.forEach((upper, i) => {
        for (const lower of order.slice(i + 1)) pairs.push([upper, lower]);
      });
      pairs.sort((x, y) => Math.min(...x) - Math.min(...y) || Math.max(...x) - Math.max(...y));
      return Uint32Array.from(pairs.flat());
    },

    async close() {
      await answering('close');
      session = null;
    },

    // One of E6's calls, by brute force, so a count's flow can be tested
    // before E6 lands: every order of the one stack that fits, in one slice.
    async countSolutions() {
      await answering('countSolutions');
      const now = current();
      const edges = edgesOf(now.constraints);
      const fits = permutations(figure.order).filter((order) =>
        edges.every(([upper, lower]) => order.indexOf(upper) < order.indexOf(lower))
      );
      const tops = [...new Set(fits.map((order) => order[0]!))].sort((a, b) => a - b);
      const bottoms = [...new Set(fits.map((order) => order.at(-1)!))].sort((a, b) => a - b);
      const index = fits.findIndex((order) => order.every((face, i) => face === now.order[i]));
      return {
        status: 'counted',
        count: {
          pictures: { front: { n: tops.length, exact: true }, back: { n: bottoms.length, exact: true } },
          orders: { n: fits.length, exact: true },
          current: {
            pictures: { front: tops.indexOf(now.order[0]!), back: bottoms.indexOf(now.order.at(-1)!) },
            order: index < 0 ? null : index,
          },
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The worker

/**
 * One end of a message channel that delivers a task later, as a worker's
 * does, and a structured clone, as a worker's does: what can't cross a real
 * worker can't cross this one. (Under jsdom the clone's typed arrays are of
 * another realm than the test's, so a test checks their tag, not `instanceof`.)
 */
class FakePort extends EventTarget {
  other: FakePort | null = null;
  closed = false;

  postMessage(message: unknown): void {
    if (this.closed) return;
    const data: unknown = structuredClone(message);
    const to = this.other;
    setTimeout(() => {
      if (this.closed || !to || to.closed) return;
      to.dispatchEvent(new MessageEvent('message', { data }));
    }, 0);
  }
}

/**
 * A worker running the real worker shell over `backend`, through comlink:
 * what the runtime spawns in a test. `terminate()` cuts both ends, so a call
 * in flight is orphaned exactly as a real one is.
 */
export class FakeLayerOrderWorker extends FakePort {
  terminated = false;
  private readonly inside = new FakePort();

  constructor(readonly backend: FakeLayerOrderBackend) {
    super();
    this.other = this.inside;
    this.inside.other = this;
    expose(createLayerOrderWorkerApi(() => backend), this.inside as unknown as Endpoint);
  }

  terminate(): void {
    this.terminated = true;
    this.closed = true;
    this.inside.closed = true;
  }

  /** Die as a worker does: its `error` event. */
  crash(message = 'The worker stopped unexpectedly.'): void {
    this.dispatchEvent(new ErrorEvent('error', { message }));
  }
}

/** A spawner for `createLayerOrderRuntime`, keeping every worker it made and the backend of each. */
export function fakeLayerOrderWorkers(makeBackend: () => FakeLayerOrderBackend = () => createFakeLayerOrderBackend()) {
  const workers: FakeLayerOrderWorker[] = [];
  return {
    workers,
    spawn: (): Worker => {
      const worker = new FakeLayerOrderWorker(makeBackend());
      workers.push(worker);
      return worker as unknown as Worker;
    },
  };
}
