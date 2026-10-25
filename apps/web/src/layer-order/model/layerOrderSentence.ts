/**
 * The constraint builder's sentence, `[subject] [in front of ▾] [object]`
 * (spec §6.4), and the open pairs it is built from. Each rule mirrors the
 * approved artboard's function of the same name
 * (`artifacts/layer-order-design/project/Round3.dc.html`, cited as Round3):
 * where the plan's research and the artboard disagree, the artboard wins.
 *
 * Which faces are open comes from deduction (the engine's open pairs), not a
 * search, so an offered object can still fail its preview: that is the
 * preview's to catch, not the sentence's.
 *
 * Every rule returns the sentence it was given when nothing changes.
 *
 * Pure: no React, no store, no engine calls.
 */
import { constraintSeen, type LayerConstraint, type LayerFace, type LayerSide, type LayerVerb } from './layerOrderEngineFacts';

/** The verbs, in the menu's order, from one list: later verbs (spec §6.10) add entries, not UI. The first is the default. */
export const LAYER_VERBS: readonly LayerVerb[] = ['in_front_of', 'behind'];

export type LayerSlot = 'subject' | 'object';

/**
 * Where a face in the sentence was picked: on the crease pattern, on the
 * folded figure, from the keyboard face menu, or from a constraint row (the
 * analytics' `subject_origin` and `object_origin`).
 */
export type LayerPickOrigin = 'pattern' | 'folded' | 'menu' | 'list';

export interface LayerSentence {
  readonly subject: LayerFace | null;
  readonly verb: LayerVerb;
  readonly object: LayerFace | null;
  /** The slot the next face click fills, unless the subject has nothing left to choose ({@link slotNow}). */
  readonly active: LayerSlot;
  readonly subjectOrigin: LayerPickOrigin | null;
  readonly objectOrigin: LayerPickOrigin | null;
}

/** The sentence after Add: subject, verb (back to the first) and object cleared, the subject slot active (Round3 `emptySentence`). */
export const EMPTY_SENTENCE: LayerSentence = {
  subject: null,
  verb: LAYER_VERBS[0]!,
  object: null,
  active: 'subject',
  subjectOrigin: null,
  objectOrigin: null,
};

// ---------------------------------------------------------------------------
// Open pairs

/** The pairs deduction leaves open, indexed by face. */
export interface LayerOpenIndex {
  readonly pairs: Uint32Array;
  /** Per face with choices, its open partners, ascending. */
  readonly partners: ReadonlyMap<LayerFace, readonly LayerFace[]>;
}

const NO_FACES: readonly LayerFace[] = [];

/** Index the engine's open pairs, `[lo, hi, …]`. */
export function openIndexOf(pairs: Uint32Array): LayerOpenIndex {
  const partners = new Map<LayerFace, LayerFace[]>();
  const add = (a: LayerFace, b: LayerFace) => {
    const list = partners.get(a);
    if (list) list.push(b);
    else partners.set(a, [b]);
  };
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    add(pairs[i]!, pairs[i + 1]!);
    add(pairs[i + 1]!, pairs[i]!);
  }
  partners.forEach((list) => list.sort((a, b) => a - b));
  return { pairs, partners };
}

/** A face's open faces: the only valid objects for it as a subject (spec §5). */
export function openPartners(open: LayerOpenIndex, face: LayerFace | null): readonly LayerFace[] {
  return face === null ? NO_FACES : (open.partners.get(face) ?? NO_FACES);
}

/** Whether `face` has at least one open face, so it can be a subject. */
export function hasChoices(open: LayerOpenIndex, face: LayerFace): boolean {
  return open.partners.has(face);
}

/** Every face that can be a subject, ascending. */
export function facesWithChoices(open: LayerOpenIndex): readonly LayerFace[] {
  return Array.from(open.partners.keys()).sort((a, b) => a - b);
}

function isOpenWith(open: LayerOpenIndex, subject: LayerFace | null, object: LayerFace | null): boolean {
  return subject !== null && object !== null && openPartners(open, subject).includes(object);
}

// ---------------------------------------------------------------------------
// The rules

/**
 * The slot the next face click fills: the subject's while it is empty, and
 * also while the subject has nothing left to choose (a row click or an undo
 * can leave it so). Round3 `slotNow`.
 */
export function slotNow(sentence: LayerSentence, open: LayerOpenIndex): LayerSlot {
  if (sentence.subject === null || !hasChoices(open, sentence.subject)) return 'subject';
  return sentence.active;
}

/** Whether the subject is set but has nothing left to choose. */
export function subjectStuck(sentence: LayerSentence, open: LayerOpenIndex): boolean {
  return sentence.subject !== null && !hasChoices(open, sentence.subject);
}

/**
 * A face click fills the active slot, and only with a face that slot can
 * take: a subject needs an open face, an object must be one of the subject's.
 * Every other face is inert; the click does nothing. Round3 `pickFace`.
 */
export function pickFace(
  sentence: LayerSentence,
  open: LayerOpenIndex,
  face: LayerFace,
  origin: LayerPickOrigin
): LayerSentence {
  if (slotNow(sentence, open) === 'subject') {
    return hasChoices(open, face) ? setSubject(sentence, open, face, origin) : sentence;
  }
  return isOpenWith(open, sentence.subject, face) ? setObject(sentence, face, origin) : sentence;
}

/**
 * The subject, with the object kept if it is still open with the new subject
 * and quietly cleared otherwise; the object slot is active next. Round3
 * `setSubject`.
 */
export function setSubject(
  sentence: LayerSentence,
  open: LayerOpenIndex,
  face: LayerFace,
  origin: LayerPickOrigin
): LayerSentence {
  const keep = isOpenWith(open, face, sentence.object);
  return {
    ...sentence,
    subject: face,
    subjectOrigin: origin,
    object: keep ? sentence.object : null,
    objectOrigin: keep ? sentence.objectOrigin : null,
    active: 'object',
  };
}

/** Round3 `setObject`. */
export function setObject(sentence: LayerSentence, face: LayerFace, origin: LayerPickOrigin): LayerSentence {
  return { ...sentence, object: face, objectOrigin: origin, active: 'object' };
}

/**
 * Clicking a filled slot makes it the active one, so the next pick replaces
 * its face; the object slot can't be made active with no subject or a stuck
 * one. Round3 `activate`.
 */
export function activateSlot(sentence: LayerSentence, open: LayerOpenIndex, slot: LayerSlot): LayerSentence {
  if (slot === 'object' && (sentence.subject === null || !hasChoices(open, sentence.subject))) return sentence;
  return sentence.active === slot ? sentence : { ...sentence, active: slot };
}

/**
 * A slot's ×. Clearing the subject keeps the object, which the next subject
 * keeps if it is open with it (Round3 `clearSlot`, then `setSubject`).
 */
export function clearSlot(sentence: LayerSentence, slot: LayerSlot): LayerSentence {
  if (slot === 'object') return { ...sentence, object: null, objectOrigin: null, active: 'object' };
  return { ...sentence, subject: null, subjectOrigin: null, active: 'subject' };
}

/** Clear: both faces go; the verb stays (Round3 `clearSentence`, unlike Add's {@link EMPTY_SENTENCE}). */
export function clearSentence(sentence: LayerSentence): LayerSentence {
  if (sentence.subject === null && sentence.object === null) return sentence;
  return { ...sentence, subject: null, subjectOrigin: null, object: null, objectOrigin: null, active: 'subject' };
}

/**
 * A click on empty paper clears the object when that is the slot being
 * filled, otherwise the subject, otherwise the sentence. Round3 `groundClick`.
 */
export function groundClick(sentence: LayerSentence): LayerSentence {
  if (sentence.subject !== null && sentence.active === 'object' && sentence.object !== null) {
    return clearSlot(sentence, 'object');
  }
  if (sentence.subject !== null) return clearSlot(sentence, 'subject');
  return clearSentence(sentence);
}

/** Picking a verb from the menu. Round3 `pickVerb`. */
export function setVerb(sentence: LayerSentence, verb: LayerVerb): LayerSentence {
  return sentence.verb === verb ? sentence : { ...sentence, verb };
}

/**
 * A constraint row's click: its subject goes into the builder, ready for its
 * next constraint, with the object slot active; when the subject has nothing
 * left to choose, {@link slotNow} makes the subject slot active again and the
 * hint says so. Round3 `reveal`.
 */
export function revealSubject(sentence: LayerSentence, face: LayerFace): LayerSentence {
  return { ...sentence, subject: face, subjectOrigin: 'list', object: null, objectOrigin: null, active: 'object' };
}

/**
 * After a commit, the builder keeps its sentence unless the object is no
 * longer open with the subject, which then clears. Round3 `commit`.
 */
export function keepOpenObject(sentence: LayerSentence, open: LayerOpenIndex): LayerSentence {
  if (sentence.object === null || sentence.subject === null || isOpenWith(open, sentence.subject, sentence.object)) {
    return sentence;
  }
  return { ...sentence, object: null, objectOrigin: null };
}

/** Whether the sentence names a subject and one of its open faces. */
export function isComplete(sentence: LayerSentence, open: LayerOpenIndex): boolean {
  return isOpenWith(open, sentence.subject, sentence.object);
}

/**
 * The sentence as a constraint, read from `side` with `verb` (the menu's
 * pointed verb, or the sentence's own); null unless the sentence is complete.
 * Stored paper-relative, so the list reads back what was built from either
 * side (Round3 `sentenceCons`).
 */
export function candidateOf(
  sentence: LayerSentence,
  open: LayerOpenIndex,
  verb: LayerVerb,
  side: LayerSide,
  frontUp: Uint8Array
): LayerConstraint | null {
  if (!isComplete(sentence, open)) return null;
  const subject = sentence.subject!;
  const object = sentence.object!;
  return constraintSeen(subject, verb, object, side, frontUp[object] === 1);
}

/** A constraint's key, for the preview cache: its two faces and sign. */
export function constraintKey(constraint: LayerConstraint): string {
  return `${constraint[0]},${constraint[1]},${constraint[2]}`;
}
