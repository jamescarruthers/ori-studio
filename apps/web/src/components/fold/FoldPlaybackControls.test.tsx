import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLD_DURATION_MS } from '../../lib/foldMotion/foldPlayback';
import { FakeFoldClock } from '../../lib/foldMotion/foldTransport.fixtures';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldStepMotion } from '../../fold/animation/foldStepMotion';
import { FoldStepPlayback } from '../../fold/animation/foldStepPlayback';
import { hingeMotion } from '../../fold/animation/foldStepPoses';
import type { FoldStepPlaybackSurface } from '../../fold/animation/useFoldStepPlayback';
import { TooltipProvider } from '../ui/Tooltip';
import { FoldPlaybackControls } from './FoldPlaybackControls';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    step: 'valley',
    before,
    after,
    motion: hingeMotion(before, after, new Set([0]), { at: [50, 0], along: [0, 1] }, 'mirrored', 'valley'),
  };
}

let host: HTMLDivElement;
let root: Root;
let clock: FakeFoldClock;
let playback: FoldStepPlayback;

/** The surface the hook would hand over, read off the playback now. */
function surface(): FoldStepPlaybackSurface {
  return {
    ...playback.status(),
    toggle: () => playback.toggle(),
    seek: (progress) => playback.seek(progress),
    step: (direction) => playback.step(direction),
    frames: playback.frames,
    position: playback.position,
  };
}

const render = () =>
  act(() =>
    root.render(
      <TooltipProvider>
        <FoldPlaybackControls playback={surface()} />
      </TooltipProvider>
    )
  );

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const slider = () => host.querySelector<HTMLInputElement>('input[type="range"]');

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  clock = new FakeFoldClock();
  playback = new FoldStepPlayback({ clock, reducedMotion: () => false });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  playback.dispose();
});

describe('FoldPlaybackControls', () => {
  it('is a group of the step’s transport, disabled while the step has nothing to play', () => {
    render();
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Step playback');
    expect(button('Play step')?.disabled).toBe(true);
    expect(button('Step forward')?.disabled).toBe(true);
    expect(slider()?.disabled).toBe(true);
    expect(slider()?.getAttribute('aria-label')).toBe('Step progress');
  });

  it('plays, names Pause while it moves, and Replay once it has played', () => {
    playback.setMotion(book());
    render();
    act(() => button('Play step')?.click());
    render();
    expect(button('Pause')).not.toBeNull();
    act(() => {
      for (let i = 0; i < 100 && playback.status().playing; i += 1) clock.frame(25);
    });
    render();
    expect(button('Replay step')).not.toBeNull();
    expect(slider()?.value).toBe('100');
  });

  it('follows the step with the scrubber and seeks where it is dragged', () => {
    playback.setMotion(book());
    render();
    act(() => button('Play step')?.click());
    act(() => clock.frame(FOLD_DURATION_MS / 2));
    expect(Number(slider()?.value)).toBe(50);
    const seek = vi.spyOn(playback, 'seek');
    render();
    act(() => {
      const input = slider()!;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(input, '25');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(seek).toHaveBeenCalledWith(0.25);
    expect(slider()?.getAttribute('aria-valuetext')).toBe('25%');
  });

  it('steps an eighth on', () => {
    playback.setMotion(book());
    render();
    act(() => button('Step forward')?.click());
    expect(playback.position.current()).toBeCloseTo(0.125, 9);
    expect(slider()?.value).toBe('13');
  });
});
