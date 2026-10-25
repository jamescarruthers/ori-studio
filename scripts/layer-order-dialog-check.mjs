#!/usr/bin/env node
/**
 * The Layer order dialog's browser check (`implementation-plans/layer-order-dialog.md`):
 * screenshots of real WebGL frames, and a pixel comparison between two runs.
 *
 * The agent browser pane draws no WebGL frames (see
 * `scripts/folded-grid-screenshot.mjs`), so every canvas gate of the plan runs
 * here, locally, never in CI. Each PR of the plan adds its cases to `CASES`;
 * U1 starts it with Fold's folded pane, which moves onto the shared stack hit
 * index and tint ladder (`cp-workspace/picking/stackHitIndex.ts`,
 * `cp-workspace/renderer/fillTint.ts`) and must not change a pixel.
 *
 * It drives a dev server that is already running (`scripts/dev-server.sh
 * start`), so a run shows what that server serves: the working tree. To prove
 * a refactor changes nothing, capture once on the base and once on the change,
 * then compare:
 *
 *   DEV_SERVER_PORT=5241 scripts/dev-server.sh start
 *   node scripts/layer-order-dialog-check.mjs capture --label before --url http://localhost:5241
 *   # … apply the change …
 *   node scripts/layer-order-dialog-check.mjs capture --label after --url http://localhost:5241
 *   node scripts/layer-order-dialog-check.mjs compare before after
 *
 * `capture` writes `artifacts/layer-order-dialog-check/<label>/<case>-<pane>.png`
 * and fails if a case's canvas never drew. `compare` counts the pixels that
 * differ between two labels, writes a diff image for any pair that does
 * (`<b>-vs-<a>/…`), prints one row per image and exits non-zero on a
 * difference. Pixels are compared in Chromium (the repo has no PNG decoder), on
 * a page of its own.
 *
 * Needs Node 22 and Playwright's Chromium (`npx playwright install chromium`).
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(repoRoot, 'artifacts/layer-order-dialog-check');

const VIEWPORT = { width: 1400, height: 900 };

// ---------------------------------------------------------------------------
// Waiting for the canvas

/** Two composited frames, so the canvas has certainly redrawn. */
async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))))
  );
}

/**
 * A screenshot of `locator` once it stops changing: two in a row the same,
 * a quarter second apart. The engine answers in a worker, so a fold's preview
 * lands some frames after the click that asked for it.
 *
 * What floats over a canvas is not the canvas: a tool window (any
 * `FloatingPanel`, `section[data-pin]`) is painted over in magenta, since its
 * text settles on its own schedule and differs from run to run. So is the
 * viewport toolbar: on the same commit, its buttons' rounded corners come out
 * one of two ways from run to run (±1 on about a hundred corner pixels once a
 * fold is made). CSS transitions are finished first, for the same reason.
 */
async function steadyShot(page, locator, { timeoutMs = 15000, masked = true } = {}) {
  const deadline = Date.now() + timeoutMs;
  // A modal covers the workspace's floating bars, which a mask would paint over it.
  const floating = masked ? [page.locator('section[data-pin]'), page.locator('[data-viewport-toolbar]')] : [];
  const shoot = () => locator.screenshot({ animations: 'disabled', mask: floating, maskColor: '#ff00ff' });
  await settle(page);
  let last = await shoot();
  while (Date.now() < deadline) {
    await page.waitForTimeout(250);
    await settle(page);
    const next = await shoot();
    if (next.equals(last)) return next;
    last = next;
  }
  throw new Error('The canvas never settled');
}

// ---------------------------------------------------------------------------
// Pixels, read in the browser

/**
 * Per image: its size and the box of the pixels darker than `dark` (0–255
 * luma), in the image's pixels; null where none is. The paper's outline is the
 * darkest thing on a pane, so its box is where the paper is.
 */
async function darkBox(page, png, dark = 128) {
  return page.evaluate(
    async ({ data, dark }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { data: rgba } = context.getImageData(0, 0, image.width, image.height);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const k = (y * image.width + x) * 4;
          const luma = 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2];
          // Magenta is a mask (`steadyShot`), not ink.
          const masked = rgba[k] > 200 && rgba[k + 1] < 60 && rgba[k + 2] > 200;
          if (luma >= dark || masked) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    },
    { data: png.toString('base64'), dark }
  );
}

/** How two PNGs differ: pixel counts, the largest channel step, and a diff image (red where they differ). */
async function pixelDiff(page, a, b) {
  return page.evaluate(
    async ({ a, b }) => {
      const load = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, rgba: context.getImageData(0, 0, image.width, image.height).data };
      };
      const [left, right] = await Promise.all([load(a), load(b)]);
      if (left.width !== right.width || left.height !== right.height) {
        return { sameSize: false, sizes: [[left.width, left.height], [right.width, right.height]] };
      }
      const canvas = document.createElement('canvas');
      canvas.width = left.width;
      canvas.height = left.height;
      const context = canvas.getContext('2d');
      const out = context.createImageData(left.width, left.height);
      let differing = 0;
      let maxDelta = 0;
      for (let k = 0; k < left.rgba.length; k += 4) {
        let delta = 0;
        for (let c = 0; c < 4; c += 1) delta = Math.max(delta, Math.abs(left.rgba[k + c] - right.rgba[k + c]));
        maxDelta = Math.max(maxDelta, delta);
        const grey = (left.rgba[k] + left.rgba[k + 1] + left.rgba[k + 2]) / 3;
        if (delta > 0) differing += 1;
        out.data.set(delta > 0 ? [255, 0, 0, 255] : [grey, grey, grey, 64], k);
      }
      context.putImageData(out, 0, 0);
      return {
        sameSize: true,
        width: left.width,
        height: left.height,
        pixels: left.width * left.height,
        differing,
        maxDelta,
        diff: differing > 0 ? canvas.toDataURL('image/png').split(',')[1] : null,
      };
    },
    { a: a.toString('base64'), b: b.toString('base64') }
  );
}

// ---------------------------------------------------------------------------
// Fold

const FOLDED = '[data-testid="fold-folded-canvas"]';
const CREASE_PATTERN = '[data-testid="fold-crease-pattern-canvas"]';

/** A fresh Fold workspace: the flat square, the valley fold in hand by point onto point. */
async function openFold(page, url) {
  await page.goto(new URL('/fold', url).href, { waitUntil: 'load', timeout: 120000 });
  await page.locator(FOLDED).waitFor({ state: 'visible', timeout: 120000 });
  await steadyShot(page, page.locator(FOLDED));
}

/**
 * The paper's corners on the folded pane, in page px: the box of its outline,
 * read with the viewport toolbar painted over (its icons are dark too).
 */
async function foldedPaperCorners(page) {
  const canvas = page.locator(FOLDED);
  await steadyShot(page, canvas);
  const box = await canvas.boundingBox();
  const shot = await canvas.screenshot({ mask: [page.locator('[data-viewport-toolbar]')], maskColor: '#ffffff' });
  const paper = await darkBox(page, shot);
  if (!box || !paper) throw new Error('No paper on the folded pane');
  // Two px in from the outline: on the paper, well inside the snap radius of the corner.
  const at = (x, y) => ({ x: box.x + x, y: box.y + y });
  return {
    topLeft: at(paper.minX + 2, paper.minY + 2),
    topRight: at(paper.maxX - 2, paper.minY + 2),
    bottomLeft: at(paper.minX + 2, paper.maxY - 2),
    bottomRight: at(paper.maxX - 2, paper.maxY - 2),
  };
}

/** Click a point on the folded pane, then let the hover and the engine's answer land. */
async function clickFolded(page, point) {
  await page.mouse.move(point.x, point.y);
  await settle(page);
  await page.mouse.click(point.x, point.y);
  await steadyShot(page, page.locator(FOLDED));
}

/** Both panes of the Fold canvas, as each case's `<case>-folded.png` and `<case>-crease-pattern.png`. */
async function foldPanes(page) {
  return {
    folded: await steadyShot(page, page.locator(FOLDED)),
    'crease-pattern': await steadyShot(page, page.locator(CREASE_PATTERN)),
  };
}

/**
 * Fold's folded pane through the states that read the stack hit index and the
 * tint ladder: the sheet at rest; a fold located on it (one layer lit as
 * moving, the pointer's hover ring on a corner); the fold made, two layers at
 * rest; and a second fold located across both layers.
 */
async function foldCases(page, url, record) {
  await openFold(page, url);
  await record('fold-sheet', await foldPanes(page));

  // Bottom left onto top right: the lower half moves, lit over the paper.
  let corners = await foldedPaperCorners(page);
  await clickFolded(page, corners.bottomLeft);
  await clickFolded(page, corners.topRight);
  await record('fold-sheet-located', await foldPanes(page));

  await page.keyboard.press('Enter');
  await page.mouse.move(1, 1);
  await steadyShot(page, page.locator(FOLDED));
  await record('fold-step-1', await foldPanes(page));

  // The triangle's top left onto its bottom right: a fold across its two layers.
  corners = await foldedPaperCorners(page);
  await clickFolded(page, corners.topLeft);
  await clickFolded(page, corners.bottomRight);
  await record('fold-step-1-located', await foldPanes(page));
}

/**
 * A deep stack: `tests/fixtures/fold-examples/petal-fold.osf` opened as the
 * app opens a project, at its last step (the bird base). With Alt held the
 * valley fold's point is wherever the pointer is, on the paper on top there
 * (`topSheetPointAt`, the stack index's first answer), and the crease pattern
 * marks that sheet point: one shot per spot.
 */
async function foldStackCases(page, url, record) {
  await openFold(page, url);
  const text = await readFile(path.join(repoRoot, 'tests/fixtures/fold-examples/petal-fold.osf'), 'utf8');
  // File ▸ Open, with a file service that hands over the fixture.
  const opened = await page.evaluate(async (osf) => {
    const store = window.__treemakerWorkspaceStore;
    if (!store) throw new Error('Workspace store debug hook was not installed');
    const files = { openTextFile: async () => ({ text: osf, name: 'petal-fold.osf', path: null }) };
    return store.getState().openProject(files, { confirmDiscard: false });
  }, text);
  if (!opened) throw new Error('petal-fold.osf did not open');
  const next = page.getByRole('button', { name: 'Next step' });
  await next.waitFor({ state: 'visible' });
  for (let guard = 0; guard < 60 && (await next.isEnabled()); guard += 1) {
    await next.click();
    await steadyShot(page, page.locator(FOLDED));
  }
  await page.mouse.move(1, 1);
  await record('fold-bird-base', await foldPanes(page));

  const canvas = await page.locator(FOLDED).boundingBox();
  if (!canvas) throw new Error('No folded pane');
  const corners = await foldedPaperCorners(page);
  const across = (t, s) => ({
    x: corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * t,
    y: corners.topLeft.y + (corners.bottomLeft.y - corners.topLeft.y) * s,
  });
  await page.keyboard.down('Alt');
  try {
    for (const [name, t, s] of [
      ['middle', 0.5, 0.5],
      ['upper', 0.5, 0.3],
      ['left', 0.4, 0.6],
    ]) {
      const at = across(t, s);
      await page.mouse.move(at.x, at.y);
      await record(`fold-bird-base-free-${name}`, await foldPanes(page));
    }
  } finally {
    await page.keyboard.up('Alt');
  }
}

// ---------------------------------------------------------------------------
// The dialog's shell (U4)

const DIALOG = { role: 'dialog', name: 'Layer order' };
const FOLD_WASM_ROUTE = '**/oristudio_fold_wasm_bg.wasm*';

/**
 * Edit on kabuto, in `theme` (a preset's name, or null for the app's
 * default): `tests/fixtures/flat-folder/kabuto.fold` opened as File ▸ Open
 * does, then folded whole as Edit folds a selection. The fold's source and
 * paper scene are kept on `window.__layerOrderCheck`, from which each case
 * builds the request a host would.
 */
async function openKabutoInEdit(page, url, theme) {
  // Nothing of the dialog loads with the page, a file or a fold: no chunk, no worker, no Fold wasm.
  const early = [];
  const onRequest = (request) => early.push(request.url());
  const onWorker = (worker) => early.push(worker.url());
  // The context's requests, which include a worker's own (its wasm fetch); the page's do not.
  page.context().on('request', onRequest);
  page.on('worker', onWorker);
  await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, {
    timeout: 120000,
  });
  const text = await readFile(path.join(repoRoot, 'tests/fixtures/flat-folder/kabuto.fold'), 'utf8');
  await page.evaluate(
    async ({ fold, theme }) => {
      const store = window.__treemakerWorkspaceStore;
      const files = { openTextFile: async () => ({ text: fold, name: 'kabuto.fold', path: null }) };
      if (!(await store.getState().openProject(files, { confirmDiscard: false }))) throw new Error('kabuto did not open');
      if (theme) {
        const { useThemeStore } = await import('/src/store/themeStore.ts');
        useThemeStore.getState().setThemeByName(theme);
      }
      const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
      const figure = await runtime.foldOristudioCpDocument(1, 'Order5');
      const source = await runtime.getOristudioCpFoldedFigureSource(figure.handle);
      const scene = await runtime.getOristudioCpFoldedFigurePaperScene(figure.handle);
      if (!scene) throw new Error('kabuto folded with no subfaces');
      window.__layerOrderCheck = { source, scene };
    },
    { fold: text, theme }
  );
  page.context().off('request', onRequest);
  page.off('worker', onWorker);
  const loaded = early.filter((loadedUrl) =>
    /components\/layer-order\/LayerOrderDialog\.tsx|layerOrderWorker|oristudio_fold_wasm/.test(loadedUrl)
  );
  if (loaded.length > 0) throw new Error(`loaded before any open: ${loaded.join(', ')}`);
  console.log(`[${theme ?? 'default'}] before the open: ${early.length} requests, none of the dialog, its worker or the Fold wasm`);
}

/**
 * Open the dialog through its gateway, as a host does, on kabuto's fold (its
 * digest forged when `forge`); the answer lands on `window.__layerOrderOutcome`.
 */
async function openDialogOnKabuto(page, { forge = false } = {}) {
  await page.evaluate(async ({ forge }) => {
    const { layerOrderSourceOf } = await import('/src/lib/layerOrder/layerOrderSource.ts');
    const { DEFAULT_FOLDED_MODEL } = await import('/src/lib/orieditaNativeMetadata.ts');
    const { DEFAULT_PAPER_STYLE } = await import('/src/lib/paper/paperStyle.ts');
    const { PAPER_STYLE_POLICIES } = await import('/src/lib/paper/paperStyleResolve.ts');
    const { openLayerOrderDialog } = await import('/src/layer-order/dialog/layerOrderDialogGateway.ts');
    const { source, scene } = window.__layerOrderCheck;
    const editLines = () => {
      const { lineStyle, lineWidth } = window.__treemakerWorkspaceStore.getState().oristudioCpViewport;
      return { lineStyle, lineWidth };
    };
    const kernel = forge ? { ...source, digest: `${source.digest}-forged` } : source;
    window.__layerOrderOutcome = null;
    openLayerOrderDialog({
      source: layerOrderSourceOf(kernel, DEFAULT_FOLDED_MODEL),
      record: null,
      look: { style: DEFAULT_PAPER_STYLE, policy: PAPER_STYLE_POLICIES['folded-flat'], turnDeg: 0, side: 'front', xray: false, ...editLines() },
      shown: scene,
      name: 'Kabuto',
      byline: 'Traditional',
    }).then((outcome) => {
      window.__layerOrderOutcome = outcome;
    });
  }, { forge });
  // By its frame, not its name, which a locale translates.
  await anyDialog(page).waitFor({ state: 'visible', timeout: 30000 });
}

/** The modal on top, whatever its name says in the locale. */
function anyDialog(page) {
  return page.locator('[role="dialog"][aria-modal="true"][data-shortcut-barrier]').last();
}

/** How the last dialog ended, once it has: its kind, and for Apply what it handed over. */
async function dialogOutcome(page) {
  await page.waitForFunction(() => window.__layerOrderOutcome !== null, null, { timeout: 30000 });
  return page.evaluate(() => {
    const outcome = window.__layerOrderOutcome;
    if (outcome.kind !== 'applied') return { kind: outcome.kind };
    const { applied } = outcome;
    return { kind: 'applied', relations: applied.relations.length, constraints: applied.record.constraints.length };
  });
}

async function dialogShot(page) {
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  await page.mouse.move(1, 1);
  return { dialog: await steadyShot(page, dialog, { masked: false }) };
}

/**
 * The shell's states, wide and as the whole screen, in one theme: opening (the
 * Fold wasm held back so the state stays), ready, refused (a forged digest),
 * lost (the Fold wasm refused) and, on a phone, ready on each pane.
 */
function dialogShellCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openKabutoInEdit(page, url, theme);
    const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
    const working = dialog.getByText('Working out the layer orders…');
    const ready = dialog.getByRole('complementary', { name: 'Layer order details' });

    // Opening: the worker can't start its engine until the wasm arrives.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    // The worker's fetch reaches the route; a held request is not yet a `request` event.
    const wasmAsked = [];
    await page.context().route(FOLD_WASM_ROUTE, async (route) => {
      wasmAsked.push(route.request().url());
      await held;
      await route.continue();
    });
    // What the open loads, which nothing before it did (`openKabutoInEdit`).
    const opening = [];
    const onRequest = (request) => opening.push(request.url());
    const onWorker = (worker) => opening.push(worker.url());
    page.context().on('request', onRequest);
    page.on('worker', onWorker);
    await openDialogOnKabuto(page);
    await working.waitFor({ state: 'visible' });
    page.context().off('request', onRequest);
    page.off('worker', onWorker);
    for (const expected of [/components\/layer-order\/LayerOrderDialog\.tsx/, /layerOrderWorker/]) {
      if (!opening.some((loadedUrl) => expected.test(loadedUrl))) throw new Error(`the open never loaded ${expected}`);
    }
    // The worker loads its own code first, then asks for the wasm, which the route holds.
    for (let waited = 0; wasmAsked.length === 0 && waited < 60000; waited += 100) await page.waitForTimeout(100);
    if (wasmAsked.length === 0) throw new Error('the open never fetched the Fold wasm');
    console.log(`[${tag}] the open loaded the dialog's code, spawned its worker and fetched the Fold wasm`);
    await record(`dialog-${tag}-opening`, await dialogShot(page));
    release();
    await working.waitFor({ state: 'detached', timeout: 60000 });
    await page.context().unroute(FOLD_WASM_ROUTE);
    await ready.waitFor({ state: 'visible' });
    await record(`dialog-${tag}-ready`, await dialogShot(page));
    // Kabuto's own order, held whole, nothing added: Apply changes nothing (D16), and the host writes nothing.
    await dialog.getByRole('button', { name: 'Apply' }).click();
    const applied = await dialogOutcome(page);
    if (applied.kind !== 'unchanged') throw new Error(`Apply: ${JSON.stringify(applied)}`);
    console.log(`[${tag}] Apply on the host's own order answered unchanged`);

    await openDialogOnKabuto(page, { forge: true });
    await dialog.getByRole('alert').waitFor({ state: 'visible', timeout: 60000 });
    await record(`dialog-${tag}-refused`, await dialogShot(page));
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    if ((await dialogOutcome(page)).kind !== 'cancelled') throw new Error('Cancel did not answer cancelled');

    // Lost: a fresh worker whose wasm never arrives.
    await page.context().route(FOLD_WASM_ROUTE, (route) => route.abort());
    await openDialogOnKabuto(page);
    await dialog.getByRole('button', { name: 'Try again' }).waitFor({ state: 'visible', timeout: 60000 });
    await record(`dialog-${tag}-lost`, await dialogShot(page));
    await page.context().unroute(FOLD_WASM_ROUTE);
    await page.keyboard.press('Escape');
    if ((await dialogOutcome(page)).kind !== 'cancelled') throw new Error('Escape did not answer cancelled');

    // The phone: the whole screen, one pane at a time.
    await page.setViewportSize(PHONE);
    await openDialogOnKabuto(page);
    await ready.waitFor({ state: 'visible', timeout: 60000 });
    await record(`dialog-${tag}-phone-folded`, await dialogShot(page));
    await dialog.getByRole('group', { name: 'Pane' }).getByRole('button', { name: 'Crease pattern' }).click();
    await record(`dialog-${tag}-phone-crease-pattern`, await dialogShot(page));
    await dialog.getByRole('button', { name: 'Close Layer order' }).click();
    if ((await dialogOutcome(page)).kind !== 'cancelled') throw new Error('Close did not answer cancelled');
    await page.setViewportSize(VIEWPORT);
  };
}

const PHONE = { width: 390, height: 844 };

/**
 * The dialog's title line on a phone, in the locales whose words run longest
 * and English: the title, the pane switch and the close button on one line
 * that never wraps, nothing past the screen's edge. Fails on a broken line.
 */
async function dialogPhoneLocales(page, url, record) {
  await openKabutoInEdit(page, url, null);
  for (const width of [360, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const lng of ['en', 'pt-BR', 'ru']) {
      await page.evaluate(async (lng) => {
        const i18n = (await import('/src/i18n/index.ts')).default;
        await i18n.changeLanguage(lng);
        await i18n.loadNamespaces(['dialogs']);
      }, lng);
      await openDialogOnKabuto(page);
      const dialog = anyDialog(page);
      await dialog.getByRole('complementary').waitFor({ state: 'visible', timeout: 60000 });
      const line = await page.evaluate(() => {
        const root = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
        const bar = root.querySelector('[role="document"] > div');
        const close = bar.lastElementChild;
        const head = bar.children[0];
        const title = head.children[0];
        const lead = head.children[1];
        const box = (el) => el.getBoundingClientRect();
        const middle = (el) => Math.round(box(el).top + box(el).height / 2);
        return {
          title: title.textContent,
          clipped: title.scrollWidth > title.clientWidth,
          oneLine: middle(title) === middle(close) && middle(lead) === middle(close),
          inside: Math.round(box(close).right) <= window.innerWidth && Math.round(box(lead).right) <= Math.round(box(close).left),
          scrolls: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      const ok = line.oneLine && line.inside && !line.scrolls;
      console.log(`[phone ${width} ${lng}] ${ok ? 'one line' : 'BROKEN'}: "${line.title}"${line.clipped ? ' (truncated)' : ''}`);
      if (!ok) throw new Error(`the title line broke at ${width}px in ${lng}: ${JSON.stringify(line)}`);
      await page.mouse.move(1, 1);
      await record(`dialog-phone-${width}-${lng}`, { dialog: await steadyShot(page, dialog, { masked: false }) });
      await page.keyboard.press('Escape');
      await dialogOutcome(page);
    }
  }
  await page.evaluate(async () => (await import('/src/i18n/index.ts')).default.changeLanguage('en'));
  await page.setViewportSize(VIEWPORT);
}

/**
 * Fold's Import CP, ModalFrame's other user, wide and on a phone: a
 * screenshot each (for `compare`) and its DOM with every element's computed
 * style, written beside them as JSON, with CSS-module hashes left out. Run on
 * the base and on the change, then diff the two.
 */
async function foldImportFrame(page, url, record, { dir }) {
  await openFold(page, url);
  for (const size of [VIEWPORT, { width: 375, height: 812 }]) {
    await page.setViewportSize(size);
    await page.evaluate(async () => {
      const { useFoldImportUiStore } = await import('/src/fold/io/foldImportUiStore.ts');
      useFoldImportUiStore.getState().open();
    });
    const dialog = page.getByRole('dialog', { name: 'Import crease pattern' });
    await dialog.waitFor({ state: 'visible', timeout: 30000 });
    await page.mouse.move(1, 1);
    await settle(page);
    const dump = await page.evaluate(() => {
      const root = document.querySelector('[role="dialog"][aria-label="Import crease pattern"]');
      const PROPS = [
        'display', 'position', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'margin', 'padding',
        'border', 'border-radius', 'background-color', 'color', 'font-size', 'font-weight', 'line-height',
        'flex', 'flex-wrap', 'order', 'align-items', 'justify-content', 'gap', 'grid-template-columns',
        'grid-row', 'grid-column', 'overflow', 'white-space', 'text-overflow',
      ];
      const walk = (el, depth) => {
        const cs = getComputedStyle(el);
        const attrs = [...el.attributes]
          .filter((a) => a.name !== 'class' && a.name !== 'style')
          .map((a) => `${a.name}=${a.value}`)
          .join(' ');
        const style = Object.fromEntries(PROPS.map((p) => [p, cs.getPropertyValue(p)]));
        return [{ depth, tag: el.tagName.toLowerCase(), attrs, text: el.children.length ? '' : (el.textContent ?? '').trim(), style }, ...[...el.children].flatMap((child) => walk(child, depth + 1))];
      };
      return walk(root, 0);
    });
    await writeFile(path.join(dir, `fold-import-frame-${size.width}.json`), `${JSON.stringify(dump, null, 1)}\n`);
    await record(`fold-import-${size.width}`, { dialog: await steadyShot(page, dialog, { masked: false }) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  }
  await page.setViewportSize(VIEWPORT);
}

// ---------------------------------------------------------------------------
// The panes (U8)

/** The figures the panes are photographed on: `r271-s03`'s faces are convex, two of its spots are not. */
const PANE_FIGURES = [
  { name: 'kabuto', file: 'flat-folder/kabuto.fold', title: 'Kabuto' },
  { name: 'solution-sample-1', file: 'oriedita/solution_sample_1.cp', title: 'Solution sample 1' },
  { name: 'iguana-c0', file: 'precrease/iguana-c0.fold', title: 'Iguana' },
  { name: 'r271-s03', file: 'flat-folder/r271-s03.fold', title: 'r271-s03' },
];

/**
 * Edit on `file` (under `tests/fixtures/`), in `theme`, folded whole as Edit
 * folds it, the fold's source and scene kept on `window.__layerOrderCheck`
 * (`openKabutoInEdit`, for any figure). `style`, when given, is the paper
 * style Edit's display takes, as Settings ▸ Paper sets it.
 */
async function openFigureInEdit(page, url, { theme, file, style = null }) {
  await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, {
    timeout: 120000,
  });
  const text = await readFile(path.join(repoRoot, 'tests/fixtures', file), 'utf8');
  await page.evaluate(
    async ({ text, name, theme, style }) => {
      const store = window.__treemakerWorkspaceStore;
      const files = { openTextFile: async () => ({ text, name, path: null }) };
      if (!(await store.getState().openProject(files, { confirmDiscard: false }))) throw new Error(`${name} did not open`);
      if (theme) {
        const { useThemeStore } = await import('/src/store/themeStore.ts');
        useThemeStore.getState().setThemeByName(theme);
      }
      const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
      const figure = await runtime.foldOristudioCpDocument(1, 'Order5');
      const source = await runtime.getOristudioCpFoldedFigureSource(figure.handle);
      const scene = await runtime.getOristudioCpFoldedFigurePaperScene(figure.handle);
      if (!scene) throw new Error(`${name} folded with no subfaces`);
      window.__layerOrderCheck = { source, scene, style };
    },
    { text, name: path.basename(file), theme, style }
  );
}

/**
 * Open the dialog on the figure `openFigureInEdit` folded, as a host would,
 * in `look` (the paper style given there, the Edit flat figure's policy, no
 * turn, the front, and Edit's line style and width by default), and wait for
 * the panes' session.
 */
async function openPanesDialog(page, title, look = {}) {
  await page.evaluate(
    async ({ title, look }) => {
      const { layerOrderSourceOf } = await import('/src/lib/layerOrder/layerOrderSource.ts');
      const { DEFAULT_FOLDED_MODEL } = await import('/src/lib/orieditaNativeMetadata.ts');
      const { DEFAULT_PAPER_STYLE } = await import('/src/lib/paper/paperStyle.ts');
      const { PAPER_STYLE_POLICIES } = await import('/src/lib/paper/paperStyleResolve.ts');
      const { openLayerOrderDialog } = await import('/src/layer-order/dialog/layerOrderDialogGateway.ts');
      const { source, scene, style } = window.__layerOrderCheck;
      // Edit's line style and width, as Edit hands them; the dialog never reads the store itself.
      const { lineStyle, lineWidth } = window.__treemakerWorkspaceStore.getState().oristudioCpViewport;
      window.__layerOrderOutcome = null;
      openLayerOrderDialog({
        source: layerOrderSourceOf(source, DEFAULT_FOLDED_MODEL),
        record: null,
        look: {
          style: style ?? DEFAULT_PAPER_STYLE,
          policy: PAPER_STYLE_POLICIES[look.policy ?? 'folded-flat'],
          turnDeg: look.turnDeg ?? 0,
          side: look.side ?? 'front',
          xray: look.xray ?? false,
          lineStyle: look.lineStyle ?? lineStyle,
          lineWidth: look.lineWidth ?? lineWidth,
        },
        shown: scene,
        name: title,
      }).then((outcome) => {
        window.__layerOrderOutcome = outcome;
      });
    },
    { title, look }
  );
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 30000 });
  } catch (error) {
    const outcome = await page.evaluate(() => window.__layerOrderOutcome);
    throw new Error(`the dialog never showed on ${title} (it answered ${JSON.stringify(outcome)})`, { cause: error });
  }
  await dialog.getByRole('complementary', { name: 'Layer order details' }).waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForFunction(() => window.__layerOrderPanes?.open != null, null, { timeout: 30000 });
  return dialog;
}

/**
 * Show marks on the panes through the development build's handle
 * (`useLayerOrderPanesCheck`), built in the page from the session's open by
 * `kind`, the way the inspector's model (U10) would mark them:
 *
 * - `subjects`: choosing a subject, every face with choices faint;
 * - `compound`: a subject and two of its objects picked (D21), its other open faces on offer;
 * - `cap`: the subject with the most open faces, none picked, so the label cap shows (D7);
 * - `clash`: `compound`, the second object in a clash with a third face;
 * - `undecided`: the spots the inspector's model calls undecided (`openSpotsOf`), from each
 *   side, and how many there are from each; `side` is only which to count first.
 *
 * Answers what it marked, by letter.
 */
async function showPaneMarks(page, kind, side = 'front') {
  return page.evaluate(
    async ({ kind, side }) => {
      const { NO_FACE_MARKS } = await import('/src/layer-order/panes/layerPaneMarks.ts');
      const handle = window.__layerOrderPanes;
      const { opened, letters, facts } = handle.open;
      const partners = new Map();
      const pairs = opened.open_pairs;
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        const [a, b] = [pairs[i], pairs[i + 1]];
        partners.set(a, [...(partners.get(a) ?? []), b]);
        partners.set(b, [...(partners.get(b) ?? []), a]);
      }
      const byLetter = (faces) => faces.map((face) => letters.letterOf(face)).join(',');
      const withChoices = [...partners.keys()].sort((a, b) => letters.compare(a, b));
      if (kind === 'subjects') {
        handle.show({ marks: { ...NO_FACE_MARKS, picking: 'subject', pickable: withChoices } });
        return { pickable: withChoices.length };
      }
      if (kind === 'undecided') {
        const { initLayerOrderDialog, layerOrderReducer } = await import('/src/layer-order/model/layerOrderReducer.ts');
        const { openSpotsOf } = await import('/src/layer-order/model/layerOrderSelectors.ts');
        let { state } = initLayerOrderDialog({ surface: 'edit_figure', hasRecord: false, recordNeedsAttention: false, review: false, xray: false, at: 0 });
        state = layerOrderReducer(state, { type: 'opened', request: 1, facts }).state;
        const undecided = { front: openSpotsOf(state, 'front'), back: openSpotsOf(state, 'back') };
        handle.show({ marks: { ...NO_FACE_MARKS, picking: 'subject', undecided } });
        return { side, undecided: undecided[side].length, front: undecided.front.length, back: undecided.back.length };
      }
      // The subject: the face with the most open faces for `cap`, else the first with three or more.
      const ranked = [...withChoices].sort((a, b) => (partners.get(b).length - partners.get(a).length) || letters.compare(a, b));
      const subject = kind === 'cap' ? ranked[0] : (withChoices.find((face) => partners.get(face).length >= 3) ?? ranked[0]);
      const open = [...partners.get(subject)].sort((a, b) => letters.compare(a, b));
      if (kind === 'cap') {
        handle.show({ marks: { ...NO_FACE_MARKS, picking: 'object', pickable: open, subject } });
        return { subject: byLetter([subject]), open: open.length };
      }
      const objects = open.slice(0, 2);
      const marks = { ...NO_FACE_MARKS, picking: 'object', pickable: open, subject, objects };
      if (kind === 'clash') {
        const third = withChoices.find((face) => face !== subject && !objects.includes(face));
        handle.show({ marks: { ...marks, clash: [objects[1], third] } });
        return { subject: byLetter([subject]), objects: byLetter(objects), clash: byLetter([objects[1], third]) };
      }
      handle.show({ marks });
      return { subject: byLetter([subject]), objects: byLetter(objects), open: open.length };
    },
    { kind, side }
  );
}

/** The dialog, the pointer off it, once its canvases settle. */
async function panesShot(page) {
  await page.mouse.move(1, 1);
  return dialogShot(page);
}

/** Press one of the title row's view tools: a Side option, X-ray or Undecided. */
async function viewTool(dialog, name) {
  const side = dialog.getByRole('group', { name: 'Side' });
  if (name === 'Front' || name === 'Back') await side.getByRole('button', { name }).click();
  else await dialog.getByRole('button', { name, exact: true }).click();
}

/**
 * Each figure's panes, in one theme: front and back with the faces that have
 * choices tinted, X-ray, Undecided; on kabuto, a subject with two objects
 * picked, and a clash; on iguana-c0, the label cap.
 */
function paneCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    for (const figure of PANE_FIGURES) {
      await openFigureInEdit(page, url, { theme, file: figure.file });
      const dialog = await openPanesDialog(page, figure.title);
      const shot = (state) => `panes-${tag}-${figure.name}-${state}`;
      // At Fit both panes take one scale (Round3's fitAll): their readouts agree.
      const readouts = await Promise.all(
        ['crease pattern', 'folded figure'].map((pane) => dialog.getByRole('button', { name: `Reset the ${pane} zoom` }).innerText())
      );
      console.log(`[${tag}] ${figure.name} at Fit: ${readouts.join(' and ')}`);
      if (Math.abs(Number.parseFloat(readouts[0]) - Number.parseFloat(readouts[1])) > 1) {
        throw new Error(`${figure.name}: the panes' readouts disagree at Fit (${readouts.join(', ')})`);
      }
      console.log(`[${tag}] ${figure.name}: ${JSON.stringify(await showPaneMarks(page, 'subjects'))}`);
      await record(shot('front'), await panesShot(page));
      await viewTool(dialog, 'Back');
      await record(shot('back'), await panesShot(page));
      await viewTool(dialog, 'Front');
      await viewTool(dialog, 'X-ray');
      await record(shot('xray'), await panesShot(page));
      await viewTool(dialog, 'X-ray');
      await viewTool(dialog, 'Undecided');
      // From the side with more of them: the solution sample has one picture from the front.
      const counted = await showPaneMarks(page, 'undecided');
      const side = counted.back > counted.front ? 'back' : 'front';
      if (side === 'back') {
        await viewTool(dialog, 'Back');
        await showPaneMarks(page, 'undecided', 'back');
      }
      console.log(`[${tag}] ${figure.name} undecided: ${JSON.stringify({ ...counted, side })}`);
      await record(shot('undecided'), await panesShot(page));
      await viewTool(dialog, 'Undecided');
      if (side === 'back') await viewTool(dialog, 'Front');
      if (figure.name === 'kabuto') {
        console.log(`[${tag}] kabuto compound: ${JSON.stringify(await showPaneMarks(page, 'compound'))}`);
        await record(shot('compound'), await panesShot(page));
        console.log(`[${tag}] kabuto clash: ${JSON.stringify(await showPaneMarks(page, 'clash'))}`);
        await record(shot('clash'), await panesShot(page));
      }
      if (figure.name === 'iguana-c0') {
        console.log(`[${tag}] iguana-c0 cap: ${JSON.stringify(await showPaneMarks(page, 'cap'))}`);
        await record(shot('cap'), await panesShot(page));
        // Zoomed in on both panes, where the cap's letters have room.
        for (let step = 0; step < 6; step += 1) {
          await dialog.getByRole('button', { name: 'Zoom in the crease pattern' }).click();
          await dialog.getByRole('button', { name: 'Zoom in the folded figure' }).click();
        }
        console.log(`[${tag}] iguana-c0 letters zoomed in: ${await dialog.locator('[data-layer-order-letter]').count()}`);
        await record(shot('cap-zoomed'), await panesShot(page));
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForFunction(() => window.__layerOrderOutcome !== null, null, { timeout: 30000 });
    }
  };
}

/**
 * A refusal that names a face (D4): a frame with a window cut in it, whose
 * one face bends round the window. The crease pattern marks the face it
 * names, in danger, its letter dotted.
 */
async function paneRefusalCases(page, url, record) {
  await openFigureInEdit(page, url, { theme: null, file: 'oriedita/holed_frame_collinear.ori' });
  await page.evaluate(async () => {
    const { layerOrderSourceOf } = await import('/src/lib/layerOrder/layerOrderSource.ts');
    const { DEFAULT_FOLDED_MODEL } = await import('/src/lib/orieditaNativeMetadata.ts');
    const { DEFAULT_PAPER_STYLE } = await import('/src/lib/paper/paperStyle.ts');
    const { PAPER_STYLE_POLICIES } = await import('/src/lib/paper/paperStyleResolve.ts');
    const { openLayerOrderDialog } = await import('/src/layer-order/dialog/layerOrderDialogGateway.ts');
    const { source, scene } = window.__layerOrderCheck;
    const editLines = () => {
      const { lineStyle, lineWidth } = window.__treemakerWorkspaceStore.getState().oristudioCpViewport;
      return { lineStyle, lineWidth };
    };
    window.__layerOrderOutcome = null;
    openLayerOrderDialog({
      source: layerOrderSourceOf(source, DEFAULT_FOLDED_MODEL),
      record: null,
      look: { style: DEFAULT_PAPER_STYLE, policy: PAPER_STYLE_POLICIES['folded-flat'], turnDeg: 0, side: 'front', xray: false, ...editLines() },
      shown: scene,
      name: 'Frame',
    }).then((outcome) => {
      window.__layerOrderOutcome = outcome;
    });
  });
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  await dialog.getByRole('alert').waitFor({ state: 'visible', timeout: 60000 });
  console.log(`[refusal] ${await dialog.getByRole('alert').innerText()}`);
  await record('panes-refused-non-convex', await panesShot(page));
}

/** Counts the WebGL contexts the dialog's canvases make, from before the page loads. */
const LAYER_ORDER_CONTEXT_PROBE = () => {
  const made = [];
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const context = original.call(this, kind, ...rest);
    const id = this.getAttribute('data-testid') ?? '';
    if (context && /webgl/.test(String(kind)) && id.startsWith('layer-order-') && !this.__layerOrderProbed) {
      this.__layerOrderProbed = true;
      made.push(id);
    }
    return context;
  };
  window.__layerOrderContexts = () => made.slice();
  // What reaches the window as an error, a ResizeObserver loop's included: the app toasts each one.
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.message));
  window.__layerOrderErrors = () => errors.slice();
};

/**
 * The phone (390 × 844): one pane at a time, nothing over it; kabuto with a
 * subject and two objects picked, then with its open faces on offer. A
 * switch keeps both panes: the dialog makes its two WebGL contexts once, and
 * a pane zoomed in is as it was after a switch away and back.
 */
async function panePhoneCases(page, url, record) {
  await page.addInitScript(LAYER_ORDER_CONTEXT_PROBE);
  await page.setViewportSize(PHONE);
  await openFigureInEdit(page, url, { theme: null, file: 'flat-folder/kabuto.fold' });
  const dialog = await openPanesDialog(page, 'Kabuto');
  const switchTo = (name) => dialog.getByRole('group', { name: 'Pane' }).getByRole('button', { name }).click();
  console.log(`[phone] kabuto compound: ${JSON.stringify(await showPaneMarks(page, 'compound'))}`);
  await record('panes-phone-folded', await panesShot(page));
  await switchTo('Crease pattern');
  await record('panes-phone-crease-pattern', await panesShot(page));
  if ((await dialog.getByRole('toolbar').count()) !== 0) throw new Error('a toolbar floats over the phone’s pane');
  console.log(`[phone] kabuto cap: ${JSON.stringify(await showPaneMarks(page, 'cap'))}`);
  await record('panes-phone-crease-pattern-offer', await panesShot(page));
  await switchTo('Folded');
  await record('panes-phone-folded-offer', await panesShot(page));

  // Zoomed in on the folded pane, then away to the crease pattern and back.
  const folded = dialog.locator('[data-testid="layer-order-folded-canvas"]');
  const box = await folded.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const fitted = await steadyShot(page, folded, { masked: false });
  await page.mouse.wheel(0, -400);
  const zoomed = await steadyShot(page, folded, { masked: false });
  if ((await pixelDiff(page, fitted, zoomed)).differing === 0) throw new Error('the wheel never zoomed the folded pane');
  await switchTo('Crease pattern');
  await switchTo('Folded');
  const back = await steadyShot(page, folded, { masked: false });
  const kept = await pixelDiff(page, zoomed, back);
  const contexts = await page.evaluate(() => window.__layerOrderContexts());
  console.log(`[phone] after switches: ${kept.differing} pixels moved; contexts made ${JSON.stringify(contexts)}`);
  if (kept.differing !== 0) throw new Error('a switch of pane reset the folded pane’s camera');
  if (contexts.length !== 2) throw new Error(`the dialog made ${contexts.length} WebGL contexts, not 2`);
  const errors = await page.evaluate(() => window.__layerOrderErrors());
  if (errors.length > 0) throw new Error(`the window heard errors: ${JSON.stringify(errors)}`);
  await page.setViewportSize(VIEWPORT);
}

/** Two PNGs side by side on one, the left's height, on white. */
async function sideBySide(page, left, right) {
  const data = await page.evaluate(
    async ({ left, right }) => {
      const load = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        return image;
      };
      const [a, b] = await Promise.all([load(left), load(right)]);
      const height = Math.max(a.height, b.height);
      const canvas = document.createElement('canvas');
      canvas.width = a.width + 8 + b.width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(a, 0, (height - a.height) / 2);
      context.drawImage(b, a.width + 8, (height - b.height) / 2);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { left: left.toString('base64'), right: right.toString('base64') }
  );
  return Buffer.from(data, 'base64');
}

/** A paper style none of the hosts' defaults is: red front, pale back, a heavy navy edge. */
const HOST_STYLE_FIELDS = {
  'paper.front': '#e76f51',
  'paper.back': '#f1faee',
  edges: { width: 2.4, color: '#1d3557', dash: null, cap: 'butt' },
};

/** The dialog's folded pane, steady. */
async function foldedPaneShot(page, dialog) {
  await page.mouse.move(1, 1);
  return steadyShot(page, dialog.locator('[data-layer-order-pane="folded"]'), { masked: false });
}

/**
 * One side-by-side per host look (D18): the host's own picture of kabuto,
 * then the dialog's folded pane opened with the look that host hands it, in
 * a paper style none of them has by default.
 *
 * - **An Edit figure on the canvas:** the display style set to the style
 *   above, the pattern folded whole; the dialog in the figure's effective
 *   style (`effectiveObjectPaperStyle`), the flat figure's policy, no turn.
 * - **A Diagram step card** and **Pose:** the pattern linked to a step,
 *   Folded, in the Diagram's own style (its preset), turned 30° and over in
 *   Pose, its spread off; the card once Pose is done. The dialog in the
 *   Diagram's paint style (`diagramScenePaintStyle`) and policy, the step's
 *   turn, opening on its side, with no spread (D18).
 *
 * The hosts' pens scale with their pictures (the card's are a fraction of
 * Pose's); the dialog's hold their width on screen.
 */
async function hostLookCases(page, url, record) {
  await openFigureInEdit(page, url, { theme: null, file: 'flat-folder/kabuto.fold' });
  const edit = await page.evaluate(async (fields) => {
    const { useSettingsStore } = await import('/src/store/settingsStore.ts');
    useSettingsStore.getState().setPaperStyleFields('display', fields);
    const store = window.__treemakerWorkspaceStore;
    // Every line, as a selection of the whole pattern folds it.
    const lineIds = Array.from({ length: store.getState().oristudioCpDocument.summary.line_segments }, (_, index) => index + 1);
    await store.getState().foldOristudioCpDocument({ startingFaceId: 1, lineIds });
    const figure = store.getState().oristudioCpFoldedFigures.at(-1);
    if (!figure?.handle) throw new Error('Edit folded no figure');
    const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
    const { effectiveObjectPaperStyle } = await import('/src/cp-workspace/paper/objectPaperStyle.ts');
    const source = await runtime.getOristudioCpFoldedFigureSource(figure.handle);
    const scene = await runtime.getOristudioCpFoldedFigurePaperScene(figure.handle);
    window.__layerOrderCheck = { source, scene, style: effectiveObjectPaperStyle(figure) };
    return { rotation: figure.placement.rotation ?? 0, displayStyle: figure.displayStyle };
  }, HOST_STYLE_FIELDS);
  console.log(`[host] Edit figure: ${JSON.stringify(edit)}`);
  await page.waitForTimeout(1500);
  // Edit's viewport, fitted to the pattern and the figure beside it.
  await page.getByRole('toolbar').getByRole('button', { name: 'Fit', exact: true }).first().click();
  await page.mouse.move(1, 1);
  const editShot = await steadyShot(page, page.locator('.cp-panel__viewport').first(), { masked: false });
  let dialog = await openPanesDialog(page, 'Kabuto', { turnDeg: edit.rotation, xray: edit.displayStyle === 'Transparent3' });
  await record('host-edit-figure', { 'side-by-side': await sideBySide(page, editShot, await foldedPaneShot(page, dialog)) });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => window.__layerOrderOutcome !== null, null, { timeout: 30000 });

  // The Diagram: a step linked to the pattern, Folded, posed in Pose.
  await page.evaluate(async () => {
    const { handleMenuAction } = await import('/src/commands/menuActions.ts');
    await handleMenuAction('view.diagram');
  });
  await page.getByRole('button', { name: 'Link a pattern…' }).first().click();
  await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Folded' }).click();
  await page.getByRole('listbox', { name: 'Patterns' }).getByRole('option', { name: 'Pattern 1' }).click();
  await page.getByRole('button', { name: 'Adjust Pose' }).waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('button', { name: 'Adjust Pose' }).click();
  const pose = page.getByRole('toolbar', { name: 'Pose' });
  await pose.waitFor({ state: 'visible', timeout: 60000 });
  await pose.getByRole('button', { name: 'Spread Layers' }).click();
  await pose.getByRole('button', { name: 'Turn Over' }).click();
  const rotation = page.getByRole('spinbutton', { name: 'Rotation' });
  await rotation.fill('30');
  await rotation.press('Enter');
  await page.waitForTimeout(1500);
  const posed = await page.evaluate(() => {
    const state = window.__treemakerWorkspaceStore.getState();
    return state.diagram.steps.find((step) => step.source?.kind === 'cp')?.source.render ?? null;
  });
  console.log(`[host] Diagram step: ${JSON.stringify(posed)}`);
  // Pose's stage: the page left of the Step pane, under the header.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(1000);
  const poseShot = await page.screenshot({ clip: { x: 50, y: 72, width: 1070, height: 760 }, animations: 'disabled' });
  const look = await page.evaluate(async (render) => {
    const state = window.__treemakerWorkspaceStore.getState();
    const { diagramScenePaintStyle } = await import('/src/diagram/pictures/diagramPaperStyle.ts');
    const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
    const figure = await runtime.foldOristudioCpDocument(1, 'Order5');
    const back = render.side === 'back';
    if (back) await runtime.setOristudioCpFoldedFigureModel(figure.handle, { ...figure.snapshot.model, state: 'Back1' });
    const source = await runtime.getOristudioCpFoldedFigureSource(figure.handle);
    const scene = await runtime.getOristudioCpFoldedFigurePaperScene(figure.handle);
    window.__layerOrderCheck = { source, scene, style: diagramScenePaintStyle(state.diagram.style, false) };
    return { turnDeg: render.rotationDeg, side: render.side };
  }, posed);
  dialog = await openPanesDialog(page, 'Step 1', { policy: 'diagram-workspace', turnDeg: look.turnDeg, side: look.side });
  const diagramPane = await foldedPaneShot(page, dialog);
  await record('host-pose', { 'side-by-side': await sideBySide(page, poseShot, diagramPane) });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForFunction(() => window.__layerOrderOutcome !== null, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Done' }).click();
  const card = page.getByRole('listbox', { name: 'Steps' }).getByRole('option').first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
  await record('host-diagram-step', { 'side-by-side': await sideBySide(page, await steadyShot(page, card, { masked: false }), diagramPane) });
}

// ---------------------------------------------------------------------------
// The cases, in order. Later PRs add the dialog's.

const CASES = [
  { name: 'fold', run: foldCases },
  { name: 'fold-stack', run: foldStackCases },
  { name: 'dialog-shell', run: dialogShellCases(null) },
  { name: 'dialog-shell-horizon', run: dialogShellCases('Horizon') },
  { name: 'dialog-phone-locales', run: dialogPhoneLocales },
  { name: 'fold-import-frame', run: foldImportFrame },
  { name: 'panes', run: paneCases(null) },
  { name: 'panes-horizon', run: paneCases('Horizon') },
  { name: 'panes-phone', run: panePhoneCases },
  { name: 'panes-refusal', run: paneRefusalCases },
  { name: 'host-looks', run: hostLookCases },
];

// ---------------------------------------------------------------------------
// Commands

async function capture({ label, url, only }) {
  const dir = path.join(outputRoot, label);
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const { name, run } of CASES) {
      if (only && !only.includes(name)) continue;
      const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      page.on('pageerror', (error) => console.warn(`[${name}] page error: ${error.message}`));
      await run(
        page,
        url,
        async (shot, panes) => {
          for (const [pane, png] of Object.entries(panes)) {
            if (!(await darkBox(page, png))) throw new Error(`${shot}: the ${pane} pane drew nothing`);
            const file = path.join(dir, `${shot}-${pane}.png`);
            await writeFile(file, png);
            console.log(`wrote ${path.relative(repoRoot, file)}`);
          }
        },
        { dir }
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function compare(a, b) {
  const left = path.join(outputRoot, a);
  const right = path.join(outputRoot, b);
  const diffDir = path.join(outputRoot, `${b}-vs-${a}`);
  const names = (await readdir(left)).filter((name) => name.endsWith('.png')).sort();
  const browser = await chromium.launch();
  let failed = false;
  try {
    const page = await browser.newPage();
    console.log(['image', 'pixels', 'differing', 'max channel step'].join('\t'));
    for (const name of names) {
      let other;
      try {
        other = await readFile(path.join(right, name));
      } catch {
        console.log(`${name}\tmissing in ${b}`);
        failed = true;
        continue;
      }
      const result = await pixelDiff(page, await readFile(path.join(left, name)), other);
      if (!result.sameSize) {
        console.log(`${name}\tsizes differ: ${JSON.stringify(result.sizes)}`);
        failed = true;
        continue;
      }
      console.log([name, result.pixels, result.differing, result.maxDelta].join('\t'));
      if (result.diff) {
        failed = true;
        await mkdir(diffDir, { recursive: true });
        await writeFile(path.join(diffDir, name), Buffer.from(result.diff, 'base64'));
      }
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    console.log(`Differences found; diff images in ${path.relative(repoRoot, diffDir)}`);
    process.exitCode = 1;
  } else {
    console.log(`${names.length} images identical`);
  }
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string', default: 'latest' },
    url: { type: 'string', default: `http://localhost:${process.env.DEV_SERVER_PORT ?? '5224'}` },
    only: { type: 'string', multiple: true },
  },
});
const [command, ...rest] = positionals;
if (command === 'capture') {
  await capture({ label: values.label, url: values.url, only: values.only ?? null });
} else if (command === 'compare' && rest.length === 2) {
  await compare(rest[0], rest[1]);
} else {
  console.error('usage: layer-order-dialog-check.mjs capture [--label L] [--url U] [--only CASE…] | compare A B');
  process.exitCode = 2;
}
