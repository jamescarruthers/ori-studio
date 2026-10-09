import { useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldChoiceOffered, trackFoldRefused } from '../../analytics';
import { reportError } from '../../monitoring';
import type { FoldChoices, FoldOp } from '../document/foldSequenceDocument';
import type {
  FoldActionGeometry,
  FoldAnalysis,
  FoldAxiomCandidate,
  FoldAxiomLine,
  FoldCrossSection,
  FoldEngineRefused,
  FoldScene,
  FoldStateSummary,
  FoldStepSummary,
} from '../engine/foldEngineWire';
import { canonicalJson } from '../document/foldDigest';
import { foldStepInputKey } from '../session/foldSessionEngine';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { axiomLineOfPicks, buildFoldStep, clientRefusal, type FoldStepBuild } from '../tools/foldStepBuilder';
import { isFoldKind } from '../tools/foldToolCatalog';
import type { FoldToolState } from '../tools/foldToolState';
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

/** Everything the canvas knows of the fold the tools describe, tier by tier (plan D14). */
export interface FoldToolPreview {
  /** The axiom's roots for the picks, once the engine has named them; null for no axiom, or not yet. */
  candidates: readonly FoldAxiomCandidate[] | null;
  build: FoldStepBuild;
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
}

const sectionKey = (analysis: FoldAnalysis) => `${analysis.line.n[0]},${analysis.line.n[1]},${analysis.line.d}:${analysis.side}`;

/** The line and the side a built step folds, as the tools located them: what a new seed leaves alone. */
const lineSideKey = (build: FoldStepBuild) =>
  build.status === 'built'
    ? `${build.sceneLine.n[0]},${build.sceneLine.n[1]},${build.sceneLine.d}:${build.movingSign}`
    : null;

/** The axiom line a fold tool's picks locate, once every click is in. */
function axiomLineOf(tools: FoldToolState): FoldAxiomLine | null {
  return isFoldKind(tools.tool) ? axiomLineOfPicks(tools.lineMode, tools.picks) : null;
}

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
  const { analyse, preview, cancel, withCursor, withState } = session;
  const state = session.cursor.state;
  const stateKey = state ? `${state.generation}:${state.id}` : null;

  // --- The axiom's roots, once per set of picks on a state.
  const axiomLine = useMemo(() => axiomLineOf(tools), [tools]);
  const axiomKey = axiomLine && stateKey ? `${stateKey}|${canonicalJson(axiomLine)}` : null;
  const [roots, setRoots] = useState<{
    key: string;
    candidates: FoldAxiomCandidate[] | null;
    refused: FoldEngineRefused | null;
  } | null>(null);
  useEffect(() => {
    if (!axiomLine || axiomKey === null) return undefined;
    let current = true;
    void withCursor((engine, at) => engine.axiomCandidates(at, axiomLine)).then(
      (answer) => {
        if (!current || answer.status !== 'answered') return;
        const outcome = answer.value;
        if (outcome.status === 'ok') {
          setRoots({
            key: axiomKey,
            candidates: outcome.candidates,
            // No fold here: worded as the engine words a stored step's root that is gone.
            refused: outcome.candidates.length === 0 ? clientRefusal('no_root') : null,
          });
          if (outcome.candidates.length > 1) trackFoldChoiceOffered('axiom_root', outcome.candidates.length);
        } else {
          setRoots({ key: axiomKey, candidates: null, refused: outcome });
        }
      },
      (error: unknown) => reportError(error, { surface: 'fold:axiom-candidates' })
    );
    return () => {
      current = false;
    };
  }, [withCursor, axiomLine, axiomKey]);
  const ownRoots = roots && roots.key === axiomKey ? roots : null;
  const candidates = ownRoots?.candidates ?? null;
  const candidate = candidates ? (candidates[tools.root] ?? candidates[0] ?? null) : null;

  // --- The step, built from the picks and every choice made since.
  const build = useMemo<FoldStepBuild>(() => {
    if (!index || !isFoldKind(tools.tool)) return { status: 'unlocated' };
    return buildFoldStep(
      {
        kind: tools.tool,
        lineMode: tools.lineMode,
        picks: tools.picks,
        candidate,
        swapped: tools.swapped,
        seed: tools.seed,
        precreaseDirection: tools.precreaseDirection,
      },
      index
    );
  }, [index, tools, candidate]);
  const step = useMemo<FoldToolStep | null>(() => {
    const chosen = tools.override ?? (build.status === 'built' ? { op: build.op, choices: build.choices } : null);
    if (!chosen) return null;
    return { op: chosen.op, ...(chosen.choices ? { choices: chosen.choices } : {}), key: foldStepInputKey(chosen) };
  }, [tools.override, build]);

  // --- Tier 2 and 3, asked whenever the step changes; let go when there is none.
  const asked = useRef<string | null>(null);
  const [action, setAction] = useState<{ key: string; action: FoldActionGeometry | null } | null>(null);
  useEffect(() => {
    if (!step) {
      if (asked.current !== null) cancel();
      asked.current = null;
      return undefined;
    }
    asked.current = step.key;
    void analyse(step.op, step.choices);
    void preview(step.op, step.choices);
    let current = true;
    void withCursor((engine, at) => engine.action(at, step.op, step.choices)).then(
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
  }, [analyse, preview, cancel, withCursor, step?.key, stateKey]);

  const analysisSlot = session.analysis;
  const analysisFor =
    step && analysisSlot.status !== 'idle' && foldStepInputKey({ op: analysisSlot.op, choices: analysisSlot.choices }) === step.key
      ? analysisSlot
      : null;
  const analysis = analysisFor?.status === 'analysed' ? analysisFor.analysis : null;

  // --- The section, once per line and side on a state: a new seed of the same line asks nothing.
  const lineSide = tools.override ? null : lineSideKey(build);
  const [section, setSection] = useState<{
    key: string;
    lineSide: string | null;
    section: FoldCrossSection;
  } | null>(null);
  const wantedSection = analysis && stateKey ? `${stateKey}|${sectionKey(analysis)}` : null;
  useEffect(() => {
    if (!analysis || wantedSection === null || section?.key === wantedSection) return undefined;
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
  }, [withCursor, analysis, wantedSection, section?.key, lineSide]);
  // A new seed of the same line and side is the same section: it stays on
  // show while that seed is analysed, so the picker the folder is pressing
  // (and the focus in it) is not taken away and put back under them.
  const analysing = step !== null && (analysisFor === null || analysisFor.status === 'working');
  const shownSection =
    section &&
    (section.key === wantedSection ||
      (analysing && lineSide !== null && section.lineSide === lineSide && section.key.startsWith(`${stateKey}|`)))
      ? section.section
      : null;

  // --- The landed state's scene and its added creases, for the crease-pattern pane.
  const pending = session.pending;
  const pendingFor = step && pending.status !== 'idle' && foldStepInputKey(pending.request) === step.key ? pending : null;
  const landedState = pendingFor?.status === 'landed' ? pendingFor : null;
  const [landed, setLanded] = useState<{ key: string; landed: FoldLandedPreview } | null>(null);
  const landedKey = landedState ? `${landedState.state.generation}:${landedState.state.id}` : null;
  useEffect(() => {
    if (!landedState || landedKey === null) return undefined;
    let current = true;
    const { state: handle, summary } = landedState;
    void Promise.all([
      withState(handle, (engine, at) => engine.scene(at)),
      withState(handle, (engine, at) => engine.stepSummary(at)),
    ]).then(
      ([scene, stepSummary]) => {
        if (!current || scene.status !== 'answered') return;
        const diff: FoldStepSummary | null =
          stepSummary.status === 'answered' && stepSummary.value.status === 'ok' ? stepSummary.value.summary : null;
        setLanded({
          key: landedKey,
          landed: { scene: scene.value, summary, added: new Set(diff ? [...diff.diff.added, ...diff.diff.reversed] : []) },
        });
      },
      (error: unknown) => reportError(error, { surface: 'fold:landed-preview' })
    );
    return () => {
      current = false;
    };
  }, [withState, landedState, landedKey]);

  const refused =
    (build.status === 'refused' ? build.refused : null) ??
    ownRoots?.refused ??
    (analysisFor?.status === 'refused' ? analysisFor.refused : null) ??
    (pendingFor?.status === 'refused' ? pendingFor.refused : null);

  // Each refusal shown is counted once, by the step it refused.
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!refused) return;
    const key = `${step?.key ?? axiomKey ?? ''}:${refused.refusal.code}`;
    if (counted.current === key) return;
    counted.current = key;
    trackFoldRefused(refused.refusal.code);
  }, [refused, step?.key, axiomKey]);

  return {
    candidates,
    build,
    step,
    analysis,
    section: shownSection,
    action: action && step && action.key === step.key ? action.action : null,
    landed: landed && landed.key === landedKey ? landed.landed : null,
    refused,
    landing: step !== null && (pendingFor === null || pendingFor.status === 'working'),
  };
}
