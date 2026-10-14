/**
 * The type a step is set in on its page: its number and its instruction, at
 * the sizes the layout sets them (`diagramPageLayout.ts`), which a placed
 * part's hit box measures too (`pagePlacement.ts`). One home, so the two can
 * never drift apart.
 */

/** The instruction's size and leading, mm. */
export const STEP_TEXT_SIZE_MM = 3.2;
export const STEP_TEXT_LEADING_MM = 4.1;
/** Room kept under an instruction's last baseline, for descenders, mm. */
export const TEXT_DESCENT_MM = 1.5;
/** The step number's size, mm. */
export const STEP_NUMBER_SIZE_MM = 6.2;
/** How far the step number's figures stand above its baseline: three quarters of its size. */
export const STEP_NUMBER_ASCENT_MM = 0.75 * STEP_NUMBER_SIZE_MM;
