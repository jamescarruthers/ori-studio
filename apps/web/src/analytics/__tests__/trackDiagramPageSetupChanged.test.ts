import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A page setting's event names the setting, never its value: the style only
 * as a built-in, the export style or `custom`, and the title block's model or
 * pattern only as where it now comes from — never which step, never a byline.
 */

const runtime = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runtime')>();
  return { ...actual, track: runtime.track };
});

const { trackDiagramPageSetupChanged } = await import('../trackDiagram');

beforeEach(() => {
  runtime.track.mockClear();
});

describe('trackDiagramPageSetupChanged', () => {
  it('sends the setting alone', () => {
    trackDiagramPageSetupChanged('title_block');
    trackDiagramPageSetupChanged('title_block_byline');
    expect(runtime.track.mock.calls).toEqual([
      ['diagram page setup changed', { setting: 'title_block' }],
      ['diagram page setup changed', { setting: 'title_block_byline' }],
    ]);
  });

  it('sends the style as named', () => {
    trackDiagramPageSetupChanged('style', { style: 'export-style' });
    expect(runtime.track).toHaveBeenCalledWith('diagram page setup changed', { setting: 'style', style: 'export-style' });
  });

  it('sends where the title block’s model or pattern now comes from', () => {
    trackDiagramPageSetupChanged('title_block_model', { titleBlockChoice: 'step' });
    trackDiagramPageSetupChanged('title_block_pattern', { titleBlockChoice: 'none' });
    expect(runtime.track.mock.calls).toEqual([
      ['diagram page setup changed', { setting: 'title_block_model', title_block_choice: 'step' }],
      ['diagram page setup changed', { setting: 'title_block_pattern', title_block_choice: 'none' }],
    ]);
  });
});
