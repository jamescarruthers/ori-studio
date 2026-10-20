import { useMemo } from 'react';
import { resolveCpLineColor } from '../../cp-workspace/adapters/cpLineColor';
import { createCpLineAppearanceResolver } from '../../cp-workspace/adapters/cpLineStyle';
import { cpSnapshotToScene } from '../../cp-workspace/adapters/cpSnapshotToScene';
import { previewGroupsToStrokes, type PreviewStrokeGroup } from '../../cp-workspace/renderer/previewStrokes';
import type { StrokeGeometry } from '../../cp-workspace/renderer/types';
import { DEFAULT_ORISTUDIO_CP_LINE_STYLE } from '../../lib/creasePatternViewport';
import { cpLineStyleDashPatterns } from '../../lib/oristudioCpLineStyle';
import { CP_CREASE_WIDTH_FACTOR } from '../../lib/stepDiagram/diagramInk';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { FoldLetter } from '../engine/foldEngineWire';
import { foldLetterLineColor, type FoldCreasePatternLines } from './foldCreasePatternLines';

/**
 * How much wider the instruction is drawn than a crease: the step's own lines
 * (or a previewed fold's) stand out of the pattern they are part of, under
 * the picks and the hover, which are wider still.
 */
export const FOLD_INSTRUCTION_WIDTH_MUL = 2;

/** The crease-pattern pane's strokes, for the renderer's channels. */
export interface FoldCreasePatternStrokes {
  /** The pattern, for the crease channel. */
  creases: StrokeGeometry;
  /** The instruction, for the preview channel under the tool's feedback; null for none. */
  instruction: StrokeGeometry | null;
  /** The CSS width a crease is drawn at: Edit's width law over its line width. */
  widthCss: number;
}

const LETTERS: readonly FoldLetter[] = ['valley', 'mountain'];

/**
 * The crease-pattern pane drawn through Edit's renderer path: each line's ink
 * and dash from Edit's line-style table (`createCpLineAppearanceResolver`,
 * the line style the user gave Edit's view), packed by Edit's builder
 * (`cpSnapshotToScene`), at Edit's crease width — and the instruction as Edit
 * draws a tool's line, in the crease colour it would make, solid
 * (`previewGroupsToStrokes`), wider than the pattern under it
 * ({@link FOLD_INSTRUCTION_WIDTH_MUL}).
 *
 * The inks are the theme's, resolved against `element` and read again when
 * `themeKey` changes; null until there is an element and something to draw.
 */
export function useFoldCreasePatternStrokes(
  lines: FoldCreasePatternLines | null,
  element: Element | null,
  themeKey: string
): FoldCreasePatternStrokes | null {
  const lineStyle = useWorkspaceStore((state) => state.oristudioCpViewport.lineStyle ?? DEFAULT_ORISTUDIO_CP_LINE_STYLE);
  const lineWidth = useWorkspaceStore((state) => state.oristudioCpViewport.lineWidth ?? 1);
  return useMemo(() => {
    if (!element || !lines) return null;
    const appearanceFor = createCpLineAppearanceResolver(lineStyle, 'mvf', element);
    const creases = cpSnapshotToScene(lines.creases, appearanceFor, cpLineStyleDashPatterns(lineStyle)).strokes;
    const groups: PreviewStrokeGroup[] = LETTERS.flatMap((letter) => {
      const segments = lines.instruction.filter((line) => line.letter === letter);
      return segments.length > 0
        ? [{ segments, color: resolveCpLineColor(foldLetterLineColor(letter), 'mvf', element) }]
        : [];
    });
    let instruction: StrokeGeometry | null = null;
    if (groups.length > 0) {
      instruction = previewGroupsToStrokes(groups);
      instruction.widthMul.fill(FOLD_INSTRUCTION_WIDTH_MUL);
    }
    return { creases, instruction, widthCss: CP_CREASE_WIDTH_FACTOR * lineWidth };
    // The theme is read off the element: its key is what says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, element, themeKey, lineStyle, lineWidth]);
}
