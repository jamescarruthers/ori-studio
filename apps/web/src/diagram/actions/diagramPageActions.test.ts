import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { buildDiagramPageActions, type DiagramPageActionState } from './diagramPageActions';

/** The English default of each `t` call, as the extractor reads it. */
const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction;

const FLOW: DiagramPageActionState = { flow: true, readOnly: false };

describe('buildDiagramPageActions', () => {
  it('offers Re-pack Page, then Re-pack All Pages, on a flow page, each running its own verb', () => {
    const deps = { t, repackPage: vi.fn(), repackAll: vi.fn() };
    const actions = buildDiagramPageActions(FLOW, deps);
    expect(actions.map(({ id, label, disabled }) => ({ id, label, disabled }))).toEqual([
      { id: 'repack-page', label: 'Re-pack Page', disabled: false },
      { id: 'repack-all', label: 'Re-pack All Pages', disabled: false },
    ]);
    actions[0]!.run();
    expect(deps.repackPage).toHaveBeenCalledOnce();
    actions[1]!.run();
    expect(deps.repackAll).toHaveBeenCalledOnce();
  });

  it('offers nothing on a grid, whose pages are never packed', () => {
    expect(buildDiagramPageActions({ ...FLOW, flow: false }, { t, repackPage: vi.fn(), repackAll: vi.fn() })).toEqual([]);
  });

  it('holds each back, and says why, only where nothing may change', () => {
    const deps = { t, repackPage: vi.fn(), repackAll: vi.fn() };
    const offered = buildDiagramPageActions(FLOW, deps);
    expect(offered.every((action) => !action.disabled && action.hint === undefined)).toBe(true);
    const readOnly = buildDiagramPageActions({ ...FLOW, readOnly: true }, deps);
    expect(readOnly.every((action) => action.disabled)).toBe(true);
    expect(readOnly[0]!.hint).toMatch(/read-only/);
  });
});
