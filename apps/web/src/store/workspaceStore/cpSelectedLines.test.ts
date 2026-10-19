import { describe, expect, it } from 'vitest';
import { SEG_ATTR_STRIDE, type CpGeometryTransport } from '../../engine/oristudioCpGeometry';
import type {
  OristudioCpCommandResult,
  OristudioCpDocumentState,
  OristudioCpLineSegment,
} from '../../engine/oristudioCpTypes';
import { createStarterOristudioCpDocument } from '../../lib/oristudioCpStarterDocument';
import { documentStateAfterSelection, lineSelectionOf, mirrorSelectedLines } from './cpSelectedLines';

function line(y: number, selected = 0): OristudioCpLineSegment {
  return {
    a: { x: 0, y },
    b: { x: 1, y },
    active: 'Inactive0',
    color: 'Red1',
    selected,
    customized: 0,
    customized_color: { red: 0, green: 0, blue: 0 },
  };
}

/** A document state with these flags on its snapshot and in its geometry. */
function stateWith(flags: number[]): OristudioCpDocumentState {
  const starter = createStarterOristudioCpDocument('case');
  const segAttr = new Int32Array(flags.length * SEG_ATTR_STRIDE);
  flags.forEach((flag, index) => {
    segAttr[index * SEG_ATTR_STRIDE + 2] = flag;
  });
  return {
    handle: 1,
    loadSerial: 1,
    document: {
      ...starter,
      crease_pattern: {
        ...starter.crease_pattern,
        line_segments: flags.map((flag, index) => line(index, flag)),
      },
    },
    geometry: { segAttr } as unknown as CpGeometryTransport,
    summary: {
      title: 'case',
      line_segments: flags.length,
      circles: 0,
      points: 0,
      aux_line_segments: 0,
      texts: 0,
      can_save_as_cp: true,
      is_empty: false,
    },
    source: { format: 'cp', filename: 'case.cp', path: null },
    operationDescriptors: [],
    lastCommandResult: null,
  };
}

const lines = (ids: number[], values = ids.map(() => 2)) => ({
  ids: Uint32Array.from(ids),
  values: Int32Array.from(values),
});

const snapshotFlags = (state: OristudioCpDocumentState) =>
  state.document.crease_pattern.line_segments.map((segment) => segment.selected);
const geometryFlags = (state: OristudioCpDocumentState) =>
  Array.from(state.geometry?.segAttr ?? []).filter((_, at) => at % SEG_ATTR_STRIDE === 2);

describe('mirrorSelectedLines', () => {
  it('writes the change into the same snapshot and geometry, value for value', () => {
    const state = stateWith([2, 0, 1, 0]);
    const segments = state.document.crease_pattern.line_segments;
    const segAttr = state.geometry?.segAttr;

    mirrorSelectedLines(state, lines([1, 3], [2, 1]), lines([3, 4], [1, 2]));

    expect(snapshotFlags(state)).toEqual([0, 0, 1, 2]);
    expect(geometryFlags(state)).toEqual([0, 0, 1, 2]);
    expect(state.document.crease_pattern.line_segments).toBe(segments);
    expect(state.geometry?.segAttr).toBe(segAttr);
  });

  it('leaves alone an id the snapshot does not have', () => {
    const state = stateWith([0, 0]);
    mirrorSelectedLines(state, lines([]), lines([2, 7]));
    expect(snapshotFlags(state)).toEqual([0, 2]);
    expect(geometryFlags(state)).toEqual([0, 2]);
  });
});

describe('documentStateAfterSelection', () => {
  it('keeps the snapshot it started on and carries the command result', async () => {
    const state = stateWith([0, 0, 0]);
    const result: OristudioCpCommandResult = {
      operation: 'CreaseSelect',
      status: 'OracleTested',
      diagnostics: [],
    };
    const next = await documentStateAfterSelection(state, state, lines([]), lines([2]), result);
    expect(next.document).toBe(state.document);
    expect(next.geometry).toBe(state.geometry);
    expect(next.lastCommandResult).toBe(result);
    expect(snapshotFlags(next)).toEqual([0, 2, 0]);
  });
});

describe('lineSelectionOf', () => {
  it('is the store selection of exactly those lines', () => {
    expect(lineSelectionOf(lines([2, 5]))).toMatchObject({ lines: [2, 5], points: [], circles: [] });
  });
});
