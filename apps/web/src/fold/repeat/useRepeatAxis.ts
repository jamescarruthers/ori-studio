import { useEffect, useMemo, useState } from 'react';
import type { Point } from '../../lib/geometry';
import { foldSession } from '../../store/workspaceStore/foldSession';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldAxiomCandidate, FoldLandmarks, FoldScene } from '../engine/foldEngineWire';
import type { FoldModelLine } from '../document/foldSequenceDocument';
import { foldPickIndex, resolveFoldPick, type FoldPick, type FoldMarkPoint } from '../canvas/foldPicking';
import { axiomLineOfPicks, locate } from '../tools/foldStepBuilder';
import { lineModeInput } from '../tools/foldToolRegistry';
import { FOLD_LINE_MODE_SHORTCUTS, type FoldLineModeId } from '../tools/foldToolCatalog';
import { registerFoldKeyHandler } from '../sequence/foldKeys';
import type { RepeatSymmetry } from './repeatGeometry';

function sameLine(a: FoldModelLine, b: FoldModelLine) {
  const sign = a.n[0] * b.n[0] + a.n[1] * b.n[1] >= 0 ? 1 : -1;
  return (
    Math.hypot(a.n[0] - sign * b.n[0], a.n[1] - sign * b.n[1]) < 1e-6 && Math.abs(a.d - sign * b.d) < 1e-6
  );
}

/** The ordinary Locate line constructions, over the source baseline's pick index. */
export function useRepeatAxis(
  scene: FoldScene,
  state: FoldEngineStateHandle,
  axes: readonly RepeatSymmetry[],
  marks: readonly FoldMarkPoint[],
  accept: (axis: number) => void,
) {
  const [mode, setMode] = useState<FoldLineModeId>('axiom-1');
  const [picks, setPicks] = useState<FoldPick[]>([]);
  const [hover, setHover] = useState<FoldPick | null>(null);
  const [landmarks, setLandmarks] = useState<FoldLandmarks | null>(null);
  const [roots, setRoots] = useState<FoldAxiomCandidate[]>([]);
  const [root, setRoot] = useState(0);
  const index = useMemo(() => foldPickIndex(scene, landmarks, marks), [scene, landmarks, marks]);
  const input = lineModeInput(mode);
  useEffect(() => {
    let active = true;
    void foldSession()
      .withState(state, (e, id) =>
        e.landmarks(
          id,
          marks.map((m) => m.at),
        ),
      )
      .then((a) => {
        if (active && a.status === 'answered') setLandmarks(a.value);
      })
      .catch(() => {
        if (active) setLandmarks(null);
      });
    return () => {
      active = false;
    };
  }, [state, marks]);
  useEffect(() => {
    const line = axiomLineOfPicks(mode, picks);
    if (!line) {
      setRoots([]);
      return;
    }
    let active = true;
    void foldSession()
      .withState(state, (e, id) => e.axiomCandidates(id, line))
      .then((a) => {
        if (active) setRoots(a.status === 'answered' && a.value.status === 'ok' ? a.value.candidates : []);
      })
      .catch(() => {
        if (active) setRoots([]);
      });
    return () => {
      active = false;
    };
  }, [state, mode, picks]);
  const clear = () => {
    setPicks([]);
    setHover(null);
    setRoots([]);
    setRoot(0);
  };
  const selectMode = (value: FoldLineModeId) => {
    clear();
    setMode(value);
  };
  const resolve = (at: Point, radius: number, free: boolean) => {
    const rule = input.steps[picks.length];
    return rule
      ? resolveFoldPick(index, 'folded', at, { point: radius, line: radius }, { ...rule, free })
      : null;
  };
  const click = (at: Point, radius: number, free: boolean) => {
    const pick = resolve(at, radius, free);
    if (pick) {
      setPicks([...picks, pick]);
      setHover(null);
    }
  };
  const located = locate(
    { lineMode: mode, picks, candidate: roots[root] ?? null, swapped: false, seed: { scope: 'all' } },
    index,
  );
  const line = located && 'sceneLine' in located ? located.sceneLine : undefined;
  const match = line ? axes.findIndex((a) => sameLine(a.display, line)) : -1;
  useEffect(() =>
    registerFoldKeyHandler((id) => {
      const mode = (Object.keys(FOLD_LINE_MODE_SHORTCUTS) as FoldLineModeId[]).find(
        (m) => FOLD_LINE_MODE_SHORTCUTS[m] === id,
      );
      if (mode) selectMode(mode);
      else if (id === 'fold.commit' && match >= 0) accept(match);
      // The axis picker owns Fold keys while open; the ordinary drawing tools
      // must not react beneath it.
      return true;
    }),
  );
  return {
    mode,
    selectMode,
    picks,
    hover,
    move: (p: Point, r: number, f: boolean) => setHover(resolve(p, r, f)),
    click,
    clear,
    line,
    match,
    complete: picks.length === input.steps.length,
    roots,
    root,
    setRoot,
  };
}
