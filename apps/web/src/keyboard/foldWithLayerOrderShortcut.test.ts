import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { shortcutActionLabel, shortcutCategoryLabel, shortcutScopeLabel } from '../i18n/shortcutLabels';
import {
  FOLD_WITH_LAYER_ORDER_SHORTCUT_ID,
  getDefaultShortcutChords,
  getResolvedShortcuts,
  getShortcutDefinition,
  isShortcutBindable,
  SHORTCUT_DEFINITIONS,
  shortcutIdForOrieditaAction,
} from './shortcuts';

// Answers with the key, so a label read from the catalogue is told apart from the registry's English.
const keyOf = ((key: string) => key) as unknown as TFunction;

/**
 * "Fold with layer order…" (row H5): a command in the registry with no
 * default key, right after Fold estimate, the command that carries G.
 */
describe('the Fold with layer order… shortcut', () => {
  const definition = getShortcutDefinition(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID)!;

  it('comes right after Fold estimate, in its category and its scope', () => {
    const ids = SHORTCUT_DEFINITIONS.map((entry) => entry.id);
    expect(ids.indexOf(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID)).toBe(ids.indexOf('cp.action.folding-estimate') + 1);
    const estimate = getShortcutDefinition('cp.action.folding-estimate')!;
    expect(definition).toMatchObject({ category: estimate.category, scope: 'crease-pattern', target: 'cp-action' });
    expect(definition.upstreamAction).toBeUndefined();
  });

  it('has no key by default, under either layout, and none an Oriedita import can give it', () => {
    expect(getDefaultShortcutChords(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID, 'ori-studio')).toEqual([]);
    expect(getDefaultShortcutChords(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID, 'oriedita')).toEqual([]);
    expect(getResolvedShortcuts(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID)).toEqual([]);
    expect(shortcutIdForOrieditaAction('foldAction')).toBe('cp.action.folding-estimate');
  });

  it('can be bound, and then resolves to the key bound', () => {
    expect(isShortcutBindable(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID)).toBe(true);
    const chord = { alt: true, shift: true, key: 'k' };
    expect(getResolvedShortcuts(FOLD_WITH_LAYER_ORDER_SHORTCUT_ID, { [FOLD_WITH_LAYER_ORDER_SHORTCUT_ID]: [chord] })).toEqual([
      chord,
    ]);
  });

  it('is named in Settings with the selection toolbar button’s own words, translated', () => {
    expect(shortcutActionLabel(keyOf, definition)).toBe('panels:creasePattern.selectionToolbar.foldWithLayerOrder');
    expect(shortcutCategoryLabel(keyOf, definition.category)).toBe(
      shortcutCategoryLabel(keyOf, getShortcutDefinition('cp.action.folding-estimate')!.category)
    );
    expect(shortcutScopeLabel(keyOf, definition.scope)).toBe(shortcutScopeLabel(keyOf, 'crease-pattern'));
  });
});
