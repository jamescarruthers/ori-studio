import { handleMenuAction } from '../../commands/menuActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramImportWayId } from '../actions/diagramImportWays';
import { fillStepFromFold, openFoldBrowser } from '../fold/foldBrowserActions';
import { fillStepFromReferences, openReferencesBrowser } from '../references/referencesBrowserActions';

/**
 * From File… on an empty step: the step import dialog, opened for that step,
 * which the Step pane shows meanwhile — its first step fills it and the rest
 * follow (D2), as From References… and From Fold… fill it. The dialog's code
 * loads when asked for, as File › Import Diagram Steps loads it.
 */
export async function importStepsInto(stepId: string): Promise<void> {
  useWorkspaceStore.getState().selectDiagramStep(stepId);
  const { useImportDialogStore } = await import('./importDialogStore');
  useImportDialogStore.getState().open([], undefined, stepId);
}

/**
 * A row of the Import menu (`diagramImportWays`) on the empty diagram: the
 * dialog or browser it names, adding steps by D2's insertion rule — File ›
 * Import Diagram Steps itself, for files.
 */
export function importInto(way: DiagramImportWayId): void {
  if (way === 'import-steps') void handleMenuAction('file.importDiagramSteps');
  else if (way === 'from-references') openReferencesBrowser();
  else openFoldBrowser();
}

/** A row of the Import menu on an empty step's card: each fills that step. */
export function importIntoStep(stepId: string, way: DiagramImportWayId): void {
  if (way === 'import-steps') void importStepsInto(stepId);
  else if (way === 'from-references') fillStepFromReferences(stepId);
  else fillStepFromFold(stepId);
}
