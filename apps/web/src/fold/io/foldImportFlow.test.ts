/**
 * Import CP's flow over the session and a fake engine with Import CP's
 * calls: one order commits at once, several wait for a choice and are
 * pictured, an empty sequence adopts the pattern's sheet, Edit's figure
 * commits as it lands, a refusal is said, and every import and preview the
 * engine held is let go.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OristudioCpFoldedPaperScene } from '../../engine/oristudioCpTypes';
import { initialFoldReaderState, withFoldCursor } from '../document/foldReaderState';
import { sequenceOf, step, valleyAt } from '../document/foldSequence.fixtures';
import type { FoldCpJumpOp, FoldSequenceDocument } from '../document/foldSequenceDocument';
import type { FoldImportOpened, FoldImportSource, FoldImportTarget } from '../engine/foldEngineIoWire';
import type { FoldEngineOutcome, FoldScene } from '../engine/foldEngineWire';
import { createFoldSession, type FoldSession } from '../session/foldSession';
import {
  fakeFoldEngine,
  inProcessFoldRuntime,
  memoryFoldDocument,
  settle,
  type FakeFoldEngine,
} from '../session/foldSession.fixtures';
import {
  createFoldImportFlow,
  foldOrderChoiceKey,
  foldShapeOfOutline,
  type FoldImportFlow,
  type FoldImportRequest,
} from './foldImportFlow';

/** Import CP's calls over the fake engine: each import lists `orders` per component. */
interface FakeIo {
  engine: FakeFoldEngine;
  /** Imports the engine holds now. */
  held: Set<number>;
  calls: string[];
}

interface FakeIoOptions {
  orders?: number[];
  refuse?: string;
  /** The sheet an empty target adopts. */
  paper?: FoldImportOpened['paper'];
}

function fakeIo({ orders = [], refuse, paper = { kind: 'square' } }: FakeIoOptions): () => FakeIo {
  return () => {
    const base = fakeFoldEngine();
    const held = new Set<number>();
    const opened = new Map<number, { parent: number; origin: FoldCpJumpOp['origin'] }>();
    const calls: string[] = [];
    let next = 100;
    const jump = (origin: FoldCpJumpOp['origin'], order: string): FoldCpJumpOp => ({
      kind: 'cp-jump',
      cpJson: '{"vertices_coords":[]}',
      orderJson: order,
      origin,
    });
    const land = (parent: number, op: FoldCpJumpOp) => {
      const landed = base.apply(parent, op);
      if (landed.status !== 'ok') throw new Error('refused');
      return { status: 'ok' as const, state: landed.state, summary: landed.summary, op, fingerprint: base.fingerprint(landed.state) };
    };
    const parentOf = (target: FoldImportTarget) =>
      target.kind === 'after'
        ? target.state
        : (base.sheet({ shape: paper ?? { kind: 'square' }, startSide: target.startSide ?? 'front' }) as { state: number }).state;
    const engine = Object.assign(base, {
      importCp(source: FoldImportSource, target: FoldImportTarget): FoldEngineOutcome<FoldImportOpened> {
        calls.push(`importCp:${target.kind}`);
        if (refuse) return { status: 'refused', refusal: { code: refuse }, fixes: [], faces: [], vertices: [] } as never;
        const handle = (next += 1);
        held.add(handle);
        opened.set(handle, { parent: parentOf(target), origin: source.sample ? 'sample' : source.format });
        const listed = orders.filter((n) => n > 0);
        return {
          status: 'ok',
          import: handle,
          summary: {} as FoldImportOpened['summary'],
          paper: target.kind === 'empty' ? paper : null,
          count: { orders: listed.reduce((a, b) => a * b, 1), exact: true },
          components: listed.map((n) => ({ orders: n, truncated: false })),
          nodes: 7,
        };
      },
      importPick(handle: number, choice: readonly number[]) {
        calls.push(`importPick:${choice.join(',')}`);
        const import_ = opened.get(handle);
        if (!import_ || !held.has(handle)) throw { code: 'unknown_import', message: 'gone' };
        return land(import_.parent, jump(import_.origin, JSON.stringify(choice)));
      },
      importEditFoldedFigure(_scene: OristudioCpFoldedPaperScene, target: FoldImportTarget) {
        calls.push(`importEditFoldedFigure:${target.kind}`);
        return land(parentOf(target), jump('edit_folded_figure', '[]'));
      },
      releaseImports(handles: readonly number[]) {
        calls.push(`releaseImports:${handles.join(',')}`);
        return handles.filter((handle) => held.delete(handle)).length;
      },
      scene(state: number): FoldScene {
        calls.push(`scene:${state}`);
        return { scene: state } as unknown as FoldScene;
      },
    });
    return { engine, held, calls };
  };
}

let flows: FoldImportFlow[] = [];
let sessions: FoldSession[] = [];

afterEach(() => {
  for (const flow of flows) flow.dispose();
  for (const session of sessions) session.dispose();
  flows = [];
  sessions = [];
});

function setup(
  document: FoldSequenceDocument | null,
  cursor: string | null,
  io: FakeIoOptions = {},
  editFoldedFigure: () => Promise<OristudioCpFoldedPaperScene | null> = async () => null
) {
  const engines: FakeIo[] = [];
  const make = fakeIo(io);
  const runtime = inProcessFoldRuntime(() => {
    const made = make();
    engines.push(made);
    return made.engine;
  });
  let next = 0;
  const source = memoryFoldDocument(
    {
      held: document && { document, readOnlyRaw: null },
      reader: document && withFoldCursor(initialFoldReaderState(document.id), document, cursor),
    },
    (prefix) => `${prefix}-${(next += 1)}`
  );
  const session = createFoldSession({ document: source, runtime });
  sessions.push(session);
  const imported = vi.fn();
  const flow = createFoldImportFlow({ session, editFoldedFigure, onImported: imported });
  flows.push(flow);
  return { session, source, runtime, flow, imported, io: () => engines[engines.length - 1]! };
}

const SAMPLE: FoldImportRequest = { kind: 'sample', sample: 'waterbomb-base' };
const FILE: FoldImportRequest = { kind: 'file', name: 'crane.cp', source: { format: 'cp', text: '1 0 0 1 1' } };

describe('Import CP’s flow', () => {
  it('holds the engine while it lives, and lets it go with every import it held', async () => {
    const { flow, runtime, io } = setup(sequenceOf([step('a', null)]), 'a', { orders: [2] });
    expect(runtime.holders()).toBe(1);
    await flow.open(FILE);
    await settle();
    expect(io().held.size).toBe(1);
    flow.dispose();
    await settle();
    expect(runtime.holders()).toBe(0);
  });

  it('commits a pattern with one order at once, after the step on screen, as it landed', async () => {
    const { flow, source, io, imported, session } = setup(sequenceOf([step('a', null)]), 'a');
    await flow.open(SAMPLE);
    await settle();

    expect(flow.store.getState()).toMatchObject({ phase: 'done', origin: 'sample', stepId: 'fstep-1' });
    expect(source.commits).toEqual([
      { parent: 'a', op: expect.objectContaining({ kind: 'cp-jump', origin: 'sample' }), expect: expect.stringMatching(/^fs1:/) },
    ]);
    expect(io().calls).toEqual(['importCp:after', 'importPick:', `releaseImports:${101}`]);
    expect(io().held.size).toBe(0);
    expect(imported).toHaveBeenCalledExactlyOnceWith('sample');
    // The replay took the state the pick landed: no second fold of the jump.
    expect(io().engine.log.filter((call) => call === 'step:cp-jump')).toEqual([]);
    expect(session.store.getState().cursor).toBe('fstep-1');
  });

  it('adopts the pattern’s sheet for an empty sequence', async () => {
    const rectangle = { kind: 'rectangle' as const, aspect: [1, 0.5] as [number, number] };
    const { flow, source, session } = setup(null, null, { paper: rectangle });
    await flow.open(FILE);
    await settle();

    expect(flow.store.getState()).toMatchObject({ phase: 'done', origin: 'cp' });
    expect(source.commits).toEqual([expect.objectContaining({ parent: null, adopt: rectangle })]);
    expect(session.store.getState().paper.shape).toEqual(rectangle);
  });

  it('waits for a choice among several orders, pictures each, and commits the one chosen', async () => {
    const { flow, source, io } = setup(sequenceOf([step('a', null)]), 'a', { orders: [3, 1, 2] });
    await flow.open(FILE);
    await settle(10);

    const choosing = flow.store.getState();
    expect(choosing).toMatchObject({ phase: 'choosing', choice: [0, 0, 0], committing: false });
    if (choosing.phase !== 'choosing') throw new Error('not choosing');
    // The chosen one first, then each component's orders with the others as
    // chosen; a component with one order has nothing to choose.
    expect([...choosing.previews.keys()]).toEqual(['0,0,0', '1,0,0', '2,0,0', '0,0,1']);
    expect([...choosing.previews.values()].every((preview) => preview.status === 'ready')).toBe(true);
    // Every preview's state was let go once pictured: the engine holds the sheet and step a.
    expect(io().engine.live()).toBe(2);

    flow.choose(2, 1);
    flow.choose(0, 2);
    await settle(10);
    const chosen = flow.store.getState();
    if (chosen.phase !== 'choosing') throw new Error('not choosing');
    expect(chosen.choice).toEqual([2, 0, 1]);
    expect(chosen.previews.get(foldOrderChoiceKey([2, 0, 1]))?.status).toBe('ready');

    // Choices outside the listed orders change nothing.
    flow.choose(1, 1);
    flow.choose(2, 2);
    flow.choose(5, 0);
    expect(flow.store.getState()).toBe(chosen);

    await flow.commit();
    await settle();
    expect(flow.store.getState()).toMatchObject({ phase: 'done' });
    expect(source.commits).toEqual([
      expect.objectContaining({ parent: 'a', op: expect.objectContaining({ orderJson: '[2,0,1]' }) }),
    ]);
    expect(io().held.size).toBe(0);
    // The sheet, step a and the imported step: the pick committed is the state the replay took.
    expect(io().engine.live()).toBe(3);
  });

  it('says why a pattern was refused, and asks again with a larger budget when the search ran out', async () => {
    const { flow, io } = setup(sequenceOf([step('a', null)]), 'a', { refuse: 'import_budget_exceeded' });
    await flow.open(FILE);
    expect(flow.store.getState()).toMatchObject({
      phase: 'refused',
      refusal: { kind: 'engine', refused: { refusal: { code: 'import_budget_exceeded' } } },
    });
    await flow.searchLonger();
    expect(io().calls).toEqual(['importCp:after', 'importCp:after']);
  });

  it('refuses a file it cannot read before the engine is asked', async () => {
    const { flow, io } = setup(sequenceOf([step('a', null)]), 'a');
    await flow.open({ kind: 'file', name: 'photo.png', source: null });
    expect(flow.store.getState()).toMatchObject({
      phase: 'refused',
      refusal: { kind: 'local', code: 'unsupported_file', name: 'photo.png' },
    });
    await flow.open({ kind: 'file', name: 'crane.cp', source: null, unreadable: true });
    expect(flow.store.getState()).toMatchObject({ refusal: { code: 'unreadable_file' } });
    expect(io().calls).toEqual([]);
  });

  it('starts from Edit’s folded figure, committing it as it landed', async () => {
    const figure = { faces: [] } as unknown as OristudioCpFoldedPaperScene;
    const { flow, source, imported } = setup(sequenceOf([step('a', null)]), 'a', {}, async () => figure);
    await flow.open({ kind: 'edit-folded-figure' });
    await settle();
    expect(flow.store.getState()).toMatchObject({ phase: 'done', origin: 'edit_folded_figure' });
    expect(source.commits).toHaveLength(1);
    expect(imported).toHaveBeenCalledWith('edit_folded_figure');
  });

  it('says when Edit has no folded figure to start from', async () => {
    const { flow, io } = setup(sequenceOf([step('a', null)]), 'a');
    await flow.open({ kind: 'edit-folded-figure' });
    expect(flow.store.getState()).toMatchObject({ refusal: { kind: 'local', code: 'no_folded_figure' } });
    expect(io().calls).toEqual([]);
  });

  it('refuses to add after a step that has no state', async () => {
    // A newer build's step: locked, so it lands nothing.
    const locked = { id: 'b', parent: 'a', unknown: { id: 'b', parent: 'a', op: { kind: 'sink' } } };
    const { flow } = setup(sequenceOf([step('a', null, valleyAt(0.5)), locked]), 'b');
    await flow.open(SAMPLE);
    expect(flow.store.getState()).toMatchObject({ refusal: { kind: 'local', code: 'no_state' } });
  });

  it('drops an import a newer request or a reset replaced, letting it go', async () => {
    const { flow, io } = setup(sequenceOf([step('a', null)]), 'a', { orders: [2] });
    await flow.open(FILE);
    await settle(10);
    expect(io().held.size).toBe(1);
    flow.reset();
    await settle();
    expect(flow.store.getState()).toEqual({ phase: 'idle' });
    expect(io().held.size).toBe(0);
  });
});

describe('foldShapeOfOutline', () => {
  it('reads a square, a rectangle normalised to longer side 1, and nothing from no area', () => {
    expect(foldShapeOfOutline([[0, 0], [1, 0], [1, 1], [0, 1]])).toEqual({ kind: 'square' });
    expect(foldShapeOfOutline([[0, 0], [1, 0], [1, 0.5], [0, 0.5]])).toEqual({ kind: 'rectangle', aspect: [1, 0.5] });
    expect(foldShapeOfOutline([[0, 0], [1, 0]])).toBeNull();
  });
});
