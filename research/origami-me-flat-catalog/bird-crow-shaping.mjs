// Continue the audited bird bases. All writes to native files are explicit and guarded.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {sameMaterial} from './bird-crow-opening.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const models=path.join(root,'research/2026-10-13-origami-fold-trials/models');
const output=path.join(root,'artifacts/bird-crow-investigation');
const sha=s=>createHash('sha256').update(s).digest('hex');
const apply=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2],m[3]*p[0]+m[4]*p[1]+m[5]];
const inverse=(m,p)=>{const x=p[0]-m[2],y=p[1]-m[5],d=m[0]*m[4]-m[1]*m[3];return[(m[4]*x-m[1]*y)/d,(-m[3]*x+m[0]*y)/d];};
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
function load(slug){
 const checkpoint=path.join(models,`archive/checkpoints/${slug}-before-shaping.osf`);
 const file=path.join(models,'in-progress',slug+'.osf');
 const bytes=fs.readFileSync(fs.existsSync(checkpoint)?checkpoint:file),project=JSON.parse(bytes),doc=project.workspace.foldSequences[0];
 assert.equal(doc.steps.length,24,'Start at the verified bird base');
 const t=new Trial(slug,doc.title,doc.paper);for(const n of doc.steps)t.add(n.op,n.note,n.choices);t.doc=structuredClone(doc);
 return {t,project,bytes,file,checkpoint};
}
function reverse(t,p,q,m,note,scope=1){
 const at=t.at(m),op={kind:'inside-reverse',line:{via:'free',through:[t.at(p),t.at(q)]},moving:at,seed:scope==='all'?{scope:'all'}:{scope:'depth',at,layers:scope}};
 const a=t.e.compound_analysis(t.state,op);assert.equal(a.status,'ok');
 // The central original-sheet spine separates the two halves of the folded
 // tip. Outer kite-edge openings reverse different material and are infeasible.
 const opening=a.analysis.flaps.map(f=>{
  const balanced=f.openings.filter(o=>o.upper.length===o.lower.length);
  assert.equal(balanced.length,1,'Unambiguous central packet opening');return balanced[0].stored;
 });
 t.add(op,note,{opening});
}
function crow(t){
 t.line([-.1,.5],[.1,.5],[.02,.8],'10: Lower the top front petal.',{scope:1});t.turn('11: Turn over.');
 for(const s of [-1,1]){
  const p=[0,.18],q=[s*.04,.14],m=[s*.02,.08];
  t.line(p,q,m,`${s<0?'12':'14a'}: Precrease the ${s<0?'left':'right'} foot outward. Chosen crease: 45 degrees through the center at view y=0.18.`,{kind:'precrease',scope:1});
  reverse(t,p,q,m,`${s<0?'13':'14b'}: Inside reverse the ${s<0?'left':'right'} foot between the two halves of its central spine.`);
 }
 t.line([0,.3],[0,.8],[.05,.6],'15: Fold the right half over the left along the center (instruction shown in diagram and video).');
 const p=[0,.80],q=[-.04,.83],m=[-.01,.95];
 t.line(p,q,m,'16: Precrease the head toward the left. Free proportion: center y=0.80, slope -0.75.',{kind:'precrease'});
 reverse(t,p,q,m,'17: Inside reverse the head using the central opening.','all');
 t.rotate(22.5,'Presentation: rotate counterclockwise 22.5 degrees to match the completed tutorial profile.');
}
function bird(t){
 for(const side of ['front','back']){
  t.line([0,.1],[0,.9],[-.05,.6],`12: Flip the ${side} left flap to the right.`,{scope:1});t.turn('12: Turn over to the other side.');
 }
 for(const side of ['front','back']){
  t.line([-.1,.5],[.1,.5],[.02,.15],`13: Lift the ${side} lower flap.`,{scope:1});t.turn('13: Turn over to the other side.');
 }
}
function verifyReverse(t,index){
 const before=t.e.scene(t.states[index-1]),after=t.e.scene(t.states[index]),report=t.log[index-1].result.compound;
 assert.equal(report.family,'reverse');assert.equal(report.openings.length,1);
 const ids=before.lineage.map(x=>x.id),nextIds=after.lineage.map(x=>x.id),moving=new Set(report.moving),o=report.openings[0];
 // Original-sheet material must move by exactly the intended reflection;
 // all other material stays, including the covered body and the other leg.
 let witnesses=0;
 for(const [i,f] of before.faces.entries()){
  const p=[f.outline.reduce((n,v)=>n+v.x,0)/f.outline.length,f.outline.reduce((n,v)=>n+v.y,0)/f.outline.length];
  const sheet=inverse(before.face_transforms[i],p),j=nextIds.indexOf(ids[i]);assert(j>=0);
  let expected=p;
  if(moving.has(ids[i])){
   const m=inverse(before.view_transform,p),distance=m[0]*report.line.n[0]+m[1]*report.line.n[1]-report.line.d;
   expected=apply(before.view_transform,[m[0]-2*distance*report.line.n[0],m[1]-2*distance*report.line.n[1]]);
  }
  assert(near(apply(after.face_transforms[j],sheet),expected),'Original-sheet reflection / stationary body');
  assert.equal(after.faces[j].front_up,moving.has(ids[i])?!f.front_up:f.front_up,'Physical paper side');witnesses++;
 }
 let pocketPairs=0;
 function above(a,b){for(const cell of after.subfaces){const order=cell.faces_top_to_bottom.map(i=>nextIds[i]),ia=order.indexOf(a),ib=order.indexOf(b);if(ia>=0&&ib>=0){assert(ia<ib,'Tip stays inside the correct pocket');pocketPairs++;}}}
 for(const a of o.upper_body)for(const b of o.upper)above(a,b);
 for(const a of o.lower)for(const b of o.lower_body)above(a,b);
 for(const a of o.upper)for(const b of o.lower)above(a,b);
 assert(pocketPairs>0);
 return {node:index,materialWitnesses:witnesses,pocketOrderWitnesses:pocketPairs,opening:o.stored};
}
function verify(t){
 const hashes=t.states.map(s=>sha(JSON.stringify(t.e.canonical_keys(s).sort()))),fresh=new Trial('fresh-'+t.slug,t.doc.title,t.doc.paper);
 for(const [i,n] of t.doc.steps.entries()){fresh.add(n.op,n.note,n.choices);assert.equal(sha(JSON.stringify(fresh.e.canonical_keys(fresh.state).sort())),hashes[i+1]);}
 const checks=[];
 if(t.slug==='crow'){
  for(const i of [27,29,32])checks.push(sameMaterial(t,t.states[i-1],t.states[i],`Precrease ${i} preserves every material stack`));
  for(const i of [28,30,33])checks.push(verifyReverse(t,i));
  for(const i of [28,30,31,33,34]){const s=t.e.scene(t.states[i]);assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'Colored front remains exposed');}
  for(const [index,point] of [[28,[-.18,.18]],[30,[.18,.18]]])assert(t.e.scene(t.states[index]).faces.some(f=>f.outline.some(p=>near([p.x,p.y],point))),'Foot tip reaches the diagram endpoint');
 } else {
  // Both book-fold pairs and wing lifts retain the four sheet corners, with
  // front colored wing surfaces and mirrored left/right footprint.
  for(const i of [28,32]){const s=t.e.scene(t.states[i]);assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up));}
 }
 return {nodes:t.doc.steps.length,replayedStates:hashes.length,stateHashes:hashes,checks};
}
const results=[];
for(const slug of ['crow','bird']){
 const input=load(slug),t=input.t;if(slug==='crow')crow(t);else bird(t);
 const validation=verify(t),project=structuredClone(input.project);project.workspace.foldSequences=[t.doc];
 project.workspace.viewState.fold={...project.workspace.viewState.fold,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(n=>[n.parent??'',n.id]))};
 const serialized=JSON.stringify(project,null,2)+'\n';
 fs.writeFileSync(path.join(output,slug+'.osf'),serialized);
 fs.writeFileSync(path.join(output,slug+'-shaping.json'),JSON.stringify({doc:t.doc,log:t.log,scenes:t.states.map(s=>t.e.scene(s))},null,2)+'\n');
 results.push({slug,inputSha256:sha(input.bytes),fileSha256:sha(serialized),...validation});
 if(process.argv.includes('--publish')){
  const dest=path.join(models,slug==='crow'?'completed':'in-progress',slug+'.osf');
  const current=fs.existsSync(input.file)?input.file:dest;
  const currentHash=sha(fs.readFileSync(current));assert([sha(input.bytes),sha(serialized)].includes(currentHash),'Refuse to overwrite user-edited native file');
  if(!fs.existsSync(input.checkpoint))fs.writeFileSync(input.checkpoint,input.bytes,{flag:'wx'});
  fs.writeFileSync(current,serialized);if(current!==dest)fs.renameSync(current,dest);
  const manifestFile=path.join(dir,`batches/${slug}.validation.json`),old=JSON.parse(fs.readFileSync(manifestFile));
  fs.writeFileSync(manifestFile,JSON.stringify({...old,file:path.relative(dir,dest),fileSha256:sha(serialized),nodes:t.doc.steps.length,folds:t.doc.steps.filter(n=>!['turn','rotate'].includes(n.op.kind)).length,finalFaces:t.scene().faces.length,
   stateHashes:validation.stateHashes,allStatesReplayedIdentically:true,sourceStepsCompleted:slug==='crow'?17:13,blockedAtSourceStep:null,
   audit:slug==='crow'?'Complete flat sequence ready for audit':'Verified through source 13; source 14 construction remains under investigation',
   allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:validation.replayedStates,latestReport:'bird-crow-shaping-2026-10-14.md',checks:validation.checks},null,2)+'\n');
  fs.writeFileSync(path.join(dir,`batches/${slug}.operations.json`),JSON.stringify(t.log,null,2)+'\n');
 }
}
fs.writeFileSync(path.join(output,'shaping-validation.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(({slug,nodes,replayedStates,checks})=>({slug,nodes,replayedStates,checks})),null,2));
