import { describe, expect, it } from 'vitest';
import { createFoldTools } from '../tools/foldToolState';
import { foldToolKindControl } from './foldCanvasCommands';

describe('the tools’ fold kind, as the menus arm it', () => {
  it('reads the plain fold in hand, none while another tool is, and arms a kind as its key does', () => {
    const tools = createFoldTools();
    const control = foldToolKindControl(tools);
    expect(control.kind()).toBe('valley');

    control.arm('mountain');
    expect(tools.store.getState().tool).toBe('mountain');
    expect(control.kind()).toBe('mountain');

    // A compound or vertex fold, a sink, the Divide line: no plain fold's kind is chosen.
    for (const tool of ['divide-line', 'inside-reverse', 'tuck', 'squash', 'closed-sink'] as const) {
      tools.selectTool(tool);
      expect(control.kind(), tool).toBeNull();
    }
    control.arm('precrease');
    expect(tools.store.getState().tool).toBe('precrease');
  });
});
