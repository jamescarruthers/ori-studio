/**
 * Every whole sentence a Fold step can be, one literal `t()` call each, for
 * `stepSentence` to choose from (plan D14).
 *
 * The table is long on purpose. A sentence joined from a verb, a line clause
 * and a layer clause reads in English and breaks in ja, ko, de and zh, where
 * the verb or the layers move. So each operation × line × layer scope is its
 * own key, and a translator orders each sentence as their language wants it.
 * Only names are interpolated (`{{a}}`, `{{b}}`, `{{c}}`, `{{d}}`, `{{self}}`,
 * and `{{count}}` for the layers or flaps).
 *
 * Keys are `panels:fold.sentence.<operation>.<line>.<scope>`. A layer depth
 * counts from the top for a valley fold and from the bottom for a mountain
 * fold (plan D6), so the words say which. `stepSentenceCatalog.test.ts`
 * holds every key and default to the one pattern, so a slip in a copy fails
 * there rather than in a translation.
 *
 * React-free; literal keys so the extractor sees them.
 */
import type { TFunction } from 'i18next';
import type { FoldDirection, FoldLayerScope } from './stepSentence';

/** How the line was found, as the catalog keys it. */
export type SentenceLine =
  | 'free'
  | 'crease'
  | 'o1'
  | 'o2'
  | 'o2Half'
  | 'o3'
  | 'o3Half'
  | 'o4'
  | 'o5'
  | 'o6'
  | 'o7';

/**
 * A line and the names its sentence interpolates, by role (see
 * `stepSentence`'s `axiomClause`). Unused roles are empty.
 */
export interface SentenceClause {
  line: SentenceLine;
  names: { a: string; b: string; c: string; d: string; self: string };
}

/** The operations that fold along a line, as the catalog keys them. */
export type PlainFoldSentenceOp = 'valley' | 'mountain' | 'valleyPrecrease' | 'mountainPrecrease';

/** One line clause's three sentences, by the layers the fold takes. */
function byScope(
  scope: FoldLayerScope,
  all: () => string,
  depth: (count: number) => string,
  flaps: (count: number) => string
): string {
  switch (scope.kind) {
    case 'all':
      return all();
    case 'depth':
      return depth(scope.layers);
    case 'flaps':
      return flaps(scope.flaps);
  }
}

/** The sentence for a fold, or a precrease, along a line. */
export function plainFoldSentence(
  t: TFunction,
  op: PlainFoldSentenceOp,
  clause: SentenceClause,
  scope: FoldLayerScope
): string {
  switch (op) {
    case 'valley':
      return valleySentence(t, clause, scope);
    case 'mountain':
      return mountainSentence(t, clause, scope);
    case 'valleyPrecrease':
      return valleyPrecreaseSentence(t, clause, scope);
    case 'mountainPrecrease':
      return mountainPrecreaseSentence(t, clause, scope);
  }
}

/**
 * The sentence for an unfold: along an existing bend, so no line to name. A
 * depth counts from the side the fold opens toward, as a fold's does.
 */
export function unfoldSentence(t: TFunction, direction: FoldDirection, scope: FoldLayerScope): string {
  switch (scope.kind) {
    case 'all':
      return t('panels:fold.sentence.unfold.all', 'Unfold along the existing crease, through all layers.');
    case 'depth':
      return direction === 'valley'
        ? t('panels:fold.sentence.unfold.top', {
            count: scope.layers,
            defaultValue_one: 'Unfold the top layer.',
            defaultValue_other: 'Unfold the top {{count}} layers.',
          })
        : t('panels:fold.sentence.unfold.bottom', {
            count: scope.layers,
            defaultValue_one: 'Unfold the bottom layer.',
            defaultValue_other: 'Unfold the bottom {{count}} layers.',
          });
    case 'flaps':
      return t('panels:fold.sentence.unfold.flaps', {
        count: scope.flaps,
        defaultValue_one: 'Unfold the flap shown.',
        defaultValue_other: 'Unfold the {{count}} flaps shown.',
      });
  }
}

/** A valley fold: "Valley fold …". */
function valleySentence(t: TFunction, clause: SentenceClause, scope: FoldLayerScope): string {
  const { a, b, c, d, self } = clause.names;
  switch (clause.line) {
    case 'free':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.free.all', 'Valley fold along the line drawn, through all layers.'),
        (count) =>
          t('panels:fold.sentence.valley.free.depth', {
            count,
            defaultValue_one: 'Valley fold along the line drawn, folding only the top layer.',
            defaultValue_other: 'Valley fold along the line drawn, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.free.flaps', {
            count,
            defaultValue_one: 'Valley fold along the line drawn, folding only the flap shown.',
            defaultValue_other: 'Valley fold along the line drawn, folding only the {{count}} flaps shown.',
          })
      );
    case 'crease':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.crease.all', 'Valley fold along the existing crease, through all layers.'),
        (count) =>
          t('panels:fold.sentence.valley.crease.depth', {
            count,
            defaultValue_one: 'Valley fold along the existing crease, folding only the top layer.',
            defaultValue_other: 'Valley fold along the existing crease, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.crease.flaps', {
            count,
            defaultValue_one: 'Valley fold along the existing crease, folding only the flap shown.',
            defaultValue_other: 'Valley fold along the existing crease, folding only the {{count}} flaps shown.',
          })
      );
    case 'o1':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o1.all', 'Valley fold along the line joining {{a}} and {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o1.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold along the line joining {{a}} and {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold along the line joining {{a}} and {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o1.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold along the line joining {{a}} and {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold along the line joining {{a}} and {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o2.all', 'Valley fold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o2.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o2.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o2Half.all', 'Valley fold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o2Half.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o2Half.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o3.all', 'Valley fold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o3.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o3.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o3Half.all', 'Valley fold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o3Half.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o3Half.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o4':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o4.all', 'Valley fold {{b}} onto itself, pivoting on {{a}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o4.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold {{b}} onto itself, pivoting on {{a}}, folding only the top layer.',
            defaultValue_other: 'Valley fold {{b}} onto itself, pivoting on {{a}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o4.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold {{b}} onto itself, pivoting on {{a}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold {{b}} onto itself, pivoting on {{a}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o5':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o5.all', 'Valley fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, through all layers.', { a, b, c }),
        (count) =>
          t('panels:fold.sentence.valley.o5.depth', {
            a, b, c, count,
            defaultValue_one: 'Valley fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the top layer.',
            defaultValue_other: 'Valley fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o5.flaps', {
            a, b, c, count,
            defaultValue_one: 'Valley fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o6':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o6.all', 'Valley fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, through all layers.', { a, b, c, d }),
        (count) =>
          t('panels:fold.sentence.valley.o6.depth', {
            a, b, c, d, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the top layer.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o6.flaps', {
            a, b, c, d, count,
            defaultValue_one: 'Valley fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o7':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valley.o7.all', 'Valley fold {{self}} onto itself so that {{a}} lands on {{b}}, through all layers.', { self, a, b }),
        (count) =>
          t('panels:fold.sentence.valley.o7.depth', {
            self, a, b, count,
            defaultValue_one: 'Valley fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valley.o7.flaps', {
            self, a, b, count,
            defaultValue_one: 'Valley fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the {{count}} flaps shown.',
          })
      );
  }
}

/** A mountain fold: "Mountain fold …". */
function mountainSentence(t: TFunction, clause: SentenceClause, scope: FoldLayerScope): string {
  const { a, b, c, d, self } = clause.names;
  switch (clause.line) {
    case 'free':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.free.all', 'Mountain fold along the line drawn, through all layers.'),
        (count) =>
          t('panels:fold.sentence.mountain.free.depth', {
            count,
            defaultValue_one: 'Mountain fold along the line drawn, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold along the line drawn, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.free.flaps', {
            count,
            defaultValue_one: 'Mountain fold along the line drawn, folding only the flap shown.',
            defaultValue_other: 'Mountain fold along the line drawn, folding only the {{count}} flaps shown.',
          })
      );
    case 'crease':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.crease.all', 'Mountain fold along the existing crease, through all layers.'),
        (count) =>
          t('panels:fold.sentence.mountain.crease.depth', {
            count,
            defaultValue_one: 'Mountain fold along the existing crease, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold along the existing crease, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.crease.flaps', {
            count,
            defaultValue_one: 'Mountain fold along the existing crease, folding only the flap shown.',
            defaultValue_other: 'Mountain fold along the existing crease, folding only the {{count}} flaps shown.',
          })
      );
    case 'o1':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o1.all', 'Mountain fold along the line joining {{a}} and {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o1.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold along the line joining {{a}} and {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold along the line joining {{a}} and {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o1.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold along the line joining {{a}} and {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold along the line joining {{a}} and {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o2.all', 'Mountain fold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o2.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o2.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o2Half.all', 'Mountain fold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o2Half.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o2Half.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o3.all', 'Mountain fold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o3.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o3.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o3Half.all', 'Mountain fold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o3Half.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o3Half.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o4':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o4.all', 'Mountain fold {{b}} onto itself, pivoting on {{a}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o4.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold {{b}} onto itself, pivoting on {{a}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold {{b}} onto itself, pivoting on {{a}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o4.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold {{b}} onto itself, pivoting on {{a}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold {{b}} onto itself, pivoting on {{a}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o5':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o5.all', 'Mountain fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, through all layers.', { a, b, c }),
        (count) =>
          t('panels:fold.sentence.mountain.o5.depth', {
            a, b, c, count,
            defaultValue_one: 'Mountain fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o5.flaps', {
            a, b, c, count,
            defaultValue_one: 'Mountain fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o6':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o6.all', 'Mountain fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, through all layers.', { a, b, c, d }),
        (count) =>
          t('panels:fold.sentence.mountain.o6.depth', {
            a, b, c, d, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o6.flaps', {
            a, b, c, d, count,
            defaultValue_one: 'Mountain fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o7':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountain.o7.all', 'Mountain fold {{self}} onto itself so that {{a}} lands on {{b}}, through all layers.', { self, a, b }),
        (count) =>
          t('panels:fold.sentence.mountain.o7.depth', {
            self, a, b, count,
            defaultValue_one: 'Mountain fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountain.o7.flaps', {
            self, a, b, count,
            defaultValue_one: 'Mountain fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the {{count}} flaps shown.',
          })
      );
  }
}

/** A valley precrease: "Valley fold and unfold …". */
function valleyPrecreaseSentence(t: TFunction, clause: SentenceClause, scope: FoldLayerScope): string {
  const { a, b, c, d, self } = clause.names;
  switch (clause.line) {
    case 'free':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.free.all', 'Valley fold and unfold along the line drawn, through all layers.'),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.free.depth', {
            count,
            defaultValue_one: 'Valley fold and unfold along the line drawn, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold along the line drawn, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.free.flaps', {
            count,
            defaultValue_one: 'Valley fold and unfold along the line drawn, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold along the line drawn, folding only the {{count}} flaps shown.',
          })
      );
    case 'crease':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.crease.all', 'Valley fold and unfold along the existing crease, through all layers.'),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.crease.depth', {
            count,
            defaultValue_one: 'Valley fold and unfold along the existing crease, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold along the existing crease, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.crease.flaps', {
            count,
            defaultValue_one: 'Valley fold and unfold along the existing crease, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold along the existing crease, folding only the {{count}} flaps shown.',
          })
      );
    case 'o1':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o1.all', 'Valley fold and unfold along the line joining {{a}} and {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o1.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold along the line joining {{a}} and {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold along the line joining {{a}} and {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o1.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold along the line joining {{a}} and {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold along the line joining {{a}} and {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o2.all', 'Valley fold and unfold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o2.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o2.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o2Half.all', 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o2Half.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o2Half.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o3.all', 'Valley fold and unfold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o3.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o3.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o3Half.all', 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o3Half.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o3Half.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o4':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o4.all', 'Valley fold and unfold {{b}} onto itself, pivoting on {{a}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o4.depth', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o4.flaps', {
            a, b, count,
            defaultValue_one: 'Valley fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o5':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o5.all', 'Valley fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, through all layers.', { a, b, c }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o5.depth', {
            a, b, c, count,
            defaultValue_one: 'Valley fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o5.flaps', {
            a, b, c, count,
            defaultValue_one: 'Valley fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o6':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o6.all', 'Valley fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, through all layers.', { a, b, c, d }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o6.depth', {
            a, b, c, d, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o6.flaps', {
            a, b, c, d, count,
            defaultValue_one: 'Valley fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o7':
      return byScope(
        scope,
        () => t('panels:fold.sentence.valleyPrecrease.o7.all', 'Valley fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, through all layers.', { self, a, b }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o7.depth', {
            self, a, b, count,
            defaultValue_one: 'Valley fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the top layer.',
            defaultValue_other: 'Valley fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the top {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.valleyPrecrease.o7.flaps', {
            self, a, b, count,
            defaultValue_one: 'Valley fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the flap shown.',
            defaultValue_other: 'Valley fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the {{count}} flaps shown.',
          })
      );
  }
}

/** A mountain precrease: "Mountain fold and unfold …". */
function mountainPrecreaseSentence(t: TFunction, clause: SentenceClause, scope: FoldLayerScope): string {
  const { a, b, c, d, self } = clause.names;
  switch (clause.line) {
    case 'free':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.free.all', 'Mountain fold and unfold along the line drawn, through all layers.'),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.free.depth', {
            count,
            defaultValue_one: 'Mountain fold and unfold along the line drawn, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold along the line drawn, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.free.flaps', {
            count,
            defaultValue_one: 'Mountain fold and unfold along the line drawn, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold along the line drawn, folding only the {{count}} flaps shown.',
          })
      );
    case 'crease':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.crease.all', 'Mountain fold and unfold along the existing crease, through all layers.'),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.crease.depth', {
            count,
            defaultValue_one: 'Mountain fold and unfold along the existing crease, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold along the existing crease, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.crease.flaps', {
            count,
            defaultValue_one: 'Mountain fold and unfold along the existing crease, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold along the existing crease, folding only the {{count}} flaps shown.',
          })
      );
    case 'o1':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o1.all', 'Mountain fold and unfold along the line joining {{a}} and {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o1.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold along the line joining {{a}} and {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold along the line joining {{a}} and {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o1.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold along the line joining {{a}} and {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold along the line joining {{a}} and {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o2.all', 'Mountain fold and unfold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o2.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o2.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o2Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o2Half.all', 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o2Half.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o2Half.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o3.all', 'Mountain fold and unfold, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o3.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o3.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o3Half':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o3Half.all', 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o3Half.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o3Half.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold in half, bringing {{a}} onto {{b}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o4':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o4.all', 'Mountain fold and unfold {{b}} onto itself, pivoting on {{a}}, through all layers.', { a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o4.depth', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o4.flaps', {
            a, b, count,
            defaultValue_one: 'Mountain fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold {{b}} onto itself, pivoting on {{a}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o5':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o5.all', 'Mountain fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, through all layers.', { a, b, c }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o5.depth', {
            a, b, c, count,
            defaultValue_one: 'Mountain fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o5.flaps', {
            a, b, c, count,
            defaultValue_one: 'Mountain fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold, pivoting on {{a}}, bringing {{b}} onto {{c}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o6':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o6.all', 'Mountain fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, through all layers.', { a, b, c, d }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o6.depth', {
            a, b, c, d, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o6.flaps', {
            a, b, c, d, count,
            defaultValue_one: 'Mountain fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold, bringing {{a}} onto {{b}} and {{c}} onto {{d}}, folding only the {{count}} flaps shown.',
          })
      );
    case 'o7':
      return byScope(
        scope,
        () => t('panels:fold.sentence.mountainPrecrease.o7.all', 'Mountain fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, through all layers.', { self, a, b }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o7.depth', {
            self, a, b, count,
            defaultValue_one: 'Mountain fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the bottom layer.',
            defaultValue_other: 'Mountain fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the bottom {{count}} layers.',
          }),
        (count) =>
          t('panels:fold.sentence.mountainPrecrease.o7.flaps', {
            self, a, b, count,
            defaultValue_one: 'Mountain fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the flap shown.',
            defaultValue_other: 'Mountain fold and unfold {{self}} onto itself so that {{a}} lands on {{b}}, folding only the {{count}} flaps shown.',
          })
      );
  }
}
