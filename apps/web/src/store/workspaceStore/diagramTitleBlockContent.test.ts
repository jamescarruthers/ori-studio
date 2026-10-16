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

/** A new diagram's words in English (Zach, 2026-10-15): every credit with a value, in this order. */
const NEW_CONTENT = {
  subtitle: 'Subtitle',
  credits: [
    { label: 'Author', value: 'Your name here' },
    { label: 'Steps', value: { kind: 'step-count' as const } },
    { label: 'Recommended paper', value: '15 cm × 15 cm' },
  ],
};
/** The same in Japanese, for the catalog. */
const JA_BUNDLE = {
  diagram: {
    titleBlock: {
      default: { title: 'タイトルを追加', subtitle: '折り紙の図', author: '作者', authorName: 'お名前', steps: '工程数', recommendedPaper: '推奨用紙', paperSize: '15 cm × 15 cm' },
    },
  },
};

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('a new diagram’s title block', () => {
  it('is written with the diagram’s first edit: the subtitle, and Author, the live step count and Recommended paper, each with a value (Zach, 2026-10-15)', () => {
    expect(state().diagram).toBeNull();
    expect(state().setDiagramTitle('Crane')).toBe(true);
    expect(state().diagram!.page.titleBlock).toEqual({ enabled: true, heightShare: 0.23 });
    expect(state().diagram!.titleBlockContent).toEqual(NEW_CONTENT);
    // One undo step for the edit that made it, which takes the diagram away again.
    expect(state().undoDiagram()).toBe(true);
    expect(state().diagram).toBeNull();
  });

  it('starts its title as “Add a title”, real text in the file, which the author’s own replaces or deletes (Zach, 2026-10-15)', () => {
    expect(state().addDiagramStep()).not.toBeNull();
    expect(state().diagram!.title).toBe('Add a title');
    // Deleted, it is empty, and stays so.
    expect(state().setDiagramTitle('')).toBe(true);
    expect(state().diagram!.title).toBe('');
    expect(state().addDiagramStep()).not.toBeNull();
    expect(state().diagram!.title).toBe('');
  });

  it('never puts its title over one typed as the diagram’s first edit', () => {
    expect(state().setDiagramTitle('Crane')).toBe(true);
    expect(state().diagram!.title).toBe('Crane');
  });

  it('is written in the app’s language', async () => {
    i18n.addResourceBundle(
      'ja',
      'panels',
      JA_BUNDLE,
      true,
      true
    );
    await i18n.changeLanguage('ja');
    state().addDiagramStep();
    expect(state().diagram!.title).toBe('タイトルを追加');
    expect(state().diagram!.titleBlockContent).toEqual({
      subtitle: '折り紙の図',
      credits: [
        { label: '作者', value: 'お名前' },
        { label: '工程数', value: { kind: 'step-count' } },
        { label: '推奨用紙', value: '15 cm × 15 cm' },
      ],
    });
  });

  it('is the author’s from then on: edited as any title block’s is', () => {
    state().setDiagramTitle('Crane');
    expect(state().setDiagramTitleBlockContent({ credits: { op: 'set', at: 0, value: 'Traditional' } })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ subtitle: '' })).toBe(true);
    expect(state().diagram!.titleBlockContent).toEqual({ credits: [{ label: 'Author', value: 'Traditional' }, ...NEW_CONTENT.credits.slice(1)] });
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
    // Nor its title: a file with none keeps none.
    state().installDiagram({ document: { ...document, title: '' }, readOnly: false, raw: {} });
    expect(state().addDiagramStep()).not.toBeNull();
    expect(state().diagram!.title).toBe('');
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
    expect(state().diagram!.titleBlockContent).toEqual(NEW_CONTENT);
    // Its own title kept.
    expect(state().diagram!.title).toBe('Crane');
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
      JA_BUNDLE,
      true,
      true
    );
    await i18n.changeLanguage('ja');
    crane();
    state().setDiagramTitleBlockShown(true);
    const content = state().diagram!.titleBlockContent;
    expect(content?.credits).toEqual([
      { label: '作者', value: 'お名前' },
      { label: '工程数', value: { kind: 'step-count' } },
      { label: '推奨用紙', value: '15 cm × 15 cm' },
    ]);
    expect(state().setDiagramTitleBlockShown(false)).toBe(true);
    expect(state().diagram!.page.titleBlock).toEqual({ ...PAGE_SETTINGS.titleBlock.default, enabled: false });
    expect(state().diagram!.titleBlockContent).toBe(content);
    expect(counts()).toEqual([9, 11, 8]);
  });

  it('gives a diagram with no title “Add a title” as it turns the block on, in the same undo step (Zach, 2026-10-15)', () => {
    const untitled = { ...crane(), title: '' };
    state().installDiagram({ document: untitled, readOnly: false, raw: {} });
    expect(state().setDiagramTitleBlockShown(true)).toBe(true);
    expect(state().diagram!.title).toBe('Add a title');
    expect(state().diagramHistory.past).toHaveLength(1);
    expect(state().undoDiagram()).toBe(true);
    expect(state().diagram).toEqual(untitled);
    // Words of its own already and no title: the title alone is written.
    const worded = { ...untitled, titleBlockContent: { subtitle: 'Bird base' } };
    state().installDiagram({ document: worded, readOnly: false, raw: {} });
    expect(state().setDiagramTitleBlockShown(true)).toBe(true);
    expect(state().diagram!.title).toBe('Add a title');
    expect(state().diagram!.titleBlockContent).toEqual({ subtitle: 'Bird base' });
    // Deleted, it stays deleted, and turning the block off writes nothing; turned on again, the block is given it again.
    expect(state().setDiagramTitle('')).toBe(true);
    expect(state().setDiagramTitleBlockShown(false)).toBe(true);
    expect(state().diagram!.title).toBe('');
    expect(state().setDiagramTitleBlockShown(true)).toBe(true);
    expect(state().diagram!.title).toBe('Add a title');
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

  it('sets the band’s colour, a pick one undo step, and puts it back on the paper’s (Zach, 2026-10-15)', () => {
    install();
    // A pick writes as it settles, each write in its session: one undo step.
    expect(state().setDiagramTitleBlockContent({ bandColor: '#2a4d8f' }, { session: -7 })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ bandColor: '#3b5ea0' }, { session: -7 })).toBe(true);
    expect(content()).toEqual({ bandColor: '#3b5ea0' });
    expect(undoSteps()).toBe(1);
    // One that is no colour changes nothing; Reset is the paper's colour again, a step of its own.
    expect(state().setDiagramTitleBlockContent({ bandColor: 'navy' })).toBe(false);
    expect(state().setDiagramTitleBlockContent({ bandColor: 'paper' })).toBe(true);
    expect(content()).toBeUndefined();
    expect(undoSteps()).toBe(2);
    state().undoDiagram();
    expect(content()).toEqual({ bandColor: '#3b5ea0' });
  });

  it('takes nothing on a read-only diagram, nor what was typed into a diagram since replaced', () => {
    const readOnly = install(true);
    for (const patch of [
      { subtitle: 'Origami diagram' },
      { credits: { op: 'add' } },
      { note: 'Paper: 15 cm' },
      { modelSize: 0.75 },
      { bandColor: '#2a4d8f' },
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

  it('takes a sitting at the title’s field as one undo step, apart from the block’s, and drops one typed into a diagram since replaced', () => {
    install();
    const loadId = state().diagramLoadId;
    // The Page pane's Title field, at each pause: one step. The subtitle's sitting is another.
    expect(state().setDiagramTitle('Swa', { loadId, session: 31 })).toBe(true);
    expect(state().setDiagramTitle('Swan', { loadId, session: 31 })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ subtitle: 'Traditional' }, { loadId, session: 32 })).toBe(true);
    expect(undoSteps()).toBe(2);
    state().undoDiagram();
    expect(state().diagram!.title).toBe('Swan');
    state().undoDiagram();
    expect(state().diagram!.title).toBe('Crane');
    install();
    expect(state().setDiagramTitle('Heron', { loadId, session: 33 })).toBe(false);
    expect(state().diagram!.title).toBe('Crane');
  });
});
