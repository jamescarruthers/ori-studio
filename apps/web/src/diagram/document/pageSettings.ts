/**
 * Every page setting's two values, in one table
 * (`implementation-plans/diagram-document-evolution.md`): the one a new
 * diagram starts with, and the one a file that does not say it reads as.
 *
 * - **`default`** — a new diagram's. Every saved diagram says every setting
 *   (`writePageSetup` in `diagramFile.ts`), so changing a default reaches only
 *   the diagrams made from then on: a one-line change, here, that moves no
 *   saved page.
 * - **`legacy`** — what a file that does not say the setting reads as: a file
 *   written by a build that did not know it, or before every setting was
 *   written (2026-10-12), when one at its default was left out. It is the
 *   value that draws the page as the build that wrote the file drew it, so it
 *   never changes once a build that knows the setting has shipped. A setting
 *   added later declares its legacy value here with it: the value that
 *   reproduces how pages were drawn before it existed.
 *
 * Today every legacy value is today's default but two: the layout, and the
 * steps per page, which a file without them reads from its columns and rows.
 *
 * A value of the wrong type is damage, and reads as the legacy value too
 * (`normalizePageSetup`); one past this build's range is a newer build's
 * (`diagramFile.ts`). The order of the table is the order a file writes them.
 *
 * Free of the document model's values, so that the model and the file reader
 * read one table without a cycle; `diagramDocument.ts` re-exports it.
 */
import type { DiagramPageSetup } from './diagramDocument';
import { STEPS_PER_PAGE_RANGE } from './pageRanges';

/** A file's columns and rows, as it says them: what a page without its steps per page reads them from. */
export type SaidColumnsRows = Pick<DiagramPageSetup, 'columns' | 'rows'>;

/** Each page setting's default and legacy value; the steps per page's legacy value is read from the columns and rows. */
export type PageSettingValues = {
  readonly [K in keyof DiagramPageSetup]: {
    readonly default: DiagramPageSetup[K];
    readonly legacy: K extends 'stepsPerPage' ? (said: SaidColumnsRows) => number : DiagramPageSetup[K];
  };
};

/**
 * The steps per page of a file that does not say them: as many as its
 * columns and rows hold, as every flow file before they could be chosen —
 * the columns and rows as said, a newer build's past this build's range too,
 * so that its unsaid steps per page read here as it meant them.
 */
export function legacyStepsPerPage(said: SaidColumnsRows): number {
  const held = Math.round(said.columns * said.rows);
  return Math.min(STEPS_PER_PAGE_RANGE.max, Math.max(STEPS_PER_PAGE_RANGE.min, held));
}

export const PAGE_SETTINGS: PageSettingValues = {
  size: { default: 'a4', legacy: 'a4' },
  orientation: { default: 'portrait', legacy: 'portrait' },
  marginMm: { default: 12, legacy: 12 },
  // A new diagram starts in the flow. The grid was every diagram's layout until the flow became a new one's
  // (2026-10-06), and every file since says its layout, so a page that does not — hand-edited or damaged — reads
  // as it would have then: never a saved grid as a flow.
  layout: { default: 'flow', legacy: 'grid' },
  columns: { default: 3, legacy: 3 },
  rows: { default: 3, legacy: 3 },
  stepsPerPage: { default: 9, legacy: legacyStepsPerPage },
  showPath: { default: true, legacy: true },
  // 20 mm. Every diagram saved before the width could be chosen drew the band in proportion to its steps until
  // 2026-10-08, and reads as 20 mm since (`implementation-plans/diagram-review-fixes.md`, item 1).
  pathWidthMm: { default: 20, legacy: 20 },
  // The mockup's light warm grey.
  pathColor: { default: '#ecece8', legacy: '#ecece8' },
  // The left, as in every file before there was a choice.
  firstPageSide: { default: 'left', legacy: 'left' },
  showTitle: { default: true, legacy: true },
  pageNumbers: { default: { enabled: true, first: 1 }, legacy: { enabled: true, first: 1 } },
  // Zach's packing (`diagram-flow-packing.md`, Decision 7), which every flow page was packed by before it could be chosen.
  flowBands: { default: 'auto', legacy: 'auto' },
  flowPreferBands: { default: 0.5, legacy: 0.5 },
  flowBendSteps: { default: true, legacy: true },
  flowNesting: { default: 0.8, legacy: 0.8 },
  flowSteadiness: { default: 0.85, legacy: 0.85 },
};

/** The page settings, in the order a file writes them. */
export const PAGE_SETTING_KEYS = Object.keys(PAGE_SETTINGS) as readonly (keyof DiagramPageSetup)[];

/** A new diagram's page setup: every setting's default. */
export const DEFAULT_PAGE_SETUP: DiagramPageSetup = Object.fromEntries(
  PAGE_SETTING_KEYS.map((key) => [key, PAGE_SETTINGS[key].default])
  // The table names every setting (its type says so), so this is a whole page setup.
) as unknown as DiagramPageSetup;

/** A new diagram's packing: Zach's defaults (Decision 7). */
export const DEFAULT_FLOW_PACKING: Readonly<
  Pick<DiagramPageSetup, 'flowBands' | 'flowPreferBands' | 'flowBendSteps' | 'flowNesting' | 'flowSteadiness'>
> = {
  flowBands: PAGE_SETTINGS.flowBands.default,
  flowPreferBands: PAGE_SETTINGS.flowPreferBands.default,
  flowBendSteps: PAGE_SETTINGS.flowBendSteps.default,
  flowNesting: PAGE_SETTINGS.flowNesting.default,
  flowSteadiness: PAGE_SETTINGS.flowSteadiness.default,
};

/** A new diagram's flow band width, mm, and what Reset sets it back to. */
export const DEFAULT_PATH_WIDTH_MM = PAGE_SETTINGS.pathWidthMm.default;

/** A new diagram's flow band colour, and what Reset sets it back to. */
export const DEFAULT_PATH_COLOR = PAGE_SETTINGS.pathColor.default;
