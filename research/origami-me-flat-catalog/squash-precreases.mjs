// Read-only regression audit: never publish or regenerate native user models.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Trial } from '../2026-10-13-origami-fold-trials/trial-lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = JSON.parse(fs.readFileSync(path.join(dir, '../../tests/fixtures/fold-examples/squash-precreased-bird.json')));
const trial = new Trial('bird-pocket-regression', 'Bird pocket selection', fixture.paper);
for (const node of fixture.steps) trial.add(node.op, node.note, node.choices);
const picks = fixture.picks.map(op => {
  const analysis = trial.e.compound_analysis(trial.state, op);
  const result = trial.e.apply(trial.state, op);
  assert.equal(analysis.status, 'ok');
  assert.equal(result.status, 'ok');
  return { op, analysis, result, stateHash: hash(JSON.stringify(trial.e.canonical_keys(result.state).sort())) };
});
assert.deepEqual(picks[0].analysis, picks[1].analysis);
assert.equal(picks[0].stateHash, picks[1].stateHash);
assert.deepEqual(trial.e.scene(picks[0].result.state), trial.e.scene(picks[1].result.state));

const files = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(folder, entry.name);
  return entry.isDirectory() ? files(file) : [file];
});
const models = [];
for (const file of files(path.join(dir, '../2026-10-13-origami-fold-trials/models')).filter(f => f.endsWith('.osf') && !f.includes('/archive/'))) {
  const bytes = fs.readFileSync(file), project = JSON.parse(bytes);
  const name = path.basename(file, '.osf');
  const manifestPath = path.join(dir, 'batches', name + '.validation.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : null;
  const item = { file: path.relative(dir, file), sha256: hash(bytes), fileMatchesManifest: manifest ? hash(bytes) === manifest.fileSha256 : null, sequences: [] };
  for (const sequence of project.workspace.foldSequences ?? []) {
    const t = new Trial('replay', sequence.title, sequence.paper);
    const states = new Map([[null, t.state]]);
    const stateHash = state => hash(JSON.stringify(t.e.canonical_keys(state).sort()));
    const hashes = [stateHash(t.state)], failures = [];
    for (const node of sequence.steps) {
      const parent = states.get(node.parent ?? null);
      if (parent === undefined) { failures.push({ id: node.id, reason: 'parent failed' }); continue; }
      const result = t.e.apply(parent, node.op, node.choices);
      if (result.status !== 'ok') { failures.push({ id: node.id, result }); continue; }
      states.set(node.id, result.state);
      hashes.push(stateHash(result.state));
    }
    item.sequences.push({ nodes: sequence.steps.length, replayedStates: hashes.length, failures, stateHashesMatchManifest: manifest ? JSON.stringify(hashes) === JSON.stringify(manifest.stateHashes) : null });
    assert.equal(failures.length, 0, file);
    if (manifest) assert.deepEqual(hashes, manifest.stateHashes, file + ': material, creases or layer order changed');
  }
  assert.equal(hash(fs.readFileSync(file)), item.sha256, file + ': native file changed during audit');
  models.push(item);
}
const evidence = {
  date: '2026-10-14', gap: 'F019', source: fixture.source, picks,
  comparison: 'Identical complete analysis, canonical material/crease/order keys and scene including exposed sides and subface stacks.',
  models,
  totals: { files: models.length, nodes: models.flatMap(m => m.sequences).reduce((n, s) => n + s.nodes, 0), states: models.flatMap(m => m.sequences).reduce((n, s) => n + s.replayedStates, 0) },
  userEdits: models.filter(m => m.fileMatchesManifest === false).map(m => ({ file: m.file, sha256: m.sha256 })),
  note: 'Witch Hat contains the user-added CP; its file hash differs from the pre-edit manifest, while its saved Fold states still match. No native file is written. Replay is not a fresh source audit or tutorial completion.',
};
fs.writeFileSync(path.join(dir, 'batches/squash-precreases-2026-10-14.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ totals: evidence.totals, userEdits: evidence.userEdits }, null, 2));
