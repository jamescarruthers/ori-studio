import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { showFoldPhonePane, useFoldPhonePane } from '../../../fold/canvas/foldPhonePane';
import { useFoldRailGroups } from '../../../fold/canvas/useFoldRailGroups';
import type { FoldPaneId } from '../../../fold/canvas/foldPicking';
import { useFoldTools } from '../../../fold/tools/foldToolState';
import { useIsPhoneLayout } from '../../../platform/phoneLayout';
import { PaneToggle } from '../../ui/PaneToggle';
import { ToolsTriggerButton } from '../../ui/tools/ToolsTriggerButton';
import { useToolPickerSheet } from '../../ui/tools/useToolPickerSheet';
import { FoldToolGlyph } from '../FoldToolGlyph';
import { FoldToolPickerSheet } from '../FoldToolPickerSheet';
import { FoldAltLatchToggle } from './FoldAltLatchToggle';

/**
 * The Fold canvas's pills in Fold's header, on a phone (plan D14): the Tools
 * pill and the sheet it opens, in place of the rail a phone has no room for;
 * the free-point latch; and the `PaneToggle` that swaps the one pane on
 * screen between the folded form and the crease pattern. In the header, not
 * the canvas pill lane: the lane sits over the dock's top-right corner, which
 * on a phone is this header.
 *
 * Renders nothing off the phone layout, where the rail and both panes are
 * on screen.
 */
export function FoldPhoneCanvasPills() {
  const { t } = useTranslation();
  const phone = useIsPhoneLayout();
  const pane = useFoldPhonePane();
  const groups = useFoldRailGroups();
  const tool = useFoldTools((state) => state.tool);
  const { open, pickerId, openPicker, close, triggerRef } = useToolPickerSheet({ available: phone });
  if (!phone) return null;
  const panes: { id: FoldPaneId; title: string }[] = [
    { id: 'folded', title: t('panels:fold.canvas.folded', 'Folded') },
    { id: 'crease-pattern', title: t('panels:fold.canvas.creasePattern', 'Crease pattern') },
  ];
  return (
    <>
      <ToolsTriggerButton
        label={t('tools:fold.picker.trigger', 'Tools')}
        glyph={<FoldToolGlyph id={tool} />}
        open={open}
        pickerId={pickerId}
        onOpen={openPicker}
        triggerRef={triggerRef}
      />
      <FoldAltLatchToggle />
      <PaneToggle options={panes} active={pane} onShow={showFoldPhonePane} />
      {/* A page-level dialog: nothing in the header should cap its stacking or its taps. */}
      {open && createPortal(<FoldToolPickerSheet pickerId={pickerId} groups={groups} close={close} />, document.body)}
    </>
  );
}
