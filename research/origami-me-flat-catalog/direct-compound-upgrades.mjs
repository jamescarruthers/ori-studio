// Existing models only: replace checked CP workarounds with direct operations.
// A changed native hash is authoritative; never regenerate over user edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
import {sameMaterial} from './bird-crow-opening.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const output=path.join(root,'artifacts/nested-reverse-crimp');fs.mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reports=[];
for(const [slug,fixtureName,source,folds] of [['dove','reverse-nested-dove',6,6],['squirrel','crimp-boundary-squirrel',26,29]]){
 const manifestFile=path.join(dir,`batches/${slug}.validation.json`),manifest=JSON.parse(fs.readFileSync(manifestFile));
 const file=path.resolve(dir,manifest.file),current=fs.readFileSync(file),checkpoint=path.resolve(dir,`../2026-10-13-origami-fold-trials/models/archive/checkpoints/${slug}-before-direct-compound.osf`);
 assert.equal(sha(current),manifest.fileSha256,'Preserve user changes: '+file);
 const oldBytes=fs.existsSync(checkpoint)?fs.readFileSync(checkpoint):current,project=JSON.parse(oldBytes),doc=project.workspace.foldSequences[0];
 const fixture=JSON.parse(fs.readFileSync(path.join(root,`tests/fixtures/fold-examples/${fixtureName}.json`)));
 assert.equal(doc.steps.length,slug==='dove'?6:34);
 const t=new Trial(slug,doc.title,doc.paper),oldStates=[t.e.sheet(doc.paper).state];
 for(const node of doc.steps){const result=t.e.apply(oldStates.at(-1),node.op,node.choices);assert.equal(result.status,'ok');oldStates.push(result.state);}
 for(const [i,node]of doc.steps.entries()){
  if(slug==='squirrel'&&i===20)t.add(fixture.op,'16: Crimp the prepared neck directly; the hinges meet at the boundary and the white head rotates up while the body stays put.',fixture.choices);
  else t.add(node.op,node.note,node.choices);
 }
 const checks=[];
 if(slug==='dove'){
  t.add(fixture.op,'6: Inside-reverse both nested flap pairs together into their own pockets.',fixture.choices);
  const control=t.e.apply(oldStates.at(-1),fixture.control);assert.equal(control.status,'ok');
  checks.push(sameMaterial(t,t.state,control.state,'Dove direct nested reverse matches independently checked CP material/order'));
 }else{
  for(let i=21;i<t.states.length;i++)checks.push(sameMaterial(t,t.states[i],oldStates[i],`Squirrel direct crimp and following node ${i} preserve every material stack`));
 }
 project.workspace.foldSequences=[t.doc];project.workspace.viewState.fold={...project.workspace.viewState.fold,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(n=>[n.parent??'',n.id]))};
 fs.writeFileSync(path.join(output,slug+'.osf'),JSON.stringify(project,null,2)+'\n');
 reports.push({slug,source,folds,nodes:t.doc.steps.length,states:t.states.length,checks,originalSha256:sha(oldBytes)});
 if(process.argv.includes('--publish')){
  assert.equal(sha(fs.readFileSync(file)),sha(current),'Preserve intervening user edits');
  if(!fs.existsSync(checkpoint))fs.writeFileSync(checkpoint,oldBytes,{flag:'wx'});
  publish(t,`https://origami.me/${slug}/`,{sourceSteps:slug==='dove'?16:26,sourceStepsCompleted:source,sourceDiagramsReviewed:slug==='dove'?17:27,allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:t.states.length,checks,audit:slug==='dove'?'Verified through source 6; later steps not authored':'Ready for audit; CP neck replaced with a direct crimp and all later states retain material/order',latestReport:'direct-compound-priorities-2026-10-14.md'});
 }
}
fs.writeFileSync(path.join(dir,'batches/direct-compound-upgrades-2026-10-14.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
