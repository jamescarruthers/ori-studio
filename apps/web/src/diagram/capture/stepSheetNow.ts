/**
 * Where a step's sheet is now, for a verb pressed on it: Open in Edit frames
 * it, Open in References opens on it. Found as its link status finds it
 * (`sourceSheet`), from the sheet index already built — a card that shows its
 * status has one — so a press never waits on it.
 */
import { peekCpSheetIndex } from '../../cp-workspace/sheets/cpSheetIndex';
import type { CpSheetRegion } from '../../cp-workspace/sheets/cpSheetRegions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramCpSource, DiagramReferencesSource } from '../document/diagramDocument';
import { sourceSheet } from './linkStatus';

/** The step's sheet where it is now, or null: gone, or the sheet index not built yet. */
export function stepSheetNow(source: DiagramCpSource | DiagramReferencesSource): CpSheetRegion | null {
  const document = useWorkspaceStore.getState().oristudioCpDocument?.document ?? null;
  return sourceSheet(source, document, peekCpSheetIndex(document));
}
