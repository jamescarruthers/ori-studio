import { printedFrameMm } from './pagePictures';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { registerPendingEditFlush } from '../../lib/pendingEdits';
import { useIsPhoneSurface } from '../../platform/mobileSurface';
import type { DiagramShortcutId } from '../../keyboard/shortcuts';
import { stepById, type DiagramDocument } from '../document/diagramDocument';
import { placementBlocker, placeOffset } from '../document/stepPlace';
import type { PreparedDiagramPages } from './diagramPages';
import type { LayoutCell } from './diagramPageLayout';
import { partBox, pageOffset, type PagePart } from './pagePlacement';
import { commitPlacement, commitZoomSize } from './placementActions';
import { previewPlacement } from './placementPreview';
import { registerPlacementKeys } from './placementGestures';

interface Draft {
  base: PreparedDiagramPages;
  cell: LayoutCell;
  part: PagePart;
  page: number;
  loadId: number;
  /** The diagram the draft commits onto: the store's must still be it. */
  document: DiagramDocument;
  /** How far the preview moves the part from where `base` puts it, in mm. */
  dx: number;
  dy: number;
  /**
   * How much of `dx` and `dy` `document` holds already: nudges committed
   * while the pages are still those of an older diagram, which a held arrow
   * carries on from rather than waiting for them.
   */
  committed?: { dx: number; dy: number };
  factor: number;
  source: 'drag' | 'keys';
  /** Committed: the preview holds until the pages are of this diagram. */
  pending?: DiagramDocument;
  pointer?: {
    id: number;
    x: number;
    y: number;
    mmPerPx: number;
    target: HTMLElement;
    size: false | 'left' | 'middle' | 'right';
    /** A click drills into an already selected frame; a drag still moves it whole. */
    drill?: PagePart;
    /** Past the slop: the press is a drag now, not a click. */
    moved?: boolean;
  };
  snap?: { auto?: boolean; number?: number };
}
/** Where a pointer is, and the keys that change what a drag does there. */
interface DragPoint {
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
}
/**
 * A press made while the pages were an older diagram's — the nudge it
 * committed, or another edit, still laying out: it has selected what it
 * pressed, and becomes a draft once the pages catch up, dragged as far as the
 * pointer went meanwhile, and committed then if it was let go after a drag.
 */
interface HeldPress {
  stepId: string;
  part: PagePart;
  pointer: NonNullable<Draft['pointer']>;
  last?: DragPoint;
  released?: boolean;
}
const dragPoint = ({ clientX, clientY, shiftKey, altKey }: DragPoint): DragPoint => ({ clientX, clientY, shiftKey, altKey });
const NUDGE_DELAY = 220;
/** How far a press travels before it is a drag, in screen px. */
const DRAG_SLOP_PX = 4;
/** The keyboard's sittings, counted: what names each one's undo entry. */
let sittings = 0;

/**
 * A press on a step focuses its option, as a press on a card does, so Enter
 * opens the step and the Diagram's keys go on from it. The option takes the
 * browser's own focus as well; a part's target or a grip lies outside it,
 * where the browser would focus the view round the pages instead, so a press
 * there is kept from the browser.
 */
function focusStep(event: ReactPointerEvent<HTMLElement>, page: HTMLElement, stepId: string): void {
  const option = [...page.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (each) => each.dataset.stepId === stepId
  );
  option?.focus({ preventScroll: true });
  if (event.currentTarget !== option) event.preventDefault();
}

/**
 * Pointer and keyboard transactions live here; the view only places targets
 * and previews. A keyboard nudge previews at once and commits after a pause,
 * and one still in its pause commits before anything else happens to the
 * diagram — another edit, an undo, a save, the selection or the view moving,
 * the view going (`flushPlacementNudge`); only Escape and the Undo key take
 * it back. A sitting's nudges of one part are one undo entry. A press made
 * while an edit is still laying out — the nudge the press itself commits
 * included — selects what it pressed at once and is held until the pages
 * catch up (`HeldPress`), so a click right after a nudge selects the frame
 * and a drag there still moves it.
 */
export function usePagePlacement(pages: PreparedDiagramPages | null, space: boolean, failed = false) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const live = useRef<Draft | null>(null);
  const held = useRef<HeldPress | null>(null);
  const committing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The part being nudged at the keyboard and its sitting, until the selection moves. */
  const sitting = useRef<{ stepId: string; part: PagePart; session: number } | null>(null);
  /** This render's pages and flush, for what runs outside it: a timer, the store's listener, the unmount. */
  const latest = useRef({ pages, failed, flush: () => {}, land: (): boolean => false });
  const phone = useIsPhoneSurface();
  const selected = useWorkspaceStore((state) => state.diagramSelectedStepId);
  const part = useWorkspaceStore((state) => state.diagramPagesPart);
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const update = (value: Draft | null) => {
    live.current = value;
    setDraft(value);
  };
  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  /** What a draft leaves once nothing of it is left to commit: the nudges it committed, until the pages catch up. */
  const holding = (current: Draft): Draft | null =>
    current.committed && !latest.current.failed && latest.current.pages?.document !== current.document
      ? { ...current, dx: current.committed.dx, dy: current.committed.dy, factor: 1, pending: current.document }
      : null;
  const drop = () => {
    if (held.current) {
      held.current = null;
      return true;
    }
    const current = live.current;
    if (!current || current.pending) return false;
    stopTimer();
    update(holding(current));
    return true;
  };
  const sittingSession = (stepId: string, chosen: PagePart) => {
    const now = sitting.current;
    if (now?.stepId === stepId && now.part === chosen) return now.session;
    sitting.current = { stepId, part: chosen, session: (sittings += 1) };
    return sitting.current.session;
  };
  const commit = () => {
    stopTimer();
    const current = live.current;
    if (!current || current.pending) return;
    const state = useWorkspaceStore.getState();
    const step =
      state.diagramLoadId === current.loadId && state.diagram === current.document
        ? stepById(current.document, current.cell.stepId)
        : null;
    if (!step) {
      update(null);
      return;
    }
    const dx = current.dx - (current.committed?.dx ?? 0),
      dy = current.dy - (current.committed?.dy ?? 0);
    if (!dx && !dy && current.factor === 1) {
      update(holding(current));
      return;
    }
    committing.current = true;
    let changed = false;
    try {
      if (current.pointer?.size) {
        const scale = current.cell.mmPerUnit ?? current.cell.frameMm;
        if (step.zoom)
          changed = commitZoomSize(
            step.id,
            Math.max(1.25, Math.min(6, (current.cell.zoom?.printed ?? step.zoom.scale ?? 1.25) * current.factor)),
            'drag',
            current.loadId,
          );
        else if (scale !== null) {
          const auto = current.cell.placed?.auto;
          const value = scale * current.factor;
          const autoScale = auto ? (auto.mmPerUnit ?? auto.frameMm) : scale;
          changed = commitPlacement(
            step.id,
            {
              scale:
                autoScale !== null && Math.abs(value / autoScale - 1) < 0.003
                  ? null
                  : current.cell.mmPerUnit !== null
                    ? { mmPerUnit: value }
                    : { frameMm: value },
            },
            'drag',
            { loadId: current.loadId },
          );
        }
      } else {
        const [x, y] = pageOffset(step.place, current.part, !!current.cell.rightToLeft);
        const offset: [number, number] = [x + dx, y + dy];
        if (current.part === 'frame' && current.cell.rightToLeft) offset[0] *= -1;
        changed = commitPlacement(step.id, { [current.part]: placeOffset(offset) }, current.source, {
          loadId: current.loadId,
          // A sitting's nudges of one part are one undo entry; a drag is one of its own.
          ...(current.source === 'keys' ? { session: sittingSession(step.id, current.part) } : {}),
        });
      }
    } finally {
      committing.current = false;
    }
    if (!changed) {
      update(holding(current));
      return;
    }
    const document = useWorkspaceStore.getState().diagram!;
    // A layout that fails leaves nothing to wait for: the pages as they were show.
    update(
      latest.current.failed
        ? null
        : { ...current, document, committed: { dx: current.dx, dy: current.dy }, pending: document },
    );
  };
  /** Commit a keyboard nudge still in its pause, now. A drag is its pointer's to end. */
  const flushKeys = () => {
    const current = live.current;
    if (!current || current.pending || current.pointer || committing.current) return;
    commit();
  };
  /** Whether step `stepId` can be placed by hand here at all, whatever diagram the pages are of. */
  const editable = (stepId: string): boolean => {
    const state = useWorkspaceStore.getState();
    const step = state.diagram && stepById(state.diagram, stepId);
    return Boolean(pages?.withLayout && step && !phone && !readOnly && !placementBlocker(step));
  };
  /** The pages are an older diagram's than the store's: an edit is still laying out. */
  const stale = () => Boolean(pages?.document && pages.document !== useWorkspaceStore.getState().diagram);
  const make = (page: number, cell: LayoutCell, chosen: PagePart, source: Draft['source']): Draft | null => {
    const state = useWorkspaceStore.getState();
    if (!pages || !state.diagram || !editable(cell.stepId) || stale()) return null;
    return {
      base: pages,
      document: state.diagram,
      cell,
      part: chosen,
      page,
      loadId: state.diagramLoadId,
      dx: 0,
      dy: 0,
      factor: 1,
      source,
    };
  };
  /**
   * `current`, a pointer's draft, dragged to `point`: null while the press is
   * still inside its slop. Past it, what the drag moves is selected, once.
   */
  const dragTo = (current: Draft, point: DragPoint): Draft | null => {
    const pointer = current.pointer!;
    const dx = (point.clientX - pointer.x) * pointer.mmPerPx,
      dy = (point.clientY - pointer.y) * pointer.mmPerPx;
    let grip = pointer;
    if (!pointer.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP_PX * pointer.mmPerPx) return null;
      // A drag from here: what it moves is the selection, once.
      grip = { ...pointer, moved: true };
      useWorkspaceStore.getState().selectDiagramPagesPart(current.part);
    }
    const box = partBox(current.cell, current.part),
      paper = current.base.layout.paper;
    if (grip.size) {
      const step = stepById(current.document, current.cell.stepId)!;
      const sizeOf = (cell: LayoutCell) => {
        const step = stepById(current.document, cell.stepId);
        return step ? printedFrameMm(step, current.document.assets, current.document.style, cell) : null;
      };
      const max =
          printedFrameMm(step, current.document.assets, current.document.style, current.cell) ?? Math.max(box.w, box.h),
        near = 6 * grip.mmPerPx;
      const horizontal = (dx * (grip.size === 'left' ? -2 : 2)) / box.w;
      const vertical = dy / box.h;
      const change = grip.size === 'middle' || Math.abs(vertical) > Math.abs(horizontal) ? vertical : horizontal;
      let mm = Math.max(4, Math.min(Math.max(paper.widthMm, paper.heightMm) - paper.marginMm * 2, max * (1 + change)));
      let snap: Draft['snap'];
      if (!point.altKey) {
        const auto = current.cell.placed?.auto;
        const scale = current.cell.mmPerUnit ?? current.cell.frameMm;
        const candidates: { mm: number; auto?: boolean; number?: number }[] = [
          { mm: auto && scale ? (max * (auto.mmPerUnit ?? auto.frameMm ?? scale)) / scale : max, auto: true },
        ];
        for (const cell of current.base.layout.pages[current.page]!.cells) {
          if (
            cell.stepId === current.cell.stepId ||
            !!cell.zoom !== !!current.cell.zoom ||
            (cell.mmPerUnit !== null) !== (current.cell.mmPerUnit !== null)
          )
            continue;
          const value = sizeOf(cell);
          if (value !== null) candidates.push({ mm: value, number: cell.number });
        }
        const closest = candidates.sort((a, b) => Math.abs(a.mm - mm) - Math.abs(b.mm - mm))[0];
        if (closest && Math.abs(closest.mm - mm) < near) {
          mm = closest.mm;
          snap = closest;
        }
      }
      if (current.cell.zoom) {
        const printed = current.cell.zoom.printed;
        mm = (max * Math.max(1.25, Math.min(6, (printed * mm) / max))) / printed;
      }
      return { ...current, pointer: grip, factor: mm / max, snap };
    }
    let x = dx,
      y = dy;
    if (point.shiftKey) {
      if (Math.abs(x) > Math.abs(y)) y = 0;
      else x = 0;
    }
    if (!point.altKey) {
      const step = stepById(current.document, current.cell.stepId)!;
      const home = pageOffset(step.place, current.part, !!current.cell.rightToLeft);
      const near = 6 * grip.mmPerPx;
      const candidatesX = [-home[0]],
        candidatesY = [-home[1]];
      for (const other of current.base.layout.pages[current.page]!.cells)
        if (other.stepId !== current.cell.stepId) {
          const b = partBox(other, current.part);
          candidatesX.push(b.x - box.x, b.x + b.w / 2 - box.x - box.w / 2, b.x + b.w - box.x - box.w);
          candidatesY.push(b.y - box.y, b.y + b.h / 2 - box.y - box.h / 2, b.y + b.h - box.y - box.h);
        }
      const snap = (value: number, candidates: number[]) => {
        const best = candidates.sort((a, b) => Math.abs(a - value) - Math.abs(b - value))[0];
        return best !== undefined && Math.abs(best - value) < near ? best : value;
      };
      x = snap(x, candidatesX);
      y = snap(y, candidatesY);
    }
    if (point.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) y = 0;
      else x = 0;
    }
    x = Math.max(-box.x, Math.min(paper.widthMm - box.x - box.w, x));
    y = Math.max(-box.y, Math.min(paper.heightMm - box.y - box.h, y));
    return { ...current, pointer: grip, dx: x, dy: y };
  };
  const nudge = (id: DiagramShortcutId): boolean => {
    if (!part || !selected || phone || readOnly) return false;
    let current = live.current;
    if (current?.pointer && !current.pending) {
      // A drag in hand takes the keys, unless its press went with its element.
      if (current.pointer.target.isConnected) return true;
      stopTimer();
      update(null);
      current = null;
    }
    const same = current?.cell.stepId === selected && current.part === part;
    if (current && !current.pending && !same) {
      flushKeys();
      current = live.current;
    }
    const state = useWorkspaceStore.getState();
    let next: Draft | null = null;
    if (current?.pending && same && !current.pointer?.size && state.diagram === current.pending) {
      // Committed, and its pages still laying out: the arrow carries on from where the last nudge went.
      next = {
        ...current,
        document: current.pending,
        pending: undefined,
        pointer: undefined,
        snap: undefined,
        source: 'keys',
        committed: { dx: current.dx, dy: current.dy },
      };
    } else if (current && !current.pending && same) next = current;
    else {
      const page = pages?.layout.pages.findIndex((p) => p.cells.some((c) => c.stepId === selected)) ?? -1;
      const cell = pages?.layout.pages[page]?.cells.find((c) => c.stepId === selected);
      if (cell) next = make(page, cell, part, 'keys');
    }
    // No draft to be had — the pages are another diagram's while they lay out: the key goes on.
    if (!next) return false;
    const distance = id.endsWith('Large') ? 5 : 0.5;
    const dx = id.includes('Left') ? -distance : id.includes('Right') ? distance : 0;
    const dy = id.includes('Up') ? -distance : id.includes('Down') ? distance : 0;
    update({ ...next, dx: next.dx + dx, dy: next.dy + dy });
    stopTimer();
    timer.current = setTimeout(commit, NUDGE_DELAY);
    return true;
  };
  /**
   * A held press once the pages it waited for have come: the draft it would
   * have been, onto them, dragged as far as the pointer went, and committed if
   * it was let go. Whether it took the draft; a failed layout lets it go.
   */
  const land = (): boolean => {
    const press = held.current;
    if (!press || (!failed && stale())) return false;
    held.current = null;
    const page = failed ? -1 : (pages?.layout.pages.findIndex((each) => each.cells.some((c) => c.stepId === press.stepId)) ?? -1);
    const cell = pages?.layout.pages[page]?.cells.find((each) => each.stepId === press.stepId);
    const next = cell ? make(page, cell, press.part, 'drag') : null;
    if (!next) return false;
    next.pointer = press.pointer;
    update((press.last && dragTo(next, press.last)) || next);
    if (press.released) commit();
    return true;
  };
  useEffect(() => {
    latest.current = { pages, failed, flush: flushKeys, land };
  });
  useEffect(() => {
    if (latest.current.land()) return;
    const current = live.current;
    if (!current) return;
    if (current.pending) {
      if (failed || pages?.document === current.pending || useWorkspaceStore.getState().diagram !== current.pending)
        update(null);
      return;
    }
    // Nudges carried on while the pages caught up: onto the pages, once they are of the diagram it commits onto.
    if (current.committed && pages && pages.document === current.document) {
      const committed = current.committed;
      const cell = pages.layout.pages[current.page]?.cells.find((each) => each.stepId === current.cell.stepId);
      if (cell)
        update({
          ...current,
          base: pages,
          cell,
          dx: current.dx - committed.dx,
          dy: current.dy - committed.dy,
          committed: undefined,
        });
    }
  }, [pages, failed]);
  useEffect(
    () =>
      useWorkspaceStore.subscribe((next, previous) => {
        if (committing.current) return;
        if (
          next.diagramSelectedStepId !== previous.diagramSelectedStepId ||
          next.diagramPagesPart !== previous.diagramPagesPart ||
          next.diagramLoadId !== previous.diagramLoadId
        )
          sitting.current = null;
        // A held press goes with its diagram, and once its step is no longer the selection.
        const press = held.current;
        if (press && (next.diagramLoadId !== previous.diagramLoadId || next.diagramSelectedStepId !== press.stepId)) {
          held.current = null;
        }
        const current = live.current;
        if (!current) return;
        // Another diagram, or this one changed under the draft: there is nothing left to commit it onto.
        if (next.diagramLoadId !== current.loadId || next.diagram !== previous.diagram) {
          stopTimer();
          update(null);
          return;
        }
        if (current.pending) return;
        if (
          next.diagramSelectedStepId !== current.cell.stepId ||
          next.diagramDetail !== null ||
          next.diagramView !== 'pages' ||
          (next.diagramPagesPart !== current.part && next.diagramPagesPart !== previous.diagramPagesPart)
        ) {
          if (current.pointer) {
            stopTimer();
            update(null);
            // The keys' nudges stand, committed once this change has landed rather than inside it.
          } else queueMicrotask(() => latest.current.flush());
        }
      }),
    [],
  );
  useEffect(() =>
    registerPlacementKeys({
      run(id) {
        if (id === 'diagram.placementUndo') return drop();
        if (id.startsWith('diagram.nudgePlacement')) return nudge(id);
        // Any other of the Diagram's keys comes after the nudges before it.
        flushKeys();
        return false;
      },
      drop,
      flush: flushKeys,
    }),
  );
  useEffect(() => registerPendingEditFlush(flushKeys));
  useEffect(
    () => () => {
      latest.current.flush();
      stopTimer();
      live.current = null;
      held.current = null;
    },
    [],
  );

  const start = (
    event: ReactPointerEvent<HTMLElement>,
    page: number,
    cell: LayoutCell,
    chosen: PagePart = 'frame',
    size: false | 'left' | 'middle' | 'right' = false,
  ) => {
    if (
      space ||
      event.button !== 0 ||
      (event.pointerType === 'touch' && (selected !== cell.stepId || (chosen !== 'frame' && part !== chosen)))
    )
      return;
    const element = event.currentTarget.closest<HTMLElement>('[data-page]');
    if (!element || !pages) return;
    focusStep(event, element, cell.stepId);
    flushKeys();
    const rect = element.getBoundingClientRect(),
      mmPerPx = pages.layout.paper.widthMm / rect.width;
    let drill: PagePart | undefined;
    if (chosen === 'frame') {
      const x = (event.clientX - rect.left) * mmPerPx,
        y = (event.clientY - rect.top) * mmPerPx;
      const hit =
        (['number', 'picture', 'text'] as const).find((part) => {
          const box = partBox(cell, part);
          return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
        }) ?? 'frame';
      if (event.metaKey || event.ctrlKey) chosen = hit;
      else if (selected === cell.stepId && part === 'frame' && hit !== 'frame') drill = hit;
    }
    const current = make(page, cell, chosen, 'drag');
    // The pages an older diagram's — the nudge this press just committed, or another edit, laying out — hold the press.
    if (!current && !(editable(cell.stepId) && stale())) return;
    // The press stays the browser's until it is a drag (`move`): a click focuses and selects as a card's does.
    event.stopPropagation();
    const state = useWorkspaceStore.getState();
    state.selectDiagramStep(cell.stepId);
    state.selectDiagramPagesPart(chosen);
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer: Draft['pointer'] = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mmPerPx: pages.layout.paper.widthMm / element.getBoundingClientRect().width,
      target: event.currentTarget,
      size,
      drill,
    };
    if (!current) {
      held.current = { stepId: cell.stepId, part: chosen, pointer };
      return;
    }
    current.pointer = pointer;
    update(current);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const press = held.current;
    if (press?.pointer.id === event.pointerId) {
      press.last = dragPoint(event);
      return;
    }
    const current = live.current,
      pointer = current?.pointer;
    if (!current || !pointer || pointer.id !== event.pointerId || current.pending) return;
    const next = dragTo(current, event);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    update(next);
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const press = held.current;
    if (press?.pointer.id === event.pointerId) {
      event.stopPropagation();
      press.last = dragPoint(event);
      const { x, y, drill } = press.pointer;
      // Let go after a drag: it lands once the pages catch up. A click is done: it selected what it pressed.
      if (Math.hypot(press.last.clientX - x, press.last.clientY - y) >= DRAG_SLOP_PX) {
        press.released = true;
        return;
      }
      held.current = null;
      if (drill) useWorkspaceStore.getState().selectDiagramPagesPart(drill);
      return;
    }
    const current = live.current;
    if (current?.pointer?.id !== event.pointerId || current.pending) return;
    event.stopPropagation();
    if (current.pointer.drill && !current.pointer.moved) {
      const part = current.pointer.drill;
      update(null);
      useWorkspaceStore.getState().selectDiagramPagesPart(part);
      return;
    }
    commit();
  };
  /** The press lost its capture — its element went, or the browser took it back: the gesture goes with it. */
  const lost = (event: ReactPointerEvent<HTMLElement>) => {
    const press = held.current;
    if (press?.pointer.id === event.pointerId) {
      // Let go after a drag, the capture goes with the press: the drag still lands.
      if (!press.released) held.current = null;
      return;
    }
    const current = live.current;
    if (current?.pointer?.id !== event.pointerId || current.pending) return;
    stopTimer();
    update(null);
  };
  const preview =
    draft?.base.withLayout?.(
      previewPlacement(
        draft.base.layout,
        draft.cell.stepId,
        draft.part,
        draft.dx,
        draft.dy,
        draft.factor,
        draft.base.footprints,
        draft.base.zoomArrows,
      ),
    ) ?? null;
  return {
    pages: preview ?? pages,
    draft,
    selected,
    part,
    enabled: !phone && !readOnly,
    start,
    move,
    end,
    cancel: drop,
    lost,
  };
}
