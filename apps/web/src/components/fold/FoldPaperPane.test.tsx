import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoldPaperShape, FoldStartSide } from '../../fold/paperShape';
import { DEFAULT_PAPER_STYLE } from '../../lib/paper/paperStyle';
import { useSettingsStore } from '../../store/settingsStore';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldPaperPane } from './FoldPaperPane';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tracked: Record<string, unknown>[] = [];
vi.mock('../../analytics', () => ({
  ANALYTICS_EVENTS: new Proxy({}, { get: (_t, key) => String(key) }),
  track: (_event: string, properties: Record<string, unknown>) => {
    tracked.push(properties);
  },
}));

// Radix Select scrolls the selected option into view as it opens.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

let host: HTMLDivElement;
let root: Root;
const onShapeChange = vi.fn<(shape: FoldPaperShape) => void>();
const onStartSideChange = vi.fn<(side: FoldStartSide) => void>();

/** The tab over document state it owns, as the store will hold it. */
function Harness({
  initial,
  stepCount = 0,
  readOnly = false,
}: {
  initial: FoldPaperShape;
  stepCount?: number;
  readOnly?: boolean;
}) {
  const [shape, setShape] = useState(initial);
  const [side, setSide] = useState<FoldStartSide>('front');
  return (
    <TooltipProvider>
      <FoldPaperPane
        shape={shape}
        startSide={side}
        stepCount={stepCount}
        readOnly={readOnly}
        onShapeChange={(next) => {
          onShapeChange(next);
          setShape(next);
        }}
        onStartSideChange={(next) => {
          onStartSideChange(next);
          setSide(next);
        }}
      />
    </TooltipProvider>
  );
}

beforeEach(() => {
  tracked.length = 0;
  onShapeChange.mockReset();
  onStartSideChange.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
});

const render = (props: Parameters<typeof Harness>[0]) => act(() => root.render(<Harness {...props} />));
const button = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === name || element.getAttribute('aria-label') === name
  );
const segment = (group: string, name: string) =>
  host.querySelector<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button[aria-label="${name}"]`) ??
  [...host.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button`)].find(
    (element) => element.textContent?.trim() === name
  );
const pressed = (group: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${group}"] button`)]
    .filter((element) => element.getAttribute('aria-pressed') === 'true')
    .map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim());
const input = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
const notice = () => host.querySelector('[role="status"]')?.textContent ?? null;
const display = () => useSettingsStore.getState().paperStyle.display;

/** Type into a number field and leave it, which commits. */
function typeAndCommit(field: HTMLInputElement | null, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!field || !setter) throw new Error('no field to type into');
  act(() => {
    field.focus();
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => field.blur());
}

/** Pick a colour the way React sees a native colour input do it. */
function pick(name: string, value: string) {
  const swatch = host.querySelector<HTMLInputElement>(`input[type="color"][aria-label="${name}"]`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!swatch || !setter) throw new Error(`no ${name} swatch`);
  act(() => {
    setter.call(swatch, value);
    swatch.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choose(selectLabel: string, option: string) {
  const trigger = host.querySelector<HTMLButtonElement>(`button[aria-label="${selectLabel}"]`);
  await act(async () => {
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  const item = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (element) => element.textContent?.trim() === option
  );
  if (!item) throw new Error(`no ${option} option`);
  await act(async () => item.click());
}

describe('FoldPaperPane', () => {
  describe('colours', () => {
    it('edits the app’s display style, counted as Fold’s', () => {
      render({ initial: { shape: 'square' } });
      pick('Front', '#123456');
      expect(display().paper.front).toBe('#123456');
      expect(tracked).toEqual([{ source: 'fold', slot: 'display', field: 'paper.front' }]);
    });

    it('resets only the colours it shows', () => {
      act(() => useSettingsStore.getState().setPaperStyleField('display', 'paper.back', '#224466'));
      act(() =>
        useSettingsStore
          .getState()
          .setPaperStyleField('display', 'edges', { ...DEFAULT_PAPER_STYLE.edges, color: '#ff0000' })
      );
      render({ initial: { shape: 'square' } });
      act(() => button('Reset colors')?.click());
      expect(display().paper).toEqual(DEFAULT_PAPER_STYLE.paper);
      // A pen is Settings ▸ Paper's: the tab's reset never touches it.
      expect(display().edges.color).toBe('#ff0000');
    });

    it('opens Settings on the Paper tab for everything else', () => {
      render({ initial: { shape: 'square' } });
      act(() => button('Edit paper style…')?.click());
      expect(useSettingsStore.getState()).toMatchObject({ isSettingsOpen: true, settingsInitialTab: 'paper' });
    });
  });

  describe('start side', () => {
    it('is Front up or Back up, each with its face’s colour', () => {
      render({ initial: { shape: 'square' } });
      expect(pressed('Start')).toEqual(['Front up']);
      const swatches = [...host.querySelectorAll<HTMLElement>('[role="group"][aria-label="Start"] button span')]
        .map((element) => element.style.background)
        .filter(Boolean);
      expect(swatches).toEqual(['rgb(255, 255, 50)', 'rgb(233, 233, 233)']);
      act(() => segment('Start', 'Back up')?.click());
      expect(onStartSideChange).toHaveBeenCalledWith('back');
      expect(pressed('Start')).toEqual(['Back up']);
    });
  });

  describe('shape', () => {
    it('offers the three kinds by name, and starts a new one at its first offer', () => {
      render({ initial: { shape: 'square' } });
      expect(pressed('Shape')).toEqual(['Square']);
      act(() => segment('Shape', 'Square')?.click());
      // The same sheet is no change, so nothing starts over.
      expect(onShapeChange).not.toHaveBeenCalled();

      act(() => segment('Shape', 'Polygon')?.click());
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'regular', sides: 6 });
      act(() => segment('Shape', 'Rectangle')?.click());
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'rectangle', width: Math.SQRT1_2, height: 1 });
      expect(host.querySelector('button[aria-label="Proportions"]')?.textContent).toBe('1:√2');
    });

    it('takes a polygon’s sides, 3 to 8', () => {
      render({ initial: { shape: 'regular', sides: 6 } });
      typeAndCommit(input('Sides'), '5');
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'regular', sides: 5 });
      // Clamped to the range the tab offers.
      typeAndCommit(input('Sides'), '12');
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'regular', sides: 8 });
    });

    it('picks a rectangle preset, or keeps a custom width and height as typed', async () => {
      render({ initial: { shape: 'rectangle', width: Math.SQRT1_2, height: 1 } });
      expect(input('Width')).toBeNull();
      await choose('Proportions', '2:1');
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'rectangle', width: 1, height: 0.5 });

      await choose('Proportions', 'Custom');
      expect(input('Width')?.value).toBe('1');
      expect(input('Height')?.value).toBe('0.5');
      typeAndCommit(input('Width'), '3');
      typeAndCommit(input('Height'), '4');
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'rectangle', width: 0.75, height: 1 });
      // The fields keep what was typed, though the sheet is stored at longer side 1.
      expect([input('Width')?.value, input('Height')?.value]).toEqual(['3', '4']);
      // 3:4 is a preset; the select names it once Custom is put down.
      await choose('Proportions', '3:4');
      expect(host.querySelector('button[aria-label="Proportions"]')?.textContent).toBe('3:4');
      expect(input('Width')).toBeNull();
    });

    it('turns a custom rectangle with equal sides into the square', async () => {
      render({ initial: { shape: 'rectangle', width: 0.75, height: 1 } });
      expect(host.querySelector('button[aria-label="Proportions"]')?.textContent).toBe('3:4');
      await choose('Proportions', 'Custom');
      typeAndCommit(input('Width'), '1');
      expect(onShapeChange).toHaveBeenLastCalledWith({ shape: 'square' });
      expect(pressed('Shape')).toEqual(['Square']);
    });

    it('says beforehand that a new shape starts the sequence over', () => {
      render({ initial: { shape: 'square' } });
      expect(notice()).toBeNull();
      render({ initial: { shape: 'square' }, stepCount: 1 });
      expect(notice()).toBe(
        'Changing the shape starts over: the sequence’s 1 step is cleared. Undo brings it back.'
      );
      render({ initial: { shape: 'square' }, stepCount: 7 });
      expect(notice()).toBe(
        'Changing the shape starts over: the sequence’s 7 steps are cleared. Undo brings them back.'
      );
    });
  });

  it('keeps a read-only sequence’s sheet as it is, and its colours editable', () => {
    render({ initial: { shape: 'regular', sides: 5 }, stepCount: 3, readOnly: true });
    expect(segment('Shape', 'Rectangle')?.disabled).toBe(true);
    expect(segment('Start', 'Back up')?.disabled).toBe(true);
    expect(input('Sides')?.disabled).toBe(true);
    // Nothing to warn about: the shape cannot change.
    expect(notice()).toBeNull();
    pick('Back', '#010203');
    expect(display().paper.back).toBe('#010203');
  });
});
