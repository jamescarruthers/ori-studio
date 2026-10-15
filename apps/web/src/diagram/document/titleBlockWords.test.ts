import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALE_CODES } from '../../i18n/locales';
import { titleBlockDefaultWords } from './titleBlockWords';

/** A locale's `panels` catalog, as the app loads it. */
const panels = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(process.cwd(), `public/locales/${locale}/panels.json`), 'utf8')) as Record<string, unknown>;

/** `key` (`panels:a.b.c`) in `catalog`, or the English default where the catalog has no translation, as i18next falls back. */
const translate = (catalog: Record<string, unknown>) => (key: string, english: string) => {
  const found = key
    .replace(/^panels:/, '')
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), catalog);
  return typeof found === 'string' && found !== '' ? found : english;
};

describe('titleBlockDefaultWords', () => {
  it('starts the subtitle as the field’s own name, “Subtitle”, in every language (Zach, 2026-10-15)', () => {
    expect(titleBlockDefaultWords((_key, english) => english).subtitle).toBe('Subtitle');
    for (const locale of SUPPORTED_LOCALE_CODES) {
      const t = translate(panels(locale));
      const words = titleBlockDefaultWords(t);
      // The Page pane's own word for the field, translated: never English's in another language.
      expect(words.subtitle, locale).toBe(t('panels:diagram.pagePane.titleBlock.subtitle', 'Subtitle'));
      if (locale !== 'en') expect(words.subtitle, locale).not.toBe('Subtitle');
    }
  });
});
