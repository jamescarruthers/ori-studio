import { describe, expect, it, vi } from 'vitest';
import { getShortcutDefinition, shortcutLabelForAction } from '../../keyboard/shortcuts';
import { runFoldPlaybackShortcut } from './foldPlaybackShortcuts';

describe('runFoldPlaybackShortcut', () => {
  it('plays the step on Space while it has something to play', () => {
    const toggle = vi.fn();
    expect(runFoldPlaybackShortcut('fold.playStep', { available: true, toggle })).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('leaves Space to the scopes beneath when the step has nothing to play', () => {
    const toggle = vi.fn();
    expect(runFoldPlaybackShortcut('fold.playStep', { available: false, toggle })).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('binds Space in the Fold workspace’s own scope', () => {
    expect(getShortcutDefinition('fold.playStep')).toMatchObject({ scope: 'fold', target: 'fold' });
    expect(shortcutLabelForAction('fold.playStep')).toBe('Space');
  });
});
