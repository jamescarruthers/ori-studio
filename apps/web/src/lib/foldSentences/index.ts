/**
 * The vocabulary step sentences share, whichever workspace writes them.
 *
 * Words and rules only, never a whole sentence: each workspace keeps full
 * sentence keys of its own (References' `referencesStepSentences`, Fold's
 * builder), because a sentence joined from clauses breaks word order in ja and
 * ko. What is shared is what has to agree across them:
 *
 * - the letters a step's references go by, on the picture and in the text.
 *
 * React-free and store-free.
 */
export { letterInputs, type InputLetters, type ReferenceKind } from './inputLetters';
