import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import type { FoldArtifacts } from '../../engine/types';
import type { DiagramStep } from '../document/diagramDocument';
import { sourceSheet } from './linkStatus';
import type { CpPatternSheet as DiagramPatternSheet } from '../../cp-workspace/sheets/useCpPatternSheets';
export { useCpPatternSheets as useDiagramPatternSheets } from '../../cp-workspace/sheets/useCpPatternSheets';
export type { CpPatternSheet as DiagramPatternSheet, CpPatternSheets as DiagramPatternSheets } from '../../cp-workspace/sheets/useCpPatternSheets';

/**
 * The pattern a region-linked step shows, among these — found as its status
 * finds it, wherever its sheet is now (`stepSheet`); null for any other step,
 * or one whose pattern is gone.
 */
export function linkedSheet(
  step: DiagramStep,
  sheets: readonly DiagramPatternSheet[],
  document: OristudioCpDocumentSnapshot | null,
  artifacts: FoldArtifacts
): DiagramPatternSheet | null {
  if (step.source?.kind !== 'cp') return null;
  const segment = sourceSheet(step.source, document, artifacts);
  return segment ? (sheets.find((sheet) => sheet.segment === segment) ?? null) : null;
}
