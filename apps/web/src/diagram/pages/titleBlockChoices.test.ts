import { describe, expect, it } from 'vitest';
import type { SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import {
  createDiagram,
  createStep,
  createTurn,
  insertSteps,
  removeStepPicture,
  setTitleBlockContent,
  type DiagramDocument,
  type DiagramEntry,
  type DiagramStep,
  type DiagramTitleBlockContentPatch,
} from '../document/diagramDocument';
import { cpSource, cpStep } from '../document/diagramSteps.fixtures';
import { titleBlockChoiceSource, titleBlockChoices, type TitleBlockPartChoices } from './titleBlockChoices';

/**
 * What the Page pane offers for the title block (`implementation-plans/
 * diagram-title-block.md`, section 7): only what the block can show — Auto,
 * named by what it finds, the steps that can give the part, None.
 */

const turn = (id: string) => createTurn({ kind: 'turn-over', axis: 'vertical' }, () => id);
const empty = (id: string) => createStep(() => id);
/** A step a newer build wrote: locked, never the block's. */
const locked = (id: string) => ({ ...cpStep(id), unknown: { id } });
/** An uploaded picture: a picture, and no pattern. */
const upload = (id: string): DiagramStep => ({
  ...createStep(() => id),
  source: { kind: 'upload', assetId: 'asset-1', rotationQuarterTurns: 0, mirrored: false },
  picture: { kind: 'asset', assetId: 'asset-1', paperScale: 1, key: 'upload-asset-1' },
});
/** A step linked to another pattern than `cpStep`'s: a valley across it. */
function otherPattern(id: string): DiagramStep {
  const thumbnail: SheetThumbnail = { viewBox: '0 0 100 100', strokes: [{ x1: 0, y1: 0, x2: 100, y2: 100, role: 'valley' }] };
  return { ...cpStep(id), source: { ...cpSource(), thumbnail } };
}

function diagram(entries: DiagramEntry[], content: DiagramTitleBlockContentPatch = {}): DiagramDocument {
  return setTitleBlockContent(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), entries, 0), content);
}

/** A part's choices as [value, Auto's number, each step offered as `number` or `number!` where it cannot give the part]. */
function offered(part: TitleBlockPartChoices) {
  return [part.value, part.autoNumber, part.steps.map((step) => `${step.number}${step.gives ? '' : '!'}`)];
}

describe('titleBlockChoices', () => {
  it('offers each step with a picture for the model, passing over turns, empty steps and a newer build’s', () => {
    // Numbered s1 1, s2 2, s3 3, s4 4: a turn has no number.
    const { model } = titleBlockChoices(diagram([cpStep('s1'), turn('t1'), empty('s2'), upload('s3'), locked('s4')]));
    expect(offered(model)).toEqual(['auto', 3, ['1', '3']]);
    expect(model.steps.map((step) => step.choice)).toEqual(['step:s1', 'step:s3']);
  });

  it('offers each distinct linked pattern once, by the last step that links it, as the file’s thumbnail table tells them apart', () => {
    // s1, s2 and s4 link one pattern, each through a thumbnail of its own with the same lines; s3 another.
    const document = diagram([cpStep('s1'), cpStep('s2'), otherPattern('s3'), cpStep('s4'), upload('s5')]);
    expect(offered(titleBlockChoices(document).pattern)).toEqual(['auto', 4, ['3', '4']]);
  });

  it('names a pattern by the step chosen for it, where that step links it', () => {
    const document = diagram([cpStep('s1'), cpStep('s2'), otherPattern('s3'), cpStep('s4')], {
      pattern: { kind: 'step', stepId: 's1' },
    });
    expect(offered(titleBlockChoices(document).pattern)).toEqual(['step:s1', 4, ['1', '3']]);
  });

  it('lists a step chosen that can no longer give its part, marked, as what the part is set to', () => {
    const document = removeStepPicture(
      diagram([cpStep('s1'), cpStep('s2'), upload('s3')], {
        model: { kind: 'step', stepId: 's1' },
        pattern: { kind: 'step', stepId: 's3' },
      }),
      's1'
    );
    const { model, pattern } = titleBlockChoices(document);
    expect(offered(model)).toEqual(['step:s1', 3, ['1!', '2', '3']]);
    expect(offered(pattern)).toEqual(['step:s3', 2, ['2', '3!']]);
  });

  it('reads None as None, and a step chosen that is gone as Auto', () => {
    const document = diagram([cpStep('s1'), cpStep('s2')], {
      model: { kind: 'none' },
      pattern: { kind: 'step', stepId: 'gone' },
    });
    const { model, pattern } = titleBlockChoices(document);
    expect(offered(model)).toEqual(['none', 2, ['1', '2']]);
    expect(offered(pattern)).toEqual(['auto', 2, ['2']]);
  });

  it('names no step for Auto, and offers none, where no step has a picture or a link', () => {
    const { model, pattern } = titleBlockChoices(diagram([empty('s1'), turn('t1')]));
    expect(offered(model)).toEqual(['auto', null, []]);
    expect(offered(pattern)).toEqual(['auto', null, []]);
  });
});

describe('titleBlockChoiceSource', () => {
  it('sets a part from a choice: Auto takes its source away', () => {
    expect(titleBlockChoiceSource('auto')).toBe('auto');
    expect(titleBlockChoiceSource('none')).toEqual({ kind: 'none' });
    expect(titleBlockChoiceSource('step:s1')).toEqual({ kind: 'step', stepId: 's1' });
    // A step's id is whatever follows the prefix, a colon in it included.
    expect(titleBlockChoiceSource('step:a:b')).toEqual({ kind: 'step', stepId: 'a:b' });
  });
});
