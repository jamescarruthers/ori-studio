import { useCallback, useMemo, useRef } from 'react';
import { trackDiagramPageSetupChanged } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DEFAULT_PAGE_SETUP } from '../document/diagramDocument';
import { hasTitleBlock, titleBlockFits } from './pagePlan';
import { titleBlockChoiceSource, titleBlockChoices, type TitleBlockChoices } from './titleBlockChoices';
import { setPageSetting } from './useDiagramPageSetup';

const NO_CHOICES: TitleBlockChoices = {
  model: { value: 'auto', autoNumber: null, steps: [] },
  pattern: { value: 'auto', autoNumber: null, steps: [] },
};

/**
 * The Page pane's Title block section's store bindings (AGENTS.md › Panel
 * components; `implementation-plans/diagram-title-block.md`, section 7): the
 * toggle, a page setting (`titleBlock`), and what the block shows — its model
 * and crease pattern, from the choices `titleBlockChoices` offers, and its
 * note (the pane's Byline until Phase 1c's rows). Each change is one undo
 * step and one count of which setting changed; the note's commits, at each
 * pause in typing, are one of each per sitting at its field.
 */
export function useDiagramTitleBlock() {
  const document = useWorkspaceStore((state) => state.diagram);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const loadId = useWorkspaceStore((state) => state.diagramLoadId);
  const page = document?.page ?? DEFAULT_PAGE_SETUP;
  const shown = hasTitleBlock(page);
  // Only while the selects are there to offer them: a file without the block pays nothing.
  const choices = useMemo(() => (document && shown ? titleBlockChoices(document) : NO_CHOICES), [document, shown]);
  /** The sitting at the note last counted. */
  const countedSession = useRef<number | null>(null);

  const setModel = useCallback((choice: string) => choose('model', choice), []);
  const setPattern = useCallback((choice: string) => choose('pattern', choice), []);
  const setNote = useCallback(
    (note: string, session: number) => {
      if (!useWorkspaceStore.getState().setDiagramTitleBlockContent({ note }, { loadId, session })) return;
      if (countedSession.current === session) return;
      countedSession.current = session;
      trackDiagramPageSetupChanged('title_block_byline');
    },
    [loadId]
  );

  return {
    readOnly,
    /** The diagram the byline's field types into: a field of its own for each. */
    loadId,
    /** Whether the first page has room for a block: a grid of one row has none (`titleBlockFits`). */
    fits: titleBlockFits(page),
    /** Whether the first page carries the block: on, and room for it. */
    shown,
    model: choices.model,
    pattern: choices.pattern,
    note: document?.titleBlockContent?.note ?? '',
    setEnabled,
    setModel,
    setPattern,
    setNote,
  };
}

/** Turn the first page's title block on or off, at the height it has. */
function setEnabled(enabled: boolean) {
  const { titleBlock } = useWorkspaceStore.getState().diagram?.page ?? DEFAULT_PAGE_SETUP;
  setPageSetting({ titleBlock: { ...titleBlock, enabled } }, 'title_block');
}

/** Set where a part of the block comes from, from the choice the Page pane offered. */
function choose(part: 'model' | 'pattern', choice: string) {
  const source = titleBlockChoiceSource(choice);
  if (!useWorkspaceStore.getState().setDiagramTitleBlockContent({ [part]: source })) return;
  trackDiagramPageSetupChanged(part === 'model' ? 'title_block_model' : 'title_block_pattern', {
    titleBlockChoice: source === 'auto' ? 'auto' : source.kind,
  });
}
