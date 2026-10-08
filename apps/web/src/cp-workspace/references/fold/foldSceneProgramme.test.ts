import { describe, expect, it } from 'vitest';
import { FOLD_PACE, TURN_OVER_PACE } from '../../../lib/foldMotion/foldPlayback';
import { legPace } from './foldSceneProgramme';

describe('legPace', () => {
  it('turns the sheet over at its own pace, and folds every other card at the fold’s', () => {
    expect(legPace('turn-over')).toBe(TURN_OVER_PACE);
    expect(legPace('cp')).toBe(FOLD_PACE);
    expect(legPace('reference')).toBe(FOLD_PACE);
  });
});
