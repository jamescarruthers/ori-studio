import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { useInheritedPaperStyle } from '../../cp-workspace/paper/objectPaperStyle';
import type { PaperStyle } from '../../lib/paper/paperStyle';
import { reportError } from '../../monitoring';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useFoldPaneDisplay } from '../canvas/foldPaneDisplay';
import type { FoldPaneDisplay } from '../canvas/foldPaneScenes';
import { foldStatePictureKey, foldStatePictureUrl } from '../canvas/foldStatePicture';
import type { FoldEngineStateHandle } from '../engine/foldEnginePort';
import type { FoldScene } from '../engine/foldEngineWire';
import type { FoldSession } from '../session/foldSession';
import { FOLD_SCENE_QUERY } from '../session/foldStateQueries';

/**
 * The step strip's card pictures (plan D14): each step's folded state as the
 * folded pane paints it, in the user's paper style (`foldStatePicture`).
 *
 * A picture costs a scene and a paint, so:
 *
 * - **Kept by the state's fingerprint** (`fs1`), not its handle: a replay or
 *   a new worker hands out new handles for the same states, and two branches
 *   that land the same state share a picture. A state with no fingerprint
 *   yet — the step a tool is folding — is kept by its handle. Beside the
 *   state, the key is the look (`foldStatePictureKey`): the style and the
 *   display switches.
 * - **Asked only for the cards in view.** The strip is windowed; a card
 *   asks for its picture as it mounts. The scene is the one every Fold
 *   surface asks for (`FOLD_SCENE_QUERY`), so a state the canvas or the
 *   frames already asked for is painted from the answer in hand.
 * - **Painted a slice at a time**, {@link SLICE_MS} per task, so a strip of
 *   dense states — or every card at once after the style changed — never
 *   holds the main thread; a job for a look no longer shown is dropped
 *   unpainted.
 * - **Capped**: at most {@link MAX_PICTURES}, and {@link MAX_PICTURE_CHARS}
 *   of SVG between them, the oldest let go first; a card scrolled back to
 *   paints again.
 */

/** What a card's picture is of. */
export interface FoldCardPictureSource {
  /** The state, to ask its scene of. */
  readonly state: FoldEngineStateHandle;
  /** What names the state whatever its handle: its fingerprint, else its handle. */
  readonly key: string;
}

/** A state's picture source: by its fingerprint when it has one. Null for no state. */
export function foldCardPictureSource(
  state: FoldEngineStateHandle | null,
  fingerprint: string | null = null
): FoldCardPictureSource | null {
  if (!state) return null;
  return { state, key: fingerprint ?? `handle:${state.generation}:${state.id}` };
}

const MAX_PICTURES = 96;
const MAX_PICTURE_CHARS = 8_000_000;
const SLICE_MS = 8;

/** Painted pictures by key: a data URL, or null for a state with nothing to draw. */
const pictures = createStore<{ byKey: ReadonlyMap<string, string | null> }>(() => ({ byKey: new Map() }));

interface PaintJob {
  key: string;
  look: string;
  scene: FoldScene;
  style: PaperStyle;
  display: FoldPaneDisplay;
}

/** Asked and not yet painted: a scene on its way, or a job in the queue. */
const asked = new Set<string>();
const queue: PaintJob[] = [];
/** The look the latest ask was for: a job for any other is for a look no longer shown. */
let currentLook = '';
let scheduled = false;

const pictureKey = (source: FoldCardPictureSource, look: string) => `${source.key}|${look}`;

/**
 * Keep what a slice painted, newest last, and let the oldest go past the
 * caps — never what this slice painted, which a card on screen is waiting
 * for: letting it go would only have the card ask for it again.
 */
function keep(painted: readonly { key: string; url: string | null }[]): void {
  const next = new Map(pictures.getState().byKey);
  for (const { key, url } of painted) {
    next.delete(key);
    next.set(key, url);
  }
  const fresh = new Set(painted.map(({ key }) => key));
  let chars = 0;
  for (const url of next.values()) chars += url?.length ?? 0;
  for (const [oldest, url] of next) {
    if (next.size <= MAX_PICTURES && chars <= MAX_PICTURE_CHARS) break;
    if (fresh.has(oldest)) continue;
    next.delete(oldest);
    chars -= url?.length ?? 0;
  }
  pictures.setState({ byKey: next });
}

function drain(): void {
  scheduled = false;
  const start = performance.now();
  const painted: { key: string; url: string | null }[] = [];
  while (performance.now() - start < SLICE_MS) {
    const job = queue.shift();
    if (!job) break;
    asked.delete(job.key);
    if (job.look !== currentLook) continue;
    try {
      painted.push({ key: job.key, url: foldStatePictureUrl(job.scene, job.style, job.display) });
    } catch (error) {
      // Not the user's to act on: the card keeps its blank, and asks again when it next mounts.
      reportError(error, { surface: 'fold:card-picture' });
    }
  }
  if (painted.length > 0) keep(painted);
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // A task of its own, so the strip renders between slices.
  setTimeout(drain, 0);
}

function enqueue(job: PaintJob): void {
  queue.push(job);
  schedule();
}

/** Paint a state's picture in this look, unless it is painted or on its way. */
export function requestFoldCardPicture(
  session: FoldSession,
  source: FoldCardPictureSource,
  style: PaperStyle,
  display: FoldPaneDisplay
): void {
  const look = foldStatePictureKey(style, display);
  currentLook = look;
  const key = pictureKey(source, look);
  if (pictures.getState().byKey.has(key) || asked.has(key)) return;
  asked.add(key);
  const held = session.peek(source.state, FOLD_SCENE_QUERY);
  if (held) {
    enqueue({ key, look, scene: held.value, style, display });
    return;
  }
  session.query(source.state, FOLD_SCENE_QUERY).then(
    (answer) => {
      if (answer.status === 'answered') enqueue({ key, look, scene: answer.value, style, display });
      // A state that went with its engine is asked again under its next handle.
      else asked.delete(key);
    },
    (error: unknown) => {
      asked.delete(key);
      reportError(error, { surface: 'fold:card-picture' });
    }
  );
}

/** A state's picture in this look: its URL, null for nothing to draw, undefined while not painted. */
export function heldFoldCardPicture(
  source: FoldCardPictureSource,
  style: PaperStyle,
  display: FoldPaneDisplay
): string | null | undefined {
  return pictures.getState().byKey.get(pictureKey(source, foldStatePictureKey(style, display)));
}

/** Forget every picture and every job: for tests. */
export function clearFoldCardPictures(): void {
  asked.clear();
  queue.length = 0;
  currentLook = '';
  pictures.setState({ byKey: new Map() });
}

/**
 * A card's picture, in the style the app shows paper in and under the panes'
 * display switches: a data URL; null for a state with nothing to draw, or no
 * state; undefined while it is being painted. Asks for it as the card mounts,
 * and again when the style or the switches change.
 */
export function useFoldCardPicture(source: FoldCardPictureSource | null): string | null | undefined {
  const session = foldSession();
  const style = useInheritedPaperStyle();
  const display = useFoldPaneDisplay();
  const key = source ? pictureKey(source, foldStatePictureKey(style, display)) : null;
  const picture = useStore(pictures, (snapshot) => (key === null ? null : snapshot.byKey.get(key)));
  useEffect(() => {
    if (source && picture === undefined) requestFoldCardPicture(session, source, style, display);
  }, [session, source, style, display, picture]);
  return picture;
}
