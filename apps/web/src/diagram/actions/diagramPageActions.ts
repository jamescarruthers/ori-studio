import type { TFunction } from 'i18next';

/**
 * The verbs a flow page offers (`implementation-plans/diagram-flow-packing.md`,
 * Decision 4), in the order every surface presents them: the Page pane's
 * Packing section, the Layers pane's page list, the notice that a step no
 * longer fits its place, and a page's context menu on the Pages view.
 *
 * `diagramActions.ts`'s shape: React-free and store-free, taking the page's
 * state plus bound callbacks and returning plain data, so the surfaces gate
 * and name each verb alike. A grid page offers none: it is never packed.
 */

export type DiagramPageActionId = 'repack-page' | 'repack-all';

export interface DiagramPageCommand {
  kind: 'command';
  id: DiagramPageActionId;
  label: string;
  disabled: boolean;
  /** Why it is disabled, for a tooltip or a menu row's hint. */
  hint?: string;
  run: () => void;
}

/** What the page verbs are gated on. */
export interface DiagramPageActionState {
  /** The diagram is laid out in the flow, whose pages are packed. */
  flow: boolean;
  /** The whole diagram came from a newer build and nothing may change it. */
  readOnly: boolean;
  /** The page holds a packed arrangement, which Re-pack Page lets go. */
  pageStored: boolean;
  /** Some page holds one, which Re-pack All Pages lets go. */
  anyStored: boolean;
}

export interface DiagramPageActionDeps {
  t: TFunction;
  /** Let the page's arrangement go, so the layout packs it afresh. */
  repackPage: () => void;
  /** Let every page's arrangement go. */
  repackAll: () => void;
}

export function buildDiagramPageActions(
  state: DiagramPageActionState,
  deps: DiagramPageActionDeps
): DiagramPageCommand[] {
  if (!state.flow) return [];
  const { t } = deps;
  const readOnlyHint = t(
    'panels:diagram.actions.readOnlyHint',
    'This diagram was made with a newer Ori Studio and opens read-only'
  );
  // Only for a moment, as a layout's packing is taken in: a page is packed as it is laid out.
  const unpackedHint = t('panels:diagram.packing.notPackedHint', 'The pages are still being packed');
  const command = (id: DiagramPageActionId, label: string, stored: boolean, run: () => void): DiagramPageCommand => {
    const disabled = state.readOnly || !stored;
    return {
      kind: 'command',
      id,
      label,
      disabled,
      ...(disabled ? { hint: state.readOnly ? readOnlyHint : unpackedHint } : {}),
      run,
    };
  };
  return [
    command('repack-page', t('panels:diagram.packing.repackPage', 'Re-pack Page'), state.pageStored, deps.repackPage),
    command('repack-all', t('panels:diagram.packing.repackAll', 'Re-pack All Pages'), state.anyStored, deps.repackAll),
  ];
}
