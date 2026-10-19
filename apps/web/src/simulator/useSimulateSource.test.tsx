import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { regionReferenceFor } from '../cp-workspace/regions/regionReference';
import { sheetRegions } from '../cp-workspace/sheets/cpSheetRegions';
import { twoSheetDocument, twoSheetFold, twoSheetIndex } from '../cp-workspace/sheets/twoSheetsTestFixture';
import { CpSheetIndex } from '../engine/oristudioCpSheetIndex';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useSimulateSource, type SimulateSource } from './useSimulateSource';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The engine's side, stood in for: the index, and one sheet's mesh at a time.
const index = vi.hoisted(() => ({ current: null as CpSheetIndex | null }));
vi.mock('../cp-workspace/sheets/useCpSheetIndexState', () => ({
  useCpSheetIndexState: () =>
    index.current ? { status: 'ready', index: index.current } : { status: 'pending' },
}));
const built = vi.hoisted(() => ({ sheets: [] as number[] }));
vi.mock('../cp-workspace/sheets/cpSheetArtifacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cp-workspace/sheets/cpSheetArtifacts')>();
  return {
    ...actual,
    ensureCpSheetSimulationArtifacts: vi.fn(async (_document: unknown, sheet: number) => {
      built.sheets.push(sheet);
      return actual.sheetArtifactsFromFold(twoSheetFold(sheet), sheet);
    }),
  };
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const seen: { source: SimulateSource | null } = { source: null };

function Probe() {
  const source = useSimulateSource();
  useLayoutEffect(() => {
    seen.source = source;
  });
  return null;
}

async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe />));
}

const wholeCanvas = { ensures: 0 };

beforeEach(() => {
  index.current = twoSheetIndex();
  built.sheets = [];
  wholeCanvas.ensures = 0;
  useWorkspaceStore.setState({
    oristudioCpDocument: { document: twoSheetDocument() },
    oristudioCpSimulateSheet: null,
    foldArtifacts: null,
    ensureFoldArtifacts: async () => {
      wholeCanvas.ensures += 1;
      return null;
    },
  } as never);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** The x extent of a fold's vertices: which square it is of. */
function xs(source: SimulateSource | null): [number, number] {
  const coords = (source?.fold?.vertices_coords ?? []).map((coord) => coord[0] ?? 0);
  return [Math.min(...coords), Math.max(...coords)];
}

describe('useSimulateSource, an editable pattern', () => {
  it('lists its sheets, sized as the References rail sizes them, and folds the first', async () => {
    await mount();
    expect(seen.source?.patterns.map((pattern) => [pattern.id, pattern.size])).toEqual([
      [0, '5 creases'],
      [1, '5 creases'],
    ]);
    expect(seen.source?.patterns[0]?.thumbnail?.strokes).toHaveLength(5);
    expect(seen.source?.status).toBe('ready');
    expect(seen.source?.activeId).toBe(0);
    expect(xs(seen.source)).toEqual([0, 1]);
  });

  it('meshes only the sheet it shows, never the whole canvas', async () => {
    await mount();
    expect(built.sheets).toEqual([0]);
    await act(async () => seen.source?.select(1));
    expect(built.sheets).toEqual([0, 1]);
    expect(xs(seen.source)).toEqual([2, 3]);
    expect(wholeCanvas.ensures).toBe(0);
  });

  it('keeps the sheet it shows by outline, through a renumbering', async () => {
    // The right square chosen, then an index in which it comes first.
    const [, right] = sheetRegions(twoSheetIndex());
    useWorkspaceStore.setState({ oristudioCpSimulateSheet: regionReferenceFor(right!) });
    await mount();
    expect(xs(seen.source)).toEqual([2, 3]);
  });

  it('falls back to the whole canvas for a pattern with no closed border', async () => {
    index.current = new CpSheetIndex({
      bounds: new Float64Array(),
      outlineOffsets: new Uint32Array([0]),
      outlineCoords: new Float64Array(),
      lineCounts: new Uint32Array(),
      lineSheet: new Int32Array(10).fill(-1),
    });
    await mount();
    expect(seen.source?.patterns).toEqual([]);
    expect(built.sheets).toEqual([]);
    expect(wholeCanvas.ensures).toBe(1);
  });
});
