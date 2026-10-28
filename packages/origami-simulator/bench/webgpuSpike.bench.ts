// Parity and timing for the WebGPU spike (implementation-plans/simulator-webgpu-backend.md).
//
//   npm run bench:webgpu-spike
//
// Serves the harness page with Vite and drives it in headless Chromium. The
// kernels must match the WebGL2 solver on the same input: normals to float32
// rounding, the motion reduction bit for bit, and a non-finite node must read as
// NaN. Timings are printed, not asserted: headless, they come from SwiftShader.
//
// When the machine's GPU offers no WebGPU adapter to headless Chromium, the run
// falls back to SwiftShader's. Either way it says when the adapter is
// SwiftShader. `ORI_BENCH_CHROMIUM` points at a Chromium binary when
// Playwright's own is not installed.
import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatReport, type SpikeReport } from './webgpuSpikeHarness/report.js';

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'webgpuSpikeHarness');
/** Two float32 normal passes over the same input differ by a few ULP of a unit vector. */
const NORMALS_TOLERANCE = 1e-5;

const GL_ARGS = ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'];
const SOFTWARE_WEBGPU_ARGS = ['--enable-features=Vulkan', '--use-webgpu-adapter=swiftshader'];

function launchOptions(args: string[]): LaunchOptions {
  const executablePath = process.env.ORI_BENCH_CHROMIUM;
  return executablePath ? { args, executablePath } : { args };
}

async function hasAdapter(browser: Browser, url: string): Promise<boolean> {
  const page = await browser.newPage();
  try {
    await page.goto(url);
    return await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
  } finally {
    await page.close();
  }
}

describe('WebGPU spike', () => {
  it('matches the WebGL2 solver on every fixture', async () => {
    const server: ViteDevServer = await createServer({
      root: resolve(HARNESS_ROOT, '../..'),
      server: { port: 0 },
      logLevel: 'error',
    });
    await server.listen();
    const base = server.resolvedUrls?.local?.[0];
    if (!base) throw new Error('vite did not report a local URL');
    const url = `${base}bench/webgpuSpikeHarness/index.html`;

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch(launchOptions(GL_ARGS));
      if (!(await hasAdapter(browser, url))) {
        await browser.close();
        browser = await chromium.launch(launchOptions([...GL_ARGS, ...SOFTWARE_WEBGPU_ARGS]));
      }

      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(
        () => typeof (window as unknown as { runWebgpuSpike?: unknown }).runWebgpuSpike === 'function',
        undefined,
        { timeout: 30_000 }
      );
      const report = (await page.evaluate(() =>
        (window as unknown as { runWebgpuSpike: () => Promise<SpikeReport> }).runWebgpuSpike()
      )) as SpikeReport;

      const software = /swiftshader/i.test(report.adapter);
      process.stdout.write(
        `\n${software ? '(WebGPU is on SwiftShader, a CPU emulation: these timings are not GPU timings)\n' : ''}` +
          `${formatReport(report)}\n\n`
      );
      if (pageErrors.length) process.stdout.write(`page errors:\n${pageErrors.join('\n')}\n\n`);

      expect(report.error, 'WebGPU did not start').toBeUndefined();
      const ran = report.rows.filter((row) => !row.error);
      expect(ran.length, `no fixture ran; ${report.rows.map((row) => row.error).join('; ')}`).toBe(report.rows.length);
      expect(ran.length).toBeGreaterThan(0);
      for (const row of ran) {
        expect(row.normalsMaxAbs, `${row.fixture} normals diverged`).toBeLessThan(NORMALS_TOLERANCE);
        expect(row.motionExact, `${row.fixture} motion reduction differs: ${JSON.stringify([row.webgl, row.webgpu])}`).toBe(
          true
        );
        expect(row.nonFiniteCaught, `${row.fixture} missed a non-finite node`).toBe(true);
      }
    } finally {
      await browser?.close();
      await server.close();
    }
  });
});
