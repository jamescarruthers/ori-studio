/**
 * Compound constraints (`implementation-plans/layer-order-dialog.md`, D21):
 * one subject, one or more objects, previewed, explained and added as one
 * sentence, stored one constraint per object, and shown one row per subject
 * and verb. The builder's own rules are in `layerOrderSentence.test.ts`; here
 * they meet the engine's answers, the history and the list.
 */
import { describe, expect, it } from 'vitest';
import { constraintAddedFact, constraintBlockedFact } from './layerOrderAnalytics';
import { LAYER_ORDER_LABEL_CAP } from '../layerOrderBudgets';
import { LAYER_ORDER_MODEL_LIMITS, keepTrying, type LayerOpenFacts } from './layerOrderEngineFacts';
import {
  OPEN_PAIRS,
  SPOTS,
  SPOTS_TWO_OVER_ZERO,
  carried,
  changedSpots,
  commits,
  dispatch,
  effectsOf,
  fits,
  lastOf,
  openFactsOf,
  opened,
  play,
  stacksOf,
  type Played,
} from './layerOrderModel.fixtures';
import { chosenPreview } from './layerOrderReducer';
import { addState, hintLine, listControls, paneMarks, rowGroupsView, rowsView } from './layerOrderSelectors';
import type { LayerOrderDialogState } from './layerOrderState';

const view = (subject: number | null, verb: 'in_front_of' | 'behind' | null, ...objects: (number | null)[]) => ({
  subject,
  verb,
  objects,
});

/** Pick `subject`, then each of `objects`, on the crease pattern. */
function sentenceOf(state: LayerOrderDialogState, subject: number, ...objects: number[]): Played {
  return play(
    state,
    { type: 'face_picked', face: subject, origin: 'pattern' },
    ...objects.map((face) => ({ type: 'face_picked' as const, face, origin: 'folded' as const }))
  );
}

function previewed(played: Played, facts: Extract<Parameters<typeof dispatch>[1], { type: 'previewed' }>['facts']): Played {
  return play(played.state, { type: 'previewed', request: lastOf(played.effects, 'preview').request, facts });
}

/** Open on the fixture, pick 2 in front of 0 and 3 (from the front: [2, 0, 1] and [2, 3, -1]), and fit it. */
function twoObjectsFit(token = 9): Played {
  return fits(sentenceOf(opened().state, 2, 0, 3), token);
}

/** …then Add it and land the commit: two committed rows from one Add. */
function twoObjectsAdded(openPairsAfter: Uint32Array = Uint32Array.of(4, 5)): Played {
  return commits(play(twoObjectsFit().state, { type: 'add' }), openPairsAfter, SPOTS_TWO_OVER_ZERO);
}

// ---------------------------------------------------------------------------

describe('the builder with several objects', () => {
  it('toggles objects through the reducer, keeps the offered faces still, and says how to add or remove', () => {
    const subject = dispatch(opened().state, { type: 'face_picked', face: 2, origin: 'pattern' });
    expect(hintLine(subject.state)?.text).toEqual({ key: 'pick_object', objects: 2, tinted: false });

    const one = dispatch(subject.state, { type: 'face_picked', face: 0, origin: 'menu' });
    expect(one.state.sentence).toMatchObject({ subject: 2, objects: [0], objectOrigin: 'menu' });
    // Picking one never changes which others are offered, so the tints hold still.
    expect(paneMarks(one.state)).toMatchObject({ pickable: [0, 3], objects: [0, 3], picked: [0] });

    const two = play(one.state, { type: 'face_picked', face: 3, origin: 'pattern' });
    expect(two.state.sentence).toMatchObject({ objects: [0, 3], objectOrigin: 'menu' });
    expect(paneMarks(two.state)).toMatchObject({ pickable: [0, 3], picked: [0, 3], labelled: [2, 0, 3] });
    expect(hintLine(fits(two).state)?.text).toEqual({ key: 'more_objects' });

    // The keyboard face menu's checked item is the same toggle.
    const back = dispatch(two.state, { type: 'face_picked', face: 0, origin: 'menu' });
    expect(back.state.sentence).toMatchObject({ objects: [3], objectOrigin: 'menu' });
  });

  it('objects read in letter order, from the letters the hook hands the open', () => {
    // Face 3 reads before face 0.
    const lettered = openFactsOf({ letterOrder: [3, 2, 0, 1, 4, 5, 6] });
    const s = sentenceOf(opened(lettered).state, 2, 0, 3);
    expect(s.state.sentence.objects).toEqual([3, 0]);
    expect(lastOf(s.effects, 'preview').constraints).toEqual([
      [2, 3, -1],
      [2, 0, 1],
    ]);
  });

  it('a hovered object slot lights every picked object', () => {
    const s = sentenceOf(opened().state, 2, 0, 3);
    expect(paneMarks(dispatch(s.state, { type: 'slot_hovered', slot: 'object' }).state).lit).toEqual([0, 3]);
  });

  it('a click on empty paper clears every object, then the subject', () => {
    const s = sentenceOf(opened().state, 2, 0, 3);
    const once = play(s.state, { type: 'ground_clicked' });
    expect(once.state.sentence).toMatchObject({ subject: 2, objects: [] });
    expect(effectsOf(once.effects, 'preview')).toEqual([]);
    expect(play(once.state, { type: 'ground_clicked' }).state.sentence).toMatchObject({ subject: null, objects: [] });
  });

  it('past the label cap, the subject and the picked objects keep their letters', () => {
    // Face 0 overlaps every other face, every pair open.
    const faces = LAYER_ORDER_LABEL_CAP + 4;
    const others = Array.from({ length: faces - 1 }, (_, i) => i + 1);
    const wide = openFactsOf({
      faces,
      frontUp: new Uint8Array(faces).fill(1),
      openPairs: Uint32Array.from(others.flatMap((face) => [0, face])),
      stacks: { front: stacksOf([[0, ...others]]), back: stacksOf([[...others].reverse().concat(0)]) },
    });
    const s = sentenceOf(opened(wide).state, 0, 9, 5);
    const marks = paneMarks(s.state);
    expect(marks.pastLabelCap).toBe(true);
    expect(marks.alwaysLabelled).toEqual([0, 5, 9]);
    expect([...marks.labelled].sort((a, b) => a - b)).toEqual([0, ...others]);
    // Under the cap nothing is capped, and the picks are among those lettered either way.
    const narrow = paneMarks(sentenceOf(opened().state, 2, 0).state);
    expect(narrow).toMatchObject({ pastLabelCap: false, alwaysLabelled: [2, 0] });
  });
});

// ---------------------------------------------------------------------------

describe('one preview per sentence, over the whole set', () => {
  it('checks the committed list plus one constraint per object, in one call; Add waits and says how many', () => {
    const s = sentenceOf(opened().state, 2, 0, 3);
    // One preview for the first object, then one for the pair: never one per object.
    const previews = effectsOf(s.effects, 'preview');
    expect(previews.map((effect) => effect.constraints)).toEqual([
      [[2, 0, 1]],
      [
        [2, 0, 1],
        [2, 3, -1],
      ],
    ]);
    expect(previews[1]!.limits).toEqual(LAYER_ORDER_MODEL_LIMITS.preview);
    expect(chosenPreview(s.state)).toMatchObject({ kind: 'pending', candidates: [[2, 0, 1], [2, 3, -1]] });
    expect(addState(s.state)).toMatchObject({ enabled: false, why: 'checking', label: 'add_constraints' });
    expect(hintLine(s.state)?.text).toEqual({ key: 'checking', sentence: view(2, 'in_front_of', 0, 3) });
  });

  it('keeps each sentence’s preview for the order on screen: toggling back runs nothing again', () => {
    const f = twoObjectsFit();
    const one = play(f.state, { type: 'face_picked', face: 3, origin: 'pattern' });
    // The one-object sentence was checked on the way: it is answered already, or still pending; either way no new call.
    expect(effectsOf(one.effects, 'preview')).toEqual([]);
    const again = play(one.state, { type: 'face_picked', face: 3, origin: 'pattern' });
    expect(effectsOf(again.effects, 'preview')).toEqual([]);
    expect(chosenPreview(again.state)?.kind).toBe('fits');
  });

  it('a fit enables Add with the plural label and the whole sentence', () => {
    const f = twoObjectsFit();
    expect(addState(f.state)).toEqual({ enabled: true, label: 'add_constraints', sentence: view(2, 'in_front_of', 0, 3) });
    // With one object it reads singular, as it always did.
    expect(addState(fits(sentenceOf(opened().state, 2, 0)).state)).toMatchObject({ label: 'add_constraint' });
  });

  it('a compound sentence that ran out of time offers Keep trying, which checks the whole set again, later', () => {
    const out = previewed(sentenceOf(opened().state, 2, 0, 3), { verdict: 'timed_out' });
    expect(hintLine(out.state)).toMatchObject({
      action: 'keep_trying',
      text: { key: 'timed_out', sentence: view(2, 'in_front_of', 0, 3) },
    });
    expect(lastOf(dispatch(out.state, { type: 'keep_trying' }).effects, 'preview')).toEqual({
      type: 'preview',
      request: expect.any(Number),
      constraints: [
        [2, 0, 1],
        [2, 3, -1],
      ],
      limits: keepTrying(LAYER_ORDER_MODEL_LIMITS.preview),
    });
  });
});

// ---------------------------------------------------------------------------

describe('a clash on a compound sentence', () => {
  /** 4 in front of 5 is committed; 2 is still open with 0 and 3. */
  const WITH_ROW: LayerOpenFacts = openFactsOf({ constraints: [[4, 5, -1]], openPairs: OPEN_PAIRS });

  it('marks the object that clashes, not its sibling, on its chip, both panes and the reason', () => {
    const start = opened(WITH_ROW).state;
    const rowId = start.rows.committed[0]!.id;
    const p = sentenceOf(start, 2, 0, 3);
    // The list checked: the committed row (0), then 2 in front of 0 (1) and of 3 (2).
    const cant = previewed(p, { verdict: 'cant_fit', constraints: [0, 2] });
    const explain = lastOf(cant.effects, 'explain');
    expect(explain).toEqual({
      type: 'explain',
      request: explain.request,
      constraints: [
        [4, 5, -1],
        [2, 0, 1],
        [2, 3, -1],
      ],
      limits: LAYER_ORDER_MODEL_LIMITS.explain,
    });
    // While it is explained, the check's own set already names 3.
    expect(paneMarks(cant.state)).toMatchObject({ danger: [2, 3], clashObjects: [3], clashRows: [] });
    expect(hintLine(cant.state)?.text).toEqual({ key: 'cant_fit_explaining', sentence: view(2, 'in_front_of', 0, 3) });

    const done = play(cant.state, {
      type: 'explained',
      request: explain.request,
      facts: { verdict: 'clash', constraints: [0, 2], faces: [2, 3, 4, 5], minimal: true },
    });
    expect(paneMarks(done.state)).toMatchObject({ danger: [2, 3, 4, 5], clashObjects: [3], clashRows: [rowId] });
    // The reason names only the object in the clash.
    expect(hintLine(done.state)?.text).toEqual({
      key: 'cant_fit',
      sentence: view(2, 'in_front_of', 3),
      clashes: [view(4, 'in_front_of', 5)],
      minimal: true,
    });
    expect(rowGroupsView(done.state)[0]).toMatchObject({
      mark: 'clash',
      reason: { key: 'clashes', clashes: [view(2, 'in_front_of', 3)] },
    });
    expect(addState(done.state)).toMatchObject({ enabled: false, why: 'cant_fit', label: 'add_constraints' });
  });

  it('a constraint the creases alone refuse needs no explaining, and names only its object', () => {
    const cant = previewed(sentenceOf(opened().state, 2, 0, 3), { verdict: 'cant_fit', constraints: [1] });
    expect(effectsOf(cant.effects, 'explain')).toEqual([]);
    expect(paneMarks(cant.state)).toMatchObject({ danger: [2, 3], clashObjects: [3] });
    expect(hintLine(cant.state)?.text).toEqual({
      key: 'cant_fit',
      sentence: view(2, 'in_front_of', 3),
      clashes: [],
      minimal: true,
    });
  });

  it('a proof that names both objects is explained down to the smallest set', () => {
    const cant = previewed(sentenceOf(opened().state, 2, 0, 3), { verdict: 'cant_fit', constraints: [0, 1] });
    expect(lastOf(cant.effects, 'explain').constraints).toEqual([
      [2, 0, 1],
      [2, 3, -1],
    ]);
  });

  it('is reported once per sentence, with its objects bucketed', () => {
    const cant = previewed(sentenceOf(opened().state, 2, 0, 3), { verdict: 'cant_fit', constraints: [1] });
    expect(effectsOf(cant.effects, 'track').map((effect) => effect.fact)).toEqual([constraintBlockedFact(0, 2)]);
    expect(effectsOf(dispatch(cant.state, { type: 'face_hovered', face: 0 }).effects, 'track')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('Add with several objects', () => {
  it('commits one constraint per object by the preview’s token, as one entry, and clears the sentence', () => {
    const added = play(twoObjectsFit(9).state, { type: 'add' });
    expect(lastOf(added.effects, 'commit')).toMatchObject({
      constraints: [
        [2, 0, 1],
        [2, 3, -1],
      ],
      token: 9,
    });
    const landed = commits(added, Uint32Array.of(4, 5), SPOTS_TWO_OVER_ZERO);
    expect(landed.state.rows.committed.map((row) => row.constraint)).toEqual([
      [2, 0, 1],
      [2, 3, -1],
    ]);
    expect(landed.state.history.past).toHaveLength(1);
    expect(landed.state.sentence).toMatchObject({ subject: null, objects: [] });
    // Once per Add, with the objects it named.
    expect(effectsOf(landed.effects, 'track').map((effect) => effect.fact)).toEqual([
      constraintAddedFact('in_front_of', 'pattern', 'folded', 2),
    ]);
  });

  it('undo takes the whole Add back in one step, and redo puts it back', () => {
    const added = twoObjectsAdded();
    const undo = play(added.state, { type: 'undo' });
    expect(lastOf(undo.effects, 'commit')).toMatchObject({ constraints: [], token: null });
    const undone = commits(undo, OPEN_PAIRS, SPOTS);
    expect(undone.state.rows.committed).toEqual([]);
    expect(listControls(undone.state)).toMatchObject({ undo: false, redo: true });

    const redo = play(undone.state, { type: 'redo' });
    expect(lastOf(redo.effects, 'commit').constraints).toEqual([
      [2, 0, 1],
      [2, 3, -1],
    ]);
    const redone = commits(redo, Uint32Array.of(4, 5), SPOTS_TWO_OVER_ZERO);
    expect(redone.state.rows.committed.map((row) => row.id)).toEqual(added.state.rows.committed.map((row) => row.id));
  });

  it('skips a constraint the list already holds: the preview checks, and Add commits, only the new ones', () => {
    // 2 in front of 0 is committed, and deduction still offers 0 to 2.
    const start = opened(openFactsOf({ constraints: [[2, 0, 1]], openPairs: OPEN_PAIRS })).state;
    const s = sentenceOf(start, 2, 0, 3);
    expect(lastOf(s.effects, 'preview').constraints).toEqual([
      [2, 0, 1],
      [2, 3, -1],
    ]);
    const added = play(fits(s, 4).state, { type: 'add' });
    expect(lastOf(added.effects, 'commit')).toMatchObject({ constraints: [[2, 0, 1], [2, 3, -1]], token: 4 });
    const landed = commits(added, Uint32Array.of(4, 5));
    expect(landed.state.rows.committed.map((row) => row.constraint)).toEqual([
      [2, 0, 1],
      [2, 3, -1],
    ]);
    // A sentence that would add nothing has nothing to check or add.
    const nothing = sentenceOf(start, 2, 0);
    expect(effectsOf(nothing.effects, 'preview')).toEqual([]);
    expect(addState(nothing.state)).toMatchObject({ enabled: false, why: 'pick_object' });
  });
});

// ---------------------------------------------------------------------------

describe('the list: one row per subject and verb', () => {
  it('a compound Add reads as one row, whatever each object’s sign, from either side', () => {
    const added = twoObjectsAdded();
    const [first, second] = added.state.rows.committed.map((row) => row.id);
    expect(rowGroupsView(added.state)).toEqual([
      {
        id: first,
        kind: 'committed',
        sentence: view(2, 'in_front_of', 0, 3),
        mark: 'none',
        reason: null,
        hot: false,
        flagged: false,
        members: [
          { id: first, object: 0, clash: false },
          { id: second, object: 3, clash: false },
        ],
      },
    ]);
    // Stored one constraint each.
    expect(rowsView(added.state)).toHaveLength(2);
    const back = play(added.state, { type: 'side_set', side: 'back' });
    expect(rowGroupsView(back.state)[0]!.sentence).toEqual(view(2, 'behind', 0, 3));
  });

  it('a later Add for the same subject and verb joins its row, at the earliest one’s place', () => {
    const first = commits(play(fits(sentenceOf(opened().state, 2, 0)).state, { type: 'add' }), Uint32Array.of(2, 3, 4, 5));
    const second = commits(play(fits(sentenceOf(first.state, 4, 5)).state, { type: 'add' }), Uint32Array.of(2, 3));
    const third = commits(play(fits(sentenceOf(second.state, 2, 3)).state, { type: 'add' }), new Uint32Array());
    const [twoZero, fourFive, twoThree] = third.state.rows.committed.map((row) => row.id);
    expect(rowGroupsView(third.state).map((row) => [row.id, row.sentence, row.members.map((m) => m.id)])).toEqual([
      [twoZero, view(2, 'in_front_of', 0, 3), [twoZero, twoThree]],
      [fourFive, view(4, 'in_front_of', 5), [fourFive]],
    ]);
  });

  it('a different verb for the same subject is a row of its own', () => {
    const start = opened(openFactsOf({ constraints: [[2, 0, 1], [2, 3, 1]] })).state;
    expect(rowGroupsView(start).map((row) => row.sentence)).toEqual([view(2, 'in_front_of', 0), view(2, 'behind', 3)]);
  });

  it('the row’s trash removes every object in it, as one undo step', () => {
    const added = twoObjectsAdded();
    const row = rowGroupsView(added.state)[0]!;
    const asked = play(added.state, { type: 'rows_removed', ids: row.members.map((member) => member.id) });
    expect(effectsOf(asked.effects, 'commit').map((effect) => effect.constraints)).toEqual([[]]);
    const removed = commits(asked, OPEN_PAIRS, SPOTS);
    expect(rowGroupsView(removed.state)).toEqual([]);
    expect(removed.state.history.past).toHaveLength(2);

    const undone = commits(play(removed.state, { type: 'undo' }), Uint32Array.of(4, 5), SPOTS_TWO_OVER_ZERO);
    expect(rowGroupsView(undone.state)[0]!.members.map((member) => member.object)).toEqual([0, 3]);
  });

  it('each object’s × removes only it, as one undo step', () => {
    const added = twoObjectsAdded();
    const [zero, three] = rowGroupsView(added.state)[0]!.members;
    const asked = play(added.state, { type: 'row_removed', id: three!.id });
    expect(lastOf(asked.effects, 'commit').constraints).toEqual([[2, 0, 1]]);
    const removed = commits(asked, Uint32Array.of(2, 3, 4, 5));
    expect(rowGroupsView(removed.state).map((row) => [row.id, row.sentence])).toEqual([[zero!.id, view(2, 'in_front_of', 0)]]);

    const undone = commits(play(removed.state, { type: 'undo' }), Uint32Array.of(4, 5));
    expect(rowGroupsView(undone.state)[0]!.members.map((member) => member.id)).toEqual([zero!.id, three!.id]);
  });

  it('hovering a row lights its subject and all its objects; a click puts its subject in the builder', () => {
    const added = twoObjectsAdded(Uint32Array.of(2, 5, 4, 5));
    const row = rowGroupsView(added.state)[0]!;
    const hovered = play(added.state, { type: 'row_hovered', id: row.id });
    expect(paneMarks(hovered.state)).toMatchObject({ rowFaces: [2, 0, 3], labelled: [2, 0, 3] });
    expect(rowGroupsView(hovered.state)[0]!.hot).toBe(true);
    // Through any of its members.
    expect(paneMarks(play(added.state, { type: 'row_hovered', id: row.members[1]!.id }).state).rowFaces).toEqual([2, 0, 3]);
    const clicked = play(added.state, { type: 'row_clicked', id: row.id });
    expect(clicked.state.sentence).toMatchObject({ subject: 2, subjectOrigin: 'list', objects: [] });
  });

  it('a clash marks the clashing objects within their row', () => {
    // 2 in front of 0 and 3 are committed as one row; 4 is still open with 5.
    const start = opened(openFactsOf({ constraints: [[2, 0, 1], [2, 3, -1]], openPairs: Uint32Array.of(4, 5) })).state;
    const [zero, three] = start.rows.committed.map((row) => row.id);
    const cant = previewed(sentenceOf(start, 4, 5), { verdict: 'cant_fit', constraints: [1, 2] });
    const done = play(cant.state, {
      type: 'explained',
      request: lastOf(cant.effects, 'explain').request,
      facts: { verdict: 'clash', constraints: [1, 2], faces: [2, 3, 4, 5], minimal: true },
    });
    const [row] = rowGroupsView(done.state);
    expect(row).toMatchObject({
      mark: 'clash',
      members: [
        { id: zero, clash: false },
        { id: three, clash: true },
      ],
    });
    expect(paneMarks(done.state).clashRows).toEqual([three]);
  });

  describe('carried rows', () => {
    const SPLIT_SUBJECT = { status: { status: 'ambiguous' }, subjectState: 'ambiguous', constraint: null } as const;
    const SPLIT_OBJECT = { status: { status: 'ambiguous' }, objectState: 'ambiguous', constraint: null } as const;
    const NO_OVERLAP = { status: { status: 'gone', cause: 'no_overlap' }, constraint: null } as const;
    const RESTORED = openFactsOf({
      constraints: [[2, 0, 1]],
      restore: {
        outcome: { kind: 'applied' },
        carried: [
          // Two split subjects, same verb: one row.
          carried({ index: 1, ...SPLIT_SUBJECT, subject: 2, object: 3, sign: -1 }),
          carried({ index: 2, ...SPLIT_SUBJECT, subject: 2, object: 5, sign: -1 }),
          // Same subject and verb, another status: a row of its own.
          carried({ index: 3, ...NO_OVERLAP, subject: 2, object: 4, sign: 1 }),
          // A split object: its reason names its own face, so it stays alone.
          carried({ index: 4, ...SPLIT_OBJECT, subject: 2, object: 6, sign: 1 }),
        ],
      },
    });

    it('group within one status, never with the committed rows, and give the row its one reason', () => {
      const { state } = opened(RESTORED, { hasRecord: true });
      const ids = [...state.rows.committed, ...state.rows.carried].map((row) => row.id);
      expect(rowGroupsView(state).map((row) => [row.id, row.kind, row.sentence, row.mark, row.reason])).toEqual([
        [ids[0], 'committed', view(2, 'in_front_of', 0), 'none', null],
        [ids[1], 'carried', view(2, 'in_front_of', 3, 5), 'not_applied', { key: 'ambiguous', face: 2 }],
        [ids[3], 'carried', view(2, 'in_front_of', 4), 'not_applied', { key: 'no_overlap', sentence: view(2, 'in_front_of', 4) }],
        [ids[4], 'carried', view(2, 'in_front_of', 6), 'not_applied', { key: 'ambiguous', face: 6 }],
      ]);
    });

    it('pointing at a grouped carried row gives the row’s reason, and its × removes one, as one undo step', () => {
      const { state } = opened(RESTORED, { hasRecord: true });
      const row = rowGroupsView(state)[1]!;
      const hovered = play(state, { type: 'row_hovered', id: row.members[1]!.id });
      expect(hintLine(hovered.state)?.text).toEqual({ key: 'row_not_applied', reason: { key: 'ambiguous', face: 2 } });
      expect(paneMarks(hovered.state).rowFaces).toEqual([2, 3, 5]);

      const removedOne = play(state, { type: 'row_removed', id: row.members[0]!.id });
      expect(effectsOf(removedOne.effects, 'commit')).toEqual([]);
      expect(rowGroupsView(removedOne.state)[1]!.sentence).toEqual(view(2, 'in_front_of', 5));
      const removedRow = play(state, { type: 'rows_removed', ids: row.members.map((member) => member.id) });
      expect(removedRow.state.rows.carried.map((r) => r.facts.index)).toEqual([3, 4]);
      expect(removedRow.state.history.past).toHaveLength(1);
      expect(play(removedRow.state, { type: 'undo' }).state.rows.carried.map((r) => r.facts.index)).toEqual([1, 2, 3, 4]);
    });

    it('a grouped row’s removal while the saved rows clash re-checks once', () => {
      const clashing = openFactsOf({
        restore: {
          outcome: { kind: 'clash', constraints: [0, 1] },
          carried: [
            carried({ index: 0, status: { status: 'clashing' }, subject: 2, object: 0, constraint: [2, 0, 1] }),
            carried({ index: 1, status: { status: 'clashing' }, subject: 2, object: 3, sign: -1, constraint: [2, 3, -1] }),
            carried({ index: 2, subject: 4, object: 5, sign: -1, constraint: [4, 5, -1] }),
          ],
        },
      });
      const { state } = opened(clashing, { hasRecord: true });
      const [row, waiting] = rowGroupsView(state);
      expect(row).toMatchObject({
        sentence: view(2, 'in_front_of', 0, 3),
        mark: 'clash',
        members: [{ clash: true }, { clash: true }],
      });
      expect(waiting).toMatchObject({ sentence: view(4, 'in_front_of', 5), mark: 'none', reason: { key: 'waiting' } });
      const removed = play(state, { type: 'rows_removed', ids: row!.members.map((member) => member.id) });
      expect(effectsOf(removed.effects, 'commit').map((effect) => effect.constraints)).toEqual([[[4, 5, -1]]]);
      expect(commits(removed).state.settle).toEqual({ kind: 'settled' });
    });
  });
});

// ---------------------------------------------------------------------------

describe('a one-object sentence behaves as it always did', () => {
  it('previews, adds and lists one constraint, with the same effects as before', () => {
    const p = sentenceOf(opened().state, 2, 0);
    expect(effectsOf(p.effects, 'preview')).toEqual([
      { type: 'preview', request: 2, constraints: [[2, 0, 1]], limits: LAYER_ORDER_MODEL_LIMITS.preview },
    ]);
    const added = play(fits(p, 7, SPOTS_TWO_OVER_ZERO, changedSpots([1], [1])).state, { type: 'add' });
    expect(lastOf(added.effects, 'commit')).toMatchObject({ constraints: [[2, 0, 1]], token: 7 });
    const landed = commits(added, Uint32Array.of(2, 3, 4, 5));
    expect(rowGroupsView(landed.state).map((row) => row.members.length)).toEqual([1]);
    expect(lastOf(landed.effects, 'track').fact).toEqual(constraintAddedFact('in_front_of', 'pattern', 'folded', 1));
  });
});
