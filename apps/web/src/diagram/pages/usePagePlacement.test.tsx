import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createDiagram, insertSteps, setPageSetup, setStepText, stepById } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { FIXTURE_FONTS, fixtureSubsetter } from '../fonts/diagramFonts.fixtures';
import type { FontSubsetter } from '../fonts/fontSubset';
import { flushPendingEdits } from '../../lib/pendingEdits';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { preparedPages, type PreparedDiagramPages } from './diagramPages';
import { usePagePlacement } from './usePagePlacement';
import { partBox } from './pagePlacement';
import { captionStartShift, setCaption } from './captionMeasure';
import type { LayoutCell } from './diagramPageLayout';
import { STEP_TEXT_LEADING_MM } from './stepType';
import { runPlacementKey, cancelPlacementGesture } from './placementGestures';

let subsetter: FontSubsetter;
beforeAll(async () => {
  subsetter = await fixtureSubsetter();
});
let host: HTMLDivElement, root: Root, pages: PreparedDiagramPages;
let binding: ReturnType<typeof usePagePlacement>;
const state = () => useWorkspaceStore.getState();
const placeOf = (stepId: string) => stepById(state().diagram!, stepId)?.place;
function View({ pages, failed = false }: { pages: PreparedDiagramPages; failed?: boolean }) {
  const value = usePagePlacement(pages, false, failed);
  useEffect(() => {
    binding = value;
  });
  return null;
}
/** The pages laid out again from the diagram as it is now, as a relayout lands them. */
function relayout() {
  pages = preparedPages(state().diagram!, FIXTURE_FONTS, subsetter);
  act(() => root.render(<View pages={pages} />));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  const doc = setPageSetup(insertSteps(createDiagram(), [cpStep('s0'), cpStep('s1')], 0), { layout: 'grid' });
  state().installDiagram({ document: doc, readOnly: false, raw: {} });
  state().setDiagramView('pages');
  state().selectDiagramStep('s0');
  state().selectDiagramPagesPart('picture');
  pages = preparedPages(doc, FIXTURE_FONTS, subsetter);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<View pages={pages} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('page placement transactions', () => {
  it('previews repeated nudges immediately, then commits exactly once and holds until layout catches up', () => {
    const original = state().diagram;
    act(() => {
      for (let i = 0; i < 5; i++) expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
    });
    expect(state().diagram).toBe(original);
    expect(binding.draft?.dx).toBe(2.5);
    act(() => vi.advanceTimersByTime(230));
    expect(state().diagramHistory.past).toHaveLength(1);
    expect(placeOf('s0')?.picture).toEqual([2.5, 0]);
    expect(binding.draft?.pending).toBe(state().diagram);
    relayout();
    expect(binding.draft).toBeNull();
    act(() => state().undoDiagram());
    expect(placeOf('s0')).toBeUndefined();
  });
  it('Escape or Undo cancels the active preview', () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementUpLarge');
    });
    expect(binding.draft?.dy).toBe(-5);
    act(() => {
      expect(cancelPlacementGesture()).toBe(true);
      vi.advanceTimersByTime(230);
    });
    expect(state().diagramHistory.past).toHaveLength(0);
    act(() => {
      runPlacementKey('diagram.nudgePlacementLeft');
    });
    act(() => {
      expect(runPlacementKey('diagram.placementUndo')).toBe(true);
    });
    expect(binding.draft).toBeNull();
    expect(runPlacementKey('diagram.placementUndo')).toBe(false);
    act(() => vi.advanceTimersByTime(230));
    expect(state().diagramHistory.past).toHaveLength(0);
  });
  it('commits a nudge still in its pause when the part or the selection moves, onto the step it nudged', async () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    await act(async () => state().selectDiagramPagesPart('number'));
    expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
    relayout();
    act(() => {
      runPlacementKey('diagram.nudgePlacementDown');
    });
    await act(async () => state().selectDiagramStep('s1'));
    expect(placeOf('s0')?.number).toEqual([0, 0.5]);
    expect(placeOf('s1')).toBeUndefined();
    expect(state().diagramHistory.past).toHaveLength(2);
    act(() => vi.advanceTimersByTime(230));
    expect(state().diagramHistory.past).toHaveLength(2);
  });
  it('commits a nudge still in its pause when the view goes, the view or the detail changes, or another key comes', async () => {
    const nudge = () =>
      act(() => {
        expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
      });
    nudge();
    act(() => root.render(<></>));
    expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
    relayout();
    nudge();
    act(() => {
      expect(runPlacementKey('diagram.nextStep')).toBe(false);
    });
    expect(placeOf('s0')?.picture).toEqual([1, 0]);
    relayout();
    nudge();
    await act(async () => state().openDiagramStep('s0'));
    expect(placeOf('s0')?.picture).toEqual([1.5, 0]);
    act(() => state().closeDiagramStep());
    relayout();
    nudge();
    await act(async () => state().setDiagramView('steps'));
    expect(placeOf('s0')?.picture).toEqual([2, 0]);
  });
  it('commits a nudge still in its pause before another edit, an undo or a save, each its own undo step', () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    act(() => state().setDiagramStepText('s1', 'Fold in half.'));
    expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
    act(() => state().undoDiagram());
    expect(stepById(state().diagram!, 's1')?.text).toBe('');
    expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
    relayout();
    // An undo takes back a nudge in its pause, as it would one committed: and it can be redone.
    act(() => {
      runPlacementKey('diagram.nudgePlacementDown');
    });
    act(() => state().undoDiagram());
    expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
    act(() => state().redoDiagram());
    expect(placeOf('s0')?.picture).toEqual([0.5, 0.5]);
    relayout();
    act(() => {
      runPlacementKey('diagram.nudgePlacementDown');
    });
    act(() => flushPendingEdits());
    expect(placeOf('s0')?.picture).toEqual([0.5, 1]);
  });
  it('drops a nudge still in its pause when another diagram is loaded', () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    const other = setPageSetup(insertSteps(createDiagram(), [cpStep('s0')], 0), { layout: 'grid' });
    act(() => state().installDiagram({ document: other, readOnly: false, raw: {} }));
    expect(binding.draft).toBeNull();
    act(() => vi.advanceTimersByTime(230));
    expect(placeOf('s0')).toBeUndefined();
  });
  it('folds a sitting’s nudges of one part into one undo step, and gives another part its own', () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    act(() => vi.advanceTimersByTime(230));
    // Its pages still laying out: the next nudge carries on from the one committed.
    act(() => {
      expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
    });
    expect(binding.draft?.dx).toBe(1);
    act(() => vi.advanceTimersByTime(230));
    expect(placeOf('s0')?.picture).toEqual([1, 0]);
    expect(state().diagramHistory.past).toHaveLength(1);
    relayout();
    expect(binding.draft).toBeNull();
    act(() => {
      runPlacementKey('diagram.nudgePlacementDown');
    });
    act(() => vi.advanceTimersByTime(230));
    expect(placeOf('s0')?.picture).toEqual([1, 0.5]);
    expect(state().diagramHistory.past).toHaveLength(1);
    relayout();
    act(() => state().selectDiagramPagesPart('number'));
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    act(() => vi.advanceTimersByTime(230));
    expect(placeOf('s0')?.number).toEqual([0.5, 0]);
    expect(state().diagramHistory.past).toHaveLength(2);
    act(() => state().undoDiagram());
    expect(placeOf('s0')).toEqual({ picture: [1, 0.5] });
    act(() => state().undoDiagram());
    expect(placeOf('s0')).toBeUndefined();
  });
  it('leaves the keys to the steps while the pages are another edit’s, laying out', () => {
    act(() => state().setDiagramStepText('s1', 'Fold in half.'));
    expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(false);
    expect(binding.draft).toBeNull();
    relayout();
    act(() => {
      expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
    });
  });
  it('lets go of a committed preview when the layout fails, and holds none while it is failing', () => {
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    act(() => vi.advanceTimersByTime(230));
    expect(binding.draft?.pending).toBe(state().diagram);
    act(() => root.render(<View pages={pages} failed />));
    expect(binding.draft).toBeNull();
    relayout();
    act(() => root.render(<View pages={pages} failed />));
    act(() => {
      runPlacementKey('diagram.nudgePlacementRight');
    });
    act(() => vi.advanceTimersByTime(230));
    expect(placeOf('s0')?.picture).toEqual([1, 0]);
    expect(binding.draft).toBeNull();
  });
});

describe('page placement drags', () => {
  let page: HTMLDivElement, target: HTMLDivElement;
  beforeEach(() => {
    page = document.createElement('div');
    page.dataset.page = '0';
    host.append(page);
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: pages.layout.paper.widthMm }) as DOMRect;
    target = document.createElement('div');
    page.append(target);
    target.setPointerCapture = vi.fn();
  });
  const event = (x: number, y: number) =>
    ({
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: x,
      clientY: y,
      currentTarget: target,
      altKey: true,
      preventDefault() {},
      stopPropagation() {},
    }) as unknown as Parameters<typeof binding.start>[0];

  it('keeps a pointer drag local, commits once on release, and can cancel the next drag', () => {
    const cell = pages.layout.pages[0]!.cells[0]!,
      original = state().diagram;
    act(() => binding.start(event(50, 50), 0, cell, 'picture'));
    act(() => {
      binding.move(event(56, 52));
      binding.move(event(58, 53));
    });
    expect(state().diagram).toBe(original);
    expect(binding.draft?.dx).toBe(8);
    act(() => binding.end(event(58, 53)));
    expect(state().diagramHistory.past).toHaveLength(1);
    expect(placeOf('s0')?.picture).toEqual([8, 3]);
    const committed = state().diagram!;
    relayout();
    act(() => binding.start(event(50, 50), 0, pages.layout.pages[0]!.cells[0]!, 'picture'));
    act(() => binding.move(event(70, 50)));
    act(() => expect(cancelPlacementGesture()).toBe(true));
    expect(state().diagram).toBe(committed);
    expect(state().diagramHistory.past).toHaveLength(1);
  });

  it('selects the part a drag moves once, as the press passes the slop', () => {
    const select = vi.spyOn(state(), 'selectDiagramPagesPart');
    act(() => binding.start(event(50, 50), 0, pages.layout.pages[0]!.cells[0]!, 'picture'));
    expect(select).toHaveBeenCalledTimes(1);
    act(() => binding.move(event(52, 51)));
    expect(select).toHaveBeenCalledTimes(1);
    expect(binding.draft?.dx).toBe(0);
    act(() => {
      for (let x = 56; x < 70; x++) binding.move(event(x, 50));
    });
    expect(select).toHaveBeenCalledTimes(2);
    expect(binding.draft?.dx).toBe(19);
  });

  it('drops a drag whose press lost its capture, and the keys go on', () => {
    act(() => binding.start(event(50, 50), 0, pages.layout.pages[0]!.cells[0]!, 'picture'));
    act(() => binding.move(event(60, 50)));
    act(() => binding.lost({ pointerId: 1 } as Parameters<typeof binding.lost>[0]));
    expect(binding.draft).toBeNull();
    act(() => binding.end(event(60, 50)));
    expect(state().diagramHistory.past).toHaveLength(0);
    // A drag whose element went with its press, the lost capture unseen: the next nudge lets it go.
    act(() => binding.start(event(50, 50), 0, pages.layout.pages[0]!.cells[0]!, 'picture'));
    act(() => binding.move(event(60, 50)));
    target.remove();
    act(() => {
      expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
    });
    expect(binding.draft?.pointer).toBeUndefined();
    expect(binding.draft?.dx).toBe(0.5);
  });

  describe('a press inside a nudge’s pause, which commits the nudge and leaves the pages laying out', () => {
    const nudgeFirst = () =>
      act(() => {
        expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
      });
    const second = () => pages.layout.pages[0]!.cells[1]!;

    it('selects the pressed step’s frame at once, and the next arrow nudges it once the pages catch up', () => {
      nudgeFirst();
      act(() => binding.start(event(50, 50), 0, second(), 'frame'));
      act(() => binding.end(event(50, 50)));
      expect(placeOf('s0')?.picture).toEqual([0.5, 0]);
      expect(state().diagramSelectedStepId).toBe('s1');
      expect(state().diagramPagesPart).toBe('frame');
      relayout();
      act(() => {
        expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(true);
      });
      act(() => vi.advanceTimersByTime(230));
      expect(placeOf('s1')?.frame).toEqual([0.5, 0]);
    });

    it('drags from where the pointer went meanwhile, once the pages catch up', () => {
      nudgeFirst();
      act(() => binding.start(event(50, 50), 0, second(), 'frame'));
      act(() => binding.move(event(58, 53)));
      expect(binding.draft?.cell.stepId).not.toBe('s1');
      relayout();
      expect(binding.draft).toMatchObject({ dx: 8, dy: 3 });
      expect(binding.draft?.cell.stepId).toBe('s1');
      act(() => binding.end(event(58, 53)));
      expect(placeOf('s1')?.frame).toEqual([8, 3]);
    });

    it('lands a drag let go before the pages catch up, once they do, in its own undo step', () => {
      nudgeFirst();
      act(() => binding.start(event(50, 50), 0, second(), 'frame'));
      act(() => {
        binding.move(event(56, 50));
        binding.end(event(56, 50));
        binding.lost({ pointerId: 1 } as Parameters<typeof binding.lost>[0]);
      });
      expect(placeOf('s1')).toBeUndefined();
      relayout();
      expect(placeOf('s1')?.frame).toEqual([6, 0]);
      expect(state().diagramHistory.past).toHaveLength(2);
    });

    it('lets a held press go on Escape', () => {
      nudgeFirst();
      act(() => binding.start(event(50, 50), 0, second(), 'frame'));
      act(() => binding.move(event(60, 50)));
      act(() => expect(cancelPlacementGesture()).toBe(true));
      relayout();
      expect(binding.draft).toBeNull();
      act(() => binding.end(event(60, 50)));
      expect(placeOf('s1')).toBeUndefined();
    });
  });

  describe('a caption’s grips (`diagram-caption-resize.md`)', () => {
    const LONG = 'Valley fold the flaps inward. Note that the top of each crease does not line up with the top corner of the paper';
    /** The diagram with a long caption on `s0`, its text selected, laid out — on a flow page, held as packed. */
    function withCaption(layout: 'grid' | 'flow') {
      const doc = setPageSetup(setStepText(insertSteps(createDiagram(), [cpStep('s0'), cpStep('s1'), cpStep('s2')], 0), 's0', LONG), { layout });
      act(() => {
        state().installDiagram({ document: doc, readOnly: false, raw: {} });
        state().setDiagramView('pages');
        if (layout === 'flow') state().adoptDiagramPageArrangements(preparedPages(doc, FIXTURE_FONTS, subsetter).layout.packed ?? {}, doc);
        state().selectDiagramStep('s0');
        state().selectDiagramPagesPart('text');
      });
      relayout();
      expect(state().diagramHistory.past).toHaveLength(0);
    }
    const s0 = () => pages.layout.pages[0]!.cells.find((cell) => cell.stepId === 's0')!;
    const previewOf = (stepId: string) => binding.pages!.layout.pages[0]!.cells.find((cell) => cell.stepId === stepId)!;
    const lines = (cell: LayoutCell) => cell.text.lines.map((line) => line.text);
    /** A press on `grip`, dragged by `dx`, `dy` — by way of `via`, past the slop, when given — and the release that ends it. */
    const drag = (grip: 'left' | 'right' | 'bottom', dx: number, dy: number, snap = false, via?: [number, number]) => {
      const box = partBox(s0(), 'text');
      const [x, y] = grip === 'left' ? [box.x, box.y + box.h / 2] : grip === 'right' ? [box.x + box.w, box.y + box.h / 2] : [box.x + box.w / 2, box.y + box.h];
      const at = (px: number, py: number) => ({ ...event(px, py), altKey: !snap }) as unknown as Parameters<typeof binding.start>[0];
      act(() => binding.start(at(x, y), 0, s0(), 'text', false, grip));
      if (via) act(() => binding.move(at(x + via[0], y + via[1])));
      act(() => binding.move(at(x + dx, y + dy)));
      return () => act(() => binding.end(at(x + dx, y + dy)));
    };

    it.each(['grid', 'flow'] as const)('widens by the right grip, rewrapping live, and commits once on release as the layout draws it: %s', (layout) => {
      withCaption(layout);
      const before = s0();
      const box = partBox(before, 'text');
      const original = state().diagram;
      const release = drag('right', 22, 0);
      // Live: the caption re-set at the width the grip asks for — its measure reaching the pointer — nothing committed.
      expect(state().diagram).toBe(original);
      const width = binding.draft!.caption!.width;
      const preview = previewOf('s0').text;
      expect(Math.abs(preview.x + width - (box.x + box.w + 22))).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(preview.x).toBeCloseTo(before.text.x + captionStartShift(before, undefined, width), 9);
      expect(preview.lines.length).toBeLessThan(before.text.lines.length);
      release();
      expect(state().diagramHistory.past).toHaveLength(1);
      expect(placeOf('s0')).toEqual({ textWidth: binding.draft!.caption!.width });
      relayout();
      // The layout draws what the preview showed; no other step moves.
      expect(s0().text).toEqual(preview);
      expect(lines(s0())).toEqual(preview.lines.map((line) => line.text));
      for (const id of ['s1', 's2']) expect(previewOf(id)).toEqual(pages.layout.pages[0]!.cells.find((cell) => cell.stepId === id));
      act(() => state().undoDiagram());
      expect(placeOf('s0')).toBeUndefined();
    });

    it('keeps the box’s right edge with the left grip, the caption’s offset moving the other way in the same commit', () => {
      withCaption('flow');
      const box = partBox(s0(), 'text');
      const release = drag('left', -18, 0);
      expect(binding.draft?.caption?.width).toBeCloseTo(Math.round((box.w + 18) * 10) / 10, 9);
      const preview = partBox(previewOf('s0'), 'text');
      expect(preview.x + preview.w).toBeCloseTo(box.x + box.w, 9);
      release();
      expect(state().diagramHistory.past).toHaveLength(1);
      const place = placeOf('s0')!;
      expect(place.textWidth).toBe(binding.draft!.caption!.width);
      expect(place.text![0]).toBeLessThan(0);
      expect(place.text![1]).toBe(0);
      relayout();
      const after = partBox(s0(), 'text');
      // The offset is kept to a tenth of a mm.
      expect(Math.abs(after.x + after.w - (box.x + box.w))).toBeLessThanOrEqual(0.05 + 1e-9);
      act(() => state().undoDiagram());
      expect(placeOf('s0')).toBeUndefined();
    });

    it('asks for fewer lines by the bottom grip, at the narrowest width that sets in them, its left edge kept; back where it began, nothing', () => {
      withCaption('grid');
      const before = s0();
      const back = drag('bottom', 0, 1, false, [0, 2 * STEP_TEXT_LEADING_MM]);
      expect(binding.draft?.caption).toMatchObject({ pin: null, width: before.text.widthMm });
      back();
      expect(state().diagramHistory.past).toHaveLength(0);
      relayout();
      const release = drag('bottom', 0, -2 * STEP_TEXT_LEADING_MM);
      const wanted = before.text.lines.length - 2;
      const width = binding.draft!.caption!.width;
      expect(previewOf('s0').text.lines).toHaveLength(wanted);
      expect(setCaption(LONG, width - 0.1, pages.setter).length).toBeGreaterThan(wanted);
      expect(previewOf('s0').text.x).toBe(before.text.x);
      release();
      expect(placeOf('s0')).toEqual({ textWidth: width });
      relayout();
      expect(s0().text.lines).toHaveLength(wanted);
      expect(s0().text.x).toBe(before.text.x);
    });

    it('snaps a width grip to the automatic width, which lets the pin go, and counts nothing it did not change', () => {
      withCaption('grid');
      const auto = s0().text.widthMm;
      // Pinned wide first.
      drag('right', 30, 0)();
      relayout();
      expect(placeOf('s0')?.textWidth).toBeGreaterThan(auto);
      // Then dragged back near the automatic width, snapping.
      const box = partBox(s0(), 'text');
      const release = drag('right', auto - box.w + 0.8, 0, true);
      expect(binding.draft?.caption).toMatchObject({ pin: null, snap: 'auto', width: auto });
      release();
      expect(placeOf('s0')).toBeUndefined();
      expect(state().diagramHistory.past).toHaveLength(2);
    });

    it('lets Escape drop a grip’s drag with nothing committed', () => {
      withCaption('grid');
      drag('right', 25, 0);
      act(() => expect(cancelPlacementGesture()).toBe(true));
      expect(binding.draft).toBeNull();
      expect(state().diagramHistory.past).toHaveLength(0);
    });
  });

  it('selects the frame first, drills into its picture on the next click, and still drags the whole frame', () => {
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: pages.layout.paper.widthMm }) as DOMRect;
    const cell = pages.layout.pages[0]!.cells[0]!,
      box = partBox(cell, 'picture');
    const at = (dx = 0) =>
      ({
        button: 0,
        pointerType: 'mouse',
        pointerId: 1,
        clientX: box.x + box.w / 2 + dx,
        clientY: box.y + box.h / 2,
        currentTarget: target,
        altKey: true,
        preventDefault() {},
        stopPropagation() {},
      }) as unknown as Parameters<typeof binding.start>[0];
    act(() => state().selectDiagramStep('s1'));
    act(() => binding.start(at(), 0, cell, 'frame'));
    act(() => binding.end(at()));
    expect(binding.selected).toBe('s0');
    expect(binding.part).toBe('frame');
    act(() => binding.start(at(), 0, cell, 'frame'));
    expect(binding.part).toBe('frame');
    act(() => binding.end(at()));
    expect(binding.part).toBe('picture');
    expect(state().diagramHistory.past).toHaveLength(0);
    act(() => state().selectDiagramPagesPart('frame'));
    act(() => binding.start(at(), 0, cell, 'frame'));
    act(() => binding.move(at(8)));
    act(() => binding.end(at(8)));
    expect(binding.part).toBe('frame');
    expect(placeOf('s0')?.frame).toEqual([8, 0]);
    expect(placeOf('s0')?.picture).toBeUndefined();
    expect(state().diagramHistory.past).toHaveLength(1);
  });
});

it('disables placement and declines nudges on a phone-sized touch surface', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  act(() => root.render(<View pages={pages} />));
  expect(binding.enabled).toBe(false);
  expect(runPlacementKey('diagram.nudgePlacementRight')).toBe(false);
  expect(state().diagramHistory.past).toHaveLength(0);
});
