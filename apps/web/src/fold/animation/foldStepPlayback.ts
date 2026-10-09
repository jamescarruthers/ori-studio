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
 * The clock and the motion preference are injectable, as the transport's are.
 */

import type { FoldStepPlayVia } from '../../analytics/events';
import {
  FoldTransport,
  type FoldPlayTrigger,
  type FoldPoseSink,
  type FoldTransportClock,
} from '../../lib/foldMotion/foldTransport';
import type { FoldPose } from '../../lib/foldMotion/foldPlayback';
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

/** One press of Step moves the scrubber this far: an eighth of the step, and to the next eighth from between two. */
export const FOLD_PLAYBACK_STEP = 1 / 8;

const UNAVAILABLE: FoldStepPlaybackStatus = { available: false, playing: false, complete: false };

/** Below this the scrubber is at an eighth already, for Step. */
const ON_A_STEP = 1e-6;

export class FoldStepPlayback {
  private motion: FoldStepMotion | null = null;
  private frame: FoldPosedFrame | null = null;
  /** The reader has asked for the step since it came on screen: frames replace the pane's own scene. */
  private engaged = false;
  private snapshot: FoldStepPlaybackStatus = UNAVAILABLE;
  /** How the press under way played, while {@link toggle} hands it to the transport, which reports a play at once. */
  private via: FoldStepPlayVia | null = null;
  private readonly statusListeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private readonly transport: FoldTransport<FoldStepProgramme>;

  constructor(options: FoldStepPlaybackOptions = {}) {
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

  readonly position: FoldPlaybackPosition = {
    current: () => this.transport.progress(),
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

  /** Step: the scrubber moved to the next eighth of the step, or back to the one before. */
  step(direction: 1 | -1): void {
    const at = this.transport.progress() / FOLD_PLAYBACK_STEP;
    const eighth = direction > 0 ? Math.floor(at + ON_A_STEP) + 1 : Math.ceil(at - ON_A_STEP) - 1;
    this.seek(Math.max(0, Math.min(1, eighth * FOLD_PLAYBACK_STEP)));
  }

  dispose(): void {
    this.transport.dispose();
    this.statusListeners.clear();
    this.frameListeners.clear();
  }

  /** A pose the transport pushed: the frame it makes, or the pane's own scene. */
  private pushed(pose: FoldPose | null): void {
    const motion = this.motion;
    const progress = this.transport.progress();
    // Played through, the landed step is the pane's own scene: it draws it
    // again, overlays and all, rather than a copy of it.
    this.frame = motion && this.engaged && progress < 1 ? foldStepFrame(motion, { progress, pose }) : null;
    for (const listener of this.frameListeners) listener();
  }

  /** Tell the subscribers a verb ran, when it changed the status: a seek to the end completes a step the transport never says it did. */
  private changed(): void {
    const prev = this.snapshot;
    if (this.status() === prev) return;
    for (const listener of this.statusListeners) listener();
  }
}
