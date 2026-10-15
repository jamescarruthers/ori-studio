/**
 * A text setter that estimates widths: CJK characters a full em, everything
 * else about half of one. For the layout's tests, and for a layout wanted
 * before the fonts are loaded; the composer sets text from the font itself
 * (`fontTextSetter.ts`). Both set paragraphs through `setText.ts`, so they
 * break and cut text alike.
 *
 * Pure.
 */
import { graphemesOf, isCjkGrapheme } from '../../lib/paper/textWrap';
import type { LineInk, TextSetter } from './diagramPageLayout';
import { setTextLines, type TextFaces } from './setText';

const LATIN_ADVANCE = 0.52;
const ESTIMATE = 'estimate';
/**
 * How far a letter's ink reaches above the baseline and below it, as a share
 * of the size: a Latin capital's top and a descender's foot; an ideograph's.
 */
const LATIN_INK: LineInk = { above: 0.72, below: 0.24 };
const CJK_INK: LineInk = { above: 0.88, below: 0.12 };

const advance = (grapheme: string) => (isCjkGrapheme(grapheme) ? 1 : LATIN_ADVANCE);

/** How far `text` set at `sizeMm` reaches above its baseline and below it, by estimate: as its kinds of letter do. */
export function estimatedInk(text: string, sizeMm: number): LineInk {
  const kinds = graphemesOf(text)
    .filter((grapheme) => grapheme.trim() !== '')
    .map((grapheme) => (isCjkGrapheme(grapheme) ? CJK_INK : LATIN_INK));
  return {
    above: sizeMm * Math.max(0, ...kinds.map((kind) => kind.above)),
    below: sizeMm * Math.max(0, ...kinds.map((kind) => kind.below)),
  };
}

function facesAt(sizeMm: number): TextFaces {
  return {
    set: (graphemes) => ({
      fonts: graphemes.map(() => ESTIMATE),
      advances: graphemes.map((grapheme) => advance(grapheme) * sizeMm),
    }),
    ellipsis: () => ({ font: ESTIMATE, advance: LATIN_ADVANCE * sizeMm }),
  };
}

export const estimateTextSetter: TextSetter = {
  paragraph: (text, widthMm, sizeMm, maxLines) => setTextLines(text, widthMm, maxLines, facesAt(sizeMm)),
  line(text, sizeMm, _weight, maxWidthMm = Number.POSITIVE_INFINITY) {
    const set = setTextLines(text, maxWidthMm, 1, facesAt(sizeMm));
    return set.lines[0] ?? { text: '', widthMm: 0, runs: [], ellipsis: false };
  },
  ink: (line, sizeMm) => estimatedInk(line.text, sizeMm),
  runs: (text, face) => [{ face, text }],
};
