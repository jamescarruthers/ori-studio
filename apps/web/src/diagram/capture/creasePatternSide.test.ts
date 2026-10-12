import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OristudioCpDocumentState } from '../../engine/oristudioCpTypes';
import { regionReferenceFor } from '../../cp-workspace/regions/regionReference';
import { resetFoldedFigureHandles, setFoldedFigureHandleFree } from '../../cp-workspace/folded/foldedFigureHandles';
import { resolveCpSegments } from '../../lib/creasePatternSegmentation';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { DiagramCpSource, DiagramStep, KnownDiagramAnnotation } from '../document/diagramDocument';
import { stepsIn } from '../document/diagramSteps.fixtures';
import { storedScene } from '../pictures/pictureFrame';
import { cpDocument, fakeCaptureRuntime, twoSquaresSegmentation } from './capture.fixtures';
import { chooseStepCreases } from './captureCreases';
import type { CpCaptureRuntime } from './captureFolded';
import { flipCreasePatternCreases, showCreasePatternSide } from './creasePatternSide';
import { publishOpenLinkedPose } from './openLinkedPose';
import type { DiagramLinkedPose } from './useDiagramLinkedPose';

/**
 * The Step pane's Front | Back for a crease pattern (Zach, 2026-10-05; the
 * colour alone since 2026-10-06), in Pose or not: a pose, through the open
 * step's controller or one made for the verb, so it is Pose's in every way —
 * one undo step, a fingerprint kept as a pose keeps it, the marks left where
 * they are and kept in step with the picture.
 */
const bindings = vi.hoisted(() => ({ runtime: null as CpCaptureRuntime | null }));
vi.mock('../../store/workspaceStore/cpFoldRuntimeBindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/workspaceStore/cpFoldRuntimeBindings')>()),
  createCpCaptureRuntime: () => bindings.runtime,
}));
vi.mock('../../cp-workspace/cpSegmentationArtifacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cp-workspace/cpSegmentationArtifacts')>()),
  ensureCpSegmentationArtifacts: vi.fn(async () => segmentation),
  peekCpSegmentationArtifacts: vi.fn(() => segmentation),
}));
const toasts = vi.hoisted(() => ({ error: vi.fn(), message: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));
const analytics = vi.hoisted(() => ({ trackDiagramPicturePosed: vi.fn() }));
vi.mock('../../analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics')>()),
  ...analytics,
}));

const segmentation = twoSquaresSegmentation();
const [left] = resolveCpSegments(segmentation);
const scope = { kind: 'segment' as const, region: regionReferenceFor(left!) };
const initialState = useWorkspaceStore.getInitialState();
const state = () => useWorkspaceStore.getState();
const document = cpDocument();

/** An arrow bulging one way on the left of the paper: nothing about it is symmetric. */
const ARROW: KnownDiagramAnnotation = { id: 'a', kind: 'valley-arrow', from: [0.2, 0.3], to: [0.45, 0.6], bend: 0.3 };

/** A step linked to the left square, shown as its crease pattern, marked with {@link ARROW}. */
async function markedPattern(): Promise<string> {
  const stepId = state().addDiagramStep()!;
  await state().captureDiagramStep(stepId, {
    scope,
    render: { mode: 'crease-pattern', rotationDeg: 30 },
    kind: 'diagram-capture',
    label: 'Link pattern',
  });
  state().editDiagramAnnotations(stepId, 'Add annotation', () => [ARROW]);
  return stepId;
}

const stepOf = (stepId: string): DiagramStep => stepsIn(state().diagram!).find((step) => step.id === stepId)!;
const sourceOf = (stepId: string) => stepOf(stepId).source as DiagramCpSource;

/** What a step's picture draws. */
const sceneOf = (step: DiagramStep) => storedScene(step.picture as never)!;

beforeEach(async () => {
  vi.clearAllMocks();
  setFoldedFigureHandleFree(() => {});
  await resetFoldedFigureHandles();
  useWorkspaceStore.setState(initialState, true);
  useWorkspaceStore.setState({
    oristudioCpDocument: { handle: 1, document, geometry: null } as unknown as OristudioCpDocumentState,
  });
  bindings.runtime = fakeCaptureRuntime();
});

describe('showCreasePatternSide', () => {
  it('recolours the paper alone, as one pose: the same lines, turn and marks, a picture of its own, counted as the paper’s side', async () => {
    const stepId = await markedPattern();
    const front = stepOf(stepId);
    const past = state().diagramHistory.past.length;
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    const back = stepOf(stepId);
    // The turn it had: nothing mirrored, so nothing turned the other way.
    expect(sourceOf(stepId).render).toEqual({ mode: 'crease-pattern', rotationDeg: 30, side: 'back' });
    expect(sourceOf(stepId).fingerprint).toBe((front.source as DiagramCpSource).fingerprint);
    expect(state().diagramHistory.past.slice(past).map((entry) => entry.label)).toEqual(['Adjust pose']);
    // Its paper the back colour, and every line where it was, mountains and valleys as they were.
    const [seen, recoloured] = [sceneOf(front), sceneOf(back)];
    expect(recoloured.items[0]).toMatchObject({ kind: 'face', side: 'back' });
    expect(seen.items[0]).toMatchObject({ kind: 'face', side: 'front' });
    expect({ ...recoloured.items[0], side: 'front' }).toEqual(seen.items[0]);
    expect(recoloured.items.slice(1)).toEqual(seen.items.slice(1));
    expect(recoloured.bounds).toEqual(seen.bounds);
    // Another picture, so nothing cached serves the other colour; the marks untouched, and in step with it.
    expect(back.picture!.key).not.toBe(front.picture!.key);
    expect(back.annotations).toEqual(front.annotations);
    expect(back.annotatedPictureKey).toBe(back.picture!.key);
    expect(analytics.trackDiagramPicturePosed).toHaveBeenCalledExactlyOnceWith('paper_side', 'crease_pattern', {
      side: 'back',
    });
    expect(state().diagramCaptures).toEqual({});

    // Front again: exactly as it was.
    expect(await showCreasePatternSide(stepId, 'front')).toBe(true);
    const again = stepOf(stepId);
    expect(again.source).toEqual(front.source);
    expect(again.picture).toEqual(front.picture);
    expect(again.annotations).toEqual(front.annotations);
    expect(again.annotatedPictureKey).toBe(front.picture!.key);
    expect(analytics.trackDiagramPicturePosed).toHaveBeenLastCalledWith('paper_side', 'crease_pattern', { side: 'front' });

    // Undone, the back; undone again, the front exactly.
    state().undoDiagram();
    expect(stepOf(stepId)).toEqual(back);
    state().undoDiagram();
    expect(stepOf(stepId)).toEqual(front);
  });

  // A step saved before fingerprints were relative (the crane's own): a pose
  // keeps its `cs1:` fingerprint while its creases match, so its marks stay
  // in step. A plain capture would write the relative one, and leave them
  // out of step with the picture.
  it('keeps a fingerprint from before as a pose does, and the marks of a step that has one in step', async () => {
    const stepId = await markedPattern();
    const choice = chooseStepCreases(document, scope, segmentation);
    if (choice.status !== 'found') throw new Error('the left square');
    const absolute = choice.creases.absolute.drawnFingerprint;
    const step = stepOf(stepId);
    useWorkspaceStore.setState({
      diagram: {
        ...state().diagram!,
        steps: [{ ...step, source: { ...(step.source as DiagramCpSource), fingerprint: absolute } }],
      },
    });
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    expect(sourceOf(stepId).fingerprint).toBe(absolute);
    expect(stepOf(stepId).annotatedPictureKey).toBe(stepOf(stepId).picture!.key);
    expect(stepOf(stepId).annotations).toEqual([ARROW]);
  });

  it('does nothing for the side it shows, a step shown another way, or a read-only diagram', async () => {
    const stepId = await markedPattern();
    const past = state().diagramHistory.past.length;
    expect(await showCreasePatternSide(stepId, 'front')).toBe(true);
    useWorkspaceStore.setState({ diagramReadOnly: true });
    expect(await showCreasePatternSide(stepId, 'back')).toBe(false);
    useWorkspaceStore.setState({ diagramReadOnly: false });
    expect(state().diagramHistory.past.length).toBe(past);
    expect(sourceOf(stepId).render).toEqual({ mode: 'crease-pattern', rotationDeg: 30 });
    const flat = state().addDiagramStep()!;
    await state().captureDiagramStep(flat, {
      scope,
      render: { mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 1 },
      kind: 'diagram-capture',
      label: 'Link pattern',
    });
    const linked = state().diagramHistory.past.length;
    // A flat fold's side is Pose's Turn Over, not this field's.
    expect(await showCreasePatternSide(flat, 'back')).toBe(false);
    expect(state().diagramHistory.past.length).toBe(linked);
    expect(analytics.trackDiagramPicturePosed).not.toHaveBeenCalled();
  });

  it('goes through the open step’s Pose, whose controller holds the step', async () => {
    const stepId = await markedPattern();
    const setSide = vi.fn(async () => true);
    publishOpenLinkedPose(stepId, openPose({ setSide }));
    const past = state().diagramHistory.past.length;
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    expect(setSide).toHaveBeenCalledWith('back');
    expect(state().diagramHistory.past.length).toBe(past);
    publishOpenLinkedPose(null, null);
  });
});

/** The open step's Pose, as the detail publishes it: every verb a stand-in but those given. */
function openPose(verbs: Partial<DiagramLinkedPose>): DiagramLinkedPose {
  return {
    actions: [],
    layerOrder: null,
    spatial: null,
    onCamera: () => {},
    registerLiveView: () => () => {},
    rotateTo: () => {},
    showAs: async () => true,
    setSide: async () => true,
    setFlipCreases: async () => true,
    simulate: async () => {},
    wantsRest: () => false,
    spread: null,
    preview: null,
    ...verbs,
  };
}

// Zach, 2026-10-12: one pattern drawn from the front, its creases flipped for the steps seen from the back.
describe('flipCreasePatternCreases', () => {
  /** A step on its back, as {@link markedPattern} makes it and the side sets it. */
  async function markedBack(): Promise<string> {
    const stepId = await markedPattern();
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    vi.clearAllMocks();
    return stepId;
  }

  const roles = (step: DiagramStep) => sceneOf(step).items.flatMap((item) => (item.kind === 'line' ? [item.role] : []));

  it('swaps the mountains and valleys alone, as one pose: the same lines, turn, colour and marks, counted as on or off', async () => {
    const stepId = await markedBack();
    const back = stepOf(stepId);
    const past = state().diagramHistory.past.length;
    expect(await flipCreasePatternCreases(stepId, true)).toBe(true);
    const flipped = stepOf(stepId);
    expect(sourceOf(stepId).render).toEqual({ mode: 'crease-pattern', rotationDeg: 30, side: 'back', flipCreases: true });
    expect(sourceOf(stepId).fingerprint).toBe((back.source as DiagramCpSource).fingerprint);
    expect(state().diagramHistory.past.slice(past).map((entry) => entry.label)).toEqual(['Adjust pose']);
    // Every mountain a valley and every valley a mountain, every line where it was; the paper's back colour as it was.
    expect(roles(back)).toEqual(['aux', 'diagram-mountain', 'edge', 'edge', 'edge', 'edge']);
    expect(roles(flipped)).toEqual(['aux', 'diagram-valley', 'edge', 'edge', 'edge', 'edge']);
    const [seen, swapped] = [sceneOf(back), sceneOf(flipped)];
    expect(swapped.items[0]).toEqual(seen.items[0]);
    expect(swapped.items.map((item) => ({ ...item, role: undefined }))).toEqual(
      seen.items.map((item) => ({ ...item, role: undefined }))
    );
    expect(swapped.bounds).toEqual(seen.bounds);
    // Another picture; the marks where they were, named as they were, and in step with it.
    expect(flipped.picture!.key).not.toBe(back.picture!.key);
    expect(flipped.annotations).toEqual([ARROW]);
    expect(flipped.annotatedPictureKey).toBe(flipped.picture!.key);
    expect(analytics.trackDiagramPicturePosed).toHaveBeenCalledExactlyOnceWith('flip_creases_on', 'crease_pattern', {});
    expect(state().diagramCaptures).toEqual({});

    // Off again: exactly as it was.
    expect(await flipCreasePatternCreases(stepId, false)).toBe(true);
    expect(stepOf(stepId).source).toEqual(back.source);
    expect(stepOf(stepId).picture).toEqual(back.picture);
    expect(analytics.trackDiagramPicturePosed).toHaveBeenLastCalledWith('flip_creases_off', 'crease_pattern', {});

    // Undone, flipped; undone again, the back exactly.
    state().undoDiagram();
    expect(stepOf(stepId)).toEqual(flipped);
    state().undoDiagram();
    expect(stepOf(stepId)).toEqual(back);
  });

  it('is kept on the front, where the creases are drawn as they are, and the back brings it back', async () => {
    const stepId = await markedBack();
    const front = stepOf(stepId);
    expect(await showCreasePatternSide(stepId, 'front')).toBe(true);
    const unflipped = stepOf(stepId);
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    expect(await flipCreasePatternCreases(stepId, true)).toBe(true);
    const flipped = stepOf(stepId);
    expect(await showCreasePatternSide(stepId, 'front')).toBe(true);
    // Kept, and inert: the front's picture, mountains and valleys as they are.
    expect(sourceOf(stepId).render).toEqual({ mode: 'crease-pattern', rotationDeg: 30, flipCreases: true });
    expect(stepOf(stepId).picture).toEqual(unflipped.picture);
    expect(roles(stepOf(stepId))).toEqual(['aux', 'diagram-mountain', 'edge', 'edge', 'edge', 'edge']);
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    expect(stepOf(stepId).source).toEqual(flipped.source);
    expect(stepOf(stepId).picture).toEqual(flipped.picture);
    expect(front.source).not.toEqual(flipped.source);
  });

  it('does nothing on the front, for the state it is in, a step shown another way, or a read-only diagram', async () => {
    const stepId = await markedPattern();
    const past = state().diagramHistory.past.length;
    // On the front there is no such field.
    expect(await flipCreasePatternCreases(stepId, true)).toBe(false);
    expect(sourceOf(stepId).render).toEqual({ mode: 'crease-pattern', rotationDeg: 30 });
    expect(await showCreasePatternSide(stepId, 'back')).toBe(true);
    const back = state().diagramHistory.past.length;
    expect(await flipCreasePatternCreases(stepId, false)).toBe(true);
    useWorkspaceStore.setState({ diagramReadOnly: true });
    expect(await flipCreasePatternCreases(stepId, true)).toBe(false);
    useWorkspaceStore.setState({ diagramReadOnly: false });
    expect(state().diagramHistory.past.length).toBe(back);
    expect(back).toBe(past + 1);
    const flat = state().addDiagramStep()!;
    await state().captureDiagramStep(flat, {
      scope,
      render: { mode: 'folded-flat', side: 'back', rotationDeg: 0, foldCase: 1 },
      kind: 'diagram-capture',
      label: 'Link pattern',
    });
    const linked = state().diagramHistory.past.length;
    expect(await flipCreasePatternCreases(flat, true)).toBe(false);
    expect(state().diagramHistory.past.length).toBe(linked);
    expect(analytics.trackDiagramPicturePosed).toHaveBeenCalledExactlyOnceWith('paper_side', 'crease_pattern', { side: 'back' });
  });

  it('goes through the open step’s Pose, whose controller holds the step', async () => {
    const stepId = await markedBack();
    const setFlipCreases = vi.fn(async () => true);
    publishOpenLinkedPose(stepId, openPose({ setFlipCreases }));
    const past = state().diagramHistory.past.length;
    expect(await flipCreasePatternCreases(stepId, true)).toBe(true);
    expect(setFlipCreases).toHaveBeenCalledWith(true);
    expect(state().diagramHistory.past.length).toBe(past);
    publishOpenLinkedPose(null, null);
  });
});
