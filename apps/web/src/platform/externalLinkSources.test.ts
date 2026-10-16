/**
 * Every link out of the app goes through `ExternalAnchor` (`components/ui`) or
 * `openExternalUrl` (`platform/externalUrl.ts`).
 *
 * The desktop webview drops a request for a new window, so a hand-written
 * `target="_blank"` or a `window.open` call is a control that works in every
 * browser and does nothing at all in the desktop app — and no test of the
 * component carrying it would notice, because jsdom is a browser. An anchor with
 * a literal off-site href and no target is worse there: it navigates the app's
 * own window away. This scan is the one place that can see all three.
 *
 * Tests are exempt (they assert the attributes), and so are the two helpers that
 * write them. A comment that spells out `_blank` trips it too; say "a new tab".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest's root is `apps/web`. See `styles/globalStylesheets.test.ts`.
const SRC = resolve(process.cwd(), 'src');

const HELPERS = new Set(['platform/externalUrl.ts', 'components/ui/ExternalAnchor.tsx']);

function sources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((path) => path.split(sep).join('/'))
    .filter(
      (path) =>
        /\.tsx?$/u.test(path) &&
        !path.endsWith('.d.ts') &&
        !/\.test\.tsx?$/u.test(path) &&
        !path.startsWith('generated/') &&
        !HELPERS.has(path)
    )
    .sort();
}

/** `path:line` for every match of `pattern` in the scanned sources. */
function offenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const path of sources()) {
    const text = readFileSync(resolve(SRC, path), 'utf8');
    for (const match of text.matchAll(pattern)) {
      const line = text.slice(0, match.index).split('\n').length;
      found.push(`${path}:${line}`);
    }
  }
  return found;
}

describe('links out of the app', () => {
  it('ask for a new tab only through ExternalAnchor', () => {
    expect(offenders(/_blank/gu)).toEqual([]);
  });

  it('open a window only through openExternalUrl', () => {
    expect(offenders(/\bwindow\.open\s*\(/gu)).toEqual([]);
  });

  it('are never a bare anchor with an off-site href', () => {
    expect(offenders(/<a\b[^>]*?\bhref=\{?\s*["'`]https?:/gu)).toEqual([]);
  });

  it('still finds what it scans for', () => {
    // A scan that reads no files passes every rule above.
    expect(sources()).toContain('components/HelpModal.tsx');
    expect(sources().length).toBeGreaterThan(100);
  });
});
