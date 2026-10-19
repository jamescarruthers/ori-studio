import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isInlineSimulationStale } from './inlineSimulation';
import type { InlineSimulation } from './inlineSimulation';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { foldedSourceBounds, foldedSourceFingerprint, cpLinesByIds, reselectFoldableLineIds }
  from '../folded/foldedFigureStaleness';
import {
  getInlineSimulationFoldPercent,
  getInlineSimulationSource,
  publishInlineSimulationFold,
  setInlineSimulationSource,
  subscribeInlineSimulationSources,
} from './inlineSimulationRuntime';

/**
 * One sheet's fold artifacts, as `ensureCpSheetSimulationArtifacts` gives them
 * for the square below. Without a stand-in, building them needs a kernel jsdom
 * has not got, hydration bails at its first guard, and every assertion below
 * passes for having done nothing at all.
 *
 * `scale` exists because a region's boundary — its identity for resolution —
 * is expressed in the *fold's* coordinate space. Artifacts from the kernel
 * document are in its own 400-space; whole-canvas ones sitting in the store
 * just after a file load were observed in a unit square, and hydration once
 * reused them: no saved boundary matched anything, and every restored window
 * was a permanently empty frame. They are seeded below to prove they are not
 * read.
 */
function artifactsForSquare(scale = 1) {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const segment = {
    id: 0,
    faceIndices: [0],
    boundary: [[at(-200, -200), at(200, -200), at(200, 200), at(-200, 200)]],
    bounds: {
      minX: -200 * scale, minY: -200 * scale,
      maxX: 200 * scale, maxY: 200 * scale,
    },
  };
  return {
    fold: {
      vertices_coords: [
        [-200 * scale, -200 * scale], [200 * scale, -200 * scale],
        [200 * scale, 200 * scale], [-200 * scale, 200 * scale],
      ],
      edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
      edges_assignment: ['B', 'B', 'B', 'B'],
      faces_vertices: [[0, 1, 2, 3]],
    },
    segments: [segment],
  } as never;
}

/** The sheet index of the square: one sheet, holding its four lines. */
function squareIndex() {
  return new CpSheetIndex({
    bounds: new Float64Array([-200, -200, 200, 200]),
    outlineOffsets: new Uint32Array([0, 4]),
    outlineCoords: new Float64Array([-200, -200, 200, -200, 200, 200, -200, 200]),
    lineCounts: new Uint32Array([4]),
    lineSheet: new Int32Array([0, 0, 0, 0]),
  });
}

// The engine's side, stood in for: the index, and the one sheet's mesh.
vi.mock('../sheets/cpSheetIndex', () => ({
  ensureCpSheetIndex: vi.fn(async () => squareIndex()),
  peekCpSheetIndex: vi.fn(() => squareIndex()),
}));
vi.mock('../sheets/cpSheetArtifacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sheets/cpSheetArtifacts')>()),
  ensureCpSheetArtifacts: vi.fn(async () => artifactsForSquare()),
  ensureCpSheetSimulationArtifacts: vi.fn(async () => artifactsForSquare()),
}));

/** Whole-canvas builds, counted: none should happen. */
const wholeCanvas = { refreshes: 0, ensures: 0 };

/**
 * The store as a load leaves it: the windows and the document, and whole-canvas
 * artifacts in the unit space a load leaves behind — so a hydration that read
 * them instead of the sheet's own would resolve nothing and these tests fail.
 */
function seedArtifacts(state: Record<string, unknown>) {
  return {
    ...state,
    foldArtifacts: artifactsForSquare(1 / 400),
    refreshFoldArtifacts: async () => {
      wholeCanvas.refreshes += 1;
      return artifactsForSquare();
    },
    ensureFoldArtifacts: async () => {
      wholeCanvas.ensures += 1;
      return artifactsForSquare();
    },
  } as never;
}

/** The store mid-session: the same, the whole-canvas artifacts in its own space. */
function midSessionArtifacts(state: Record<string, unknown>) {
  return { ...(seedArtifacts(state) as Record<string, unknown>), foldArtifacts: artifactsForSquare() } as never;
}

function line(ax: number, ay: number, bx: number, by: number, color = 'Red1') {
  return {
    a: { x: ax, y: ay }, b: { x: bx, y: by },
    active: 'Inactive0', color, selected: 0, customized: 0,
    customized_color: { red: 0, green: 0, blue: 0 },
  } as never;
}

function doc(lines: ReturnType<typeof line>[]): OristudioCpDocumentSnapshot {
  return { crease_pattern: { line_segments: lines, points: [], circles: [] } } as never;
}

const SQUARE = [
  line(-200, -200, 200, -200),
  line(200, -200, 200, 200),
  line(200, 200, -200, 200),
  line(-200, 200, -200, -200),
];

/** A window recorded against `document`, exactly as saving would have written it. */
function savedWindow(document: OristudioCpDocumentSnapshot): InlineSimulation {
  const bounds = foldedSourceBounds(
    cpLinesByIds(document, SQUARE.map((_, i) => i + 1))
  );
  return {
    id: 'inline-sim-1',
    box: { center: { x: 0, y: 0 }, width: 400, height: 400, rotation: 0 },
    z: 1,
    view: { yaw: 0, pitch: 0, zoom: 1 },
    sourceBoundary: [[
      { x: -200, y: -200 }, { x: 200, y: -200 },
      { x: 200, y: 200 }, { x: -200, y: 200 },
    ]],
    sourceBounds: bounds,
    sourceFingerprint: foldedSourceFingerprint(
      cpLinesByIds(document, reselectFoldableLineIds(document, bounds))
    ),
    segmentIdHint: 0,
  };
}

beforeEach(() => {
  useWorkspaceStore.setState({ oristudioCpInlineSimulations: [], oristudioCpDocument: null });
  wholeCanvas.refreshes = 0;
  wholeCanvas.ensures = 0;
});

describe('provenance across a load', () => {
  it('reports stale when the document moved on since the window was saved', async () => {
    // The trap this exists for. Rehydration rebuilds each window's fold, and it
    // is one line away from also recomputing `sourceFingerprint` from the
    // document it just opened — which would make every loaded window read as up
    // to date forever, however far the creases had drifted. It fails silently
    // and in the reassuring direction, so it is asserted rather than reviewed.
    const atSaveTime = doc(SQUARE);
    const saved = savedWindow(atSaveTime);

    // The file's creases changed after that window was recorded.
    const nowOpened = doc([...SQUARE.slice(0, 3), line(-200, 200, -200, -199)]);
    useWorkspaceStore.setState(seedArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document: nowOpened },
    }));

    const hydrated = await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations();
    // Asserted, not assumed: if hydration bails early every check below is
    // vacuous, which is exactly how this test first passed against a version
    // that did recompute the fingerprint.
    expect(hydrated).toBe(1);
    expect(getInlineSimulationSource(saved.id)).not.toBeNull();

    const restored = useWorkspaceStore.getState().oristudioCpInlineSimulations[0]!;
    expect(restored.sourceFingerprint).toBe(saved.sourceFingerprint);
    expect(isInlineSimulationStale(nowOpened, restored)).toBe(true);
  });

  it('leaves an unchanged document reading as fresh', () => {
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    expect(isInlineSimulationStale(document, saved)).toBe(false);
  });

  it('does nothing when there is no document to resolve against', async () => {
    useWorkspaceStore.setState({
      oristudioCpInlineSimulations: [savedWindow(doc(SQUARE))],
      oristudioCpDocument: null,
    });
    expect(await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations()).toBe(0);
  });

  it('keeps a window it cannot resolve, rather than dropping it', async () => {
    // Placement is something the user chose. Losing it because a region merged
    // is worse than a window that cannot draw until refreshed — and re-pointing
    // it at the nearest region would silently simulate something else.
    const document = doc(SQUARE);
    // A different rim, which is what "the region merged or split" looks like:
    // the boundary is the identity, so changing bounds alone would still match.
    const orphan: InlineSimulation = {
      ...savedWindow(document),
      sourceBoundary: [[
        { x: 9000, y: 9000 }, { x: 9100, y: 9000 }, { x: 9100, y: 9100 },
      ]],
      segmentIdHint: 99,
    };
    useWorkspaceStore.setState(seedArtifacts({
      oristudioCpInlineSimulations: [orphan],
      oristudioCpDocument: { document },
    }));

    expect(await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations()).toBe(0);
    expect(useWorkspaceStore.getState().oristudioCpInlineSimulations).toHaveLength(1);
  });
});

/**
 * Undo restores a deleted window's descriptor; its fold has to come back too, or
 * the window returns as an empty frame.
 *
 * Rebuilt rather than retained: a triangulated segment fold measures 240KB at
 * 500 vertices and 2.9MB at 8,000, so holding one per undoable deletion would
 * keep tens to hundreds of MB alive for windows the user threw away.
 */
describe('restoring the fold of a window undo brought back', () => {
  /** Delete `id` the way the store does, so its fold is genuinely gone. */
  function deleteWindow(id: string) {
    useWorkspaceStore.getState().removeOristudioCpInlineSimulation(id);
    expect(getInlineSimulationSource(id)).toBeNull();
  }

  it('rebuilds a fold that was dropped on delete', async () => {
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    useWorkspaceStore.setState(midSessionArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document },
    }));
    await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations();

    deleteWindow(saved.id);
    // What undo does: put the descriptor back, then ask for the fold.
    useWorkspaceStore.setState({ oristudioCpInlineSimulations: [saved] });

    expect(
      await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources()
    ).toBe(1);
    expect(getInlineSimulationSource(saved.id)).not.toBeNull();
  });

  it('brings the window back where its fold was, not snapped to flat', async () => {
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    useWorkspaceStore.setState(midSessionArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document },
    }));
    publishInlineSimulationFold(saved.id, 62);

    deleteWindow(saved.id);
    useWorkspaceStore.setState({ oristudioCpInlineSimulations: [saved] });
    await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources();

    expect(getInlineSimulationFoldPercent(saved.id)).toBe(62);
  });

  it('leaves saved provenance alone, so a stale window is still stale', async () => {
    // The same trap hydration has: rebuilding the fold is one line away from
    // also re-baselining the fingerprint, which would quietly mark a window the
    // user deleted-and-undid as up to date.
    const atSaveTime = doc(SQUARE);
    const saved = savedWindow(atSaveTime);
    const nowOpened = doc([...SQUARE.slice(0, 3), line(-200, 200, -200, -199)]);
    useWorkspaceStore.setState(midSessionArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document: nowOpened },
    }));

    deleteWindow(saved.id);
    useWorkspaceStore.setState({ oristudioCpInlineSimulations: [saved] });
    await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources();

    const restored = useWorkspaceStore.getState().oristudioCpInlineSimulations[0]!;
    expect(restored.sourceFingerprint).toBe(saved.sourceFingerprint);
    expect(isInlineSimulationStale(nowOpened, restored)).toBe(true);
  });

  it('does no work when every window already has its fold', async () => {
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    useWorkspaceStore.setState(midSessionArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document },
    }));
    await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations();

    expect(
      await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources()
    ).toBe(0);
  });

  it('never meshes the whole canvas: only the window\'s sheet', async () => {
    // A window is over one sheet, and on a canvas of hundreds a whole-canvas
    // mesh took half a minute; the delete-then-undo path least of all should pay it.
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    useWorkspaceStore.setState(midSessionArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document },
    }));
    await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations();

    deleteWindow(saved.id);
    useWorkspaceStore.setState({ oristudioCpInlineSimulations: [saved] });
    expect(
      await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources()
    ).toBe(1);
    expect(wholeCanvas).toEqual({ refreshes: 0, ensures: 0 });
  });

  it('ignores whole-canvas artifacts a file load left behind', async () => {
    // A load leaves artifacts normalised to a unit square; a delete-then-undo
    // straight afterwards that resolved against them would restore a window
    // that could never draw. The sheet's own mesh is in the document's space.
    const document = doc(SQUARE);
    const saved = savedWindow(document);
    useWorkspaceStore.setState(seedArtifacts({
      oristudioCpInlineSimulations: [saved],
      oristudioCpDocument: { document },
    }));

    deleteWindow(saved.id);
    useWorkspaceStore.setState({ oristudioCpInlineSimulations: [saved] });

    expect(
      await useWorkspaceStore.getState().restoreOristudioCpInlineSimulationSources()
    ).toBe(1);
    expect(getInlineSimulationSource(saved.id)).not.toBeNull();
  });
});

describe('telling the canvas a fold has arrived', () => {
  it('notifies when a source is set', () => {
    // The layer reads its fold from the side table. Creating a window sets the
    // source *before* the store write that re-renders, so a plain read works;
    // loading cannot, because the descriptors have to land first and the folds
    // are rebuilt afterwards without touching the store. Without a notification
    // the layer looked once, found nothing, and a restored window stayed an
    // empty frame — which is exactly what shipped, and what nothing caught.
    let woken = 0;
    const stop = subscribeInlineSimulationSources(() => { woken += 1; });
    setInlineSimulationSource('sim-notify', { fold: {} as never, modelKey: 'k' });
    expect(woken).toBe(1);
    expect(getInlineSimulationSource('sim-notify')).not.toBeNull();
    stop();
  });

  it('wakes the canvas for every window hydration restores', async () => {
    const document = doc(SQUARE);
    useWorkspaceStore.setState(seedArtifacts({
      oristudioCpInlineSimulations: [savedWindow(document)],
      oristudioCpDocument: { document },
    }));

    let woken = 0;
    const stop = subscribeInlineSimulationSources(() => { woken += 1; });
    const hydrated = await useWorkspaceStore.getState().hydrateOristudioCpInlineSimulations();
    stop();

    expect(hydrated).toBe(1);
    expect(woken).toBe(1);
  });

  it('stops notifying once unsubscribed', () => {
    let woken = 0;
    const stop = subscribeInlineSimulationSources(() => { woken += 1; });
    stop();
    setInlineSimulationSource('sim-gone', { fold: {} as never, modelKey: 'k' });
    expect(woken).toBe(0);
  });
});
