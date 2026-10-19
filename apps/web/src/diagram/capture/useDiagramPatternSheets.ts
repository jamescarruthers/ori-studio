import { useMemo } from 'react';
import { sheetRegions, type CpSheetRegion } from '../../cp-workspace/sheets/cpSheetRegions';
import { linesSheetThumbnail } from '../../cp-workspace/sheets/linesSheetThumbnail';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramStep } from '../document/diagramDocument';
import { sourceSheet } from './linkStatus';
import { useCpSheetIndexState } from '../../cp-workspace/sheets/useCpSheetIndexState';

/** One pattern a step can be linked to: a sheet of the open crease pattern. */
export interface DiagramPatternSheet {
  sheet: CpSheetRegion;
  thumbnail: SheetThumbnail | null;
}

export type DiagramPatternSheets =
  | { status: 'no-pattern' }
  | { status: 'pending' }
  | { status: 'failed' }
  | {
      status: 'ready';
      sheets: readonly DiagramPatternSheet[];
      /** The index the sheets are of: what a linked step's own sheet is found in. */
      index: CpSheetIndex;
    };

/** What the picker's sheets are while no picker is open: not worked out. */
const NOT_WANTED: DiagramPatternSheets = { status: 'pending' };

/**
 * The patterns of the open crease pattern, for the pattern picker: the sheets
 * of the index every link is made in (D3), each drawn from its own lines as
 * the References rail draws one. Worked out only while `wanted` — the Step
 * pane asks whenever its step is selected, and drawing every sheet for a
 * picker no one opened is work for nothing; on a 204-sheet canvas, drawing
 * them from faces once froze each selection for over a minute.
 */
export function useDiagramPatternSheets(wanted: boolean): DiagramPatternSheets {
  const state = useCpSheetIndexState(wanted);
  const document = useWorkspaceStore((store) => store.oristudioCpDocument?.document ?? null);
  return useMemo(() => {
    if (!wanted) return NOT_WANTED;
    if (state.status !== 'ready') return state;
    return {
      status: 'ready',
      sheets: sheetRegions(state.index).map((sheet) => ({
        sheet,
        thumbnail: document ? linesSheetThumbnail(document, sheet.lineIds) : null,
      })),
      index: state.index,
    };
  }, [wanted, state, document]);
}

/**
 * The pattern a region-linked step shows, among these — found as its status
 * finds it, wherever its sheet is now (`stepSheet`); null for any other step,
 * or one whose pattern is gone.
 */
export function linkedSheet(
  step: DiagramStep,
  sheets: readonly DiagramPatternSheet[],
  document: OristudioCpDocumentSnapshot | null,
  index: CpSheetIndex
): DiagramPatternSheet | null {
  if (step.source?.kind !== 'cp') return null;
  const sheet = sourceSheet(step.source, document, index);
  return sheet ? (sheets.find((candidate) => candidate.sheet === sheet) ?? null) : null;
}
