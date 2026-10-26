/**
 * Edit's folded figures' layer orders in the project file: in the crease
 * pattern's `extensions` bag, under one key, rather than on each figure
 * (`implementation-plans/layer-order-dialog.md`, approach 6, D15).
 *
 * Every build since v0.2.0 reads that bag, holds it and writes it back as it
 * came, so no build drops a record and the reader version does not move. A
 * field on the figure would be dropped by every build before this one, whose
 * figure reader keeps only the fields it names.
 *
 * ```json
 * "extensions": {
 *   "oristudio.foldedFigureLayerOrders": {
 *     "figures": { "<figure id>": { "figureKey": "fk1:…", "sourceKey": "fs1:…", "record": "{\"v\":1,…}" } },
 *     "detached": [{ "figureId": "…", "reason": "order-not-given", "figureKey": "…", "sourceKey": "…", "record": "…" }]
 *   }
 * }
 * ```
 *
 * **Linking.** A record attaches to the figure of its id only when that
 * figure's snapshot says its order was given, and the figure's key — a hash of
 * its source fingerprint and the case it shows — is the one saved with it.
 * Figure ids are reused (`generated-N`), and an older build carries the bag
 * and the figure's snapshot unchanged, replacing the snapshot only when it
 * folds again. So a figure refolded by an older build, or a new figure on a
 * reused id, has no `shown_order` and never inherits a record. A 3D figure
 * keeps its record while its creases fold in 3D (D13) and has no flat
 * snapshot at all, so it attaches by its key alone, which names 3D: a 3D
 * figure folded again from other creases, or by an older build from these
 * after an edit, has another key.
 *
 * **Detached, never dropped.** A record that does not attach is detached: it
 * moves to the list with why, and is written back there, never to attach
 * again by accident, until the user takes it up or lets it go. Only damage —
 * an entry that is not one — is dropped.
 *
 * **Detached, shown for review** (the approved "Detached by an older build"
 * frame). An `order-not-given` record whose figure is still there, flat, and
 * folded from the creases the record was saved on — its source key, a hash of
 * the source fingerprint alone, is the figure's — is held on the figure for
 * review (`detachedLayerOrder`): never used to fold, its entry still in the
 * list. A figure on a reused id, folded from other creases, has another source
 * key and is shown nothing. An Apply on the figure takes the record up
 * (`reattached`), and the next save drops its entry; an undo of that Apply
 * puts the figure back as it was, and the entry stays.
 *
 * **Zero bytes by default.** With no record and none detached the key is left
 * out, and a bag the writer was handed is written as it came, so a project
 * without layer orders saves the bytes it always did.
 */
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import { NEWER, hasNewerKey, isRecord } from '../../lib/documentFile';
import { keyDigest } from '../../lib/keyDigest';
import type { DetachedFigureLayerOrder, FoldedFigureLayerOrder } from '../../lib/layerOrder/foldedFigureLayerOrder';
import { readLayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import { foldedFigureCurrentCase } from './foldedFigureState';

/** The crease pattern's extensions key the figures' layer orders are saved under. */
export const FOLDED_FIGURE_LAYER_ORDERS_KEY = 'oristudio.foldedFigureLayerOrders';

/** Names the algorithm in the key itself, so a later one can be told apart. */
const FIGURE_KEY_PREFIX = 'fk1:';
const SOURCE_KEY_PREFIX = 'fs1:';

/** The fields of a saved record's entry; another makes it a newer build's. */
const SAVED_KEYS: ReadonlySet<string> = new Set(['figureKey', 'sourceKey', 'record']);

/**
 * Why a record is detached:
 * - `figure-missing`: no figure has its id;
 * - `order-not-given`: a flat figure whose snapshot does not say its order was
 *   given — an older build folded it again, or a new figure took the id (a 3D
 *   figure, which has no flat snapshot, is known by its key alone);
 * - `figure-changed`: it says given, but its source or its case is not the one
 *   the record was saved with.
 */
export type FoldedFigureLayerOrderDetachReason = 'figure-missing' | 'order-not-given' | 'figure-changed';

/** A detached record, as the bag holds it. */
export interface DetachedFoldedFigureLayerOrder {
  /** The figure it was saved on: which may be gone, or another figure now. */
  figureId: string;
  reason: FoldedFigureLayerOrderDetachReason;
  /** The source key it was saved with, when it was saved with one ({@link foldedFigureSourceKey}). */
  sourceKey?: string;
  /** The record as saved; a newer build's, or damage, alike. */
  record: string;
}

/** The figures with their records attached, and the bag that is left: detached records and other builds' keys. */
export interface LinkedFoldedFigureLayerOrders {
  figures: OristudioCpFoldedFigureEntry[];
  extensions: Record<string, unknown>;
}

/**
 * Which fold a figure shows, for its record to recognise: a hash of its
 * source fingerprint and the case it shows, never the fingerprint itself,
 * which old files hold raw at up to about 50 KB.
 */
export function foldedFigureLayerOrderKey(figure: OristudioCpFoldedFigureEntry): string {
  return keyDigest(
    [figure.sourceFingerprint ?? '', figure.folded3d ? '3d' : 'flat', String(foldedFigureCurrentCase(figure))],
    FIGURE_KEY_PREFIX
  );
}

/**
 * Which creases a figure was folded from, for a detached record to recognise
 * its figure by: a hash of its source fingerprint alone, so another case of
 * the same fold, as an older build's Another solution or refold of unchanged
 * creases leaves it, is still the same figure.
 */
export function foldedFigureSourceKey(figure: OristudioCpFoldedFigureEntry): string {
  return keyDigest([figure.sourceFingerprint ?? ''], SOURCE_KEY_PREFIX);
}

/**
 * Attach each saved record to its figure, at install: by the rule above. A
 * record that does not attach moves to the detached list, with why. The bag
 * keeps the key where it was, holding what is left, so a project opened and
 * saved again writes it in the same place. A detached record its figure still
 * shows for review is held on the figure besides (`detachedLayerOrder`), its
 * entry left in the list.
 */
export function linkFoldedFigureLayerOrders(
  extensions: Record<string, unknown>,
  figures: OristudioCpFoldedFigureEntry[]
): LinkedFoldedFigureLayerOrders {
  const value = extensions[FOLDED_FIGURE_LAYER_ORDERS_KEY];
  // None, or a value this build cannot read: left as it is, attaching nothing.
  if (!isRecord(value)) return { figures, extensions };
  const { figures: saved, detached, ...rest } = value;
  const stillDetached: unknown[] = Array.isArray(detached) ? [...detached] : [];
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const attached = new Map<string, FoldedFigureLayerOrder>();
  for (const [figureId, entry] of Object.entries(isRecord(saved) ? saved : {})) {
    // Damage: not an entry at all.
    if (!isRecord(entry) || typeof entry.figureKey !== 'string' || typeof entry.record !== 'string') continue;
    const reason = detachReason(byId.get(figureId), entry.figureKey);
    if (reason) {
      stillDetached.push({ figureId, reason, ...entry });
      continue;
    }
    const held = heldLayerOrder(entry);
    if (held) attached.set(figureId, held);
  }
  const shown = detachedForReview(stillDetached, byId);
  return {
    figures: figures.map((figure) => {
      const layerOrder = attached.get(figure.id);
      const detachedLayerOrder = layerOrder ? undefined : shown.get(figure.id);
      if (!layerOrder && !detachedLayerOrder) return figure;
      return { ...figure, ...(layerOrder ? { layerOrder } : {}), ...(detachedLayerOrder ? { detachedLayerOrder } : {}) };
    }),
    extensions: {
      ...extensions,
      [FOLDED_FIGURE_LAYER_ORDERS_KEY]: { ...(stillDetached.length > 0 ? { detached: stillDetached } : {}), ...rest },
    },
  };
}

/**
 * The detached records a figure shows for review, by figure id: an
 * `order-not-given` entry whose figure is there and flat, saved with that
 * figure's source key, holding a record this build reads. Never a
 * `figure-missing` one, a 3D figure's, another figure's on a reused id, or a
 * newer build's. One per figure, the last.
 */
function detachedForReview(
  entries: readonly unknown[],
  byId: ReadonlyMap<string, OristudioCpFoldedFigureEntry>
): Map<string, DetachedFigureLayerOrder> {
  const shown = new Map<string, DetachedFigureLayerOrder>();
  for (const entry of entries) {
    if (!isRecord(entry) || entry.reason !== 'order-not-given' || typeof entry.figureId !== 'string') continue;
    if (typeof entry.sourceKey !== 'string' || typeof entry.record !== 'string') continue;
    const figure = byId.get(entry.figureId);
    if (!figure || figure.folded3d != null || foldedFigureSourceKey(figure) !== entry.sourceKey) continue;
    const read = readLayerOrderRecord(entry.record);
    if (read === NEWER || !read.ok) continue;
    shown.set(entry.figureId, { record: read.record, json: entry.record, sourceKey: entry.sourceKey });
  }
  return shown;
}

/**
 * The bag to write: `extensions` with every figure's record in it. Each
 * figure's own record replaces one of its id the bag still holds; what the bag
 * holds that no figure claims — detached records, other builds' keys, records
 * a reader never linked — is written as it came, but for a detached record a
 * figure's Apply took up (`detachedLayerOrder.reattached`). With none of
 * either, the key is left out; and a bag with no key and no figure with a
 * record is returned as it came, the very object.
 */
export function withFoldedFigureLayerOrders(
  extensions: Record<string, unknown>,
  figures: readonly OristudioCpFoldedFigureEntry[]
): Record<string, unknown> {
  const live = figures.flatMap((figure) =>
    figure.layerOrder ? [[figure.id, savedLayerOrder(figure, figure.layerOrder)] as const] : []
  );
  const value = extensions[FOLDED_FIGURE_LAYER_ORDERS_KEY];
  if (!isRecord(value)) {
    if (live.length === 0) return extensions;
    // A value this build cannot read gives way to the records it holds.
    return { ...extensions, [FOLDED_FIGURE_LAYER_ORDERS_KEY]: { figures: Object.fromEntries(live) } };
  }
  const { figures: saved, detached, ...rest } = value;
  const claimed = new Set(live.map(([figureId]) => figureId));
  const unclaimed = Object.entries(isRecord(saved) ? saved : {}).filter(([figureId]) => !claimed.has(figureId));
  const written = [...live, ...unclaimed];
  // A detached record an Apply took up is the figure's live one now: its entry goes.
  const reattached = (entry: unknown) =>
    isRecord(entry) &&
    figures.some(
      (figure) =>
        figure.id === entry.figureId &&
        figure.detachedLayerOrder?.reattached === true &&
        figure.detachedLayerOrder.json === entry.record
    );
  const stillDetached = Array.isArray(detached) ? detached.filter((entry) => !reattached(entry)) : [];
  const ours = {
    ...(written.length > 0 ? { figures: Object.fromEntries(written) } : {}),
    ...(stillDetached.length > 0 ? { detached: stillDetached } : {}),
    ...rest,
  };
  if (Object.keys(ours).length > 0) return { ...extensions, [FOLDED_FIGURE_LAYER_ORDERS_KEY]: ours };
  return Object.fromEntries(Object.entries(extensions).filter(([key]) => key !== FOLDED_FIGURE_LAYER_ORDERS_KEY));
}

/** The detached records the bag holds, each as it reads; for a host to show them. */
export function detachedFoldedFigureLayerOrders(
  extensions: Record<string, unknown>
): DetachedFoldedFigureLayerOrder[] {
  const value = extensions[FOLDED_FIGURE_LAYER_ORDERS_KEY];
  if (!isRecord(value) || !Array.isArray(value.detached)) return [];
  return value.detached.flatMap((entry) =>
    isRecord(entry) &&
    typeof entry.figureId === 'string' &&
    isDetachReason(entry.reason) &&
    typeof entry.record === 'string'
      ? [
          {
            figureId: entry.figureId,
            reason: entry.reason,
            ...(typeof entry.sourceKey === 'string' ? { sourceKey: entry.sourceKey } : {}),
            record: entry.record,
          },
        ]
      : []
  );
}

function detachReason(
  figure: OristudioCpFoldedFigureEntry | undefined,
  figureKey: string
): FoldedFigureLayerOrderDetachReason | null {
  if (!figure) return 'figure-missing';
  // A 3D figure keeps its record for when its creases fold flat again (D13),
  // and has no flat snapshot to say an order was given: its key, which names
  // 3D, says it is the fold the record was kept on.
  if (figure.folded3d == null && figure.snapshot?.shown_order !== 'given') return 'order-not-given';
  if (foldedFigureLayerOrderKey(figure) !== figureKey) return 'figure-changed';
  return null;
}

/** A saved entry as a figure holds it: null for a record that is damaged, which is dropped. */
function heldLayerOrder(entry: Record<string, unknown>): FoldedFigureLayerOrder | null {
  if (hasNewerKey(entry, SAVED_KEYS)) return { kind: 'newer', saved: entry };
  const read = readLayerOrderRecord(entry.record);
  if (read === NEWER) return { kind: 'newer', saved: entry };
  return read.ok ? { kind: 'record', record: read.record, json: read.json } : null;
}

/** A figure's record as the bag saves it: this build's keyed to the figure as it is now, a newer build's as it came. */
function savedLayerOrder(
  figure: OristudioCpFoldedFigureEntry,
  layerOrder: FoldedFigureLayerOrder
): Readonly<Record<string, unknown>> {
  return layerOrder.kind === 'newer'
    ? layerOrder.saved
    : { figureKey: foldedFigureLayerOrderKey(figure), sourceKey: foldedFigureSourceKey(figure), record: layerOrder.json };
}

function isDetachReason(value: unknown): value is FoldedFigureLayerOrderDetachReason {
  return value === 'figure-missing' || value === 'order-not-given' || value === 'figure-changed';
}
