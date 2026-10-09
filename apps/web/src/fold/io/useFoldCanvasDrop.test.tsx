import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFoldImportUiStore } from './foldImportUiStore';
import { useFoldCanvasDrop } from './useFoldCanvasDrop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
/** What reached the workspace's own target, above the canvas. */
const workspace = { enter: vi.fn(), drop: vi.fn() };

function Canvas() {
  const { dropTargetProps, isDragActive } = useFoldCanvasDrop();
  return (
    <div onDragEnter={workspace.enter} onDrop={workspace.drop}>
      <div data-testid="canvas" data-active={isDragActive || undefined} {...dropTargetProps} />
    </div>
  );
}

/** A drag event carrying `files`, as a browser sends one. */
function drag(type: string, files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const items = files.map((file) => ({ kind: 'file', type: file.type }));
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items, files, dropEffect: 'none' },
  });
  return event;
}

const canvas = () => host.querySelector<HTMLElement>('[data-testid="canvas"]')!;

beforeEach(() => {
  workspace.enter.mockClear();
  workspace.drop.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Canvas />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => useFoldImportUiStore.getState().close());
});

describe('the Fold canvas’s drop policy', () => {
  it('claims a file drag, so the workspace target shows no overlay over the canvas', () => {
    const cp = new File(['1 0 0 1 1'], 'crane.cp');
    act(() => {
      canvas().dispatchEvent(drag('dragenter', [cp]));
    });
    expect(canvas().dataset.active).toBe('true');
    expect(workspace.enter).not.toHaveBeenCalled();
  });

  it('imports a dropped crease pattern as a step, through the import dialog', async () => {
    const cp = new File(['1 0 0 1 1'], 'crane.cp');
    await act(async () => {
      canvas().dispatchEvent(drag('drop', [new File(['{}'], 'notes.txt'), cp]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(workspace.drop).not.toHaveBeenCalled();
    const opening = useFoldImportUiStore.getState().opening;
    expect(opening?.request).toMatchObject({ kind: 'file', name: 'crane.cp', source: { format: 'cp' } });
    expect(canvas().dataset.active).toBeUndefined();
  });

  it('leaves a drop with no crease pattern to the workspace, which opens it', () => {
    act(() => {
      canvas().dispatchEvent(drag('drop', [new File(['{}'], 'project.osf')]));
    });
    expect(workspace.drop).toHaveBeenCalledOnce();
    expect(useFoldImportUiStore.getState().opening).toBeNull();
  });
});
