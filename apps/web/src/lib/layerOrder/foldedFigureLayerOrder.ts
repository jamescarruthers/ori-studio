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
