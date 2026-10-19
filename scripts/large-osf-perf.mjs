#!/usr/bin/env node
/**
 * Time opening a large `.osf` and box-selecting sheets in it, in a production
 * build, through the real drop path — the measurement behind
 * `implementation-plans/large-document-open-and-select.md`.
 *
 * Nothing in the app is instrumented for it. The signals are all external:
 *
 * - **Open done:** the canvas readout's "N lines" changes to the document's
 *   count. Then the main thread is probed until it answers a trivial evaluate
 *   promptly for three seconds straight ("quiet"), so work the open schedules
 *   after the first paint is counted too.
 * - **Selection landed:** the readout's "N selected" changes. **Toolbar:** the
 *   floating "Crease pattern actions" bar appears — the toolbar only shows once
 *   the selection resolves to one whole sheet, which is the expensive part.
 * - **Freezes:** every long task (`PerformanceObserver('longtask')`), so the
 *   longest one is the worst freeze a user sat through.
 * - **Memory:** the JS heap after a forced garbage collection (CDP), so the
 *   number is what is retained rather than what is waiting to be collected.
 *
 * Box coordinates are viewport pixels in the fixed 2400 × 1500 viewport, after
 * `--zoom-out` presses of the zoom-out key. For `bodo_large.osf` (a 15 × 14
 * grid of sheets, opened on its saved camera), these enclose one whole sheet
 * each, below and above the centre:
 *
 *   npm run build:web
 *   node scripts/large-osf-perf.mjs path/to/bodo_large.osf \
 *     --zoom-out 3 --box 880,809,1494,1409 --box 880,127,1494,727
 *
 * For another file, run once with `--zoom-out N` and no boxes, and read the
 * coordinates off the `zoomed.png` it writes.
 *
 * `--action <name>` (repeatable) then times the selection toolbar's verbs on
 * the sheet selected last, reselecting the first box whenever an earlier action
 * dismissed the toolbar. The clock runs from the click until its effect shows:
 *
 * - `fold`: the global "Folding…" indicator has come and gone. It shows after
 *   half a second of folding and for at least one, so this reads a fold under
 *   half a second as one, and is exact only past a second and a half;
 * - `simulate-inline`: an inline simulation window reports ready;
 * - `simulate`: the Simulate workspace's simulator reports ready (it leaves
 *   the Edit canvas, so give it last);
 * - `save-image`: the export dialog's preview has drawn (the dialog is then
 *   closed);
 * - `export-cp`: the browser receives the `.cp` download.
 *
 * `--diagram` then enters the Diagram workspace — every linked card's status is
 * worked out there — selects the first step, and opens its pattern picker,
 * timing each until the main thread has been quiet for ten seconds: long
 * enough that a pause while the engine works in its worker is not taken for
 * the end.
 *
 * `--references` enters the References workspace (its sheet rail, in Find
 * mode), switches it to the precreasing sequence (planned for the first sheet
 * on the switch), then picks the rail's second sheet (which puts the
 * workspace back in Find) and asks for its sequence; timed the same way.
 *
 * Options: `--out <dir>` (default `artifacts/large-osf-perf/<time>`, ignored by
 * git), `--dist <dir>` (a production build other than `apps/web/dist`, to time
 * two builds with one script), `--trace` (a Chrome trace per phase, for
 * attributing time to functions; it slows the run), `--headed`.
 */
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { servePagesLike } from './lib/serve-dist.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 2400, height: 1500 };
const QUIET_MS = 3000;
const PROBE_LIMIT_MS = 60;
const PHASE_LIMIT_MS = 10 * 60 * 1000;
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8.execute',
  'disabled-by-default-v8.cpu_profiler',
  'blink.user_timing',
  'toplevel',
  'disabled-by-default-v8.gc',
];

const ACTIONS = {
  fold: { button: 'Fold', busy: /Folding…|Still folding|Cancelling…/ },
  'simulate-inline': { button: 'Simulate inline', shown: '.cp-inline-simulation[data-status="ready"]' },
  simulate: { button: 'Simulate', shown: '.simulator-readout[data-state="ready"]' },
  'save-image': {
    button: 'Save to image',
    shown: '[aria-label="Export preview"] :is(svg, img, canvas)',
    close: true,
  },
  'export-cp': { button: 'Export…', menuItem: 'CP', download: true },
};

function parseArgs(argv) {
  const options = {
    file: null,
    zoomOut: 0,
    boxes: [],
    actions: [],
    diagram: false,
    references: false,
    out: null,
    dist: path.join(repoRoot, 'apps/web/dist'),
    trace: false,
    headed: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--zoom-out') options.zoomOut = Number(argv[++i]);
    else if (arg === '--box') options.boxes.push(argv[++i].split(',').map(Number));
    else if (arg === '--action') options.actions.push(argv[++i]);
    else if (arg === '--diagram') options.diagram = true;
    else if (arg === '--references') options.references = true;
    else if (arg === '--out') options.out = argv[++i];
    else if (arg === '--dist') options.dist = path.resolve(argv[++i]);
    else if (arg === '--trace') options.trace = true;
    else if (arg === '--headed') options.headed = true;
    else if (!arg.startsWith('--') && !options.file) options.file = path.resolve(arg);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.file) throw new Error('usage: large-osf-perf.mjs <file.osf> [--zoom-out N] [--box x0,y0,x1,y1]...');
  if (options.boxes.some((box) => box.length !== 4 || box.some((n) => !Number.isFinite(n)))) {
    throw new Error('--box takes x0,y0,x1,y1 in viewport pixels');
  }
  const unknown = options.actions.filter((action) => !ACTIONS[action]);
  if (unknown.length > 0) throw new Error(`unknown --action ${unknown.join(', ')}; one of ${Object.keys(ACTIONS).join(', ')}`);
  if (options.actions.length > 0 && options.boxes.length === 0) throw new Error('--action needs a --box to select');
  options.out ??= path.join(repoRoot, 'artifacts/large-osf-perf', new Date().toISOString().replace(/[:.]/g, '-'));
  return options;
}

/**
 * The file, served on its own port with CORS and CORP, so the cross-origin
 * isolated app may fetch it without it being copied into `dist`.
 */
function serveFile(file) {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': statSync(file).size,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/file.osf`, close: () => server.close() });
    });
  });
}

const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const app = await servePagesLike(options.dist);
  const osf = await serveFile(options.file);
  const browser = await chromium.launch({
    headless: !options.headed,
    // Real scrollbars: headless hides them, and then under-reports layout in scroll containers.
    ignoreDefaultArgs: ['--hide-scrollbars'],
    // Hardware WebGL in headless Chromium on macOS; without it the canvas draws
    // through SwiftShader and the numbers stop resembling a user's.
    args:
      process.platform === 'darwin'
        ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
        : ['--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const cdp = await page.context().newCDPSession(page);
  page.on('pageerror', (error) => log('[pageerror]', error.message));
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push([entry.startTime, entry.duration]);
    }).observe({ type: 'longtask', buffered: true });
  });

  /** How long the main thread takes to answer: past PROBE_LIMIT_MS, it is busy. */
  const probe = async () => {
    const started = Date.now();
    await page.evaluate(() => 0);
    return Date.now() - started;
  };
  /** Ms from `since` until the main thread has been quiet for `window` ms (the quiet itself excluded). */
  const untilQuiet = async (since, window = QUIET_MS) => {
    let quietSince = null;
    for (;;) {
      const busy = (await probe()) > PROBE_LIMIT_MS;
      const now = Date.now();
      if (busy) quietSince = null;
      else quietSince ??= now;
      if (quietSince !== null && now - quietSince >= window) return quietSince - since;
      if (now - since > PHASE_LIMIT_MS) throw new Error('the main thread never went quiet');
      await page.waitForTimeout(100);
    }
  };
  /** Where the selection toolbar sits, or null when it is not shown. */
  const toolbarRect = () =>
    page.evaluate(() => {
      const rect = document.querySelector('[aria-label="Crease pattern actions"]')?.getBoundingClientRect();
      return rect ? [Math.round(rect.x), Math.round(rect.y)] : null;
    });
  const readout = () =>
    page.evaluate(() => {
      const text = document.body.innerText;
      const lines = /(\d[\d,]*)\s+lines\b/.exec(text);
      const selected = /(\d[\d,]*)\s+selected\b/.exec(text);
      return {
        lines: lines ? Number(lines[1].replace(/,/g, '')) : null,
        selected: selected ? Number(selected[1].replace(/,/g, '')) : 0,
      };
    });
  const longTasksSince = (since) =>
    page.evaluate((t0) => {
      const tasks = window.__longTasks.filter(([start]) => start >= t0);
      return {
        count: tasks.length,
        totalMs: Math.round(tasks.reduce((sum, [, duration]) => sum + duration, 0)),
        longestMs: Math.round(Math.max(0, ...tasks.map(([, duration]) => duration))),
      };
    }, since);
  const heapMiB = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    return Math.round(usedSize / 2 ** 20);
  };
  const traced = async (name, run) => {
    if (!options.trace) return run();
    await browser.startTracing(page, { path: path.join(options.out, `${name}.trace.json`), categories: TRACE_CATEGORIES });
    try {
      return await run();
    } finally {
      await browser.stopTracing();
    }
  };

  await page.goto(new URL('edit', app.url).href, { waitUntil: 'networkidle' });
  await page.waitForSelector('.file-drop-region');
  await page.waitForTimeout(2000);
  await page.evaluate(async (url) => {
    window.__osf = await (await fetch(url)).blob();
  }, osf.url);
  const results = { file: path.basename(options.file), heapBeforeMiB: await heapMiB() };
  const linesBefore = (await readout()).lines;

  // ---- Open, through the same drop the canvas takes -------------------------
  results.open = await traced('open', async () => {
    const t0 = await page.evaluate(() => performance.now());
    const started = Date.now();
    await page.evaluate((name) => {
      const region = document.querySelector('.file-drop-region');
      const transfer = new DataTransfer();
      transfer.items.add(new File([window.__osf], name, { type: 'application/json' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        region.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }
    }, path.basename(options.file));
    let canvasMs = null;
    for (;;) {
      const { lines } = await readout();
      if (lines !== null && lines !== linesBefore) {
        canvasMs = Date.now() - started;
        break;
      }
      if (Date.now() - started > PHASE_LIMIT_MS) throw new Error('the document never reached the canvas');
      // A document already open asks whether to replace it.
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].find((b) => /Open as a new file/i.test(b.textContent ?? ''))?.click()
      );
      await page.waitForTimeout(25);
    }
    const quietMs = await untilQuiet(started);
    return { canvasMs, quietMs, lines: (await readout()).lines, longTasks: await longTasksSince(t0) };
  });
  results.open.heapMiB = await heapMiB();
  log('open', JSON.stringify(results.open));
  await page.screenshot({ path: path.join(options.out, 'open.png') });

  // ---- Box-select whole sheets --------------------------------------------------
  for (let i = 0; i < options.zoomOut; i += 1) {
    await page.keyboard.press('5');
    await page.waitForTimeout(300);
  }
  await untilQuiet(Date.now());
  await page.screenshot({ path: path.join(options.out, 'zoomed.png') });
  /** Drag a box over `[x0, y0, x1, y1]` and time the selection, its toolbar, and quiet. */
  const selectBox = async ([x0, y0, x1, y1]) => {
    const selectedBefore = (await readout()).selected;
    // A toolbar left from the previous selection stays mounted and moves to
    // the new sheet once that resolves, so "shown" means shown somewhere new.
    const toolbarBefore = JSON.stringify(await toolbarRect());
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(x0 + ((x1 - x0) * step) / 8, y0 + ((y1 - y0) * step) / 8);
    }
    const released = Date.now();
    await page.mouse.up();
    // One loop for all three, so a selection that never yields a toolbar
    // ends when the main thread goes quiet instead of at the phase limit.
    // Quiet is only counted once the selection has landed: the kernel runs
    // the command in its worker, and an idle main thread meanwhile is not done.
    let selected = selectedBefore;
    let selectedMs = null;
    let toolbarMs = null;
    let quietSince = null;
    let quietMs = null;
    for (;;) {
      const asked = Date.now();
      const state = await readout();
      const rect = await toolbarRect();
      const now = Date.now();
      selected = state.selected;
      if (selectedMs === null && selected !== selectedBefore) selectedMs = now - released;
      if (toolbarMs === null && rect && JSON.stringify(rect) !== toolbarBefore) toolbarMs = now - released;
      const settled = selectedMs !== null || now - released > 10_000;
      if (now - asked > 2 * PROBE_LIMIT_MS || !settled) quietSince = null;
      else quietSince ??= now;
      if (quietSince !== null && now - quietSince >= QUIET_MS) {
        quietMs = quietSince - released;
        break;
      }
      if (now - released > PHASE_LIMIT_MS) throw new Error('the main thread never went quiet after a selection');
      await page.waitForTimeout(25);
    }
    return { selected, selectedMs, toolbarMs, quietMs, longTasks: await longTasksSince(t0) };
  };

  results.selections = [];
  for (const [index, box] of options.boxes.entries()) {
    const name = `select-${index + 1}`;
    const result = await traced(name, () => selectBox(box));
    result.heapMiB = await heapMiB();
    log(name, JSON.stringify(result));
    await page.screenshot({ path: path.join(options.out, `${name}.png`) });
    results.selections.push(result);
  }

  // ---- The toolbar's verbs, on the first box's sheet ----------------------------
  results.actions = [];
  for (const action of options.actions) {
    const { button, menuItem, shown, busy, download, close } = ACTIONS[action];
    // Acting dismisses the toolbar, so an action after another starts from a
    // fresh selection.
    if ((await toolbarRect()) === null && (await selectBox(options.boxes[0])).toolbarMs === null) {
      throw new Error(`${action}: the selection showed no toolbar`);
    }
    const result = await traced(action, async () => {
      const t0 = await page.evaluate(() => performance.now());
      const downloaded = download ? page.waitForEvent('download', { timeout: PHASE_LIMIT_MS }) : null;
      const clicked = Date.now();
      await page.click(`[aria-label="Crease pattern actions"] button[aria-label="${button}"]`);
      if (menuItem) await page.getByRole('menuitem', { name: menuItem, exact: true }).click();
      let effectMs = null;
      if (downloaded) {
        await downloaded;
        effectMs = Date.now() - clicked;
      } else if (busy) {
        const indicator = page.getByText(busy).first();
        const appeared = await indicator.waitFor({ state: 'visible', timeout: 2000 }).then(
          () => true,
          () => false
        );
        if (appeared) await indicator.waitFor({ state: 'hidden', timeout: PHASE_LIMIT_MS });
        effectMs = appeared ? Date.now() - clicked : 500;
      } else {
        await page.waitForSelector(shown, { timeout: PHASE_LIMIT_MS });
        effectMs = Date.now() - clicked;
      }
      const quietMs = await untilQuiet(clicked);
      return { effectMs, quietMs, longTasks: await longTasksSince(t0) };
    });
    result.heapMiB = await heapMiB();
    log(action, JSON.stringify(result));
    await page.screenshot({ path: path.join(options.out, `${action}.png`) });
    if (close) await page.keyboard.press('Escape');
    results.actions.push({ action, ...result });
  }

  /**
   * A workspace phase: act, wait for each of `marks` in turn and record when
   * it happened, then wait for ten quiet seconds — long enough that a pause
   * while an engine works in its worker is not taken for the end. A mark is
   * `[name, selector, { state, timeout }]`: the selector reaching `state`
   * (default visible); one that times out is recorded as null.
   */
  const WORKSPACE_QUIET_MS = 10_000;
  const phase = (name, act, marks = []) => traced(name, async () => {
    const t0 = await page.evaluate(() => performance.now());
    const started = Date.now();
    await act();
    // With no marks, how long the act itself took: a click waits out a freeze.
    const shown = marks.length === 0 ? { shownMs: Date.now() - started } : {};
    for (const [mark, selector, { state = 'visible', timeout = PHASE_LIMIT_MS } = {}] of marks) {
      const happened = await page.waitForSelector(selector, { state, timeout }).then(
        () => true,
        () => false
      );
      shown[mark] = happened ? Date.now() - started : null;
    }
    const quietMs = await untilQuiet(started, WORKSPACE_QUIET_MS);
    const result = { ...shown, quietMs, longTasks: await longTasksSince(t0) };
    log(name, JSON.stringify(result));
    await page.screenshot({ path: path.join(options.out, `${name}.png`) });
    return result;
  });

  // ---- The Diagram: every card's link status, a step, then the pattern picker ---
  if (options.diagram) {
    results.diagram = await (async () => ({
      enter: await phase(
        'diagram-enter',
        () => page.click('[aria-label="Workspaces"] button[aria-label="Diagram workspace"]'),
        [['shownMs', '[data-step-id]']]
      ),
      select: await phase('diagram-select', () =>
        page.click('[data-step-id]', { timeout: PHASE_LIMIT_MS, noWaitAfter: true })
      ),
      picker: await phase(
        'diagram-picker',
        () =>
          page
            .getByRole('button', { name: /^(Re)?[lL]ink Pattern…$/ })
            .first()
            .click({ timeout: PHASE_LIMIT_MS }),
        [['shownMs', '[role="listbox"] [role="option"] svg']]
      ),
    }))();
    results.diagram.heapMiB = await heapMiB();
  }

  // ---- References: the sheet rail and the first sheet's sequence, then another sheet ---
  if (options.references) {
    const card = '.references-sidebar [role="option"]';
    const steps = '[role="list"][aria-label="Folding steps"] [role="listitem"]';
    results.references = await (async () => ({
      enter: await phase(
        'references-enter',
        () => page.click('[aria-label="Workspaces"] button[aria-label="References workspace"]'),
        [['railMs', card]]
      ),
      sequence: await phase(
        'references-sequence',
        () => page.click('[data-references-mode="sequence"]', { timeout: PHASE_LIMIT_MS }),
        [['stepsMs', steps]]
      ),
      // A sheet switch puts the workspace back in Find, so its sequence is
      // asked for again.
      pick: await phase(
        'references-pick',
        () => page.locator(card).nth(1).click({ timeout: PHASE_LIMIT_MS, noWaitAfter: true }),
        [['selectedMs', `${card}:nth-child(2)[aria-selected="true"]`]]
      ),
      pickSequence: await phase(
        'references-pick-sequence',
        () => page.click('[data-references-mode="sequence"]', { timeout: PHASE_LIMIT_MS }),
        [['stepsMs', steps]]
      ),
    }))();
    results.references.heapMiB = await heapMiB();
  }

  writeFileSync(path.join(options.out, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  log('wrote', path.relative(repoRoot, options.out));
  await browser.close();
  osf.close();
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
