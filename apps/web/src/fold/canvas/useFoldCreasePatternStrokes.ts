import { useMemo } from 'react';
import { createCpLineAppearanceResolver } from '../../cp-workspace/adapters/cpLineStyle';
import { cpSnapshotToScene } from '../../cp-workspace/adapters/cpSnapshotToScene';
import type { StrokeGeometry } from '../../cp-workspace/renderer/types';
import { DEFAULT_ORISTUDIO_CP_LINE_STYLE } from '../../lib/creasePatternViewport';
import { cpLineStyleDashPatterns } from '../../lib/oristudioCpLineStyle';
import type { PaperStyle } from '../../lib/paper/paperStyle';
import { CP_CREASE_WIDTH_FACTOR } from '../../lib/stepDiagram/diagramInk';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { FoldCreasePatternLines } from './foldCreasePatternLines';
import { foldInstructionPens, foldInstructionStrokes } from './foldInstructionStrokes';

/** The crease-pattern pane's strokes, for the renderer's channels. */
export interface FoldCreasePatternStrokes {
  /** The pattern, for the crease channel. */
  creases: StrokeGeometry;
  /** The instruction, for the preview channel under the tool's feedback; null for none. */
  instruction: StrokeGeometry | null;
  /** The CSS width a crease is drawn at: Edit's width law over its line width. */
  widthCss: number;
}

/**
 * The crease-pattern pane drawn through Edit's renderer path: each line's ink
 * and dash from Edit's line-style table (`createCpLineAppearanceResolver`,
 * the line style the user gave Edit's view), packed by Edit's builder
 * (`cpSnapshotToScene`), at Edit's crease width — and the instruction, the
 * step's own fold lines, in the sequence's paper style's diagram-crease pens
 * (`foldInstructionStrokes`): their colour on the canvas's `ground` (a CSS
 * colour), their weight, dash and cap.
 *
 * The inks are the theme's, resolved against `element` and read again when
 * `themeKey` changes; null until there is an element and something to draw.
 */
export function useFoldCreasePatternStrokes(
  lines: FoldCreasePatternLines | null,
  element: Element | null,
  themeKey: string,
  style: PaperStyle,
  ground: string | null
): FoldCreasePatternStrokes | null {
  const lineStyle = useWorkspaceStore((state) => state.oristudioCpViewport.lineStyle ?? DEFAULT_ORISTUDIO_CP_LINE_STYLE);
  const lineWidth = useWorkspaceStore((state) => state.oristudioCpViewport.lineWidth ?? 1);
  return useMemo(() => {
    if (!element || !lines || ground === null) return null;
    const appearanceFor = createCpLineAppearanceResolver(lineStyle, 'mvf', element);
    const creases = cpSnapshotToScene(lines.creases, appearanceFor, cpLineStyleDashPatterns(lineStyle)).strokes;
    const widthCss = CP_CREASE_WIDTH_FACTOR * lineWidth;
    const instruction = foldInstructionStrokes(lines.instruction, foldInstructionPens(style, lineWidth, ground), widthCss);
    return { creases, instruction, widthCss };
    // The theme is read off the element: its key is what says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, element, themeKey, lineStyle, lineWidth, style, ground]);
}
