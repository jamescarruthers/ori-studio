import { forwardRef, type AnchorHTMLAttributes, type MouseEventHandler } from 'react';
import { interceptExternalLinkClick } from '../../platform/externalUrl';

/** The attributes that make an anchor a link to another site. */
export interface ExternalAnchorAttributes {
  href: string;
  target: '_blank';
  rel: string;
  onClick: MouseEventHandler<HTMLAnchorElement>;
  onAuxClick: MouseEventHandler<HTMLAnchorElement>;
}

/**
 * Spread onto an anchor that leaves the app, for a component that renders its
 * own `<a>` — `ButtonLink`, `IconButtonLink`, a menu item `asChild`. A plain
 * text link is an {@link ExternalAnchor}.
 *
 * On the web it is a real link to a new tab: middle click, Copy Link and the
 * status bar all work because it is one. `noopener` so the other site gets no
 * `window.opener` back into the app, `noreferrer` so it is not told which page
 * sent it. On desktop, whose webview drops a new-window request, the click
 * opens the system browser instead (`platform/externalUrl.ts`).
 *
 * `onClick` is the caller's own handler — an analytics event, say — and runs
 * first, on both runtimes.
 */
export function externalAnchorProps(
  href: string,
  onClick?: MouseEventHandler<HTMLAnchorElement>
): ExternalAnchorAttributes {
  return {
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: (event) => {
      onClick?.(event);
      interceptExternalLinkClick(event, href);
    },
    onAuxClick: (event) => interceptExternalLinkClick(event, href),
  };
}

export type ExternalAnchorProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'target' | 'rel' | 'onAuxClick'
> & { href: string };

/** A text link to another site. See {@link externalAnchorProps}. */
export const ExternalAnchor = forwardRef<HTMLAnchorElement, ExternalAnchorProps>(
  ({ href, onClick, ...props }, ref) => <a ref={ref} {...props} {...externalAnchorProps(href, onClick)} />
);

ExternalAnchor.displayName = 'ExternalAnchor';
