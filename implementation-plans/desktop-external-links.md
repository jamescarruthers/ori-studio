# Desktop External Links

## Goal

Every link that leaves Ori Studio works in the desktop app. Today the desktop
webview ignores a request for a new window, so each `target="_blank"` anchor
and each `window.open` call does nothing there — the Discord button, the About
dialog's credits, Open in ExplOri, Report an issue, the Linux "Download update"
card. The landing's Discord and GitHub buttons are worse: they carry no target,
so on desktop they navigate the app's own window away to another site. On the
web all of these work and must keep working as links.

## Approach

- One helper, `platform/externalUrl.ts`: `openExternalUrl(url)` hands an
  http(s) URL to the system browser through `tauri-plugin-opener` on desktop
  and opens a `noopener` tab on the web; `interceptExternalLinkClick` is the
  anchor half, which on desktop cancels the webview's own handling of a click
  on an external link and opens it in the system browser instead, and on the
  web does nothing so the anchor behaves as an anchor.
- One React surface, `components/ui/ExternalAnchor.tsx`: `ExternalAnchor` for a
  plain link and `externalAnchorProps(href, onClick)` to spread onto the anchor
  components that render their own `<a>` (`ButtonLink`, `IconButtonLink`, a
  menu item). Both render a real anchor with `target="_blank"` and
  `rel="noopener noreferrer"`, so middle-click, copy-link and the status bar
  keep working on the web. A caller's `onClick` (analytics) runs first.
- Desktop shell: add `tauri-plugin-opener` 2.5 (the newest line on Tauri 2.11),
  with its injected click script turned off so the frontend helper is the one
  path, and grant `opener:allow-open-url` scoped to `http://*` and `https://*`
  only. No CSP change: the call is IPC.
- Route every external link in `apps/web/src` through the helper, and add a
  source scan that fails on a raw `target="_blank"` or `window.open(` outside
  the helper.
- Leave alone: downloads (a resolved build's file URL), blob URLs, in-app
  routes, and the site pages' `ExternalLink`, whose routes and footer are
  web-only and never render in the desktop app.

## Affected Areas

- `apps/web/src/platform/externalUrl.ts` (new) and its tests
- `apps/web/src/components/ui/ExternalAnchor.tsx` (new) and its tests
- `apps/web/src/platform/externalLinkSources.test.ts` (new source scan)
- Call sites: `HelpModal`, `WorkspaceShell`, `DiagramAffineCredit`,
  `ExploriResultsPanel`, `ErrorFallback`, `DesignAttributionFooter`,
  `StartFigure`, `WelcomeLanding`, `UpdateCard`, and the web-only releases-page
  fallbacks in `DesktopDownloadButton`, `DesktopDownloadMenuItems` and the
  site's `DesktopBuildList`
- `site/ExternalLink.tsx`: a note that it is web-only, nothing else
- `apps/web/package.json`, `package-lock.json`
- `apps/tauri/src-tauri/Cargo.toml`, `src/lib.rs`, `capabilities/default.json`,
  `gen/schemas/*`, `Cargo.lock`

## Checklist

- [x] Add `@tauri-apps/plugin-opener` and `tauri-plugin-opener` at matching 2.5 versions
- [x] Register the plugin (no injected script) and scope the capability to http/https
- [x] Write `platform/externalUrl.ts` with desktop and web tests
- [x] Write `ExternalAnchor` / `externalAnchorProps` with attribute tests
- [x] Route every external link through it
- [x] Source scan for raw `target="_blank"` / `window.open(`
- [x] Lint, typecheck, relevant vitest, `check:desktop`, cargo fmt/clippy for the shell
- [ ] Build the desktop app and click external links in it
- [ ] Draft PR, noting #451's walkthrough link
