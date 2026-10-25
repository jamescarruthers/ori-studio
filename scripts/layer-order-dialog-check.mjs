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
    const kernel = forge ? { ...source, digest: `${source.digest}-forged` } : source;
    window.__layerOrderOutcome = null;
    openLayerOrderDialog({
      source: layerOrderSourceOf(kernel, DEFAULT_FOLDED_MODEL),
      record: null,
      look: { style: DEFAULT_PAPER_STYLE, policy: PAPER_STYLE_POLICIES['folded-flat'], turnDeg: 0, xray: false },
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
    // the record survives and is drawn again. The detail is opened again first: one opened on the
    // Diagram's first mount, as this page's was, holds a controller React's dev double mount has
    // already let go of (found in passing; dev only), and its verbs would do nothing.
    await page.evaluate(async () => {
      const store = window.__treemakerWorkspaceStore;
      store.getState().closeDiagramStep();
      await new Promise((resolve) => setTimeout(resolve, 300));
      store.getState().openDiagramStep(window.__layerOrderStep);
    });
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

    // Edit… opens the dialog's shell on the step; Cancel writes nothing.
    const entries = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    await page.getByRole('button', { name: 'Edit Layer Order…' }).click();
    const dialog = page.getByRole(DIALOG.role, { name: DIALOG.name });
    await dialog.waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForTimeout(3000);
    await record(`diagram-${tag}-dialog`, { dialog: await steadyShot(page, dialog, { masked: false, timeoutMs: 60000 }) });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });
    const after = await page.evaluate(() => window.__treemakerWorkspaceStore.getState().diagramHistory.past.length);
    if (after !== entries) throw new Error('Cancel wrote something');
    console.log(`[${tag}] Edit… opened the dialog; Cancel wrote nothing`);

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
    await page.getByRole('button', { name: 'Edit Layer Order…' }).waitFor({ state: 'visible' });
    if ((await page.getByRole('button', { name: 'Edit Layer Order…' }).getAttribute('aria-disabled')) !== 'true') {
      throw new Error('Edit… is not held on a 3D step');
    }
    await record(`diagram-${tag}-pane-3d`, { page: await pageShot(page) });
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
