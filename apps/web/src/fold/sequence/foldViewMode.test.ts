import { describe, expect, it, vi } from 'vitest';

const tracked = vi.hoisted(() => [] as [string, unknown][]);
vi.mock('../../analytics', () => ({
  ANALYTICS_EVENTS: { foldViewSwitched: 'fold view switched' },
  track: (event: string, properties: unknown) => tracked.push([event, properties]),
}));

import { foldView, setFoldView } from './foldViewMode';

describe('the Fold view', () => {
  it('switches between the fold and the Steps grid, counting each switch and no repeat', () => {
    expect(foldView()).toBe('fold');
    setFoldView('steps');
    setFoldView('steps');
    setFoldView('fold');
    expect(foldView()).toBe('fold');
    expect(tracked).toEqual([
      ['fold view switched', { view: 'steps' }],
      ['fold view switched', { view: 'fold' }],
    ]);
  });
});
