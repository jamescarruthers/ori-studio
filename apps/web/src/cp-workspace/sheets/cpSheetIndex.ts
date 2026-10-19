import type { CpSheetIndex } from '../../engine/oristudioCpSheetIndex';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { creaseFingerprint } from '../../lib/creaseFingerprint';
import { fetchOristudioCpSheetIndex } from '../../store/workspaceStore/oristudioCpRuntime';

/**
 * The open crease pattern's sheet index, cached by {@link creaseFingerprint}:
 * what the index reads — every line's endpoints, colour and position in the
 * list — only changes with the creases, while a fresh snapshot arrives with
 * every kernel command, a selection included.
 *
 * One slot: one crease pattern is open at a time, and a superseded
 * fingerprint is never wanted again.
 */
let cached: { fingerprint: string; index: CpSheetIndex } | null = null;
let inFlight: {
  fingerprint: string;
  promise: Promise<CpSheetIndex | null>;
} | null = null;

/** The index for these creases if it is already built. Never starts work. */
export function peekCpSheetIndex(
  document: OristudioCpDocumentSnapshot | null | undefined
): CpSheetIndex | null {
  if (!document || !cached) return null;
  return cached.fingerprint === creaseFingerprint(document) ? cached.index : null;
}

/** The index for these creases, built once per crease geometry. `null` without a document. */
export function ensureCpSheetIndex(
  document: OristudioCpDocumentSnapshot | null | undefined
): Promise<CpSheetIndex | null> {
  if (!document) return Promise.resolve(null);
  const fingerprint = creaseFingerprint(document);
  if (cached?.fingerprint === fingerprint) return Promise.resolve(cached.index);
  if (inFlight?.fingerprint === fingerprint) return inFlight.promise;

  // Started inside the chain, so a failure of any kind — the call itself
  // throwing included — lands in the catch below rather than in the caller.
  const promise = (async () => {
    const index = await fetchOristudioCpSheetIndex();
    if (index) cached = { fingerprint, index };
    return index;
  })()
    .catch((error: unknown) => {
      // Not cached: one transient failure must not hide the sheets until the
      // next edit.
      console.warn('Crease-pattern sheet index failed.', error);
      return null;
    })
    .finally(() => {
      if (inFlight?.fingerprint === fingerprint) inFlight = null;
    });
  inFlight = { fingerprint, promise };
  return promise;
}
