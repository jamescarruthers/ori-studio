import { describe, expect, it } from 'vitest';
import { createFoldTools } from '../tools/foldToolState';
import { foldToolKindControl } from './foldCanvasCommands';

describe('the tools’ fold kind, as the menus arm it', () => {
  it('reads the fold in hand, Valley while the Divide line is, and arms a kind as its key does', () => {
    const tools = createFoldTools();
    const control = foldToolKindControl(tools);
    expect(control.kind()).toBe('valley');

    control.arm('mountain');
    expect(tools.store.getState().tool).toBe('mountain');
    expect(control.kind()).toBe('mountain');

    tools.selectTool('divide-line');
    expect(control.kind()).toBe('valley');
    control.arm('precrease');
    expect(tools.store.getState().tool).toBe('precrease');
  });
});
