import { useCallback, useMemo } from 'react';
import { trackDiagramPageSetupChanged } from '../../analytics';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DEFAULT_DIAGRAM_STYLE } from '../document/diagramDocument';
import { createColorPick } from './colorPick';
import { titleBlockInksOf } from './composeDiagramPage';
import { useSettledColorPick } from './useSettledColorPick';

/** The band's colour while it is picked: the swatch alone shows it, and the page as the pick settles. */
const bandColorPick = createColorPick();

/** Write a pick of the band's colour to the diagram's title block, in its undo session. */
const writeBandColor = (color: string, session: number) =>
  useWorkspaceStore.getState().setDiagramTitleBlockContent({ bandColor: color }, { session });
const countBandColor = () => trackDiagramPageSetupChanged('title_block_band_color', { titleBlockBand: 'custom' });

/**
 * The title block's Band color row, bound (Zach, 2026-10-15: "default the
 * block color like it currently does to the paper color, but I also want that
 * to be an editable field"): it shows the colour the band prints in — the
 * one chosen, or else the paper's — and a pick is written as it settles, one
 * undo step and one count of `title_block_band_color` for the whole pick
 * (`useSettledColorPick`). Reset, offered while a colour is chosen, puts the
 * band back on the paper's colour, one of each too.
 */
export function useTitleBlockBandColor() {
  const style = useWorkspaceStore((state) => state.diagram?.style ?? DEFAULT_DIAGRAM_STYLE);
  const chosen = useWorkspaceStore((state) => state.diagram?.titleBlockContent?.bandColor ?? null);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const paper = useMemo(() => titleBlockInksOf(style).band, [style]);
  const { live, onPick, onPickEnd } = useSettledColorPick({ pick: bandColorPick, write: writeBandColor, count: countBandColor });

  const onReset = useCallback(() => {
    if (useWorkspaceStore.getState().setDiagramTitleBlockContent({ bandColor: 'paper' })) {
      trackDiagramPageSetupChanged('title_block_band_color', { titleBlockBand: 'paper' });
    }
  }, []);

  return { value: live ?? chosen ?? paper, readOnly, onPick, onPickEnd, onReset: chosen !== null ? onReset : undefined };
}
