/**
 * A state's `fs1` fingerprint from the keys the engine spells for it
 * (`crates/oristudio-fold-wasm/src/canonical.rs`): the shared `keyDigest`
 * over the keys sorted, so the order the engine enumerates them in does not
 * matter, prefixed `fs1:` (plan D17).
 *
 * This is the rule `foldStateFingerprint` in `fold/document/foldDigest.ts`
 * applies to a `FoldCanonicalState`; the two must agree, and when both are on
 * one branch this becomes a call to that one.
 */

import { keyDigest } from '../../lib/keyDigest';
import type { FoldStateFingerprint } from './foldEngineWire';

export function foldEngineFingerprint(keys: readonly string[]): FoldStateFingerprint {
  return keyDigest([...keys].sort(), 'fs1:') as FoldStateFingerprint;
}
