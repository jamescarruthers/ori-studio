import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  createStep,
  createTurn,
  insertSteps,
  removeStepPicture,
  removeSteps,
  setTitleBlockContent,
  type DiagramCpSource,
  type DiagramDocument,
  type DiagramEntry,
  type DiagramStep,
  type DiagramTitleBlockContentPatch,
} from '../document/diagramDocument';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import { readDiagram, writeDiagram } from '../document/diagramFile';
import { cpSource, cpStep, referencesStep } from '../document/diagramSteps.fixtures';
import { autoModelStep, autoPatternStep, resolveTitleBlock } from './titleBlockContent';

/**
 * What the first page's title block shows (`implementation-plans/
 * diagram-title-block.md`, sections 4 and 5): Auto, a chosen step, or none,
 * for the model and the pattern alike.
 */

const turn = (id: string) => createTurn({ kind: 'turn-over', axis: 'vertical' }, () => id);
const empty = (id: string) => createStep(() => id);
/** A step a newer build wrote: locked, never the block's. */
const locked = (id: string) => ({ ...cpStep(id), unknown: { id } });
/** A linked step shown folded, on a pattern of its own: a valley across it. */
function folded(id: string): DiagramStep {
  const thumbnail: SheetThumbnail = { viewBox: '0 0 100 100', strokes: [{ x1: 0, y1: 0, x2: 100, y2: 100, role: 'valley' }] };
  return { ...cpStep(id), source: { ...cpSource({ mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 0 }), thumbnail } };
}
/** An uploaded picture: a picture, and no pattern. */
const upload = (id: string): DiagramStep => ({
  ...createStep(() => id),
  source: { kind: 'upload', assetId: 'asset-1', rotationQuarterTurns: 0, mirrored: false },
  picture: { kind: 'asset', assetId: 'asset-1', paperScale: 1, key: 'upload-asset-1' },
});

function diagram(entries: DiagramEntry[], content: DiagramTitleBlockContentPatch = {}): DiagramDocument {
  return setTitleBlockContent(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), entries, 0), content);
}

/** Each part as where it comes from and its step's id. */
function shown(document: DiagramDocument) {
  const { model, pattern } = resolveTitleBlock(document);
  return { model: [model.from, model.step?.id ?? null], pattern: [pattern.from, pattern.step?.id ?? null] };
}

describe('resolveTitleBlock', () => {
  it('finds the last step with a picture for the model, and the last linked step for the pattern, by Auto', () => {
    const pattern = folded('s2');
    const document = diagram([cpStep('s1'), pattern, upload('s3')]);
    expect(shown(document)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's2'] });
    // Shown folded, a link still names its pattern: the lines are its stored thumbnail's.
    expect(resolveTitleBlock(document).pattern.thumbnail).toBe((pattern.source as DiagramCpSource).thumbnail);
  });

  it('passes over turns, empty steps and a newer build’s steps, so a diagram ending in a turn still finds its model', () => {
    const document = diagram([cpStep('s1'), cpStep('s2'), locked('s3'), empty('s4'), turn('t1')]);
    expect(shown(document)).toEqual({ model: ['auto', 's2'], pattern: ['auto', 's2'] });
  });

  it('finds no pattern where no step is linked to a crease pattern: a References step’s sheet is not the model’s pattern', () => {
    const document = diagram([referencesStep('r1'), empty('s2')]);
    expect(shown(document)).toEqual({ model: ['auto', 'r1'], pattern: ['auto', null] });
    expect(resolveTitleBlock(document).pattern.thumbnail).toBeNull();
    expect(shown(diagram([]))).toEqual({ model: ['auto', null], pattern: ['auto', null] });
  });

  it('shows a chosen step, and none where none is chosen', () => {
    const steps = [cpStep('s1'), folded('s2'), cpStep('s3')];
    expect(shown(diagram(steps, { model: { kind: 'step', stepId: 's1' }, pattern: { kind: 'step', stepId: 's2' } }))).toEqual({
      model: ['step', 's1'],
      pattern: ['step', 's2'],
    });
    const none = diagram(steps, { model: { kind: 'none' }, pattern: { kind: 'none' } });
    expect(shown(none)).toEqual({ model: ['none', null], pattern: ['none', null] });
    expect(resolveTitleBlock(none).pattern.thumbnail).toBeNull();
  });

  it('reads a chosen step that is gone, or a newer build’s now, as Auto: its id left as it is', () => {
    const chosen = diagram([cpStep('s1'), cpStep('s2'), cpStep('s3')], {
      model: { kind: 'step', stepId: 's1' },
      pattern: { kind: 'step', stepId: 's1' },
    });
    const removed = removeSteps(chosen, ['s1']);
    expect(removed.titleBlockContent).toEqual(chosen.titleBlockContent);
    expect(shown(removed)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's3'] });
    const newer = { ...chosen, steps: chosen.steps.map((entry) => (entry.id === 's1' ? locked('s1') : entry)) };
    expect(shown(newer)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's3'] });
    // A turn has no number and no picture: never the model, though its id be chosen.
    const turned = diagram([cpStep('s1'), turn('t1')], { model: { kind: 'step', stepId: 't1' } });
    expect(shown(turned).model).toEqual(['auto', 's1']);
  });

  it('shows nothing for a chosen step that can no longer give its part, and says which step that is', () => {
    const chosen = diagram([cpStep('s1'), cpStep('s2'), empty('s3')], {
      model: { kind: 'step', stepId: 's1' },
      pattern: { kind: 'step', stepId: 's3' },
    });
    const pictureless = removeStepPicture(chosen, 's1');
    const { model, pattern } = resolveTitleBlock(pictureless);
    expect([model.from, model.step?.id, model.step?.picture]).toEqual(['step', 's1', null]);
    expect([pattern.from, pattern.step?.id, pattern.thumbnail]).toEqual(['step', 's3', null]);
  });

  it('shows Auto for a part only a newer build reads', () => {
    const written = JSON.parse(JSON.stringify(writeDiagram(diagram([cpStep('s1'), cpStep('s2')], { pattern: { kind: 'none' } }))));
    written.titleBlockContent = { ...written.titleBlockContent, model: { kind: 'own', step: { id: 'title-model' } } };
    const { document } = readDiagram(written)!;
    expect(shown(document)).toEqual({ model: ['auto', 's2'], pattern: ['none', null] });
  });

  it('names what Auto finds whatever is chosen, for the Page pane to offer', () => {
    const document = diagram([cpStep('s1'), folded('s2'), empty('s3')], { model: { kind: 'none' }, pattern: { kind: 'step', stepId: 's1' } });
    expect(autoModelStep(document)?.id).toBe('s2');
    expect(autoPatternStep(document)?.id).toBe('s2');
  });
});
