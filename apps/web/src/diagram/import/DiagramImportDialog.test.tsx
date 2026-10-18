import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/ui/Tooltip';
import { DiagramImportDialogHost } from './DiagramImportDialog';
import { useImportDialogStore } from './importDialogStore';

const mocks = vi.hoisted(() => ({ folder: vi.fn(), files: vi.fn(), ensure: vi.fn(), run: vi.fn() }));
vi.mock('../../platform/fileService', async (original) => ({
  ...(await original<typeof import('../../platform/fileService')>()),
  getFileService: () => ({ openBinaryFiles: mocks.files }),
  pickImportFolder: mocks.folder,
}));
vi.mock('../../store/workspaceStore/diagramBatchImport', () => ({
  importTarget: () => ({}),
  ensureDiagramImportTarget: mocks.ensure,
}));
vi.mock('./importJob', async (original) => ({
  ...(await original<typeof import('./importJob')>()),
  runImportJob: mocks.run,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
const file = { name: '1.cp', type: '', size: 1, read: async () => new Uint8Array() };
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((el) => el.textContent === label)!;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mocks.folder.mockResolvedValue(vi.fn(async () => [file]));
  mocks.files.mockResolvedValue([file]);
  mocks.ensure.mockResolvedValue({});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    useImportDialogStore.getState().open();
    root.render(
      <TooltipProvider>
        <DiagramImportDialogHost />
      </TooltipProvider>
    );
  });
});
afterEach(() => {
  act(() => {
    root.unmount();
    useImportDialogStore.getState().close();
  });
  host.remove();
  vi.unstubAllGlobals();
});
it('uses the shared toggle for recursive folder picking and exposes layout number controls after selection', async () => {
  const toggle = document.querySelector<HTMLButtonElement>('[role=switch]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle.click());
  await act(async () => button('Choose folder…').click());
  const list = await mocks.folder.mock.results[0]!.value;
  expect(list).toHaveBeenLastCalledWith(true);
  // A picked folder is listed again as the toggle changes, as a dropped one is.
  await act(async () => toggle.click());
  expect(list).toHaveBeenLastCalledWith(false);
  expect(document.querySelector('input[aria-label=Columns]')).not.toBeNull();
  expect(document.querySelector('input[aria-label=Gap]')).not.toBeNull();
  expect(document.querySelector('input[aria-label="Max seconds per fold"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain('Auto');
  expect(document.querySelector('button[title=Reset]')).toBeNull();
  expect(document.querySelector('input[type=checkbox]:not([aria-hidden=true])')).toBeNull();
});
it('ignores Escape while importing; Cancel during Edit provisioning starts nothing once it finishes', async () => {
  let finish!: (value: object) => void;
  mocks.ensure.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => button('Choose files…').click());
  await act(async () => button('Import').click());
  expect(mocks.ensure).toHaveBeenCalledOnce();
  await act(async () =>
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  // A stray Escape or backdrop click must not throw a long run away.
  expect(document.querySelector('[role=dialog]')).not.toBeNull();
  await act(async () => button('Cancel').click());
  await act(async () => finish({}));
  expect(mocks.run).not.toHaveBeenCalled();
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Import cancelled');
  await act(async () => button('Close').click());
  expect(useImportDialogStore.getState().target).toBeNull();
});

it('releases the modal after publication fails so the user can close or retry', async () => {
  mocks.run.mockImplementation(async (_files, _target, _options, _signal, _foldSignal, publish) => {
    publish({ phase: 'placing', done: 1, total: 1, name: '', failures: [], notices: [] });
    throw new Error('The destination changed while importing.');
  });
  await act(async () => button('Choose files…').click());
  await act(async () => button('Import').click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('The destination changed');
  expect(button('Import').disabled).toBe(false);
  expect(button('Close').disabled).toBe(false);
  await act(async () => button('Close').click());
  expect(document.querySelector('[role=dialog]')).toBeNull();
});
