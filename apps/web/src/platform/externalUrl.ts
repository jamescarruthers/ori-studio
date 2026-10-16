import { reportError } from '../monitoring';
import { isDesktopRuntime } from './runtime';

/**
 * Pages on other sites, opened from the app.
 *
 * The desktop webview drops a request for a new window: a `target="_blank"`
 * anchor or a `window.open` call does nothing there, and an external anchor
 * with no target navigates the app's own window away to the other site. So on
 * desktop an external page goes to the system browser, through the opener
 * plugin; on the web it is an ordinary new tab.
 *
 * Links reach this through `ExternalAnchor` (`components/ui`), which keeps a
 * real anchor on the web and calls {@link interceptExternalLinkClick} on click.
 * {@link openExternalUrl} is for a control that is not a link.
 */

/** Whether `href` is a page on another site: an absolute http(s) URL. */
export function isExternalUrl(href: string | null | undefined): href is string {
  if (!href) return false;
  try {
    const { protocol } = new URL(href);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    // Relative — an in-app route.
    return false;
  }
}

/**
 * Open `url` outside the app: the system browser on desktop, a new tab on the
 * web.
 *
 * Only http(s). The desktop capability grants the opener nothing else, so any
 * other scheme is refused here rather than by the shell. A desktop failure is
 * reported and swallowed — it happens in a click handler, with nobody to hand
 * it to.
 */
export function openExternalUrl(url: string): Promise<void> {
  if (!isExternalUrl(url)) {
    return Promise.reject(new TypeError('openExternalUrl opens http(s) URLs only'));
  }
  if (isDesktopRuntime()) return openInSystemBrowser(url);
  // `noopener` so the other site gets no `window.opener` back into the app.
  window.open(url, '_blank', 'noopener,noreferrer');
  return Promise.resolve();
}

async function openInSystemBrowser(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch (error) {
    reportError(error, { surface: 'external-link' });
  }
}

/** What {@link interceptExternalLinkClick} reads of a click, DOM or React. */
export type ExternalLinkClick = Pick<MouseEvent, 'button' | 'defaultPrevented' | 'preventDefault'>;

/**
 * On desktop, take a click on an external link away from the webview and open
 * the page in the system browser. On the web, do nothing: the anchor opens its
 * tab, and a middle click, a modified click and the context menu stay the
 * browser's.
 *
 * For a primary or middle press, modified or not — each of them means "open
 * this" — and not the secondary button. A click something earlier already
 * cancelled is left alone: that handler has decided the press is not an
 * activation.
 */
export function interceptExternalLinkClick(event: ExternalLinkClick, href: string | undefined): void {
  if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
  if (!isDesktopRuntime() || !isExternalUrl(href)) return;
  event.preventDefault();
  void openExternalUrl(href);
}
