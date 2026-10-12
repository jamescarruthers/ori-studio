import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramStep } from '../document/diagramDocument';
import { placementBlocker } from '../document/stepPlace';
import { captionCeilingMm, narrowestCaptionWidth } from './captionMeasure';
import { printedFrameMm } from './pagePictures';
import { pageOffset, type PagePart } from './pagePlacement';
import { commitPlacement, resetPlacement } from './placementActions';
import { usePrintedLayout } from './printedFrames';

/**
 * A step's placement controls under the Pages view's Layers list
 * (`DiagramStepPlacement`), bound to its step. The step's cell is
 * the one the pages last laid out for it, kept while a layout of a newer
 * diagram is under way (review finding U8): an edit then never flashes the
 * section to disabled with a size of 0. A step the pages have not laid out
 * yet has no cell, and its size shows empty.
 */
export function useStepPlacement(step: DiagramStep) {
  const { pages, document } = usePrintedLayout();
  const cell = pages?.layout.pages.flatMap((page) => page.cells).find((each) => each.stepId === step.id) ?? null;
  const selected = useWorkspaceStore((state) =>
    state.diagramSelectedStepId === step.id ? state.diagramPagesPart : null,
  );
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const loadId = useWorkspaceStore((state) => state.diagramLoadId);
  const blocked = placementBlocker(step);
  const size = cell && document ? printedFrameMm(step, document.assets, document.style, cell) : null;
  const auto = cell?.placed?.auto;
  const autoSize =
    cell && document && auto ? printedFrameMm(step, document.assets, document.style, { ...cell, ...auto }) : size;
  // The caption's measure, when it has lines to set: as printed, what Auto gives it, and how narrow and wide it may be.
  const textWidth = cell && cell.text.lines.length > 0 ? cell.text.widthMm : null;
  const autoTextWidth = textWidth === null ? null : (auto?.textWidthMm ?? textWidth);
  const textWidthRange =
    selected === 'text' && textWidth !== null && pages
      ? { least: narrowestCaptionWidth(step.text, pages.setter), most: captionCeilingMm(pages.layout.paper) }
      : null;
  return {
    cell,
    selected,
    size,
    autoSize,
    textWidth,
    autoTextWidth,
    textWidthRange,
    readOnly,
    blocked,
    disabled: readOnly || blocked !== null || !cell,
    offset(part: PagePart) {
      return pageOffset(step.place, part, cell?.rightToLeft ?? false);
    },
    setOffset(part: PagePart, axis: 0 | 1, value: number) {
      const offset: [number, number] = [...(step.place?.[part] ?? [0, 0])];
      offset[axis] = part === 'frame' && axis === 0 && cell?.rightToLeft ? -value : value;
      commitPlacement(step.id, { [part]: offset }, 'pane', { loadId });
    },
    setSize(mm: number) {
      if (!cell || !size || step.zoom) return;
      if (autoSize !== null && Math.abs(mm - autoSize) < 0.05) {
        resetPlacement(step.id, 'scale');
        return;
      }
      const factor = mm / size;
      commitPlacement(
        step.id,
        {
          scale:
            cell.mmPerUnit !== null
              ? { mmPerUnit: cell.mmPerUnit * factor }
              : { frameMm: (cell.frameMm ?? size) * factor },
        },
        'pane',
        { loadId },
      );
    },
    /** The caption's measure typed: pinned, or — the automatic one — let go. */
    setTextWidth(mm: number) {
      if (textWidth === null) return;
      if (autoTextWidth !== null && Math.abs(mm - autoTextWidth) < 0.05) {
        if (step.place?.textWidth !== undefined) resetPlacement(step.id, 'textWidth');
        return;
      }
      commitPlacement(step.id, { textWidth: mm }, 'pane', { loadId });
    },
    reset: (part: Parameters<typeof resetPlacement>[1]) => resetPlacement(step.id, part),
  };
}
