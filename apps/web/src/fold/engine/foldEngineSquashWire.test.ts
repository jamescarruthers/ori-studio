import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLD_REFUSAL_CODES } from './foldEngineWire';

/** Vitest runs in the web workspace, two levels under the repository. */
const crate = (path: string) => readFileSync(resolve(process.cwd(), '../../crates', path), 'utf8');

describe('the vertex folds’ choice refusals', () => {
  it('are the compound folds’ own, through the one seam (`compound.rs`)', () => {
    const source = crate('oristudio-fold-wasm/src/ops_squash_family.rs');
    expect(source).toContain('choice_needed(NeededChoice::Completion)');
    expect(source).toContain('compound_refusal(');
  });

  it('are listed once among the refusal codes, colliding with none', () => {
    for (const code of ['choice_needed', 'choice_broken'] as const) {
      expect(FOLD_REFUSAL_CODES.filter((known) => known === code)).toHaveLength(1);
    }
  });
});
