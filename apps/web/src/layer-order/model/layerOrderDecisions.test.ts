/**
 * One test per decision the inspector rests on
 * (`implementation-plans/layer-order-dialog.md`, "Decisions"), each built to
 * its recommendation and named after it. D5 is decided; the rest wait on the
 * owner. Changing a decision changes its export in `layerOrderDecisions.ts`
 * and its test here, and no other test.
 */
import { describe, expect, it } from 'vitest';
import {
  LAYER_ORDER_COUNT_FACE_LIMIT,
  LAYER_ORDER_LABEL_CAP,
  applyChangedNothing,
  stepByFor,
} from './layerOrderDecisions';
import { LAYER_ORDER_MODEL_LIMITS, keepTrying } from './layerOrderEngineFacts';
import {
  SPOTS,
  SPOTS_TWO_OVER_ZERO,
  carried,
  changedSpots,
  commits,
  count,
  dispatch,
  effectsOf,
  lastOf,
  openFactsOf,
  opened,
  picked,
  play,
  position,
  sidesOf,
  stacksOf,
} from './layerOrderModel.fixtures';
import { addState, applyState, hintLine, openNotice, rowsView, statusView } from './layerOrderSelectors';

describe('decisions', () => {
  it('D5: X-ray steps through every layer order, and the status counts what it steps through', () => {
    expect(stepByFor('front', false)).toEqual({ picture: 'front' });
    expect(stepByFor('back', false)).toEqual({ picture: 'back' });
    expect(stepByFor('back', true)).toBe('layer_order');

    const { state } = opened();
    const xray = dispatch(state, { type: 'xray_set', on: true });
    expect(xray.effects).toEqual([{ type: 'solutions_position', generation: 1, by: 'layer_order' }]);
    const counted = dispatch(xray.state, {
      type: 'solutions_counted',
      generation: 1,
      by: 'layer_order',
      count: count(9, 9, 12),
      position: position(4, 12),
    });
    expect(statusView(counted.state)).toMatchObject({
      text: { key: 'layer_orders', count: { n: 12, exact: true } },
      tooltip: null,
      stepper: { index: 4, total: { n: 12, exact: true } },
    });
    expect(lastOf(dispatch(counted.state, { type: 'step', direction: 'next' }).effects, 'step').by).toBe('layer_order');
  });

  it('D7: past the label cap the hint counts tinted faces; above the face limit the count is skipped and the stepper has no total', () => {
    // Face 0 overlaps 13 faces, every pair open.
    const faces = LAYER_ORDER_LABEL_CAP + 2;
    const others = Array.from({ length: faces - 1 }, (_, i) => i + 1);
    const wide = openFactsOf({
      faces,
      frontUp: new Uint8Array(faces).fill(1),
      openPairs: Uint32Array.from(others.flatMap((face) => [0, face])),
      stacks: { front: stacksOf([[0, ...others]]), back: stacksOf([[...others].reverse().concat(0)]) },
    });
    const subject = dispatch(opened(wide).state, { type: 'face_picked', face: 0, origin: 'pattern' });
    expect(hintLine(subject.state)?.text).toEqual({ key: 'pick_object', objects: faces - 1, tinted: true });
    const narrow = dispatch(opened().state, { type: 'face_picked', face: 2, origin: 'pattern' });
    expect(hintLine(narrow.state)?.text).toEqual({ key: 'pick_object', objects: 2, tinted: false });

    const huge = openFactsOf({ faces: LAYER_ORDER_COUNT_FACE_LIMIT + 1, frontUp: new Uint8Array(LAYER_ORDER_COUNT_FACE_LIMIT + 1) });
    const skipped = opened(huge);
    expect(lastOf(skipped.effects, 'solutions_restart').count).toBe(false);
    expect(lastOf(skipped.effects, 'track').fact).toMatchObject({ properties: { solutions_bucket: 'skipped' } });
    const placed = dispatch(skipped.state, {
      type: 'solutions_counted',
      generation: 1,
      by: { picture: 'front' },
      count: null,
      position: position(3, 3, false),
    });
    expect(placed.effects).toEqual([]);
    expect(statusView(placed.state)).toMatchObject({
      text: { key: 'solution_n', index: 3 },
      stepper: { index: 3, total: null, previous: true, next: true },
    });
  });

  it('D8: Add after a preview runs out of time is disabled, with Keep trying in the hint line', () => {
    const p = picked(opened().state, 2, 0);
    const out = play(p.state, {
      type: 'previewed',
      request: lastOf(p.effects, 'preview').request,
      facts: { verdict: 'timed_out' },
    });
    expect(addState(out.state)).toMatchObject({ enabled: false, why: 'timed_out' });
    expect(effectsOf(dispatch(out.state, { type: 'add' }).effects, 'commit')).toEqual([]);
    expect(hintLine(out.state)).toMatchObject({ tone: 'quiet', action: 'keep_trying', text: { key: 'timed_out' } });
    expect(lastOf(dispatch(out.state, { type: 'keep_trying' }).effects, 'preview').limits).toEqual(
      keepTrying(LAYER_ORDER_MODEL_LIMITS.preview)
    );
  });

  it('D10: Apply waits while saved rows clash or are unsettled, and the rows that can apply land together or not at all', () => {
    const clash = openFactsOf({
      restore: {
        outcome: { kind: 'clash', constraints: [0, 1] },
        carried: [
          carried({ index: 0, status: { status: 'clashing' }, subject: 2, object: 0, constraint: [2, 0, 1] }),
          carried({ index: 1, status: { status: 'clashing' }, subject: 0, object: 2, constraint: [0, 2, 1] }),
          carried({ index: 2, subject: 4, object: 5, sign: -1, constraint: [4, 5, -1] }),
        ],
      },
    });
    const { state } = opened(clash, { hasRecord: true });
    expect(applyState(state)).toEqual({ enabled: false, why: 'clash' });
    expect(dispatch(state, { type: 'apply', at: 2_000 }).effects).toEqual([]);

    const first = state.rows.carried[0]!.id;
    const removed = play(state, { type: 'row_removed', id: first });
    // Never one by one: every row left that can apply, in one commit.
    expect(effectsOf(removed.effects, 'commit').map((effect) => effect.constraints)).toEqual([[[0, 2, 1], [4, 5, -1]]]);
    expect(applyState(removed.state)).toEqual({ enabled: false, why: 'unsettled' });
    expect(applyState(commits(removed).state)).toEqual({ enabled: true });

    const out = openFactsOf({
      restore: { outcome: { kind: 'timed_out', limit: 'nodes', nodes: 9 }, carried: [carried({ index: 0 })] },
    });
    expect(applyState(opened(out, { hasRecord: true }).state)).toEqual({ enabled: false, why: 'unsettled' });
  });

  it('D14: the dialog opens on the flagged rows only when opened from Review…', () => {
    const flagged = openFactsOf({
      constraints: [[2, 0, 1]],
      restore: {
        outcome: { kind: 'applied' },
        carried: [carried({ index: 1, status: { status: 'ambiguous' }, subjectState: 'ambiguous', constraint: null })],
      },
    });
    const review = opened(flagged, { hasRecord: true, review: true }).state;
    expect(review.reviewRows).toEqual([review.rows.carried[0]!.id]);
    expect(rowsView(review).map((row) => row.flagged)).toEqual([false, true]);

    const plain = opened(flagged, { hasRecord: true, review: false }).state;
    expect(plain.reviewRows).toBeNull();
    expect(rowsView(plain).some((row) => row.flagged)).toBe(false);
  });

  it('D16: an Apply that changed nothing writes nothing; a browsed solution with no constraints writes a record', () => {
    const fresh = opened().state;
    expect(lastOf(dispatch(fresh, { type: 'apply', at: 2_000 }).effects, 'apply').result).toEqual({ kind: 'no_change' });

    // Add, then undo back to the order opened on: nothing changed.
    const added = play(
      play(picked(fresh, 2, 0).state, {
        type: 'previewed',
        request: 2,
        facts: { verdict: 'fits', token: 1, changed: changedSpots([1]), stacks: sidesOf(SPOTS_TWO_OVER_ZERO) },
      }).state,
      { type: 'add' }
    );
    const landed = commits(added, Uint32Array.of(2, 3, 4, 5), SPOTS_TWO_OVER_ZERO);
    const undone = commits(play(landed.state, { type: 'undo' }), undefined, SPOTS);
    expect(lastOf(dispatch(undone.state, { type: 'apply', at: 2_000 }).effects, 'apply').result).toEqual({
      kind: 'no_change',
    });

    // Step to another solution, with no constraint: that is a change.
    const stepping = play(fresh, { type: 'step', direction: 'next' });
    const stepped = play(stepping.state, {
      type: 'stepped',
      request: lastOf(stepping.effects, 'step').request,
      facts: { verdict: 'moved', changed: changedSpots([1]), position: position(2, 9), stacks: sidesOf(SPOTS_TWO_OVER_ZERO) },
    });
    expect(lastOf(dispatch(stepped.state, { type: 'apply', at: 2_000 }).effects, 'apply').result).toEqual({
      kind: 'changed',
      constraints: [],
      keepCarried: [],
    });

    expect(
      applyChangedNothing(
        { constraints: [], carried: [], stacks: sidesOf(SPOTS), matchesHost: false },
        { constraints: [], carried: [], stacks: sidesOf(SPOTS) }
      )
    ).toBe(false);
  });

  it('D19: when Edit’s order can’t fold, the dialog opens on the closest one that does, says so, and Apply writes it', () => {
    const closest = opened(openFactsOf({ openedOn: { kind: 'closest', moved: 4, ignored: 0 } })).state;
    expect(openNotice(closest)).toEqual({ key: 'host_order_cant_fold', moved: 4 });
    expect(lastOf(dispatch(closest, { type: 'apply', at: 2_000 }).effects, 'apply').result.kind).toBe('changed');

    expect(openNotice(opened().state)).toBeNull();
    const ranOut = opened(openFactsOf({ openedOn: { kind: 'first', timed_out: { limit: 'deadline', nodes: 5 } } })).state;
    expect(openNotice(ranOut)).toEqual({ key: 'host_order_timed_out' });
    // A record's order is not the host's picture to warn about.
    const restored = opened(
      openFactsOf({ openedOn: { kind: 'closest', moved: 4, ignored: 0 }, restore: { outcome: { kind: 'applied' }, carried: [] } }),
      { hasRecord: true }
    ).state;
    expect(openNotice(restored)).toBeNull();
  });
});
