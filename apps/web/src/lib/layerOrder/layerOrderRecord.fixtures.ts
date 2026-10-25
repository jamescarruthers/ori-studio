/**
 * Records for tests. Imported only by `*.test.ts`.
 */
import { LAYER_ORDER_RECORD_VERSION, type LayerOrderRecord } from './layerOrderRecord';

/** The record's JSON as the encoder writes it, without the budget the encoder holds it to. */
function jsonLength(record: LayerOrderRecord): number {
  return JSON.stringify({ v: LAYER_ORDER_RECORD_VERSION, ...record }).length;
}

/**
 * A record whose JSON is exactly `bytes` long: unit faces, then order pairs
 * between the first two to make up the rest, then the few bytes left over on
 * the first face's area (11, 111, …). A face is 27 bytes and a pair 8, comma
 * included.
 */
export function layerOrderRecordOfSize(bytes: number): LayerOrderRecord {
  const face = { at: [0.5, 0.25] as const, area: 1 };
  const empty = jsonLength({ faces: [], constraints: [], order: [] });
  const faceCount = Math.floor((bytes - empty) / (JSON.stringify(face).length + 1)) - 1;
  const faces = Array.from({ length: faceCount }, () => face);
  // The first pair has no comma before it.
  const pairCount = Math.floor((bytes - jsonLength({ faces, constraints: [], order: [] }) + 1) / 8);
  const record = { faces, constraints: [], order: Array.from({ length: pairCount }, () => [0, 1, 1] as const) };
  const area = Number('1'.repeat(bytes - jsonLength(record) + 1));
  return { ...record, faces: [{ at: face.at, area }, ...faces.slice(1)] };
}
