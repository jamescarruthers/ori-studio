import { describe, expect, it } from 'vitest';
import { sameTurnKind, type TurnKind } from './turn';

describe('sameTurnKind', () => {
  const sideToSide: TurnKind = { kind: 'turn-over', axis: 'vertical' };
  const topToBottom: TurnKind = { kind: 'turn-over', axis: 'horizontal' };
  const quarterCw: TurnKind = { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } };

  it('matches a turn field by field, not by identity', () => {
    expect(sameTurnKind(sideToSide, { kind: 'turn-over', axis: 'vertical' })).toBe(true);
    expect(sameTurnKind(quarterCw, { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } })).toBe(true);
  });

  it('tells turns apart by kind, axis, amount and direction', () => {
    expect(sameTurnKind(sideToSide, topToBottom)).toBe(false);
    expect(sameTurnKind(sideToSide, quarterCw)).toBe(false);
    expect(sameTurnKind(quarterCw, sideToSide)).toBe(false);
    expect(sameTurnKind(quarterCw, { kind: 'rotate', rotate: { amount: 'half', direction: 'cw' } })).toBe(false);
    expect(sameTurnKind(quarterCw, { kind: 'rotate', rotate: { amount: 'quarter', direction: 'ccw' } })).toBe(false);
  });
});
