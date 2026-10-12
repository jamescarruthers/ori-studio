/**
 * Playing a Fold step, free of React: the shared transport
 * (`lib/foldMotion/foldTransport`) driving a step's motion, and the frames it
 * produces, for the folded pane to paint.
 *
 * What a play means here differs from References' card in one way. A card
 * rests flat and Play folds it, then unfolds it; the folded pane rests on the
 * step *landed* — the state on screen is the step's own — so Play replays the
 * step from its parent's picture, and Play once it has played replays it
 * again rather than undoing it. So the pane draws its own scene until the
 * reader asks for the step (Play, Space, the scrubber), then each frame the
 * transport pushes, and its own scene again once the step has played through,
 * or as soon as the step on screen changes.
 *
 * Frames never go through React: the transport pushes each pose to the sink
 * here, which turns it into a frame and hands it to the pane through
 * {@link FoldStepPlayback.frames} — the pane re-uploads its folded channel,
 * nothing re-renders. The scrubber follows the same pushes
 * ({@link FoldStepPlayback.position}). Only the transport's transitions are
 * published as status.
 *
 * A step's frames are its paper's own geometry, never spread; each carries
 * how much of the step's layer spread the pane draws it with
 * ({@link foldStepSpreadWeight}), so the spread the pane shows a step at
 * rest folds away as the step starts and opens again as it lands. The pane
 * draws a frame with weight as its state's picture, spread that much — so
 * where it says an end is drawn spread ({@link FoldStepPlayback.setSpreadEnds}),
 * the paper rests while the spread folds away and has landed before it
 * opens: the motion plays between the two, and no posed frame is replaced
 * by a picture of the paper at rest.
 *
 * The clock and the motion preference are injectable, as the transport's are.
 */

import type { FoldStepPlayVia } from '../../analytics/events';
import {
  FoldTransport,
  prefersReducedMotion,
  type FoldPlayTrigger,
  type FoldPoseSink,
  type FoldTransportClock,
} from '../../lib/foldMotion/foldTransport';
import { easeInOut, type FoldPose } from '../../lib/foldMotion/foldPlayback';
import type { FoldPosedFrame } from './foldStepPoses';
import { foldStepFrame, foldStepProgramme, type FoldStepMotion, type FoldStepProgramme } from './foldStepMotion';

/**
 * The frames a playing step pushes, for the folded pane: read on each
 * notification, never through React state.
 */
export interface FoldPosedSceneSource {
  /** The frame to paint now; null while the pane paints its own scene. */
  current(): FoldPosedFrame | null;
  subscribe(listener: () => void): () => void;
}

/** Where the step's programme is, 0 to 1 by time: for a scrubber's thumb. */
export interface FoldPlaybackPosition {
  current(): number;
  subscribe(listener: () => void): () => void;
}

export interface FoldStepPlaybackStatus {
  /** The step on screen has a motion to play. */
  available: boolean;
  playing: boolean;
  /** Played through and at rest: Play replays it. */
  complete: boolean;
}

/** What the reader pressed to play: Space, or the Play button. */
export type FoldPlayPress = Exclude<FoldStepPlayVia, 'replay'>;

export interface FoldStepPlaybackOptions {
  /**
   * Every play, for the analytics event; a pause or a scrub is not one. A
   * play the reader asked for says how (`via`): what they pressed, or
   * `replay` for a step already played through.
   */
  onPlay?: (trigger: FoldPlayTrigger, programme: FoldStepProgramme, via?: FoldStepPlayVia) => void;
  /** Motion is unwelcome: Play shows the landed step at once. The browser's preference by default. */
  reducedMotion?: () => boolean;
  clock?: FoldTransportClock;
}

/**
 * One press of Step moves the scrubber this far: an eighth of the step, and
 * to the next eighth from between two — or less, to the end of a leg that
 * comes first (`foldStepStops`).
 */
export const FOLD_PLAYBACK_STEP = 1 / 8;

/**
 * How long the step's layer spread takes to fold away as it starts to play,
 * and to open again as it lands: about a frame or eight, under the fold's
 * slow first and last stretches, where the paper has barely moved.
 */
export const FOLD_SPREAD_EASE_MS = 120;

const UNAVAILABLE: FoldStepPlaybackStatus = { available: false, playing: false, complete: false };

/** Below this the scrubber is at a stop already, for Step. */
const ON_A_STEP = 1e-6;

/** The programme's time, as the transport plays it: every leg, and the holds between them. */
function programmeMs(programme: FoldStepProgramme): number {
  const { legs } = programme;
  return legs.reduce(
    (sum, leg, k) => sum + Math.max(0, leg.durationMs) + (k + 1 < legs.length ? Math.max(0, leg.holdMs) : 0),
    0
  );
}

/** Which ends of a play the folded pane draws spread: the parent's picture it starts on, the step's it lands on. */
export interface FoldStepSpreadEnds {
  readonly before: boolean;
  readonly after: boolean;
}

export const NO_SPREAD_ENDS: FoldStepSpreadEnds = { before: false, after: false };

/** How long the spread folds away for, and opens for: a step too short shares its time with them. */
function spreadEaseMs(total: number): number {
  return Math.min(FOLD_SPREAD_EASE_MS, total / 4);
}

/**
 * How much of the step's layer spread a frame `progress` of the way through
 * its programme is drawn with (`FoldPosedFrame.spreadWeight`): all of it at
 * the start, folding away over the first {@link FOLD_SPREAD_EASE_MS}, none
 * while the paper moves, and opening again over the last, so the frame
 * after the last is the pane's own spread picture without a jump.
 *
 * With motion unwelcome, nothing eases: Play lands the step at once, and a
 * frame scrubbed to is drawn unspread.
 */
export function foldStepSpreadWeight(programme: FoldStepProgramme, progress: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const total = programmeMs(programme);
  const ease = spreadEaseMs(total);
  if (!(ease > 0)) return 0;
  const at = Math.max(0, Math.min(1, progress)) * total;
  if (at < ease) return 1 - easeInOut(at / ease);
  if (at > total - ease) return easeInOut((at - (total - ease)) / ease);
  return 0;
}

/**
 * The time the paper rests at each end of a play while the pane eases the
 * spread of an end it draws spread, in ms, and the programme's whole time.
 */
function restsOf(
  programme: FoldStepProgramme,
  ends: FoldStepSpreadEnds,
  reducedMotion: boolean
): { total: number; lead: number; tail: number } {
  const total = programmeMs(programme);
  if (reducedMotion || !(total > 0)) return { total, lead: 0, tail: 0 };
  const ease = spreadEaseMs(total);
  return { total, lead: ends.before ? ease : 0, tail: ends.after ? ease : 0 };
}

/**
 * Where the paper is `progress` of the way through a play, as a share of the
 * step's motion: at rest over the first {@link FOLD_SPREAD_EASE_MS} when the
 * pane starts on a spread picture, landed over the last when it lands on
 * one, and the motion played through the time between — so the frames with
 * spread weight are pictures of the paper at rest, and every posed frame
 * follows on from the one before. Unchanged where neither end is spread.
 */
export function foldStepMotionProgress(
  programme: FoldStepProgramme,
  progress: number,
  ends: FoldStepSpreadEnds,
  reducedMotion: boolean
): number {
  const { total, lead, tail } = restsOf(programme, ends, reducedMotion);
  if (lead === 0 && tail === 0) return progress;
  const at = Math.max(0, Math.min(1, progress)) * total;
  return Math.max(0, Math.min(1, (at - lead) / (total - lead - tail)));
}

/**
 * Where Step stops in a programme, ascending from 0 to 1: every eighth, and
 * the end of every leg and hold — a compound fold's stages, a precrease
 * folded — so a reader stepping through lands on each, where the paper is
 * at it ({@link foldStepMotionProgress}).
 */
export function foldStepStops(
  programme: FoldStepProgramme,
  ends: FoldStepSpreadEnds = NO_SPREAD_ENDS,
  reducedMotion = false
): number[] {
  const stops = Array.from({ length: 9 }, (_, k) => k * FOLD_PLAYBACK_STEP);
  const { total, lead, tail } = restsOf(programme, ends, reducedMotion);
  if (total > 0) {
    // A share of the motion, where the play has it.
    const played = (motion: number) => (lead + motion * (total - lead - tail)) / total;
    let at = 0;
    programme.legs.forEach((leg, k) => {
      at += Math.max(0, leg.durationMs);
      stops.push(played(at / total));
      if (k + 1 < programme.legs.length && leg.holdMs > 0) {
        at += leg.holdMs;
        stops.push(played(at / total));
      }
    });
  }
  stops.sort((a, b) => a - b);
  return stops.filter((stop, k) => stop <= 1 && (k === 0 || stop - stops[k - 1]! > ON_A_STEP));
}

export class FoldStepPlayback {
  private motion: FoldStepMotion | null = null;
  private frame: FoldPosedFrame | null = null;
  /** The pose the transport last pushed, to draw the frame again by. */
  private pose: FoldPose | null = null;
  private spreadEnds: FoldStepSpreadEnds = NO_SPREAD_ENDS;
  /** The reader has asked for the step since it came on screen: frames replace the pane's own scene. */
  private engaged = false;
  private snapshot: FoldStepPlaybackStatus = UNAVAILABLE;
  /** How the press under way played, while {@link toggle} hands it to the transport, which reports a play at once. */
  private via: FoldStepPlayVia | null = null;
  private readonly statusListeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private readonly transport: FoldTransport<FoldStepProgramme>;
  private readonly reducedMotion: () => boolean;

  constructor(options: FoldStepPlaybackOptions = {}) {
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion;
    const sink: FoldPoseSink = { setFoldPose: (pose) => this.pushed(pose) };
    this.transport = new FoldTransport<FoldStepProgramme>({
      sink: () => sink,
      onPlay: (trigger, _heading, programme) => {
        // An auto-play engages the step as a press does; it is the first
        // frame after its first push that shows it.
        this.engaged = true;
        const via = trigger === 'user' ? this.via : null;
        if (via) options.onPlay?.(trigger, programme, via);
        else options.onPlay?.(trigger, programme);
      },
      ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
      ...(options.clock ? { clock: options.clock } : {}),
    });
  }

  readonly frames: FoldPosedSceneSource = {
    current: () => this.frame,
    subscribe: (listener) => {
      this.frameListeners.add(listener);
      return () => {
        this.frameListeners.delete(listener);
      };
    },
  };

  /**
   * Where the scrubber stands: at the landing while the pane draws its own
   * scene of the step — at rest, before the reader has asked for it — and
   * where the play is once they have. The transport rests at the start, as a
   * card does, so read off it alone the scrubber would sit at 0% under the
   * landed step, and a scrub to 0% would change nothing to answer.
   */
  readonly position: FoldPlaybackPosition = {
    current: () => this.place(),
    subscribe: this.frames.subscribe,
  };

  /**
   * The status now; the same object until it changes, so `useSyncExternalStore`
   * can take it as its snapshot. Read off the transport, which is always
   * current, whether or not anything listens.
   */
  readonly status = (): FoldStepPlaybackStatus => {
    const { available, playing } = this.transport.status();
    const complete = available && !playing && this.transport.progress() >= 1;
    const prev = this.snapshot;
    if (prev.available !== available || prev.playing !== playing || prev.complete !== complete) {
      this.snapshot = { available, playing, complete };
    }
    return this.snapshot;
  };

  /**
   * Hear the status change: the transport's transitions — a step that plays
   * itself out, an auto-play that starts — and this class's own verbs. Each
   * subscription reaches the transport itself, so one made after a
   * {@link dispose} (React's development double mount) still hears it.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    const off = this.transport.subscribe(listener);
    return () => {
      this.statusListeners.delete(listener);
      off();
    };
  };

  /** Play the step on screen when it arrives, as the auto-play setting says. */
  setAutoPlay(on: boolean): void {
    this.transport.setAutoPlay(on);
  }

  /**
   * Which ends the pane draws spread: the paper rests at those ends while
   * the spread eases ({@link foldStepMotionProgress}). A frame on show is
   * drawn again by them.
   */
  setSpreadEnds(ends: FoldStepSpreadEnds): void {
    if (ends.before === this.spreadEnds.before && ends.after === this.spreadEnds.after) return;
    this.spreadEnds = { before: ends.before, after: ends.after };
    if (this.frame) this.pushed(this.pose);
  }

  /**
   * The step on screen's motion, or none. The same one again changes
   * nothing; another hands the pane its own scene back, whatever was playing.
   */
  setMotion(motion: FoldStepMotion | null): void {
    if (motion === this.motion) return;
    this.engaged = false;
    this.motion = motion;
    this.transport.setProgramme(motion ? foldStepProgramme(motion) : null);
    this.changed();
  }

  /**
   * Play and Space: play from the parent, pause, resume — and, played
   * through, replay. `press` is which, for the play's report.
   */
  toggle(press: FoldPlayPress = 'button'): void {
    const { available, complete } = this.status();
    if (!available) return;
    this.engaged = true;
    if (complete) this.transport.seek(0);
    this.via = complete ? 'replay' : press;
    try {
      this.transport.toggle();
    } finally {
      this.via = null;
    }
    this.changed();
  }

  /** The scrubber: the step paused `progress` of the way through, by time. */
  seek(progress: number): void {
    if (!this.status().available) return;
    this.engaged = true;
    this.transport.seek(progress);
    this.changed();
  }

  /**
   * Step: the scrubber moved to the next stop of the step (`foldStepStops`),
   * or back to the one before. From the landing — at rest, or played
   * through — Step on starts the step again from its parent, as Play does.
   */
  step(direction: 1 | -1): void {
    const motion = this.motion;
    if (!motion) return;
    const stops = foldStepStops(foldStepProgramme(motion), this.spreadEnds, this.reducedMotion());
    const place = this.place();
    const at = direction > 0 && place >= 1 ? 0 : place;
    const next =
      direction > 0
        ? (stops.find((stop) => stop > at + ON_A_STEP) ?? 1)
        : ([...stops].reverse().find((stop) => stop < at - ON_A_STEP) ?? 0);
    this.seek(next);
  }

  dispose(): void {
    this.transport.dispose();
    this.statusListeners.clear();
    this.frameListeners.clear();
  }

  /** Where the step is, 0 to 1, as the pane shows it ({@link position}): the landing until the reader asks for the step. */
  private place(): number {
    if (this.engaged) return this.transport.progress();
    // Read off the motion, not the transport's status, which it publishes after the push a new step makes.
    const motion = this.motion;
    return motion && foldStepProgramme(motion).legs.length > 0 ? 1 : 0;
  }

  /** A pose the transport pushed: the frame it makes, or the pane's own scene. */
  private pushed(pose: FoldPose | null): void {
    this.pose = pose;
    const motion = this.motion;
    const progress = this.transport.progress();
    // Played through, the landed step is the pane's own scene: it draws it
    // again, overlays and all, rather than a copy of it.
    this.frame = motion && this.engaged && progress < 1 ? this.frameAt(motion, progress, pose) : null;
    for (const listener of this.frameListeners) listener();
  }

  /** The frame `progress` of the way through the play, the paper resting while an end's spread eases. */
  private frameAt(motion: FoldStepMotion, progress: number, pose: FoldPose | null): FoldPosedFrame {
    const programme = foldStepProgramme(motion);
    const reduced = this.reducedMotion();
    const at = foldStepMotionProgress(programme, progress, this.spreadEnds, reduced);
    // The transport's pose is for its own time: the paper's, where it rests, is read off the programme.
    const frame =
      at === progress ? foldStepFrame(motion, { progress, pose }) : foldStepFrame(motion, { progress: at, pose: null });
    return { ...frame, spreadWeight: foldStepSpreadWeight(programme, progress, reduced) };
  }

  /** Tell the subscribers a verb ran, when it changed the status: a seek to the end completes a step the transport never says it did. */
  private changed(): void {
    const prev = this.snapshot;
    if (this.status() === prev) return;
    for (const listener of this.statusListeners) listener();
  }
}
