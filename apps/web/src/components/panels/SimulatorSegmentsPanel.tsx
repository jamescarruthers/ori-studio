import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react';
import { SheetGrid, type SheetGridItem } from '../../cp-workspace/sheets/SheetGrid';

/**
 * Fixed, non-draggable sidebar rendered inside the simulator panel. Lists the
 * document's crease patterns as the shared sheet cards and reports which one
 * was pressed. What a card shows is the source's (`useSimulateSource`): a sheet
 * of the index drawn from its lines, or a segment of a design's fold.
 *
 * The same rail the References workspace has (`ReferencesSheetsSidebar`), for
 * the same reason: a document can hold several disjoint patterns and only one
 * of them is being folded right now. On a phone it is the whole screen rather
 * than a rail — the list the reader picks a pattern from, with the simulator
 * behind a press (`useSimulatorPhoneFlow`) — and the stylesheet's phone block
 * is what stretches it and grows the cards (`theme.css`, `.segments-sidebar`
 * and `.sheet-grid`).
 *
 * The cards ink each line as the References rail's cards do — main's look,
 * solid lines in the theme's crease inks (`SheetGrid`). Aux lines always, as
 * main's rail drew them: the paper style's switch for them is the
 * simulation's, and does not reach a flat pattern, so with it off the view
 * hides them and the card still shows them. Only the References rail can hide
 * them, and only while its own view does.
 *
 * Presentation only: the cards, which one is active, and a press reports
 * back. What a press *means* is the panel's — a selection beside the canvas
 * on a desktop, and on a phone the detail screen too.
 */
export interface SimulatorSegmentsSidebarProps {
  patterns: readonly SheetGridItem[];
  selected: number | null;
  onSelect: (id: number) => void;
}

export const SimulatorSegmentsSidebar = memo(function SimulatorSegmentsSidebar({
  patterns,
  selected,
  onSelect,
}: SimulatorSegmentsSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className="segments-sidebar"
      aria-label={t('panels:simulatorSegments.creasePatterns', 'Crease patterns')}
    >
      <div className="segments-sidebar__header">
        <Shapes size={14} />
        <span className="panel-title">{t('panels:simulatorSegments.patterns', 'Patterns')}</span>
        <span className="segments-sidebar__count">{patterns.length}</span>
      </div>
      <SheetGrid sheets={patterns} showAux selected={selected} onSelect={onSelect} />
    </aside>
  );
});
