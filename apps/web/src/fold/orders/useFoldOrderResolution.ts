import { trackFoldChoiceOffered, trackFoldOrderResolved } from '../../analytics/trackFold';
import { useEffect, useMemo, useRef, useState } from 'react';
import { reportError } from '../../monitoring';
import { canonicalJson } from '../document/foldDigest';
import { isFoldCompoundOp } from '../engine/foldEngineCompoundWire';
import { foldSearchTicket } from '../engine/foldSearch';
import type { FoldOrderSelection } from '../engine/foldEngineCompoundCalls';
import type { FoldEngineRefused } from '../engine/foldEngineWire';
import type { FoldSessionSurface } from '../session/useFoldSession';
import { foldStepInputKey } from '../session/foldSessionEngine';
import type { FoldToolStep } from '../canvas/useFoldToolPreview';

export interface FoldOrderResolution {
  key: string;
  movingVaries?: boolean;
  inputKey: string;
  active: boolean;
  required: boolean;
  waiting: boolean;
  failed: boolean;
  index: number;
  count: number;
  exact: boolean;
  canSearch: boolean;
  step: (delta: number) => void;
  search: () => void;
  back: () => void;
  resume: () => void;
}

/** Search while editing; review starts only on tool confirmation. Input changes leave review. */
export function useFoldOrderResolution(session: FoldSessionSurface, base: FoldToolStep | null, inputKey: string) {
  const parent = session.cursor.state;
  const placing = base?.op.kind === 'valley' || base?.op.kind === 'mountain';
  const compound = base && (placing || base.op.kind === 'pleat' || isFoldCompoundOp(base.op)) ? base.op : null;
  const { completion: _order, ...choices } = base?.choices ?? {};
  const key = compound && parent ? `${parent.generation}:${parent.id}|${canonicalJson({ op: compound, choices })}|${inputKey}` : null;
  const [navigation, setNavigation] = useState<{ key: string; index: number; budget: number; batch: number; reviewing: boolean; prefer?: [number, number][] }>({ key: '', index: 0, budget: 1, batch: 0, reviewing: false });
  const nav = navigation.key === key ? navigation : { key: key ?? '', index: 0, budget: 1, batch: 0, reviewing: false };
  if (navigation.key !== (key ?? '')) setNavigation(nav);
  const queryKey = key ? `${key}|${nav.index}|${nav.budget}|${nav.batch}|${canonicalJson(nav.prefer ?? null)}` : null;
  const [answer, setAnswer] = useState<{ key: string; value: FoldOrderSelection | null; refused: FoldEngineRefused | null; failed: boolean } | null>(null);
  const { withCursor, cancelSearch } = session;
  useEffect(() => {
    if (!placing || !key) return;
    return () => { void withCursor((engine, at) => engine.releaseOrderSearch?.(at)).catch((error: unknown) => reportError(error, { surface: 'fold:order-release' })); };
  }, [placing, key, withCursor]);
  useEffect(() => {
    if (!compound || !queryKey || answer?.key === queryKey) return;
    let current = true;
    // A pleat's orders are a search over the engine's calls: one no longer
    // wanted — the lines moved, Escape put the tool down — stops in the worker.
    const search = compound.kind === 'pleat' ? foldSearchTicket() : undefined;
    const query = { index: nav.index, batch: nav.batch, prefer: nav.prefer, perComponent: 1000 * nav.budget, maxNodes: 200_000 * nav.budget };
    void withCursor((engine, at) => search
      ? engine.orderSelection(at, compound, choices, query, search)
      : engine.orderSelection(at, compound, choices, query)).then((reply) => {
      if (!current || reply.status !== 'answered') return;
      const value = reply.value;
      setAnswer({ key: queryKey, value: value.status === 'ok' ? value : null, refused: value.status === 'ok' ? null : value, failed: false });
    }, (error: unknown) => {
      if (!current) return;
      reportError(error, { surface: 'fold:order-resolution' });
      setAnswer({ key: queryKey, value: null, refused: null, failed: true });
    });
    return () => {
      current = false;
      if (search) cancelSearch(search);
    };
    // All semantic input is covered by queryKey; a new object is not a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCursor, cancelSearch, queryKey, answer?.key]);
  const own = answer?.key === queryKey ? answer : null;
  const value = own?.value ?? (answer?.key.startsWith(`${key}|`) ? answer.value : null);
  const limited = own?.refused?.refusal.code === 'budget_exceeded';
  const required = own?.failed === true || limited || (!!value && (!value.count.exact || value.count.orders > 1));
  const offered = useRef<string | null>(null);
  useEffect(() => {
    if (placing && key && value && nav.reviewing && required && offered.current !== key) {
      offered.current = key;
      trackFoldChoiceOffered('placement', value.count.orders);
    }
  }, [placing, key, value, required, nav.reviewing]);
  const resolution: FoldOrderResolution | null = key ? {
    key, inputKey, movingVaries: value?.moving_varies, active: nav.reviewing, required,
    waiting: own === null, failed: (own?.failed ?? false) || limited,
    index: value?.index ?? nav.index,
    count: Math.min(Number.MAX_SAFE_INTEGER, value?.count.orders ?? 0),
    exact: value?.count.exact === true && Number.isSafeInteger(value.count.orders),
    canSearch: placing ? !value?.count.exact : nav.budget < 64,
    step: (delta) => {
      if (!nav.reviewing || !value) return;
      const count = Math.min(Number.MAX_SAFE_INTEGER, value.count.orders);
      const next = value.index + delta;
      const index = value.count.exact ? (next + count) % count : Math.max(0, Math.min(count - 1, next));
      setNavigation({ ...nav, index, prefer: undefined });
    },
    search: () => setNavigation({ ...nav, budget: Math.min(64, nav.budget * 4), batch: nav.batch + 1, prefer: value?.relations }),
    back: () => { trackFoldOrderResolved('canceled', 'tool', value?.count.orders ?? 0); setNavigation({ ...nav, reviewing: false }); },
    resume: () => setNavigation({ ...nav, reviewing: true }),
  } : null;
  const step = useMemo(() => {
    if (!key) return base;
    if (!base || !value || value.count.orders === 0) return null;
    const choices = { ...base.choices };
    delete choices.completion;
    if (value.completion) choices.completion = value.completion;
    const stored = Object.keys(choices).length ? choices : undefined;
    const op = (base.op.kind === 'valley' || base.op.kind === 'mountain') && value.landing
      ? { ...base.op, landing: value.landing } : base.op.kind === 'pleat' && value.pleat ? { ...base.op, resolved: value.pleat } : base.op;
    return { op, ...(stored ? { choices: stored } : {}), key: foldStepInputKey({ op, choices: stored }) };
  }, [base, key, value]);
  // Search exhaustion belongs to order review, not a geometric refusal that
  // disables the tool confirmation needed to reach that review.
  return { step, resolution, refused: limited ? null : own?.refused ?? null };
}
