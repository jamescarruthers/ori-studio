import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { sequenceOf, step, valleyAt } from '../document/foldSequence.fixtures';
import { FOLD_PENDING_NODE } from '../session/foldSessionState';
import { foldPathEntries } from './foldSequencePath';
import { cursorStepLabel } from './foldSequenceWords';

const t = i18n.t.bind(i18n);

/** sheet → a → (turn t) → b: the strip numbers a 1 and b 2, and the turn not at all. */
const document = sequenceOf([
  step('a', null, valleyAt(0.5)),
  step('t', 'a', { kind: 'turn', axis: 'vertical' }),
  step('b', 't', valleyAt(0.25)),
]);
const ok = { ...FOLD_PENDING_NODE, status: 'ok' as const };
const entries = foldPathEntries(document, ['a', 't', 'b'], ok, new Map(), FOLD_PENDING_NODE);

describe('cursorStepLabel', () => {
  it('numbers the step on screen as the strip does, skipping the turn', () => {
    expect(cursorStepLabel(t, entries[0] ?? null)).toBe('Step 0');
    expect(cursorStepLabel(t, entries[1] ?? null)).toBe('Step 1');
    expect(cursorStepLabel(t, entries[3] ?? null)).toBe('Step 2');
  });

  it("names a turn by its own name, not a number", () => {
    expect(cursorStepLabel(t, entries[2] ?? null)).toBe('Turn over, side to side');
  });

  it('reads as the sheet before there is a path', () => {
    expect(cursorStepLabel(t, null)).toBe('Step 0');
  });
});
