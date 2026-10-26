/** Where the Annotate canvas's overlay is on the client, and how many screen px one of its world px is: the camera's zoom. */
export interface OverlayScreen {
  left: number;
  top: number;
  scale: number;
}

/**
 * The overlay as the screen shows it, from its box on screen; null before it
 * is laid out. Not its `getScreenCTM()`: Safari 26's WebKit, the desktop app's
 * too, leaves the camera's CSS scale out of an outer `<svg>`'s screen matrix
 * and keeps only where its corner is (WebKit bug 308970), so a press landed
 * nearer that corner by the zoom.
 */
export function overlayScreen(overlay: Element | null, worldWidth: number): OverlayScreen | null {
  const box = overlay?.getBoundingClientRect();
  if (!box || !(box.width > 0) || !(worldWidth > 0)) return null;
  return { left: box.left, top: box.top, scale: box.width / worldWidth };
}
