import { describe, expect, it } from 'vitest';
import { overlayScreen } from './overlayScreen';

/** An element whose box on screen is `box`. */
function boxed(box: { left: number; top: number; width: number }): Element {
  return { getBoundingClientRect: () => box } as unknown as Element;
}

describe('overlayScreen', () => {
  it('reads the camera’s zoom and the overlay’s corner off its box on screen', () => {
    // Safari's 73% fit of a 1500 px world, the corner past the stage's top left.
    expect(overlayScreen(boxed({ left: 148, top: -63, width: 1098 }), 1500)).toEqual({ left: 148, top: -63, scale: 0.732 });
  });

  it('is null before the overlay is laid out', () => {
    expect(overlayScreen(null, 1500)).toBeNull();
    expect(overlayScreen(boxed({ left: 0, top: 0, width: 0 }), 1500)).toBeNull();
    expect(overlayScreen(boxed({ left: 0, top: 0, width: 1098 }), 0)).toBeNull();
  });
});
