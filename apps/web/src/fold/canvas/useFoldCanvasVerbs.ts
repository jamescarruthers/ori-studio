import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackFoldChoiceOffered, trackFoldStepAdded } from '../../analytics';
import type { FoldStepAddedOpKind } from '../../analytics';
import { readHeldModifiers } from '../../keyboard/heldModifiers';
import type { TurnKind } from '../../lib/steps/turn';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { shownFoldSequence } from '../../store/workspaceStore/foldState';
import {
  isLockedStep,
  isVertexOp,
  randomFoldId,
  type FoldCrimpOp,
  type FoldDirection,
  type FoldMark,
  type FoldMarkEntry,
  type FoldOp,
  type FoldPlainOp,
  type FoldPrecreaseOp,
  type FoldReverseOp,
  type FoldSequenceDocument,
  type FoldTuckOp,
} from '../document/foldSequenceDocument';
import type { FoldReverseKind } from '../engine/foldEngineReverseWire';
import type { FoldFlap } from '../engine/foldEngineWire';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { wovenIntervalAt } from '../tools/crossSection';
import { isLineTool, type FoldLineModeId, type FoldSecondLineModeId, type FoldToolId } from '../tools/foldToolCatalog';
import { nextStep } from '../tools/foldToolRegistry';
import { steppedTuckTarget } from '../tools/tuck/tuckStep';
import type { FoldUseLineFix } from '../tools/refusalNotice';
import { defaultMovingSign, freeLineThrough, freePicksAlong, movingPoint } from '../tools/foldStepBuilder';
import { foldToolInput, foldToolInputKey, isLocated, type FoldTools, type FoldToolState } from '../tools/foldToolState';
import { isFoldAltLatched } from './foldAltLatch';
import { transformLine } from './foldCanvasGeometry';
import { resolveFoldPick, topSheetPointAt, type FoldHit, type FoldHitRadii, type FoldPaneId } from './foldPicking';
import type { FoldToolPreview } from './useFoldToolPreview';
import type { FoldStateView } from './useFoldStateView';

/** A free point: Alt held, or on a touch screen its latch. */
export function freePointHeld(): boolean {
  return readHeldModifiers().alt || isFoldAltLatched();
}

/**
 * A fold along a located line, whose line a near miss's landmark line can
 * take the place of: a crimp's first line among them.
 */
function isAlongLine(
  op: FoldOp | undefined
): op is FoldPlainOp | FoldPrecreaseOp | FoldReverseOp | FoldCrimpOp | FoldTuckOp {
  return (
    op?.kind === 'valley' ||
    op?.kind === 'mountain' ||
    op?.kind === 'precrease' ||
    op?.kind === 'inside-reverse' ||
    op?.kind === 'outside-reverse' ||
    op?.kind === 'crimp' ||
    op?.kind === 'tuck'
  );
}

/** Every verb the canvas, its window, its rail and its keys share: one path whichever one presses. */
export interface FoldCanvasVerbs {
  selectTool: (id: FoldToolId) => void;
  selectLineMode: (id: FoldLineModeId) => void;
  /** Add a turn as a step of its own, after the step on screen. */
  turn: (turn: TurnKind) => void;
  /** What a click at a point of a pane takes, for the tool's next click. */
  hitTest: (pane: FoldPaneId, at: { x: number; y: number }, radii: FoldHitRadii) => FoldHit | null;
  /** A click landed on a pane. */
  pick: (hit: FoldHit | null) => void;
  /** Fold the other side; whether there was a located line to swap the side of. */
  swapSide: () => boolean;
  toggleFlap: (flap: number) => void;
  hoverFlap: (flap: number | null) => void;
  includeFlaps: (flaps: readonly number[]) => void;
  foldOtherWay: () => void;
  pickFlap: (flap: FoldFlap) => void;
  useLine: (fix: FoldUseLineFix) => void;
  /**
   * Step through the choice the canvas's chooser shows (`foldCanvasChoice`):
   * the layer orders, the ways the tip opens, or the axiom's roots; whether
   * there was more than one to step through.
   */
  stepChoice: (delta: number) => boolean;
  /**
   * Commit the fold previewed; whether there was one to commit. Pressed while
   * the preview is still landing, it commits once it lands (or lets go if it
   * is refused), and says so.
   */
  commit: () => boolean;
  /** Escape's rung: let go of what the tool holds; whether it held anything. */
  cancel: () => boolean;
  /** Clear the Divide-line marks made on the step on screen. */
  clearMarks: () => void;
  // A compound fold's choices, one block per family.
  /** The reverse fold's kind, and a crimp's. */
  setReverseKind: (kind: FoldReverseKind) => void;
  /** Step through the ways the tip opens, and the layer orders listed. */
  stepOpening: (delta: number) => void;
  stepOrder: (delta: number) => void;
  /** How a crimp's second line is located. */
  setSecondLineMode: (mode: FoldSecondLineModeId) => void;
  /** A tuck's direction. */
  setTuckDirection: (direction: FoldDirection) => void;
  /** Step through the layers listed to tuck against. */
  stepTuckTarget: (delta: number) => void;
  /** Tuck against this listed layer instead: a refusal's `tuck_target` fix. */
  tuckTarget: (face: number) => void;
}

/** The verbs, and whether a commit waits for the preview to land. */
export interface FoldCanvasVerbBinding {
  verbs: FoldCanvasVerbs;
  /** Enter was pressed before the preview landed: it commits once it has. */
  queued: boolean;
}

/**
 * What a commit asked for before the preview landed does now — asked for the
 * tools' input then (`queued`, `foldToolInputKey`), with `input` theirs now:
 * nothing queued; wait while that input's step is still being built (a
 * reverse fold's tip or an axiom's roots still being asked about) or is
 * landing; commit once it has landed; drop it when it was refused, the input
 * changed, or nothing can be committed.
 */
export function queuedCommit(
  queued: string | null,
  preview: Pick<FoldToolPreview, 'step' | 'refused' | 'landing'>,
  readOnly: boolean,
  input: string
): 'idle' | 'wait' | 'commit' | 'drop' {
  if (queued === null) return 'idle';
  const { step, refused, landing } = preview;
  if (input !== queued || refused || readOnly) return 'drop';
  return !step || landing ? 'wait' : 'commit';
}

/** Which of the previewed fold's choices the canvas's chooser shows, and of how many: the one a folder makes last. */
export type FoldCanvasChoice = { kind: 'order' | 'opening' | 'target' | 'root'; index: number; count: number };

/**
 * What the compound fold in hand lists to choose from: the ways a reverse
 * fold's or a crimp's tip opens, the orders any of them leaves, and the
 * layers a tuck can go against. None for a plain fold.
 */
export function compoundListed(preview: Pick<FoldToolPreview, 'reverse' | 'crimp' | 'tuck'>): {
  ways: number;
  orders: number;
  targets: number;
} {
  const opens = preview.reverse ?? preview.crimp;
  return {
    ways: opens?.ways.length ?? 0,
    orders: (opens ?? preview.tuck)?.orders.length ?? 0,
    targets: preview.tuck?.targets.length ?? 0,
  };
}

/**
 * The chooser on the canvas: the deepest choice with more than one answer —
 * the layer order, then the way the tip opens or the layer a tuck goes
 * against, then the axiom's root — since each earlier choice resets the ones
 * after it. Null when none has more than one.
 */
export function foldCanvasChoice(preview: FoldToolPreview, tools: FoldToolState): FoldCanvasChoice | null {
  const { ways, orders, targets } = compoundListed(preview);
  if (orders > 1) return { kind: 'order', index: Math.min(tools.compound.order, orders - 1), count: orders };
  if (ways > 1) return { kind: 'opening', index: Math.min(tools.compound.opening, ways - 1), count: ways };
  const tuck = preview.tuck;
  if (tuck && targets > 1) {
    const at = tuck.targets.findIndex((target) => target.face === tuck.target?.face);
    return { kind: 'target', index: Math.max(0, at), count: targets };
  }
  const roots = preview.candidates?.length ?? 0;
  return roots > 1 ? { kind: 'root', index: Math.min(tools.root, roots - 1), count: roots } : null;
}

/**
 * What a committed op is called in `fold step added`; null for Import CP and
 * the sinks, which the canvas does not commit (no sink tool is on the rail yet).
 */
function opKindOf(op: FoldOp): FoldStepAddedOpKind | null {
  switch (op.kind) {
    case 'cp-jump':
    case 'open-sink':
    case 'closed-sink':
    case 'unsink':
      return null;
    // Compound folds, snake_case as the event's enums are.
    case 'inside-reverse':
      return 'inside_reverse';
    case 'outside-reverse':
      return 'outside_reverse';
    case 'rabbit-ear':
      return 'rabbit_ear';
    default:
      return op.kind;
  }
}

function trackCommitted(op: FoldOp): void {
  const kind = opKindOf(op);
  if (!kind) return;
  // A vertex fold takes no line and no layer scope of a plain fold's.
  if (op.kind === 'turn' || op.kind === 'rotate' || op.kind === 'cp-jump' || isVertexOp(op)) {
    trackFoldStepAdded(kind);
    return;
  }
  const via = 'line' in op ? op.line.via : 'crease';
  trackFoldStepAdded(kind, { layerScope: op.seed.scope, via });
}

/** Within this many sheet units, a second depth pick is the same spot, and goes a layer deeper. */
const SAME_SPOT = 1e-3;

/**
 * The marks made on a step — the sheet's own for null — every entry kept,
 * a newer build's among them: what a mark is added after, and a clear empties.
 */
export function marksMadeAt(sequence: FoldSequenceDocument | null, id: string | null): readonly FoldMarkEntry[] {
  if (!sequence) return [];
  if (id === null) return sequence.sheetMarks ?? [];
  const node = sequence.steps.find((step) => step.id === id);
  return node && !isLockedStep(node) ? (node.marks ?? []) : [];
}

/**
 * The verbs the Fold canvas offers, bound to the session, the tools and the
 * fold previewed. Stable for the canvas's life: each reads what it needs
 * when it runs, so a key press, a button and a click are one path.
 */
export function useFoldCanvasVerbs(
  session: FoldSessionSurface,
  tools: FoldTools,
  view: FoldStateView,
  preview: FoldToolPreview
): FoldCanvasVerbBinding {
  const live = useRef({ session, view, preview });
  // Before any handler can run: effects land ahead of the next event.
  useEffect(() => {
    live.current = { session, view, preview };
  });
  // What was picked was picked on the step on screen: another step — an
  // undo, a redo, a step chosen in the strip — starts the tool over. (A
  // commit has already let go of it.)
  const cursorId = session.cursorId;
  useEffect(() => {
    tools.clear();
  }, [tools, cursorId]);

  const commitOp = useCallback(
    (op: FoldOp, choices?: Parameters<FoldSessionSurface['commitStep']>[1]) => {
      void live.current.session.commitStep(op, choices).then((outcome) => {
        if (outcome.status !== 'committed') return;
        trackCommitted(op);
        tools.clear();
      });
    },
    [tools]
  );

  // A commit asked for before the preview landed, by the tools' input it was
  // asked for: committed when that input's step lands, let go when it is
  // refused or the input changes. Never dropped without a word: the window
  // says it waits.
  const [queued, setQueued] = useState<string | null>(null);
  useEffect(() => {
    const now = queuedCommit(queued, preview, session.readOnly, foldToolInputKey(tools.store.getState()));
    if (now === 'idle' || now === 'wait') return;
    setQueued(null);
    if (now === 'commit' && preview.step) commitOp(preview.step.op, preview.step.choices);
  }, [queued, preview, session.readOnly, commitOp, tools]);

  const verbs = useMemo<FoldCanvasVerbs>(() => {
    const state = () => tools.store.getState();

    /** A click on the folded paper while a fold is previewed: the stack there, one layer deeper each time. */
    const pickDepth = (at: { x: number; y: number }) => {
      const { view: shown, preview: previewed, session: current } = live.current;
      const step = previewed.step;
      const index = shown.index;
      if (!step || !index || step.op.kind === 'turn' || step.op.kind === 'rotate' || step.op.kind === 'cp-jump') return;
      const sheet = topSheetPointAt(index, at);
      if (!sheet) return;
      const seed = state().seed;
      const again =
        seed.scope === 'depth' && Math.hypot(seed.at[0] - sheet[0], seed.at[1] - sheet[1]) <= SAME_SPOT;
      const asked = again && seed.scope === 'depth' ? seed.at : sheet;
      void current.withCursor((engine, handle) => engine.depthChoices(handle, step.op, asked, step.choices)).then(
        (answer) => {
          if (answer.status !== 'answered' || answer.value.status !== 'ok') return;
          const { choices } = answer.value;
          if (choices.length === 0) return;
          if (!again && choices.length > 1) trackFoldChoiceOffered('depth', choices.length);
          const now = state().seed;
          const position = now.scope === 'depth' && again ? choices.findIndex((choice) => choice.layers === now.choice) : -1;
          const next = choices[(position + 1) % choices.length]!;
          tools.setSeed({ scope: 'depth', at: asked, scene: { x: at.x, y: at.y }, choice: next.layers });
        }
      );
    };

    return {
      selectTool: tools.selectTool,
      selectLineMode: tools.selectLineMode,

      turn: (turn) => {
        const op: FoldOp = turn.kind === 'turn-over' ? { kind: 'turn', axis: turn.axis } : { kind: 'rotate', rotate: turn.rotate };
        tools.clear();
        commitOp(op);
      },

      hitTest: (pane, at, radii) => {
        const index = live.current.view.index;
        if (!index) return null;
        const tool = state();
        const model = foldToolInput(tool);
        const step = model ? nextStep(model, tool.picks.length) : null;
        // Located: a click on the paper picks layers, so what is under the
        // pointer is the paper itself, never a reference — and over a woven
        // section, which of its stacks the layer picker shows.
        if (!step) {
          const interval = pane === 'folded' ? wovenIntervalAt(live.current.preview.section, at) : null;
          return interval === null ? { pane, at, pick: null } : { pane, at, pick: null, interval };
        }
        const pick = resolveFoldPick(index, pane, at, radii, { snap: step.snap, edges: step.edges, free: freePointHeld() });
        return { pane, at, pick };
      },

      pick: (hit) => {
        // Nothing can be folded or marked on a newer build's sequence, or from a step locked behind one.
        if (!hit || live.current.session.readOnly || live.current.session.cursor.status === 'locked') return;
        const tool = state();
        if (isLocated(tool)) {
          if (hit.pane === 'folded' && isLineTool(tool.tool)) pickDepth(hit.at);
          return;
        }
        if (!hit.pick) return;
        tools.pick(hit.pick);
        if (tool.tool !== 'divide-line') return;
        // The Divide line takes one click: the mark is made at once.
        const segment = hit.pick;
        if (segment.kind !== 'segment') {
          tools.clear();
          return;
        }
        const { divide } = state();
        const mark: FoldMark = {
          id: randomFoldId('fmark'),
          from: segment.sheet[0],
          to: segment.sheet[1],
          divide: divide.mode === 'count' ? { mode: 'count', parts: divide.parts } : { mode: 'ratio', ratio: divide.ratio },
        };
        const cursor = live.current.session.cursorId;
        const store = useWorkspaceStore.getState();
        // On the step it was made on — the sheet's own list for the flat
        // sheet — after the marks already there: one undo entry (plan D6).
        store.setFoldMarks(cursor, [...marksMadeAt(shownFoldSequence(store)?.document ?? null, cursor), mark]);
        tools.clear();
      },

      swapSide: tools.swapSide,

      toggleFlap: (flap) => {
        const section = live.current.preview.section;
        const target = section?.flaps[flap];
        if (section && target) tools.toggleFlap(target, section.flaps);
      },

      hoverFlap: tools.setHoveredFlap,

      includeFlaps: (flaps) => {
        const analysis = live.current.preview.analysis;
        const section = live.current.preview.section;
        if (!analysis) return;
        const seed = state().seed;
        const picked = seed.scope === 'flaps' ? [...seed.flaps] : [];
        for (const flap of flaps) {
          const named = analysis.flaps[flap];
          if (named) picked.push(named);
        }
        const all = section?.flaps ?? analysis.flaps;
        tools.setSeed(picked.length >= all.length ? { scope: 'all' } : { scope: 'flaps', flaps: picked });
      },

      foldOtherWay: () => {
        const tool = state();
        if (tool.tool === 'valley') tools.selectTool('mountain');
        else if (tool.tool === 'mountain') tools.selectTool('valley');
        else if (tool.tool === 'precrease') tools.setPrecreaseDirection(tool.precreaseDirection === 'valley' ? 'mountain' : 'valley');
        else if (tool.tool === 'tuck') tools.setTuckDirection(tool.tuckDirection === 'valley' ? 'mountain' : 'valley');
      },

      setReverseKind: (kind) => tools.setReverseKind(kind),

      stepOpening: (delta) => tools.stepOpening(delta, compoundListed(live.current.preview).ways),

      stepOrder: (delta) => tools.stepOrder(delta, compoundListed(live.current.preview).orders),

      setSecondLineMode: (mode) => tools.setSecondLineMode(mode),

      setTuckDirection: (direction) => tools.setTuckDirection(direction),

      stepTuckTarget: (delta) => {
        const tuck = live.current.preview.tuck;
        if (!tuck || tuck.targets.length <= 1) return;
        tools.setTuckTarget(steppedTuckTarget(tuck.targets, tuck.target?.face ?? null, delta));
      },

      tuckTarget: (face) => tools.setTuckTarget(face),

      pickFlap: (flap) => tools.setSeed({ scope: 'flaps', flaps: [flap] }),

      useLine: (fix) => {
        const { preview: previewed, view: shown } = live.current;
        if (fix.step) {
          tools.setOverride({ op: fix.step.op, choices: fix.step.choices });
          return;
        }
        // A near miss's landmark line: a model line, stored as the free line
        // through it, the same side moving. A compound fold's too: its tool
        // takes the line from the override — a crimp's first line — and
        // keeps choosing the rest along it (`useFoldReverseStep`,
        // `useFoldCrimpStep`, `useFoldTuckStep`).
        const op = previewed.step?.op;
        const index = shown.index;
        if (!index) return;
        const sceneLine = transformLine(index.scene.view_transform, fix.line);
        if (!op) {
          // No step to put it in: an axiom whose roots were refused as a
          // near miss. The landmark line is located as a free line instead,
          // its side the fix's.
          const picks = freePicksAlong(index, sceneLine);
          if (!picks) return;
          tools.selectLineMode('free');
          for (const pick of picks) tools.pick(pick);
          if (defaultMovingSign(index, sceneLine, false) !== (fix.side === 'positive' ? 1 : -1)) tools.swapSide();
          return;
        }
        if (!isAlongLine(op)) return;
        const through = freeLineThrough(index, sceneLine);
        const moving = movingPoint(index, sceneLine, fix.side === 'positive' ? 1 : -1);
        if (!through || !moving) return;
        const { moving: _moving, ...rest } = op;
        const seed = op.seed.scope === 'all' ? { moving: moving.sheet } : {};
        tools.setOverride({ op: { ...rest, line: { via: 'free', through }, ...seed } });
      },

      stepChoice: (delta) => {
        const choice = foldCanvasChoice(live.current.preview, state());
        if (!choice) return false;
        switch (choice.kind) {
          case 'order':
            tools.stepOrder(delta, choice.count);
            break;
          case 'opening':
            tools.stepOpening(delta, choice.count);
            break;
          case 'target': {
            const tuck = live.current.preview.tuck;
            if (tuck) tools.setTuckTarget(steppedTuckTarget(tuck.targets, tuck.target?.face ?? null, delta));
            break;
          }
          case 'root':
            tools.stepRoot(delta, choice.count);
            break;
        }
        return true;
      },

      commit: () => {
        const { step, refused, landing } = live.current.preview;
        if (refused || live.current.session.readOnly) return false;
        // Located, its step still being built (a reverse fold's tip, an
        // axiom's roots, being asked about) or still landing: committed once
        // it lands, never silently dropped.
        if (!step ? isLocated(state()) : landing) {
          setQueued(foldToolInputKey(state()));
          return true;
        }
        if (!step) return false;
        commitOp(step.op, step.choices);
        return true;
      },

      cancel: () => {
        const tool = state();
        const held = tool.picks.length > 0 || tool.override !== null || tool.seed.scope !== 'all' || tool.swapped;
        if (!held) return false;
        setQueued(null);
        tools.clear();
        live.current.session.cancel();
        return true;
      },

      clearMarks: () => {
        const cursor = live.current.session.cursorId;
        useWorkspaceStore.getState().setFoldMarks(cursor, []);
      },
    };
  }, [tools, commitOp]);

  return { verbs, queued: queued !== null };
}
