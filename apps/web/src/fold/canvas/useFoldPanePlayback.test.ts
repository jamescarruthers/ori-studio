import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFoldPlaybackShortcut } from '../animation/foldPlaybackShortcuts';
import type { FoldStepPlaybackSurface } from '../animation/useFoldStepPlayback';
import { foldPhonePane, revealFoldedPane, showFoldPhonePane } from './foldPhonePane';
import { revealingPlayback } from './useFoldPanePlayback';

function transport(): FoldStepPlaybackSurface {
  return {
    available: true,
    playing: false,
    complete: false,
    toggle: vi.fn(),
    seek: vi.fn(),
    step: vi.fn(),
    frames: { current: () => null, subscribe: () => () => {} },
    position: { current: () => 0, subscribe: () => () => {} },
  };
}

afterEach(() => showFoldPhonePane('folded'));

describe('a phone’s transport', () => {
  it('turns to the folded pane before it plays, steps or scrubs, where the frames are drawn', () => {
    const playback = transport();
    const surface = revealingPlayback(playback, revealFoldedPane);
    for (const press of [() => surface.toggle(), () => surface.step(1), () => surface.seek(0.5)]) {
      showFoldPhonePane('crease-pattern');
      press();
      expect(foldPhonePane()).toBe('folded');
    }
    expect(playback.toggle).toHaveBeenCalledTimes(1);
    expect(playback.step).toHaveBeenCalledWith(1);
    expect(playback.seek).toHaveBeenCalledWith(0.5);
  });

  it('turns to it on Space too, which presses the same transport', () => {
    const playback = transport();
    showFoldPhonePane('crease-pattern');
    expect(runFoldPlaybackShortcut('fold.playStep', revealingPlayback(playback, revealFoldedPane), null)).toBe(true);
    expect(foldPhonePane()).toBe('folded');
    expect(playback.toggle).toHaveBeenCalledTimes(1);
  });

  it('reveals first, then plays', () => {
    const order: string[] = [];
    const playback = { ...transport(), toggle: () => order.push('play') };
    revealingPlayback(playback, () => order.push('reveal')).toggle();
    expect(order).toEqual(['reveal', 'play']);
  });
});
