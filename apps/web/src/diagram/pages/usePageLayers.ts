import { useMemo, useState } from 'react';
import { useIsPhoneSurface } from '../../platform/mobileSurface';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isLockedStep, stepById, stepsOf, type DiagramStep } from '../document/diagramDocument';
import { isPlacedStep, placementBlocker } from '../document/stepPlace';
import type { PagePart } from './pagePlacement';
import { usePrintedLayout } from './printedFrames';
import { useCurrentDiagramPage } from './useCurrentDiagramPage';

/** A step's parts as Layers lists them under it: its frame is the step's own row. */
export const PAGE_LAYER_PARTS = ['number', 'picture', 'text'] as const;
export type PageLayerPart = (typeof PAGE_LAYER_PARTS)[number];

/** One part's row under the selected step. */
export interface PageLayerPartRow {
  part: PageLayerPart;
  /** Placed by hand: it has an offset of its own. */
  moved: boolean;
  pressed: boolean;
  /** Text, on a step with no instruction: nothing to select. */
  disabled: boolean;
}

/** One step's row in the Pages view's Layers list. */
export interface PageLayerRow {
  step: DiagramStep;
  number: number;
  /** Its instruction, trimmed; empty for none. */
  text: string;
  /** Placed by hand, any part or its size (`isPlacedStep`). */
  moved: boolean;
  /** A part past the margin, as the pages last laid it out (`LayoutCell.outsideMargin`). */
  outsideMargin: boolean;
  /** The selection, with its frame — or no part, as a step selected by the keys or in the Steps view is. */
  pressed: boolean;
  /** A part of it is the selection. */
  holdsSelection: boolean;
  /** Its parts, where it can be placed here; null otherwise. */
  parts: readonly PageLayerPartRow[] | null;
  /** Its parts are shown under it: one step's at a time, the selection's until a disclosure says otherwise. */
  open: boolean;
}

/** Whether a step can be placed by hand here: a diagram that can change, a placement this build reads, and no phone. */
const placeable = (step: DiagramStep, readOnly: boolean, phone: boolean) =>
  !readOnly && !phone && placementBlocker(step) === null;

/**
 * The Layers pane in the Pages view: the current page's steps
 * (`useCurrentDiagramPage`) in the order they paint — a later step over an
 * earlier one, so the first at the top, as Annotate lists its marks — each
 * marked when placed by hand and when a part of it is past the margin, each
 * one that can be placed opening into its parts by its disclosure — one at a
 * time, as an accordion: the selected step's, until a disclosure is used,
 * and again once the selection moves (redesign, 2026-10-18); and the step
 * whose placement it offers under the list. A press on a row selects as a
 * press on the page does: a step with its whole frame, as the first press
 * there; a part, as the second. Turns are no rows. A step's own Delete asks
 * first, as the Steps view's card's does.
 */
export function usePageLayers() {
  // The step a disclosure opened, or none, while the selection it was used under lasts.
  const [disclosed, setDisclosed] = useState<{ open: string | null; selection: string | null } | null>(null);
  const current = useCurrentDiagramPage();
  const document = useWorkspaceStore((state) => state.diagram);
  const selectedId = useWorkspaceStore((state) => state.diagramSelectedStepId);
  const part = useWorkspaceStore((state) => state.diagramPagesPart);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const phone = useIsPhoneSurface();
  const { pages } = usePrintedLayout();
  const openId = disclosed && disclosed.selection === selectedId ? disclosed.open : selectedId;
  const rows = useMemo((): readonly PageLayerRow[] => {
    if (!document || !current) return [];
    const steps = stepsOf(document);
    const cells = new Map(pages?.layout.pages.flatMap((page) => page.cells).map((cell) => [cell.stepId, cell] as const));
    return current.page.steps.map((index) => {
      const step = steps[index]!;
      const selected = step.id === selectedId;
      const cell = cells.get(step.id);
      const holdsSelection = selected && part !== null && part !== 'frame';
      const parts = placeable(step, readOnly, phone)
        ? PAGE_LAYER_PARTS.map((each) => ({
            part: each,
            moved: step.place?.[each] !== undefined,
            pressed: selected && part === each,
            disabled: each === 'text' && !step.text.trim(),
          }))
        : null;
      return {
        step,
        number: index + 1,
        text: step.text.trim(),
        moved: isPlacedStep(step),
        outsideMargin: cell?.outsideMargin === true,
        pressed: selected && (part === null || part === 'frame'),
        holdsSelection,
        parts,
        open: parts !== null && step.id === openId,
      };
    });
  }, [document, current, pages, selectedId, part, readOnly, phone, openId]);
  const chosen = rows.find((row) => row.step.id === selectedId)?.step ?? null;
  // A newer build's step offers no placement, as the Step pane offered none.
  const selected = chosen && !isLockedStep(chosen) ? chosen : null;
  return {
    /** What the Pages view captions the current page; null with no diagram. */
    pageName: current?.name ?? null,
    rows,
    /** The selected step, when it is on this page and this build can place it: whose placement the pane offers. */
    selected,
    /** Select step `stepId` with its whole frame, as a first press on it on the page does. */
    selectStep(stepId: string) {
      const store = useWorkspaceStore.getState();
      store.selectDiagramStep(stepId);
      const step = store.diagram ? stepById(store.diagram, stepId) : null;
      // On a step the pages cannot place by hand, as there: the step alone.
      if (step && placeable(step, store.diagramReadOnly, phone)) store.selectDiagramPagesPart('frame');
    },
    /**
     * Select part `chosen` of step `stepId`, as a second press on it on the
     * page does — the step first, where another was selected.
     */
    selectPart(stepId: string, chosen: PagePart) {
      const store = useWorkspaceStore.getState();
      if (store.diagramSelectedStepId !== stepId) store.selectDiagramStep(stepId);
      useWorkspaceStore.getState().selectDiagramPagesPart(chosen);
    },
    /** Show step `stepId`'s parts, shutting any other's — or hide them. */
    toggleParts(stepId: string) {
      setDisclosed({ open: openId === stepId ? null : stepId, selection: selectedId });
    },
    /** Whether a step can be deleted from here: a diagram that can change. */
    canDelete: !readOnly,
    /** Delete step `stepId`, asking first for one with work in it, as its card's Delete does. */
    deleteStep(stepId: string) {
      void useWorkspaceStore.getState().confirmDeleteDiagramSteps([stepId]);
    },
  };
}
