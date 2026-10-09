import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldStepMotion } from './foldStepMotion';
import { hingeMotion } from './foldStepPoses';
import { useFoldStepPlayback, type FoldStepPlaybackSurface } from './useFoldStepPlayback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = vi.hoisted(() => vi.fn());
vi.mock('../../analytics', () => ({
  ANALYTICS_EVENTS: { foldStepPlayed: 'fold step played' },
  track,
}));

const square = (x0: number, x1: number): ScenePoint[] => [
  [x0, 0],
  [x1, 0],
  [x1, 100],
  [x0, 100],
];
const face = (id: number, side: PaperFaceItem['side'], ring: ScenePoint[]): PaperFaceItem => ({
  kind: 'face',
  face: id,
  side,
  rings: [ring],
  shade: 1,
  hidden: false,
});
const scene = (...items: PaperFaceItem[]): PaperScene => ({
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  sheet: 100,
  items,
});

function book(): FoldStepMotion {
  const before = scene(face(0, 'front', square(0, 100)));
  const after = scene(face(1, 'front', square(0, 50)), face(0, 'back', square(0, 50)));
  return {
    step: 'mountain',
    before,
    after,
    motion: hingeMotion(before, after, new Set([0]), { at: [50, 0], along: [0, 1] }, 'mirrored', 'mountain'),
  };
}

let surface: FoldStepPlaybackSurface | null = null;
/** Captured in an effect, which `act` flushes. */
function Probe({ motion }: { motion: FoldStepMotion | null }) {
  const playback = useFoldStepPlayback({ motion });
  useEffect(() => {
    surface = playback;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;
const render = (motion: FoldStepMotion | null) =>
  act(() =>
    root.render(
      <StrictMode>
        <Probe motion={motion} />
      </StrictMode>
    )
  );

beforeEach(() => {
  // Motion is unwelcome: every play snaps to its end, no frames to drive.
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  track.mockClear();
  surface = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('useFoldStepPlayback', () => {
  it('is available only with a motion, and counts each play by its trigger and kind', () => {
    render(null);
    expect(surface?.available).toBe(false);
    const motion = book();
    render(motion);
    expect(surface).toMatchObject({ available: true, playing: false, complete: false });
    act(() => surface?.toggle());
    expect(surface?.complete).toBe(true);
    expect(track).toHaveBeenCalledWith('fold step played', { trigger: 'user', step_kind: 'mountain' });
    // Played through, Play replays it.
    act(() => surface?.toggle());
    expect(track).toHaveBeenCalledTimes(2);
    expect(surface?.complete).toBe(true);
  });

  it('keeps its sources live through the development double mount', () => {
    render(book());
    const heard = vi.fn();
    const off = surface!.frames.subscribe(heard);
    act(() => surface?.seek(0.4));
    expect(heard).toHaveBeenCalled();
    expect(surface?.frames.current()).not.toBeNull();
    expect(surface?.position.current()).toBeCloseTo(0.4, 9);
    // The status still follows the transport after the remount.
    act(() => surface?.seek(1));
    expect(surface?.complete).toBe(true);
    off();
  });

  it('hears a step play itself out on the animation frames, after the double mount', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
    try {
      render(book());
      act(() => surface?.toggle());
      expect(surface?.playing).toBe(true);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      // Only the transport saw the run end: the hook re-rendered on its word.
      expect(surface).toMatchObject({ playing: false, complete: true });
      expect(surface?.frames.current()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a new step at rest, the pane drawing its own scene', () => {
    render(book());
    act(() => surface?.seek(0.5));
    render(book());
    expect(surface).toMatchObject({ available: true, playing: false, complete: false });
    expect(surface?.frames.current()).toBeNull();
  });
});
