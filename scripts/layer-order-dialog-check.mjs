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
// The Diagram step (H7)

/** What the Diagram's capture, the host engine and the dialog load: none of it may load at rest. */
const LAYER_ORDER_LOADS = /components\/layer-order\/LayerOrderDialog\.tsx|layerOrderWorker|oristudio_fold_wasm/;

/** Everything the page and its workers ask for from now, and the workers it starts, until `stop()`. */
function watchLoads(page) {
  const seen = [];
  const onRequest = (request) => seen.push(request.url());
  const onWorker = (worker) => seen.push(worker.url());
  page.context().on('request', onRequest);
  page.on('worker', onWorker);
  return {
    layerOrder: () => seen.filter((loaded) => LAYER_ORDER_LOADS.test(loaded)),
    count: () => seen.length,
    stop() {
      page.context().off('request', onRequest);
      page.off('worker', onWorker);
    },
  };
}

/**
 * Kabuto in Edit, a Diagram with one step linked to its sheet, folded flat,
 * the step open in Pose; the step's id on `window.__layerOrderStep`.
 */
async function linkKabutoStep(page) {
  await page.evaluate(async () => {
    const store = window.__treemakerWorkspaceStore;
    const { useLayoutStore } = await import('/src/store/layoutStore.ts');
    const { ensureCpSheetIndex } = await import('/src/cp-workspace/sheets/cpSheetIndex.ts');
    const { sheetRegions } = await import('/src/cp-workspace/sheets/cpSheetRegions.ts');
    const { linkDiagramStep } = await import('/src/diagram/capture/stepCaptureActions.ts');
    useLayoutStore.getState().activateWorkspace('diagram');
    const index = await ensureCpSheetIndex(store.getState().oristudioCpDocument.document);
    const [sheet] = sheetRegions(index);
    const stepId = store.getState().addDiagramStep();
    if (!(await linkDiagramStep(stepId, sheet, 'folded'))) throw new Error('kabuto did not link');
    store.getState().openDiagramStep(stepId);
    window.__layerOrderStep = stepId;
  });
}

/**
 * A constraint that moves kabuto's step off the order it shows, worked out on
 * the host engine as the dialog would (open on the order shown, the first open
 * pair either way, the side that changes a spot), and applied as the dialog's
 * Apply is: through the Diagram's capture, as one undo step. What it was.
 */
async function applyConstraintToStep(page) {
  return page.evaluate(async () => {
    const store = window.__treemakerWorkspaceStore;
    const stepId = window.__layerOrderStep;
    const { stepById } = await import('/src/diagram/document/diagramDocument.ts');
    const { chooseStepCreases, knownCreasesOf } = await import('/src/diagram/capture/captureCreases.ts');
    const { resolveFoldRoute } = await import('/src/cp-workspace/folded/foldRoute.ts');
    const { peekCpSheetIndex } = await import('/src/cp-workspace/sheets/cpSheetIndex.ts');
    const { captureModel } = await import('/src/diagram/capture/captureFolded.ts');
    const { stepFoldSource } = await import('/src/diagram/capture/captureLayerOrder.ts');
    const { createCpCaptureRuntime } = await import('/src/store/workspaceStore/cpFoldRuntimeBindings.ts');
    const { createLayerOrderRuntime } = await import('/src/layer-order/engine/layerOrderRuntime.ts');
    const { LAYER_ORDER_LIMITS } = await import('/src/layer-order/engine/layerOrderEngine.ts');
    const { layerOrderSceneRelations } = await import('/src/layer-order/engine/layerOrderSceneRelations.ts');
    const state = store.getState();
    const source = stepById(state.diagram, stepId).source;
    const document = state.oristudioCpDocument.document;
    const choice = chooseStepCreases(document, source.scope, peekCpSheetIndex(document), knownCreasesOf(source));
    const route = resolveFoldRoute(document, choice.creases.foldLineIds);
    const folded = await stepFoldSource(createCpCaptureRuntime(0, null), route.lineIds, captureModel(document, source.render.side));
    const runtime = createLayerOrderRuntime({ role: 'host' });
    try {
      const { engine } = runtime;
      const opened = await engine.openShowing(folded.source, layerOrderSceneRelations(folded.scene), LAYER_ORDER_LIMITS.open);
      if (opened.status !== 'ok') throw new Error(`open: ${JSON.stringify(opened)}`);
      const pairs = opened.open_pairs;
      let chosen = null;
      for (let k = 0; k + 1 < pairs.length && !chosen; k += 2) {
        for (const sign of [1, -1]) {
          const candidate = [pairs[k], pairs[k + 1], sign];
          const previewed = await engine.preview(candidate, LAYER_ORDER_LIMITS.preview);
          if (previewed.verdict === 'fits' && previewed.changed.front.length + previewed.changed.back.length > 0) {
            chosen = { candidate, token: previewed.token, spots: previewed.changed.front.length };
            break;
          }
        }
      }
      if (!chosen) throw new Error('no constraint moves kabuto off its order');
      await engine.commitPreview(chosen.token, [chosen.candidate], LAYER_ORDER_LIMITS.commit);
      const saved = await engine.save();
      if (saved.status !== 'ok') throw new Error(`save: ${JSON.stringify(saved)}`);
      const relations = await engine.relations();
      const applied = { record: saved.record, relations, source: folded.source };
      const outcome = await store.getState().captureDiagramStep(stepId, {
        scope: source.scope,
        known: knownCreasesOf(source),
        render: source.render,
        kind: 'diagram-capture',
        label: 'Change layer order',
        layerOrderApplied: { applied, frame: folded.frame },
      });
      return {
        outcome: outcome.status,
        candidate: chosen.candidate,
        spots: chosen.spots,
        openPairs: pairs.length / 2,
        undo: store.getState().diagramHistory.past.at(-1)?.label,
      };
    } finally {
      runtime.dispose();
    }
  });
}

/** The step detail's picture, the pose toolbar over it painted out. */
async function stageShot(page) {
  const stage = page.locator('[role="region"] [data-picture]').first();
  await page.mouse.move(1, 1);
  await settle(page);
  return stage.screenshot({ animations: 'disabled', mask: [page.getByRole('toolbar', { name: 'Pose' })], maskColor: '#ff00ff' });
}

async function pageShot(page) {
  await page.mouse.move(1, 1);
  await settle(page);
  await page.waitForTimeout(250);
  return page.screenshot({ animations: 'disabled' });
}

/** Wait for the step to stop capturing. */
async function captured(page) {
  await page.waitForFunction(
    () => Object.keys(window.__treemakerWorkspaceStore.getState().diagramCaptures).length === 0,
    null,
    { timeout: 120000 }
  );
  await settle(page);
}

/** Wait for the step to be shown `mode`, and done capturing. */
async function shownAs(page, mode) {
  await page.waitForFunction(
    (wanted) => {
      const state = window.__treemakerWorkspaceStore.getState();
      const step = state.diagram?.steps.find((entry) => entry.id === window.__layerOrderStep);
      return step?.source?.render.mode === wanted && Object.keys(state.diagramCaptures).length === 0;
    },
    mode,
    { timeout: 120000 }
  );
  await settle(page);
}

/**
 * Open the step's detail again. One opened on the Diagram's first mount holds
 * a controller React's dev double mount has already let go of (found in
 * passing; dev only, not this PR's), and its verbs would do nothing.
 */
async function reopenDetail(page) {
  await page.evaluate(async () => {
    const store = window.__treemakerWorkspaceStore;
    store.getState().closeDiagramStep();
    await new Promise((resolve) => setTimeout(resolve, 300));
    store.getState().openDiagramStep(window.__layerOrderStep);
  });
  await page.waitForFunction(
    async () => {
      const { openLinkedPoseOf } = await import('/src/diagram/capture/openLinkedPose.ts');
      return openLinkedPoseOf(window.__layerOrderStep) !== null;
    },
    null,
    { timeout: 30000 }
  );
  await settle(page);
}

/** The open step's pager, as its Pose publishes it: the count, and whether › is held. */
async function pagerNow(page) {
  return page.evaluate(async () => {
    const { openLinkedPoseOf } = await import('/src/diagram/capture/openLinkedPose.ts');
    const pose = openLinkedPoseOf(window.__layerOrderStep);
    const next = pose?.actions.find((action) => action.id === 'next-solution');
    return { count: pose?.layerOrder?.count ?? null, nextHeld: next?.disabled ?? null };
  });
}

/** Run one of the open step's Pose verbs, and wait for its capture. */
async function poseVerb(page, id) {
  await page.evaluate(async (verb) => {
    const { openLinkedPoseOf } = await import('/src/diagram/capture/openLinkedPose.ts');
    openLinkedPoseOf(window.__layerOrderStep)?.actions.find((action) => action.id === verb)?.run();
  }, id);
  await page.waitForTimeout(200);
  await captured(page);
}

/** The step's source as the store holds it, with its record read. */
async function stepSource(page) {
  return page.evaluate(async () => {
    const { stepById } = await import('/src/diagram/document/diagramDocument.ts');
    const { stepLayerOrderOf } = await import('/src/diagram/capture/captureLayerOrder.ts');
    const source = stepById(window.__treemakerWorkspaceStore.getState().diagram, window.__layerOrderStep).source;
    const read = stepLayerOrderOf(source.layerOrder);
    return {
      mode: source.render.mode,
      constraints: read ? read.record.constraints.length : null,
      attention: read?.record.attention ?? null,
      picture: window.__treemakerWorkspaceStore.getState().diagram.steps.find((step) => step.id === window.__layerOrderStep)
        ?.picture?.key,
    };
  });
}

/**
 * A Diagram step with a layer order (H7), in one theme: the constrained order
 * drawn against the kernel's; nothing of the engine loaded by opening the
 * saved diagram and selecting the step; Show as and back; Refresh after an
 * edit that keeps the faces; a clash flagged with Review…; a step whose
 * creases now fold in 3D; and Edit… opening the dialog's shell.
 */
function diagramStepCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openKabutoInEdit(page, url, theme);
    await linkKabutoStep(page);
    await captured(page);
    const unconstrained = await stageShot(page);
    await record(`diagram-${tag}-unconstrained`, { stage: unconstrained });

    // Pose's facts are the record's order's too (#519 review, fix 4): turned in a chosen order, and
    // both undone, the pager counts the kernel's orders again, never the held fold's one of one.
    await reopenDetail(page);
    const pagerBefore = await pagerNow(page);
    const trial = await applyConstraintToStep(page);
    await captured(page);
    if (trial.outcome !== 'captured') throw new Error(`Apply: ${trial.outcome}`);
    await poseVerb(page, 'rotate-right');
    const pagerHeld = await pagerNow(page);
    await page.evaluate(() => {
      const state = window.__treemakerWorkspaceStore.getState();
      state.undoDiagram();
      state.undoDiagram();
    });
    await captured(page);
    await page.waitForTimeout(500);
    const pagerUndone = await pagerNow(page);
    const recordUndone = (await stepSource(page)).constraints;
    console.log(
      `[${tag}] pager: before ${JSON.stringify(pagerBefore)}, turned in the chosen order ${JSON.stringify(pagerHeld)}, both undone ${JSON.stringify(pagerUndone)} (record ${recordUndone})`
    );
    if (recordUndone !== null || pagerUndone.nextHeld !== pagerBefore.nextHeld || pagerUndone.count === null) {
      throw new Error('undo left the pager on the chosen order’s facts');
    }
    await record(`diagram-${tag}-pager-undone`, { page: await pageShot(page) });

    const applied = await applyConstraintToStep(page);
    await captured(page);
    console.log(`[${tag}] applied ${JSON.stringify(applied)}`);
    if (applied.outcome !== 'captured') throw new Error(`Apply: ${applied.outcome}`);
    const constrained = await stageShot(page);
    await record(`diagram-${tag}-constrained`, { stage: constrained });
    const differs = await pixelDiff(page, unconstrained, constrained);
    console.log(`[${tag}] constrained vs unconstrained: ${differs.differing} of ${differs.pixels} pixels differ`);
    if (!differs.sameSize || differs.differing === 0) throw new Error('the constrained order drew the same picture');

    // Saved, and opened again in a fresh page: nothing of the engine loads with it, nor as the step is shown.
    const saved = await page.evaluate(async () => {
      let text = null;
      const files = {
        saveTextFile: async (options) => {
          text = options.contents;
          return { name: 'kabuto-diagram.osf', path: null };
        },
      };
      if (!(await window.__treemakerWorkspaceStore.getState().saveProjectAs(files))) throw new Error('save failed');
      return { text, stepId: window.__layerOrderStep };
    });
    await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, { timeout: 120000 });
    const loads = watchLoads(page);
    await page.evaluate(
      async ({ osf, stepId, theme }) => {
        const store = window.__treemakerWorkspaceStore;
        const files = { openTextFile: async () => ({ text: osf, name: 'kabuto-diagram.osf', path: null }) };
        if (!(await store.getState().openProject(files, { confirmDiscard: false }))) throw new Error('the diagram did not open');
        if (theme) {
          const { useThemeStore } = await import('/src/store/themeStore.ts');
          useThemeStore.getState().setThemeByName(theme);
        }
        const { useLayoutStore } = await import('/src/store/layoutStore.ts');
        useLayoutStore.getState().activateWorkspace('diagram');
        store.getState().selectDiagramStep(stepId);
        store.getState().openDiagramStep(stepId);
        window.__layerOrderStep = stepId;
      },
      { osf: saved.text, stepId: saved.stepId, theme }
    );
    const row = page.locator('[data-field-row]', { hasText: 'Layer order' });
    await row.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(1500);
    const reopened = await pageShot(page);
    loads.stop();
    if (loads.layerOrder().length > 0) throw new Error(`loaded at rest: ${loads.layerOrder().join(', ')}`);
    console.log(`[${tag}] reopened and shown: ${loads.count()} requests, none of the dialog, its worker or the Fold wasm`);
    await record(`diagram-${tag}-pane-constrained`, { page: reopened });
    const reopenedStage = await stageShot(page);
    const same = await pixelDiff(page, constrained, reopenedStage);
    console.log(`[${tag}] reopened picture vs the constrained one: ${same.differing} pixels differ`);

    // Show as Crease Pattern, then Folded again, from the Step pane (through the open step's Pose):
    // the record survives and is drawn again. The detail is opened again first (`reopenDetail`).
    await reopenDetail(page);
    await row.waitFor({ state: 'visible', timeout: 60000 });
    const showAs = page.getByRole('group', { name: 'Show as' });
    await showAs.getByRole('button', { name: 'Crease Pattern' }).click();
    await shownAs(page, 'crease-pattern');
    const asPattern = await stepSource(page);
    await record(`diagram-${tag}-show-as-pattern`, { stage: await stageShot(page) });
    await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Folded' }).click();
    await shownAs(page, 'folded-flat');
    const back = await stepSource(page);
    console.log(`[${tag}] Show as: crease pattern ${JSON.stringify(asPattern)}, folded ${JSON.stringify(back)}`);
    if (asPattern.constraints !== 1 || asPattern.mode !== 'crease-pattern' || back.constraints !== 1) {
      throw new Error('Show as lost the record');
    }
    const shownBack = await stageShot(page);
    await record(`diagram-${tag}-show-as-back`, { stage: shownBack });
    const roundTrip = await pixelDiff(page, constrained, shownBack);
    console.log(`[${tag}] Show as round trip vs the constrained picture: ${roundTrip.differing} pixels differ`);

    // An edit that keeps every face: a border line split in two. The link goes out of date; Refresh restores the record.
    const edit = await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      const lines = store.getState().oristudioCpDocument.document.crease_pattern.line_segments;
      const ys = lines.flatMap((line) => [line.a.y, line.b.y]);
      const minY = Math.min(...ys);
      const index = lines.findIndex(
        (line) => line.color === 'Black0' && Math.abs(line.a.y - minY) < 1e-9 && Math.abs(line.b.y - minY) < 1e-9
      );
      if (index < 0) throw new Error('no border line on the bottom');
      const line = lines[index];
      const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
      await store.getState().replaceOristudioCpLineSegments([index + 1], [{ ...line, b: mid }, { ...line, a: mid }], 'Split border');
      return { lineId: index + 1 };
    });
    console.log(`[${tag}] edited: split border line ${edit.lineId}`);
    const revision = await page.evaluate(
      () => window.__treemakerWorkspaceStore.getState().diagram.steps.find((step) => step.id === window.__layerOrderStep).revision
    );
    await page.getByRole('button', { name: 'Refresh Picture' }).click();
    await page.waitForFunction(
      (was) => {
        const state = window.__treemakerWorkspaceStore.getState();
        const step = state.diagram.steps.find((entry) => entry.id === window.__layerOrderStep);
        return step.revision > was && Object.keys(state.diagramCaptures).length === 0;
      },
      revision,
      { timeout: 120000 }
    );
    await settle(page);
    const refreshed = await stepSource(page);
    console.log(`[${tag}] refreshed after the edit: ${JSON.stringify(refreshed)}`);
    if (refreshed.constraints !== 1 || refreshed.attention) throw new Error('Refresh did not restore the record');
    const afterEdit = await stageShot(page);
    await record(`diagram-${tag}-refreshed`, { stage: afterEdit });
    const kept = await pixelDiff(page, constrained, afterEdit);
    console.log(`[${tag}] refreshed picture vs the constrained one: ${kept.differing} pixels differ`);

    // A forced clash: the record's constraint and its opposite. Refresh keeps the picture and flags the step.
    await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      const { stepById, setLinkedLayerOrder } = await import('/src/diagram/document/diagramDocument.ts');
      const { stepLayerOrderOf } = await import('/src/diagram/capture/captureLayerOrder.ts');
      const { encodeLayerOrderRecord } = await import('/src/lib/layerOrder/layerOrderRecord.ts');
      const stepId = window.__layerOrderStep;
      const source = stepById(store.getState().diagram, stepId).source;
      const { record } = stepLayerOrderOf(source.layerOrder);
      const [f, g, sign] = record.constraints[0];
      const clashing = encodeLayerOrderRecord({ ...record, constraints: [...record.constraints, [f, g, -sign]] });
      store.setState({ diagram: setLinkedLayerOrder(store.getState().diagram, stepId, clashing.json) });
    });
    const pictureBefore = (await stepSource(page)).picture;
    await page.evaluate(async () => {
      const { refreshDiagramStep } = await import('/src/diagram/capture/stepCaptureActions.ts');
      await refreshDiagramStep(window.__layerOrderStep);
    });
    await captured(page);
    const clashed = await stepSource(page);
    console.log(`[${tag}] clash: ${JSON.stringify(clashed)}`);
    if (clashed.attention?.reason !== 'conflict' || clashed.picture !== pictureBefore) {
      throw new Error('the clash did not keep the picture and flag the step');
    }
    await page.getByRole('button', { name: 'Review…' }).waitFor({ state: 'visible', timeout: 10000 });
    await record(`diagram-${tag}-pane-attention`, { page: await pageShot(page) });

    // Edit… opens the dialog's shell on the step; Cancel writes nothing. The Step pane's, by its row:
    // the Pose toolbar's Edit order… has the same name (H8).
    const entries = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    await row.getByRole('button', { name: 'Edit Layer Order…' }).click();
    const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);
    await record(`diagram-${tag}-dialog`, { dialog: await steadyShot(page, dialog, { masked: false, timeoutMs: 60000 }) });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const after = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    if (after !== entries) throw new Error('Cancel wrote something');
    console.log(`[${tag}] Edit… opened the dialog; Cancel wrote nothing`);

    // The flagged card reads Needs attention, not Out of date (#519 review, fix 9).
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().closeDiagramStep());
    const chip = page.locator('[data-tone]', { hasText: 'Needs attention' }).first();
    await chip.waitFor({ state: 'visible', timeout: 10000 });
    await record(`diagram-${tag}-card-attention`, { page: await pageShot(page) });
    console.log(`[${tag}] the flagged card reads ${JSON.stringify(await chip.textContent())}`);
    await reopenDetail(page);

    // Shown as its crease pattern, the flagged step's Review… still opens the dialog, on the flat fold
    // the step would show (#519 review, fix 2); Cancel writes nothing.
    await page.getByRole('group', { name: 'Show as' }).getByRole('button', { name: 'Crease Pattern' }).click();
    await shownAs(page, 'crease-pattern');
    const review = page.getByRole('button', { name: 'Review…' });
    await review.waitFor({ state: 'visible', timeout: 10000 });
    if ((await review.getAttribute('aria-disabled')) === 'true') throw new Error('Review… is held on a crease pattern');
    await record(`diagram-${tag}-pane-attention-pattern`, { page: await pageShot(page) });
    const reviewEntries = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    await review.click();
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);
    await record(`diagram-${tag}-review-from-pattern`, { dialog: await steadyShot(page, dialog, { masked: false, timeoutMs: 60000 }) });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const reviewed = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    if (reviewed !== reviewEntries) throw new Error('Cancel from Review… wrote something');
    console.log(`[${tag}] Review… opened the dialog from the crease pattern; Cancel wrote nothing`);

    // The creases now fold in 3D: Refresh draws the 3D picture, keeps the record and flags it waiting.
    const route = await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      const lines = store.getState().oristudioCpDocument.document.crease_pattern.line_segments;
      const index = lines.findIndex((line) => line.color === 'Red1' || line.color === 'Blue2');
      await store.getState().replaceOristudioCpLineSegments([index + 1], [{ ...lines[index], fold_magnitude: 90 }], 'Partial fold');
      const { refreshDiagramStep } = await import('/src/diagram/capture/stepCaptureActions.ts');
      return refreshDiagramStep(window.__layerOrderStep);
    });
    await captured(page);
    let in3d = await stepSource(page);
    console.log(`[${tag}] after a partial fold: refreshed ${route}, ${JSON.stringify(in3d)}`);
    if (in3d.mode !== 'folded-3d') {
      // Kabuto's 3D fold refused that crease: the row's 3D state is shown on the step's render alone.
      await page.evaluate(async () => {
        const store = window.__treemakerWorkspaceStore;
        const diagram = store.getState().diagram;
        const camera = { yaw: 0, pitch: 0, zoom: 1 };
        store.setState({
          diagram: {
            ...diagram,
            steps: diagram.steps.map((step) =>
              step.id === window.__layerOrderStep ? { ...step, source: { ...step.source, render: { mode: 'folded-3d', side: 'front', camera } } } : step
            ),
          },
        });
      });
      in3d = await stepSource(page);
      console.log(`[${tag}] 3D refused for kabuto; the 3D row shown on the render: ${JSON.stringify(in3d)}`);
    }
    const paneEdit = row.getByRole('button', { name: 'Edit Layer Order…' });
    await paneEdit.waitFor({ state: 'visible' });
    if ((await paneEdit.getAttribute('aria-disabled')) !== 'true') {
      throw new Error('Edit… is not held on a 3D step');
    }
    await record(`diagram-${tag}-pane-3d`, { page: await pageShot(page) });
  };
}

/**
 * Refresh All offline (#519 second review): five constrained steps and one
 * without a record, all out of date, refreshed with the network gone. The
 * host engine is asked once, the constrained steps after it counted; the
 * unconstrained one refreshes; one toast counts them, and the app's error
 * toast ("The worker stopped unexpectedly.") says nothing.
 */
function diagramStepOfflineCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openKabutoInEdit(page, url, theme);
    await linkKabutoStep(page);
    await captured(page);
    const applied = await applyConstraintToStep(page);
    await captured(page);
    if (applied.outcome !== 'captured') throw new Error(`Apply: ${applied.outcome}`);
    await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      const { ensureCpSheetIndex } = await import('/src/cp-workspace/sheets/cpSheetIndex.ts');
      const { sheetRegions } = await import('/src/cp-workspace/sheets/cpSheetRegions.ts');
      const { linkDiagramStep } = await import('/src/diagram/capture/stepCaptureActions.ts');
      store.getState().closeDiagramStep();
      // Four copies, record and all: five constrained steps.
      for (let i = 0; i < 4; i += 1) store.getState().duplicateDiagramStep(window.__layerOrderStep);
      const [sheet] = sheetRegions(await ensureCpSheetIndex(store.getState().oristudioCpDocument.document));
      const plain = store.getState().addDiagramStep();
      if (!(await linkDiagramStep(plain, sheet, 'folded'))) throw new Error('the plain step did not link');
      // An edit that keeps every face: every step goes out of date.
      const lines = store.getState().oristudioCpDocument.document.crease_pattern.line_segments;
      const minY = Math.min(...lines.flatMap((line) => [line.a.y, line.b.y]));
      const index = lines.findIndex(
        (line) => line.color === 'Black0' && Math.abs(line.a.y - minY) < 1e-9 && Math.abs(line.b.y - minY) < 1e-9
      );
      const line = lines[index];
      const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
      await store.getState().replaceOristudioCpLineSegments([index + 1], [{ ...line, b: mid }, { ...line, a: mid }], 'Split border');
      // What the run needs, loaded while online: Refresh All, and the host engine's code (not its worker).
      window.__refreshAll = (await import('/src/diagram/capture/captureQueue.ts')).refreshAllDiagramSteps;
      await (await import('/src/layer-order/host/hostEngineGateway.ts')).loadLayerOrderHostEngine();
      const Spawning = window.Worker;
      window.__spawned = [];
      window.Worker = class extends Spawning {
        constructor(...args) {
          super(...args);
          window.__spawned.push(String(args[0]));
        }
      };
    });
    await settle(page);

    await page.context().setOffline(true);
    const result = await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      const refreshed = await window.__refreshAll();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const { stepLayerOrderOf } = await import('/src/diagram/capture/captureLayerOrder.ts');
      const steps = store.getState().diagram.steps.filter((step) => step.source?.kind === 'cp');
      return {
        refreshed,
        layerOrderWorkers: window.__spawned.filter((spawned) => spawned.includes('layerOrderWorker')).length,
        toasts: [...document.querySelectorAll('[data-sonner-toast]')].map((toast) => toast.textContent?.trim()),
        error: store.getState().error,
        flagged: steps.filter((step) => stepLayerOrderOf(step.source.layerOrder)?.record.attention).length,
        constrained: steps.filter((step) => step.source.layerOrder !== undefined).length,
      };
    });
    await record(`diagram-${tag}-offline-refresh-all`, { page: await pageShot(page) });
    await page.context().setOffline(false);
    console.log(`[${tag}] offline Refresh All: ${JSON.stringify(result)}`);
    const said = 'Layer order couldn’t load, so 5 steps weren’t changed. Check your connection, then try again.';
    if (result.refreshed !== 1) throw new Error('offline Refresh All did not refresh the unconstrained step alone');
    if (result.layerOrderWorkers > 1) throw new Error(`offline Refresh All spawned ${result.layerOrderWorkers} workers`);
    if (!result.toasts.some((toast) => toast?.includes(said))) throw new Error('offline Refresh All did not count its steps');
    if (result.toasts.some((toast) => toast?.includes('stopped unexpectedly')) || result.error) {
      throw new Error('offline Refresh All raised the app’s error toast');
    }
    if (result.flagged !== 0 || result.constrained !== 5) throw new Error('offline Refresh All wrote to a record');
  };
}

// ---------------------------------------------------------------------------
// Pose (H8)

/** The step detail's Pose toolbar. */
function poseToolbar(page) {
  return page.getByRole('toolbar', { name: 'Pose' });
}

/** The toolbar's controls by name, whether ‹, › and Edit order… are held, and what it reads. */
async function poseToolbarState(page) {
  const bar = poseToolbar(page);
  const held = async (name) => (await bar.getByRole('button', { name }).getAttribute('aria-disabled')) === 'true';
  return {
    previous: await held('Previous Layer Order'),
    next: await held('Next Layer Order'),
    edit: await held(EDIT_ORDER),
    // Each button's accessible name: its label, or the words it shows.
    names: await bar
      .locator('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)),
    editTitle: await bar.getByRole('button', { name: EDIT_ORDER }).getAttribute('title'),
    text: (await bar.textContent()) ?? '',
  };
}

/** Pose's Edit order…, named by the word it shows. */
const EDIT_ORDER = 'Edit order…';

/** The toolbar, with the tooltip of the control named `hover` up when given. */
async function toolbarShot(page, hover = null) {
  const bar = poseToolbar(page);
  // Away first: a control just pressed under the pointer has had its tooltip dismissed.
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  if (hover) {
    await bar.getByRole('button', { name: hover }).hover();
    await page.waitForTimeout(900);
  }
  await settle(page);
  const box = await bar.boundingBox();
  const x = Math.max(0, Math.floor(box.x - 24));
  const y = Math.max(0, Math.floor(box.y - 64));
  return page.screenshot({
    animations: 'disabled',
    clip: { x, y, width: Math.min(VIEWPORT.width - x, Math.ceil(box.width + 48)), height: Math.ceil(box.height + 88) },
  });
}

/** Run one of the open step's Pose verbs from the toolbar, and wait for its capture. */
async function toolbarVerb(page, name) {
  await poseToolbar(page).getByRole('button', { name }).click();
  await page.waitForTimeout(200);
  await captured(page);
}

/**
 * The request the open dialog was given, against the kernel's own: the step's
 * creases folded afresh at its case (and at the first, to tell them apart),
 * its scene read. What Pose's held fold is, if Edit order… opened on it.
 */
async function dialogRequestAgainstKernel(page) {
  return page.evaluate(async () => {
    const { useLayerOrderDialogStore } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
    const { stepById } = await import('/src/diagram/document/diagramDocument.ts');
    const { chooseStepCreases, knownCreasesOf } = await import('/src/diagram/capture/captureCreases.ts');
    const { resolveFoldRoute } = await import('/src/cp-workspace/folded/foldRoute.ts');
    const { peekCpSheetIndex } = await import('/src/cp-workspace/sheets/cpSheetIndex.ts');
    const { captureModel } = await import('/src/diagram/capture/captureFolded.ts');
    const { stepFoldSource } = await import('/src/diagram/capture/captureLayerOrder.ts');
    const { createCpCaptureRuntime } = await import('/src/store/workspaceStore/cpFoldRuntimeBindings.ts');
    const request = useLayerOrderDialogStore.getState().opening?.request;
    if (!request) throw new Error('no dialog is open');
    const state = window.__treemakerWorkspaceStore.getState();
    const source = stepById(state.diagram, window.__layerOrderStep).source;
    const document = state.oristudioCpDocument.document;
    const choice = chooseStepCreases(document, source.scope, peekCpSheetIndex(document), knownCreasesOf(source));
    const route = resolveFoldRoute(document, choice.creases.foldLineIds);
    const runtime = createCpCaptureRuntime(0, null);
    const model = captureModel(document, source.render.side);
    const atCase = await stepFoldSource(runtime, route.lineIds, model, source.render.foldCase);
    const atFirst = await stepFoldSource(runtime, route.lineIds, model, 1);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      foldCase: source.render.foldCase,
      turnDeg: request.look.turnDeg,
      rotationDeg: source.render.rotationDeg,
      record: request.record ? request.record.constraints.length : null,
      shown: request.shown ? (same(request.shown, atCase.scene) ? 'the step’s case' : same(request.shown, atFirst.scene) ? 'the first' : 'another') : null,
      firstDiffers: !same(atCase.scene, atFirst.scene),
      digest: request.source.digest === atCase.source.digest,
      name: request.name ?? null,
      surface: request.surface ?? null,
    };
  });
}

/**
 * Answer the open dialog with Apply, as its inspector will once U10 lands: on
 * the host engine, opened on the request the host gave (its source and the
 * scene it shows), the first open pair whose constraint moves a spot, saved,
 * with its relations; handed back through the dialog's store as `applied`.
 */
async function applyThroughOpenDialog(page) {
  return page.evaluate(async () => {
    const { useLayerOrderDialogStore, settleLayerOrderDialog } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
    const { createLayerOrderRuntime } = await import('/src/layer-order/engine/layerOrderRuntime.ts');
    const { LAYER_ORDER_LIMITS } = await import('/src/layer-order/engine/layerOrderEngine.ts');
    const { layerOrderSceneRelations } = await import('/src/layer-order/engine/layerOrderSceneRelations.ts');
    const opening = useLayerOrderDialogStore.getState().opening;
    if (!opening) throw new Error('no dialog is open');
    const { request } = opening;
    const runtime = createLayerOrderRuntime({ role: 'host' });
    try {
      const { engine } = runtime;
      const opened = await engine.openShowing(request.source, layerOrderSceneRelations(request.shown), LAYER_ORDER_LIMITS.open);
      if (opened.status !== 'ok') throw new Error(`open: ${JSON.stringify(opened)}`);
      const pairs = opened.open_pairs;
      let chosen = null;
      for (let k = 0; k + 1 < pairs.length && !chosen; k += 2) {
        for (const sign of [1, -1]) {
          const candidate = [pairs[k], pairs[k + 1], sign];
          const previewed = await engine.preview(candidate, LAYER_ORDER_LIMITS.preview);
          if (previewed.verdict === 'fits' && previewed.changed.front.length + previewed.changed.back.length > 0) {
            chosen = { candidate, token: previewed.token };
            break;
          }
        }
      }
      if (!chosen) throw new Error('no constraint moves the step off its order');
      await engine.commitPreview(chosen.token, [chosen.candidate], LAYER_ORDER_LIMITS.commit);
      const saved = await engine.save();
      if (saved.status !== 'ok') throw new Error(`save: ${JSON.stringify(saved)}`);
      const relations = await engine.relations();
      const applied = { record: saved.record, relations, source: request.source };
      if (!settleLayerOrderDialog(opening.id, { kind: 'applied', applied })) throw new Error('the dialog had already answered');
      return { candidate: chosen.candidate, relations: relations.length / 2 };
    } finally {
      runtime.dispose();
    }
  });
}

/**
 * The #523 review's race, swept: for each delay, an Apply through Pose, then
 * Turn Over and, `delay` ms later, Undo as ⌘Z runs it (the menu action: the
 * canvas sessions hear it, then the history moves). Per round: the toasts
 * that say a capture failed, and whether a record was left once every Apply
 * was undone again.
 */
const RACE_DELAYS_MS = (process.env.POSE_RACE_DELAYS ?? '0,2,4,6,8,10,12,14,16,18,20,25,30,40,60')
  .split(',')
  .map(Number);

async function undoRaceSweep(page, delays) {
  await page.evaluate(() => {
    if (window.__toastsSeen) return;
    window.__toastsSeen = [];
    new MutationObserver(() => {
      for (const node of document.querySelectorAll('[data-sonner-toast]')) {
        if (node.__seen) continue;
        node.__seen = true;
        window.__toastsSeen.push(node.textContent ?? '');
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const undo = () =>
    page.evaluate(async () => {
      const { handleMenuAction } = await import('/src/commands/menuActions.ts');
      await handleMenuAction('edit.undo');
    });
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  const rounds = [];
  for (const delay of delays) {
    await poseToolbar(page).getByRole('button', { name: EDIT_ORDER }).click();
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await applyThroughOpenDialog(page);
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    await captured(page);
    const seen = await page.evaluate(() => window.__toastsSeen.length);
    await page.evaluate(async (wait) => {
      const { openLinkedPoseOf } = await import('/src/diagram/capture/openLinkedPose.ts');
      const { handleMenuAction } = await import('/src/commands/menuActions.ts');
      openLinkedPoseOf(window.__layerOrderStep)
        .actions.find((action) => action.id === 'turn-over')
        .run();
      await new Promise((resolve) => setTimeout(resolve, wait));
      await handleMenuAction('edit.undo');
    }, delay);
    await page.waitForTimeout(300);
    await captured(page);
    const errors = (await page.evaluate((from) => window.__toastsSeen.slice(from), seen)).filter((text) =>
      /couldn.t be captured|invalid folded figure handle|stopped unexpectedly/i.test(text)
    );
    // The turn may have landed before the undo, which then took it back instead: undo to no record.
    for (let more = 0; more < 4 && (await poseNow(page)).layerOrder; more += 1) {
      await undo();
      await captured(page);
    }
    rounds.push({ delay, errors, record: (await poseNow(page)).layerOrder !== null });
  }
  return rounds;
}

/** The step selected, its source's render and record, and how many undo steps there are. */
async function poseNow(page) {
  return page.evaluate(async () => {
    const { stepById } = await import('/src/diagram/document/diagramDocument.ts');
    const state = window.__treemakerWorkspaceStore.getState();
    const source = stepById(state.diagram, window.__layerOrderStep).source;
    return {
      selected: state.diagramSelectedStepId,
      detail: state.diagramDetail,
      render: source.render,
      layerOrder: source.layerOrder ?? null,
      entries: state.diagramHistory.past.length,
    };
  });
}

/**
 * The Pose toolbar (H8) on kabuto's step, in one theme: ‹ › with no readout
 * and Edit order… after them; each held at its end; Edit order… opening the
 * dialog on the fold Pose holds — at the step's own layer order, past the
 * first — with Pose's keys standing down while it is open, and Cancel
 * writing nothing; then the same step constrained: ‹ › held (D9), and Edit
 * order… opening on its record.
 */
function poseToolbarCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openKabutoInEdit(page, url, theme);
    await linkKabutoStep(page);
    await captured(page);
    // A second step, so a step key has somewhere to go.
    await page.evaluate(() => {
      const store = window.__treemakerWorkspaceStore;
      store.getState().addDiagramStep();
      store.getState().selectDiagramStep(window.__layerOrderStep);
      store.getState().openDiagramStep(window.__layerOrderStep);
    });
    await reopenDetail(page);
    const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });

    // Unconstrained, at the first order: ‹ held, › free, no readout between them, Edit order… after.
    const first = await poseToolbarState(page);
    console.log(`[${tag}] toolbar at the first order: ${JSON.stringify(first)}`);
    const at = first.names.indexOf('Previous Layer Order');
    if (
      JSON.stringify(first.names.slice(at, at + 5)) !==
      JSON.stringify(['Previous Layer Order', 'Next Layer Order', EDIT_ORDER, 'Spread Layers', 'Reset Pose'])
    ) {
      throw new Error('the toolbar is not ‹ › Edit order… Spread Reset');
    }
    // Named by its word (label in name), titled in full.
    if (first.editTitle !== 'Edit layer order…') throw new Error(`Edit order…'s tooltip: ${first.editTitle}`);
    if (/\d\s*of\s*\d|Layer order \d/.test(first.text)) throw new Error(`the toolbar reads out a place: ${first.text}`);
    if (!first.previous || first.next || first.edit) throw new Error('at the first order: ‹ held, › and Edit order… free');
    await record(`pose-${tag}-toolbar-first`, { toolbar: await toolbarShot(page, 'Previous Layer Order') });

    // On to the last: › until it holds, which it does once the count is done.
    let steps = 0;
    for (; steps < 24 && !(await poseToolbarState(page)).next; steps += 1) await toolbarVerb(page, 'Next Layer Order');
    const last = await poseToolbarState(page);
    const lastCase = (await poseNow(page)).render.foldCase;
    console.log(`[${tag}] after ${steps} presses of ›: order ${lastCase}, ${JSON.stringify({ previous: last.previous, next: last.next })}`);
    if (!last.next || last.previous) throw new Error('at the last order: › held, ‹ free');
    await record(`pose-${tag}-toolbar-last`, { toolbar: await toolbarShot(page, 'Next Layer Order') });

    // Edit order… on the fold Pose holds, at the step's own order.
    const before = await poseNow(page);
    await poseToolbar(page).getByRole('button', { name: EDIT_ORDER }).click();
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    const asked = await dialogRequestAgainstKernel(page);
    console.log(`[${tag}] Edit order… asked: ${JSON.stringify(asked)}`);
    if (
      asked.shown !== 'the step’s case' ||
      asked.record !== null ||
      !asked.digest ||
      asked.turnDeg !== asked.rotationDeg ||
      asked.surface !== 'pose'
    ) {
      throw new Error('Edit order… did not open on the step’s held fold');
    }
    if (asked.foldCase > 1 && !asked.firstDiffers) console.log(`[${tag}] (order ${asked.foldCase} draws as the first does)`);

    // Pose's keys stand down while it is open: the step keys move nothing.
    for (const key of [']', '[', 'ArrowRight', 'End', 'Home']) await page.keyboard.press(key);
    const during = await poseNow(page);
    if (during.selected !== before.selected || during.detail !== before.detail || during.render.foldCase !== before.render.foldCase) {
      throw new Error(`a key reached Pose behind the dialog: ${JSON.stringify(during)}`);
    }
    await page.waitForTimeout(2500);
    await record(`pose-${tag}-dialog`, { dialog: await steadyShot(page, dialog, { masked: false, timeoutMs: 60000 }) });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const cancelled = await poseNow(page);
    if (cancelled.entries !== before.entries || cancelled.layerOrder !== before.layerOrder) throw new Error('Cancel wrote something');
    console.log(`[${tag}] keys behind the dialog moved nothing; Cancel wrote nothing (${cancelled.entries} undo steps, record ${cancelled.layerOrder})`);
    // And once it is closed they answer again.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(']');
    await page.waitForFunction((was) => window.__treemakerWorkspaceStore.getState().diagramSelectedStepId !== was, before.selected, {
      timeout: 5000,
    });
    console.log(`[${tag}] after the dialog closed, ] went on to the next step`);
    await page.evaluate(() => {
      const store = window.__treemakerWorkspaceStore;
      store.getState().selectDiagramStep(window.__layerOrderStep);
      store.getState().openDiagramStep(window.__layerOrderStep);
    });
    await reopenDetail(page);

    // Apply through Pose → undo → Turn Over draws the order before Apply. The dialog's Apply waits for
    // U10, so its answer is given through its store, as that Apply will give it: an order worked out on
    // the host engine from the request Pose opened it with (`applyThroughOpenDialog`).
    const preApplyShot = await stageShot(page);
    await record(`pose-${tag}-before-apply`, { stage: preApplyShot });
    await toolbarVerb(page, 'Turn Over');
    const beforeTurned = await stageShot(page);
    await record(`pose-${tag}-before-apply-turned`, { stage: beforeTurned });
    await toolbarVerb(page, 'Turn Over');
    const ready = await poseNow(page);
    await poseToolbar(page).getByRole('button', { name: EDIT_ORDER }).click();
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    const answered = await applyThroughOpenDialog(page);
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction((was) => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length > was, ready.entries, {
      timeout: 120000,
    });
    await captured(page);
    const afterApply = await poseNow(page);
    const label = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.at(-1)?.label);
    const appliedShot = await stageShot(page);
    const appliedDiffers = await pixelDiff(page, preApplyShot, appliedShot);
    console.log(
      `[${tag}] Apply through Pose: ${JSON.stringify(answered)}, one undo step "${label}" (${afterApply.entries - ready.entries}), ` +
        `record ${afterApply.layerOrder ? 'written' : 'none'}, ${appliedDiffers.differing} of ${appliedDiffers.pixels} pixels changed`
    );
    // One undo step, named as the Step pane's Apply names it.
    if (afterApply.entries - ready.entries !== 1 || label !== 'Change layer order' || !afterApply.layerOrder || appliedDiffers.differing === 0) {
      throw new Error('Apply through Pose did not write its order as one undo step');
    }
    await record(`pose-${tag}-applied`, { stage: appliedShot });
    await page.evaluate(async () => {
      const { handleMenuAction } = await import('/src/commands/menuActions.ts');
      await handleMenuAction('edit.undo');
    });
    await captured(page);
    const undone = await poseNow(page);
    if (undone.layerOrder !== ready.layerOrder) throw new Error('undo left the applied record');
    await toolbarVerb(page, 'Turn Over');
    const undoneTurned = await stageShot(page);
    const preApply = await pixelDiff(page, beforeTurned, undoneTurned);
    console.log(`[${tag}] Apply → undo → Turn Over vs the order before Apply turned over: ${preApply.differing} pixels differ`);
    if (preApply.differing !== 0) throw new Error('Turn Over after the undo did not draw the order before Apply');
    await record(`pose-${tag}-undone-turned`, { stage: undoneTurned });
    await toolbarVerb(page, 'Turn Over');

    // The #523 review's race: Apply, Turn Over, then ⌘Z some milliseconds later, while the turn may still
    // be reading the fold the undo takes the order of. Nothing may say the picture couldn't be captured.
    const raced = await undoRaceSweep(page, RACE_DELAYS_MS);
    console.log(`[${tag}] Apply, Turn Over, undo after ${raced.map((round) => `${round.delay}ms`).join(', ')}: ${JSON.stringify(raced.flatMap((round) => round.errors))}`);
    if (raced.some((round) => round.errors.length > 0 || round.record)) throw new Error('an undo under a turn failed it');

    // Constrained: D9's hold on ‹ ›, and Edit order… opening on the record.
    const applied = await applyConstraintToStep(page);
    await captured(page);
    if (applied.outcome !== 'captured') throw new Error(`Apply: ${applied.outcome}`);
    const constrained = await poseToolbarState(page);
    console.log(`[${tag}] constrained toolbar: ${JSON.stringify({ previous: constrained.previous, next: constrained.next, edit: constrained.edit })}`);
    if (!constrained.previous || !constrained.next || constrained.edit) throw new Error('constrained: ‹ › held, Edit order… free');
    await record(`pose-${tag}-toolbar-constrained`, { toolbar: await toolbarShot(page, 'Next Layer Order') });
    const constrainedBefore = await poseNow(page);
    await poseToolbar(page).getByRole('button', { name: EDIT_ORDER }).click();
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    const askedConstrained = await dialogRequestAgainstKernel(page);
    console.log(`[${tag}] Edit order… on the constrained step asked: ${JSON.stringify(askedConstrained)}`);
    if (askedConstrained.record !== 1 || askedConstrained.shown !== null || !askedConstrained.digest || askedConstrained.surface !== 'pose') {
      throw new Error('Edit order… did not open on the step’s record');
    }
    await page.waitForTimeout(2500);
    await record(`pose-${tag}-dialog-constrained`, { dialog: await steadyShot(page, dialog, { masked: false, timeoutMs: 60000 }) });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const after = await poseNow(page);
    if (after.entries !== constrainedBefore.entries || after.layerOrder !== constrainedBefore.layerOrder) {
      throw new Error('Cancel on the constrained step wrote something');
    }
    console.log(`[${tag}] constrained: Cancel wrote nothing`);
    await record(`pose-${tag}-constrained`, { page: await pageShot(page) });
  };
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
 * How many of a crease pattern's crease pixels `marked` changes (D20: no tint,
 * ring or letter ever veils a crease). A crease pixel is one far from the
 * pane's ground in `plain` (no marks) that `tinted` (every face with choices
 * faintly tinted, under the creases) leaves exactly as it was: a pixel the
 * crease covers whole, not one its edge shares with the paper beside it.
 * Answers how many there are, how many changed, and where a few of those are.
 */
async function creasePixelsChanged(page, plain, tinted, marked) {
  return page.evaluate(
    async ({ plain, tinted, marked }) => {
      const load = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return { width: image.width, rgba: context.getImageData(0, 0, image.width, image.height).data };
      };
      const [a, b, c] = await Promise.all([load(plain), load(tinted), load(marked)]);
      const counts = new Map();
      for (let k = 0; k < a.rgba.length; k += 4) {
        const key = (a.rgba[k] << 16) | (a.rgba[k + 1] << 8) | a.rgba[k + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const ground = [...counts].sort((x, y) => y[1] - x[1])[0][0];
      const g = [(ground >> 16) & 255, (ground >> 8) & 255, ground & 255];
      const delta = (x, y, k) => Math.max(...[0, 1, 2].map((ch) => Math.abs(x.rgba[k + ch] - y.rgba[k + ch])));
      let creases = 0;
      let changed = 0;
      const at = [];
      for (let k = 0; k < a.rgba.length; k += 4) {
        const far = Math.max(...[0, 1, 2].map((ch) => Math.abs(a.rgba[k + ch] - g[ch]))) > 60;
        if (!far || delta(a, b, k) > 2) continue;
        creases += 1;
        if (delta(b, c, k) > 2) {
          changed += 1;
          if (at.length < 6) at.push([(k / 4) % a.width, Math.floor(k / 4 / a.width)]);
        }
      }
      return { creases, changed, at };
    },
    { plain: plain.toString('base64'), tinted: tinted.toString('base64'), marked: marked.toString('base64') }
  );
}

/**
 * D20 on kabuto's crease pattern, at line width 1 and 3: a face pointed at, a
 * row hovered, and a subject with two objects picked (their tints, rings and
 * letters) change no crease pixel. Fails on any.
 */
function creaseCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openFigureInEdit(page, url, { theme, file: 'flat-folder/kabuto.fold' });
    const failures = [];
    for (const lineWidth of [1, 3]) {
      const dialog = await openPanesDialog(page, 'Kabuto', { lineStyle: 'color', lineWidth });
      const pane = dialog.locator('[data-layer-order-pane="pattern"]');
      const shot = async () => {
        await page.mouse.move(1, 1);
        return steadyShot(page, pane, { masked: false });
      };
      const show = (kind) =>
        page.evaluate(async (kind) => {
          const { NO_FACE_MARKS } = await import('/src/layer-order/panes/layerPaneMarks.ts');
          const handle = window.__layerOrderPanes;
          const { opened, letters } = handle.open;
          const withChoices = [...new Set(opened.open_pairs)].sort((a, b) => letters.compare(a, b));
          const choosing = { ...NO_FACE_MARKS, picking: 'subject', pickable: withChoices };
          const marks = {
            plain: NO_FACE_MARKS,
            tinted: choosing,
            pointed: { ...choosing, pointed: withChoices[0] },
            row: { ...choosing, row: withChoices.slice(0, 3) },
            compound: {
              ...NO_FACE_MARKS,
              picking: 'object',
              pickable: withChoices.slice(1),
              subject: withChoices[0],
              objects: withChoices.slice(1, 3),
            },
          }[kind];
          handle.show({ marks });
        }, kind);
      await show('plain');
      const plain = await shot();
      await show('tinted');
      const tinted = await shot();
      const results = {};
      for (const kind of ['pointed', 'row', 'compound']) {
        await show(kind);
        const marked = await shot();
        results[kind] = await creasePixelsChanged(page, plain, tinted, marked);
        await record(`creases-${tag}-kabuto-width-${lineWidth}-${kind}`, { pattern: marked });
      }
      console.log(`[${tag}] kabuto creases at line width ${lineWidth}: ${JSON.stringify(results)}`);
      for (const [kind, { changed, at }] of Object.entries(results)) {
        if (changed > 0) failures.push(`${kind} at line width ${lineWidth} changed ${changed} crease pixels, at ${JSON.stringify(at)}`);
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForFunction(() => window.__layerOrderOutcome !== null, null, { timeout: 30000 });
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };
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
// Edit's figure: display and Apply (H3)

/** Open `file` (repo-relative) in Edit as File ▸ Open does, in `theme` (a preset's name, or null). */
async function openFileInEdit(page, url, file, theme) {
  await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, {
    timeout: 120000,
  });
  const text = await readFile(path.join(repoRoot, file), 'utf8');
  await openTextInEdit(page, text, path.basename(file), theme);
}

/** Open `text` as a file named `name` in the Edit already loaded, in `theme`. */
async function openTextInEdit(page, text, name, theme) {
  await page.evaluate(
    async ({ text, name, theme }) => {
      const store = window.__treemakerWorkspaceStore;
      const files = { openTextFile: async () => ({ text, name, path: null }) };
      if (!(await store.getState().openProject(files, { confirmDiscard: false }))) throw new Error(`${name} did not open`);
      if (theme) {
        const { useThemeStore } = await import('/src/store/themeStore.ts');
        useThemeStore.getState().setThemeByName(theme);
      }
    },
    { text, name, theme }
  );
}

/** Every crease folded as one figure, as Fold (G) folds them, one undo entry; the figure selected. Its id. */
async function foldWholeAndSelect(page) {
  return page.evaluate(async () => {
    const store = window.__treemakerWorkspaceStore;
    const count = store.getState().oristudioCpDocument.summary.line_segments;
    const lineIds = Array.from({ length: count }, (_, i) => i + 1);
    const { foldedFigureGesture } = await import('/src/cp-workspace/folded/foldedFigureGesture.ts');
    await foldedFigureGesture.run('verb', 'Fold model', () =>
      store.getState().foldOristudioCpDocument({ startingFaceId: 1, lineIds })
    );
    const figure = store.getState().oristudioCpFoldedFigures.at(-1);
    if (!figure || figure.status !== 'ready') throw new Error('the fold made no figure');
    store.getState().setOristudioCpActiveFoldedFigure(figure.id);
    return figure.id;
  });
}

const FIGURE_TOOLBAR = { role: 'toolbar', name: 'Folded figure actions' };

/** Zoom the crease pattern out until the folded figure beside it is in view. */
async function zoomOutToFigure(page, times = 2) {
  for (let i = 0; i < times; i += 1) await page.getByRole('button', { name: 'Zoom Out', exact: true }).first().click();
  await page.mouse.move(1, 1);
}

/**
 * The selected figure as the canvas shows it, with its floating toolbar and
 * its Properties sheet; and, when `hover`, the toolbar again with the pointer
 * on Layer order…, so its tooltip (why it is held) is in the picture.
 */
async function figureShots(page, { hover = false, hoverName = 'Layer order…' } = {}) {
  const toolbar = page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name });
  const sheet = page.locator('[data-property-sheet]');
  await toolbar.waitFor({ state: 'visible', timeout: 30000 });
  await sheet.waitFor({ state: 'visible', timeout: 30000 });
  await page.mouse.move(1, 1);
  const shots = {
    canvas: await steadyShot(page, page.locator('canvas.cp-webgl-layer').locator('..'), { masked: false }),
    toolbar: await steadyShot(page, toolbar, { masked: false }),
    properties: await steadyShot(page, sheet, { masked: false }),
  };
  if (hover) {
    // The pointer over it, whatever takes the event: a disabled icon button's tooltip trigger wraps it.
    const target = await toolbar.getByRole('button', { name: hoverName }).boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.getByRole('tooltip').first().waitFor({ state: 'visible', timeout: 10000 });
    const box = await toolbar.boundingBox();
    await settle(page);
    shots.tooltip = await page.screenshot({
      clip: { x: Math.max(0, box.x - 120), y: Math.max(0, box.y - 70), width: box.width + 240, height: box.height + 140 },
      animations: 'disabled',
    });
    await page.mouse.move(1, 1);
  }
  return shots;
}

/** The selected figure, as the store holds it. */
function figureState(page, index = 0) {
  return page.evaluate((index) => {
    const figure = window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[index];
    if (!figure) return null;
    return {
      id: figure.id,
      handle: figure.handle,
      status: figure.status,
      shownOrder: figure.snapshot?.shown_order ?? 'searched',
      picture: JSON.stringify(figure.renderSnapshot),
      layerOrder: figure.layerOrder ? { kind: figure.layerOrder.kind, json: figure.layerOrder.json ?? null } : null,
    };
  }, index);
}

/**
 * An order the dialog's engine would hand over at Apply, chosen with no
 * dialog (U10 isn't built): the figure's fold opened on the Fold wasm, one
 * open pair constrained whichever way moves the order off Oriedita's first,
 * saved. In the page, through the engine's own worker.
 */
async function chosenOrder(page, figureId) {
  return page.evaluate(async (figureId) => {
    const store = window.__treemakerWorkspaceStore;
    const figure = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === figureId);
    const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
    const { layerOrderSourceOf } = await import('/src/lib/layerOrder/layerOrderSource.ts');
    const { createLayerOrderRuntime } = await import('/src/layer-order/engine/layerOrderRuntime.ts');
    const { LAYER_ORDER_LIMITS, constraintSeen } = await import('/src/layer-order/engine/layerOrderEngine.ts');
    const source = layerOrderSourceOf(await runtime.getOristudioCpFoldedFigureSource(figure.handle), figure.snapshot.model);
    const engine = createLayerOrderRuntime({ role: 'dialog' });
    try {
      const opened = await engine.engine.open(source, LAYER_ORDER_LIMITS.open);
      if (opened.status !== 'ok') throw new Error(`refused: ${JSON.stringify(opened.refusal)}`);
      const first = Array.from(await engine.engine.relations()).join();
      for (let i = 0; i < opened.open_pairs.length; i += 2) {
        const [lo, hi] = [opened.open_pairs[i], opened.open_pairs[i + 1]];
        for (const verb of ['in_front_of', 'behind']) {
          const constraint = constraintSeen(lo, verb, hi, 'front', opened.front_up[hi] === 1);
          const committed = await engine.engine.commit([constraint], LAYER_ORDER_LIMITS.commit);
          if (committed.verdict !== 'committed') continue;
          const relations = await engine.engine.relations();
          if (Array.from(relations).join() === first) continue;
          const saved = await engine.engine.save();
          if (saved.status !== 'ok') throw new Error(`save refused: ${JSON.stringify(saved.refusal)}`);
          window.__layerOrderApplied = { record: saved.record, relations, source };
          return { constraints: saved.record.constraints.length, relations: relations.length };
        }
      }
      throw new Error('no constraint moves the order');
    } finally {
      engine.dispose();
    }
  }, figureId);
}

/** Commit what `chosenOrder` left, as the dialog's Apply is committed: one undo entry. */
async function applyChosenOrder(page, figureId) {
  return page.evaluate(async (figureId) => {
    const { applyFoldedFigureLayerOrder } = await import('/src/cp-workspace/folded/openFoldedFigureLayerOrder.ts');
    const { markFoldPress } = await import('/src/cp-workspace/folded/foldPress.ts');
    const i18n = (await import('/src/i18n/index.ts')).default;
    const press = markFoldPress(window.__treemakerWorkspaceStore.getState());
    return applyFoldedFigureLayerOrder(figureId, window.__layerOrderApplied, press, i18n.t);
  }, figureId);
}

/** The project as Save writes it. */
async function savedProject(page) {
  return page.evaluate(async () => {
    let contents = null;
    const files = {
      surface: 'web',
      supportsNativeDialogs: false,
      saveTextFile: async (options) => {
        contents = options.contents;
        return { name: options.suggestedName, path: null };
      },
    };
    if (!(await window.__treemakerWorkspaceStore.getState().saveProjectAs(files))) throw new Error('save failed');
    return contents;
  });
}

/** Re-render figure `id` through its kernel, as a restyle does, and back: what its live fold draws. */
async function restyled(page, id) {
  return page.evaluate(async (id) => {
    const store = window.__treemakerWorkspaceStore;
    await store.getState().setOristudioCpFoldedFigureDisplayStyle(id, 'Transparent3');
    await store.getState().setOristudioCpFoldedFigureDisplayStyle(id, 'Paper5');
    return JSON.stringify(store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id).renderSnapshot);
  }, id);
}

/** Watch what the page loads of the Layer order dialog and its engine: its chunk, its worker, the Fold wasm. */
function watchLayerOrderLoads(page) {
  const seen = [];
  const spawned = [];
  const onRequest = (request) => seen.push(request.url());
  const onWorker = (worker) => {
    seen.push(worker.url());
    spawned.push(worker.url());
  };
  page.context().on('request', onRequest);
  page.on('worker', onWorker);
  return {
    loaded: () => seen.filter((url) => /layerOrderWorker|oristudio_fold_wasm|components\/layer-order\/LayerOrderDialog\.tsx/.test(url)),
    /** Workers started on the Layer order worker's script. */
    workers: () => spawned.filter((url) => /layerOrderWorker/.test(url)),
    stop: () => {
      page.context().off('request', onRequest);
      page.off('worker', onWorker);
    },
  };
}

/**
 * Edit's display and Apply on kabuto, in one theme: the figure and its entry
 * before and after an Apply (the order chosen through the engine, committed
 * as the dialog's Apply is); undo, a restyle, redo; Duplicate; the file saved
 * and opened again, with no worker until Layer order… is pressed; the press,
 * which folds the reopened figure with its record and opens the dialog;
 * Duplicate after it; and the file once more. The real dialog's Apply waits
 * for U10.
 */
function editFigureCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record, { dir }) => {
    await openFileInEdit(page, url, 'tests/fixtures/flat-folder/kabuto.fold', theme);
    const id = await foldWholeAndSelect(page);
    await zoomOutToFigure(page);
    const before = await figureState(page);
    const plain = await figureShots(page);
    await record(`edit-${tag}-enabled`, plain);

    const chosen = await chosenOrder(page, id);
    if (!(await applyChosenOrder(page, id))) throw new Error('Apply wrote nothing');
    const after = await figureState(page);
    if (after.handle === before.handle || after.shownOrder !== 'given' || after.layerOrder?.kind !== 'record') {
      throw new Error(`Apply did not land: ${JSON.stringify(after)}`);
    }
    if (after.picture === before.picture) throw new Error('the constrained order draws the same picture');
    const constrained = await figureShots(page);
    const moved = await pixelDiff(page, plain.canvas, constrained.canvas);
    if (!moved.differing) throw new Error('the canvas shows no change after Apply');
    console.log(`[${tag}] Apply of ${chosen.constraints} constraint: new fold, order given; ${moved.differing} canvas pixels changed`);
    await record(`edit-${tag}-constrained`, constrained);

    // Its creases moved: Refold and Layer order… are both held, until H4 refolds with the constraints.
    const fingerprint = await page.evaluate((id) => {
      const store = window.__treemakerWorkspaceStore;
      const figure = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
      store.setState({
        oristudioCpFoldedFigures: store.getState().oristudioCpFoldedFigures.map((entry) =>
          entry.id === id ? { ...entry, sourceFingerprint: 'cs1:moved' } : entry
        ),
      });
      return figure.sourceFingerprint;
    }, id);
    const toolbar = page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name });
    await toolbar.getByRole('button', { name: 'Refold' }).waitFor({ state: 'visible' });
    if ((await toolbar.getByRole('button', { name: 'Refold' }).isDisabled()) !== true) throw new Error('Refold is not held');
    await record(`edit-${tag}-stale-constrained`, await figureShots(page, { hover: true, hoverName: 'Refold' }));
    await page.evaluate(
      ({ id, fingerprint }) => {
        const store = window.__treemakerWorkspaceStore;
        store.setState({
          oristudioCpFoldedFigures: store.getState().oristudioCpFoldedFigures.map((entry) =>
            entry.id === id ? { ...entry, sourceFingerprint: fingerprint } : entry
          ),
        });
      },
      { id, fingerprint }
    );
    console.log(`[${tag}] stale and constrained: Refold and Layer order… both held`);

    // Undo shows the order before, and a restyle redraws it from the old fold, not the new.
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
    if ((await figureState(page)).handle !== before.handle) throw new Error('undo did not put the old fold back');
    if ((await restyled(page, id)) !== before.picture) throw new Error('a restyle after undo drew another order');
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().redo());
    if ((await figureState(page)).handle !== after.handle) throw new Error('redo did not put the new fold back');
    if ((await restyled(page, id)) !== after.picture) throw new Error('a restyle after redo drew another order');
    console.log(`[${tag}] undo, restyle, redo, restyle: each fold draws its own order`);

    // Duplicate keeps the order.
    await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Duplicate' }).click();
    await page.waitForFunction(() => window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[1]?.status === 'ready');
    const copy = await figureState(page, 1);
    if (copy.layerOrder?.json !== after.layerOrder.json || copy.picture !== after.picture) {
      throw new Error(`the copy lost the order: ${JSON.stringify(copy)}`);
    }
    console.log(`[${tag}] Duplicate carries the record and draws the same order`);

    // Saved and opened again: drawn from the file, with no worker, the Fold wasm or the dialog's code.
    const osf = await savedProject(page);
    if (!tag.includes('horizon')) await writeFile(path.join(dir, 'kabuto-constrained.osf'), osf);
    const watch = watchLayerOrderLoads(page);
    await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, { timeout: 120000 });
    await openTextInEdit(page, osf, 'kabuto-constrained.osf', theme);
    await page.evaluate(() => {
      const store = window.__treemakerWorkspaceStore;
      store.getState().setOristudioCpActiveFoldedFigure(store.getState().oristudioCpFoldedFigures[0].id);
    });
    await zoomOutToFigure(page);
    const reopenedShots = await figureShots(page);
    await page.waitForTimeout(1500);
    if (watch.loaded().length > 0) throw new Error(`opening and selecting loaded ${watch.loaded().join(', ')}`);
    const reopened = await figureState(page);
    if (reopened.handle !== null || reopened.layerOrder?.json !== after.layerOrder.json || reopened.picture !== after.picture) {
      throw new Error(`the file did not keep the order: ${JSON.stringify(reopened)}`);
    }
    if ((await figureState(page, 1))?.layerOrder?.json !== after.layerOrder.json) throw new Error('the copy lost its record in the file');
    console.log(`[${tag}] reopened: both figures carry the record and draw the constrained order; no worker, no Fold wasm, no dialog code loaded`);
    await record(`edit-${tag}-reopened`, reopenedShots);

    // The canvas turned a step: the dialog's paper turns as the canvas shows the figure.
    await page.getByRole('button', { name: 'Rotate view right' }).first().click();
    await page.waitForFunction(() => (window.__treemakerWorkspaceStore.getState().oristudioCpCamera?.rotation ?? 0) !== 0, null, {
      timeout: 10000,
    });

    // The press: the host engine folds the figure with its record, and the dialog opens on it.
    await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Layer order…' }).click();
    const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await dialog.getByRole('complementary', { name: 'Layer order details' }).waitFor({ state: 'visible', timeout: 60000 });
    const workers = watch.workers();
    watch.stop();
    if (workers.length < 2) throw new Error(`the press spawned ${workers.length} Layer order workers, not the host engine's and the dialog's`);
    const asked = await page.evaluate(async () => {
      const { useLayerOrderDialogStore } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
      const { request } = useLayerOrderDialogStore.getState().opening;
      const state = window.__treemakerWorkspaceStore.getState();
      const figure = state.oristudioCpFoldedFigures[0];
      const turned = ((((figure.placement.rotation + state.oristudioCpCamera.rotation) * 180) / Math.PI) % 360 + 540) % 360 - 180;
      const { look } = request;
      return {
        surface: request.surface,
        turnDeg: look.turnDeg,
        turned,
        shown: request.shown != null,
        record: request.record != null,
        side: look.side,
        pen: [look.lineStyle, look.lineWidth],
        editPen: [state.oristudioCpViewport.lineStyle ?? 'color', state.oristudioCpViewport.lineWidth ?? 1],
      };
    });
    if (
      asked.surface !== 'edit_figure' ||
      !asked.shown ||
      !asked.record ||
      Math.abs(asked.turnDeg - asked.turned) > 0.01 ||
      asked.turnDeg === 0 ||
      asked.side !== 'front' ||
      asked.pen.join() !== asked.editPen.join()
    ) {
      throw new Error(`the request is not what the canvas shows: ${JSON.stringify(asked)}`);
    }
    console.log(
      `[${tag}] on a canvas turned ${asked.turnDeg}°, the request turns the paper ${asked.turnDeg}°, on the ${asked.side}, creases ${asked.pen.join(' ')} as Edit draws them, surface ${asked.surface}`
    );
    await record(`edit-${tag}-dialog`, await dialogShot(page));
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached' });
    const live = await figureState(page);
    if (live.handle === null || live.layerOrder?.json !== after.layerOrder.json || live.picture !== after.picture) {
      throw new Error(`the press did not fold it again with its record: ${JSON.stringify(live)}`);
    }
    console.log(`[${tag}] the press spawned ${workers.length} Layer order workers (host engine, dialog); the figure is live on its record`);

    // Live now, so it duplicates, with its record; and the file keeps all three.
    await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Duplicate' }).click();
    await page.waitForFunction(() => window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[2]?.status === 'ready');
    if ((await figureState(page, 2)).layerOrder?.json !== after.layerOrder.json) throw new Error('the reopened copy lost the order');
    const again = await savedProject(page);
    await page.goto(new URL('/edit', url).href, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__treemakerWorkspaceStore?.getState().engineReady === true, null, { timeout: 120000 });
    await openTextInEdit(page, again, 'kabuto-constrained.osf', theme);
    for (const index of [0, 1, 2]) {
      const figure = await figureState(page, index);
      if (figure.layerOrder?.json !== after.layerOrder.json || figure.picture !== after.picture) {
        throw new Error(`figure ${index} lost the order on reload`);
      }
    }
    console.log(`[${tag}] duplicate after reopen, then reload: all three keep the record`);
  };
}

/**
 * What #520's review found, on the real kernel (no pictures): after Another
 * solution and Undo, Layer order… opens on the order the figure shows, not
 * the one its handle was left on; a figure deleted and undone still draws
 * through its own fold; and a fold made after the delete never takes the
 * deleted figure's slot while its undo can put it back.
 */
async function editFigureReviewCases(page, url) {
  await openFileInEdit(page, url, 'tests/fixtures/flat-folder/kabuto.fold', null);
  const id = await foldWholeAndSelect(page);
  await zoomOutToFigure(page);

  // Another solution, then Undo, then Layer order… at once, as the reviewer's
  // script pressed it: the entry back on the first order, its handle still on
  // the second. The dialog opens on the entry's.
  const steps = await page.evaluate(async (id) => {
    const store = window.__treemakerWorkspaceStore;
    const runtime = await import('/src/store/workspaceStore/oristudioCpRuntime.ts');
    const { showAnotherFoldedSolution } = await import('/src/cp-workspace/folded/foldedFigureVerbs.ts');
    const i18n = (await import('/src/i18n/index.ts')).default;
    const figure = () => store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
    const first = JSON.stringify(await runtime.getOristudioCpFoldedFigurePaperScene(figure().handle));
    await showAnotherFoldedSolution(id, i18n.t);
    const second = JSON.stringify(await runtime.getOristudioCpFoldedFigurePaperScene(figure().handle));
    await store.getState().undo();
    const entryCase = figure().snapshot.current_fold_case;
    const opening = await store.getState().prepareOristudioCpFigureLayerOrder(id);
    const kernelCase = (await runtime.getOristudioCpFoldedFigureSnapshot(figure().handle)).current_fold_case;
    const shown = JSON.stringify(opening.shown);
    await opening.release();
    window.__layerOrderScenes = { first, second };
    return { differ: first !== second, entryCase, kernelCase, opensOn: shown === first ? 'first' : shown === second ? 'second' : 'other' };
  }, id);
  if (!steps.differ || steps.entryCase !== 1 || steps.kernelCase !== 2 || steps.opensOn !== 'first') {
    throw new Error(`after Another solution and Undo, Layer order… opened on another order: ${JSON.stringify(steps)}`);
  }
  // Pressed once the undo's model write has landed, it opens on whatever the figure shows then.
  await page.waitForTimeout(500);
  await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Layer order…' }).click();
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  await dialog.waitFor({ state: 'visible', timeout: 60000 });
  const pressed = await page.evaluate(async () => {
    const { useLayerOrderDialogStore } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
    const shown = JSON.stringify(useLayerOrderDialogStore.getState().opening.request.shown);
    const figure = window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[0];
    const { first, second } = window.__layerOrderScenes;
    return { entryCase: figure.snapshot.current_fold_case, opensOn: shown === first ? 'first' : shown === second ? 'second' : 'other' };
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'detached' });
  if (pressed.opensOn !== (pressed.entryCase === 1 ? 'first' : 'second')) {
    throw new Error(`the press opened on an order the figure does not show: ${JSON.stringify(pressed)}`);
  }
  console.log(
    `[review] after Another solution and Undo (entry on ${steps.entryCase}, handle on ${steps.kernelCase}), Layer order… opens on the entry's order; pressed later, on the one the figure shows (${pressed.entryCase})`
  );

  // Delete, then Undo: the figure draws through its own fold again. On a fresh
  // fold: the one above is the undo drift's own case (its handle on another order).
  const fresh = await foldWholeAndSelect(page);
  const original = await figureState(page, 1);
  if (original.id !== fresh) throw new Error('the fresh fold is not the second figure');
  await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Delete' }).click();
  await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
  const back = await page.evaluate(async (id) => {
    const store = window.__treemakerWorkspaceStore;
    await store.getState().setOristudioCpFoldedFigureDisplayStyle(id, 'Transparent3');
    await store.getState().setOristudioCpFoldedFigureDisplayStyle(id, 'Paper5');
    const figure = store.getState().oristudioCpFoldedFigures.find((entry) => entry.id === id);
    return { status: figure.status, error: store.getState().oristudioCpError, handle: figure.handle };
  }, fresh);
  if (back.status !== 'ready' || back.error || back.handle !== original.handle) {
    throw new Error(`Delete then Undo put back a figure that does not draw: ${JSON.stringify(back)}`);
  }

  // Delete, fold again, Undo twice: the first figure's slot was never the second's.
  await page.getByRole(FIGURE_TOOLBAR.role, { name: FIGURE_TOOLBAR.name }).getByRole('button', { name: 'Delete' }).click();
  await foldWholeAndSelect(page);
  const second = await figureState(page, 1);
  if (second.id === fresh || second.handle === original.handle) throw new Error('the next fold took the deleted figure’s slot');
  await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
  await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
  const redrawn = await restyled(page, fresh);
  const restored = await figureState(page, 1);
  if (restored.handle !== original.handle || redrawn !== original.picture) {
    throw new Error(`the undone figure draws another fold: ${JSON.stringify({ restored, second: second.handle })}`);
  }
  console.log('[review] Delete then Undo draws through its own fold; the next fold never took its slot');
}

/**
 * The entry and the Properties row in the states a figure can hold it in, in
 * one theme: held on a 3D figure (box_90), on a fold that found no layer
 * order (failing_global_flat_fold.ori), and on a newer build's record (on
 * kabuto); each with Layer order…'s tooltip.
 */
function editFigureStateCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openFileInEdit(page, url, 'tests/fixtures/fold-angle-3d/box_90.fold', theme);
    await foldWholeAndSelect(page);
    await record(`edit-${tag}-3d`, await figureShots(page, { hover: true }));

    await openFileInEdit(page, url, 'tests/fixtures/oriedita/failing_global_flat_fold.ori', theme);
    await foldWholeAndSelect(page);
    await record(`edit-${tag}-no-layer-order`, await figureShots(page, { hover: true }));

    await openFileInEdit(page, url, 'tests/fixtures/flat-folder/kabuto.fold', theme);
    const id = await foldWholeAndSelect(page);
    await zoomOutToFigure(page);
    await page.evaluate((id) => {
      const store = window.__treemakerWorkspaceStore;
      store.setState({
        oristudioCpFoldedFigures: store.getState().oristudioCpFoldedFigures.map((figure) =>
          figure.id === id
            ? { ...figure, layerOrder: { kind: 'newer', saved: { figureKey: 'fk9:later', record: '{"v":2}' } } }
            : figure
        ),
      });
    }, id);
    await record(`edit-${tag}-newer`, await figureShots(page, { hover: true }));
  };
}

// ---------------------------------------------------------------------------
// Edit's selection: Fold with layer order… (H5)

const SELECTION_TOOLBAR = { role: 'toolbar', name: 'Crease pattern actions' };
const FOLD_WITH_LAYER_ORDER = 'Fold with layer order…';

/** Every line of the open pattern selected, as Select All does: one whole sheet, so the selection toolbar shows. */
async function selectWholeSheet(page) {
  await page.evaluate(async () => {
    const { handleMenuAction } = await import('/src/commands/menuActions.ts');
    await handleMenuAction('edit.selectAll');
  });
  await page.getByRole(SELECTION_TOOLBAR.role, { name: SELECTION_TOOLBAR.name }).waitFor({ state: 'visible', timeout: 30000 });
}

/** The selection toolbar, and again with the pointer on Fold with layer order…, its tooltip in the picture. */
async function selectionToolbarShots(page) {
  const toolbar = page.getByRole(SELECTION_TOOLBAR.role, { name: SELECTION_TOOLBAR.name });
  await page.mouse.move(1, 1);
  const shots = { toolbar: await steadyShot(page, toolbar, { masked: false }) };
  const target = await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).boundingBox();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.getByRole('tooltip').first().waitFor({ state: 'visible', timeout: 10000 });
  const box = await toolbar.boundingBox();
  await settle(page);
  shots.tooltip = await page.screenshot({
    clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 70), width: box.width + 120, height: box.height + 110 },
    animations: 'disabled',
  });
  await page.mouse.move(1, 1);
  return shots;
}

/** What the canvas holds and remembers: its figures, its undo entries' labels, whether a fold runs. */
function editCanvasState(page) {
  return page.evaluate(() => {
    const state = window.__treemakerWorkspaceStore.getState();
    return {
      figures: state.oristudioCpFoldedFigures.map((figure) => ({
        id: figure.id,
        status: figure.status,
        handle: figure.handle,
        shownOrder: figure.snapshot?.shown_order ?? 'searched',
        layerOrder: figure.layerOrder?.kind ?? null,
        picture: JSON.stringify(figure.renderSnapshot),
      })),
      history: state.oristudioCpHistoryPast.map((entry) => entry.label),
      folding: Object.keys(state.oristudioCpFoldRuns).length,
      dirty: state.dirty,
    };
  });
}

/** The request the open dialog was asked with, as far as the host decides it. */
function openedRequest(page) {
  return page.evaluate(async () => {
    const { useLayerOrderDialogStore } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
    const request = useLayerOrderDialogStore.getState().opening?.request;
    if (!request) return null;
    return {
      surface: request.surface,
      name: request.name,
      record: request.record,
      digest: request.source.digest,
      segments: request.source.segments.length,
      shown: Boolean(request.shown),
      side: request.look.side,
      turnDeg: request.look.turnDeg,
      xray: request.look.xray,
    };
  });
}

/**
 * Apply, with the order the dialog's engine would choose on the open dialog's
 * own source (U10 isn't built): one open pair constrained whichever way moves
 * the order off Oriedita's first, saved, and handed back as Apply hands it.
 */
async function applyEngineChosenOrder(page) {
  return page.evaluate(async () => {
    const { useLayerOrderDialogStore, settleLayerOrderDialog } = await import('/src/layer-order/dialog/layerOrderDialogStore.ts');
    const { createLayerOrderRuntime } = await import('/src/layer-order/engine/layerOrderRuntime.ts');
    const { LAYER_ORDER_LIMITS, constraintSeen } = await import('/src/layer-order/engine/layerOrderEngine.ts');
    const opening = useLayerOrderDialogStore.getState().opening;
    const { source } = opening.request;
    const engine = createLayerOrderRuntime({ role: 'dialog' });
    try {
      const opened = await engine.engine.open(source, LAYER_ORDER_LIMITS.open);
      if (opened.status !== 'ok') throw new Error(`refused: ${JSON.stringify(opened.refusal)}`);
      const first = Array.from(await engine.engine.relations()).join();
      for (let i = 0; i < opened.open_pairs.length; i += 2) {
        const [lo, hi] = [opened.open_pairs[i], opened.open_pairs[i + 1]];
        for (const verb of ['in_front_of', 'behind']) {
          const committed = await engine.engine.commit([constraintSeen(lo, verb, hi, 'front', opened.front_up[hi] === 1)], LAYER_ORDER_LIMITS.commit);
          if (committed.verdict !== 'committed') continue;
          const relations = await engine.engine.relations();
          if (Array.from(relations).join() === first) continue;
          const saved = await engine.engine.save();
          if (saved.status !== 'ok') throw new Error(`save refused: ${JSON.stringify(saved.refusal)}`);
          settleLayerOrderDialog(opening.id, { kind: 'applied', applied: { record: saved.record, relations, source } });
          return saved.record.constraints.length;
        }
      }
      throw new Error('no constraint moves the order');
    } finally {
      engine.dispose();
    }
  });
}

const PATTERN_CHANGED = 'The crease pattern changed meanwhile, so Layer order changed nothing.';

/** The toast a press whose crease pattern changed or went says (`foldPress.ts`). */
function patternChangedToast(page) {
  return page.locator('[data-sonner-toast]').filter({ hasText: PATTERN_CHANGED });
}

/** Forget the last error, so the next one is known to be new. */
async function clearCpError(page) {
  await page.evaluate(() => window.__treemakerWorkspaceStore.setState({ oristudioCpError: null, error: null }));
}

/** The press said its crease pattern changed: in the store, and on a toast. */
async function saidPatternChanged(page) {
  await page.waitForFunction(
    (text) => window.__treemakerWorkspaceStore.getState().oristudioCpError === text,
    PATTERN_CHANGED,
    { timeout: 30000 }
  );
  await patternChangedToast(page).first().waitFor({ state: 'visible', timeout: 30000 });
}

/** One crease deleted, as Delete does on a selected crease. */
async function deleteOneCrease(page) {
  await page.evaluate(async () => {
    const store = window.__treemakerWorkspaceStore;
    store.getState().setOristudioCpSelection({ ...store.getState().oristudioCpSelection, lines: [5] });
    const { handleMenuAction } = await import('/src/commands/menuActions.ts');
    await handleMenuAction('edit.delete');
  });
}

/** The dialog, open and ready on what it was asked. */
async function readyDialog(page) {
  const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
  await dialog.waitFor({ state: 'visible', timeout: 60000 });
  await dialog.getByRole('complementary', { name: 'Layer order details' }).waitFor({ state: 'visible', timeout: 60000 });
  return dialog;
}

/**
 * Fold with layer order… on kabuto's whole sheet, in one theme: the selection
 * toolbar with the new button and its tooltip; the press, which folds the
 * sheet for the dialog and opens it on that fold; Cancel, which leaves no
 * figure and no entry; Apply on the order it opened on, one figure and one
 * entry, undone; the order the dialog's engine would choose, committed as its
 * Apply is (the real dialog's Apply waits for U10); Settings ▸ Shortcuts
 * listing it Unassigned after Fold estimate, a key bound there and pressed;
 * and the button held, with why, on creases that fold in 3D.
 */
function editSelectionCases(theme) {
  const tag = theme ? theme.toLowerCase().replace(/\s+/g, '-') : 'default';
  return async (page, url, record) => {
    await openFileInEdit(page, url, 'tests/fixtures/flat-folder/kabuto.fold', theme);
    await selectWholeSheet(page);
    await record(`selection-${tag}-toolbar`, await selectionToolbarShots(page));

    // The press: the sheet folded for the dialog alone, which opens on it.
    const toolbar = page.getByRole(SELECTION_TOOLBAR.role, { name: SELECTION_TOOLBAR.name });
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    let dialog = await readyDialog(page);
    const asked = await openedRequest(page);
    if (asked?.surface !== 'edit_pattern' || asked.record !== null || !asked.shown || asked.side !== 'front' || asked.xray) {
      throw new Error(`the request: ${JSON.stringify(asked)}`);
    }
    const whileOpen = await editCanvasState(page);
    if (whileOpen.figures.length !== 0 || whileOpen.history.length !== 0) {
      throw new Error(`the press put something on the canvas: ${JSON.stringify(whileOpen)}`);
    }
    console.log(`[${tag}] the press opened the dialog on the sheet's fold (${asked.segments} creases, turned ${asked.turnDeg}°, "${asked.name}"); nothing on the canvas`);
    await record(`selection-${tag}-dialog`, await dialogShot(page));

    // Cancel: no figure, no entry.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 30000 });
    const cancelled = await editCanvasState(page);
    if (cancelled.figures.length !== 0 || cancelled.history.length !== 0 || cancelled.folding !== 0 || cancelled.dirty) {
      throw new Error(`Cancel left something: ${JSON.stringify(cancelled)}`);
    }
    console.log(`[${tag}] Cancel: no figure, no undo entry, not dirty`);

    // Apply on the order it opened on: a figure as Fold makes it, one entry.
    await selectWholeSheet(page);
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    dialog = await readyDialog(page);
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await page.waitForFunction(
      () => window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[0]?.status === 'ready',
      null,
      { timeout: 60000 }
    );
    const unchanged = await editCanvasState(page);
    if (unchanged.figures.length !== 1 || unchanged.history.join() !== 'Fold model' || unchanged.figures[0].layerOrder !== null) {
      throw new Error(`Apply unchanged: ${JSON.stringify(unchanged)}`);
    }
    console.log(`[${tag}] Apply on the order it opened on: one figure, no record, one entry "${unchanged.history[0]}"`);
    await zoomOutToFigure(page);
    await record(`selection-${tag}-applied-unchanged`, {
      canvas: await steadyShot(page, page.locator('canvas.cp-webgl-layer').locator('..'), { masked: false }),
    });

    // The order the dialog's engine would choose on the open dialog's source, handed back as its Apply hands it.
    const plain = unchanged.figures[0];
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
    if ((await editCanvasState(page)).figures.length !== 0) throw new Error('undo left the figure');
    await selectWholeSheet(page);
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    await readyDialog(page);
    await applyEngineChosenOrder(page);
    await page.waitForFunction(
      () => window.__treemakerWorkspaceStore.getState().oristudioCpFoldedFigures[0]?.status === 'ready',
      null,
      { timeout: 60000 }
    );
    const applied = await editCanvasState(page);
    const [figure] = applied.figures;
    if (applied.figures.length !== 1 || figure.shownOrder !== 'given' || figure.layerOrder !== 'record' || applied.history.join() !== 'Fold model') {
      throw new Error(`the chosen order did not land: ${JSON.stringify(applied)}`);
    }
    if (figure.picture === plain.picture) throw new Error('the chosen order draws Oriedita’s picture');
    console.log(`[${tag}] the chosen order folded through fold_with_order: one figure, order given, record kept, one entry`);
    await record(`selection-${tag}-applied-chosen`, {
      canvas: await steadyShot(page, page.locator('canvas.cp-webgl-layer').locator('..'), { masked: false }),
    });
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
    if ((await editCanvasState(page)).figures.length !== 0) throw new Error('undo left the chosen figure');
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().redo());
    const redone = await editCanvasState(page);
    if (redone.figures[0]?.handle !== figure.handle || redone.figures[0]?.layerOrder !== 'record') {
      throw new Error(`redo: ${JSON.stringify(redone)}`);
    }
    console.log(`[${tag}] undo and redo: the figure goes and comes back on its fold, with its record`);

    // Settings ▸ Shortcuts: Unassigned, right after Fold estimate; then a key bound there.
    await page.evaluate(async () => {
      const { useSettingsStore } = await import('/src/store/settingsStore.ts');
      useSettingsStore.getState().openSettings('shortcuts');
    });
    const row = (label) => page.locator('.settings-shortcuts__row').filter({ has: page.getByText(label, { exact: true }) });
    const ours = row(FOLD_WITH_LAYER_ORDER);
    await ours.waitFor({ state: 'visible', timeout: 30000 });
    const estimate = row('Fold estimate');
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.settings-shortcuts__copy span')].map((span) => span.textContent)
    );
    if (order[order.indexOf('Fold estimate') + 1] !== FOLD_WITH_LAYER_ORDER) throw new Error('not right after Fold estimate');
    if ((await ours.getByRole('button', { name: 'Unassigned' }).count()) !== 1) throw new Error('not Unassigned');
    await estimate.scrollIntoViewIfNeeded();
    await page.mouse.move(1, 1);
    const rows = async () => {
      const top = await estimate.boundingBox();
      const bottom = await ours.boundingBox();
      return page.screenshot({
        clip: { x: top.x - 8, y: top.y - 8, width: top.width + 16, height: bottom.y + bottom.height - top.y + 16 },
        animations: 'disabled',
      });
    };
    await record(`selection-${tag}-shortcuts-unassigned`, { rows: await rows() });
    await ours.getByRole('button', { name: 'Unassigned' }).click();
    await page.keyboard.press('Alt+Shift+KeyK');
    const bound = await page.evaluate(async () => {
      const { useShortcutStore } = await import('/src/store/shortcutStore.ts');
      return useShortcutStore.getState().overrides['cp.action.fold-with-layer-order'] ?? null;
    });
    if (!bound?.length) throw new Error('capture bound nothing');
    await page.mouse.move(1, 1);
    await record(`selection-${tag}-shortcuts-bound`, { rows: await rows() });
    await page.evaluate(async () => {
      const { useSettingsStore } = await import('/src/store/settingsStore.ts');
      useSettingsStore.getState().closeSettings();
    });
    await ours.waitFor({ state: 'detached', timeout: 30000 });
    console.log(`[${tag}] Settings: Unassigned after Fold estimate; bound to ${JSON.stringify(bound)}`);

    // The key, on the canvas, with the sheet selected: the dialog opens on it.
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());
    await selectWholeSheet(page);
    await page.keyboard.press('Alt+Shift+KeyK');
    dialog = await readyDialog(page);
    if ((await openedRequest(page))?.digest !== asked.digest) throw new Error('the key opened the dialog on another fold');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 30000 });
    if ((await editCanvasState(page)).figures.length !== 0) throw new Error('Escape left a figure');
    console.log(`[${tag}] the bound key opened the dialog on the sheet's fold; Escape left nothing`);

    // A crease edited between the press and its fold: the press is held at its pre-fold
    // warning (a crease deleted first, so the sheet has errors), a second crease is deleted
    // meanwhile, and Yes lets it fold. It stops before its dialog opens: no dialog, no
    // figure, and the reason said.
    const figuresMade = async () => (await editCanvasState(page)).figures.length;
    await page.evaluate(async () => {
      const { useSettingsStore } = await import('/src/store/settingsStore.ts');
      useSettingsStore.setState({ foldWarningEnabled: true });
    });
    await deleteOneCrease(page);
    await clearCpError(page);
    await selectWholeSheet(page);
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    const warning = page.getByText('Detected errors in flat foldability. Continue to fold?');
    await warning.waitFor({ state: 'visible', timeout: 30000 });
    await deleteOneCrease(page);
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await saidPatternChanged(page);
    if (await page.getByRole(DIALOG.role, { name: DIALOG.name }).isVisible()) throw new Error('the dialog opened on creases that changed');
    if ((await figuresMade()) !== 0) throw new Error('an edit behind the press still made a figure');
    console.log(`[${tag}] a crease edited between the press and its fold: no dialog, no figure, "${PATTERN_CHANGED}"`);
    await record(`selection-${tag}-edited-behind-press`, { toast: await steadyShot(page, patternChangedToast(page).first(), { masked: false }) });
    // Kabuto again: both deletions undone.
    await page.evaluate(async () => {
      await window.__treemakerWorkspaceStore.getState().undo();
      await window.__treemakerWorkspaceStore.getState().undo();
    });

    // A crease edited while the dialog is open (as a native menu could): Apply writes nothing.
    await clearCpError(page);
    await selectWholeSheet(page);
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    dialog = await readyDialog(page);
    await deleteOneCrease(page);
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await saidPatternChanged(page);
    if ((await figuresMade()) !== 0) throw new Error('Apply after an edit made a figure');
    console.log(`[${tag}] a crease deleted while the dialog was open: Apply made no figure, and said why`);
    await page.evaluate(() => window.__treemakerWorkspaceStore.getState().undo());

    // Another document opened while the dialog is open: Apply lands nothing in it.
    await clearCpError(page);
    await selectWholeSheet(page);
    await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).click();
    dialog = await readyDialog(page);
    const other = await readFile(path.join(repoRoot, 'tests/fixtures/oriedita/solution_sample_1.cp'), 'utf8');
    await openTextInEdit(page, other, 'solution_sample_1.cp', theme);
    if (!(await dialog.isVisible())) throw new Error('the dialog closed with the document');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await saidPatternChanged(page);
    const replaced = await editCanvasState(page);
    if (replaced.figures.length !== 0 || replaced.history.length !== 0) {
      throw new Error(`Apply landed in the new document: ${JSON.stringify(replaced)}`);
    }
    console.log(`[${tag}] another document opened while the dialog was open: Apply landed nothing in it, and said why`);
    await page.mouse.move(1, 1);
    await record(`selection-${tag}-document-replaced`, {
      canvas: await steadyShot(page, page.locator('canvas.cp-webgl-layer').locator('..'), { masked: false }),
    });

    // Creases that fold in 3D: held, with why.
    await openFileInEdit(page, url, 'tests/fixtures/fold-angle-3d/box_90.fold', theme);
    await selectWholeSheet(page);
    if (!(await toolbar.getByRole('button', { name: FOLD_WITH_LAYER_ORDER }).isDisabled())) throw new Error('not held on 3D creases');
    await record(`selection-${tag}-3d`, await selectionToolbarShots(page));
  };
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
  { name: 'diagram-step', run: diagramStepCases(null) },
  { name: 'diagram-step-horizon', run: diagramStepCases('Horizon') },
  { name: 'diagram-step-offline', run: diagramStepOfflineCases(null) },
  { name: 'diagram-step-offline-horizon', run: diagramStepOfflineCases('Horizon') },
  { name: 'panes', run: paneCases(null) },
  { name: 'panes-horizon', run: paneCases('Horizon') },
  { name: 'panes-phone', run: panePhoneCases },
  { name: 'panes-refusal', run: paneRefusalCases },
  { name: 'panes-creases', run: creaseCases(null) },
  { name: 'panes-creases-horizon', run: creaseCases('Horizon') },
  { name: 'host-looks', run: hostLookCases },
  { name: 'edit-figure', run: editFigureCases(null) },
  { name: 'edit-figure-horizon', run: editFigureCases('Horizon') },
  { name: 'edit-figure-review', run: editFigureReviewCases },
  { name: 'edit-figure-states', run: editFigureStateCases(null) },
  { name: 'edit-figure-states-horizon', run: editFigureStateCases('Horizon') },
  { name: 'edit-selection', run: editSelectionCases(null) },
  { name: 'edit-selection-horizon', run: editSelectionCases('Horizon') },
  { name: 'pose-toolbar', run: poseToolbarCases(null) },
  { name: 'pose-toolbar-horizon', run: poseToolbarCases('Horizon') },
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
