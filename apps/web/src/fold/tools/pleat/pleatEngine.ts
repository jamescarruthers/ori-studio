/** A pleat composes ordinary native folds. No placement or connectivity rules are duplicated here. */
import type {
  FoldChoices,
  FoldModelLine,
  FoldPleatOp,
  FoldPleatPlacement,
  SheetPoint,
} from '../../document/foldSequenceDocument';
import type { FoldWasmEngine } from '../../engine/foldEngineCalls';
import type {
  FoldOrderQuery,
  FoldOrderSelection,
  FoldWasmCompoundEngine,
} from '../../engine/foldEngineCompoundCalls';
import type {
  FoldActed,
  FoldAxiomCandidates,
  FoldAnalysed,
  FoldEngineOp,
  FoldEngineOutcome,
  FoldEngineRefused,
  FoldScene,
  FoldStepLanded,
} from '../../engine/foldEngineWire';
import {
  applyIsometry,
  clipConvex,
  invertIsometry,
  lineThrough,
  polygonArea,
  polygonCentroid,
  toPair,
  toPoint,
  transformLine,
} from '../../canvas/foldCanvasGeometry';
import {
  faceAt,
  modelMap,
  reflection,
  RepeatFailure,
} from '../../repeat/repeatGeometry';

import { pleatArrow, pleatValleySpans } from './pleatActionGeometry';

type Raw = FoldWasmEngine & FoldWasmCompoundEngine;
export type PleatInput = Extract<FoldEngineOp, { kind: 'pleat' }>;
const fail = (reason: string): FoldEngineRefused => ({
  status: 'refused',
  refusal: { code: 'pleat_failed', reason },
  fixes: [],
  faces: [],
  vertices: [],
});
class Refused extends Error {
  constructor(readonly result: FoldEngineRefused) {
    super(result.refusal.code);
  }
}
const take = <T>(value: FoldEngineOutcome<T>): T => {
  if (value.status !== 'ok') throw new Refused(value);
  return value;
};
export function pleatFirst(op: PleatInput): FoldEngineOp {
  return {
    kind: 'mountain',
    line: op.line,
    seed: op.seed,
    ...(op.moving ? { moving: op.moving } : {}),
    ...(op.side ? { side: op.side } : {}),
    ...(op.resolved ? { landing: op.resolved[0].landing } : {}),
  };
}
export function pleatFirstChoices(
  choices?: FoldChoices,
  op?: PleatInput,
): FoldChoices | undefined {
  return choices?.root || op?.resolved?.[0].completion
    ? {
        ...(choices?.root ? { root: choices.root } : {}),
        ...(op?.resolved?.[0].completion
          ? { completion: op.resolved[0].completion }
          : {}),
      }
    : undefined;
}
function pointInModel(scene: FoldScene, at: SheetPoint) {
  return applyIsometry(modelMap(scene, faceAt(scene, at)), toPoint(at));
}
function secondLine(
  raw: Raw,
  parent: number,
  scene: FoldScene,
  root: FoldModelLine | undefined,
  second: FoldPleatOp['second'],
): FoldModelLine {
  if (second.via === 'axiom') {
    const result = take(raw.axiom_candidates(parent, second) as FoldEngineOutcome<FoldAxiomCandidates>);
    if (!root) throw new Refused(fail('reference'));
    const match = result.candidates.find(({ line }) => {
      const sign = line.n[0] * root.n[0] + line.n[1] * root.n[1] < 0 ? -1 : 1;
      return Math.hypot(line.n[0] - sign * root.n[0], line.n[1] - sign * root.n[1]) < 1e-6
        && Math.abs(line.d - sign * root.d) < 1e-6;
    });
    if (!match) throw new Refused(fail('reference'));
    return match.line;
  }
  let ends: readonly [SheetPoint, SheetPoint];
  if (second.via === 'free') ends = second.through;
  else {
    const p = toPoint(second.at);
    const c = scene.creases.find((c) => {
      const dx = c.to.x - c.from.x,
        dy = c.to.y - c.from.y,
        length = Math.hypot(dx, dy);
      const u =
        ((p.x - c.from.x) * dx + (p.y - c.from.y) * dy) / (length * length);
      return (
        c.letter !== null &&
        u >= -1e-7 &&
        u <= 1 + 1e-7 &&
        Math.abs(dx * (p.y - c.from.y) - dy * (p.x - c.from.x)) < length * 1e-7
      );
    });
    if (!c) throw new Refused(fail('reference'));
    ends = [toPair(c.from), toPair(c.to)];
  }
  const line = lineThrough(
    pointInModel(scene, ends[0]),
    pointInModel(scene, ends[1]),
  );
  if (!line) throw new Refused(fail('lines'));
  return line;
}
function geometry(
  raw: Raw,
  parent: number,
  op: PleatInput,
  choices?: FoldChoices,
) {
  const first = pleatFirst(op),
    rooted = pleatFirstChoices(choices, op);
  const analysis = take(
    raw.analyse(parent, first, rooted) as FoldEngineOutcome<FoldAnalysed>,
  ).analysis;
  const source = raw.scene(parent) as FoldScene;
  const second = secondLine(raw, parent, source, op.secondRoot, op.second),
    a = analysis.line;
  const parallel = Math.abs(a.n[0] * second.n[1] - a.n[1] * second.n[0]) < 1e-8;
  const sign = a.n[0] * second.n[0] + a.n[1] * second.n[1] < 0 ? -1 : 1;
  const aligned = {
    n: [second.n[0] * sign, second.n[1] * sign] as const,
    d: second.d * sign,
  };
  const side = analysis.side === 'positive' ? 1 : -1;
  if (parallel && (aligned.d - a.d) * side <= 1e-6)
    throw new Refused(fail('lines'));
  return {
    first,
    rooted,
    analysis,
    source,
    second: aligned,
    side: side as 1 | -1,
  };
}
function returnFold(
  raw: Raw,
  parent: number,
  op: PleatInput,
  choices: FoldChoices | undefined,
  first: FoldStepLanded,
) {
  const g = geometry(raw, parent, op, choices),
    scene = raw.scene(first.state) as FoldScene;
  const line = transformLine(reflection(g.analysis.line), g.second);
  const witnesses: SheetPoint[] = [],
    allowed = new Set<number>();
  for (let i = 0; i < scene.faces.length; i++) {
    const sheet = scene.faces[i]!.points.map((p) => scene.sheet_points[p]!);
    const at = toPair(polygonCentroid(sheet)),
      owner = faceAt(g.source, at),
      original = pointInModel(g.source, at);
    if (
      !g.analysis.moving.includes(g.source.lineage[owner]!.id) ||
      (g.analysis.line.n[0] * original.x +
        g.analysis.line.n[1] * original.y -
        g.analysis.line.d) *
        g.side <=
        1e-8
    )
      continue;
    allowed.add(scene.lineage[i]!.id);
    const transform = modelMap(scene, i);
    const tip = clipConvex(
      sheet.map((p) => applyIsometry(transform, p)),
      line,
      g.side,
    );
    if (tip.length >= 3 && Math.abs(polygonArea(tip)) > 1e-10)
      witnesses.push(
        toPair(applyIsometry(invertIsometry(transform), polygonCentroid(tip))),
      );
  }
  if (!witnesses.length) throw new Refused(fail('tip'));
  // The first fold turned the flap over. A mountain as seen now makes the
  // VALLEY line specified on the original pose, and keeps the strip stationary.
  const second: FoldEngineOp = {
    kind: 'mountain',
    line: { via: 'model', line },
    side: g.side === 1 ? 'positive' : 'negative',
    seed: { scope: 'flaps', at: witnesses },
  };
  return { second, allowed };
}
function choiceFor(
  rooted: FoldChoices | undefined,
  p: FoldPleatPlacement,
): FoldChoices | undefined {
  return rooted || p.completion
    ? { ...rooted, ...(p.completion ? { completion: p.completion } : {}) }
    : undefined;
}
function placed(op: FoldEngineOp, p: FoldPleatPlacement): FoldEngineOp {
  if (op.kind !== 'mountain' && op.kind !== 'valley')
    throw new Error('A pleat leg must be a plain fold');
  return { ...op, landing: p.landing };
}
function placements(
  raw: Raw,
  state: number,
  op: FoldEngineOp,
  choices: FoldChoices | undefined,
  query: FoldOrderQuery,
): FoldPleatPlacement[] {
  let result = take(
    raw.order_selection(state, op, choices, {
      ...query,
      index: 0,
      batch: 0,
    }) as FoldEngineOutcome<FoldOrderSelection>,
  );
  for (let batch = 1; !result.count.exact && batch <= 8; batch++)
    result = take(
      raw.order_selection(state, op, choices, {
        ...query,
        index: 0,
        batch,
      }) as FoldEngineOutcome<FoldOrderSelection>,
    );
  if (!result.count.exact || result.count.orders > 64)
    throw new Refused(fail('limit'));
  const entries: FoldPleatPlacement[] = [];
  for (let i = 0; i < result.count.orders; i++) {
    const item =
      i === 0
        ? result
        : take(
            raw.order_selection(state, op, choices, {
              ...query,
              index: i,
              batch: 8,
            }) as FoldEngineOutcome<FoldOrderSelection>,
          );
    entries.push({
      landing: item.landing ?? { kind: 'outer' },
      ...(item.completion ? { completion: item.completion } : {}),
    });
  }
  raw.release_order_search?.(state);
  return entries;
}
function verifySecond(
  raw: Raw,
  state: number,
  op: FoldEngineOp,
  choices: FoldChoices | undefined,
  allowed: Set<number>,
) {
  const a = take(
    raw.analyse(state, op, choices) as FoldEngineOutcome<FoldAnalysed>,
  ).analysis;
  if (a.moving.some((face) => !allowed.has(face)))
    throw new Refused(fail('material'));
}
export function pleatOrders(
  raw: Raw,
  parent: number,
  op: PleatInput,
  choices: FoldChoices | undefined,
  query: FoldOrderQuery,
): FoldEngineOutcome<FoldOrderSelection> {
  const owned: number[] = [];
  try {
    const input = { ...op, resolved: undefined },
      g = geometry(raw, parent, input, choices);
    const results: {
      resolved: NonNullable<FoldPleatOp['resolved']>;
      key: string;
    }[] = [];
    let refusal = fail('placement'),
      attempts = 0;
    for (const p of placements(raw, parent, g.first, g.rooted, query)) {
      const one = take(
        raw.apply(
          parent,
          placed(g.first, p),
          choiceFor(g.rooted, p),
        ) as FoldEngineOutcome<FoldStepLanded>,
      );
      owned.push(one.state);
      try {
        const firstOp = { ...input, resolved: [p, p] as const };
        const { second, allowed } = returnFold(
          raw,
          parent,
          firstOp,
          choices,
          one,
        );
        for (const q of placements(raw, one.state, second, undefined, query)) {
          if (++attempts > 256) throw new Refused(fail('limit'));
          try {
            const twoOp = placed(second, q),
              twoChoices = choiceFor(undefined, q);
            verifySecond(raw, one.state, twoOp, twoChoices, allowed);
            const two = take(
              raw.apply(
                one.state,
                twoOp,
                twoChoices,
              ) as FoldEngineOutcome<FoldStepLanded>,
            );
            owned.push(two.state);
            const key = [...raw.canonical_keys(two.state)].sort().join('\n');
            if (!results.some((r) => r.key === key))
              results.push({ resolved: [p, q], key });
          } catch (error) {
            if (!(error instanceof Refused)) throw error;
            // These face/flap indices belong to the intermediate state. They
            // cannot name a selection or a remedy on the original paper.
            refusal = fail('return');
          }
        }
      } catch (error) {
        if (!(error instanceof Refused)) throw error;
        if (
          'reason' in error.result.refusal &&
          error.result.refusal.reason === 'limit'
        )
          throw error;
        refusal = fail('return');
      }
    }
    if (!results.length) return refusal;
    const index = query.index % results.length;
    return {
      status: 'ok',
      index,
      count: { orders: results.length, exact: true },
      completion: null,
      pleat: results[index]!.resolved,
    };
  } catch (error) {
    if (error instanceof Refused) return error.result;
    if (error instanceof RepeatFailure) return fail('reference');
    throw error;
  } finally {
    raw.release_order_search?.(parent);
    raw.release(Uint32Array.from(owned));
  }
}

export function applyPleat(
  raw: Raw,
  parent: number,
  input: PleatInput,
  choices: FoldChoices | undefined,
  hold: (state: number, children: number[]) => void,
): FoldEngineOutcome<FoldStepLanded> {
  const owned: number[] = [];
  try {
    let op = input;
    if (!op.resolved) {
      const result = take(pleatOrders(raw, parent, op, choices, { index: 0 }));
      if (result.count.orders !== 1)
        return {
          status: 'refused',
          refusal: { code: 'choice_needed', choice: 'completion' },
          fixes: [],
          faces: [],
          vertices: [],
        };
      op = { ...op, resolved: result.pleat };
    }
    const [p, q] = op.resolved!,
      g = geometry(raw, parent, op, choices);
    const first = take(
      raw.apply(
        parent,
        placed(g.first, p),
        choiceFor(g.rooted, p),
      ) as FoldEngineOutcome<FoldStepLanded>,
    );
    owned.push(first.state);
    const { second, allowed } = returnFold(raw, parent, op, choices, first),
      two = placed(second, q),
      chosen = choiceFor(undefined, q);
    verifySecond(raw, first.state, two, chosen, allowed);
    const last = take(
      raw.apply(first.state, two, chosen) as FoldEngineOutcome<FoldStepLanded>,
    );
    owned.push(last.state);
    hold(last.state, [first.state]);
    owned.length = 0;
    // The final leg's tuck/compound report describes only half of the pleat.
    return { status: 'ok', state: last.state, summary: last.summary, report: null };
  } catch (error) {
    if (error instanceof Refused) return owned.length ? fail('return') : error.result;
    if (error instanceof RepeatFailure) return fail('reference');
    throw error;
  } finally {
    raw.release(Uint32Array.from(owned));
  }
}
export function pleatAction(
  raw: Raw,
  parent: number,
  op: PleatInput,
  choices?: FoldChoices,
): FoldEngineOutcome<FoldActed> {
  try {
    const g = geometry(raw, parent, op, choices),
      original = take(
        raw.action(parent, g.first, g.rooted) as FoldEngineOutcome<FoldActed>,
      );
    const valley = pleatValleySpans(g.source, g.analysis.moving, g.analysis.line, g.second, g.side);
    const arrow = pleatArrow(
      transformLine(g.source.view_transform, g.analysis.line),
      transformLine(g.source.view_transform, g.second),
      valley,
    );
    return {
      status: 'ok',
      action: {
        ...original.action,
        grip: null,
        spans: [...original.action.spans, ...valley],
        ...(arrow ? { pleat: arrow } : {}),
      },
    };
  } catch (error) {
    if (error instanceof Refused) return error.result;
    if (error instanceof RepeatFailure) return fail('reference');
    throw error;
  }
}
