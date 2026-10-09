import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { Slider } from '../ui/Slider';
import { shortcutLabelForAction, type ShortcutResolutionInput } from '../../keyboard/shortcuts';
import type { FoldPlaybackPosition } from '../../fold/animation/foldStepPlayback';
import type { FoldStepPlaybackSurface } from '../../fold/animation/useFoldStepPlayback';
import styles from './FoldPlaybackControls.module.css';

export interface FoldPlaybackControlsProps {
  /** The step's playback (`useFoldStepPlayback`). */
  playback: FoldStepPlaybackSurface;
  /** The user's chords, for the tooltip that names Space. */
  shortcuts?: ShortcutResolutionInput;
}

/**
 * The step's transport on the folded pane, as the Diagram's Pose has one for a
 * simulated step: Play — Pause while it moves, Replay once it has played —
 * Step, an eighth of the step on, and the step to scrub. A cluster with no
 * chrome of its own, for the pane's bottom bar to hold as one of its nodes.
 *
 * Every press goes to the playback, which Space reaches too
 * (`runFoldPlaybackShortcut`), so the button and the key are one verb.
 */
export function FoldPlaybackControls({ playback, shortcuts }: FoldPlaybackControlsProps) {
  const { t } = useTranslation();
  const disabled = !playback.available;
  const play = playback.playing
    ? t('panels:fold.playback.pause', 'Pause')
    : playback.complete
      ? t('panels:fold.playback.replay', 'Replay step')
      : t('panels:fold.playback.play', 'Play step');
  const chord = shortcutLabelForAction('fold.playStep', shortcuts);
  const stepOn = t('panels:fold.playback.stepForward', 'Step forward');
  return (
    <div className={styles.controls} role="group" aria-label={t('panels:fold.playback.label', 'Step playback')}>
      <IconButton
        size="sm"
        title={chord ? `${play} (${chord})` : play}
        aria-label={play}
        disabled={disabled}
        onClick={playback.toggle}
      >
        {playback.playing ? <Pause size={14} /> : playback.complete ? <RotateCcw size={14} /> : <Play size={14} />}
      </IconButton>
      <IconButton size="sm" title={stepOn} aria-label={stepOn} disabled={disabled} onClick={() => playback.step(1)}>
        <StepForward size={14} />
      </IconButton>
      <FoldPlaybackScrub position={playback.position} disabled={disabled} onSeek={playback.seek} />
    </div>
  );
}

/**
 * The scrubber, on its own so the frames re-render it alone: it follows the
 * playback's position by the whole percent, so a step plays through in at
 * most a hundred renders of one slider and none of anything else.
 */
function FoldPlaybackScrub({
  position,
  disabled,
  onSeek,
}: {
  position: FoldPlaybackPosition;
  disabled: boolean;
  onSeek: (progress: number) => void;
}) {
  const { t } = useTranslation();
  const percent = useSyncExternalStore(
    position.subscribe,
    () => Math.round(position.current() * 100),
    () => 0
  );
  // The slider fills its cell, so the cell is what is sized: no width of the
  // slider's own to tie with.
  return (
    <span className={styles.scrub}>
      <Slider
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        aria-label={t('panels:fold.playback.scrub', 'Step progress')}
        aria-valuetext={t('panels:fold.playback.percent', '{{value}}%', { value: percent })}
        onChange={(value) => onSeek(value / 100)}
      />
    </span>
  );
}
