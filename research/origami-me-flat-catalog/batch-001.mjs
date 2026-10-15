import {modelFile} from './model-paths.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Trial } from '../2026-10-13-origami-fold-trials/trial-lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const stateHash = (t) => hash(JSON.stringify(t.e.canonical_keys(t.state).sort()));
const template = JSON.parse(fs.readFileSync(path.join(dir, '../../tests/fixtures/fold-examples/petal-fold.osf')));

export function publish(t, source, observations = {}) {
  const filename = modelFile(t.slug);
  const manifestFile = path.join(dir, `batches/${t.slug}.validation.json`);
  const destination = path.join(dir, filename);
  // User saves are authoritative. Never silently regenerate over an audited edit.
  if (fs.existsSync(destination)) {
    const previous = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile)) : null;
    assert.equal(hash(fs.readFileSync(destination)), previous?.fileSha256,
      `Preserve user changes in ${filename}; save a new revision instead.`);
  }
  const expected = t.states.map(state => hash(JSON.stringify(t.e.canonical_keys(state).sort())));
  const project = structuredClone(template);
  project.workspace.id = `workspace-flat-catalog-${t.slug}`;
  project.workspace.title = t.doc.title;
  project.workspace.foldSequences = [t.doc];
  project.workspace.viewState = { fold: { v: 1, sequenceId: t.doc.id,
    cursor: t.doc.steps.at(-1)?.id ?? null,
    activeChild: Object.fromEntries(t.doc.steps.map(s => [s.parent ?? '', s.id])) } };
  const serialized = JSON.stringify(project, null, 2) + '\n';
  const reopened = JSON.parse(serialized).workspace.foldSequences[0];
  const check = new Trial(`replay-${t.slug}`, t.doc.title, reopened.paper);
  assert.equal(stateHash(check), expected[0]);
  for (const [i, step] of reopened.steps.entries()) {
    assert.equal(step.parent, i ? reopened.steps[i - 1].id : null);
    check.add(step.op, step.note, step.choices);
    assert.equal(stateHash(check), expected[i + 1]);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  fs.writeFileSync(manifestFile, JSON.stringify({ source, file: filename,
    fileSha256: hash(serialized), nodes: t.doc.steps.length,
    folds: t.doc.steps.filter(s => !['turn', 'rotate'].includes(s.op.kind)).length,
    finalFaces: t.scene().faces.length, allStatesReplayedIdentically: true,
    stateHashes: expected, ...observations }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `batches/${t.slug}.operations.json`), JSON.stringify(t.log, null, 2) + '\n');
  return t;
}

export function easterEgg() {
  const t = new Trial('easter-egg', 'Easter Egg — Origami.me (batch 1)',
    { shape: { kind: 'square' }, startSide: 'back' });
  const top = Math.SQRT2, k = Math.SQRT2 - 1;
  t.add({ kind: 'rotate', rotate: { amount: 'eighth', direction: 'cw' } }, 'Set-up: white side up, orient the sheet as a diamond.');
  t.line([0, 0], [0, top], [.3, .7], '1: Precrease the vertical diagonal.', { kind: 'precrease' });
  t.line([0, top], [-k, top - 1], [-.5, .7], '2a: Align the upper-left edge with the centerline.');
  t.line([0, top], [k, top - 1], [.5, .7], '2b: Align the upper-right edge with the centerline.');
  t.pp([0, 0], [0, .5], '3: Raise the lower point to y=0.5, just above the shoulder line.');
  t.pp([0, top], [0, .5], '4: Lower the upper point to meet the raised lower point.');
  t.line([-.345, .39], [-.345, .48], [-.4, .42], '5a: Fold the left corner inward; chosen symmetric crease x=-0.345.');
  t.line([.345, .39], [.345, .48], [.4, .42], '5b: Fold the right corner inward; chosen symmetric crease x=0.345.');
  t.line([-.13, .927], [-.22, .837], [-.185, .94], '6a: Shape the upper-left corner with an oblique fold.');
  t.line([.13, .927], [.22, .837], [.185, .94], '6b: Repeat the same shaping on the upper-right corner.');
  t.turn('7: Turn over to the clean colored face.');
  // The final display face should be the unbroken colored side of the sheet.
  const scene = t.scene();
  assert(scene.subfaces.length > 0);
  for (const cell of scene.subfaces) {
    assert.equal(scene.faces[cell.faces_top_to_bottom[0]].front_up, true);
  }
  return publish(t, 'https://origami.me/easter-egg/', {
    sourceSteps: 7, proportions: 'Source steps 3, 5, 6 are approximate. Symmetric values are recorded in notes.',
    checks: ['All exposed final subfaces show the colored/front paper side.'],
    audit: 'pending visual review',
  });
}

if (process.argv[2] === 'easter-egg') easterEgg();

export function catFace() {
  const t = new Trial('cat-face', 'Cat Face — Origami.me (batch 1)',
    { shape: { kind: 'square' }, startSide: 'back' });
  const r = Math.SQRT1_2;
  t.add({ kind: 'rotate', rotate: { amount: 'eighth', direction: 'cw' } }, 'Set-up: white side up, diamond orientation.');
  t.pp([0, 2*r], [0, 0], '1: Fold the upper corner down to the lower corner.');
  t.pp([-r, r], [0, 0], '2a: Bring the left corner to the lower tip.');
  t.pp([r, r], [0, 0], '2b: Bring the right corner to the lower tip.');
  t.line([0, .43], [-.27, .295], [-.1, .15], '3a: Lift the left flap to form the left ear.', { scope: 1 });
  t.line([0, .43], [.27, .295], [.1, .15], '3b: Lift the right flap symmetrically to form the right ear.', { scope: 1 });
  t.line([-.08, .56], [.08, .56], [.01, .65], '4: Fold down only the crown flap, leaving both ears in place.', { scope: 1 });
  t.turn('5a: Turn over to the face side.');
  t.line([-.12, .2], [.12, .2], [0, .05], '5b: Raise only the front lower point to form the white muzzle.', { scope: 1 });
  t.line([-.025, .35], [.025, .35], [0, .39], '6: Fold the muzzle tip down to make the colored nose.', { scope: 1 });
  const moving = t.at([0, .05]);
  // The pocket wall is the supporting layer beneath the turned-up muzzle.
  // Tucking immediately under the exposed muzzle is a different, infeasible order.
  const target = t.at([-.05, .25], 1);
  const witnesses = [[-.06, .25], [.06, .25], [.01, .33]];
  const before = witnesses.map(p => t.at(p));
  const op = { kind: 'tuck', direction: 'valley',
    line: { via: 'free', through: [t.at([-.12, .2]), t.at([.12, .2])] },
    moving, seed: { scope: 'depth', at: moving, layers: 1 }, target };
  const result = t.e.tuck(t.state, op);
  fs.writeFileSync(path.join(dir, 'batches/cat-face-tuck-probe.json'), JSON.stringify({ op, result }, null, 2)+'\n');
  console.log('cat tuck', result.status, result.outcome ?? result.refusal?.code);
  if (result.status !== 'ok') {
    publish(t, 'https://origami.me/cat-face/', { sourceStepsCompleted: 6, blockedAtSourceStep: 7, audit: 'partial; tuck investigation' });
    return t;
  }
  if (result.outcome === 'choose_order') {
    // The white muzzle material must stay visible; neither the pocket nor nose
    // may be covered by the hidden lower flap.
    const matches = result.candidates.filter(candidate => witnesses.every((p, i) => {
      const after = t.at(p, 0, candidate.state);
      return Math.hypot(after[0]-before[i][0], after[1]-before[i][1]) < 1e-8;
    }));
    assert.equal(matches.length, 1, 'one tuck completion must preserve both muzzle sides and nose');
    t.add(op, '7: Tuck the remaining lower point behind the white muzzle, keeping the nose exposed.', matches[0].stored);
  } else {
    t.add(op, '7: Tuck the remaining lower point behind the white muzzle, keeping the nose exposed.');
  }
  const visibleMaterial = witnesses.map(p => t.at(p));
  visibleMaterial.forEach((at, i) => assert(Math.hypot(at[0]-before[i][0], at[1]-before[i][1]) < 1e-8));
  assert(Math.abs(t.bounds()[1] - .2) < 1e-8, 'the loose lower point must disappear inside the model');
  return publish(t, 'https://origami.me/cat-face/', { sourceSteps: 7,
    checks: ['Both muzzle sides and the nose retain their exposed material after the tuck.', 'The remaining lower tip is hidden and the bottom edge stays at y=0.2.'],
    visibleMaterialWitnesses: witnesses.map((point, i) => ({ point, originalSheet: before[i] })),
    proportions: 'Ear and face shaping use symmetric approximate diagram references; no drawn eyes/whiskers.',
    audit: 'pending visual review' });
}
if (process.argv[2] === 'cat-face') catFace();
