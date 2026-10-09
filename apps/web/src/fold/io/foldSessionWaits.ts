/**
 * Waiting for the Fold session to have the states a hand-off needs: the step
 * on screen, for an import after it, and the whole active path, for Send to
 * Edit and the exports (plan D6: the active path is what exports, the Steps
 * grid and Send to Edit follow).
 *
 * A hold on the session starts a replay; these resolve once it has landed
 * what they ask for, or as soon as it cannot: the session is not held, the
 * step is broken or locked, or the replay stopped (`error`). Every replay
 * ends by publishing, so neither waits for ever while the session is held.
 *
 * Pure: no React, no store.
 */

import type { FoldOp, FoldPaper } from '../document/foldSequenceDocument';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldSession } from '../session/foldSession';
import { selectFoldCursorNode, type FoldSessionNode, type FoldSessionSnapshot } from '../session/foldSessionState';

export type FoldWaitUnavailable = { readonly status: 'unavailable'; readonly reason: 'not-live' | 'read-only' | 'no-state' };

/** The step on screen, landed: where an import is added. */
export interface FoldCursorReady {
  readonly status: 'ready';
  readonly state: FoldEngineStateHandle;
  /** The step's id; null for the sheet. */
  readonly cursor: string | null;
  /** The sequence has no step yet: an import adopts its sheet (plan D16). */
  readonly empty: boolean;
  readonly paper: FoldPaper;
}

/** A step of the active path, landed. */
export interface FoldPathStep {
  readonly id: string;
  readonly op: FoldOp;
  readonly state: FoldEngineStateHandle;
}

/** The active path, landed: the sheet's state, then each step's, the first first. */
export interface FoldPathReady {
  readonly status: 'ready';
  readonly sheet: FoldEngineStateHandle;
  readonly steps: readonly FoldPathStep[];
}

/** The first answer `read` gives, now or once the session publishes one. */
function untilAnswered<T>(session: FoldSession, read: (snapshot: FoldSessionSnapshot) => T | undefined): Promise<T> {
  const now = read(session.store.getState());
  if (now !== undefined) return Promise.resolve(now);
  return new Promise((resolve) => {
    const unsubscribe = session.store.subscribe((snapshot) => {
      const answer = read(snapshot);
      if (answer === undefined) return;
      unsubscribe();
      resolve(answer);
    });
  });
}

const unavailable = (reason: FoldWaitUnavailable['reason']): FoldWaitUnavailable => ({ status: 'unavailable', reason });

/** A node's state, `null` when it settled without one, or undefined while the replay may still land it. */
function landedState(node: FoldSessionNode, snapshot: FoldSessionSnapshot): FoldEngineStateHandle | null | undefined {
  if (node.state) return node.state;
  if (node.status !== 'pending') return null;
  // Pending with the replay stopped short: nothing more will land until a retry.
  return snapshot.error ? null : undefined;
}

/** The step on screen once the replay has landed it, or why nothing can be added after it. */
export function foldCursorReady(session: FoldSession): Promise<FoldCursorReady | FoldWaitUnavailable> {
  return untilAnswered(session, (snapshot) => {
    if (!snapshot.live) return unavailable('not-live');
    if (snapshot.readOnly) return unavailable('read-only');
    const state = landedState(selectFoldCursorNode(snapshot), snapshot);
    if (state === undefined) return undefined;
    if (state === null) return unavailable('no-state');
    return {
      status: 'ready',
      state,
      cursor: snapshot.cursor,
      empty: (snapshot.sequence?.steps.length ?? 0) === 0,
      paper: snapshot.paper,
    };
  });
}

/** The active path once every step of it has landed, or why it cannot be handed off. */
export function foldPathReady(session: FoldSession): Promise<FoldPathReady | FoldWaitUnavailable> {
  return untilAnswered(session, (snapshot) => {
    if (!snapshot.live) return unavailable('not-live');
    const sheet = landedState(snapshot.sheet, snapshot);
    if (sheet === undefined) return undefined;
    if (sheet === null) return unavailable('no-state');
    const byId = new Map((snapshot.sequence?.steps ?? []).map((node) => [node.id, node]));
    const steps: FoldPathStep[] = [];
    for (const id of snapshot.activePath) {
      const node = snapshot.nodes.get(id);
      const held = byId.get(id);
      if (!node || !held) return unavailable('no-state');
      const state = landedState(node, snapshot);
      if (state === undefined) return undefined;
      // A broken or locked step: the path cannot be followed past it.
      if (state === null || held.op === undefined) return unavailable('no-state');
      steps.push({ id, op: held.op, state });
    }
    // One engine's handles: a loss mid-wait renumbers them, and the replay then lands them again.
    if (steps.some((step) => step.state.generation !== sheet.generation)) return undefined;
    return { status: 'ready', sheet, steps };
  });
}
