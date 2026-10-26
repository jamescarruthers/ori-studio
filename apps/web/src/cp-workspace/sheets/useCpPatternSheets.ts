import { useMemo } from 'react';
import { sheetRegions, type CpSheetRegion } from './cpSheetRegions';
import { linesSheetThumbnail } from './linesSheetThumbnail';
import type { SheetThumbnail } from './sheetThumbnail';
import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useCpSheetIndexState } from './useCpSheetIndexState';

/** One pattern a link can be made to: a sheet of the open crease pattern. */
export interface CpPatternSheet {
  sheet: CpSheetRegion;
  thumbnail: SheetThumbnail | null;
}

export type CpPatternSheets =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | {
      status: 'ready';
      sheets: readonly CpPatternSheet[];
      /** The index the sheets are of: what a linked step's own sheet is found in. */
      index: CpSheetIndex;
    };

/** What the sheets are while nothing wants them: not worked out. */
const NOT_WANTED: CpPatternSheets = { status: 'pending' };

/** Each crease pattern's sheets as last drawn, and the index they were drawn from. */
const drawnSheets = new WeakMap<
  OristudioCpDocumentSnapshot,
  { index: CpSheetIndex; sheets: readonly CpPatternSheet[] }
>();

/**
 * The sheets of `index` drawn from `document`'s lines, once for both: every
 * empty step's picker asks for the same drawing, and a step selected after
 * another should not draw it again.
 */
export function drawSheets(document: OristudioCpDocumentSnapshot, index: CpSheetIndex): readonly CpPatternSheet[] {
  const drawn = drawnSheets.get(document);
  if (drawn?.index === index) return drawn.sheets;
  const sheets = sheetRegions(index).map((sheet) => ({ sheet, thumbnail: linesSheetThumbnail(document, sheet.lineIds) }));
  drawnSheets.set(document, { index, sheets });
  return sheets;
}

/**
 * The patterns of the open crease pattern, for a picker — the Diagram's
 * pattern picker, Fold's Import CP: the sheets of the index every link is
 * made in (D3), each drawn from its own lines as the References rail draws
 * one. Worked out only while `wanted` — drawing every sheet for a picker no
 * one opened is work for nothing; on a 204-sheet canvas, drawing them from
 * faces once froze each selection for over a minute — and drawn once per
 * crease pattern however many pickers ask (`drawSheets`).
 */
export function useCpPatternSheets(wanted: boolean): CpPatternSheets {
  const state = useCpSheetIndexState(wanted);
  const document = useWorkspaceStore((store) => store.oristudioCpDocument?.document ?? null);
  return useMemo(() => {
    if (!wanted) return NOT_WANTED;
    if (state.status !== 'ready') return state;
    return {
      status: 'ready',
      sheets: document
        ? drawSheets(document, state.index)
        : sheetRegions(state.index).map((sheet) => ({ sheet, thumbnail: null })),
      index: state.index,
    };
  }, [wanted, state, document]);
}
