import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLD_REFUSAL_CODES } from './engineContracts';

/**
 * The engine's refusals, whose codes this mirror must list (`FoldRefusal::code`).
 * Vitest runs in the web workspace, two levels under the repository.
 */
const REFUSAL_RS = resolve(process.cwd(), '../../crates/oristudio-fold/src/refusal.rs');

describe('the engine contracts', () => {
  it('list exactly the refusal codes the engine gives, in its order', () => {
    const source = readFileSync(REFUSAL_RS, 'utf8');
    const body = source.slice(source.indexOf('pub fn code(&self)'), source.indexOf('pub fn faces(&self)'));
    const codes = [...body.matchAll(/=> "([a-z_]+)"/g)].map((match) => match[1]);
    // Guard against passing vacuously on a moved file or a renamed function.
    expect(codes.length).toBeGreaterThan(30);
    expect(FOLD_REFUSAL_CODES).toEqual(codes);
  });
});
