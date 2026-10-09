import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { buildDiagramFoldStepPoseActions } from '../actions/diagramPoseActions';
import type { DiagramCpRender } from '../document/diagramDocument';
import { posedFoldRender } from './foldStepActions';

const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction;

const FLAT: DiagramCpRender = { mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 1 };
const PATTERN: DiagramCpRender = { mode: 'crease-pattern', rotationDeg: 90 };

describe('a Fold step’s pose (D17)', () => {
  it('turns a quarter either way, about the picture, kept in [0, 360)', () => {
    expect(posedFoldRender(FLAT, 'rotate-left')).toEqual({ ...FLAT, rotationDeg: 270 });
    expect(posedFoldRender(FLAT, 'rotate-right')).toEqual({ ...FLAT, rotationDeg: 90 });
    expect(posedFoldRender(PATTERN, 'rotate-right')).toEqual({ mode: 'crease-pattern', rotationDeg: 180 });
  });

  it('turns a flat fold over as Turn Over does: the other side, at the opposite turn', () => {
    expect(posedFoldRender({ ...FLAT, rotationDeg: 90 }, 'turn-over')).toEqual({ ...FLAT, side: 'back', rotationDeg: 270 });
    expect(posedFoldRender(posedFoldRender({ ...FLAT, rotationDeg: 90 }, 'turn-over'), 'turn-over')).toEqual({
      ...FLAT,
      rotationDeg: 90,
    });
  });

  it('puts a crease pattern’s paper on its other side’s colour, nothing else', () => {
    expect(posedFoldRender(PATTERN, 'turn-over')).toEqual({ ...PATTERN, side: 'back' });
    expect(posedFoldRender({ ...PATTERN, side: 'back' }, 'turn-over')).toEqual(PATTERN);
  });

  it('resets upright and from the front, keeping a flat fold’s spread', () => {
    const spread = { kind: 'depth' as const, amount: 0.05, toward: 'down' as const };
    expect(posedFoldRender({ ...FLAT, side: 'back', rotationDeg: 180, spread }, 'reset')).toEqual({ ...FLAT, spread });
    expect(posedFoldRender({ ...PATTERN, side: 'back' }, 'reset')).toEqual({ mode: 'crease-pattern', rotationDeg: 0 });
  });
});

describe('a Fold step’s pose verbs (D17)', () => {
  const build = (state: Partial<Parameters<typeof buildDiagramFoldStepPoseActions>[0]> = {}) => {
    const pose = vi.fn();
    const actions = buildDiagramFoldStepPoseActions(
      { render: FLAT, carriesUnknownAnnotations: false, capturing: false, readOnly: false, ...state },
      { t, pose }
    );
    return { actions, pose };
  };

  it('turns a flat fold a quarter either way, over, and back, each by its verb', () => {
    const { actions, pose } = build({ render: { ...FLAT, rotationDeg: 90 } });
    expect(actions.map((action) => action.id)).toEqual(['rotate-left', 'rotate-right', 'turn-over', 'reset']);
    for (const action of actions) action.run();
    expect(pose.mock.calls.map(([verb]) => verb)).toEqual(['rotate-left', 'rotate-right', 'turn-over', 'reset']);
  });

  it('turns a crease pattern but leaves its side to the Front | Back field', () => {
    expect(build({ render: PATTERN }).actions.map((action) => action.id)).toEqual(['rotate-left', 'rotate-right', 'reset']);
  });

  it('holds every verb while a capture runs, on a read-only diagram, and over a newer build’s marks', () => {
    for (const state of [{ capturing: true }, { readOnly: true }, { carriesUnknownAnnotations: true }]) {
      expect(build(state).actions.every((action) => action.disabled && action.hint)).toBe(true);
    }
    // Reset has nothing to do from the start.
    expect(build().actions.find((action) => action.id === 'reset')).toMatchObject({ disabled: true });
  });
});
