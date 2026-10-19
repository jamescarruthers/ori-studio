import type {
  FoldChoices,
  FoldModelLine,
  FoldOp,
  FoldRepeatEntry,
  FoldRepeatOp,
  SheetPoint,
} from '../document/foldSequenceDocument';
import type { FoldEngineCalls } from '../engine/foldEngineCalls';
import type { FoldEngineCompoundCalls } from '../engine/foldEngineCompoundCalls';
import { reflection, RepeatFailure, verifiedSymmetry } from './repeatGeometry';
import { mirrorOperation } from './repeatOperation';
import { movingWitnesses, verifyMaterial } from './repeatVerification';

export interface RepeatSourceStep {
  id: string;
  before: number;
  after: number;
  op: FoldOp;
  choices?: FoldChoices;
}
export interface RepeatRequest {
  parent: number;
  source: FoldRepeatOp['source'];
  steps: readonly RepeatSourceStep[];
  axis: FoldModelLine;
  /** Document node immediately before the source range; null is the sheet. */
  baseline?: string | null;
  /** Fingerprints explicitly accepted at a previous ambiguity in this preparation. */
  selections?: Readonly<Record<number, string>>;
}
export type RepeatPrepared =
  | { status: 'ready'; op: FoldRepeatOp }
  | { status: 'choice'; step: number; prefix: FoldRepeatOp; candidates: FoldRepeatEntry[] }
  | { status: 'blocked'; step: number; code: string; prefix?: FoldRepeatOp };

/** Transactional preparation. The caller owns source states; this owns and releases all trial states. */
export function prepareRepeat(
  engine: FoldEngineCalls & FoldEngineCompoundCalls,
  request: RepeatRequest,
): RepeatPrepared {
  const owned: number[] = [];
  let index = 0;
  let recipe: FoldRepeatOp | undefined;
  const entries: FoldRepeatEntry[] = [];
  try {
    if (!request.steps.length || request.steps.length > 128) throw new RepeatFailure('repeat_limit');
    if (!verifiedSymmetry(engine.scene(request.steps[0]!.before), request.axis))
      throw new RepeatFailure('repeat_axis');
    const map = reflection(request.axis);
    recipe = {
      kind: 'repeat',
      axis: request.axis,
      source: request.source,
      parentState: engine.fingerprint(request.parent),
      steps: [],
    };
    const preparedStates: number[] = [];
    let current = request.parent;
    for (index = 0; index < request.steps.length; index++) {
      const item = request.steps[index]!;
      const before = engine.scene(item.before),
        after = engine.scene(item.after),
        target = engine.scene(current);
      if (item.op.kind === 'unfold-to') {
        const returnTarget = item.op.target;
        const targetIndex =
          item.op.target === request.baseline
            ? 0
            : request.steps.slice(0, index).findIndex((step) => step.id === returnTarget) + 1;
        if (targetIndex === 0 && item.op.target !== request.baseline)
          throw new RepeatFailure('repeat_return_target');
        const history = [request.parent, ...preparedStates];
        const targetState = history[targetIndex]!;
        const returned = engine.returnTo(current, targetState, history);
        if (returned.status !== 'ok') throw new RepeatFailure(returned.refusal.code);
        owned.push(returned.state);
        verifyMaterial(before, after, target, engine.scene(returned.state), map);
        entries.push({
          op: {
            ...item.op,
            source: {
              path: request.source.revision,
              state: engine.fingerprint(current),
              targetState: engine.fingerprint(targetState),
            },
          },
          returnTo: targetIndex,
          expect: returned.fingerprint,
          sourceStep: item.id,
        });
        current = returned.state;
        preparedStates.push(current);
        continue;
      }
      let material: SheetPoint[] = movingWitnesses(before, after);
      if (
        item.op.kind === 'valley' ||
        item.op.kind === 'mountain' ||
        item.op.kind === 'precrease' ||
        item.op.kind === 'unfold' ||
        item.op.kind === 'refold'
      ) {
        const analysis = engine.analyse(item.before, item.op, item.choices);
        if (analysis.status !== 'ok') throw new RepeatFailure(analysis.refusal.code);
        material = [...new Set([...analysis.analysis.picked, ...analysis.analysis.added])].map(
          (f) => analysis.analysis.flaps[f]!.witness,
        );
      }
      const mapped = mirrorOperation(item.op, item.choices, before, target, map, material);
      const candidates: { entry: FoldRepeatEntry; state: number }[] = [];
      let reason = 'repeat_order';
      let unresolved = false;
      const tryCandidate = (op: FoldOp, choices?: FoldChoices) => {
        const result = engine.step(current, op, choices);
        if (result.status !== 'ok') {
          reason = result.refusal.code;
          // Native replay refuses unresolved choices; it never chooses an order.
          unresolved =
            (result.refusal.code === 'choice_needed' && result.refusal.choice === 'completion') ||
            (result.refusal.code === 'choice_broken' && result.refusal.broken === 'not_unique');
          return;
        }
        owned.push(result.state);
        try {
          verifyMaterial(before, after, target, engine.scene(result.state), map);
        } catch (error) {
          if (error instanceof RepeatFailure) {
            reason = error.code;
            engine.release([result.state]);
            owned.pop();
            return;
          }
          throw error;
        }
        if (!candidates.some((c) => c.entry.expect === result.fingerprint))
          candidates.push({
            state: result.state,
            entry: { op, ...(choices ? { choices } : {}), expect: result.fingerprint, sourceStep: item.id },
          });
        else {
          engine.release([result.state]);
          owned.pop();
        }
      };
      // The landing/opening already chosen in the source is part of the
      // operation. A successful native replay has a unique result under those
      // choices. Do not enumerate alternate tuck positions or moving sets.
      tryCandidate(mapped.op, mapped.choices);
      if (!candidates.length && unresolved) {
        // Inserted M/V is resolved by the bridge through this same public tuck
        // operation. Query its remaining orders with the saved targets fixed;
        // the general M/V authoring query intentionally searches all landings.
        const queryOp: FoldOp =
          (mapped.op.kind === 'valley' || mapped.op.kind === 'mountain') &&
          mapped.op.landing?.kind === 'against'
            ? {
                kind: 'tuck',
                direction: mapped.op.kind,
                line: mapped.op.line,
                seed: mapped.op.seed,
                moving: mapped.op.moving,
                target: mapped.op.landing.targets[0]!,
                additionalTargets: mapped.op.landing.targets.slice(1),
              }
            : mapped.op;
        let first = engine.orderSelection(current, queryOp, mapped.choices, { index: 0, batch: 0 });
        for (let batch = 1; first.status === 'ok' && !first.count.exact && batch <= 8; batch++) {
          first = engine.orderSelection(current, queryOp, mapped.choices, { index: 0, batch });
        }
        if (first.status !== 'ok') throw new RepeatFailure(first.refusal.code);
        if (!first.count.exact || first.count.orders > 64) throw new RepeatFailure('repeat_order_limit');
        for (let n = 0; n < first.count.orders; n++) {
          const order =
            n === 0 ? first : engine.orderSelection(current, queryOp, mapped.choices, { index: n, batch: 8 });
          if (order.status !== 'ok') throw new RepeatFailure(order.refusal.code);
          const choices: FoldChoices = {
            ...mapped.choices,
            ...(order.completion ? { completion: order.completion } : {}),
          };
          tryCandidate(mapped.op.kind === 'pleat' && order.pleat ? { ...mapped.op, resolved: order.pleat } : mapped.op, Object.keys(choices).length ? choices : undefined);
        }
      }
      engine.releaseOrderSearch?.(current);
      if (!candidates.length) throw new RepeatFailure(reason);
      const selected = candidates.find((c) => c.entry.expect === request.selections?.[index]);
      if (candidates.length > 1 && !selected)
        return {
          status: 'choice',
          step: index,
          prefix: { ...recipe, steps: entries },
          candidates: candidates.map((c) => c.entry),
        };
      const chosen = selected ?? candidates[0]!;
      for (const candidate of candidates)
        if (candidate !== chosen) {
          engine.release([candidate.state]);
          owned.splice(owned.indexOf(candidate.state), 1);
        }
      entries.push(chosen.entry);
      current = chosen.state;
      preparedStates.push(current);
    }
    return { status: 'ready', op: { ...recipe, steps: entries } };
  } catch (error) {
    if (error instanceof RepeatFailure)
      return {
        status: 'blocked',
        step: index,
        code: error.code,
        ...(recipe && entries.length ? { prefix: { ...recipe, steps: entries } } : {}),
      };
    throw error;
  } finally {
    engine.releaseOrderSearch?.(request.parent);
    engine.release(owned);
  }
}
