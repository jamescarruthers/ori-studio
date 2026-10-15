import type { TitleBlockDefaultWords } from './diagramDocument';

/** A translation lookup: a key and its English default, as `i18n.t` and `useTranslation`'s `t` both take them. */
type Translate = (key: string, english: string) => string;

/**
 * The words a title block starts with, in the app's language (Zach,
 * 2026-10-15): the subtitle, and the labels of the credits Author,
 * Recommended size and Steps. One source for every place that writes them —
 * a new diagram's first edit and the block's toggle (the workspace store) —
 * and for the Page pane, which shows them before a diagram exists.
 */
export function titleBlockDefaultWords(t: Translate): TitleBlockDefaultWords {
  return {
    subtitle: t('panels:diagram.titleBlock.default.subtitle', 'Origami diagram'),
    author: t('panels:diagram.titleBlock.default.author', 'Author'),
    recommendedSize: t('panels:diagram.titleBlock.default.recommendedSize', 'Recommended size'),
    steps: t('panels:diagram.titleBlock.default.steps', 'Steps'),
  };
}
