import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiagramRepackVia } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramPageCommand } from '../actions/diagramPageActions';
import { bindDiagramPageActions } from './repackActions';
import { useCurrentDiagramPage } from './useCurrentDiagramPage';

/**
 * The current page's verbs (`diagramPageActions.ts`) for a pane, bound to
 * the store and counted as pressed `via` it: Re-pack Page on the page the
 * user last acted on (`useCurrentDiagramPage`), and Re-pack All Pages. Null
 * on a grid, and with no diagram.
 */
export function useDiagramPageActions(via: DiagramRepackVia): {
  repackPage: DiagramPageCommand | null;
  repackAll: DiagramPageCommand | null;
} {
  const { t } = useTranslation();
  const document = useWorkspaceStore((state) => state.diagram);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const current = useCurrentDiagramPage();
  return useMemo(() => {
    const actions =
      document && current ? bindDiagramPageActions(document, readOnly, current.index, current.page, t, via) : [];
    return {
      repackPage: actions.find((action) => action.id === 'repack-page') ?? null,
      repackAll: actions.find((action) => action.id === 'repack-all') ?? null,
    };
  }, [document, readOnly, current, t, via]);
}
