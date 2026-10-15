import { describe, expect, it } from 'vitest';
import { removeStepPicture, setTitleBlockContent } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import {
  emptyStep,
  lockedStep,
  patternStep,
  titleBlockDiagram,
  turnOver,
  uploadStep,
} from './titleBlock.fixtures';
import { titleBlockChoiceSource, titleBlockChoices, type TitleBlockPartChoices } from './titleBlockChoices';

/**
 * What the Page pane offers for the title block (`implementation-plans/
 * diagram-title-block.md`, section 7): only what the block can show — Auto,
 * named by what it finds, the steps that can give the part, None.
 */

/** A part's choices as [value, Auto's number, each step offered as `number` or `number!` where it cannot give the part]. */
function offered(part: TitleBlockPartChoices) {
  return [part.value, part.autoNumber, part.steps.map((step) => `${step.number}${step.gives ? '' : '!'}`)];
}

describe('titleBlockChoices', () => {
  it('offers each step with a picture for the model, passing over turns, empty steps and a newer build’s', () => {
    // Numbered s1 1, s2 2, s3 3, s4 4: a turn has no number.
    const { model } = titleBlockChoices(titleBlockDiagram([cpStep('s1'), turnOver('t1'), emptyStep('s2'), uploadStep('s3'), lockedStep('s4')]));
    expect(offered(model)).toEqual(['auto', 3, ['1', '3']]);
    expect(model.steps.map((step) => step.choice)).toEqual(['step:s1', 'step:s3']);
  });

  it('offers each distinct linked pattern once, by the last step that links it, as the file’s thumbnail table tells them apart', () => {
    // s1, s2 and s4 link one pattern, each through a thumbnail of its own with the same lines; s3 another.
    const document = titleBlockDiagram([cpStep('s1'), cpStep('s2'), patternStep('s3'), cpStep('s4'), uploadStep('s5')]);
    expect(offered(titleBlockChoices(document).pattern)).toEqual(['auto', 4, ['3', '4']]);
  });

  it('offers no linked step whose pattern draws nothing, and Auto passes over it, as the page does', () => {
    // s3's capture found no line, s4's aux lines only.
    const aux = [{ x1: 0, y1: 50, x2: 100, y2: 50, role: 'aux' as const }];
    const document = titleBlockDiagram([cpStep('s1'), patternStep('s2'), patternStep('s3', []), patternStep('s4', aux)]);
    expect(offered(titleBlockChoices(document).pattern)).toEqual(['auto', 2, ['1', '2']]);
    // Chosen, it is listed as what the part is set to, marked as one that gives none.
    const chosen = setTitleBlockContent(document, { pattern: { kind: 'step', stepId: 's4' } });
    expect(offered(titleBlockChoices(chosen).pattern)).toEqual(['step:s4', 2, ['1', '2', '4!']]);
  });

  it('names a pattern by the step chosen for it, where that step links it', () => {
    const document = titleBlockDiagram([cpStep('s1'), cpStep('s2'), patternStep('s3'), cpStep('s4')], {
      pattern: { kind: 'step', stepId: 's1' },
    });
    expect(offered(titleBlockChoices(document).pattern)).toEqual(['step:s1', 4, ['1', '3']]);
  });

  it('lists a step chosen that can no longer give its part, marked, as what the part is set to', () => {
    const document = removeStepPicture(
      titleBlockDiagram([cpStep('s1'), cpStep('s2'), uploadStep('s3')], {
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
    const document = titleBlockDiagram([cpStep('s1'), cpStep('s2')], {
      model: { kind: 'none' },
      pattern: { kind: 'step', stepId: 'gone' },
    });
    const { model, pattern } = titleBlockChoices(document);
    expect(offered(model)).toEqual(['none', 2, ['1', '2']]);
    expect(offered(pattern)).toEqual(['auto', 2, ['2']]);
  });

  it('names no step for Auto, and offers none, where no step has a picture or a link', () => {
    const { model, pattern } = titleBlockChoices(titleBlockDiagram([emptyStep('s1'), turnOver('t1')]));
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
