import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ANALYTICS_EVENTS, track } from '../../analytics';
import type { FoldStepMotion } from './foldStepMotion';
import {
  FoldStepPlayback,
  type FoldPlaybackPosition,
  type FoldPlayPress,
  type FoldPosedSceneSource,
  type FoldStepPlaybackStatus,
} from './foldStepPlayback';

export interface FoldStepPlaybackInput {
  /** The step on screen's motion (`useFoldStepMotion`), or null when it has none. A new object is a new step. */
  motion: FoldStepMotion | null;
  /** Play a step on arriving at it. Off unless the caller has a setting that says so. */
  autoPlay?: boolean;
}

/** What the folded pane, the transport controls and the `fold` scope read and press. */
export interface FoldStepPlaybackSurface extends FoldStepPlaybackStatus {
  /** Play from the parent, pause, resume, replay: the Play button and Space, each saying which it is. */
  toggle: (press: FoldPlayPress) => void;
  /** The scrubber, 0 to 1 by time. */
  seek: (progress: number) => void;
  /** The scrubber moved by an eighth. */
  step: (direction: 1 | -1) => void;
  /** The folded pane's posed-scene source: paint `current()` while it is not null. */
  frames: FoldPosedSceneSource;
  /** Where the step is, for the scrubber's thumb. */
  position: FoldPlaybackPosition;
}

/**
 * The step's playback, bound to the Fold panel: one `FoldStepPlayback` for
 * the life of the panel, fed the step on screen's motion, its plays counted.
 *
 * Read through `useSyncExternalStore`, so a frame re-renders nothing and a
 * transition re-renders what shows the status. The frames and the position
 * are sources for the pane and the scrubber to subscribe to themselves.
 */
export function useFoldStepPlayback({ motion, autoPlay = false }: FoldStepPlaybackInput): FoldStepPlaybackSurface {
  const [playback] = useState(
    () =>
      new FoldStepPlayback({
        onPlay: (trigger, programme, via) =>
          track(
            ANALYTICS_EVENTS.foldStepPlayed,
            via ? { trigger, step_kind: programme.kind, via } : { trigger, step_kind: programme.kind }
          ),
      })
  );
  useEffect(() => {
    playback.setAutoPlay(autoPlay);
  }, [playback, autoPlay]);
  useEffect(() => {
    playback.setMotion(motion);
  }, [playback, motion]);
  useEffect(() => () => playback.dispose(), [playback]);
  const status = useSyncExternalStore(playback.subscribe, playback.status, playback.status);
  const toggle = useCallback((press: FoldPlayPress) => playback.toggle(press), [playback]);
  const seek = useCallback((progress: number) => playback.seek(progress), [playback]);
  const step = useCallback((direction: 1 | -1) => playback.step(direction), [playback]);
  return useMemo(
    () => ({ ...status, toggle, seek, step, frames: playback.frames, position: playback.position }),
    [status, toggle, seek, step, playback]
  );
}
