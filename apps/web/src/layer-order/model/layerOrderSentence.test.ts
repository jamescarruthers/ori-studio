/**
 * The builder's rules, each against the approved artboard's function it
 * mirrors (Round3 = `artifacts/layer-order-design/project/Round3.dc.html`).
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_SENTENCE,
  LAYER_VERBS,
  activateSlot,
  candidateOf,
  clearSentence,
  clearSlot,
  facesWithChoices,
  groundClick,
  isComplete,
  keepOpenObject,
  openIndexOf,
  openPartners,
  pickFace,
  revealSubject,
  setVerb,
  slotNow,
  subjectStuck,
  type LayerSentence,
} from './layerOrderSentence';

// The fixture figure's (`layerOrderModel.fixtures.ts`): open pairs 0–2, 2–3, 4–5; 1 is settled, 6 overlaps nothing.
const OPEN_PAIRS = Uint32Array.of(0, 2, 2, 3, 4, 5);
const FRONT_UP = Uint8Array.of(1, 0, 1, 0, 1, 0, 1);
const open = openIndexOf(OPEN_PAIRS);
const pick = (sentence: LayerSentence, ...faces: number[]) =>
  faces.reduce((s, face) => pickFace(s, open, face, 'pattern'), sentence);

describe('open pairs', () => {
  it('index each face’s open faces both ways, ascending', () => {
    expect(openPartners(open, 2)).toEqual([0, 3]);
    expect(openPartners(open, 0)).toEqual([2]);
    expect(openPartners(open, 1)).toEqual([]);
    expect(openPartners(open, null)).toEqual([]);
    expect(facesWithChoices(open)).toEqual([0, 2, 3, 4, 5]);
  });

  it('the verbs come from one list, “in front of” first and the default', () => {
    expect(LAYER_VERBS).toEqual(['in_front_of', 'behind']);
    expect(EMPTY_SENTENCE.verb).toBe('in_front_of');
  });
});

describe('picking a face (Round3 pickFace, slotNow)', () => {
  it('fills the subject slot first, then the object', () => {
    expect(slotNow(EMPTY_SENTENCE, open)).toBe('subject');
    const s = pick(EMPTY_SENTENCE, 2);
    expect(s).toMatchObject({ subject: 2, object: null, active: 'object', subjectOrigin: 'pattern' });
    expect(slotNow(s, open)).toBe('object');
    expect(pick(s, 3)).toMatchObject({ subject: 2, object: 3, active: 'object' });
  });

  it('only faces with open faces can be the subject; any other is inert', () => {
    // 1 overlaps faces it is settled with; 6 overlaps nothing.
    expect(pick(EMPTY_SENTENCE, 1)).toBe(EMPTY_SENTENCE);
    expect(pick(EMPTY_SENTENCE, 6)).toBe(EMPTY_SENTENCE);
  });

  it('a subject’s offered objects are its open faces; any other is inert', () => {
    const s = pick(EMPTY_SENTENCE, 0);
    expect(pick(s, 3)).toBe(s);
    expect(pick(s, 4)).toBe(s);
    expect(pick(s, 2).object).toBe(2);
  });

  it('records where each face was picked, for the analytics', () => {
    const s = pickFace(pickFace(EMPTY_SENTENCE, open, 2, 'folded'), open, 3, 'menu');
    expect(s).toMatchObject({ subjectOrigin: 'folded', objectOrigin: 'menu' });
  });
});

describe('changing the subject (Round3 setSubject)', () => {
  it('keeps the object when it is still open with the new subject', () => {
    const s = activateSlot(pick(EMPTY_SENTENCE, 0, 2), open, 'subject');
    // 3 is open with 2: picking 3 as the subject keeps 2.
    expect(pick(s, 3)).toMatchObject({ subject: 3, object: 2, active: 'object' });
  });

  it('clears the object quietly when it is not', () => {
    const s = activateSlot(pick(EMPTY_SENTENCE, 2, 3), open, 'subject');
    expect(pick(s, 4)).toMatchObject({ subject: 4, object: null, objectOrigin: null, active: 'object' });
  });
});

describe('a click on empty paper (Round3 groundClick)', () => {
  it('clears the object, then the subject, then nothing is left', () => {
    const full = pick(EMPTY_SENTENCE, 2, 3);
    const once = groundClick(full);
    expect(once).toMatchObject({ subject: 2, object: null, active: 'object' });
    const twice = groundClick(once);
    expect(twice).toMatchObject({ subject: null, object: null, active: 'subject' });
    expect(groundClick(twice)).toBe(twice);
  });

  it('clears the subject when the subject slot is the one being filled', () => {
    const s = activateSlot(pick(EMPTY_SENTENCE, 2, 3), open, 'subject');
    expect(groundClick(s)).toMatchObject({ subject: null, object: 3, active: 'subject' });
  });
});

describe('the slots (Round3 activate, clearSlot, clearSentence)', () => {
  it('the object slot can’t be made active with no subject, or a subject with nothing left', () => {
    expect(activateSlot(EMPTY_SENTENCE, open, 'object')).toBe(EMPTY_SENTENCE);
    const stuck = revealSubject(EMPTY_SENTENCE, 1);
    expect(activateSlot({ ...stuck, active: 'subject' }, open, 'object').active).toBe('subject');
  });

  it('clearing the subject keeps the object, which the next subject keeps if it is open with it', () => {
    const s = clearSlot(pick(EMPTY_SENTENCE, 2, 3), 'subject');
    expect(s).toMatchObject({ subject: null, object: 3, active: 'subject' });
    expect(pick(s, 2)).toMatchObject({ subject: 2, object: 3 });
  });

  it('Clear empties both faces but keeps the verb; Add’s empty sentence resets it', () => {
    const s = setVerb(pick(EMPTY_SENTENCE, 2, 3), 'behind');
    expect(clearSentence(s)).toMatchObject({ subject: null, object: null, verb: 'behind', active: 'subject' });
    expect(EMPTY_SENTENCE).toMatchObject({ subject: null, object: null, verb: 'in_front_of', active: 'subject' });
  });
});

describe('a row’s subject in the builder (Round3 reveal)', () => {
  it('puts the subject in, with the object slot active', () => {
    const s = revealSubject(pick(EMPTY_SENTENCE, 4, 5), 2);
    expect(s).toMatchObject({ subject: 2, object: null, active: 'object', subjectOrigin: 'list' });
    expect(slotNow(s, open)).toBe('object');
  });

  it('a subject with nothing left to choose keeps the subject slot active', () => {
    const s = revealSubject(EMPTY_SENTENCE, 1);
    expect(subjectStuck(s, open)).toBe(true);
    expect(slotNow(s, open)).toBe('subject');
    // The next click replaces it.
    expect(pick(s, 2)).toMatchObject({ subject: 2, active: 'object' });
  });
});

describe('after a commit (Round3 commit)', () => {
  it('keeps the sentence unless the object is no longer open with the subject', () => {
    const s = pick(EMPTY_SENTENCE, 2, 3);
    expect(keepOpenObject(s, open)).toBe(s);
    const later = openIndexOf(Uint32Array.of(0, 2, 4, 5));
    expect(keepOpenObject(s, later)).toMatchObject({ subject: 2, object: null });
    expect(isComplete(keepOpenObject(s, later), later)).toBe(false);
  });
});

describe('the sentence as a constraint (Round3 sentenceCons)', () => {
  it('is paper-relative: the same sentence read from the back is the other constraint', () => {
    const s = pick(EMPTY_SENTENCE, 2, 0);
    expect(candidateOf(s, open, 'in_front_of', 'front', FRONT_UP)).toEqual([2, 0, 1]);
    expect(candidateOf(s, open, 'in_front_of', 'back', FRONT_UP)).toEqual([2, 0, -1]);
    expect(candidateOf(s, open, 'behind', 'back', FRONT_UP)).toEqual([2, 0, 1]);
  });

  it('is null until the sentence is complete', () => {
    expect(candidateOf(pick(EMPTY_SENTENCE, 2), open, 'in_front_of', 'front', FRONT_UP)).toBeNull();
  });
});
