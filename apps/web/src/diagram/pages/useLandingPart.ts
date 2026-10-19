import { useCallback, useEffect, useState } from 'react';
import type { usePagePlacement } from './usePagePlacement';

type Draft = NonNullable<ReturnType<typeof usePagePlacement>['draft']>;

/** Never held longer than this, should the landed page fail to paint or scroll away. */
const LANDING_MAX_MS = 2000;

/**
 * A committed drag's lifted part, kept over its page until the page's own
 * picture shows the drop. The page keeps its previous bitmap while the new
 * one rasterizes (`DiagramPicturePreview`), and that bitmap is the one with
 * the part lifted out: dropping the overlay with the draft blinked the part
 * out for the length of a raster. A cancelled drag has nothing to hold.
 */
export function useLandingPart(draft: Draft | null) {
  const [previous, setPrevious] = useState(draft);
  const [landing, setLanding] = useState<Draft | null>(null);
  if (draft !== previous) {
    // Adjusted while rendering, so the frame that loses the draft keeps the part.
    setPrevious(draft);
    setLanding(draft === null && previous?.pending ? previous : null);
  }
  useEffect(() => {
    if (!landing) return undefined;
    const timer = setTimeout(() => setLanding(null), LANDING_MAX_MS);
    return () => clearTimeout(timer);
  }, [landing]);
  /** Page `page` now shows its own picture: its landed part may go. */
  const painted = useCallback((page: number) => {
    setLanding((held) => (held?.page === page ? null : held));
  }, []);
  return { landing, painted };
}
