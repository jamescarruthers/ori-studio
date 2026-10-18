/** A layer's name as its row would say it alone: a label's text, or its kind ("Circle"). */
export interface LayerName {
  name: string;
  /** Its kind's name rather than words of its own: the name a second mark of that kind shares. */
  generic: boolean;
}

/**
 * Each layer's name in Annotate's Layers list (redesign, 2026-10-18): a kind's
 * name shown more than once is numbered in drawing order — "Circle 1",
 * "Circle 2" — so the rows, and the inspector's header, tell them apart. A
 * name of its own — a label's text — is never numbered, nor a kind drawn once.
 * Keyed by layer id; `numbered` words "Circle" and 2 in the reader's language.
 */
export function layerNames(
  layers: readonly { id: string }[],
  nameOf: (index: number) => LayerName,
  numbered: (name: string, number: number) => string
): ReadonlyMap<string, string> {
  const names = layers.map((_, index) => nameOf(index));
  const counts = new Map<string, number>();
  for (const { name, generic } of names) if (generic) counts.set(name, (counts.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(
    layers.map((layer, index) => {
      const { name, generic } = names[index]!;
      if (!generic || (counts.get(name) ?? 0) < 2) return [layer.id, name];
      const number = (seen.get(name) ?? 0) + 1;
      seen.set(name, number);
      return [layer.id, numbered(name, number)];
    })
  );
}
