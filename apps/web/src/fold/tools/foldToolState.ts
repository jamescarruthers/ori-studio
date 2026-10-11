/**
 * The Fold tools' interaction state (plan D13, D14): the tool in hand, the
 * line mode, the references clicked so far, and every choice made while a
 * fold is previewed — the root, the moving side, what moves, the fixes taken.
 *
 * Interaction state, not the document: nothing here is saved or undone, and a
 * commit, a cancel or a move to another step lets it go. Module state in a
 * vanilla store, as Simulate's tool state is, because the keyboard executor
 * and the canvas read and write it from callbacks that must not re-subscribe;
 * React reads it through {@link useFoldTools}.
 *
 * The clicks are counted by the surface-agnostic reducer the registry hands
 * out (`createStepSequenceTool` through `createToolRuntime`); this holds what
 * each click picked, which the reducer, counting points, has no word for.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { createToolRuntime, type ToolRuntime } from '../../cp-workspace/tools/runtime';
import type { Point } from '../../lib/geometry';
import type { OristudioCpRatioExpression } from '../../lib/oristudioCpToolSettings';
import { ratioExpressionFromHalves } from '../../lib/oristudioCpToolSettings';
import type { FoldPick } from '../canvas/foldPicking';
import {
  FOLD_MARK_MAX_PARTS,
  type FoldChoices,
  type FoldDirection,
  type FoldOp,
  type SheetPoint,
} from '../document/foldSequenceDocument';
import type { FoldReverseKind } from '../engine/foldEngineReverseWire';
import type { FoldFlap } from '../engine/foldEngineWire';
import { isLineTool, type FoldLineModeId, type FoldLineToolId, type FoldToolId } from './foldToolCatalog';
import { locateEngine, toolInput, type FoldInputModel } from './foldToolRegistry';

/**
 * What a fold takes along with the moving side (D6's seed, before it names
 * sheet points): every layer, the flaps picked — as the engine named them,
 * so a new section of the same line finds them again — or the stack at a
 * point of the folded pane, at the depth a repeated click went down to.
 */
export type FoldToolSeed =
  | { scope: 'all' }
  | { scope: 'flaps'; flaps: readonly FoldFlap[] }
  | { scope: 'depth'; at: SheetPoint; scene: Point; choice: number };

/** A fold a refusal's fix offers, folded in place of the one the picks locate until they change. */
export interface FoldToolOverride {
  op: FoldOp;
  choices?: FoldChoices;
}

/** How a Divide-line mark divides its segment (D6), as the window edits it. */
export interface FoldDivideSettings {
  mode: 'count' | 'ratio';
  parts: number;
  ratio: OristudioCpRatioExpression;
}

export const FOLD_DIVIDE_DEFAULT: FoldDivideSettings = {
  mode: 'count',
  parts: 2,
  ratio: ratioExpressionFromHalves({ a: 1, b: 0, c: 0 }, { a: 1, b: 0, c: 0 }),
};

/**
 * A compound fold's choices while it is previewed, one block per family: the
 * reverse fold's kind (`tools/reverse`), and the opening and the order taken
 * among those the engine lists — by index, as the axiom's root is: what the
 * step stores is the result each names (plan D6), never the index.
 */
export interface FoldCompoundToolChoices {
  /** The kind the folder chose; null while the tool takes the one that lands (inside when both do). */
  reverseKind: FoldReverseKind | null;
  /** The way the flaps open, by index into the ways the engine lists. */
  opening: number;
  /** The layer order, by index into the orders the engine lists for the kind. */
  order: number;
  /** A closed sink's pocket, by index into the pockets the engine lists for the point (`tools/sink`). */
  pocket: number;
}

export const FOLD_COMPOUND_CHOICES_INITIAL: FoldCompoundToolChoices = {
  reverseKind: null,
  opening: 0,
  order: 0,
  pocket: 0,
};

export interface FoldToolState {
  tool: FoldToolId;
  lineMode: FoldLineModeId;
  /** The references clicked so far, in click order. */
  picks: readonly FoldPick[];
  /** The axiom root chosen, by index into the candidates the engine gave for the picks. */
  root: number;
  /** The moving side is the other one from the default. */
  swapped: boolean;
  seed: FoldToolSeed;
  /** The way a precrease folds before it unfolds. */
  precreaseDirection: FoldDirection;
  override: FoldToolOverride | null;
  divide: FoldDivideSettings;
  /** The flap the pointer is over in the layer picker or the chips, which the canvas lights. */
  hoveredFlap: number | null;
  compound: FoldCompoundToolChoices;
}

export const FOLD_TOOL_INITIAL: FoldToolState = {
  tool: 'valley',
  // The design opens on point to point, the first fold of most models.
  lineMode: 'axiom-2',
  picks: [],
  root: 0,
  swapped: false,
  seed: { scope: 'all' },
  precreaseDirection: 'valley',
  override: null,
  divide: FOLD_DIVIDE_DEFAULT,
  hoveredFlap: null,
  compound: FOLD_COMPOUND_CHOICES_INITIAL,
};

/** What a new locate starts from: the tool, the line mode and the Divide settings stay. */
function located(state: FoldToolState): FoldToolState {
  return {
    ...state,
    picks: [],
    root: 0,
    swapped: false,
    seed: { scope: 'all' },
    override: null,
    hoveredFlap: null,
    compound: FOLD_COMPOUND_CHOICES_INITIAL,
  };
}

/** A new tip — another side, another seed, another root — opens, sinks and stacks anew: the kind stays chosen. */
function anotherTip(compound: FoldCompoundToolChoices): FoldCompoundToolChoices {
  return compound.opening === 0 && compound.order === 0 && compound.pocket === 0
    ? compound
    : { ...compound, opening: 0, order: 0, pocket: 0 };
}

/** A sink with a kind, open or closed: the tools the sink window's kind control switches between. */
function isSinkKindTool(tool: FoldToolId): boolean {
  return tool === 'open-sink' || tool === 'closed-sink';
}

/** The clicks the state's tool and line mode collect. */
export function foldToolInput(state: Pick<FoldToolState, 'tool' | 'lineMode'>): FoldInputModel | null {
  return toolInput(state.tool, state.lineMode);
}

/**
 * What the tools have been asked to fold, as a key: the tool, its line and
 * every pick and choice made along it — not the flap hovered, which asks for
 * nothing. Any change to it is another fold.
 */
export function foldToolInputKey(state: FoldToolState): string {
  const { hoveredFlap: _hovered, ...input } = state;
  return JSON.stringify(input);
}

/** Every click is in: the line is located (or, for the Divide line, the segment). */
export function isLocated(state: FoldToolState): boolean {
  const model = foldToolInput(state);
  return model !== null && state.picks.length >= model.steps.length;
}

/** Whether anything is under way that Escape would let go. */
export function hasToolInput(state: FoldToolState): boolean {
  return state.picks.length > 0 || state.override !== null;
}

export interface FoldTools {
  readonly store: StoreApi<FoldToolState>;
  selectTool(tool: FoldToolId): void;
  selectLineMode(mode: FoldLineModeId): void;
  /** A click: the pick it made. Whether it was taken (a click past the last is not). */
  pick(pick: FoldPick): boolean;
  /** Let go of the clicks and every choice made since: Escape's rung, and what a commit leaves. */
  clear(): void;
  /**
   * Fold the other side. Whether there was a side to swap: none until the
   * line is located, so a swap is never latched for a line not yet there.
   */
  swapSide(): boolean;
  /** Step through the axiom's roots, of `count`. */
  stepRoot(delta: number, count: number): void;
  /** Fold with this seed; a seed of no flaps is every layer (`flapSeed`). */
  setSeed(seed: FoldToolSeed): void;
  /**
   * Pick or unpick a flap; `all` is the section's every flap, so picking the
   * last unpicked one is `all` again — and so is unpicking the only one
   * picked, which would otherwise leave a seed that moves nothing (`flapSeed`).
   */
  toggleFlap(flap: FoldFlap, all: readonly FoldFlap[]): void;
  setPrecreaseDirection(direction: FoldDirection): void;
  setOverride(override: FoldToolOverride | null): void;
  setDivide(divide: Partial<FoldDivideSettings>): void;
  setHoveredFlap(flap: number | null): void;
  // A compound fold's choices, one block per family.
  /** The reverse fold's kind; null takes the one that lands. */
  setReverseKind(kind: FoldReverseKind | null): void;
  /** Step through the ways the flaps open, of `count`. */
  stepOpening(delta: number, count: number): void;
  /** Step through the layer orders listed, of `count`. */
  stepOrder(delta: number, count: number): void;
  /** Step through a closed sink's pockets, of `count`: each stacks anew. */
  stepPocket(delta: number, count: number): void;
}

const sameFlap = (a: FoldFlap, b: FoldFlap) =>
  a.faces.length === b.faces.length && a.faces.every((face, k) => face === b.faces[k]);

/**
 * The seed that picks `flaps` of `all`: every layer when they are every flap
 * at the line, or none of them. A seed of no flaps names nothing on the
 * moving side, so the engine refuses it (`no_side`) and the window, with no
 * section to show, has no chips left to pick one again: the last chip
 * unpressed would strand the fold. Every layer is where a fold starts.
 */
export function flapSeed(flaps: readonly FoldFlap[], all: readonly FoldFlap[] = []): FoldToolSeed {
  if (flaps.length === 0) return { scope: 'all' };
  const everything = all.length > 0 && all.every((each) => flaps.some((other) => sameFlap(each, other)));
  return everything ? { scope: 'all' } : { scope: 'flaps', flaps };
}

/** The parts a Divide-line count may take: two up to the Diagram's divisions' limit. */
export function clampDivideParts(parts: number): number {
  return Math.min(FOLD_MARK_MAX_PARTS, Math.max(2, Math.round(Number.isFinite(parts) ? parts : 2)));
}

export function createFoldTools(initial: FoldToolState = FOLD_TOOL_INITIAL): FoldTools {
  const store = createStore<FoldToolState>(() => initial);
  // The reducer that counts the clicks, rebuilt whenever what is clicked for changes.
  let runtime: ToolRuntime | null = null;
  let runtimeFor: FoldInputModel | null = null;
  const counter = (model: FoldInputModel): ToolRuntime => {
    if (runtime && runtimeFor === model) return runtime;
    runtime = createToolRuntime(locateEngine(model));
    runtimeFor = model;
    return runtime;
  };
  const set = (next: (state: FoldToolState) => FoldToolState) => {
    const before = store.getState();
    const after = next(before);
    if (after !== before) store.setState(after, true);
  };
  const restart = (state: FoldToolState): FoldToolState => {
    runtime?.reset();
    return located(state);
  };

  return {
    store,

    selectTool(tool) {
      set((state) => {
        if (state.tool === tool) return state;
        // Every fold along a line folds the same line: switching between V,
        // M, P and the reverse fold keeps it, as the window's V / M / P control
        // promises. Anything else locates anew. The open and the closed sink
        // are one sink's two kinds, as the reverse fold's are: a fix's line
        // taken for one (the square line) is the other's too.
        const keeps = isLineTool(tool) && isLineTool(state.tool);
        const sinkKinds = isSinkKindTool(tool) && isSinkKindTool(state.tool);
        return keeps
          ? { ...state, tool, override: sinkKinds ? state.override : null, compound: anotherTip(state.compound) }
          : { ...restart(state), tool };
      });
    },

    selectLineMode(lineMode) {
      set((state) => {
        // A line mode belongs to the folds: choosing one from the Divide line takes a fold in hand.
        const tool: FoldLineToolId = isLineTool(state.tool) ? state.tool : 'valley';
        if (state.lineMode === lineMode && state.tool === tool) return state;
        return { ...restart(state), tool, lineMode };
      });
    },

    pick(pick) {
      const state = store.getState();
      const model = foldToolInput(state);
      if (!model || state.picks.length >= model.steps.length) return false;
      const out = counter(model).feed({ kind: 'down', point: pickPoint(pick) });
      if (out.ignored) return false;
      store.setState({ ...state, picks: [...state.picks, pick], override: null }, true);
      return true;
    },

    clear() {
      set((state) => (hasToolInput(state) || state.seed.scope !== 'all' || state.swapped ? restart(state) : state));
    },

    swapSide() {
      if (!isLocated(store.getState())) return false;
      // The flaps picked, or the stack a depth pick went down, are the old
      // side's: the new side folds whole until something of it is picked.
      set((state) => ({
        ...state,
        swapped: !state.swapped,
        seed: { scope: 'all' },
        override: null,
        compound: anotherTip(state.compound),
      }));
      return true;
    },

    stepRoot(delta, count) {
      if (count <= 1) return;
      set((state) => ({
        ...state,
        root: (((state.root + delta) % count) + count) % count,
        swapped: false,
        override: null,
        compound: anotherTip(state.compound),
      }));
    },

    setSeed(asked) {
      const seed = asked.scope === 'flaps' ? flapSeed(asked.flaps) : asked;
      set((state) => ({ ...state, seed, override: null, compound: anotherTip(state.compound) }));
    },

    toggleFlap(flap, all) {
      set((state) => {
        const picked = state.seed.scope === 'flaps' ? state.seed.flaps : state.seed.scope === 'all' ? all : [];
        const has = picked.some((each) => sameFlap(each, flap));
        const next = has ? picked.filter((each) => !sameFlap(each, flap)) : [...picked, flap];
        return { ...state, seed: flapSeed(next, all), override: null, compound: anotherTip(state.compound) };
      });
    },

    setPrecreaseDirection(precreaseDirection) {
      set((state) => (state.precreaseDirection === precreaseDirection ? state : { ...state, precreaseDirection, override: null }));
    },

    setOverride(override) {
      set((state) => ({ ...state, override }));
    },

    setDivide(divide) {
      set((state) => {
        const next = { ...state.divide, ...divide };
        return { ...state, divide: { ...next, parts: clampDivideParts(next.parts) } };
      });
    },

    setHoveredFlap(hoveredFlap) {
      set((state) => (state.hoveredFlap === hoveredFlap ? state : { ...state, hoveredFlap }));
    },

    // A compound fold's choices are made along its line: a fix's line in
    // place of the picks' (the override) is kept through them.
    setReverseKind(reverseKind) {
      set((state) =>
        state.compound.reverseKind === reverseKind
          ? state
          : { ...state, compound: { ...state.compound, reverseKind, order: 0 } }
      );
    },

    stepOpening(delta, count) {
      if (count <= 1) return;
      set((state) => ({
        ...state,
        compound: { ...state.compound, opening: (((state.compound.opening + delta) % count) + count) % count, order: 0 },
      }));
    },

    stepOrder(delta, count) {
      if (count <= 1) return;
      set((state) => ({
        ...state,
        compound: { ...state.compound, order: (((state.compound.order + delta) % count) + count) % count },
      }));
    },

    stepPocket(delta, count) {
      if (count <= 1) return;
      set((state) => ({
        ...state,
        compound: { ...state.compound, pocket: (((state.compound.pocket + delta) % count) + count) % count, order: 0 },
      }));
    },
  };
}

/** Where a pick is, for the reducer that counts it: it reads positions, never what was picked. */
function pickPoint(pick: FoldPick): Point {
  if (pick.kind === 'free') return pick.scene;
  if (pick.kind === 'point') return { x: pick.sheet[0], y: pick.sheet[1] };
  return { x: pick.sheet[0][0], y: pick.sheet[0][1] };
}

let tools: FoldTools | null = null;

/** The app's Fold tools, made on first use. */
export function foldTools(): FoldTools {
  tools ??= createFoldTools();
  return tools;
}

/** Any part of the tools' state; the selector must return what the state holds, not a new object. */
export function useFoldTools<T>(selector: (state: FoldToolState) => T): T {
  return useStore(foldTools().store, selector);
}
