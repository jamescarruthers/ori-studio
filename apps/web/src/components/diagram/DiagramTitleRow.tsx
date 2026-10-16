import { useTranslation } from 'react-i18next';
import { titleBlockDefaultWords } from '../../diagram/document/titleBlockWords';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { TextAreaRow } from '../ui/fieldRows';

/**
 * The diagram's title, the first row of the Page pane's Header & footer (Zach,
 * 2026-10-15; until then a field in the Diagram's header). The title block
 * and the title tab print it and exports are named after it, so it is here
 * whether the block is on or off. Before a diagram exists it shows the title
 * the first edit will make it with. One line, committed as it is typed; a
 * sitting at it is one undo step (`setDiagramTitle`'s session).
 */
export function DiagramTitleRow() {
  const { t } = useTranslation();
  const title = useWorkspaceStore((state) => state.diagram?.title) ?? titleBlockDefaultWords(t).title;
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const loadId = useWorkspaceStore((state) => state.diagramLoadId);
  return (
    <TextAreaRow
      // One field per diagram: a draft never carries over to the one that replaces it.
      key={loadId}
      label={t('panels:diagram.pagePane.diagramTitle', 'Title')}
      help={t(
        'panels:diagram.pagePane.diagramTitleHelp',
        'The title block and the title tab print it, and exports are named after it.'
      )}
      value={title}
      rows={1}
      singleLine
      disabled={readOnly}
      onCommit={(value, session) => useWorkspaceStore.getState().setDiagramTitle(value, { loadId, session })}
    />
  );
}
