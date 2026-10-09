import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FOLD_DURATION_MS, TWIN_HOLD_MS } from '../../lib/foldMotion/foldPlayback';
import { AUTO_PLAY_SETTLE_MS } from '../../lib/foldMotion/foldTransport';
import { FakeFoldClock } from '../../lib/foldMotion/foldTransport.fixtures';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import { CROSSFADE_PACE, type FoldStepMotion } from './foldStepMotion';
import { FoldStepPlayback, type FoldStepPlaybackOptions } from './foldStepPlayback';
import { crossfadeMotion, hingeMotion, type FoldPosedFrame } from './foldStepPoses';

const square = (x0: number, x1: number): ScenePoint[] => [
  [x0, 0],
  [x1, 0],
  [x1, 100],
  [x0, 100],
];
const faceItem = (face: number, side: PaperFaceItem['side'], ring: ScenePoint[]): PaperFaceItem => ({
  kind: 'face',
  face,
  side,
  rings: [ring],
  outline: 'edge',
  shade: 1,
  hidden: false,
});
const scene = (...items: PaperFaceItem[]): PaperScene => ({
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  sheet: 100,
  items,
});

/** A book fold: the right half over the left, as a hinge motion over hand-made scenes. */
function book(start: 'mirrored' | 'in-place' = 'mirrored'): FoldStepMotion {
  const before = scene(faceItem(0, 'front', square(0, 100)));
  const after =
    start === 'mirrored'
      ? scene(faceItem(1, 'front', square(0, 50)), faceItem(0, 'back', square(0, 50)))
      : scene(faceItem(1, 'front', square(0, 50)), faceItem(0, 'front', square(50, 100)));
  return {
    step: start === 'mirrored' ? 'valley' : 'precrease',
    before,
    after,
    motion: hingeMotion(before, after, new Set([0]), { at: [50, 0], along: [0, 1] }, start, 'valley'),
  };
}

function fade(): FoldStepMotion {
  const before = scene(faceItem(0, 'front', square(0, 100)));
  const after = scene(faceItem(0, 'back', square(0, 100)));
  return { step: 'import', before, after, motion: crossfadeMotion(before, after) };
}

let clock: FakeFoldClock;
let reduced: boolean;
let onPlay: Mock<NonNullable<FoldStepPlaybackOptions['onPlay']>>;
let pushed: (FoldPosedFrame | null)[];

function playback(): FoldStepPlayback {
  const p = new FoldStepPlayback({ clock, reducedMotion: () => reduced, onPlay });
  p.frames.subscribe(() => pushed.push(p.frames.current()));
  return p;
}

/** Frames of 25 ms until it stops. */
function playOut(p: FoldStepPlayback) {
  for (let i = 0; i < 400 && p.status().playing; i += 1) clock.frame(25);
}

/** The x of a face's first corner, to tell where a frame has the paper. */
const cornerX = (frame: FoldPosedFrame | null, face: number) =>
  (frame?.scene.items.find((item) => item.kind === 'face' && item.face === face) as PaperFaceItem | undefined)
    ?.rings[0]?.[0]?.[0];

beforeEach(() => {
  clock = new FakeFoldClock();
  reduced = false;
  onPlay = vi.fn();
  pushed = [];
});

describe('FoldStepPlayback', () => {
  it('rests on the pane’s own scene, then plays the step from its parent to its landing', () => {
    const p = playback();
    const motion = book();
    p.setMotion(motion);
    expect(p.status()).toEqual({ available: true, playing: false, complete: false });
    expect(p.frames.current()).toBeNull();
    pushed = [];
    p.toggle();
    expect(p.status().playing).toBe(true);
    // The first frame is the parent's picture itself.
    expect(pushed[0]?.scene).toBe(motion.before);
    clock.frame(FOLD_DURATION_MS * 0.2);
    const swinging = p.frames.current();
    expect(swinging?.scene).not.toBe(motion.before);
    expect(cornerX(swinging, 0)).toBeGreaterThan(50);
    playOut(p);
    // Played through: the pane draws the landed step itself again.
    expect(p.frames.current()).toBeNull();
    expect(p.status()).toEqual({ available: true, playing: false, complete: true });
    expect(p.position.current()).toBe(1);
    // The last posed frame was the landed scene, near enough to draw over it.
    const last = pushed.filter((frame) => frame !== null).pop();
    expect(cornerX(last ?? null, 0)).toBeCloseTo(0, 6);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.lastCall?.[0]).toBe('user');
    expect(onPlay.mock.lastCall?.[1]).toMatchObject({ kind: 'valley' });
  });

  it('replays a step played through, rather than undoing it', () => {
    const p = playback();
    const motion = book();
    p.setMotion(motion);
    p.toggle();
    playOut(p);
    pushed = [];
    p.toggle();
    expect(pushed[0]?.scene).toBe(motion.before);
    expect(p.status().playing).toBe(true);
    clock.frame(FOLD_DURATION_MS * 0.2);
    expect(cornerX(p.frames.current(), 0)).toBeGreaterThan(50);
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it('pauses where it is and plays on from there', () => {
    const p = playback();
    p.setMotion(book());
    p.toggle();
    clock.frame(FOLD_DURATION_MS * 0.3);
    p.toggle();
    expect(p.status().playing).toBe(false);
    const held = p.frames.current();
    clock.frame(500);
    expect(p.frames.current()).toBe(held);
    expect(clock.pendingFrames).toBe(0);
    p.toggle();
    clock.frame(25);
    expect(p.position.current()).toBeGreaterThan(0.3);
    // The transport's rule: a pause is not a play, carrying on is.
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it('scrubs: the parent at the start, a pose between, the pane’s own scene at the end', () => {
    const p = playback();
    const motion = book();
    p.setMotion(motion);
    p.seek(0);
    expect(p.frames.current()?.scene).toBe(motion.before);
    p.seek(0.3);
    expect(p.position.current()).toBeCloseTo(0.3, 9);
    expect(cornerX(p.frames.current(), 0)).toBeGreaterThan(50);
    expect(p.status().complete).toBe(false);
    p.seek(1);
    expect(p.frames.current()).toBeNull();
    expect(p.status().complete).toBe(true);
    // A scrub is not a play.
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('steps by eighths, from between two to the next', () => {
    const p = playback();
    p.setMotion(book());
    p.seek(0.3);
    p.step(1);
    expect(p.position.current()).toBeCloseTo(0.375, 9);
    p.step(1);
    expect(p.position.current()).toBeCloseTo(0.5, 9);
    p.step(-1);
    p.step(-1);
    expect(p.position.current()).toBeCloseTo(0.25, 9);
    p.seek(0.95);
    p.step(1);
    expect(p.position.current()).toBe(1);
    expect(p.status().complete).toBe(true);
  });

  it('shows the landed step at once when motion is unwelcome', () => {
    reduced = true;
    const p = playback();
    p.setMotion(book());
    p.toggle();
    expect(clock.pendingFrames).toBe(0);
    expect(p.frames.current()).toBeNull();
    expect(p.status()).toEqual({ available: true, playing: false, complete: true });
    // Again: no motion either, and it still counts as asked for.
    p.toggle();
    expect(clock.pendingFrames).toBe(0);
    expect(p.frames.current()).toBeNull();
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it('plays a precrease over and back, holding it folded between', () => {
    const p = playback();
    const motion = book('in-place');
    p.setMotion(motion);
    p.toggle();
    clock.frame(FOLD_DURATION_MS);
    clock.frame(TWIN_HOLD_MS / 2);
    // Folded over and holding: the moving face lies across ℓ.
    expect(p.status().playing).toBe(true);
    expect(cornerX(p.frames.current(), 0)).toBeCloseTo(50, 6);
    playOut(p);
    expect(p.frames.current()).toBeNull();
    expect(p.status().complete).toBe(true);
  });

  it('crossfades an import at its own pace', () => {
    const p = playback();
    p.setMotion(fade());
    p.toggle();
    clock.frame(CROSSFADE_PACE.durationMs / 2);
    expect(p.frames.current()?.faces?.size).toBe(2);
    clock.frame(CROSSFADE_PACE.durationMs);
    expect(p.status().complete).toBe(true);
  });

  it('hands the pane its own scene back when another step comes on screen', () => {
    const p = playback();
    const first = book();
    p.setMotion(first);
    p.toggle();
    clock.frame(100);
    p.setMotion(first);
    expect(p.status().playing).toBe(true);
    p.setMotion(book());
    expect(p.frames.current()).toBeNull();
    expect(p.status()).toEqual({ available: true, playing: false, complete: false });
    p.setMotion(null);
    expect(p.status().available).toBe(false);
    p.toggle();
    p.seek(0.5);
    expect(p.frames.current()).toBeNull();
  });

  it('plays a step on arrival under auto-play, after it settles, but not the first', () => {
    const p = playback();
    p.setAutoPlay(true);
    p.setMotion(book());
    clock.wait(AUTO_PLAY_SETTLE_MS * 2);
    expect(p.status().playing).toBe(false);
    const next = book();
    p.setMotion(next);
    clock.wait(AUTO_PLAY_SETTLE_MS);
    expect(p.status().playing).toBe(true);
    expect(onPlay.mock.lastCall?.[0]).toBe('auto');
    clock.frame(FOLD_DURATION_MS * 0.2);
    expect(cornerX(p.frames.current(), 0)).toBeGreaterThan(50);
  });
});
