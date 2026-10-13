import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearHeldModifiers, syncHeldModifiersFromEvent } from '../../../keyboard/heldModifiers';
import { foldSessionDocumentSource } from '../../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../../store/workspaceStore/store';
import { initialFoldReaderState, withFoldCursor } from '../../document/foldReaderState';
import type { FoldStep, FoldSwivelKind, SheetPoint } from '../../document/foldSequenceDocument';
import { createFoldSession, type FoldSession } from '../../session/foldSession';
import { settle } from '../../session/foldSession.fixtures';
import { selectFoldCursorNode } from '../../session/foldSessionState';
import { createFoldTools, type FoldTools } from '../../tools/foldToolState';
import type { FoldSwivelReachView } from '../../tools/vertex/swivelReach';
import { foldVertexWindowView } from '../foldCanvasModel';
import type { FoldPickIndex } from '../foldPicking';
import {
  clickPane,
  commitPreviewed,
  exampleStep as stepAt,
  FOLD_FLOW_AVAILABLE as available,
  FOLD_FLOW_RADII as RADII,
  foldFlowBridge as bridge,
  FoldFlowCanvas as Canvas,
  openedExample as opened,
  shownPickIndex,
  untilFlow as until,
  type FoldFlowSeen as Seen,
} from '../foldToolFlow.fixtures';
import type { FoldStateView } from '../useFoldStateView';

/**
 * The swivel on a folded edge made through the Swivel fold tool, both kinds
 * (owner feedback, 2026-10-12: "did you test that both still work?") — the
 * tool's own pipeline over the session and the real bridge, in-process: the
 * canvas's hit test and pick for each click (`useFoldCanvasVerbs`, whose
 * line clicks take only what the swivel's reach lights), the preview and its
 * reach (`useFoldToolPreview`, `useFoldVertexStep`, `useFoldSwivelReach`),
 * the window's Kind control (`foldVertexWindowView`) and the commit. On the
 * owner's squash (`swivel-on-edge.osf` to its sixth step), the README's three
 * clicks — the kite's upper-left edge where the creases meet, the model's
 * lower-left edge, the centre line — commit the open swivel the example
 * stores, to its fingerprint; with Inside chosen in the window, the inside
 * swivel `swivel-inside.osf` stores.
 *
 * Skipped when the bridge has not been built (a fresh worktree before
 * `build:wasm`); CI builds it before the web tests run.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The README's clicks on the folded pane, in its scene frame (the squash,
 * turned an eighth so the open corner points down): the kite's upper-left
 * edge runs from its left corner to its top, and the creases meet a little
 * past half way up it; the model's lower-left edge; the centre line.
 */
const KITE_LEFT = { x: -0.2071067811865476, y: 0.2071067811865476 };
const KITE_TOP = { x: 0, y: 0.7071067811865476 };
const MEET = { x: KITE_LEFT.x + 0.55 * (KITE_TOP.x - KITE_LEFT.x), y: KITE_LEFT.y + 0.55 * (KITE_TOP.y - KITE_LEFT.y) };
const EDGE = { x: -0.1036, y: 0.1036 };
const CENTRE_LINE = { x: 0, y: 0.55 };

/** The example's seventh step, the swivel, as it stores it. */
function storedSwivel(name: string): FoldStep {
  const step = stepAt(opened(name), 6);
  if (step.op.kind !== 'swivel' || !('fold' in step.op)) throw new Error(`${name}: step 7 is the swivel on a folded edge`);
  return step;
}

/** The line a pane offers through a sheet point: by its id, the one whose sheet stretch holds it. */
function lineThrough(index: FoldPickIndex, at: SheetPoint): number {
  const segment = [...index.folded.segments, ...index.creasePattern.segments].find(({ sheet: [a, b] }) => {
    const cross = (b[0] - a[0]) * (at[1] - a[1]) - (b[1] - a[1]) * (at[0] - a[0]);
    const along = (at[0] - a[0]) * (b[0] - a[0]) + (at[1] - a[1]) * (b[1] - a[1]);
    const length = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    return Math.abs(cross) < 1e-9 && along > 0 && along < length;
  });
  if (!segment) throw new Error(`no line through ${at.join(', ')}`);
  return segment.edge;
}

let session: FoldSession;
let host: HTMLDivElement;
let root: Root;

const snapshot = () => session.store.getState();
const cursor = () => selectFoldCursorNode(snapshot());

/** The owner's squash on screen, the Swivel fold tool in hand, and the canvas mounted over it. */
async function squashWithSwivel(): Promise<{ tools: FoldTools; index: FoldPickIndex; seen: { current: Seen | null } }> {
  const example = opened('swivel-on-edge.osf');
  // The squash: the example's first six steps, as the owner's own file holds them.
  const document = { ...example, steps: example.steps.slice(0, 6) };
  const squash = stepAt(document, 5);
  const reader = withFoldCursor(initialFoldReaderState(document.id), document, squash.id);
  useWorkspaceStore.getState().installFoldSequences([{ document, readOnlyRaw: null }], reader);
  await until(() => snapshot().cursor === squash.id && cursor().status === 'ok' && cursor().summary, 'the squash');
  expect(cursor().fingerprint).toBe(squash.expect);
  const index = await shownPickIndex(session);
  const tools = createFoldTools();
  tools.selectTool('swivel');
  const seen: { current: Seen | null } = { current: null };
  const view = { index } as FoldStateView;
  await act(async () => {
    root.render(<Canvas session={session} tools={tools} view={view} seenRef={seen} />);
    await settle();
  });
  return { tools, index, seen };
}

/** A click on the folded pane where the canvas would take it: its hit test, then its pick. */
const click = (seen: { current: Seen | null }, at: { x: number; y: number }) => clickPane(seen, at);

function readyReach(seen: { current: Seen | null }): FoldSwivelReachView | null {
  const reach = seen.current?.preview.vertex?.reach ?? null;
  return reach?.status === 'ready' ? reach : null;
}

/** The README's three clicks, the lit edges and lines checked as each is offered. */
async function threeClicks(seen: { current: Seen | null }, index: FoldPickIndex, stored: FoldStep) {
  if (stored.op.kind !== 'swivel' || !('fold' in stored.op)) throw new Error('not a swivel on a folded edge');
  const edge = lineThrough(index, stored.op.edge);
  const line = stored.op.target.via === 'crease' ? lineThrough(index, stored.op.target.at) : -1;

  // 1. On the kite's upper-left edge: a point on a folded edge.
  const meet = await click(seen, MEET);
  expect(meet?.pick).toMatchObject({ kind: 'point', fold: { kind: 'segment', segment: 'bend' } });
  const reach = await until(() => readyReach(seen), 'the reach');
  // The edge that swings is lit, and the centre line among the lines it lands on, open.
  expect(reach.edges.has(edge)).toBe(true);
  const landing = reach.targets.get(edge)?.get(line);
  expect(landing?.op).toMatchObject({ kind: 'swivel', via: 'edge', direction: 'valley' });
  expect(landing && 'swivel' in landing.op).toBe(false);
  expect(landing?.kinds).toEqual([true, true]);

  // 2. The model's lower-left edge: taken, as a lit edge.
  const swung = await click(seen, EDGE);
  expect(swung?.pick).toMatchObject({ kind: 'segment', edge });
  // 3. The centre line: taken, as a line that edge lands on.
  const landed = await click(seen, CENTRE_LINE);
  expect(landed?.pick).toMatchObject({ kind: 'segment', edge: line });
}

/** The step the tool previews, once the engine has described it: of the kind asked. */
function previewed(seen: { current: Seen | null }, kind: FoldSwivelKind) {
  const step = seen.current?.preview.step;
  if (!step || step.op.kind !== 'swivel') return null;
  const inside = 'swivel' in step.op && step.op.swivel === 'inside';
  return inside === (kind === 'inside') ? step : null;
}

/** Commit what the tool previews, as Enter does, and wait for the step to land on screen. */
const commit = (seen: { current: Seen | null }) => commitPreviewed(session, seen);

describe.skipIf(!available)('the swivel on a folded edge, made through the Swivel fold tool', () => {
  beforeEach(async () => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    session = createFoldSession({ document: foldSessionDocumentSource(useWorkspaceStore), runtime: await bridge() });
    session.retain();
    await settle();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    session.dispose();
  });

  it('commits the open swivel by default, Kind offering both, to the fingerprint swivel-on-edge.osf stores', async () => {
    const stored = storedSwivel('swivel-on-edge.osf');
    const { tools, index, seen } = await squashWithSwivel();
    await threeClicks(seen, index, stored);
    const step = await until(() => previewed(seen, 'open'), 'the open preview');
    expect(step.op).toMatchObject({ kind: 'swivel', via: 'edge', direction: 'valley', target: { via: 'crease' } });
    // The window offers both kinds, Open taken; no Direction (only valley lands).
    const window = foldVertexWindowView(tools.store.getState(), seen.current!.preview);
    expect(window).toMatchObject({ onFold: true, swivelKind: 'open', swivelKinds: ['open', 'inside'], directions: [true, false] });
    const committed = await commit(seen);
    expect(committed.op).toMatchObject({ kind: 'swivel', via: 'edge', direction: 'valley' });
    expect('swivel' in committed.op).toBe(false);
    expect(committed.fingerprint).toBe(stored.expect);
  });

  it('commits the inside swivel when Inside is chosen in the window, to the fingerprint swivel-inside.osf stores', async () => {
    const stored = storedSwivel('swivel-inside.osf');
    const { tools, index, seen } = await squashWithSwivel();
    await threeClicks(seen, index, stored);
    await until(() => previewed(seen, 'open'), 'the open preview');
    await act(async () => {
      seen.current?.verbs.setSwivelKind('inside');
      await settle();
    });
    const step = await until(() => previewed(seen, 'inside'), 'the inside preview');
    expect(step.op).toMatchObject({ kind: 'swivel', via: 'edge', direction: 'valley', swivel: 'inside' });
    expect(foldVertexWindowView(tools.store.getState(), seen.current!.preview)).toMatchObject({
      swivelKind: 'inside',
      swivelKinds: ['open', 'inside'],
    });
    const committed = await commit(seen);
    expect(committed.op).toMatchObject({ kind: 'swivel', via: 'edge', direction: 'valley', swivel: 'inside' });
    expect(committed.fingerprint).toBe(stored.expect);
  });

  it('commits the open swivel with the folder’s way left at Mountain by another fold: only valley lands, so valley is taken', async () => {
    const stored = storedSwivel('swivel-on-edge.osf');
    const { tools, index, seen } = await squashWithSwivel();
    await act(async () => {
      tools.setVertexDirection('mountain');
      await settle();
    });
    await threeClicks(seen, index, stored);
    const step = await until(() => previewed(seen, 'open'), 'the open preview');
    expect(step.op).toMatchObject({ direction: 'valley' });
    expect(foldVertexWindowView(tools.store.getState(), seen.current!.preview)).toMatchObject({
      swivelKind: 'open',
      swivelKinds: ['open', 'inside'],
    });
    const committed = await commit(seen);
    expect('swivel' in committed.op).toBe(false);
    expect(committed.fingerprint).toBe(stored.expect);
  });

  it('commits a swivel at a free pivot, Option held, as swivel-fold.osf stores its first branch: no Kind to choose', async () => {
    const example = opened('swivel-fold.osf');
    const stored = stepAt(example, 1);
    if (stored.op.kind !== 'swivel' || !('pivot' in stored.op)) throw new Error('step 2 is a swivel at a pivot');
    // The precreased diagonal on screen: the file's first step.
    const document = { ...example, steps: example.steps.slice(0, 1) };
    const precrease = stepAt(document, 0);
    const reader = withFoldCursor(initialFoldReaderState(document.id), document, precrease.id);
    useWorkspaceStore.getState().installFoldSequences([{ document, readOnlyRaw: null }], reader);
    await until(() => snapshot().cursor === precrease.id && cursor().status === 'ok' && cursor().summary, 'the precrease');
    const index = await shownPickIndex(session);
    const tools = createFoldTools();
    tools.selectTool('swivel');
    const seen: { current: Seen | null } = { current: null };
    await act(async () => {
      root.render(<Canvas session={session} tools={tools} view={{ index } as FoldStateView} seenRef={seen} />);
      await settle();
    });
    // On the crease-pattern pane, in sheet units: the pivot with Option held, the bottom edge, the diagonal.
    const [px, py] = stored.op.pivot;
    syncHeldModifiersFromEvent({ ctrlKey: false, altKey: true, shiftKey: false, metaKey: false });
    const pivot = seen.current!.verbs.hitTest('crease-pattern', { x: px, y: py }, RADII);
    clearHeldModifiers();
    expect(pivot?.pick).toMatchObject({ kind: 'point', sheet: [px, py] });
    await act(async () => {
      seen.current!.verbs.pick(pivot);
      await settle();
    });
    const reach = await until(() => readyReach(seen), 'the reach');
    const edge = lineThrough(index, stored.op.edge);
    const line = stored.op.target.via === 'crease' ? lineThrough(index, stored.op.target.at) : -1;
    expect(reach.targets.get(edge)?.has(line)).toBe(true);
    for (const at of [{ x: 0.5, y: 0.002 }, { x: 0.5, y: 0.5 }]) {
      const hit = seen.current!.verbs.hitTest('crease-pattern', at, RADII);
      expect(hit?.pick?.kind).toBe('segment');
      await act(async () => {
        seen.current!.verbs.pick(hit);
        await settle();
      });
    }
    const step = await until(() => seen.current?.preview.step, 'the preview');
    expect(step.op).toEqual(stored.op);
    const window = foldVertexWindowView(tools.store.getState(), seen.current!.preview);
    expect(window?.onFold).toBeUndefined();
    expect(window?.swivelKinds).toBeUndefined();
    const committed = await commit(seen);
    expect(committed.op).toEqual(stored.op);
    expect(committed.fingerprint).toBe(stored.expect);
  });

  it('commits the open swivel again after Inside was chosen and taken back', async () => {
    const stored = storedSwivel('swivel-on-edge.osf');
    const { index, seen } = await squashWithSwivel();
    await threeClicks(seen, index, stored);
    await until(() => previewed(seen, 'open'), 'the open preview');
    await act(async () => {
      seen.current?.verbs.setSwivelKind('inside');
      await settle();
    });
    await until(() => previewed(seen, 'inside'), 'the inside preview');
    await act(async () => {
      seen.current?.verbs.setSwivelKind('open');
      await settle();
    });
    await until(() => previewed(seen, 'open'), 'the open preview again');
    const committed = await commit(seen);
    expect('swivel' in committed.op).toBe(false);
    expect(committed.fingerprint).toBe(stored.expect);
  });
});
