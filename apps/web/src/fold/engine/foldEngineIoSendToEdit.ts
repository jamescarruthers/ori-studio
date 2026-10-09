/**
 * Send to Edit for a Fold state (plan D10): the FOLD text the engine writes
 * (`FoldEngineIoCalls.sendToEdit`) as the payload Edit's import chokepoint
 * takes, `importAddOristudioCpText` — the path every other Send to Edit uses,
 * with its undo entry and its merge.
 *
 * Fold's precreases arrive as unassigned creases remembering their letter.
 * "Precreases as auxiliary lines" is the payload's existing
 * `unassignedAsAuxiliary` flag: Edit recolours them after the import, in the
 * same undo entry, and nothing else Fold sends is unassigned.
 *
 * Pure: no React, no store.
 */

import type { SendToEditPayload } from '../../designKinds/types';

export interface FoldSendToEditOptions {
  /** The undo label for the merge, already translated. */
  label: string;
  /** A `.fold` name for the payload; never sent anywhere as analytics. */
  filename: string;
  /** Send precreases as auxiliary lines rather than unassigned creases. */
  precreasesAsAux?: boolean;
}

export function foldSendToEditPayload(text: string, options: FoldSendToEditOptions): SendToEditPayload {
  return {
    text,
    format: 'fold',
    label: options.label,
    filename: options.filename,
    ...(options.precreasesAsAux ? { unassignedAsAuxiliary: true } : {}),
  };
}
