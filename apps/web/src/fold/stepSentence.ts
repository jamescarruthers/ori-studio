/**
 * The sentence for one Fold step: "Valley fold in half, bringing the top-right
 * corner onto the bottom-left corner, through all layers."
 *
 * A sentence is the verb, how the line was found and which layers the fold
 * takes, and each of the three changes word order somewhere: a verb goes last
 * in ja and ko, and "only the top two layers" is the object in de and zh but a
 * trailing clause in en. So every combination is a whole sentence of its own
 * (`stepSentenceCatalog`), never clauses joined here (plan D14). What is
 * interpolated is only what a sentence *names*, in `lib/foldSentences`'
 * shared vocabulary: the sheet's own edges, corners and diagonals by
 * description, anything else by its letter.
 *
 * Inputs are the step's anchors as the axiom reads them, in the crate's axiom
 * order (`oristudio-geometry`'s `Construction`, plan D6): O1 `[p, q]`, O2
 * `[p, q]`, O3 `[m1, m2]`, O4 `[p, m]`, O5 `[pivot, p, m1]`, O6
 * `[p1, m1, p2, m2]`, O7 `[p, m1, m2]`. A pair one fold brings together is
 * named mover first, the one the arrow and the animation move
 * (`moverFirst`).
 *
 * Pure and React-free, so a Diagram link can store the sentence a step had
 * (plan D17).
 */
import type { TFunction } from 'i18next';
import {
  cornerName,
  diagonalName,
  edgeName,
  letterInputs,
  letteredName,
  moverFirst,
  type FoldAxiom,
  type InputLetters,
  type ReferenceKind,
  type SheetCorner,
  type SheetDiagonal,
  type SheetSide,
} from '../lib/foldSentences';
import type { TurnKind } from '../lib/steps/turn';
import { turnName } from '../lib/steps/turnWords';
import {
  plainFoldSentence,
  reverseFoldSentence,
  unfoldSentence,
  type PlainFoldSentenceOp,
  type SentenceClause,
  type SentenceLine,
} from './stepSentenceCatalog';

/** A plain fold's direction as the viewer sees it (the engine's `Direction`). */
export type FoldDirection = 'valley' | 'mountain';

/**
 * A reference an axiom reads, as a sentence names it. The sheet's own are
 * named by description, so the caller decides one is that only where a
 * reader would agree — on the flat sheet, or the silhouette's own corner —
 * in the frame the step's picture is drawn in. Anything else is a point (a
 * mark, a vertex, a crossing) or a line (a crease), named by its letter.
 */
export type FoldSentenceReference =
  | { kind: 'corner'; corner: SheetCorner }
  | { kind: 'edge'; side: SheetSide }
  | { kind: 'diagonal'; diagonal: SheetDiagonal }
  | { kind: 'point' }
  | { kind: 'line' };

/** How a step's line was found: plan D18's `via`. */
export type FoldSentenceLine =
  /** Two points the user placed. */
  | { via: 'free' }
  /** An existing crease or bend, snapped to. */
  | { via: 'crease' }
  | {
      via: 'axiom';
      axiom: FoldAxiom;
      /** In the crate's axiom order. */
      inputs: readonly FoldSentenceReference[];
      /** The indices of the inputs on the moving side; none keeps the axiom's order. */
      moving?: readonly number[];
      /**
       * The fold lays one half of the layers it moves exactly onto the other:
       * "in half". Said only where a folder brings one thing onto another
       * (O2, O3), which is how a half fold is made.
       */
      inHalf?: boolean;
    };

/** Which layers a fold takes: plan D6's seed, D18's `layer_scope`. */
export type FoldLayerScope =
  | { kind: 'all' }
  /** The top `layers` (the bottom ones for a mountain fold), at a point. */
  | { kind: 'depth'; layers: number }
  /** Picked flaps. */
  | { kind: 'flaps'; flaps: number };

/** A step as its sentence reads it. */
export type FoldSentenceStep =
  | { op: 'fold'; direction: FoldDirection; line: FoldSentenceLine; scope: FoldLayerScope }
  /** Fold and unfold: the creases stay, flat, remembering their letters. */
  | { op: 'precrease'; direction: FoldDirection; line: FoldSentenceLine; scope: FoldLayerScope }
  /**
   * A fold along a bend that lays its layers flat again (plan D3): always
   * along an existing crease, so it has no line to describe.
   */
  | { op: 'unfold'; direction: FoldDirection; scope: FoldLayerScope }
  | { op: 'turn'; turn: TurnKind }
  /** Import CP: the state jumps to an imported crease pattern's (plan D16). */
  | { op: 'cp-jump' }
  /** A reverse fold along a line (plan Phase 9), its layers the tip's anchor, counted from the top. */
  | { op: 'reverse'; kind: 'inside' | 'outside'; line: FoldSentenceLine; scope: FoldLayerScope }
  /** An operation a newer build wrote: locked, never described (plan D6). */
  | { op: 'unknown' };

/** What each reference is lettered as: the sheet's corners are points, its edges and diagonals lines. */
function referenceKind(reference: FoldSentenceReference): ReferenceKind {
  return reference.kind === 'corner' || reference.kind === 'point' ? 'point' : 'line';
}

/**
 * The letters a step's inputs go by, by position and kind alone (the
 * `lib/foldSentences` scheme): what the step's picture letters its references
 * with, so a letter in the sentence is the letter on the picture by
 * construction. Every input takes one, the sheet's own too, though the
 * sentence names those by description.
 */
export function sentenceInputLetters(inputs: readonly FoldSentenceReference[]): InputLetters {
  return letterInputs(inputs.map(referenceKind));
}

/** One reference's name in a sentence. */
function referenceName(t: TFunction, reference: FoldSentenceReference, letter: string): string {
  switch (reference.kind) {
    case 'corner':
      return cornerName(t, reference.corner);
    case 'edge':
      return edgeName(t, reference.side);
    case 'diagonal':
      return diagonalName(t, reference.diagonal);
    case 'point':
    case 'line':
      return letteredName(t, reference.kind, letter);
  }
}

/** A clause that names nothing: a free line, or an existing crease. */
const NO_NAMES: SentenceClause['names'] = { a: '', b: '', c: '', d: '', self: '' };

/**
 * The names an axiom's sentence interpolates, by role: `a`/`b` the first pair
 * (mover, then where it lands), `c`/`d` O6's second pair, O5's pivot as `a`,
 * and O7's line folded onto itself as `self`. A missing input reads "?", as
 * References' sentences do, rather than shifting the others along.
 */
function axiomClause(
  t: TFunction,
  axiom: FoldAxiom,
  inputs: readonly FoldSentenceReference[],
  moving: readonly number[],
  inHalf: boolean
): SentenceClause {
  const letters = sentenceInputLetters(inputs).byInput;
  const name = (index: number) => {
    const reference = inputs[index];
    const letter = letters[index];
    return reference && letter ? referenceName(t, reference, letter) : '?';
  };
  /** Two inputs one fold brings together, mover first. */
  const pair = (first: number, second: number): [string, string] => {
    const [mover, target] = moverFirst(moving, [first, second]);
    return [name(mover), name(target)];
  };
  switch (axiom) {
    case 1:
      // A line through two points moves neither.
      return { line: 'o1', names: { ...NO_NAMES, a: name(0), b: name(1) } };
    case 2:
    case 3: {
      const [a, b] = pair(0, 1);
      const line: SentenceLine =
        axiom === 2 ? (inHalf ? 'o2Half' : 'o2') : inHalf ? 'o3Half' : 'o3';
      return { line, names: { ...NO_NAMES, a, b } };
    }
    case 4:
      // `[p, m]`: the crease goes through p, and m is folded onto itself.
      return { line: 'o4', names: { ...NO_NAMES, a: name(0), b: name(1) } };
    case 5: {
      // `[pivot, p, m1]`: p onto m1 — or m1 onto p, when the line is the one
      // on the moving side.
      const [b, c] = pair(1, 2);
      return { line: 'o5', names: { ...NO_NAMES, a: name(0), b, c } };
    }
    case 6: {
      const [a, b] = pair(0, 1);
      const [c, d] = pair(2, 3);
      return { line: 'o6', names: { ...NO_NAMES, a, b, c, d } };
    }
    case 7: {
      // `[p, m1, m2]`: p lands on m1, and m2 is folded onto itself.
      const [a, b] = pair(0, 1);
      return { line: 'o7', names: { ...NO_NAMES, a, b, self: name(2) } };
    }
  }
}

/** What the sentence says about the line, whichever operation it is. */
function lineClause(t: TFunction, line: FoldSentenceLine): SentenceClause {
  switch (line.via) {
    case 'free':
      return { line: 'free', names: NO_NAMES };
    case 'crease':
      return { line: 'crease', names: NO_NAMES };
    case 'axiom':
      return axiomClause(t, line.axiom, line.inputs, line.moving ?? [], line.inHalf === true);
  }
}

function plainOp(op: 'fold' | 'precrease', direction: FoldDirection): PlainFoldSentenceOp {
  if (op === 'fold') return direction;
  return direction === 'valley' ? 'valleyPrecrease' : 'mountainPrecrease';
}

/** The sentence for one step, in the reader's language. */
export function foldStepSentence(t: TFunction, step: FoldSentenceStep): string {
  switch (step.op) {
    case 'fold':
    case 'precrease':
      return plainFoldSentence(t, plainOp(step.op, step.direction), lineClause(t, step.line), step.scope);
    case 'unfold':
      return unfoldSentence(t, step.direction, step.scope);
    case 'turn':
      // The turn's own words, shared with the Diagram's turn cards, made a
      // sentence by a key of its own so the full stop is the language's.
      return t('panels:fold.sentence.turn', '{{turn}}.', { turn: turnName(step.turn, t) });
    case 'cp-jump':
      return t('panels:fold.sentence.cpJump', 'Collapse into the imported crease pattern.');
    case 'reverse':
      return reverseFoldSentence(t, step.kind, lineClause(t, step.line), step.scope);
    case 'unknown':
      return t('panels:fold.sentence.unknown', 'A step made with a newer Ori Studio.');
  }
}
