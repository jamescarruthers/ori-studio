import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
import {modelPath} from './model-paths.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(dir, '../../tests/fixtures/fold-examples/witch-hat-existing-precrease.json')));
const t = new Trial('witch-hat', 'Witch Hat — before brim collapse', fixture.paper);
for (const node of fixture.steps) t.add(node.op, node.note, node.choices);
const before = t.scene();
const parent = t.state;
const original = t.e.apply(parent, fixture.op);
assert.equal(original.status, 'ok');
const [a,b] = fixture.op.line.through;
const op = {...fixture.op, line:{via:'crease',at:a.map((x,i)=>(2*x+b[i])/3)}};
t.add(op, '7: Reverse only the middle section of the existing horizontal precrease (Precrease → Existing crease → Segment). The outer wing creases stay unchanged.');
assert.deepEqual(t.e.canonical_keys(t.state).sort(), t.e.canonical_keys(original.state).sort());
const after = t.scene();
for (const key of ['faces','face_transforms','subfaces','sheet_points','lineage']) assert.deepEqual(after[key],before[key], key);
const summary = t.e.step_summary(t.state);
assert.deepEqual(summary.summary.diff, {added:[], reversed:[47,48], unfolded:[], refolded:[]});

// A diagnostic, NOT a source-equivalent step: an ordinary full-line fold
// across the upper horizontal crease also refolds the outer wings.
// Keep it out of the native sequence until the coordinated collapse is mapped.
const firstCenter = {kind:'mountain', line:{via:'crease',at:t.at([.05,Math.SQRT1_2])},
  moving:t.at([.01,.2]), seed:{scope:'all'}};
const probe = t.e.apply(t.state, firstCenter);
const toggled = probe.status === 'ok' ? before.creases.filter(c => probe.report.refolded.some(r => r.edge === c.id)) : [];

const evidence = {source:fixture.source, sourceStep:7, exactRequest:fixture.op,
  exactResult:original, savedRequest:op, summary,
  unchanged:['face geometry and exposed paper sides','every face transform','complete subface layer stacks','sheet vertices','face lineage'],
  nextStep:{sourceStep:8,toggled,classification:'authoring/compound investigation',op:firstCenter,result:probe,
    note:'The full-line mountain fold succeeds and refolds six existing crease pieces, including the outer wings. It is not accepted as the source collapse. Establish a flat compound decomposition before claiming a missing operation.'}};
fs.writeFileSync(path.join(dir,'batches/witch-hat-existing-crease-2026-10-14.json'), JSON.stringify(evidence,null,2)+'\n');
fs.mkdirSync(path.join(dir,'../../artifacts/existing-crease'),{recursive:true});
fs.writeFileSync(path.join(dir,'../../artifacts/existing-crease/witch-step8-control.json'), JSON.stringify({op:firstCenter,result:probe,scene:probe.status==='ok'?t.e.scene(probe.state):null},null,2));

if(process.argv.includes('--publish')) {
  const existing=modelPath('witch-hat'), bytes=fs.readFileSync(existing);
  const previous=JSON.parse(fs.readFileSync(path.join(dir,'batches/witch-hat.validation.json')));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),previous.fileSha256,'Preserve user changes');
  const archive=path.join(dir,'../2026-10-13-origami-fold-trials/models/archive/checkpoints/witch-hat-before-existing-crease.osf');
  if(!fs.existsSync(archive))fs.copyFileSync(existing,archive,fs.constants.COPYFILE_EXCL);
  publish(t,fixture.source,{sourceSteps:14,sourceStepsCompleted:7,blockedAtSourceStep:8,
    blocker:'Coordinated brim collapse: establish a source-matching flat compound decomposition; not a confirmed missing primitive.',
    audit:'valid prefix checked in Fold; not tutorial completion',allNativeStatesVisuallyChecked:true,
    checks:evidence.unchanged});
}
console.log(JSON.stringify({step7:summary,step8Control:probe},null,2));
