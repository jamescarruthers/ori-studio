import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYER_SPREAD } from '../../../cp-workspace/folded/layerSpreadSettings';
import { bookScene } from '../../../fold/canvas/foldCanvas.fixtures';
import { resetFoldPaneDisplay, setFoldPaneDisplay } from '../../../fold/canvas/foldPaneDisplay';
import { foldStatePictureUrl } from '../../../fold/canvas/foldStatePicture';
import type { FoldImportOpened } from '../../../fold/engine/foldEngineIoWire';
import type { FoldScene } from '../../../fold/engine/foldEngineWire';
import { foldOrderChoiceKey, type FoldOrderPreview } from '../../../fold/io/foldImportFlow';
import { useSettingsStore } from '../../../store/settingsStore';
import { FoldImportOrders } from './FoldImportOrders';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** No sequence yet, the reader on the sheet: an import starts it, with the default spread. */
vi.mock('../../../fold/session/useFoldSession', () => ({
  useFoldSessionState: (select: (snapshot: unknown) => unknown) => select({ sequence: null, cursor: null, activePath: [] }),
}));

/** The book with a precrease on its top half: what the Precreases switch shows or hides. */
function precreasedBook(): FoldScene {
  const scene = bookScene();
  return { ...scene, aux_lines: [{ face: 1, from: { x: 0, y: 0.5 }, to: { x: 0.5, y: 0.5 } }] };
}

const opened = { count: { orders: 2, exact: true }, components: [{ orders: 2, truncated: false }] } as unknown as FoldImportOpened;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetFoldPaneDisplay();
});

const pictures = () => [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));

describe('Import CP’s layer-order cards', () => {
  it('draw each order as the step strip will: the pane’s switches, the style, the spread the step takes', () => {
    const scene = precreasedBook();
    const previews = new Map<string, FoldOrderPreview>([
      [foldOrderChoiceKey([0]), { status: 'ready', scene }],
      [foldOrderChoiceKey([1]), { status: 'ready', scene }],
    ]);
    setFoldPaneDisplay({ stepCreases: true, precreases: false });
    act(() =>
      root.render(<FoldImportOrders opened={opened} choice={[0]} previews={previews} disabled={false} onChoose={() => {}} />)
    );
    const style = useSettingsStore.getState().paperStyle.display;
    const expected = foldStatePictureUrl(scene, style, { stepCreases: true, precreases: false }, DEFAULT_LAYER_SPREAD);
    expect(pictures()).toEqual([expected, expected]);
    // Precreases off hides the precrease the default picture draws.
    expect(expected).not.toBe(foldStatePictureUrl(scene, style, undefined, DEFAULT_LAYER_SPREAD));
    // And the spread is on: the order under the top face peeks out.
    expect(expected).not.toBe(foldStatePictureUrl(scene, style, { stepCreases: true, precreases: false }, null));

    // The switch back on reaches the cards, as it reaches the strip's.
    act(() => setFoldPaneDisplay({ stepCreases: true, precreases: true }));
    expect(pictures()[0]).toBe(foldStatePictureUrl(scene, style, { stepCreases: true, precreases: true }, DEFAULT_LAYER_SPREAD));
  });
});
