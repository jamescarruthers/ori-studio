import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { trackDiagramPlacementsReflowed } from '../../analytics/trackDiagram';
import { useWorkspaceStore } from '../../store/workspaceStore';

/** One reflow toast at a time: a page's packing adopted after the edit that re-packed it updates the edit's own. */
const REFLOW_TOAST = 'diagram-placements-reflowed';

// A pane can remount after a layout switch: a committed edit is announced only once.
let highestNonce = 0;
export function usePlacementReflowNotice(): void {
  const { t } = useTranslation();
  const settled = useWorkspaceStore((state) => state.diagramPlacesSettled);
  useEffect(() => {
    if (!settled || !settled.count || settled.nonce <= highestNonce) return;
    highestNonce = settled.nonce;
    // Each time frames are sent home, those it sent: an adoption's after its edit's, never the edit's again.
    trackDiagramPlacementsReflowed(settled.added);
    const loadId = useWorkspaceStore.getState().diagramLoadId;
    const { entry } = settled;
    toast.message(
      t('toasts:diagram.placementsReflowed', 'Moved steps returned to automatic placement: {{count}}', {
        count: settled.count,
      }),
      {
        id: REFLOW_TOAST,
        // Frames sent home as a diagram opened went with no edit to undo; said outright, as a toast updated keeps
        // what it is not told.
        action:
          entry !== null
            ? {
                label: t('common:actions.undo', 'Undo'),
                onClick: () => {
                  const state = useWorkspaceStore.getState();
                  if (state.diagramLoadId === loadId && state.diagramHistory.past.at(-1) === entry) state.undoDiagram();
                },
              }
            : undefined,
      },
    );
  }, [settled, t]);
}
