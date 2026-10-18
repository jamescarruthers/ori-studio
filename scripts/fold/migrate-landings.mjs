/** Local, lossless landing-format migration. No model content enters the repo.
 * node scripts/fold/migrate-landings.mjs <models-directory> [--write]
 * Backups and replay evidence stay under ignored artifacts/fold-placement-migration.
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = resolve(process.argv[2] ?? join(root, 'research/2026-10-13-origami-fold-trials/models'));
const writing = process.argv.includes('--write');
const stamp = new Date().toISOString().replaceAll(':', '-');
const output = join(root, 'artifacts/fold-placement-migration', stamp);
await mkdir(output, { recursive: true });
await build({ stdin: { contents: `
export { readFoldSequence, writeFoldOp } from './apps/web/src/fold/document/foldSequenceFile';
export { isLockedStep } from './apps/web/src/fold/document/foldSequenceDocument';
export { createFoldReplayer } from './apps/web/src/fold/document/foldReplay';
export { createFoldEnginePort } from './apps/web/src/fold/engine/foldEnginePort';
export { createFoldEngineCalls } from './apps/web/src/fold/engine/foldEngineCalls';
export { canonicalJson } from './apps/web/src/fold/document/foldDigest';
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: join(output, 'helpers.mjs') });
const { readFoldSequence, writeFoldOp, isLockedStep, createFoldReplayer, createFoldEnginePort, createFoldEngineCalls, canonicalJson } = await import(pathToFileURL(join(output, 'helpers.mjs')));
const wasmDir = join(root, 'apps/web/src/generated/oristudio-fold-wasm');
const wasm = await import(pathToFileURL(join(wasmDir, 'oristudio_fold_wasm.js')));
wasm.initSync({ module: await readFile(join(wasmDir, 'oristudio_fold_wasm_bg.wasm')) });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...await inventory(join(dir, entry.name)));
    else if (entry.name.endsWith('.osf')) files.push(join(dir, entry.name));
  }
  return files.sort();
}
async function replay(sequence) {
  const raw = new wasm.FoldEngine();
  const calls = createFoldEngineCalls(raw);
  const source = { generation: () => 1, sheet: async (p) => calls.sheet(p), step: async (s, op, choices) => calls.step(s, op, choices),
    returnTo: async (s, t, h) => calls.returnTo(s, t, h), release: async (s) => calls.release(s) };
  const replayer = createFoldReplayer(createFoldEnginePort(source, wasm.fold_engine_version()), { capacity: sequence.steps.length + 1 });
  try {
    const result = await replayer.run({ sequence, loadId: 1 });
    const snapshot = (n) => ({ status: n.status, fingerprint: n.fingerprint, path: n.path, refusal: n.refusal });
    return { sheet: snapshot(result.sheet), steps: [...result.steps].map(([id, n]) => [id, snapshot(n)]) };
  } finally { replayer.clear(); await Promise.resolve(); raw.free(); }
}
const report = { directory, writing, backup: output, engineVersion: wasm.fold_engine_version(), files: [] };
for (const file of await inventory(directory)) {
  const bytes = await readFile(file);
  const record = { file: relative(directory, file), sha256: hash(bytes), sequences: [], migratedOps: 0 };
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    const sequences = value.workspace?.foldSequences;
    if (!Array.isArray(sequences)) { record.status = 'no-fold-sequences'; report.files.push(record); continue; }
    const migrated = structuredClone(value);
    for (let i = 0; i < sequences.length; i++) {
      const old = sequences[i];
      const held = readFoldSequence(old);
      if (!held || held.readOnlyRaw) { record.sequences.push({ index: i, status: 'read-only-preserved' }); continue; }
      const rawById = new Map(old.steps.map((s) => [s.id, s]));
      const before = { ...held.document, steps: held.document.steps.map((s) => isLockedStep(s) ? s : { ...s, op: rawById.get(s.id).op }) };
      const next = migrated.workspace.foldSequences[i];
      const known = new Map(held.document.steps.filter((s) => !isLockedStep(s)).map((s) => [s.id, s]));
      for (const node of next.steps) {
        const parsed = known.get(node.id);
        if (!parsed || !['valley', 'mountain', 'tuck'].includes(node.op?.kind)) continue;
        const op = writeFoldOp(parsed.op);
        if (canonicalJson(op) !== canonicalJson(node.op)) record.migratedOps++;
        node.op = op;
      }
      next.formatVersion = 2;
      const after = readFoldSequence(next).document;
      const previous = await replay(before);
      const current = await replay(after);
      if (canonicalJson(previous) !== canonicalJson(current)) throw new Error(`replay changed in sequence ${i}`);
      record.sequences.push({ index: i, status: 'identical', nodes: current.steps.length,
        existingIssues: current.steps.filter(([, n]) => n.status !== 'ok').map(([id, n]) => ({ id, ...n })) });
    }
    const changed = canonicalJson(value) !== canonicalJson(migrated);
    if (changed && writing) {
      const latest = await readFile(file);
      if (hash(latest) !== record.sha256) throw new Error('file changed during verification; preserved current user version');
      const backup = join(output, 'originals', record.file);
      await mkdir(dirname(backup), { recursive: true });
      await writeFile(backup, bytes, { flag: 'wx' });
      await writeFile(file, JSON.stringify(migrated, null, 2) + '\n');
      record.afterSha256 = hash(await readFile(file));
    }
    record.status = changed ? (writing ? 'migrated' : 'verified') : 'already-current';
  } catch (error) { record.status = 'preserved'; record.error = String(error); }
  report.files.push(record);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.files.length}: ${record.status} ${record.file} (${record.migratedOps} operations)`);
}
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Report: ${join(output, 'report.json')}`);
