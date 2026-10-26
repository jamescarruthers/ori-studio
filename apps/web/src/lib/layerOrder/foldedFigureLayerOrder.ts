/**
 * A folded figure's layer order as Edit holds it, on the figure
 * (`OristudioCpFoldedFigureEntry.layerOrder`). The project file keeps it
 * elsewhere, in the crease pattern's extensions bag
 * (`cp-workspace/folded/foldedFigureLayerOrders.ts`), which is why the figure
 * writer strips it.
 */
import {
  encodeLayerOrderRecord,
  type LayerOrderRecord,
  type LayerOrderRecordEncoding,
} from './layerOrderRecord';

export type FoldedFigureLayerOrder =
  | {
      /** A record this build reads: the order the figure shows. */
      readonly kind: 'record';
      readonly record: LayerOrderRecord;
      /** The record as saved, written back as it is. */
      readonly json: string;
    }
  | {
      /**
       * A newer build's: the figure's layer order is that build's to change.
       * Its saved entry, written back as it came.
       */
      readonly kind: 'newer';
      readonly saved: Readonly<Record<string, unknown>>;
    };

/**
 * A record a reload detached from its figure, because an older build folded
 * the figure again (its snapshot no longer says the order was given), held
 * on the figure for review alone: the flag says its constraints aren't
 * applied, and Layer order… opens on it. Never used to fold. The bag keeps
 * its entry in `detached`, written back as it came, until an Apply re-attaches
 * it (`reattached`), and the save then drops it
 * (`cp-workspace/folded/foldedFigureLayerOrders.ts`).
 */
export interface DetachedFigureLayerOrder {
  readonly record: LayerOrderRecord;
  /** The record as saved. */
  readonly json: string;
  /** The source key it was saved with: shown only while the figure's is that one. */
  readonly sourceKey: string;
  /** An Apply on the figure took it up: no longer shown, and dropped from the bag when saved. */
  readonly reattached?: true;
}

/**
 * A record for a figure to hold, encoded once, so what it holds is what it
 * saves: or why it cannot be saved, a part that does not read or more than
 * the budget.
 */
export function foldedFigureLayerOrder(
  record: LayerOrderRecord
): { ok: true; layerOrder: FoldedFigureLayerOrder } | Extract<LayerOrderRecordEncoding, { ok: false }> {
  const encoded = encodeLayerOrderRecord(record);
  if (!encoded.ok) return encoded;
  return { ok: true, layerOrder: { kind: 'record', record, json: encoded.json } };
}
