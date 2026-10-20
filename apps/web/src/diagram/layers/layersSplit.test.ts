import { describe, expect, it } from 'vitest';
import { clampLayersListHeight, LAYERS_INSPECTOR_MIN_PX, LAYERS_LIST_MIN_PX } from './layersSplit';

describe('clampLayersListHeight', () => {
  it('keeps a height that leaves both regions room', () => {
    expect(clampLayersListHeight(300, 800)).toBe(300);
  });

  it('never makes the list shorter than three rows', () => {
    expect(clampLayersListHeight(10, 800)).toBe(LAYERS_LIST_MIN_PX);
  });

  it('leaves the inspector its minimum', () => {
    expect(clampLayersListHeight(790, 800)).toBe(800 - LAYERS_INSPECTOR_MIN_PX);
  });

  it('gives the list its minimum in a pane too short for both', () => {
    expect(clampLayersListHeight(200, 150)).toBe(LAYERS_LIST_MIN_PX);
  });

  it('rounds to whole pixels', () => {
    expect(clampLayersListHeight(200.6, 800)).toBe(201);
  });
});
