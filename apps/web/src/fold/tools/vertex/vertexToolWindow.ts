/**
 * The vertex folds' window — squash, petal fold, rabbit ear, swivel (plan
 * Phase 11, D14) — as the plain descriptor the one Fold window renderer draws
 * (`components/fold/FoldToolWindow`), the reverse tool's window's sibling.
 *
 * While the clicks are being made: numbered steps for them, what each snaps
 * to, the fold's precondition — said up front, since research §5.3 found the
 * preconditions, not the stacking, to be what stops these folds: for the
 * petal fold and the swivel above the steps, with what the fold is, since
 * their first click already depends on it; for the others under the
 * direction — and the direction, which decides which layer a click names.
 * A petal fold's hinge is named by a crease or by its two ends, and a
 * swivel's target by a crease or edge or by two points: a control switches
 * each (`lineBy`), in both phases, so the window keeps its shape.
 *
 * Once every click is in, previewing:
 *
 * - **the direction**, valley or mountain, as the viewer sees it;
 * - a squash's **spine target**: its hinge line until a point is clicked on
 *   the folded pane, drawn there either way, with a way back to the hinge;
 * - a rabbit ear's **fourth crease**, among the candidates the engine lists
 *   (three at most) that land — one that cannot fold is never offered (owner
 *   feedback, 2026-10-12) — in a row that stays put with one or none, and
 *   under it, in a place kept for it, how many fit with this paper staying
 *   put; and the **layers** it cuts, from the direction's side. Its fourth
 *   crease is its ridge, folding the other way from the three to the
 *   corners, so there is no ridge to choose;
 * - a swivel's **ridge**, the crease of its four that folds the other way:
 *   square to the edge, or toward its end — only the ones that land, by name,
 *   in the same row and its note;
 * - a petal fold's note: what the fold creases itself, the hinge and the
 *   kite creases, when they are not there already;
 * - the **layer order**, when the fold leaves more than one;
 * - a refusal in the folder's words with every fix a button, and Cancel and
 *   the fold.
 *
 * React-free and store-free.
 */
import type { TFunction } from 'i18next';
import type { FoldDirection } from '../../document/foldSequenceDocument';
import type { FoldModelPoint } from '../../engine/foldEngineWire';
import { FOLD_LINE_BY, foldToolLabel, type FoldLineBy, type FoldVertexToolId } from '../foldToolCatalog';
import {
  queuedNote,
  settingsMeta,
  type FoldToolHost,
  type FoldToolInstructions,
  type FoldToolWindowModel,
  type FoldToolWindowVerbs,
  type FoldToolWindowView,
} from '../foldToolWindow';
import { foldRefusalNotice, sectionFlapNames } from '../refusalNotice';
import { choiceStepper, type FoldChoiceStepper, type FoldKindChoice } from '../reverse/reverseToolWindow';
import { swivelRidgeName } from '../../stepSentenceVertex';
import { vertexToolSteps } from './vertexInputs';

/** Which of a swivel's two creases rises as its ridge: square to the edge, or toward its far end. */
export type FoldSwivelRidge = 'foot' | 'end';

/** What a petal fold creases itself as it lifts the flap (`FoldPetalAnalysis`' `scores_line`, `scores_kites`). */
export interface FoldPetalScores {
  /** The hinge, through the top layer. */
  hinge: boolean;
  /** How many kite creases, through the top two layers. */
  kites: number;
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
  /**
   * A rabbit ear's fourth creases that land — a swivel's ridges that land —
   * the only ones offered, numbered among themselves, and the position of
   * the one taken among them.
   */
  fourths: number;
  fourth: number;
  /** With none that lands: whether one would with other paper staying; null while that is asked. */
  fourthElsewhere?: boolean | null;
  /** The layers at a rabbit ear's center, and how many it cuts (null for every one). */
  layers: number;
  fanLayers: number | null;
  /** How many layer orders the step leaves (0 with no choice), and the one taken. */
  orders: number;
  order: number;
  /** A `use_emergent` fix's number on screen, by its direction. */
  emergentNumber?: (direction: FoldModelPoint) => number | null;
  /** How a petal fold's hinge, or a swivel's target, is named: by a crease, or by two points. */
  lineBy?: FoldLineBy;
  /** A swivel's ridge taken, by name; null before the engine has described it. */
  ridge?: FoldSwivelRidge | null;
  /** What a petal fold creases itself, once the engine has described its flap. */
  petalScores?: FoldPetalScores | null;
}

/** The vertex folds' own calls in the window; the canvas binds them. */
export interface FoldVertexWindowVerbs {
  setVertexDirection?: (direction: FoldDirection) => void;
  stepEmergent?: (delta: number) => void;
  stepFanLayers?: (delta: number) => void;
  /** Name a petal fold's hinge, or a swivel's target, by a crease or by two points. */
  setVertexLineBy?: (lineBy: FoldLineBy) => void;
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
  /**
   * How a petal fold's hinge is named — a hinge crease, or two endpoints —
   * or a swivel's target: a crease or edge, or two points. Null for the
   * other folds.
   */
  lineBy: FoldKindChoice<FoldLineBy> | null;
  /** A squash's spine target; null for every other fold, and before the flap is clicked. */
  target: {
    label: string;
    /** "The hinge line", or "The point clicked". */
    value: string;
    /** How to move it. */
    help: string;
    reset: { label: string; disabled: boolean; run: () => void } | null;
  } | null;
  /**
   * A rabbit ear's fourth crease, or a swivel's ridge, once the engine has
   * described the fold: a stepper through the ones that land, its arrows off
   * when one lands or none. Always there, so the window keeps its shape
   * whichever paper stays.
   */
  emergent: FoldChoiceStepper | null;
  /**
   * Said under it, in a place kept for it: how many fit with this paper
   * staying put — when none does, to pick other paper to stay; how many of a
   * swivel's ridges fit.
   */
  emergentNote: string | null;
  /** The layers a rabbit ear cuts, when more than one lies at its center. */
  layers: FoldChoiceStepper | null;
  order: FoldChoiceStepper | null;
  /**
   * What the fold needs of the paper, or what it will do, said under the
   * direction: a squash's and a rabbit ear's precondition; a petal fold's
   * creases it makes itself, and a swivel's vertex, once previewed. Null for
   * a fold whose window says it above its steps instead (`vertexIntro`).
   */
  note: string | null;
}

/** Whether a vertex fold has any choice to show beside its direction. */
export function hasVertexChoices(controls: FoldVertexControls): boolean {
  return Boolean(controls.target || controls.emergent || controls.layers || controls.order);
}

/**
 * What the fold needs of the paper (research §5.3: its preconditions are
 * what stop it), said under its direction; null for the petal fold and the
 * swivel, whose windows say it above their steps (`vertexIntro`), before the
 * first click it governs.
 */
function preconditionNote(t: TFunction, tool: FoldVertexToolId): string | null {
  switch (tool) {
    case 'squash':
      return t(
        'tools:fold.vertex.note.squash',
        'A flap squashes when its two layers are free, held only along its hinge, and uncovered, with nothing over it on the side it opens toward.'
      );
    case 'rabbit-ear':
      return t(
        'tools:fold.vertex.note.rabbitEar',
        'The creases meet at the triangle’s incenter: one to each corner, folded the way you choose, and a fourth the ear rises along, folded the other way.'
      );
    case 'petal':
    case 'swivel':
      return null;
  }
}

/** What a petal fold creases itself as it lifts the flap (owner feedback, 2026-10-12), from the engine's description. */
function petalScoresNote(t: TFunction, scores: FoldPetalScores): string {
  const { hinge, kites } = scores;
  if (hinge && kites >= 2) {
    return t(
      'tools:fold.vertex.note.petalCreasesAll',
      'The fold creases the hinge through the top layer and both kite creases through the top two layers as the flap lifts.'
    );
  }
  if (hinge && kites === 1) {
    return t(
      'tools:fold.vertex.note.petalCreasesHingeKite',
      'The fold creases the hinge through the top layer and one kite crease through the top two layers as the flap lifts. The other kite crease is there already.'
    );
  }
  if (hinge) {
    return t(
      'tools:fold.vertex.note.petalCreasesHinge',
      'The fold creases the hinge through the top layer as the flap lifts. The kite creases are there already.'
    );
  }
  if (kites >= 2) {
    return t(
      'tools:fold.vertex.note.petalCreasesKites',
      'The fold creases both kite creases through the top two layers as the flap lifts. The hinge is there already.'
    );
  }
  if (kites === 1) {
    return t(
      'tools:fold.vertex.note.petalCreasesKite',
      'The fold creases one kite crease through the top two layers as the flap lifts. The hinge and the other kite crease are there already.'
    );
  }
  return t(
    'tools:fold.vertex.note.petalRefolds',
    'Every crease it folds is there already: it refolds the hinge and the kite creases.'
  );
}

/**
 * What the petal fold and the swivel are, and what they need first, above
 * their steps: what a first-time folder could not otherwise know before the
 * first click (owner feedback, 2026-10-11). Null for the others.
 */
function vertexIntro(t: TFunction, tool: FoldVertexToolId): string | null {
  switch (tool) {
    case 'petal':
      return t(
        'tools:fold.vertex.intro.petalHinge',
        'Lifts a flap’s lower point up along a hinge while its sides fold in along two kite creases. Select the hinge as a crease already across the flap, or by its two ends: then the fold creases the hinge through the top layer, and any kite crease that is missing, as it folds.'
      );
    case 'swivel':
      return t(
        'tools:fold.vertex.intro.swivelEdge',
        'Swivels an edge onto a line, pivoting at a point. The creases meet where the pivot sits, moved onto the line halfway between the edge and the line it lands on, and the paper between them turns flat.'
      );
    case 'squash':
    case 'rabbit-ear':
      return null;
  }
}

/** What the clicks snap to, and the keys that change and clear them. */
function locateNotes(t: TFunction, view: FoldToolWindowView, vertex: FoldVertexWindowView, host: FoldToolHost): string[] {
  const { tool } = vertex;
  const clear = host.coarse ? [] : [t('tools:fold.note.clear', 'Esc clears the picks.')];
  // A petal fold's flap: lit under the pointer once the engine names one there.
  if (tool === 'petal' && view.picks >= (vertex.lineBy === 'points' ? 2 : 1)) {
    return [
      host.coarse
        ? t('tools:fold.vertex.note.petalRegionTouch', 'The flap below the hinge lights up once you tap it.')
        : t(
            'tools:fold.vertex.note.petalRegion',
            'Paper below the hinge lights up where a petal fold can lift it: a click elsewhere says why not.'
          ),
      ...clear,
    ];
  }
  if (tool === 'petal' && vertex.lineBy !== 'points') {
    return [t('tools:fold.vertex.note.petalHingeCrease', 'Only precreases can be the hinge: one lights up under the pointer.'), ...clear];
  }
  // A rabbit ear's, a swivel's and a petal fold's ends are points: a
  // landmark, or with the key any point, never a place on an edge between
  // landmarks.
  const snaps = tool !== 'squash';
  const snap = snaps
    ? [
        host.coarse
          ? t(
              'tools:fold.vertex.note.snapPointsTouch',
              'Points snap to corners, marks, crease crossings and midpoints: a tap anywhere else picks nothing.'
            )
          : t(
              'tools:fold.vertex.note.snapPoints',
              'Points snap to corners, marks, crease crossings and midpoints: a click anywhere else picks nothing.'
            ),
        host.coarse
          ? t('tools:fold.vertex.note.freePointTouch', 'Turn on Free point to put a point anywhere.')
          : t('tools:fold.vertex.note.freePoint', 'Hold {{modifier}} to put a point anywhere.', { modifier: host.alt }),
      ]
    : [];
  return [...snap, ...clear];
}

/** The last step while the clicks are made: what comes after them. */
function finishStep(t: TFunction, tool: FoldVertexToolId, host: FoldToolHost): string {
  const action = foldToolLabel(t, tool);
  switch (tool) {
    case 'petal':
      return host.coarse
        ? t('tools:fold.vertex.steps.petalFinishTouch', 'Choose Valley or Mountain, then tap {{action}}.', { action })
        : t('tools:fold.vertex.steps.petalFinish', 'Choose Valley or Mountain, then press Enter.');
    case 'swivel':
      return host.coarse
        ? t('tools:fold.vertex.steps.swivelFinishRidgeTouch', 'Pick the ridge and the direction, then tap {{action}}.', { action })
        : t('tools:fold.vertex.steps.swivelFinishRidge', 'Pick the ridge and the direction, then press Enter.');
    case 'squash':
    case 'rabbit-ear':
      return host.coarse
        ? t('tools:fold.vertex.steps.finishTouch', 'Choose the options, then tap {{action}}.', { action })
        : t('tools:fold.vertex.steps.finish', 'Choose the options, then press Enter.');
  }
}

function locateInstructions(
  t: TFunction,
  view: FoldToolWindowView,
  vertex: FoldVertexWindowView,
  host: FoldToolHost
): FoldToolInstructions {
  const { tool } = vertex;
  const lines = { petalHinge: vertex.lineBy ?? 'crease', swivelTarget: vertex.lineBy ?? 'crease' };
  const items = [...vertexToolSteps(t, tool, lines, host), finishStep(t, tool, host)];
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    intro: vertexIntro(t, tool),
    items,
    current: Math.min(Math.max(0, view.picks), items.length - 1),
    notes: locateNotes(t, view, vertex, host),
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
      // Another flap below the hinge is picked by a click on it.
      return host.coarse
        ? t(
            'tools:fold.vertex.steps.petalLiftOtherTouch',
            'Valley lifts the flap toward you, Mountain away from you. Tap another flap below the hinge to lift that one.'
          )
        : t(
            'tools:fold.vertex.steps.petalLiftOther',
            'Valley lifts the flap toward you, Mountain away from you. Click another flap below the hinge to lift that one.'
          );
    case 'rabbit-ear':
      // The paper that stays is picked again by a click on another region.
      return host.coarse
        ? t(
            'tools:fold.vertex.steps.fanChooseTouch',
            'Choose the fourth crease and the layers. Tap other paper to change what stays put.'
          )
        : t(
            'tools:fold.vertex.steps.fanChooseStayer',
            'Choose the fourth crease and the layers. Click other paper to change what stays put.'
          );
    case 'swivel':
      return t(
        'tools:fold.vertex.steps.swivelChooseRidge',
        'Step Ridge to the other crease that can rise, and choose Valley or Mountain.'
      );
  }
}

/**
 * The commit, in a window with buttons in it: a stepper pressed last keeps
 * the focus, and Enter would press it again, so the button is named too.
 */
function commitStep(t: TFunction, tool: FoldVertexToolId, host: FoldToolHost): string {
  const action = foldToolLabel(t, tool);
  return host.coarse
    ? t('tools:fold.steps.commitTouch', 'Tap {{action}} to fold.', { action })
    : t('tools:fold.steps.commitOrClick', 'Press Enter, or click {{action}}, to fold.', { action });
}

function previewInstructions(
  t: TFunction,
  vertex: FoldVertexWindowView,
  host: FoldToolHost,
  view: FoldToolWindowView,
  fixes: boolean
): FoldToolInstructions {
  const { tool } = vertex;
  if (!vertex.described && view.preview?.refused) {
    // Refused before anything was described: nothing to choose, only to pick
    // again — or to take a fix the notice offers.
    const again = fixes
      ? host.coarse
        ? t('tools:fold.vertex.steps.fixOrPickAgainTouch', 'Tap a fix below, or tap Cancel and pick again.')
        : t('tools:fold.vertex.steps.fixOrPickAgain', 'Click a fix below, or press Esc and pick again.')
      : host.coarse
        ? t('tools:fold.vertex.steps.pickAgainReadTouch', 'Tap Cancel and pick again: the notice below says what to change.')
        : t('tools:fold.vertex.steps.pickAgainRead', 'Press Esc and pick again: the notice below says what to change.');
    return {
      heading: t('tools:fold.window.instructions', 'Instructions'),
      items: [again],
      current: 0,
      notes: [],
    };
  }
  return {
    heading: t('tools:fold.window.instructions', 'Instructions'),
    items: [chooseStep(t, tool, host), commitStep(t, tool, host)],
    // The choices are optional, so the window leads with them and never marks them done.
    current: 0,
    notes: view.preview ? queuedNote(t, view.preview) : [],
  };
}

/**
 * A rabbit ear's fourth crease, or a swivel's ridge: a stepper through the
 * ones that land, the only ones offered. With one, or none, the row stays
 * where it is with its arrows off, so the window keeps its shape as the
 * paper that stays changes.
 */
function fourthStepper(
  t: TFunction,
  vertex: FoldVertexWindowView,
  verbs: FoldToolWindowVerbs,
  readOnly: boolean
): FoldChoiceStepper {
  const swivel = vertex.tool === 'swivel';
  const label = swivel ? t('tools:fold.vertex.ridge', 'Ridge') : t('tools:fold.vertex.emergent', 'Fourth crease');
  // A swivel's two ridges by name, as its step's row names them: there are only ever two.
  const named = swivel && vertex.ridge && vertex.fourths > 0 ? swivelRidgeName(t, vertex.ridge) : undefined;
  const stepper = choiceStepper(t, label, vertex.fourth, vertex.fourths, verbs.stepEmergent, readOnly, named);
  if (stepper) return stepper;
  const still = (name: string) => ({ label: name, disabled: true, run: () => undefined });
  return {
    label,
    value:
      vertex.fourths === 1
        ? (named ?? t('tools:fold.reverse.ofCount', '{{index}} of {{total}}', { index: 1, total: 1 }))
        : t('tools:fold.vertex.fourthNone', 'None'),
    previous: still(t('tools:fold.reverse.previous', 'Previous')),
    next: still(t('tools:fold.reverse.next', 'Next')),
  };
}

/**
 * What the fourth crease's stepper says beneath it, in a place kept for it:
 * how many fit with this paper staying put — and when none does, the change
 * that helps: other paper to stay, or, when no paper staying would do,
 * other picks. A swivel's: how many of its ridges fit.
 */
function emergentNote(t: TFunction, vertex: FoldVertexWindowView, host: FoldToolHost): string {
  const { fourths } = vertex;
  if (vertex.tool === 'swivel') {
    if (fourths >= 2) return t('tools:fold.vertex.ridgesBoth', 'Either ridge lets it fold flat: step to the other.');
    if (fourths === 1) return t('tools:fold.vertex.ridgesOne', 'Only this ridge lets it fold flat.');
    return t('tools:fold.vertex.ridgesNone', 'Neither ridge lets it fold flat: the notice below says why.');
  }
  if (fourths === 0 && vertex.fourthElsewhere === false) {
    return host.coarse
      ? t(
          'tools:fold.vertex.noFourthAnywhereTouch',
          'No fourth crease fits these creases, whichever paper stays: tap Cancel and pick again.'
        )
      : t(
          'tools:fold.vertex.noFourthAnywhere',
          'No fourth crease fits these creases, whichever paper stays: press Esc and pick again.'
        );
  }
  if (fourths === 0) {
    return host.coarse
      ? t('tools:fold.vertex.noFourthTouch', 'No fourth crease fits with this paper staying put: tap other paper to stay.')
      : t('tools:fold.vertex.noFourth', 'No fourth crease fits with this paper staying put: click other paper to stay.');
  }
  return t('tools:fold.vertex.fourthsFit', {
    count: fourths,
    defaultValue_one: 'One fourth crease fits with this paper staying put.',
    defaultValue_other: '{{count}} fourth creases fit with this paper staying put.',
  });
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
 * How a petal fold's hinge, or a swivel's target, is named: a segmented
 * control of two, each saying in its tooltip what is clicked. Null for the
 * other folds.
 */
function lineByControl(
  t: TFunction,
  vertex: FoldVertexWindowView,
  verbs: FoldToolWindowVerbs,
  readOnly: boolean
): FoldKindChoice<FoldLineBy> | null {
  const { tool } = vertex;
  if (tool !== 'petal' && tool !== 'swivel') return null;
  const option = (value: FoldLineBy) => {
    const petal = tool === 'petal';
    const short =
      value === 'crease'
        ? petal
          ? t('tools:fold.vertex.lineBy.hingeCrease', 'Hinge crease')
          : t('tools:fold.vertex.lineBy.creaseOrEdge', 'Crease or edge')
        : petal
          ? t('tools:fold.vertex.lineBy.twoEndpoints', 'Two endpoints')
          : t('tools:fold.vertex.lineBy.twoPoints', 'Two points');
    const label =
      value === 'crease'
        ? petal
          ? t('tools:fold.vertex.lineBy.hingeCreaseHelp', 'Click a precrease already across the flap')
          : t('tools:fold.vertex.lineBy.creaseOrEdgeHelp', 'Click a crease or an edge already there')
        : petal
          ? t('tools:fold.vertex.lineBy.twoEndpointsHelp', 'Click the hinge’s two ends: the fold creases it')
          : t('tools:fold.vertex.lineBy.twoPointsHelp', 'Click two points on the line');
    return { value, short, label, disabled: false, reason: null };
  };
  return {
    label: tool === 'petal' ? t('tools:fold.vertex.lineBy.hinge', 'Hinge') : t('tools:fold.vertex.lineBy.target', 'Lands on'),
    value: vertex.lineBy ?? 'crease',
    options: FOLD_LINE_BY.map(option),
    disabled: readOnly || !verbs.setVertexLineBy,
    note: null,
    set: (lineBy) => verbs.setVertexLineBy?.(lineBy),
  };
}

/** What the fold will do, said under the direction while it is previewed: a petal fold's creases, a swivel's vertex. */
function previewNote(t: TFunction, vertex: FoldVertexWindowView): string | null {
  if (vertex.tool === 'petal') return vertex.petalScores ? petalScoresNote(t, vertex.petalScores) : null;
  if (vertex.tool === 'swivel') {
    return vertex.described
      ? t(
          'tools:fold.vertex.note.swivelVertex',
          'The creases meet at the dot: the pivot, moved onto the line halfway between the edge and the line it lands on. The bold line is where the edge lands; the lit paper moves, the brightest turning in place.'
        )
      : null;
  }
  return preconditionNote(t, vertex.tool);
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
  const { setVertexDirection, resetSquashTarget } = verbs;
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
    lineBy: lineByControl(t, vertex, verbs, readOnly),
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
    emergent: fan && located ? fourthStepper(t, vertex, verbs, readOnly) : null,
    emergentNote: fan && located ? emergentNote(t, vertex, host) : null,
    // A rabbit ear's layers; a swivel by its edge folds every layer at its vertex.
    layers:
      tool === 'rabbit-ear' && located
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
    order: located
      ? choiceStepper(t, t('tools:fold.reverse.order', 'Layer order'), vertex.order, vertex.orders, verbs.stepOrder, readOnly)
      : null,
    note: clicked ? previewNote(t, vertex) : preconditionNote(t, tool),
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
    const controls = vertexControls(t, vertex, verbs, readOnly, host, false);
    return {
      phase: 'locate',
      title,
      meta: settingsMeta(t, controls.lineBy ? 2 : 1),
      instructions: locateInstructions(t, view, vertex, host),
      lineMode: null,
      kind: null,
      movingSide: null,
      layers: null,
      refusal: null,
      divide: null,
      vertex: controls,
      footer: null,
    };
  }
  const controls = vertexControls(t, vertex, verbs, readOnly, host, true);
  const settings = [controls.direction, controls.lineBy, controls.target, controls.emergent, controls.layers, controls.order];
  const refusal = preview.refused
    ? foldRefusalNotice(
        t,
        preview.refused,
        {
          kind: 'vertex',
          readOnly,
          // A vertex fold shows no section: no chips number its flaps.
          ...sectionFlapNames(null),
          vertex: {
            tool,
            ...(vertex.emergentNumber ? { emergentNumber: vertex.emergentNumber } : {}),
            ...(tool === 'petal' && vertex.lineBy ? { hinge: vertex.lineBy } : {}),
            // The tool makes a swivel by its edge.
            ...(tool === 'swivel' ? { swivel: 'edge' as const } : {}),
          },
        },
        verbs
      )
    : null;
  return {
    phase: 'preview',
    title,
    meta: settingsMeta(t, settings.filter(Boolean).length),
    instructions: previewInstructions(t, vertex, host, view, (refusal?.actions.length ?? 0) > 0),
    lineMode: null,
    kind: null,
    movingSide: null,
    layers: null,
    refusal,
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
