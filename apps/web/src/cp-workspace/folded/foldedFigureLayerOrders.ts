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
 *     "figures": { "<figure id>": { "figureKey": "fk1:…", "record": "{\"v\":1,…}" } },
 *     "detached": [{ "figureId": "…", "reason": "order-not-given", "figureKey": "…", "record": "…" }]
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
 * reused id, has no `shown_order` and never inherits a record.
 *
 * **Detached, never dropped.** A record that does not attach is detached: it
 * moves to the list with why, and is written back there, never to attach
 * again by accident, until the user takes it up or lets it go. Only damage —
 * an entry that is not one — is dropped.
 *
 * **Zero bytes by default.** With no record and none detached the key is left
 * out, and a bag the writer was handed is written as it came, so a project
 * without layer orders saves the bytes it always did.
 */
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import { NEWER, hasNewerKey, isRecord } from '../../lib/documentFile';
import { keyDigest } from '../../lib/keyDigest';
import type { FoldedFigureLayerOrder } from '../../lib/layerOrder/foldedFigureLayerOrder';
import { readLayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import { foldedFigureCurrentCase } from './foldedFigureState';

/** The crease pattern's extensions key the figures' layer orders are saved under. */
export const FOLDED_FIGURE_LAYER_ORDERS_KEY = 'oristudio.foldedFigureLayerOrders';

/** Names the algorithm in the key itself, so a later one can be told apart. */
const FIGURE_KEY_PREFIX = 'fk1:';

/** The fields of a saved record's entry; another makes it a newer build's. */
const SAVED_KEYS: ReadonlySet<string> = new Set(['figureKey', 'record']);

/**
 * Why a record is detached:
 * - `figure-missing`: no figure has its id;
 * - `order-not-given`: the figure's snapshot does not say its order was given —
 *   an older build folded it again, a new figure took the id, or it is a 3D
 *   figure, which has no flat snapshot;
 * - `figure-changed`: it says given, but its source or its case is not the one
 *   the record was saved with.
 */
export type FoldedFigureLayerOrderDetachReason = 'figure-missing' | 'order-not-given' | 'figure-changed';

/** A detached record, as the bag holds it. */
export interface DetachedFoldedFigureLayerOrder {
  /** The figure it was saved on: which may be gone, or another figure now. */
  figureId: string;
  reason: FoldedFigureLayerOrderDetachReason;
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
 * Attach each saved record to its figure, at install: by the rule above. A
 * record that does not attach moves to the detached list, with why. The bag
 * keeps the key where it was, holding what is left, so a project opened and
 * saved again writes it in the same place.
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
  return {
    figures: figures.map((figure) => {
      const layerOrder = attached.get(figure.id);
      return layerOrder ? { ...figure, layerOrder } : figure;
    }),
    extensions: {
      ...extensions,
      [FOLDED_FIGURE_LAYER_ORDERS_KEY]: { ...(stillDetached.length > 0 ? { detached: stillDetached } : {}), ...rest },
    },
  };
}

/**
 * The bag to write: `extensions` with every figure's record in it. Each
 * figure's own record replaces one of its id the bag still holds; what the bag
 * holds that no figure claims — detached records, other builds' keys, records
 * a reader never linked — is written as it came. With none of either, the key
 * is left out; and a bag with no key and no figure with a record is returned
 * as it came, the very object.
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
  const ours = {
    ...(written.length > 0 ? { figures: Object.fromEntries(written) } : {}),
    ...(Array.isArray(detached) && detached.length > 0 ? { detached } : {}),
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
      ? [{ figureId: entry.figureId, reason: entry.reason, record: entry.record }]
      : []
  );
}

function detachReason(
  figure: OristudioCpFoldedFigureEntry | undefined,
  figureKey: string
): FoldedFigureLayerOrderDetachReason | null {
  if (!figure) return 'figure-missing';
  if (figure.snapshot?.shown_order !== 'given') return 'order-not-given';
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
    : { figureKey: foldedFigureLayerOrderKey(figure), record: layerOrder.json };
}

function isDetachReason(value: unknown): value is FoldedFigureLayerOrderDetachReason {
  return value === 'figure-missing' || value === 'order-not-given' || value === 'figure-changed';
}
