import type { FoldArtifacts } from '../engine/types';
import type { OristudioCpDocumentSnapshot } from '../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../store/workspaceStore';
import { analyzeOristudioCpDocument } from '../store/workspaceStore/oristudioCpRuntime';
import { creaseFingerprint } from '../lib/creaseFingerprint';

/**
 * Segments-only fold artifacts for the active editable crease pattern, cached by
 * {@link creaseFingerprint}.
 *
 * A single slot is enough: only one crease pattern is active at a time, and a
 * superseded fingerprint is never wanted again.
 */
let cached: { fingerprint: string; artifacts: FoldArtifacts } | null = null;
let inFlight: { fingerprint: string; promise: Promise<FoldArtifacts | null> } | null = null;

/** Already-computed artifacts for this crease geometry, if any. Never starts work. */
export function peekCpSegmentationArtifacts(
  document: OristudioCpDocumentSnapshot | null | undefined
): FoldArtifacts | null {
  if (!document || !cached) return null;
  return cached.fingerprint === creaseFingerprint(document) ? cached.artifacts : null;
}

/**
 * Resolve segmentation-only artifacts (base fold + faces, **no** simulation mesh)
 * for the current crease geometry. Unlike `ensureFoldArtifacts` this never builds
 * the triangulated simulation model — see {@link segmentationFoldArtifactsFromFold}.
 * Resolves `null` when no editable document is loaded or the export fails.
 */
export function ensureCpSegmentationArtifacts(
  document: OristudioCpDocumentSnapshot | null | undefined,
): Promise<FoldArtifacts | null> {
  if (!document) return Promise.resolve(null);
  const fingerprint = creaseFingerprint(document);
  if (cached?.fingerprint === fingerprint)
    return Promise.resolve(cached.artifacts);
  if (inFlight?.fingerprint === fingerprint) return inFlight.promise;
  // Coalesce superseded work: editing quickly must not queue one large
  // analysis per intermediate snapshot behind the current analysis.
  if (inFlight)
    return inFlight.promise.then(() => {
      const current =
        useWorkspaceStore.getState().oristudioCpDocument?.document;
      return current && creaseFingerprint(current) === fingerprint
        ? ensureCpSegmentationArtifacts(current)
        : null;
    });

  const promise = (async (): Promise<FoldArtifacts | null> => {
    const startedAt = performance.now();
    const artifacts = await analyzeOristudioCpDocument(document);
    const current = useWorkspaceStore.getState().oristudioCpDocument?.document;
    if (!current || creaseFingerprint(current) !== fingerprint) return null;
    cached = { fingerprint, artifacts };
    if (import.meta.env.DEV) {
      console.debug(
        `[cp-toolbar] segmentation recomputed in ${Math.round(performance.now() - startedAt)}ms (${fingerprint})`,
      );
    }
    return artifacts;
  })()
    .catch((error: unknown) => {
      // Never leave a failure cached: one transient error (e.g. the kernel handle
      // not ready) would otherwise disable the toolbar until the next edit. Report
      // rather than swallow — a silently absent toolbar is indistinguishable from
      // "this selection is not a crease pattern".
      console.warn(
        "Crease-pattern segmentation failed; selection actions unavailable.",
        error,
      );
      return null;
    })
    .finally(() => {
      if (inFlight?.fingerprint === fingerprint) inFlight = null;
    });

  inFlight = { fingerprint, promise };
  return promise;
}
