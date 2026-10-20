import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoldPaperShape, FoldStartSide } from '../../fold/paperShape';
import {
  DEFAULT_DOCUMENT_PAPER_STYLE,
  type DocumentPaperStyle,
  type DocumentPaperStyleChoice,
} from '../../lib/paper/documentPaperStyle';
import { builtInPaperPreset } from '../../lib/paper/paperPresets';
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
const onStyleChange = vi.fn<(choice: DocumentPaperStyleChoice) => void>();

/** The tab over document state it owns, as the store will hold it. */
function Harness({
  initial,
  stepCount = 0,
  readOnly = false,
  initialStyle = DEFAULT_DOCUMENT_PAPER_STYLE,
}: {
  initial: FoldPaperShape;
  stepCount?: number;
  readOnly?: boolean;
  initialStyle?: DocumentPaperStyle;
}) {
  const [shape, setShape] = useState(initial);
  const [side, setSide] = useState<FoldStartSide>('front');
  const [style, setStyle] = useState(initialStyle);
  return (
    <TooltipProvider>
      <FoldPaperPane
        style={style}
        onStyleChange={(choice) => {
          onStyleChange(choice);
          setStyle(choice.style);
        }}
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
  onStyleChange.mockReset();
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
const styleShown = () => host.querySelector('button[aria-label="Style"]')?.textContent ?? null;

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
  describe('style', () => {
    it('picks the sequence’s own style as the Diagram picks a diagram’s, the Diagram style first', async () => {
      render({ initial: { shape: 'square' } });
      // No colour pickers: the look is a style, chosen whole.
      expect(host.querySelector('input[type="color"]')).toBeNull();
      expect(styleShown()).toBe('Diagram');
      await choose('Style', 'Default');
      expect(onStyleChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'builtin:default', analytics: 'default' }));
      expect(styleShown()).toBe('Default');
    });

    it('copies the Settings export style into the sequence as it is when chosen', async () => {
      render({ initial: { shape: 'square' } });
      await choose('Style', 'Export style from Settings');
      expect(onStyleChange.mock.lastCall?.[0].style).toEqual({ style: display() });
      expect(onStyleChange.mock.lastCall?.[0].analytics).toBe('export-style');
    });

    it('names a style no choice holds the sequence’s own', () => {
      render({ initial: { shape: 'square' }, initialStyle: { style: { ...DEFAULT_PAPER_STYLE, erode: 0.2 } } });
      expect(styleShown()).toBe('This sequence’s own');
    });
  });

  describe('start side', () => {
    it('is Front up or Back up, each with its face’s colour in the sequence’s style', () => {
      render({ initial: { shape: 'square' } });
      expect(pressed('Start')).toEqual(['Front up']);
      const swatches = [...host.querySelectorAll<HTMLElement>('[role="group"][aria-label="Start"] button span')]
        .map((element) => element.style.background)
        .filter(Boolean);
      // The Diagram style's: white, with a grey colour side.
      const { front, back } = builtInPaperPreset('diagram').style.paper;
      expect(front).toBe('#ffffff');
      expect(back).toBe('#b3b3b3');
      expect(swatches).toEqual(['rgb(255, 255, 255)', 'rgb(179, 179, 179)']);
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

  it('keeps a read-only sequence’s sheet and style as they are', () => {
    render({ initial: { shape: 'regular', sides: 5 }, stepCount: 3, readOnly: true });
    expect(segment('Shape', 'Rectangle')?.disabled).toBe(true);
    expect(segment('Start', 'Back up')?.disabled).toBe(true);
    expect(input('Sides')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Style"]')?.disabled).toBe(true);
    // Nothing to warn about: the shape cannot change.
    expect(notice()).toBeNull();
  });
});
