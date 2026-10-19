import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { picturePreviewCache } from '../../diagram/pictures/picturePreviewCache';
import { DiagramPagePreview } from './DiagramPagePreview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let pending: { src: string; resolve: (canvas: HTMLCanvasElement) => void; reject: (error: Error) => void }[];
const drawImage = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  pending = [];
  drawImage.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(picturePreviewCache, 'get').mockImplementation((src) => new Promise((resolve, reject) => {
    pending.push({ src, resolve, reject });
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const render = (src = 'old.svg', scale = 1) => act(() => root.render(
  <DiagramPagePreview src={src} width={800} height={1100} scale={scale} />
));
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(150); });
async function finish(index: number, width = 1600, height = 2200) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  await act(async () => pending[index]!.resolve(canvas));
  return canvas;
}

describe('DiagramPagePreview', () => {
  it('uses a bitmap while navigating and waits for zoom to settle before sharpening', async () => {
    render();
    await settle();
    const initial = await finish(0);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('canvas')!.hidden).toBe(false);
    expect(drawImage).toHaveBeenLastCalledWith(initial, 0, 0);
    render('old.svg', 1.1);
    act(() => vi.advanceTimersByTime(100));
    render('old.svg', 2.1);
    act(() => vi.advanceTimersByTime(100));
    expect(pending).toHaveLength(1);
    expect(host.querySelector('canvas')!.hidden).toBe(false);
    await settle();
    expect(pending).toHaveLength(2);
    await finish(1);
  });

  it('keeps the old pixels until a changed source is drawn, and ignores late results', async () => {
    render();
    await settle();
    const initial = await finish(0);
    // A drag lifts a part and lands it: each is a new source of the same page.
    render('lifted.svg');
    expect(host.querySelector('canvas')!.hidden).toBe(false);
    expect(host.querySelector('img')).toBeNull();
    expect(drawImage).toHaveBeenLastCalledWith(initial, 0, 0);
    await settle();
    render('landed.svg');
    await settle();
    const latest = await finish(2);
    const paints = drawImage.mock.calls.length;
    await finish(1);
    expect(drawImage).toHaveBeenCalledTimes(paints);
    expect(drawImage).toHaveBeenLastCalledWith(latest, 0, 0);
    expect(host.querySelector('img')).toBeNull();
  });

  it('stops showing old pixels when the new source has another shape', async () => {
    render();
    await settle();
    await finish(0);
    // New paper: the portrait bitmap would be stretched into a landscape box.
    act(() => root.render(<DiagramPagePreview src="landscape.svg" width={1100} height={800} scale={1} />));
    expect(host.querySelector('canvas')!.hidden).toBe(true);
    expect(host.querySelector('img')!.getAttribute('src')).toBe('landscape.svg');
  });

  it('reports each source once its own pixels are on screen', async () => {
    const onPaint = vi.fn();
    const show = (src: string) => act(() => root.render(
      <DiagramPagePreview src={src} width={800} height={1100} scale={1} onPaint={onPaint} />
    ));
    show('old.svg');
    await settle();
    await finish(0);
    expect(onPaint).toHaveBeenLastCalledWith('old.svg');
    show('new.svg');
    await settle();
    expect(onPaint).toHaveBeenCalledTimes(1);
    await finish(1);
    expect(onPaint).toHaveBeenLastCalledWith('new.svg');
  });

  it('does not rasterize again once the bitmap is as sharp as the zoom asks', async () => {
    render();
    await settle();
    await finish(0);
    await settle();
    await settle();
    expect(pending).toHaveLength(1);
  });

  it('keeps the SVG fallback on failure and discards work after unmount', async () => {
    render();
    await settle();
    await act(async () => pending[0]!.reject(new Error('no canvas')));
    expect(host.querySelector('img')!.getAttribute('src')).toBe('old.svg');
    render('next.svg');
    await settle();
    act(() => root.render(null));
    await finish(1);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('falls back to the vector if drawing a sharper bitmap fails after clearing the canvas', async () => {
    render();
    await settle();
    await finish(0);
    render('old.svg', 3);
    await settle();
    drawImage.mockImplementationOnce(() => { throw new Error('canvas exhausted'); });
    await finish(1);
    expect(host.querySelector('canvas')!.hidden).toBe(true);
    expect(host.querySelector('img')!.getAttribute('src')).toBe('old.svg');
  });
});

it('reuses an already rasterized step on remount without waiting for the zoom delay', () => {
  const cached = document.createElement('canvas'); cached.width = 256; cached.height = 256;
  vi.spyOn(picturePreviewCache, 'ready').mockReturnValue(cached);
  act(() => root.render(<DiagramPagePreview src="cached.svg" width={256} height={256} scale={1} settleMs={0} />));
  expect(drawImage).toHaveBeenLastCalledWith(cached, 0, 0);
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('canvas')!.hidden).toBe(false);
});
it('retains the vector if copying a cached bitmap cannot allocate a canvas', () => {
  vi.spyOn(picturePreviewCache, 'ready').mockReturnValue(document.createElement('canvas'));
  drawImage.mockImplementationOnce(() => { throw new Error('no canvas'); });
  render();
  expect(host.querySelector('canvas')!.hidden).toBe(true);
  expect(host.querySelector('img')!.getAttribute('src')).toBe('old.svg');
});

it('rasterizes new page and card sources before the zoom delay without an extra SVG paint, and keeps failure fallback', async () => {
  act(() => root.render(<DiagramPagePreview src="step.svg" width={256} height={256} scale={1} vectorWhileLoading={false} />));
  expect(host.querySelector('img')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(pending).toHaveLength(1);
  await finish(0, 256, 256);
  expect(host.querySelector('canvas')!.hidden).toBe(false);
  expect(host.querySelector('img')).toBeNull();
  act(() => root.render(<DiagramPagePreview src="changed.svg" width={256} height={256} scale={1} vectorWhileLoading={false} />));
  // The previous bitmap stays until the change is drawn: no spinner, no extra SVG paint.
  expect(host.querySelector('canvas')!.hidden).toBe(false);
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('svg')).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => pending[1]!.reject(new Error('unavailable')));
  expect(host.querySelector('canvas')!.hidden).toBe(true);
  expect(host.querySelector('img')!.getAttribute('src')).toBe('changed.svg');
});

it('waits for a square card measurement before rasterizing, rather than painting a guessed resolution first', async () => {
  let measure!: (entries: { contentRect: { width: number } }[]) => void;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: typeof measure) { measure = callback; }
    observe() {}
    disconnect() {}
  });
  try {
    act(() => root.render(<DiagramPagePreview src="measured.svg" width={256} height={256} scale={1} autoSize settleMs={0} vectorWhileLoading={false} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(pending).toHaveLength(0);
    act(() => measure([{ contentRect: { width: 410 } }]));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(picturePreviewCache.get).toHaveBeenCalledWith('measured.svg', { width: 448, height: 448 });
    expect(pending).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});

it('copies a cached bitmap only once when its cache promise also resolves', async () => {
  const cached = document.createElement('canvas');
  vi.spyOn(picturePreviewCache, 'ready').mockReturnValue(cached);
  vi.mocked(picturePreviewCache.get).mockResolvedValue(cached);
  render();
  await settle();
  expect(drawImage).toHaveBeenCalledTimes(1);
});
