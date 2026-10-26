// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two runtimes open another site two different ways, and the desktop one is
 * the one nothing else would notice breaking: the webview drops a new-window
 * request without a word, so a link that "works" in every browser test is dead in
 * the app. What is pinned here is which way each runtime goes.
 */

const opener = vi.hoisted(() => ({ openUrl: vi.fn(async (_url: string) => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: opener.openUrl }));

const monitoring = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock('../monitoring', () => ({ reportError: monitoring.reportError }));

const { interceptExternalLinkClick, isExternalUrl, openExternalUrl } = await import('./externalUrl');

const TAURI_KEY = '__TAURI_INTERNALS__';
const host = globalThis as unknown as Record<string, unknown>;
const DISCORD = 'https://discord.gg/9q836Wq6Q8';

function asDesktop(): void {
  host[TAURI_KEY] = {};
}

function click(overrides: { button?: number; defaultPrevented?: boolean } = {}) {
  const event = {
    button: overrides.button ?? 0,
    defaultPrevented: overrides.defaultPrevented ?? false,
    preventDefault: vi.fn(() => {
      event.defaultPrevented = true;
    }),
  };
  return event;
}

let windowOpen: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  opener.openUrl.mockReset();
  opener.openUrl.mockResolvedValue(undefined);
  monitoring.reportError.mockReset();
  windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);
});

afterEach(() => {
  delete host[TAURI_KEY];
  windowOpen.mockRestore();
});

describe('isExternalUrl', () => {
  it('is an absolute http(s) URL and nothing else', () => {
    expect(isExternalUrl(DISCORD)).toBe(true);
    expect(isExternalUrl('http://example.com/a?b#c')).toBe(true);
    expect(isExternalUrl('/edit')).toBe(false);
    expect(isExternalUrl('#section')).toBe(false);
    expect(isExternalUrl('blob:https://oristudio.dev/1234')).toBe(false);
    expect(isExternalUrl('mailto:someone@example.com')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('')).toBe(false);
    expect(isExternalUrl(undefined)).toBe(false);
  });
});

describe('openExternalUrl', () => {
  it('opens a noopener tab on the web, and never reaches for the plugin', async () => {
    await openExternalUrl(DISCORD);
    expect(windowOpen).toHaveBeenCalledWith(DISCORD, '_blank', 'noopener,noreferrer');
    expect(opener.openUrl).not.toHaveBeenCalled();
  });

  it('hands the URL to the system browser on desktop, and opens no window', async () => {
    asDesktop();
    await openExternalUrl(DISCORD);
    expect(opener.openUrl).toHaveBeenCalledWith(DISCORD);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('reports a refused open on desktop instead of throwing into a click handler', async () => {
    asDesktop();
    const refusal = new Error('Not allowed to open url');
    opener.openUrl.mockRejectedValueOnce(refusal);
    await expect(openExternalUrl(DISCORD)).resolves.toBeUndefined();
    expect(monitoring.reportError).toHaveBeenCalledWith(refusal, { surface: 'external-link' });
  });

  it('refuses anything but http(s), on either runtime', async () => {
    await expect(openExternalUrl('file:///etc/passwd')).rejects.toThrow(TypeError);
    asDesktop();
    await expect(openExternalUrl('/edit')).rejects.toThrow(TypeError);
    expect(opener.openUrl).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });
});

describe('interceptExternalLinkClick', () => {
  it('leaves the click to the anchor on the web', () => {
    const event = click();
    interceptExternalLinkClick(event, DISCORD);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
    expect(opener.openUrl).not.toHaveBeenCalled();
  });

  it('takes a primary or middle click on desktop and opens the system browser', async () => {
    asDesktop();
    for (const [index, button] of [0, 1].entries()) {
      const event = click({ button });
      interceptExternalLinkClick(event, DISCORD);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(opener.openUrl).toHaveBeenCalledTimes(index + 1));
    }
    expect(opener.openUrl.mock.calls).toEqual([[DISCORD], [DISCORD]]);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('leaves a secondary click, a cancelled click and an in-app link alone on desktop', async () => {
    asDesktop();
    const secondary = click({ button: 2 });
    interceptExternalLinkClick(secondary, DISCORD);
    const cancelled = click({ defaultPrevented: true });
    interceptExternalLinkClick(cancelled, DISCORD);
    const inApp = click();
    interceptExternalLinkClick(inApp, '/edit');

    for (const event of [secondary, cancelled, inApp]) {
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(opener.openUrl).not.toHaveBeenCalled();
  });
});
