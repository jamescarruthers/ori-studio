import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ButtonLink } from './Button';
import { ExternalAnchor, externalAnchorProps } from './ExternalAnchor';

/**
 * The anchor half of the external-link helper. On the web it must stay a link —
 * everything a link offers comes from the attributes — and on desktop a click
 * must reach the system browser, because the webview drops the new tab the
 * attributes ask for.
 */

const opener = vi.hoisted(() => ({ openUrl: vi.fn(async (_url: string) => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: opener.openUrl }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAURI_KEY = '__TAURI_INTERNALS__';
const runtimeHost = globalThis as unknown as Record<string, unknown>;
const ISSUES = 'https://github.com/zacharyfmarion/ori-studio/issues';

let host: HTMLDivElement;
let root: Root;
let windowOpen: ReturnType<typeof vi.spyOn>;
/** Whether the last click reached the window still uncancelled, i.e. the anchor would have acted. */
let reachedAnchorDefault: boolean | null;

function recordAndStopNavigation(event: MouseEvent): void {
  reachedAnchorDefault = !event.defaultPrevented;
  // jsdom would try to navigate; a browser opens the tab.
  event.preventDefault();
}

beforeEach(() => {
  opener.openUrl.mockReset();
  opener.openUrl.mockResolvedValue(undefined);
  windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
  reachedAnchorDefault = null;
  window.addEventListener('click', recordAndStopNavigation);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.removeEventListener('click', recordAndStopNavigation);
  windowOpen.mockRestore();
  delete runtimeHost[TAURI_KEY];
});

function render(node: ReactNode): HTMLAnchorElement {
  act(() => root.render(node));
  const link = host.querySelector('a');
  if (!link) throw new Error('no anchor rendered');
  return link;
}

describe('ExternalAnchor', () => {
  it('renders a real link to a new tab, with no opener and no referrer', () => {
    const link = render(
      <ExternalAnchor className="credit" href={ISSUES}>
        open an issue
      </ExternalAnchor>
    );

    expect(link.getAttribute('href')).toBe(ISSUES);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')?.split(' ').sort()).toEqual(['noopener', 'noreferrer']);
    expect(link.className).toBe('credit');
    expect(link.textContent).toBe('open an issue');
  });

  it('on the web, runs the caller’s handler and leaves the click to the browser', () => {
    const onClick = vi.fn();
    const link = render(
      <ExternalAnchor href={ISSUES} onClick={onClick}>
        open an issue
      </ExternalAnchor>
    );

    act(() => link.click());

    expect(onClick).toHaveBeenCalledOnce();
    expect(reachedAnchorDefault).toBe(true);
    expect(opener.openUrl).not.toHaveBeenCalled();
  });

  it('on desktop, runs the caller’s handler and opens the system browser instead', async () => {
    runtimeHost[TAURI_KEY] = {};
    const onClick = vi.fn();
    const link = render(
      <ExternalAnchor href={ISSUES} onClick={onClick}>
        open an issue
      </ExternalAnchor>
    );

    act(() => link.click());

    expect(onClick).toHaveBeenCalledOnce();
    expect(reachedAnchorDefault).toBe(false);
    await vi.waitFor(() => expect(opener.openUrl).toHaveBeenCalledWith(ISSUES));
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('on desktop, opens the system browser for a middle click too', async () => {
    runtimeHost[TAURI_KEY] = {};
    const link = render(<ExternalAnchor href={ISSUES}>open an issue</ExternalAnchor>);

    act(() => {
      link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    });

    await vi.waitFor(() => expect(opener.openUrl).toHaveBeenCalledWith(ISSUES));
  });
});

describe('externalAnchorProps', () => {
  it('makes a component that renders its own anchor an external link', async () => {
    runtimeHost[TAURI_KEY] = {};
    const onClick = vi.fn();
    const link = render(
      <ButtonLink variant="secondary" {...externalAnchorProps(ISSUES, onClick)}>
        Report
      </ButtonLink>
    );

    expect(link.getAttribute('href')).toBe(ISSUES);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');

    act(() => link.click());

    expect(onClick).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(opener.openUrl).toHaveBeenCalledWith(ISSUES));
  });
});
