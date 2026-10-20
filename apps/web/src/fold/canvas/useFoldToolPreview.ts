import { useFoldAxiomCandidates } from './useFoldAxiomCandidates';
import { buildPleatStep, pleatLines } from '../tools/pleat/pleatStep';
import type { FoldCrimpLines } from '../tools/crimp/crimpStep';
import { useFoldRepeatTool, type FoldRepeatTool } from '../repeat/useFoldRepeatTool';
import { useFoldOrderResolution, type FoldOrderResolution } from '../orders/useFoldOrderResolution';
import { useFoldUnfoldTool, type FoldUnfoldTool } from '../return/useFoldUnfoldTool';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldRefused } from '../../analytics';
import { reportError } from '../../monitoring';
import type { FoldChoices, FoldOp } from '../document/foldSequenceDocument';
import { foldPreviewWants } from '../engine/foldEnginePreview';
import type { FoldRootSectionHint } from '../engine/foldEngineRoots';
import type {
  FoldActionGeometry,
  FoldAnalysis,
  FoldAxiomCandidate,
  FoldAxiomLine,
  FoldCrossSection,
  FoldEngineRefused,
  FoldScene,
  FoldStateSummary,
  FoldStepSummarised,
} from '../engine/foldEngineWire';
import { foldStepInputKey } from '../session/foldSessionEngine';
import {
  FOLD_PINCH_LENGTH_QUERY,
  FOLD_SCENE_QUERY,
  FOLD_STEP_SUMMARY_QUERY,
  foldActionQuery,
} from '../session/foldStateQueries';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { axiomLineOfPicks, locate, buildFoldStep, type FoldStepBuild } from '../tools/foldStepBuilder';
import { isFoldKind, isSinkTool, isVertexTool, usesLineMode } from '../tools/foldToolCatalog';
import { lineModeInput } from '../tools/foldToolRegistry';
import { rotateStepOp } from '../tools/rotate/rotateTool';
import {
  FOLD_EVERY_LAYER,
  foldToolInputKey,
  picksAlongLine,
  type FoldResolvedSeed,
  type FoldSeededToolState,
  type FoldToolState,
} from '../tools/foldToolState';
import { foldExtentState, type FoldExtentState } from '../tools/precrease/precreaseExtent';
import { lineSideKeyOf } from '../tools/topFlapSeed';
import { foldAlongLine, type FoldAlongLine } from './foldAlongLine';
import type { FoldCompoundStepAnswer } from './useFoldCompoundAsk';
import { useFoldCrimpStep, type FoldCrimpPreview } from './useFoldCrimpStep';
import { useFoldLineSection } from './useFoldLineSection';
import { useFoldReverseStep, type FoldReversePreview } from './useFoldReverseStep';
import { useFoldSinkStep, type FoldSinkPreview } from './useFoldSinkStep';
import { tuckRefusedWithFlaps, useFoldTuckStep, type FoldTuckPreview } from './useFoldTuckStep';
import { useFoldVertexStep, type FoldVertexPreview } from './vertex/useFoldVertexStep';
import type { FoldStateView } from './useFoldStateView';

/** The step a fold tool previews and commits: the document's op and choices, keyed as the session keys them. */
export interface FoldToolStep {
  op: FoldOp;
  choices?: FoldChoices;
  key: string;
}

/** A previewed fold's landed state, as the crease-pattern pane draws it. */
export interface FoldLandedPreview {
  scene: FoldScene;
  summary: FoldStateSummary;
  /** The landed state's edge ids the fold added: drawn as its instruction. */
  added: ReadonlySet<number>;
}

/**
 * A precrease of part of its line, while it is being made: how far along its
 * points are, and its line ℓ on each pane, where those points are clicked
 * and drawn (`foldAlongLine`). Null for any other fold, for the whole line,
 * and before the line is located.
 */
export interface FoldExtentPreview {
  state: FoldExtentState;
  /** ℓ on the folded pane and on the crease pattern. */
  along: { folded: FoldAlongLine; creasePattern: FoldAlongLine };
}

/** Everything the canvas knows of the fold the tools describe, tier by tier (plan D14). */
export interface FoldToolPreview {
  pleatLines?: FoldCrimpLines | null;
  swivelLine?: NonNullable<FoldToolState['swivelFirst']> | null;
  orderResolution?: FoldOrderResolution | null;
  /** The axiom's roots for the picks, once the engine has named them; null for no axiom, or not yet. */
  candidates: readonly FoldAxiomCandidate[] | null;
  rootLine?: 'first' | 'second';
  build: FoldStepBuild;
  /**
   * The seed every step is built with: the tools' own, or its default flap
   * resolved against the section at the line (`useFoldLineSection`). Null
   * while that section is still being asked, when there is no step yet.
   */
  seed: FoldResolvedSeed | null;
  /** What a commit appends; null while nothing is located. */
  step: FoldToolStep | null;
  /** Tier 2: what moves. */
  analysis: FoldAnalysis | null;
  /** Tier 2: the layers at the line, with their flaps. */
  section: FoldCrossSection | null;
  /** The fold's picture on the state on screen: its line and its arrow. */
  action: FoldActionGeometry | null;
  /** Tier 3: the state it lands, once it has. */
  landed: FoldLandedPreview | null;
  /** Why it does not land; null while it does, or has not been asked. */
  refused: FoldEngineRefused | null;
  /** Tier 3 is in flight: nothing to commit yet. */
  landing: boolean;
  /** The reverse tool's: the tip as the engine described it, and the kind, opening and order taken. */
  reverse: FoldReversePreview | null;
  /** The crimp tool's: its tip at ℓ1 and both lines, and the kind, opening and order taken. */
  crimp: FoldCrimpPreview | null;
  /** The tuck tool's: the layers listed to tuck against, and the target and order taken. */
  tuck: FoldTuckPreview | null;
  /** A vertex tool's: its flap, line or fan as the engine described it, and the choices taken. */
  vertex: FoldVertexPreview | null;
  /** The sink tools': the point or sunk points as the engine described them, and the pocket and order taken. */
  sink: FoldSinkPreview | null;
  /** A partial precrease's: its points along the line, and the line on each pane. */
  extent: FoldExtentPreview | null;
  /**
   * The Rotate tool's: the state on screen as the rotation lands it — the
   * same model, seen turned — which the folded pane shows in its place.
   * Null for any other tool, and until it has landed. The crease pattern,
   * front up, does not turn: a rotation leaves `landed` null.
   */
  turned: FoldScene | null;
  /**
   * Unfold to step's, while it is in hand (`fold/return/useFoldUnfoldTool`):
   * its step is this preview's, previewed as any tool's.
   */
  unfold?: FoldUnfoldTool | null;
  /**
   * Repeat's, while it is in hand (`fold/repeat/useFoldRepeatTool`): it
   * prepares its own step and asks the session to preview it; `step` is the
   * one it previews, so its landed state is read here as any tool's is.
   */
  repeat?: FoldRepeatTool | null;
}

const sectionKey = (analysis: FoldAnalysis) => `${analysis.line.n[0]},${analysis.line.n[1]},${analysis.line.d}:${analysis.side}`;

/** The line and the side a built step folds, as the tools located them: what a new seed leaves alone. */
const lineSideKey = (build: FoldStepBuild) => (build.status === 'built' ? lineSideKeyOf(build.sceneLine, build.movingSign) : null);

/** The axiom line a fold's picks locate, once every click of it is in. */
function axiomLineOf({ tool, lineMode, picks, swivelInput }: Pick<FoldToolState, 'tool' | 'lineMode' | 'picks' | 'swivelInput'>): FoldAxiomLine | null {
  return usesLineMode(tool, swivelInput) ? axiomLineOfPicks(lineMode, picks.slice(0, lineModeInput(lineMode).steps.length)) : null;
}

/** No step built: a vertex fold builds none of a fold along a line's. */
const UNLOCATED: FoldStepBuild = { status: 'unlocated' };

/**
 * The fold the tools describe, through the session's pipeline (plan D14):
 * the axiom's roots, then the step built from the picks (`buildFoldStep`),
 * analysed (what moves), sectioned (the layers at the line), pictured (its
 * line and arrow) and previewed (the landed state), each asked once per
 * change and each answer kept only while it is for the step on screen.
 *
 * The session owns the preview and the analysis — the latest request wins,
 * and a move of the cursor lets them go — so a commit finds the very state
 * the folder saw. This hook asks for them and reads them back.
 */
export function useFoldToolPreview(
  session: FoldSessionSurface,
  view: FoldStateView,
  tools: FoldToolState
): FoldToolPreview {
  const { index } = view;
  // The session's verbs keep their identity across renders; the surface
  // object does not (its snapshot fields change with every answer), so the
  // effects below depend on the verbs alone, or each answer would ask again.
  const { analyse, preview, cancel, withCursor, query, peek } = session;
  const state = session.cursor.state;
  const stateKey = state ? `${state.generation}:${state.id}` : null;

  // --- The axiom's roots, once per set of picks on a state: a root stepped
  // through, a flap hovered or a side swapped asks nothing. The picks change
  // identity only with a pick or a restart.
  const { tool, lineMode, picks, swivelInput } = tools;
  const axiomLine = useMemo(() => axiomLineOf({ tool, lineMode, picks, swivelInput }), [tool, lineMode, picks, swivelInput]);
  // A fold that takes the top flap asks the layers at the root it takes next
  // (`useFoldLineSection`): they are asked with the roots.
  const viewTransform = index?.scene.view_transform ?? null;
  const hinted = viewTransform !== null && (isFoldKind(tool) || tool === 'tuck') && !tools.override;
  const sectionHint = useMemo<FoldRootSectionHint | null>(
    () => (hinted && viewTransform ? { viewTransform, root: tools.root, swapped: tools.swapped } : null),
    [hinted, viewTransform, tools.root, tools.swapped]
  );
  const ownRoots = useFoldAxiomCandidates(session, axiomLine, sectionHint);
  const candidate = ownRoots?.candidates?.[tools.root] ?? ownRoots?.candidates?.[0] ?? null;
  const { secondLineMode } = tools;
  const secondAxiom = useMemo(() => tool === 'pleat'
    ? axiomLineOfPicks(secondLineMode, picks.slice(lineModeInput(lineMode).steps.length)) : null,
    [tool, secondLineMode, picks, lineMode]);
  const secondRoots = useFoldAxiomCandidates(session, secondAxiom);
  const secondCandidate = secondRoots?.candidates?.[tools.secondRoot ?? 0] ?? secondRoots?.candidates?.[0] ?? null;
  // Keep the mountain's root picker available until valley picks begin.
  // Once they do, only the valley's independently stored choice can change.
  const rootLine = tool === 'pleat' && picks.length > lineModeInput(lineMode).steps.length ? 'second' : 'first';
  const candidates = (rootLine === 'second' ? secondRoots : ownRoots)?.candidates ?? null;

  // --- The section at the located line, and the seed resolved against it:
  // a fold that takes the top flap or material picked on the CP has no
  // step until the section says which flap that is. Every step below is
  // built with the resolved seed, so what is previewed is what commits.
  const lineSection = useFoldLineSection(session, index, tools, candidate, secondCandidate);
  const findingSeed = lineSection.seed === null;
  const resolvedSeed = lineSection.seed ?? FOLD_EVERY_LAYER;
  const seeded = useMemo<FoldSeededToolState>(() => ({ ...tools, seed: resolvedSeed }), [tools, resolvedSeed]);

  // --- The step, built from the picks and every choice made since: a
  // plain fold's at once, a compound fold's once the engine has described
  // it — a reverse fold's tip (`useFoldReverseStep`), a crimp's
  // (`useFoldCrimpStep`), a tuck's targets (`useFoldTuckStep`), a sink's
  // point (`useFoldSinkStep`).
  const reverseStep = useFoldReverseStep(session, index, seeded, candidate, tools.tool === 'inside-reverse' && !findingSeed);
  const crimpStep = useFoldCrimpStep(session, index, seeded, candidate, tools.tool === 'crimp');
  // A tuck's targets are asked with its seed: not until its top flap is known.
  const tuckStep = useFoldTuckStep(session, index, seeded, candidate, tools.tool === 'tuck' && !findingSeed);
  const sinkStep = useFoldSinkStep(session, index, seeded, candidate, isSinkTool(tools.tool));
  const compoundStep: FoldCompoundStepAnswer | null =
    tools.tool === 'inside-reverse'
      ? reverseStep
      : tools.tool === 'crimp'
        ? crimpStep
        : tools.tool === 'tuck'
          ? tuckStep
          : isSinkTool(tools.tool)
            ? sinkStep
            : null;
  // A vertex fold's, once the engine has described its flap, line or fan.
  const vertexing = isVertexTool(tools.tool);
  const locatedSwivel = useMemo(() => index && tool === 'swivel' && swivelInput === 'creases'
    ? locate({ lineMode, picks, candidate, swapped: false, seed: FOLD_EVERY_LAYER }, index) : null,
    [index, tool, swivelInput, lineMode, picks, candidate]);
  const swivelLine = useMemo(() => locatedSwivel && !('status' in locatedSwivel)
    ? { line: locatedSwivel.line, ...(locatedSwivel.choices?.root ? { root: locatedSwivel.choices.root } : {}), sceneLine: locatedSwivel.sceneLine } : null,
    [locatedSwivel]);
  const savedSwivelLine = useMemo(() => swivelLine ? { line: swivelLine.line, ...(swivelLine.root ? { root: swivelLine.root } : {}) } : undefined, [swivelLine]);
  const vertexStep = useFoldVertexStep(session, index, tools, vertexing, savedSwivelLine);
  // A precrease of part of its line: its points along the line, and a pinch's
  // length, which the engine names for the state's sheet.
  const along = picksAlongLine(tools);
  const pinchLength = usePinchLength(session, along && tools.extent === 'pinch');
  const extentState = useMemo(
    () => (along ? foldExtentState(tools.extent, tools.extentPicks, pinchLength) : WHOLE),
    [along, tools.extent, tools.extentPicks, pinchLength]
  );
  const plainBuild = useMemo<FoldStepBuild>(() => {
    if (index && seeded.tool === 'pleat') return buildPleatStep({ ...seeded, candidate, secondCandidate }, index);
    if (!index || !isFoldKind(seeded.tool)) return { status: 'unlocated' };
    return buildFoldStep(
      {
        kind: seeded.tool,
        lineMode: seeded.lineMode,
        picks: seeded.picks,
        candidate,
        swapped: seeded.swapped,
        seed: seeded.seed,
        precreaseDirection: seeded.precreaseDirection,
        ...(extentState.status === 'ready' ? { extent: extentState.extent } : {}),
      },
      index
    );
  }, [index, seeded, candidate, secondCandidate, extentState]);
  // While its points are still being clicked, the whole line's build stands
  // in for it: what moves and the layers at the line are the whole
  // precrease's (the engine marks through the same layers), but nothing is
  // previewed or committed until the extent is whole.
  const extentPending = extentState.status === 'incomplete' || extentState.status === 'length';
  const pleatDrawing = useMemo(() => index && tools.tool === 'pleat' ? pleatLines({ ...seeded, candidate, secondCandidate }, index) : null, [index, tools.tool, seeded, candidate, secondCandidate]);
  const compounding = compoundStep !== null || tools.tool === 'pleat';
  const build = compoundStep ? compoundStep.build : vertexing ? UNLOCATED : plainBuild;
  const vertexBuilt = vertexStep.step;
  // The sequence tools: Unfold to step's step is built from its target, from
  // the moment it is in hand; Repeat prepares its own and previews it (a line
  // drawn on the canvas read through the view of the state it was drawn on).
  const unfold = useFoldUnfoldTool(session, tools);
  const repeat = useFoldRepeatTool(session, tools, viewTransform);
  const unfolding = tools.tool === 'unfold-to';
  const repeating = tools.tool === 'repeat';
  const unfoldStep = unfold?.step ?? null;
  const repeatStep = repeat?.step ?? null;
  // Rotate's step is its rotation, from the moment it is in hand: it locates nothing.
  const rotating = tools.tool === 'rotate';
  const rotation = tools.rotation;
  const baseStep = useMemo<FoldToolStep | null>(() => {
    if (repeating) return repeatStep;
    if (unfolding) return unfoldStep;
    if (rotating) {
      const op = rotateStepOp(rotation);
      return { op, key: foldStepInputKey({ op }) };
    }
    if (extentPending) return null;
    // A plain fold's override is the whole step; a compound fold's is its
    // line, which its build already folds along. A vertex fold's step is
    // its own, built from the engine's answers.
    const override = compounding || vertexing ? null : tools.override;
    // Until the top flap is known, the build is every layer's, which is not what will fold.
    const built = build.status === 'built' && !findingSeed ? { op: build.op, choices: build.choices } : null;
    const chosen = override ?? (vertexing ? vertexBuilt : built);
    if (!chosen) return null;
    return { op: chosen.op, ...(chosen.choices ? { choices: chosen.choices } : {}), key: foldStepInputKey(chosen) };
  }, [repeating, repeatStep, unfolding, unfoldStep, rotating, rotation, extentPending, compounding, vertexing, tools.override, build, findingSeed, vertexBuilt]);
  const resolvedOrders = useFoldOrderResolution(session, baseStep, foldToolInputKey(tools));
  const step = resolvedOrders.step;
  // The located line on each pane, while points are clicked along it.
  const sceneLine = along && plainBuild.status === 'built' ? plainBuild.sceneLine : null;
  const lineKey = sceneLine ? `${sceneLine.n[0]},${sceneLine.n[1]},${sceneLine.d}` : null;
  const alongPanes = useMemo(
    () =>
      index && sceneLine
        ? { folded: foldAlongLine(index, sceneLine, 'folded'), creasePattern: foldAlongLine(index, sceneLine, 'crease-pattern') }
        : null,
    // The line is read through its key: an equal line must not index again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, lineKey]
  );
  const extent = useMemo<FoldExtentPreview | null>(
    () => (alongPanes ? { state: extentState, along: alongPanes } : null),
    [alongPanes, extentState]
  );

  // --- Tier 2 and 3, asked whenever the step changes; let go when there is none.
  // A rotation moves no paper: nothing to analyse, no line or arrow to
  // picture. The folded pane shows the model turned instead (`turned`). A
  // vertex fold folds along no one line: there is no plain fold's analysis
  // to ask of it (its tool draws its own creases). Its picture — along the
  // one crease that tells it best — it has, like every fold
  // (`foldPreviewWants`, which a preview's turn in the worker reads too).
  const wants = step ? foldPreviewWants(step.op) : null;
  // The picture is a pure query on the state on screen: an order
  // resolution's turn may have answered it already (`FoldSession.resolveOrders`).
  const actionQuery = useMemo(
    () => (step && wants?.action ? foldActionQuery(step.op, step.choices) : null),
    // The step is read through its key: an equal step is the same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step?.key, wants?.action]
  );
  const heldAction = state && actionQuery ? peek(state, actionQuery) : null;
  const asked = useRef<string | null>(null);
  const [action, setAction] = useState<{ key: string; action: FoldActionGeometry | null } | null>(null);
  useEffect(() => {
    // Repeat asks for its previews itself (`useFoldRepeatTool`): this asks for none, and lets none go.
    if (repeating) { asked.current = null; return undefined; }
    if (!step) {
      if (asked.current !== null) cancel();
      asked.current = null;
      return undefined;
    }
    asked.current = step.key;
    void preview(step.op, step.choices);
    if (wants?.analysis) void analyse(step.op, step.choices);
    if (!actionQuery || !state || peek(state, actionQuery)) return undefined;
    let current = true;
    void query(state, actionQuery).then(
      (answer) => {
        if (!current || answer.status !== 'answered') return;
        setAction({ key: step.key, action: answer.value.status === 'ok' ? answer.value.action : null });
      },
      (error: unknown) => reportError(error, { surface: 'fold:action' })
    );
    return () => {
      current = false;
    };
    // The step is read through its key: an equal step must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeating, analyse, preview, cancel, query, actionQuery, step?.key, stateKey]);
  const shownAction = heldAction
    ? heldAction.value.status === 'ok'
      ? heldAction.value.action
      : null
    : action && step && action.key === step.key
      ? action.action
      : null;

  // --- With no step, a compound tool's refused fold may still show its
  // layers (`FoldCompoundStepAnswer.layers`), and a precrease whose extent's
  // points are still being clicked the whole line's: asked what it moves,
  // after the effect above has let the last step go, and never previewed.
  const extentLayers =
    extentPending && !findingSeed && plainBuild.status === 'built' ? { op: plainBuild.op, choices: plainBuild.choices } : null;
  const layersAsk = step ? null : (compoundStep?.layers ?? extentLayers);
  const layersKey = layersAsk ? foldStepInputKey(layersAsk) : null;
  useEffect(() => {
    if (layersAsk) void analyse(layersAsk.op, layersAsk.choices);
    // The ask is read through its key: an equal ask must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyse, layersKey, stateKey]);
  const analysedKey = step?.key ?? layersKey;

  const analysisSlot = session.analysis;
  const analysisFor =
    analysedKey !== null &&
    analysisSlot.status !== 'idle' &&
    foldStepInputKey({ op: analysisSlot.op, choices: analysisSlot.choices }) === analysedKey
      ? analysisSlot
      : null;
  const analysis = analysisFor?.status === 'analysed' ? analysisFor.analysis : null;

  // --- The section, once per line and side on a state: a new seed of the
  // same line asks nothing. A fold that takes the top flap has it from the
  // line as soon as it is located (`useFoldLineSection`); any other, and a
  // fix's line, from what its step's analysis says it folds along.
  const lineSide = tools.override ? null : lineSideKey(build);
  const [section, setSection] = useState<{
    key: string;
    lineSide: string | null;
    section: FoldCrossSection;
  } | null>(null);
  const wantedSection = analysis && stateKey ? `${stateKey}|${sectionKey(analysis)}` : null;
  const locatedSection = lineSection.section;
  useEffect(() => {
    if (locatedSection || !analysis || wantedSection === null || section?.key === wantedSection) return undefined;
    let current = true;
    void withCursor((engine, at) => engine.crossSection(at, analysis.line, analysis.side)).then(
      (answer) => {
        if (!current || answer.status !== 'answered' || answer.value.status !== 'ok') return;
        setSection({ key: wantedSection, lineSide, section: answer.value.section });
      },
      (error: unknown) => reportError(error, { surface: 'fold:cross-section' })
    );
    return () => {
      current = false;
    };
  }, [withCursor, analysis, wantedSection, section?.key, lineSide, locatedSection]);
  // A new seed of the same line and side is the same section: it stays on
  // show while that seed is analysed, so the picker the folder is pressing
  // (and the focus in it) is not taken away and put back under them.
  const analysing = analysedKey !== null && (analysisFor === null || analysisFor.status === 'working');
  const shownSection =
    locatedSection ??
    (section &&
    (section.key === wantedSection ||
      (analysing && lineSide !== null && section.lineSide === lineSide && section.key.startsWith(`${stateKey}|`)))
      ? section.section
      : null);

  // --- The landed state's scene and its added creases, for the crease-pattern pane.
  // Asked as every surface asks them (`FoldSession.query`), so a commit of
  // this preview finds the committed step's scene and summary already in.
  const pending = session.pending;
  const pendingFor = step && pending.status !== 'idle' && foldStepInputKey(pending.request) === step.key ? pending : null;
  const landedState = pendingFor?.status === 'landed' ? pendingFor : null;
  const [landed, setLanded] = useState<{ key: string; landed: FoldLandedPreview } | null>(null);
  const landedKey = landedState ? `${landedState.state.generation}:${landedState.state.id}` : null;
  // Answered in the preview's own turn, as a preview's always are: shown on
  // the render that brings the landed state, without asking.
  const heldScene = landedState ? peek(landedState.state, FOLD_SCENE_QUERY) : null;
  const heldSummary = landedState ? peek(landedState.state, FOLD_STEP_SUMMARY_QUERY) : null;
  // The step the preview is folded from: what a step with no summary of its own added is what came after it.
  const parentStep = session.cursor.summary?.step ?? null;
  const heldLanded = useMemo(
    () =>
      landedState && heldScene && heldSummary
        ? landedPreviewOf(landedState.summary, heldScene.value, heldSummary.value, parentStep)
        : null,
    [landedState, heldScene, heldSummary, parentStep]
  );
  useEffect(() => {
    if (!landedState || landedKey === null || heldLanded) return undefined;
    let current = true;
    const { state: handle, summary } = landedState;
    void Promise.all([query(handle, FOLD_SCENE_QUERY), query(handle, FOLD_STEP_SUMMARY_QUERY)]).then(
      ([scene, stepSummary]) => {
        if (!current || scene.status !== 'answered') return;
        setLanded({
          key: landedKey,
          landed: landedPreviewOf(summary, scene.value, stepSummary.status === 'answered' ? stepSummary.value : null, parentStep),
        });
      },
      (error: unknown) => reportError(error, { surface: 'fold:landed-preview' })
    );
    return () => {
      current = false;
    };
  }, [query, landedState, landedKey, heldLanded, parentStep]);

  // A tuck no layer takes is offered its flaps once its layers are analysed.
  const compoundRefused = tools.tool === 'tuck' ? tuckRefusedWithFlaps(tuckStep.refused, analysis) : compoundStep?.refused;
  // A repeat's refusals are its own, in Repeat's words, and counted with its op kind (`useFoldRepeatTool`).
  const refused = repeating ? null :
    resolvedOrders.refused ??
    (build.status === 'refused' ? build.refused : null) ??
    ownRoots?.refused ?? secondRoots?.refused ??
    compoundRefused ??
    (locatedSwivel && 'status' in locatedSwivel ? locatedSwivel : null) ??
    vertexStep.refused ??
    (analysisFor?.status === 'refused' ? analysisFor.refused : null) ??
    (pendingFor?.status === 'refused' ? pendingFor.refused : null);

  // Each refusal shown is counted once, by what the tools asked for — a
  // vertex fold or a tuck refused before any step is built has no step to
  // key it by — and counted again once it has gone and is shown anew: the
  // same click after Escape is another refusal seen.
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!refused) {
      counted.current = null;
      return;
    }
    const key = `${stateKey ?? ''}|${foldToolInputKey(tools)}:${refused.refusal.code}`;
    if (counted.current === key) return;
    counted.current = key;
    trackFoldRefused(refused.refusal.code);
  }, [refused, stateKey, tools]);

  const landedPreview = heldLanded ?? (landed && landed.key === landedKey ? landed.landed : null);
  return {
    pleatLines: pleatDrawing,
    swivelLine,
    orderResolution: resolvedOrders.resolution,
    candidates,
    rootLine,
    build,
    seed: lineSection.seed,
    step,
    analysis,
    section: shownSection,
    action: shownAction,
    // A rotation's landed state is the folded pane's, not the crease pattern's: the pattern does not turn.
    landed: rotating ? null : landedPreview,
    turned: rotating ? (landedPreview?.scene ?? null) : null,
    refused,
    landing: step !== null && (pendingFor === null || pendingFor.status === 'working'),
    reverse: reverseStep.reverse,
    crimp: crimpStep.crimp,
    tuck: tuckStep.tuck,
    vertex: vertexStep.vertex,
    sink: sinkStep.sink,
    extent,
    unfold,
    repeat,
  };
}

const WHOLE: FoldExtentState = { status: 'whole' };

/** A landed preview as the crease-pattern pane draws it: the creases the step adds or reverses are its instruction. */
export function landedPreviewOf(
  summary: FoldStateSummary,
  scene: FoldScene,
  stepSummary: FoldStepSummarised | null,
  parentStep: number | null = null
): FoldLandedPreview {
  const diff = stepSummary?.summary ?? null;
  // A step the engine keeps no summary for — a repeat, whose operations the engine counts one by one — adds
  // the creases made after the step it is folded from (`parentStep`); else, the ones made at its own.
  const made = (at: number) => (parentStep === null ? at === summary.step : at > parentStep);
  const added = diff
    ? [...diff.diff.added, ...diff.diff.reversed]
    : scene.creases.filter((crease) => crease.letter !== null && made(crease.made_at)).map((crease) => crease.id);
  return { scene, summary, added: new Set(added) };
}

/**
 * The pinch length the engine offers on the sheet of the state on screen
 * (`FOLD_PINCH_LENGTH_QUERY`), asked once per state while a pinch is being
 * made: null until it answers, and while none is.
 */
function usePinchLength(session: FoldSessionSurface, wanted: boolean): number | null {
  const { query } = session;
  const handle = wanted ? session.cursor.state : null;
  const key = handle ? `${handle.generation}:${handle.id}` : null;
  const [length, setLength] = useState<{ key: string; length: number } | null>(null);
  useEffect(() => {
    if (!handle || key === null || length?.key === key) return undefined;
    let current = true;
    void query(handle, FOLD_PINCH_LENGTH_QUERY).then(
      (answer) => {
        if (current && answer.status === 'answered') setLength({ key, length: answer.value });
      },
      (error: unknown) => reportError(error, { surface: 'fold:pinch-length' })
    );
    return () => {
      current = false;
    };
    // The handle is read through its key: an equal state must not ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, key, length?.key]);
  return length && length.key === key ? length.length : null;
}
