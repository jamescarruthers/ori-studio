import { describe, expect, it } from 'vitest';
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import { DEFAULT_FOLDED_MODEL } from '../../lib/orieditaNativeMetadata';
import { foldedFigureLayerOrder, type FoldedFigureLayerOrder } from '../../lib/layerOrder/foldedFigureLayerOrder';
import type { LayerOrderRecord } from '../../lib/layerOrder/layerOrderRecord';
import {
  FOLDED_FIGURE_LAYER_ORDERS_KEY as KEY,
  detachedFoldedFigureLayerOrders,
  foldedFigureLayerOrderKey,
  linkFoldedFigureLayerOrders,
  withFoldedFigureLayerOrders,
} from './foldedFigureLayerOrders';

const RECORD: LayerOrderRecord = {
  faces: [
    { at: [100, 150], area: 20000 },
    { at: [300, 150], area: 20000 },
  ],
  constraints: [[0, 1, 1]],
  order: [],
};

const RECORD_JSON =
  '{"v":1,"faces":[{"at":[100,150],"area":20000},{"at":[300,150],"area":20000}],"constraints":[[0,1,1]],"order":[]}';

function held(record: LayerOrderRecord = RECORD): FoldedFigureLayerOrder {
  const result = foldedFigureLayerOrder(record);
  if (!result.ok) throw new Error(result.reason);
  return result.layerOrder;
}

/** A flat figure shown at `fold_case`, its order given unless `searched`. */
function figure(
  id: string,
  { fingerprint = 'cs1:fold', foldCase = 1, searched = false } = {}
): OristudioCpFoldedFigureEntry {
  return {
    id,
    title: id,
    handle: null,
    sourceKind: 'generated-from-current-cp',
    sourceCpRevision: 1,
    startingFaceId: 1,
    displayStyle: 'Paper5',
    status: 'ready',
    snapshot: {
      model: DEFAULT_FOLDED_MODEL,
      estimation_step: 'Step5',
      display_style: 'Paper5',
      discovered_fold_cases: foldCase,
      current_fold_case: foldCase,
      find_another_overlap_valid: false,
      text_result: '',
      wireframe: null,
      outcome: 'Solved',
      ...(searched ? {} : { shown_order: 'given' as const }),
    },
    renderSnapshot: null,
    placement: { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
    sourceFingerprint: fingerprint,
    error: null,
  };
}

function withRecord(entry: OristudioCpFoldedFigureEntry, layerOrder = held()): OristudioCpFoldedFigureEntry {
  return { ...entry, layerOrder };
}

/** What the writer puts in the bag, read back the way a file is. */
function saved(extensions: Record<string, unknown>, figures: OristudioCpFoldedFigureEntry[]) {
  return JSON.parse(JSON.stringify(withFoldedFigureLayerOrders(extensions, figures))) as Record<string, unknown>;
}

describe('a figure’s key', () => {
  it('names the source and the case it shows, so another fold of the same id is told apart', () => {
    const key = foldedFigureLayerOrderKey(figure('generated-1'));
    expect(foldedFigureLayerOrderKey(figure('generated-9'))).toBe(key);
    expect(foldedFigureLayerOrderKey(figure('generated-1', { fingerprint: 'cs1:edited' }))).not.toBe(key);
    expect(foldedFigureLayerOrderKey(figure('generated-1', { foldCase: 2 }))).not.toBe(key);
  });

  it('hashes the fingerprint, never copies it: old files hold raw ones of about 50 KB', () => {
    const raw = 'segment;'.repeat(6400);
    const key = foldedFigureLayerOrderKey(figure('generated-1', { fingerprint: raw }));
    expect(key).toMatch(/^fk1:[0-9a-f]{16}$/);
  });
});

describe('saving a figure’s layer order in the bag', () => {
  it('returns a bag with no record to write as it came, the very object', () => {
    const bag = { futureDocFeature: { a: 1 } };
    expect(withFoldedFigureLayerOrders(bag, [figure('generated-1')])).toBe(bag);
    expect(withFoldedFigureLayerOrders(bag, [{ ...figure('generated-1'), layerOrder: null }])).toBe(bag);
  });

  it('writes each figure’s record under its id, keyed to the figure, after the other keys', () => {
    const fig = withRecord(figure('generated-1'));
    const bag = saved({ futureDocFeature: { a: 1 } }, [fig, figure('generated-2')]);
    expect(Object.keys(bag)).toEqual(['futureDocFeature', KEY]);
    expect(bag[KEY]).toEqual({
      figures: { 'generated-1': { figureKey: foldedFigureLayerOrderKey(fig), record: RECORD_JSON } },
    });
  });

  it('keeps the key where the bag had it, between the other builds’ keys', () => {
    const bag = saved({ first: 1, [KEY]: {}, last: 2 }, [withRecord(figure('generated-1'))]);
    expect(Object.keys(bag)).toEqual(['first', KEY, 'last']);
  });

  it('leaves the key out once no figure has a record and nothing is detached', () => {
    expect(saved({ first: 1, [KEY]: {}, last: 2 }, [figure('generated-1')])).toEqual({ first: 1, last: 2 });
  });

  it('writes back what no figure claims as it came: detached records, other fields, records never linked', () => {
    const value = {
      figures: { 'generated-7': { figureKey: 'fk1:x', record: '{"v":2}' } },
      detached: [{ figureId: 'generated-3', reason: 'figure-missing', figureKey: 'fk1:y', record: '{"v":1}' }],
      laterField: [1],
    };
    expect(saved({ [KEY]: value }, [figure('generated-1')])).toEqual({ [KEY]: value });
    // A figure's own record replaces the one of its id, and the others stay.
    const fig = withRecord(figure('generated-7'));
    expect((saved({ [KEY]: value }, [fig])[KEY] as typeof value).figures['generated-7']!.figureKey).toBe(
      foldedFigureLayerOrderKey(fig)
    );
  });

  it('gives way where the bag holds something under the key that it cannot read', () => {
    expect(saved({ [KEY]: 'garbled' }, [figure('generated-1')])).toEqual({ [KEY]: 'garbled' });
    expect(saved({ [KEY]: 'garbled' }, [withRecord(figure('generated-1'))])[KEY]).toMatchObject({
      figures: { 'generated-1': {} },
    });
  });
});

describe('attaching saved layer orders at install', () => {
  function bagFor(figures: OristudioCpFoldedFigureEntry[], extra: Record<string, unknown> = {}) {
    return saved({ futureDocFeature: { a: 1 }, ...extra }, figures);
  }

  it('attaches a record to its figure when the figure shows the order it was saved with', () => {
    const bag = bagFor([withRecord(figure('generated-1'))]);
    const linked = linkFoldedFigureLayerOrders(bag, [figure('generated-1'), figure('generated-2')]);
    expect(linked.figures[0]!.layerOrder).toEqual(held());
    expect(linked.figures[1]!.layerOrder).toBeUndefined();
    // The key stays where it was, holding what is left: nothing.
    expect(linked.extensions).toEqual({ futureDocFeature: { a: 1 }, [KEY]: {} });
    // And saved again, it is the bag it came from.
    expect(saved(linked.extensions, linked.figures)).toEqual(bag);
  });

  it('leaves a bag without the key, or with one it cannot read, as it came', () => {
    const figures = [figure('generated-1')];
    for (const bag of [{ futureDocFeature: { a: 1 } }, { [KEY]: [1, 2] }]) {
      const linked = linkFoldedFigureLayerOrders(bag, figures);
      expect(linked.extensions).toBe(bag);
      expect(linked.figures).toBe(figures);
    }
  });

  it.each([
    ['its figure is gone', [] as OristudioCpFoldedFigureEntry[], 'figure-missing'],
    // An older build refolded it, or deleted it and folded the same creases on the reused id.
    ['its figure’s order was searched', [figure('generated-1', { searched: true })], 'order-not-given'],
    ['its figure shows another case', [figure('generated-1', { foldCase: 2 })], 'figure-changed'],
    ['its figure was folded from other creases', [figure('generated-1', { fingerprint: 'cs1:edited' })], 'figure-changed'],
  ])('detaches a record when %s, and keeps it', (_label, figures, reason) => {
    const bag = bagFor([withRecord(figure('generated-1'))]);
    const record = ((bag[KEY] as { figures: Record<string, { record: string }> }).figures['generated-1']!).record;
    const linked = linkFoldedFigureLayerOrders(bag, figures);
    expect(linked.figures.every((entry) => entry.layerOrder === undefined)).toBe(true);
    expect(detachedFoldedFigureLayerOrders(linked.extensions)).toEqual([{ figureId: 'generated-1', reason, record }]);
    // Written back where it is now, and never attached again, whatever takes the id.
    const again = saved(linked.extensions, linked.figures);
    expect(detachedFoldedFigureLayerOrders(again)).toEqual([{ figureId: 'generated-1', reason, record }]);
    expect(linkFoldedFigureLayerOrders(again, [figure('generated-1')]).figures[0]!.layerOrder).toBeUndefined();
  });

  it('holds a newer build’s record as it came, keyed as that build keyed it', () => {
    const fig = figure('generated-1');
    const entries = [
      { figureKey: foldedFigureLayerOrderKey(fig), record: '{"v":2,"constraints":"by name"}' },
      { figureKey: foldedFigureLayerOrderKey(fig), record: '{"v":1}', solvedBy: 'clauses' },
    ];
    for (const entry of entries) {
      const bag = { [KEY]: { figures: { 'generated-1': entry } } };
      const linked = linkFoldedFigureLayerOrders(bag, [fig]);
      expect(linked.figures[0]!.layerOrder).toEqual({ kind: 'newer', saved: entry });
      // Saved again as it came, even once the figure has changed: a newer build judges it.
      const changed = { ...linked.figures[0]!, sourceFingerprint: 'cs1:edited' };
      expect(saved(linked.extensions, [changed])).toEqual(bag);
    }
  });

  it('drops only damage: an entry that is not one, or a record that does not read', () => {
    const fig = figure('generated-1');
    const bag = {
      [KEY]: {
        figures: {
          'generated-1': { figureKey: foldedFigureLayerOrderKey(fig), record: '{"v":1,"faces":"none"}' },
          'generated-2': 'not an entry',
          'generated-3': { record: '{"v":1}' },
        },
      },
    };
    const linked = linkFoldedFigureLayerOrders(bag, [fig]);
    expect(linked.figures[0]!.layerOrder).toBeUndefined();
    expect(linked.extensions).toEqual({ [KEY]: {} });
  });
});
