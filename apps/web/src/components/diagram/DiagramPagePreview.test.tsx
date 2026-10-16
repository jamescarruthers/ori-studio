import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagePreviewCache } from '../../diagram/pages/pagePreviewCache';
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
  vi.spyOn(pagePreviewCache, 'get').mockImplementation((src) => new Promise((resolve, reject) => {
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
async function finish(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 2200;
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

  it('immediately stops showing old pixels on paper/style edits and ignores late results', async () => {
    render();
    await settle();
    await finish(0);
    render('new-paper.svg');
    expect(host.querySelector('canvas')!.hidden).toBe(true);
    expect(host.querySelector('img')!.getAttribute('src')).toBe('new-paper.svg');
    await settle();
    render('new-marks.svg');
    await settle();
    const latest = await finish(2);
    const paints = drawImage.mock.calls.length;
    await finish(1);
    expect(drawImage).toHaveBeenCalledTimes(paints);
    expect(drawImage).toHaveBeenLastCalledWith(latest, 0, 0);
    expect(host.querySelector('img')).toBeNull();
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
