import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import {
  PAGE_SETTINGS,
  createDiagram,
  insertSteps,
  setPageSetup,
  stepsOf,
  type DiagramDocument,
  type DiagramStep,
  type DiagramTitleBlockContentPatch,
  type DiagramTitleBlockCreditEdit,
} from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { paginate } from '../../diagram/pages/pagePlan';
import { useWorkspaceStore } from '../workspaceStore';

/**
 * What the first page's title block says, through the store
 * (`implementation-plans/diagram-title-block.md`, Phase 1c, Zach's header of
 * 2026-10-15): a new diagram's subtitle and credits, written at its creation
 * in the app's language.
 */

const state = () => useWorkspaceStore.getState();

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('a new diagram’s title block', () => {
  it('is written with the diagram’s first edit: the subtitle, and Author, Recommended size and the live step count', () => {
    expect(state().diagram).toBeNull();
    expect(state().setDiagramTitle('Crane')).toBe(true);
    expect(state().diagram!.page.titleBlock).toEqual({ enabled: true, heightShare: 0.23 });
    expect(state().diagram!.titleBlockContent).toEqual({
      subtitle: 'Origami diagram',
      credits: [
        { label: 'Author', value: '' },
        { label: 'Recommended size', value: '' },
        { label: 'Steps', value: { kind: 'step-count' } },
      ],
    });
    // One undo step for the edit that made it, which takes the diagram away again.
    expect(state().undoDiagram()).toBe(true);
    expect(state().diagram).toBeNull();
  });

  it('is written in the app’s language', async () => {
    i18n.addResourceBundle(
      'ja',
      'panels',
      { diagram: { titleBlock: { default: { subtitle: '折り紙の図', author: '作者', recommendedSize: '推奨サイズ', steps: '工程数' } } } },
      true,
      true
    );
    await i18n.changeLanguage('ja');
    state().addDiagramStep();
    expect(state().diagram!.titleBlockContent).toEqual({
      subtitle: '折り紙の図',
      credits: [
        { label: '作者', value: '' },
        { label: '推奨サイズ', value: '' },
        { label: '工程数', value: { kind: 'step-count' } },
      ],
    });
  });

  it('is the author’s from then on: edited as any title block’s is', () => {
    state().setDiagramTitle('Crane');
    expect(state().setDiagramTitleBlockContent({ credits: { op: 'set', at: 0, value: 'Traditional' } })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ subtitle: '' })).toBe(true);
    expect(state().diagram!.titleBlockContent).toEqual({
      credits: [
        { label: 'Author', value: 'Traditional' },
        { label: 'Recommended size', value: '' },
        { label: 'Steps', value: { kind: 'step-count' } },
      ],
    });
  });

  it('is never given to a diagram from a file, which says what it has', () => {
    const document = setPageSetup(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), {
      titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    });
    state().installDiagram({ document, readOnly: false, raw: {} });
    expect(state().addDiagramStep()).not.toBeNull();
    expect(state().setDiagramTitle('Swan')).toBe(true);
    expect(state().diagram!.titleBlockContent).toBeUndefined();
    expect(state().diagram!.page.titleBlock).toEqual(PAGE_SETTINGS.titleBlock.legacy);
  });
});

describe('setDiagramTitleBlockShown, the block’s toggle', () => {
  /** Zach's crane as saved: 28 steps, 9 a page, pages two and three of their own 11 and 9, and no block. */
  function crane(): DiagramDocument {
    const steps = Array.from({ length: 28 }, (_, index): DiagramStep => ({
      ...cpStep(`s${index}`),
      ...(index === 9 ? { pageSteps: 11 } : index === 20 ? { pageSteps: 9 } : {}),
    }));
    const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
      layout: 'flow',
      stepsPerPage: 9,
      titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    });
    state().installDiagram({ document, readOnly: false, raw: {} });
    return document;
  }
  const counts = () => paginate(stepsOf(state().diagram!), state().diagram!.page).map((page) => page.steps.length);

  it('turns the crane’s block on as a new diagram’s — today’s height, the subtitle and three credits — in one undo step (Zach, 2026-10-15)', () => {
    const saved = crane();
    expect(counts()).toEqual([9, 11, 8]);
    expect(state().setDiagramTitleBlockShown(true)).toBe(true);
    expect(state().diagram!.page.titleBlock).toEqual(PAGE_SETTINGS.titleBlock.default);
    expect(state().diagram!.titleBlockContent).toEqual({
      subtitle: 'Origami diagram',
      credits: [
        { label: 'Author', value: '' },
        { label: 'Recommended size', value: '' },
        { label: 'Steps', value: { kind: 'step-count' } },
      ],
    });
    // The later pages keep their counts and shift (Zach, 2026-10-15).
    expect(counts()).toEqual([7, 11, 9, 1]);
    expect(state().diagramHistory.past).toHaveLength(1);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Show title block');
    expect(state().undoDiagram()).toBe(true);
    expect(state().diagram).toEqual(saved);
    // Already as asked: nothing recorded.
    expect(state().setDiagramTitleBlockShown(false)).toBe(false);
    expect(state().diagramHistory.past).toHaveLength(0);
  });

  it('writes the words in the app’s language, and keeps its height and its words when turned off', async () => {
    i18n.addResourceBundle(
      'ja',
      'panels',
      { diagram: { titleBlock: { default: { subtitle: '折り紙の図', author: '作者', recommendedSize: '推奨サイズ', steps: '工程数' } } } },
      true,
      true
    );
    await i18n.changeLanguage('ja');
    crane();
    state().setDiagramTitleBlockShown(true);
    const content = state().diagram!.titleBlockContent;
    expect(content?.credits?.map(({ label }) => label)).toEqual(['作者', '推奨サイズ', '工程数']);
    expect(state().setDiagramTitleBlockShown(false)).toBe(true);
    expect(state().diagram!.page.titleBlock).toEqual({ ...PAGE_SETTINGS.titleBlock.default, enabled: false });
    expect(state().diagram!.titleBlockContent).toBe(content);
    expect(counts()).toEqual([9, 11, 8]);
  });
});

describe('setDiagramTitleBlockContent, every part of the header', () => {
  const undoSteps = () => state().diagramHistory.past.length;
  const credits = () => state().diagram!.titleBlockContent?.credits;
  const content = () => state().diagram!.titleBlockContent;

  /** A diagram from a file, its block on, its content saying nothing. */
  function install(readOnly = false): DiagramDocument {
    const document = setPageSetup(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), {
      titleBlock: { enabled: true, heightShare: 0.27 },
    });
    state().installDiagram({ document, readOnly, raw: {} });
    return document;
  }

  it('edits the credits one undo step at a time — added, named, valued, made live and back, removed — each taken back exactly', () => {
    const installed = install();
    const set = (edit: DiagramTitleBlockCreditEdit) => state().setDiagramTitleBlockContent({ credits: edit });
    const seen: (DiagramDocument | null)[] = [state().diagram];
    const step = (ok: boolean) => {
      expect(ok).toBe(true);
      seen.push(state().diagram);
    };
    step(set({ op: 'add', credit: { label: 'Author', value: '' } }));
    step(set({ op: 'add' }));
    step(set({ op: 'set', at: 1, label: 'Steps' }));
    step(set({ op: 'set', at: 1, value: { kind: 'step-count' } }));
    step(set({ op: 'set', at: 0, value: 'Traditional' }));
    step(set({ op: 'set', at: 1, value: '28' }));
    step(set({ op: 'add', credit: { label: 'Paper', value: '15 cm' }, at: 0 }));
    step(set({ op: 'remove', at: 2 }));
    expect(credits()).toEqual([
      { label: 'Paper', value: '15 cm' },
      { label: 'Author', value: 'Traditional' },
    ]);
    expect(undoSteps()).toBe(8);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Change title block');
    // What changes nothing records nothing: a place past the list, a value as it is.
    expect(set({ op: 'remove', at: 5 })).toBe(false);
    expect(set({ op: 'set', at: 1, value: 'Traditional' })).toBe(false);
    expect(undoSteps()).toBe(8);
    for (let index = seen.length - 2; index >= 0; index -= 1) {
      state().undoDiagram();
      expect(state().diagram).toBe(seen[index]);
    }
    expect(state().diagram).toBe(installed);
  });

  it('takes a sitting at a text field as one undo step: the subtitle, a credit’s label and its value, the note', () => {
    install();
    const loadId = state().diagramLoadId;
    const edit = (patch: DiagramTitleBlockContentPatch, session?: number) =>
      state().setDiagramTitleBlockContent(patch, session === undefined ? {} : { loadId, session });
    // The subtitle, typed in one sitting, at each pause.
    edit({ subtitle: 'Origami' }, 11);
    edit({ subtitle: 'Origami diagram' }, 11);
    expect(undoSteps()).toBe(1);
    // A credit added is a step; its label and its value, each a sitting of its own.
    edit({ credits: { op: 'add' } });
    edit({ credits: { op: 'set', at: 0, label: 'Aut' } }, 12);
    edit({ credits: { op: 'set', at: 0, label: 'Author' } }, 12);
    edit({ credits: { op: 'set', at: 0, value: 'Robert' } }, 13);
    edit({ credits: { op: 'set', at: 0, value: 'Robert J. Lang' } }, 13);
    edit({ note: 'Paper:' }, 14);
    edit({ note: 'Paper: 25 cm\nTime: 1 hour' }, 14);
    expect(undoSteps()).toBe(5);
    expect(content()).toEqual({
      subtitle: 'Origami diagram',
      credits: [{ label: 'Author', value: 'Robert J. Lang' }],
      note: 'Paper: 25 cm\nTime: 1 hour',
    });
    // Undo takes a sitting back whole.
    state().undoDiagram();
    expect(content()?.note).toBeUndefined();
    state().undoDiagram();
    expect(credits()).toEqual([{ label: 'Author', value: '' }]);
    state().undoDiagram();
    expect(credits()).toEqual([{ label: '', value: '' }]);
  });

  it('sets the model’s and the pattern’s sizes, each one undo step, and back to the default', () => {
    install();
    expect(state().setDiagramTitleBlockContent({ modelSize: 0.75 })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ patternSize: 0.5 })).toBe(true);
    expect(content()).toEqual({ modelSize: 0.75, patternSize: 0.5 });
    expect(state().setDiagramTitleBlockContent({ modelSize: 'default', patternSize: 0.79 })).toBe(true);
    expect(content()).toBeUndefined();
    expect(undoSteps()).toBe(3);
    // The default where nothing is said: nothing to record.
    expect(state().setDiagramTitleBlockContent({ modelSize: 0.59 })).toBe(false);
    expect(undoSteps()).toBe(3);
  });

  it('takes nothing on a read-only diagram, nor what was typed into a diagram since replaced', () => {
    const readOnly = install(true);
    for (const patch of [
      { subtitle: 'Origami diagram' },
      { credits: { op: 'add' } },
      { note: 'Paper: 15 cm' },
      { modelSize: 0.75 },
    ] as DiagramTitleBlockContentPatch[]) {
      expect(state().setDiagramTitleBlockContent(patch), JSON.stringify(patch)).toBe(false);
    }
    expect(state().diagram).toBe(readOnly);
    install();
    const loadId = state().diagramLoadId;
    install();
    expect(state().setDiagramTitleBlockContent({ credits: { op: 'add' } }, { loadId, session: 21 })).toBe(false);
    expect(content()).toBeUndefined();
  });
});
