import { describe, expect, it } from 'vitest';

import {
  createDiagram,
  insertSteps,
  posedRenderOf,
  renderToShowAs,
  withRememberedPoses,
  type DiagramCpRender,
  type DiagramFoldStepSource,
} from './diagramDocument';
import { readDiagram, storedFoldStepSource, storedSceneJson, writeDiagram } from './diagramFile';
import {
  cpSource,
  fixedPicture,
  foldStepSource,
  foldStepStep,
  scenePicture,
  stepDiagramPicture,
  stepsIn,
} from './diagramSteps.fixtures';

/** What `serializeNativeProjectFile` does to the value, and back. */
const throughJson = (value: unknown) => JSON.parse(JSON.stringify(value, null, 2));

/** A flat fold's scene of two faces, and its faces on the paper as a capture keeps them. */
function flatPictureWithFaces() {
  const scene = {
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    sheet: 10,
    items: [{ kind: 'face', face: 0, side: 'front', rings: [[[0, 0], [10, 0], [10, 10], [0, 10]]], shade: 1, hidden: false }],
  };
  const paperFaces = JSON.stringify({
    points: [
      [0, 0, 0, 0],
      [5, 0, 10, 0],
      [5, 5, 10, 10],
      [0, 5, 0, 10],
    ],
    rings: [[0, 1, 2, 3]],
    levels: [0],
  });
  return { ...scenePicture('scene-fold'), sceneJson: storedSceneJson(scene)!, paperFaces };
}

function foldDiagram() {
  const steps = [
    foldStepStep('step-before', {}, flatPictureWithFaces()),
    foldStepStep('step-pattern', {
      moment: 'after',
      render: { mode: 'crease-pattern', rotationDeg: 90, side: 'back' },
      remembered: { folded: { mode: 'folded-flat', side: 'back', rotationDeg: 180, foldCase: 1 } },
    }),
    // The flat sheet's first step, which says nothing: no sentence.
    { ...foldStepStep('step-quiet', { sentence: undefined }), text: '' },
    // Not captured yet.
    foldStepStep('step-unposed', {}, null),
  ];
  return insertSteps(createDiagram({ title: 'Crane' }), steps, 0);
}

/** The written diagram, with step `index`'s source patched as a hand or a newer build would. */
function writtenWith(index: number, patch: (source: Record<string, unknown>) => Record<string, unknown>) {
  const written = throughJson(writeDiagram(foldDiagram()));
  written.steps[index].source = patch(written.steps[index].source);
  return written;
}

describe('a Fold step in the file (D17)', () => {
  it('round-trips every field, its faces on the paper and its remembered pose, byte for byte', () => {
    const document = foldDiagram();
    const written = throughJson(writeDiagram(document));
    const read = readDiagram(written)!;
    expect(read.readOnly).toBe(false);
    expect(read.document).toEqual(document);
    expect(stepsIn(read.document).every((step) => step.unknown === undefined)).toBe(true);
    expect(JSON.stringify(throughJson(writeDiagram(read.document)))).toBe(JSON.stringify(written));
  });

  it('writes its fields in one order, so a capture and a load agree field for field', () => {
    const source = foldStepSource({ remembered: { 'crease-pattern': { mode: 'crease-pattern', rotationDeg: 0 } } });
    const shuffled = Object.fromEntries(Object.entries(source).reverse()) as unknown as DiagramFoldStepSource;
    const stored = storedFoldStepSource(shuffled)!;
    expect(Object.keys(stored)).toEqual([
      'kind',
      'sequence',
      'step',
      'moment',
      'path',
      'state',
      'engine',
      'thumbnail',
      'render',
      'remembered',
      'sentence',
    ]);
    expect(stored).toEqual(source);
  });

  it.each([
    ['a field it has no name for', (source: Record<string, unknown>) => ({ ...source, branch: 'fstep-9' })],
    ['a moment it does not know', (source: Record<string, unknown>) => ({ ...source, moment: 'during' })],
    [
      'a 3D render',
      (source: Record<string, unknown>) => ({
        ...source,
        render: { mode: 'folded-3d', side: 'front', camera: { yaw: 0, pitch: 0, zoom: 1 } },
      }),
    ],
    [
      'a render mode no build has yet',
      (source: Record<string, unknown>) => ({ ...source, render: { mode: 'exploded', rotationDeg: 0 } }),
    ],
    [
      'a render field it has no name for',
      (source: Record<string, unknown>) => ({ ...source, render: { ...(source.render as object), tilt: 3 } }),
    ],
    [
      'a pose remembered for a way a Fold step is not shown in',
      (source: Record<string, unknown>) => ({
        ...source,
        remembered: { simulated: { mode: 'simulated', foldPercent: 0, view: { yaw: 0, pitch: 0, zoom: 1 } } },
      }),
    ],
  ])('carries a Fold step with %s, locked, and writes it back byte for byte', (_label, patch) => {
    const written = writtenWith(0, patch);
    const read = readDiagram(written)!;
    expect(read.readOnly).toBe(false);
    expect(stepsIn(read.document)[0].unknown).toEqual(written.steps[0]);
    expect(stepsIn(read.document).slice(1).every((step) => step.unknown === undefined)).toBe(true);
    expect(JSON.stringify(writeDiagram(read.document))).toBe(JSON.stringify(written));
  });

  it.each([
    ['no sequence', (source: Record<string, unknown>) => ({ ...source, sequence: '' })],
    ['no step', (source: Record<string, unknown>) => ({ ...source, step: 7 })],
    ['no path', (source: Record<string, unknown>) => ({ ...source, path: null })],
    ['no state', (source: Record<string, unknown>) => ({ ...source, state: undefined })],
    ['an engine version that is not a whole number', (source: Record<string, unknown>) => ({ ...source, engine: 1.5 })],
    ['a thumbnail that does not read', (source: Record<string, unknown>) => ({ ...source, thumbnail: { viewBox: 'x' } })],
    [
      'a flat fold at a second layer order',
      (source: Record<string, unknown>) => ({ ...source, render: { ...(source.render as object), foldCase: 2 } }),
    ],
  ])('drops a Fold step’s source with %s as damage, and keeps the step’s words', (_label, patch) => {
    const step = stepsIn(readDiagram(writtenWith(0, patch))!.document)[0];
    expect(step.unknown).toBeUndefined();
    expect(step.source).toBeNull();
    expect(step.picture).toBeNull();
    expect(step.text).toBe('Valley fold the bottom edge to the top.');
  });

  it('drops a remembered pose or a sentence that does not read alone, and keeps the link', () => {
    const written = writtenWith(1, (source) => ({
      ...source,
      remembered: { folded: { mode: 'folded-flat', side: 'up', rotationDeg: 0, foldCase: 1 } },
      sentence: 3,
    }));
    const source = stepsIn(readDiagram(written)!.document)[1].source as DiagramFoldStepSource;
    expect(source.kind).toBe('fold-step');
    expect(source.remembered).toBeUndefined();
    expect(source.sentence).toBeUndefined();
  });

  it('keeps a scene or a bitmap, and leaves out a picture a Fold state is never drawn as', () => {
    const written = throughJson(writeDiagram(foldDiagram()));
    written.steps[1].picture = fixedPicture();
    written.steps[2].picture = stepDiagramPicture();
    const steps = stepsIn(readDiagram(written)!.document);
    expect(steps[0].picture?.kind).toBe('scene');
    expect(steps[1].picture).toBeNull();
    expect(steps[2].picture).toBeNull();
    // Each still links to its step.
    expect(steps.slice(0, 3).every((step) => step.source?.kind === 'fold-step')).toBe(true);
  });

  it('keeps a flat fold’s faces on the paper that agree with its scene, and drops those that do not', () => {
    const written = throughJson(writeDiagram(foldDiagram()));
    expect(stepsIn(readDiagram(written)!.document)[0].picture).toMatchObject({ paperFaces: expect.any(String) });
    // No face for the one its scene draws.
    written.steps[0].picture.paperFaces = JSON.stringify({ points: [], rings: [], levels: [] });
    const picture = stepsIn(readDiagram(written)!.document)[0].picture;
    expect(picture?.kind).toBe('scene');
    expect(picture && 'paperFaces' in picture ? picture.paperFaces : undefined).toBeUndefined();
  });
});

describe('a Fold step’s pose', () => {
  it('is read through the one seam a linked pattern’s is', () => {
    const flat: DiagramCpRender = { mode: 'folded-flat', side: 'back', rotationDeg: 90, foldCase: 1 };
    const source = foldStepSource({ render: flat });
    expect(posedRenderOf(source)).toBe(source.render);
    expect(source.render).toEqual(flat);
    expect(posedRenderOf(cpSource())).toEqual({ mode: 'crease-pattern', rotationDeg: 0 });
    expect(posedRenderOf(null)).toBeNull();
    expect(posedRenderOf({ kind: 'upload', assetId: 'a', rotationQuarterTurns: 0, mirrored: false })).toBeNull();
  });

  it('remembers the way it was shown when shown another way, as a linked pattern does', () => {
    const before = foldStepSource();
    const pattern = renderToShowAs(before, 'crease-pattern');
    expect(pattern).toEqual({ mode: 'crease-pattern', rotationDeg: 0 });
    const after = withRememberedPoses(before, foldStepSource({ render: pattern }));
    expect(after.remembered).toEqual({ folded: before.render });
    // Back to Folded: the flat fold it had.
    expect(renderToShowAs(after, 'folded')).toEqual(before.render);
  });

  it('remembers nothing across kinds of source: a pattern’s pose is not a Fold step’s', () => {
    const linked = { ...cpSource({ mode: 'folded-flat', side: 'front', rotationDeg: 30, foldCase: 3 }) };
    const after = withRememberedPoses(linked, foldStepSource({ render: { mode: 'crease-pattern', rotationDeg: 0 } }));
    expect(after.remembered).toBeUndefined();
  });
});
