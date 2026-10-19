import type { FoldArtifacts, FoldDocument } from '../../engine/types';
import type { OristudioCpDocumentSnapshot } from '../../engine/oristudioCpTypes';
import { creaseFingerprint } from '../../lib/creaseFingerprint';
import {
  foldArtifactsFromFold,
  segmentationFoldArtifactsFromFold,
} from '../../lib/creasePatternImport';
import { wholeFoldSegment } from '../../lib/creasePatternSegmentation';
import { exportOristudioCpLinesAsFold } from '../../store/workspaceStore/oristudioCpRuntime';
import { ensureCpSheetIndex } from './cpSheetIndex';

/**
 * One sheet's faces, built when something acts on that sheet: its lines as the
 * kernel exports them (`exportOristudioCpLinesAsFold`), with the kernel's faces
 * where it can trust them and faces inferred from the lines where it cannot —
 * what segmentation did for the whole canvas, for one sheet. On the 489k-line
 * reference canvas that is tens of milliseconds a sheet, where the whole canvas
 * took eleven seconds.
 *
 * The artifacts carry one segment, the whole sheet ({@link wholeFoldSegment}),
 * whose id is the sheet's position in the index. Callers that took a fold and a
 * segment from whole-canvas segmentation take them from here unchanged.
 */
export function sheetArtifactsFromFold(fold: FoldDocument, sheet: number): FoldArtifacts {
  const artifacts = segmentationFoldArtifactsFromFold(fold);
  return { ...artifacts, segments: [wholeFoldSegment(artifacts.fold, sheet)] };
}

/**
 * Enough for every sheet one action or one diagram page touches; a superseded
 * crease geometry drops them all, as `cpSheetIndex` drops its one index.
 */
const MAX_CACHED_SHEETS = 8;

let cached: { fingerprint: string; sheets: Map<number, FoldArtifacts> } | null = null;
const inFlight = new Map<string, Promise<FoldArtifacts | null>>();

function cachedSheets(fingerprint: string): Map<number, FoldArtifacts> {
  if (cached?.fingerprint !== fingerprint) cached = { fingerprint, sheets: new Map() };
  return cached.sheets;
}

/** Already-built artifacts for this sheet of these creases, if any. Never starts work. */
export function peekCpSheetArtifacts(
  document: OristudioCpDocumentSnapshot | null | undefined,
  sheet: number
): FoldArtifacts | null {
  if (!document || cached?.fingerprint !== creaseFingerprint(document)) return null;
  return cached.sheets.get(sheet) ?? null;
}

/**
 * The artifacts for one sheet of the open crease pattern, built once per crease
 * geometry. `null` without a document, for a sheet the index does not have, or
 * when the export fails.
 *
 * Like the whole-canvas segmentation before it, this reads the kernel's current
 * document: an edit landing between the index and the export is not detected.
 */
export function ensureCpSheetArtifacts(
  document: OristudioCpDocumentSnapshot | null | undefined,
  sheet: number
): Promise<FoldArtifacts | null> {
  if (!document) return Promise.resolve(null);
  const fingerprint = creaseFingerprint(document);
  const hit = cached?.fingerprint === fingerprint ? cached.sheets.get(sheet) : undefined;
  if (hit) return Promise.resolve(hit);
  const key = `${fingerprint}#${sheet}`;
  const running = inFlight.get(key);
  if (running) return running;

  const promise = (async (): Promise<FoldArtifacts | null> => {
    const index = await ensureCpSheetIndex(document);
    if (!index || sheet < 0 || sheet >= index.sheetCount) return null;
    const fold = JSON.parse(await exportOristudioCpLinesAsFold(index.lines(sheet))) as FoldDocument;
    const artifacts = sheetArtifactsFromFold(fold, sheet);
    const sheets = cachedSheets(fingerprint);
    sheets.set(sheet, artifacts);
    if (sheets.size > MAX_CACHED_SHEETS) {
      const oldest = sheets.keys().next().value;
      if (oldest !== undefined) sheets.delete(oldest);
    }
    return artifacts;
  })()
    .catch((error: unknown) => {
      // Not cached: one transient failure must not disable the sheet until the
      // next edit.
      console.warn('Crease-pattern sheet faces failed.', error);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

/**
 * {@link ensureCpSheetArtifacts} with the simulation mesh as well — the
 * triangulated fold an inline simulation window solves — built for this sheet
 * alone and kept with its faces.
 */
export async function ensureCpSheetSimulationArtifacts(
  document: OristudioCpDocumentSnapshot | null | undefined,
  sheet: number
): Promise<FoldArtifacts | null> {
  const artifacts = await ensureCpSheetArtifacts(document, sheet);
  if (!artifacts || artifacts.simulation_model || artifacts.simulation_model_error) {
    return artifacts;
  }
  // The faces are already there, so this only builds the mesh over them.
  const meshed: FoldArtifacts = {
    ...foldArtifactsFromFold(artifacts.fold),
    segments: artifacts.segments,
  };
  if (cached?.sheets.get(sheet) === artifacts) cached.sheets.set(sheet, meshed);
  return meshed;
}
