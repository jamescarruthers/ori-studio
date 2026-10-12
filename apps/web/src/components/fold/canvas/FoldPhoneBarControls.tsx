import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import { showFoldPhonePane, useFoldPhonePane } from '../../../fold/canvas/foldPhonePane';
import { useFoldRailGroups } from '../../../fold/canvas/useFoldRailGroups';
import type { FoldPaneId } from '../../../fold/canvas/foldPicking';
import { useFoldTools } from '../../../fold/tools/foldToolState';
import { useIsPhoneLayout } from '../../../platform/phoneLayout';
import { ViewportToolbarButton } from '../../panels/ViewportToolbar';
import { useToolPickerSheet } from '../../ui/tools/useToolPickerSheet';
import { FoldToolGlyph } from '../FoldToolGlyph';
import { FoldToolPickerSheet } from '../FoldToolPickerSheet';
import { FoldAltLatchToggle } from './FoldAltLatchToggle';

/**
 * The Fold canvas's own controls on a phone (plan D14), at the head of its
 * bar: the Tools button and the sheet it opens, in place of the rail a phone
 * has no room for — the free-point latch in the sheet's modes row, where
 * Edit's sheet holds its Shift latch — and the switch that swaps the one pane
 * on screen between the folded form and the crease pattern, named by the pane
 * it shows next.
 *
 * On the bar rather than the header, which on a phone keeps to one row for
 * the tabs, undo and redo, the verbs' menu and the drawer's pill; as Edit's
 * phone bar carries its tools. The bar's own buttons, so the row reads as
 * one bar. Renders nothing off the phone layout, where the rail and both
 * panes are on screen.
 */
export function FoldPhoneBarControls() {
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
  const other = panes.find((each) => each.id !== pane) ?? panes[0]!;
  const tools = t('tools:fold.picker.trigger', 'Tools');
  return (
    <>
      <ViewportToolbarButton
        ref={triggerRef}
        aria-label={tools}
        title={tools}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={pickerId}
        isActive={open}
        onClick={openPicker}
      >
        <FoldToolGlyph id={tool} compact />
      </ViewportToolbarButton>
      <ViewportToolbarButton
        aria-label={other.title}
        title={other.title}
        data-fold-pane-switch={other.id}
        onClick={() => showFoldPhonePane(other.id)}
      >
        <ArrowLeftRight size={14} aria-hidden="true" />
      </ViewportToolbarButton>
      {/* A page-level dialog: nothing in the bar should cap its stacking or its taps. */}
      {open &&
        createPortal(
          <FoldToolPickerSheet
            pickerId={pickerId}
            groups={groups}
            close={close}
            modes={<FoldAltLatchToggle fill />}
          />,
          document.body
        )}
    </>
  );
}
