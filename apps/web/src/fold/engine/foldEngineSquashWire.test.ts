import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLD_VERTEX_REFUSAL_CODES } from './foldEngineSquashWire';
import { FOLD_REFUSAL_CODES } from './foldEngineWire';

/** Vitest runs in the web workspace, two levels under the repository. */
const crate = (path: string) => readFileSync(resolve(process.cwd(), '../../crates', path), 'utf8');

describe('the vertex folds’ refusal codes', () => {
  it('list exactly the bridge’s VertexRefusal codes, in its order', () => {
    const source = crate('oristudio-fold-wasm/src/ops_squash_family.rs');
    const start = source.indexOf('impl VertexRefusal');
    const end = source.indexOf('impl From<VertexRefusal>', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const codes = [...source.slice(start, end).matchAll(/=> "([a-z_]+)"/g)].map((match) => match[1]);
    expect(FOLD_VERTEX_REFUSAL_CODES).toEqual(codes);
  });

  it('are refusal codes like every other, colliding with none', () => {
    for (const code of FOLD_VERTEX_REFUSAL_CODES) expect(FOLD_REFUSAL_CODES).toContain(code);
  });
});
