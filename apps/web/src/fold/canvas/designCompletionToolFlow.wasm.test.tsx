import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseNativeProjectFile } from '../../lib/nativeProjectFile';
import { foldSessionDocumentSource } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { initialFoldReaderState, withFoldCursor } from '../document/foldReaderState';
import { readFoldSequences } from '../document/foldSequenceFile';
import { createFoldSession, type FoldSession } from '../session/foldSession';
import { settle } from '../session/foldSession.fixtures';
import { selectFoldCursorNode } from '../session/foldSessionState';
import { createFoldTools } from '../tools/foldToolState';
import {
  clickPane, commitPreviewed, exampleStep, FOLD_FLOW_AVAILABLE, foldFlowBridge,
  FoldFlowCanvas, shownPickIndex, untilFlow, type FoldFlowSeen,
} from './foldToolFlow.fixtures';
import { foldPickIndex, sheetToScene, topSheetPointAt } from './foldPicking';
import type { FoldStateView } from './useFoldStateView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let session: FoldSession;
let host: HTMLDivElement;
let root: Root;
const cursor = () => selectFoldCursorNode(session.store.getState());

async function setup(name: string, count: number, tool: 'tuck' | 'inside-reverse') {
  const file = parseNativeProjectFile(readFileSync(resolve(process.cwd(), '../../tests/fixtures/fold-design-completion', `${name}.osf`), 'utf8'));
  const full = readFoldSequences(file.workspace.foldSequences)[0]!.document;
  const stored = exampleStep(full, count);
  const document = { ...full, steps: full.steps.slice(0, count) };
  const last = document.steps.at(-1)!.id;
  useWorkspaceStore.getState().installFoldSequences([{ document, readOnlyRaw: null }], withFoldCursor(initialFoldReaderState(document.id), document, last));
  await untilFlow(() => session.store.getState().cursor === last && cursor().status === 'ok', 'the saved prefix');
  const expected = await session.withCursor(async (engine, at) => {
    const result = await engine.step(at, stored.op, stored.choices);
    if (result.status !== 'ok') throw new Error(JSON.stringify(result));
    const hash = await engine.fingerprint(result.state);
    await engine.release([result.state]);
    return hash;
  });
  if (expected.status !== 'answered') throw new Error('no parent');
  const index = await shownPickIndex(session);
  const tools = createFoldTools();
  tools.selectTool(tool);
  tools.selectLineMode('free');
  const seen: { current: FoldFlowSeen | null } = { current: null };
  await act(async () => {
    root.render(<FoldFlowCanvas session={session} tools={tools} view={{ index } as FoldStateView} seenRef={seen} />);
    await settle();
  });
  return { tools, seen, stored, index, expected: expected.value };
}

describe.skipIf(!FOLD_FLOW_AVAILABLE)('flat design completion through the canvas tool pipeline', () => {
  beforeEach(async () => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
    session = createFoldSession({ document: foldSessionDocumentSource(useWorkspaceStore), runtime: await foldFlowBridge() });
    session.retain();
    await settle();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); session.dispose(); });

  it('selects both heart targets, previews their combined constraints, and commits the API-equivalent tuck', async () => {
    const { tools, seen, stored, expected } = await setup('heart', 9, 'tuck');
    if (stored.op.kind !== 'tuck' || stored.op.seed.scope !== 'depth') throw new Error('not a tuck');
    await clickPane(seen, { x: 0.15, y: 0.625 });
    await clickPane(seen, { x: 0.85, y: 0.625 });
    const seed = stored.op.seed;
    await act(async () => { tools.setSeed({ scope: 'depth', at: seed.at, scene: { x: 0.48, y: 0.9 }, choice: 1 }); await settle(); });
    const targets = await untilFlow(() => !!seen.current?.preview.tuck?.targets.length && seen.current.preview.tuck.targets, 'tuck targets');
    // The side triangles lie at the far left and right of the original sheet.
    const left = targets.find((t) => Math.abs(t.at[0] - 0.125) < 0.1);
    const right = targets.find((t) => Math.abs(t.at[0] - 0.875) < 0.1);
    if (!left || !right) throw new Error(`triangles missing: ${JSON.stringify(targets)}`);
    await act(async () => { tools.setTuckTarget(left.face); seen.current!.verbs.toggleTuckPinned(right.face); await settle(); });
    await untilFlow(() => seen.current?.preview.step?.op.kind === 'tuck' && seen.current.preview.step.op.additionalTargets?.length && seen.current.preview.landed, 'combined tuck preview')
    expect(seen.current!.preview.refused).toBeNull();
    expect(seen.current!.preview.tuck?.additional?.map((t) => t.face)).toEqual([right.face]);
    // Both target-constrained orders are valid, but only the tutorial order
    // exposes the lowered upper flap over the stationary bottom triangle.
    const exposesUpperFlap = () => {
      const scene = seen.current?.preview.landed?.scene;
      if (!scene) return false;
      const index = foldPickIndex(scene, null, []);
      return [0.4, 0.6].every((x) => {
        const sheet = topSheetPointAt(index, { x, y: 0.4 });
        return sheet && Math.abs(sheet[0] - x) < 1e-8 && Math.abs(sheet[1] - 0.85) < 1e-8;
      });
    };
    const count = seen.current!.preview.tuck!.orders.length;
    for (let k = 0; k < count && !exposesUpperFlap(); k++) {
      const before = seen.current!.preview.step!.key;
      await act(async () => { seen.current!.verbs.stepOrder(1); await settle(); });
      await untilFlow(() => seen.current?.preview.step?.key !== before && seen.current?.preview.landed, 'the next layer order');
    }
    expect(exposesUpperFlap()).toBe(true);
    const landed = await commitPreviewed(session, seen);
    expect(landed.op).toMatchObject({ kind: 'tuck', additionalTargets: [right.at] });
    expect(landed.fingerprint).toBe(expected);
  });

  it.each([8, 9])('commits swan reverse node %i with explicit Outside intent through the shared builder', async (count) => {
    const { tools, seen, stored, index, expected } = await setup('swan', count, 'inside-reverse');
    if (stored.op.kind !== 'outside-reverse' || stored.op.line.via !== 'free' || stored.op.seed.scope !== 'depth') throw new Error('not an outside reverse');
    const op = stored.op;
    await act(async () => {
      seen.current!.verbs.setReverseKind('outside');
      // Free picks retain the exact paper anchors; the same builder is used
      // after pointer picking, without nearby crease snapping changing the line.
      if (op.line.via !== 'free' || op.seed.scope !== 'depth') throw new Error('bad fixture');
      for (const sheet of op.line.through) {
        const scene = sheetToScene(index.scene, sheet);
        if (!scene) throw new Error('line misses paper');
        tools.pick({ kind: 'free', pane: 'folded', scene, sheet });
      }
      const scene = sheetToScene(index.scene, op.seed.at);
      if (!scene) throw new Error('seed misses paper');
      tools.setSeed({ scope: 'depth', at: op.seed.at, scene, choice: 1 });
      await settle();
    });
    const reverse = await untilFlow(() => !!seen.current?.preview.reverse?.ways.length && seen.current.preview.reverse, 'the openings');
    let central = -1;
    for (let k = 0; k < reverse.ways.length; k++) {
      if (reverse.ways.at(k)?.openings.every((o) => o.upper.length === o.lower.length)) { central = k; break; }
    }
    expect(central).toBeGreaterThanOrEqual(0);
    await act(async () => { tools.stepOpening(central, reverse.ways.length); await settle(); });
    await untilFlow(() => seen.current?.preview.landed, 'the outside preview');
    expect(seen.current!.preview.step?.op.kind).toBe('outside-reverse');
    if (count === 8) {
      await act(async () => { seen.current!.verbs.setReverseKind('inside'); await settle(); });
      const refused = await untilFlow(() => seen.current?.preview.refused, 'the explicit wrong kind refusal');
      expect(refused.refusal.code).toBe('reverse_kind_infeasible');
      expect(seen.current!.preview.step?.op.kind).toBe('inside-reverse');
      await act(async () => { seen.current!.verbs.setReverseKind('outside'); await settle(); });
      await untilFlow(() => seen.current?.preview.landed && !seen.current.preview.refused, 'the restored outside preview');
    }
    const committed = await commitPreviewed(session, seen);
    expect(committed.op.kind).toBe('outside-reverse');
    expect(committed.fingerprint).toBe(expected);
  });

});
