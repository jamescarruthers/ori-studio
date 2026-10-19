import { useEffect, useRef, useState } from 'react';
import { trackFoldChoiceOffered } from '../../analytics';
import { reportError } from '../../monitoring';
import { canonicalJson } from '../document/foldDigest';
import type { FoldAxiomCandidate, FoldAxiomLine, FoldEngineRefused } from '../engine/foldEngineWire';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { clientRefusal } from '../tools/foldStepBuilder';

/** Independently keyed roots for one construction on the current pose. */
export function useFoldAxiomCandidates(session: FoldSessionSurface, axiomLine: FoldAxiomLine | null) {
  const { withCursor } = session;
  const state = session.cursor.state;
  const stateKey = state ? `${state.generation}:${state.id}` : null;
  const axiomKey = axiomLine && stateKey ? `${stateKey}|${canonicalJson(axiomLine)}` : null;
  const [roots, setRoots] = useState<{
    key: string;
    candidates: FoldAxiomCandidate[] | null;
    refused: FoldEngineRefused | null;
  } | null>(null);
  // Each choice offered is counted once, by the line it was offered for.
  const offered = useRef<string | null>(null);
  useEffect(() => {
    if (!axiomLine || axiomKey === null || roots?.key === axiomKey) return undefined;
    let current = true;
    void withCursor((engine, at) => engine.axiomCandidates(at, axiomLine)).then(
      (answer) => {
        if (!current || answer.status !== 'answered') return;
        const outcome = answer.value;
        if (outcome.status === 'ok') {
          setRoots({
            key: axiomKey,
            candidates: outcome.candidates,
            // No fold here: worded as the engine words a stored step's root that is gone.
            refused: outcome.candidates.length === 0 ? clientRefusal('no_root') : null,
          });
          if (outcome.candidates.length > 1 && offered.current !== axiomKey) {
            offered.current = axiomKey;
            trackFoldChoiceOffered('axiom_root', outcome.candidates.length);
          }
        } else {
          setRoots({ key: axiomKey, candidates: null, refused: outcome });
        }
      },
      (error: unknown) => reportError(error, { surface: 'fold:axiom-candidates' })
    );
    return () => {
      current = false;
    };
  }, [withCursor, axiomLine, axiomKey, roots?.key]);
  return roots && roots.key === axiomKey ? roots : null;

}
