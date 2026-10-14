import type { TextSetter } from './diagramPageLayout';
import { packingArea, type PackStep } from './flowPacking';
import { STEP_NUMBER_SIZE_MM } from './stepType';

/**
 * The crane the packing prototype was tuned on (`implementation-plans/
 * diagram-flow-packing.md`; `artifacts/layout-review/proto2/raw-steps.json`):
 * each step's caption, whether turns come before it, and its picture's size
 * in mm, marks included, at the scale the 9-a-page layout gave it — the
 * reference size the page scale multiplies. The pictures themselves are not
 * kept.
 */
const CRANE: readonly (readonly [text: string, turnsBefore: boolean, width: number, height: number])[] = [
  ['Fold in half in both directions', false, 36.84, 36.84],
  ['Fold the diagonal', true, 35.83, 35.83],
  ['Result should look like this', true, 34.81, 34.81],
  ['Collapse the base along the shown creases', true, 48.79, 48.79],
  ['Partial view of the collapse', false, 48.79, 40.47],
  ['Valley fold both flaps inward', false, 36.38, 36.38],
  ['Unfold to the last step', false, 36.38, 36.38],
  ['Inside reverse fold both flaps', false, 48.23, 36.38],
  ['Valley fold the flap upward', false, 36.38, 55.42],
  ['Repeat steps 5-8 behind', false, 40.26, 51.32],
  ['Valley fold the two flaps inward', false, 22.17, 51.01],
  ['Repeat step 10 behind', false, 31.17, 51.01],
  ['Fold one layer to the left. Make sure to carefully punch the skinny flap so it is properly folded in half', false, 14.76, 51.3],
  ['Result. Turn the model over', false, 14.83, 50.93],
  ['Fold one layer to the left', true, 14.83, 50.93],
  ['Fold the bottom flap up so it touches the tips of the top flaps', false, 14.78, 50.91],
  ['Repeat step 15 behind', false, 32.37, 51.66],
  ['Fold one layer to the left', false, 36.64, 65.88],
  ['Result. Turn the model over', false, 35.7, 65.07],
  ['Fold one layer to the left', true, 35.7, 65.07],
  ['Grab the crane’s tail and swivel fold it to the left. Align it with the outer edge and flatten the paper.', false, 27.73, 46.23],
  ['Repeat step 20 on the right side', false, 42.82, 47.75],
  ['Focus on the head', false, 48.83, 49.66],
  ['Fold and unfold', false, 48.54, 53.42],
  ['Inside reverse fold', false, 47.38, 53.42],
  ['Result', false, 50.36, 49.49],
  ['Fold the wing down to 90 degrees', false, 47.82, 51.36],
  ['Completed crane!', false, 42.02, 38.46],
];

/** The crane's steps as the packing reads them, numbered from 1, their numbers set by `setter`. */
export function craneSteps(setter: TextSetter): PackStep[] {
  return CRANE.map(([text, turnsBefore, width, height], index) => ({
    id: `crane-${index + 1}`,
    size: { width, height },
    numberWidth: setter.line(String(index + 1), STEP_NUMBER_SIZE_MM, 700).widthMm,
    text,
    turnsBefore,
  }));
}

/** The prototype's page: A4 portrait, a 12 mm margin, the title's header and the page numbers' footer shown. */
export const PROTOTYPE_AREA = packingArea({ widthMm: 210, heightMm: 297, marginMm: 12 }, 11, 8);
