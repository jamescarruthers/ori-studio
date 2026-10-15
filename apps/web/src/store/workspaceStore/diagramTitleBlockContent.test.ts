import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { PAGE_SETTINGS, createDiagram, setPageSetup } from '../../diagram/document/diagramDocument';
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
