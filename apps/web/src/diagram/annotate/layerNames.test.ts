import { describe, expect, it } from 'vitest';
import { layerNames, type LayerName } from './layerNames';

const named = (entries: readonly LayerName[]) =>
  layerNames(
    entries.map((_, index) => ({ id: `a-${index}` })),
    (index) => entries[index]!,
    (name, number) => `${name} ${number}`
  );
const kind = (name: string): LayerName => ({ name, generic: true });
const text = (name: string): LayerName => ({ name, generic: false });

describe('layerNames', () => {
  it('numbers a kind drawn more than once, in drawing order', () => {
    const names = named([kind('Circle'), kind('Circle'), kind('Fold and Unfold Arrow'), kind('Circle'), kind('Fold and Unfold Arrow')]);
    expect([...names.values()]).toEqual([
      'Circle 1',
      'Circle 2',
      'Fold and Unfold Arrow 1',
      'Circle 3',
      'Fold and Unfold Arrow 2',
    ]);
  });

  it('leaves a kind drawn once as it is', () => {
    expect([...named([kind('Circle'), kind('Valley Line')]).values()]).toEqual(['Circle', 'Valley Line']);
  });

  it('never numbers a name of its own, even when two labels say the same', () => {
    expect([...named([text('Repeat'), text('Repeat'), kind('Label')]).values()]).toEqual(['Repeat', 'Repeat', 'Label']);
  });

  it('keys each name by its layer', () => {
    expect(named([kind('Circle'), kind('Circle')]).get('a-1')).toBe('Circle 2');
  });
});
