/**
 * The vertex folds' window — squash, petal fold, rabbit ear, swivel (plan
 * Phase 11, D14) — as the plain descriptor the one Fold window renderer draws
 * (`components/fold/FoldToolWindow`), the reverse tool's window's sibling.
 *
 * While the clicks are being made: numbered steps for them, what each snaps
 * to, the fold's precondition — said up front, since research §5.3 found the
 * preconditions, not the stacking, to be what stops these folds — and the
 * direction, which decides which layer a click names. A petal fold locates
 * its line H through the line-mode select, as a fold locates its line.
 *
 * Once every click is in, previewing:
 *
 * - **the direction**, valley or mountain, as the viewer sees it;
 * - a squash's **spine target**: its hinge line until a point is clicked on
 *   the folded pane, drawn there either way, with a way back to the hinge;
 * - a fan's **fourth crease**, among the candidates the engine lists (three
 *   at most), the ones that do not fit said so, and the **layers** it cuts,
 *   from the direction's side;
 * - a rabbit ear's **ridge**: which of the two creases across from the paper
 *   that stays rises as the ear's ridge, one that does not fit disabled;
 * - the **layer order**, when the fold leaves more than one;
 * - a refusal in the folder's words with every fix a button, and Cancel and
 *   the fold.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { FoldDirection } from '../../document/foldSequenceDocument';
import type { FoldModelPoint } from '../../engine/foldEngineWire';
import { foldToolLabel, type FoldVertexToolId } from '../foldToolCatalog';
import {
  lineModeSelect,
  queuedNote,
  settingsMeta,
  type FoldToolHost,
  type FoldToolInstructions,
  type FoldToolWindowModel,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
} from '../foldToolWindow';
import { foldRefusalNotice } from '../refusalNotice';
import { choiceStepper, type FoldChoiceStepper } from '../reverse/reverseToolWindow';
import { vertexToolSteps } from './vertexInputs';

/** One of a rabbit ear's two ridge options, as the window names it. */
export interface FoldVertexRidgeView {
  /** The corner whose ray it is, by click (0-based); null for the fourth crease. */
  given: number | null;
  lands: boolean;
}

/** What a vertex tool's window is drawn from, beside every tool's view. */
export interface FoldVertexWindowView {
  tool: FoldVertexToolId;
  direction: FoldDirection;
  /** The engine has described the flap, line or fan the clicks name: there is something to choose about. */
  described: boolean;
  /** The step is built from that description and the choices made: there is something to commit. */
  known: boolean;
  /** A squash's spine lands on its hinge line, or toward a point clicked. */
  target: 'hinge' | 'point';
  /** A fan's: per emergent candidate, whether it fits; and the one taken. */
  emergents: readonly boolean[];
  emergent: number;
  /** A rabbit ear's two ridge options (empty until known), and the one taken. */
  ridges: readonly FoldVertexRidgeView[];
  ridge: number;
  /** The layers at a fan's center, and how many it cuts (null for every one). */
  layers: number;
  fanLayers: number | null;
  /** How many layer orders the step leaves (0 with no choice), and the one taken. */
  orders: number;
  order: number;
  /** A `use_emergent` fix's number on screen, by its direction. */
  emergentNumber?: (direction: FoldModelPoint) => number | null;
  /** A petal fold's H runs along no precrease, but one lies beside it. */
  nearPrecrease?: boolean;
}

/** The vertex folds' own calls in the window; the canvas binds them. */
export interface FoldVertexWindowVerbs {
  setVertexDirection?: (direction: FoldDirection) => void;
  stepEmergent?: (delta: number) => void;
  setRidge?: (ridge: number) => void;
  stepFanLayers?: (delta: number) => void;
}

/** A vertex fold's own controls in the window. */
export interface FoldVertexControls {
  direction: {
    label: string;
    value: FoldDirection;
    options: readonly { value: FoldDirection; label: string; tooltip: string }[];
    disabled: boolean;
    set: (direction: FoldDirection) => void;
  };
  /** A squash's spine target; null for every other fold, and before the flap is clicked. */
  target: {
    label: string;
    /** "The hinge line", or "The point clicked". */
    value: string;
    /** How to move it. */
    help: string;
    reset: { label: string; disabled: boolean; run: () => void } | null;
  } | null;
  /** A fan's fourth crease, when it has more than one candidate. */
  emergent: FoldChoiceStepper | null;
  /** Said under it when the one taken does not fit, or which do. */
  emergentNote: string | null;
  /** The layers a fan cuts, when more than one lies at its center. */
  layers: FoldChoiceStepper | null;
  /** A rabbit ear's ridge, once its two options are known. */
  ridge: {
    label: string;
    value: number;
    options: readonly { value: number; label: string; tooltip: string; disabled: boolean }[];
    disabled: boolean;
    set: (ridge: number) => void;
  } | null;
  order: FoldChoiceStepper | null;
  /** What the fold needs of the paper, said under the controls. */
  note: string;
}

/** Whether a vertex fold has any choice to show beside its direction. */
export function hasVertexChoices(controls: FoldVertexControls): boolean {
  return Boolean(controls.target || controls.emergent || controls.layers || controls.ridge || controls.order);
}

/** What the fold needs of the paper (research §5.3: its preconditions are what stop it). */
function preconditionNote(t: TFunction, tool: FoldVertexToolId, host: FoldToolHost): string {
  switch (tool) {
    case 'squash':
      return t(
        'tools:fold.vertex.note.squash',
        'A flap squashes when its two layers are free, held only along its hinge, and uncovered, with nothing over it on the side it opens toward.'
      );
    case 'petal':
      return t(
        'tools:fold.vertex.note.petal',
        'A petal fold refolds creases already there: precrease the kite creases from the flap’s lower point and the line H across their ends first.'
      );
    case 'rabbit-ear':
      return t(
        'tools:fold.vertex.note.rabbitEar',
        'The creases meet at the triangle’s incenter: one to each corner, and a fourth that lets them lie flat.'
      );
    case 'swivel':
      return host.coarse
        ? t('tools:fold.vertex.note.swivelTouch', 'The point the creases meet at must lie inside the paper, off every crease.')
        : t(
            'tools:fold.vertex.note.swivel',
            'The point the creases meet at must lie inside the paper, off every crease: hold {{modifier}} to put it anywhere.',
            { modifier: host.alt }
          );
  }
}

/** What the clicks snap to, and the key that clears them. */
function locateNotes(t: TFunction, tool: FoldVertexToolId, host: FoldToolHost): string[] {
  const snaps = tool === 'rabbit-ear' || tool === 'swivel';
  const snap = snaps ? [t('tools:fold.note.snap', 'Points snap to corners, marks, crease crossings, midpoints and edges.')] : [];
  const clear = host.coarse ? [] : [t('tools:fold.note.clear', 'Esc clears the picks.')];
  return [...snap, ...clear];
}

function locateInstructions(
  t: TFunction,
  view: FoldToolWindowView,
  tool: FoldVertexToolId,
  host: FoldToolHost
): FoldToolInstructions {
  const action = foldToolLabel(t, tool);
  const finish = host.coarse
    ? t('tools:fold.vertex.steps.finishTouch', 'Choose the options, then tap {{action}}.', { action })
    : t('tools:fold.vertex.steps.finish', 'Choose the options, then press Enter.');
  const items = [...vertexToolSteps(t, tool, view.lineMode), finish];
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items,
    current: Math.min(Math.max(0, view.picks), items.length - 1),
    notes: locateNotes(t, tool, host),
  };
}

/** What is left to choose once every click is in. */
function chooseStep(t: TFunction, tool: FoldVertexToolId, host: FoldToolHost): string {
  switch (tool) {
    case 'squash':
      return host.coarse
        ? t('tools:fold.vertex.steps.squashTargetTouch', 'Tap where the spine should land, or keep it on the hinge line.')
        : t('tools:fold.vertex.steps.squashTarget', 'Click where the spine should land, or keep it on the hinge line.');
    case 'petal':
      return t('tools:fold.vertex.steps.petalDirection', 'Choose which way the flap lifts.');
    case 'rabbit-ear':
      return t('tools:fold.vertex.steps.earChoose', 'Choose the fourth crease, the layers and the ridge.');
    case 'swivel':
      return t('tools:fold.vertex.steps.swivelChoose', 'Choose the fourth crease and the layers.');
  }
}

function previewInstructions(
  t: TFunction,
  vertex: FoldVertexWindowView,
  host: FoldToolHost,
  view: FoldToolWindowView
): FoldToolInstructions {
  const { tool } = vertex;
  if (!vertex.described && view.preview?.refused) {
    // Refused before anything was described: nothing to choose, only to pick again.
    return {
      heading: t('tools:fold.window.instructions', 'Instructions'),
      items: [
        host.coarse
          ? t('tools:fold.vertex.steps.pickAgainTouch', 'Tap Cancel, then pick again.')
          : t('tools:fold.vertex.steps.pickAgain', 'Press Esc, then pick again.'),
      ],
      current: 0,
      notes: [],
    };
  }
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items: [
      chooseStep(t, tool, host),
      host.coarse
        ? t('tools:fold.steps.commitTouch', 'Tap {{action}} to fold.', { action: foldToolLabel(t, tool) })
        : t('tools:fold.steps.commit', 'Press Enter to fold.'),
    ],
    // The choices are optional, so the window leads with them and never marks them done.
    current: 0,
    notes: view.preview ? queuedNote(t, view.preview) : [],
  };
}

/** A ridge option in a word or two, and in full for its tooltip. */
function ridgeWords(t: TFunction, ridge: FoldVertexRidgeView): { label: string; tooltip: string } {
  const words =
    ridge.given === null
      ? {
          // Short enough to sit beside a corner's in the window's row: the tooltip says it whole.
          label: t('tools:fold.vertex.ridgeFourth', 'Fourth'),
          tooltip: t('tools:fold.vertex.ridgeFourthTitle', 'The fourth crease rises as the ridge'),
        }
      : {
          label: t('tools:fold.vertex.ridgeCorner', 'Corner {{number}}', { number: ridge.given + 1 }),
          tooltip: t('tools:fold.vertex.ridgeCornerTitle', 'The crease to corner {{number}} rises as the ridge', {
            number: ridge.given + 1,
          }),
        };
  return ridge.lands
    ? words
    : { ...words, tooltip: `${words.tooltip} - ${t('tools:fold.vertex.doesNotFit', 'Does not fit here')}` };
}

/** What the fourth crease's stepper says beneath it: that the one taken does not fit. */
function emergentNote(t: TFunction, vertex: FoldVertexWindowView): string | null {
  const { emergents, emergent } = vertex;
  if (emergents.length === 0) return null;
  const fitting = emergents.filter(Boolean).length;
  if (fitting === 0) return t('tools:fold.vertex.noEmergentFits', 'No fourth crease fits these layers here.');
  if (emergents[emergent] === false) {
    return t('tools:fold.vertex.emergentDoesNotFit', 'This fourth crease does not fit here: step to another.');
  }
  return null;
}

/** The layers stepper's value: every layer, or the first few from the direction's side. */
function layersValue(t: TFunction, vertex: FoldVertexWindowView): string {
  const { layers, fanLayers, direction } = vertex;
  if (fanLayers === null || fanLayers >= layers) return t('tools:fold.vertex.layersAll', 'All {{count}}', { count: layers });
  return direction === 'valley'
    ? t('tools:fold.vertex.layersTop', 'Top {{count}} of {{total}}', { count: fanLayers, total: layers })
    : t('tools:fold.vertex.layersBottom', 'Bottom {{count}} of {{total}}', { count: fanLayers, total: layers });
}

/**
 * A vertex fold's controls (see the module docs). `located` once every click
 * is in: its choices are offered once the engine has described what the
 * clicks name, never about a flap it refused.
 */
export function vertexControls(
  t: TFunction,
  vertex: FoldVertexWindowView,
  verbs: FoldToolWindowVerbs,
  readOnly: boolean,
  host: FoldToolHost,
  clicked: boolean
): FoldVertexControls {
  const { tool } = vertex;
  const located = clicked && vertex.described;
  const fan = tool === 'rabbit-ear' || tool === 'swivel';
  const { setVertexDirection, resetSquashTarget, setRidge } = verbs;
  const [first, second] = vertex.ridges;
  return {
    direction: {
      label: t('tools:fold.vertex.direction', 'Direction'),
      value: vertex.direction,
      options: [
        {
          value: 'valley',
          label: t('tools:fold.vertex.valley', 'Valley'),
          tooltip: t('tools:fold.vertex.valleyTitle', 'Valley: the paper turns toward you'),
        },
        {
          value: 'mountain',
          label: t('tools:fold.vertex.mountain', 'Mountain'),
          tooltip: t('tools:fold.vertex.mountainTitle', 'Mountain: the paper turns away from you'),
        },
      ],
      disabled: readOnly || !setVertexDirection,
      set: (direction) => setVertexDirection?.(direction),
    },
    target:
      tool === 'squash' && located
        ? {
            label: t('tools:fold.vertex.target', 'Spine lands on'),
            value:
              vertex.target === 'hinge'
                ? t('tools:fold.vertex.targetHinge', 'The hinge line')
                : t('tools:fold.vertex.targetPoint', 'The point clicked'),
            help: host.coarse
              ? t('tools:fold.vertex.targetHelpTouch', 'Tap the folded paper to land the spine off the hinge.')
              : t('tools:fold.vertex.targetHelp', 'Click the folded paper to land the spine off the hinge.'),
            reset:
              vertex.target === 'point' && resetSquashTarget
                ? { label: t('tools:fold.vertex.reset', 'Back to the hinge'), disabled: readOnly, run: resetSquashTarget }
                : null,
          }
        : null,
    emergent:
      fan && located
        ? choiceStepper(
            t,
            t('tools:fold.vertex.emergent', 'Fourth crease'),
            vertex.emergent,
            vertex.emergents.length,
            verbs.stepEmergent,
            readOnly
          )
        : null,
    emergentNote: fan && located ? emergentNote(t, vertex) : null,
    layers:
      fan && located
        ? choiceStepper(
            t,
            t('tools:fold.vertex.layers', 'Layers'),
            (vertex.fanLayers ?? vertex.layers) - 1,
            vertex.layers,
            verbs.stepFanLayers,
            readOnly,
            layersValue(t, vertex)
          )
        : null,
    ridge:
      tool === 'rabbit-ear' && located && first && second && setRidge
        ? {
            label: t('tools:fold.vertex.ridge', 'Ridge'),
            value: vertex.ridge,
            options: [first, second].map((ridge, value) => ({ value, ...ridgeWords(t, ridge), disabled: !ridge.lands })),
            disabled: readOnly,
            set: setRidge,
          }
        : null,
    order: located
      ? choiceStepper(t, t('tools:fold.reverse.order', 'Layer order'), vertex.order, vertex.orders, verbs.stepOrder, readOnly)
      : null,
    note: preconditionNote(t, tool, host),
  };
}

/** A vertex tool's window: its clicks, then previewing the fold (see the module docs). */
export function vertexToolWindow(
  t: TFunction,
  view: FoldToolWindowView,
  vertex: FoldVertexWindowView,
  verbs: FoldToolWindowVerbs,
  host: FoldToolHost
): FoldToolWindowModel {
  const readOnly = view.readOnly !== null;
  const { tool } = vertex;
  const title = foldToolLabel(t, tool);
  const { preview } = view;
  if (!preview) {
    return {
      phase: 'locate',
      title,
      meta: settingsMeta(t, 1),
      instructions: locateInstructions(t, view, tool, host),
      // A petal fold's line H is located as a fold's line is.
      lineMode: tool === 'petal' ? lineModeSelect(t, view, verbs) : null,
      kind: null,
      movingSide: null,
      layers: null,
      refusal: null,
      divide: null,
      vertex: vertexControls(t, vertex, verbs, readOnly, host, false),
      footer: null,
    };
  }
  const controls = vertexControls(t, vertex, verbs, readOnly, host, true);
  const settings = [controls.direction, controls.target, controls.emergent, controls.layers, controls.ridge, controls.order];
  return {
    phase: 'preview',
    title,
    meta: settingsMeta(t, settings.filter(Boolean).length),
    instructions: previewInstructions(t, vertex, host, view),
    lineMode: null,
    kind: null,
    movingSide: null,
    layers: null,
    refusal: preview.refused
      ? foldRefusalNotice(
          t,
          preview.refused,
          {
            kind: 'vertex',
            readOnly,
            flapNumber: (flap) => flap + 1,
            vertex: {
              tool,
              ...(vertex.emergentNumber ? { emergentNumber: vertex.emergentNumber } : {}),
              ...(vertex.nearPrecrease ? { nearPrecrease: true } : {}),
            },
          },
          verbs
        )
      : null,
    divide: null,
    vertex: controls,
    footer: {
      cancel: {
        label: t('tools:fold.window.cancel', 'Cancel'),
        shortcut: 'viewport.cancel',
        disabled: false,
        run: verbs.cancel,
      },
      commit: {
        label: title,
        shortcut: 'fold.commit',
        disabled: readOnly || !vertex.known || preview.landing || preview.refused !== null,
        run: verbs.commit,
      },
    },
  };
}
