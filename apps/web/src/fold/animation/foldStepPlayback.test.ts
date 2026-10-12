import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FOLD_DURATION_MS, TWIN_HOLD_MS } from '../../lib/foldMotion/foldPlayback';
import { AUTO_PLAY_SETTLE_MS } from '../../lib/foldMotion/foldTransport';
import { FakeFoldClock } from '../../lib/foldMotion/foldTransport.fixtures';
import type { PaperFaceItem, PaperScene, ScenePoint } from '../../lib/paper/paperScene';
import type { FoldMotionLeg } from '../engine/foldEngineWire';
import { CROSSFADE_PACE, foldStepProgramme, type FoldStepMotion } from './foldStepMotion';
import {
  FOLD_SPREAD_EASE_MS,
  FoldStepPlayback,
  foldStepSpreadWeight,
  foldStepStops,
  type FoldStepPlaybackOptions,
} from './foldStepPlayback';
import { crossfadeMotion, hingeMotion, legsMotion, type FoldPosedFrame } from './foldStepPoses';

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

/**
 * A compound step in two stages, as the engine gives one: face 1 turns over
 * x = 50 in the first swing, face 2 over the same line in the second.
 */
function twoStages(): FoldStepMotion {
  const before = scene(
    faceItem(0, 'front', square(0, 50)),
    faceItem(1, 'front', square(50, 100)),
    faceItem(2, 'front', square(50, 100))
  );
  const after = scene(
    faceItem(0, 'front', square(0, 50)),
    faceItem(1, 'back', square(0, 50)),
    faceItem(2, 'back', square(0, 50))
  );
  const half = (faces: number[], stacking: 'parent' | 'landed'): FoldMotionLeg[] =>
    (['spread', 'close'] as const).map((name, k) => ({
      name,
      stacking: k === 0 ? 'parent' : stacking,
      groups: [{ faces, axis: { n: [1, 0], d: 50 }, side: 'positive', from: (k * Math.PI) / 2, to: ((k + 1) * Math.PI) / 2 }],
    }));
  const motion = legsMotion(before, after, [...half([1], 'parent'), ...half([2], 'landed')], {
    toScene: [1, 0, 0, 1, 0, 0],
    faceAt: (id) => id,
    parentFace: (face) => face,
  });
  if (!motion) throw new Error('no legs');
  return { step: 'squash', before, after, motion };
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

  it('rests at the landing, where the scrubber stands too, so 0% is always a move to the parent', () => {
    for (const motion of [book(), twoStages()]) {
      const p = playback();
      p.setMotion(motion);
      // The pane draws the landed step: the scrubber says so.
      expect(p.frames.current()).toBeNull();
      expect(p.position.current()).toBe(1);
      expect(p.status().complete).toBe(false);
      pushed = [];
      p.seek(0);
      expect(p.frames.current()?.scene).toBe(motion.before);
      expect(p.position.current()).toBe(0);
      // A listener heard the scrubber move.
      expect(pushed.length).toBeGreaterThan(0);
      p.seek(1);
      expect(p.frames.current()).toBeNull();
      expect(p.position.current()).toBe(1);
      // Another step comes on screen landed, the scrubber with it.
      p.setMotion(book());
      expect(p.position.current()).toBe(1);
      p.setMotion(null);
      expect(p.position.current()).toBe(0);
      p.dispose();
    }
  });

  it('starts the step again from its parent when Step is pressed at the landing', () => {
    const p = playback();
    const motion = book();
    p.setMotion(motion);
    p.step(1);
    expect(p.position.current()).toBeCloseTo(0.125, 9);
    p.toggle();
    playOut(p);
    expect(p.status().complete).toBe(true);
    // Played through, as at rest: an eighth from the parent.
    p.step(1);
    expect(p.position.current()).toBeCloseTo(0.125, 9);
    expect(p.status().complete).toBe(false);
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

  it('plays a compound step’s stages in turn on one timeline, never back to the parent between them', () => {
    const p = playback();
    const motion = twoStages();
    p.setMotion(motion);
    expect(foldStepProgramme(motion).legs.map((leg) => leg.flap)).toEqual([0, 1]);
    pushed = [];
    p.toggle();
    playOut(p);
    const frames = pushed.filter((frame): frame is FoldPosedFrame => frame !== null);
    // The parent's picture once, at the start; the second stage starts where the first left off.
    expect(frames.filter((frame) => frame.scene === motion.before)).toHaveLength(1);
    expect(frames[0]?.scene).toBe(motion.before);
    const boundary = frames.findIndex((frame) => cornerX(frame, 2) !== 100 && cornerX(frame, 1) === 0);
    expect(boundary).toBeGreaterThan(0);
    // Face 2 waits where it lay while face 1 turns.
    expect(cornerX(frames[Math.floor(boundary / 2)] ?? null, 2)).toBeCloseTo(100, 9);
    expect(p.status().complete).toBe(true);
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay.mock.lastCall?.[1]).toMatchObject({ kind: 'squash' });
  });

  it('steps through a compound step’s stages, each landing a stop', () => {
    const p = playback();
    p.setMotion(twoStages());
    p.seek(0.45);
    p.step(1);
    // The first stage's end, which is also an eighth.
    expect(p.position.current()).toBeCloseTo(0.5, 9);
    // Three stages' ends fall between the eighths.
    const swing = foldStepProgramme(twoStages()).legs[0]!;
    const three = foldStepStops({ kind: 'squash', arrival: 'auto-play', legs: [swing, swing, swing] });
    expect(three).toContain(1 / 3);
    expect(three).toContain(2 / 3);
    expect(three[0]).toBe(0);
    expect(three[three.length - 1]).toBe(1);
    // A precrease stops folded over, and where its hold ends.
    const precrease = foldStepStops(foldStepProgramme(book('in-place')));
    const total = 2 * FOLD_DURATION_MS + TWIN_HOLD_MS;
    expect(precrease).toContain(FOLD_DURATION_MS / total);
    expect(precrease).toContain((FOLD_DURATION_MS + TWIN_HOLD_MS) / total);
  });

  it('folds the layer spread away as a step starts and opens it again as it lands', () => {
    const programme = foldStepProgramme(book());
    const share = (ms: number) => ms / FOLD_DURATION_MS;
    expect(foldStepSpreadWeight(programme, 0, false)).toBe(1);
    expect(foldStepSpreadWeight(programme, share(FOLD_SPREAD_EASE_MS / 2), false)).toBeCloseTo(0.5, 9);
    expect(foldStepSpreadWeight(programme, share(FOLD_SPREAD_EASE_MS), false)).toBe(0);
    expect(foldStepSpreadWeight(programme, 0.5, false)).toBe(0);
    expect(foldStepSpreadWeight(programme, 1 - share(FOLD_SPREAD_EASE_MS / 2), false)).toBeCloseTo(0.5, 9);
    expect(foldStepSpreadWeight(programme, 1, false)).toBe(1);
    // Motion unwelcome: nothing eases, and a frame scrubbed to is unspread.
    expect(foldStepSpreadWeight(programme, 0, true)).toBe(0);
    expect(foldStepSpreadWeight(programme, 0.95, true)).toBe(0);

    // Every frame a play pushes carries its weight: all of it first, none mid-swing, nearly all last.
    const p = playback();
    p.setMotion(book());
    pushed = [];
    p.toggle();
    playOut(p);
    const weights = pushed.flatMap((frame) => (frame ? [frame.spreadWeight] : []));
    expect(weights[0]).toBe(1);
    expect(weights[Math.floor(weights.length / 2)]).toBe(0);
    expect(weights[weights.length - 1]).toBeGreaterThan(0.5);
    // Scrubbed with motion unwelcome: unspread.
    reduced = true;
    p.seek(0.3);
    expect(p.frames.current()?.spreadWeight).toBe(0);
  });

  it('rests the paper at an end drawn spread while its spread eases, so no posed frame is replaced', () => {
    const motion = fade();
    /** How far the crossfade is in a frame: the after scene's alpha, the ends by their scenes. */
    const share = (frame: FoldPosedFrame) =>
      frame.scene === motion.before ? 0 : frame.scene === motion.after ? 1 : (frame.faces?.get(1)?.alpha ?? Number.NaN);
    const play = (ends: { before: boolean; after: boolean } | null) => {
      const p = playback();
      if (ends) p.setSpreadEnds(ends);
      p.setMotion(motion);
      pushed = [];
      p.toggle();
      for (let i = 0; i < 400 && p.status().playing; i += 1) clock.frame(8);
      return pushed.flatMap((frame) => (frame ? [frame] : []));
    };

    const frames = play({ before: true, after: true });
    // Every frame the pane draws as a state's spread picture is exactly that state: the paper at rest.
    const weighted = frames.filter((frame) => (frame.spreadWeight ?? 0) > 0);
    expect(weighted.length).toBeGreaterThan(20);
    for (const frame of weighted) expect([0, 1]).toContain(share(frame));
    // And the motion picks up where the spread left off, and lands before it opens: no jump either side.
    const moving = frames.filter((frame) => frame.spreadWeight === 0);
    expect(share(moving[0]!)).toBeLessThan(0.01);
    expect(share(moving[moving.length - 1]!)).toBeGreaterThan(0.99);

    // With no end drawn spread nothing rests: the fade fills the play, as it always has.
    const unspread = play(null);
    const early = unspread.find((frame) => (frame.spreadWeight ?? 0) > 0 && share(frame) > 0.05);
    expect(early).toBeDefined();
  });

  it('stops Step at a stage’s end where the paper is at it, the paper resting while a spread eases', () => {
    const p = playback();
    const motion = twoStages();
    p.setSpreadEnds({ before: true, after: false });
    p.setMotion(motion);
    const total = 2 * FOLD_DURATION_MS;
    // The first stage ends half way through the motion, which starts once the parent's spread has folded away.
    const stageEnd = (FOLD_SPREAD_EASE_MS + (total - FOLD_SPREAD_EASE_MS) / 2) / total;
    expect(foldStepStops(foldStepProgramme(motion), { before: true, after: false })).toContain(stageEnd);
    p.seek(0.51);
    p.step(1);
    expect(p.position.current()).toBeCloseTo(stageEnd, 9);
    // Face 1 has landed, face 2 has not moved.
    expect(cornerX(p.frames.current(), 1)).toBeCloseTo(0, 6);
    expect(cornerX(p.frames.current(), 2)).toBeCloseTo(100, 6);
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
