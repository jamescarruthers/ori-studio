# Fast diagram page navigation

## Goal

Make pan and zoom responsive on dense diagram pages, including the external
`beta_perf.osf` example, while keeping paper/style edits and printed output correct.

## Approach

- Measure the existing SVG image against a raster preview of the same composed page.
- Keep the SVG composer as the source of truth for both previews and exports.
  Cache bounded bitmap previews by the complete composed image and resolution;
  refresh after zoom settles and invalidate whenever the image changes.
- Mount page artwork only near the viewport; retain lightweight interaction
  targets so keyboard navigation and selection continue to work.
- Cover invalidation, asynchronous races, memory bounds, and browser rendering.
  Keep the user's file and generated measurements in ignored artifacts.

## Affected Areas

- `apps/web/src/components/diagram/DiagramPagesView.tsx`
- `apps/web/src/diagram/pages/` preview cache and viewport visibility
- Preview component, regression tests, and browser measurements

## Checklist

- [x] Trace composition, page visibility, and paper/style updates.
- [x] Measure dense SVG navigation with the supplied file.
- [x] Add bounded raster previews and release distant page artwork.
- [x] Verify changes to paper/style, annotations, and placements refresh previews.
- [x] Run web validation and compare browser rendering/performance.
- [x] Open a draft PR and provide the local testing URL.

## Measurements and verification

The external sample has ten steps on two pages. Page one composes to 2.76 MB
of SVG with roughly 23,500 elements. In a local Chromium run at device pixel
ratio 2, the same 90-frame pan/zoom sequence averaged 29.2 ms per frame for the
SVG image and 8.3 ms for its bitmap (95th percentile: 34.3 ms and 9.0 ms).
This isolates the rendering cost; it is not an end-to-end app benchmark.

Chromium and WebKit both drew the integrated preview pixel-identically to
the source SVG rasterized at the same dimensions. Repeated after changing
front/back colors, edge width/color, auxiliary crease visibility, and page
orientation: still identical, with the preview visibly updated. Navigating a
five-page layout released the first page's artwork while retaining all ten
step targets. Screenshots, probes, and measurements live in the ignored
`artifacts/diagram-pages-performance/` directory.

Preview resolutions follow zoom and screen density in power-of-two buckets,
refining after 150 ms, capped at 8 megapixels and 4096 pixels per side. At very
high zoom the preview can be softer than vector art; exports remain vector.
The 64 MiB cache accounts for source strings and bitmap pixels and retains at
most one resolution per source. A changed source uses the new SVG immediately
until its bitmap arrives, also serving as a fallback when canvas is unavailable.

No analytics event is added: this changes rendering of the existing Pages
flow, without adding a user action or a new adoption signal.

Validation: web lint, web typecheck, and all 1,262 tests across 70 diagram
page/component and stylesheet suites pass. Tests used CI's Node 22: the host's
Node 26 exposes a conflicting experimental `localStorage` and runs the
existing 32 ms packing benchmark slower. All generated wasm bridges were
rebuilt locally because the bootstrap copies were stale. Rust/oracle,
native-shell, and production-build checks are omitted: no engine, native,
bundling, routing, or export behavior changed.

Draft PR: https://github.com/zacharyfmarion/ori-studio/pull/452.
Local preview: http://localhost:5234/diagram (detached dev server).
