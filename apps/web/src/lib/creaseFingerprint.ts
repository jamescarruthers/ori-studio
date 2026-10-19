import type { OristudioCpDocumentSnapshot } from '../engine/oristudioCpTypes';

const COORD_QUANTIZE = 1e6;

/**
 * A cheap content fingerprint of the crease geometry — the actual input to
 * segmentation, and to which creases each segmented region contains.
 *
 * Both obvious proxies for "the creases changed" are wrong here. The document
 * snapshot is a fresh object after every kernel command, and
 * `foldArtifactRevision` advances on the deselect that precedes a new selection
 * (it records history, which marks fold artifacts stale). Keyed on either, the
 * cache missed on every selection and re-paid the ~1s segmentation.
 *
 * Hashing the endpoints, colours and fold magnitudes is O(creases) — well under a
 * millisecond for a 6k-crease pattern against a ~1s recompute — and changes
 * exactly when the exported fold would.
 */
function computeCreaseFingerprint(document: OristudioCpDocumentSnapshot): string {
  const lines = document.crease_pattern.line_segments;
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash ^= value | 0;
    hash = Math.imul(hash, 0x01000193);
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    mix(Math.round(line.a.x * COORD_QUANTIZE));
    mix(Math.round(line.a.y * COORD_QUANTIZE));
    mix(Math.round(line.b.x * COORD_QUANTIZE));
    mix(Math.round(line.b.y * COORD_QUANTIZE));
    mix(line.color.charCodeAt(0) + line.color.length);
    // Magnitude is orthogonal to colour by construction (`lib/foldAngle.ts`), so
    // dialling a crease from 180 to 90 changes neither the endpoints nor the
    // colour above. Without this, the cached artifacts — and the `edges_foldAngle`
    // that reaches the export and share cards from them — keep the old angles.
    mix(line.fold_magnitude ?? -1);
  }
  return `${lines.length}:${hash >>> 0}`;
}

/** Memoized per snapshot, so only a genuinely new snapshot pays the O(n) hash. */
const fingerprints = new WeakMap<OristudioCpDocumentSnapshot, string>();

/**
 * The identity of a crease geometry, for cache keying. Exported so what it does and
 * does not distinguish can be pinned directly, rather than only through a cache hit
 * that needs the kernel to observe.
 */
export function creaseFingerprint(document: OristudioCpDocumentSnapshot): string {
  const cachedFingerprint = fingerprints.get(document);
  if (cachedFingerprint !== undefined) return cachedFingerprint;
  const fingerprint = computeCreaseFingerprint(document);
  fingerprints.set(document, fingerprint);
  return fingerprint;
}
