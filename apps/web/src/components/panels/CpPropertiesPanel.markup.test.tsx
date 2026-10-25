import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FIGURE,
  IMAGE,
  REGION,
  TEXT,
  WINDOW,
} from '../../cp-workspace/canvasObjects/canvasObjectKinds.fixtures';
import type { OristudioCpDocumentState } from '../../engine/oristudioCpTypes';
import { createStarterOristudioCpDocument } from '../../lib/oristudioCpStarterDocument';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { CpPropertiesPanel } from './CpPropertiesPanel';

/**
 * The markup each canvas-object kind's sheet renders, pinned. The shared
 * renderer grows optional parts for one kind at a time (the folded figure's
 * header verbs, a stacked choice, a stepper, a note line); a kind that uses
 * none of them must render exactly what it did, and this is where a change
 * that leaks into the others shows. Ids React generates are counted per test
 * run, so they are named by order of appearance instead.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useWorkspaceStore.getInitialState();

const DOCUMENT = {
  handle: 4,
  loadSerial: 1,
  document: createStarterOristudioCpDocument(),
  geometry: null,
  summary: null,
  source: { format: 'cp', filename: 'Untitled.cp', path: null },
} as unknown as OristudioCpDocumentState;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  useWorkspaceStore.setState(initialState, true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  useWorkspaceStore.setState(initialState, true);
});

/** The sheet's markup with React's generated ids named by order of appearance. */
function sheetMarkup(): string {
  const html = host?.querySelector('[data-property-sheet]')?.outerHTML ?? '';
  const ids = new Map<string, string>();
  return html.replace(/_r_[0-9a-z]+_|[:«]r[0-9a-z]+[:»]/gu, (id) => {
    if (!ids.has(id)) ids.set(id, `id-${ids.size + 1}`);
    return ids.get(id)!;
  });
}

describe('CpPropertiesPanel markup', () => {
  it.each([
    ['image', { oristudioCpSelectedAnnotationId: IMAGE.id }],
    ['text', { oristudioCpSelectedAnnotationId: TEXT.id }],
    ['suppression region', { oristudioCpSelectedAnnotationId: REGION.id }],
    ['simulation window', { oristudioCpFocusedInlineSimulationId: WINDOW.id }],
  ] as const)('draws the %s sheet as it always has', (_kind, selection) => {
    useWorkspaceStore.setState({
      oristudioCpDocument: DOCUMENT,
      oristudioCpAnnotations: [IMAGE, TEXT, REGION],
      oristudioCpFoldedFigures: [FIGURE],
      oristudioCpInlineSimulations: [WINDOW],
      ...selection,
    });
    act(() => root?.render(<CpPropertiesPanel />));
    expect(sheetMarkup()).toMatchSnapshot();
  });
});
