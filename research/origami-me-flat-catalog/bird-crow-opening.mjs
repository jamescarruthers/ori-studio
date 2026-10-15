// Reproduce F020 from saved native prefixes. Publishing is explicit and hash guarded.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Trial } from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
const output=path.join(root,'artifacts/bird-crow-investigation');
fs.mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const a=Math.SQRT1_2-.5;
export function load(slug){
 const file=path.join(dir,`../2026-10-13-origami-fold-trials/models/in-progress/${slug}.osf`);
 const checkpoint=path.join(dir,`../2026-10-13-origami-fold-trials/models/archive/checkpoints/${slug}-before-opening.osf`);
 const bytes=fs.readFileSync(fs.existsSync(checkpoint)?checkpoint:file),project=JSON.parse(bytes),doc=project.workspace.foldSequences[0];
 const t=new Trial(slug,doc.title,doc.paper);
 for(const n of doc.steps)t.add(n.op,n.note,n.choices);
 t.doc=structuredClone(doc);
 return {t,file,bytes,project,checkpoint,sha256:sha(bytes)};
}
function unfold(t,crease,moving,note,layers=1){
 const at=t.at(moving);
 t.add({kind:'unfold',crease:t.at(crease),moving:at,seed:{scope:'depth',at,layers},direction:'valley'},note);
}
export function opening(t){
 unfold(t,[.1,.5],[.03,.4],'7a: Lift the top triangle temporarily to release the side flaps (as shown in the tutorial video).');
 for(const sign of [-1,1])unfold(t,[sign*a/2,.25],[sign*.07,.3],`7${sign<0?'b':'c'}: Reopen the ${sign<0?'left':'right'} lower kite flap along its existing crease.`);
 t.line([-a,.5],[a,.5],[.01,.65],'7d: Lower the top triangle again; this is the flat endpoint shown before the petal fold.',{scope:'all'});
 // The existing petal operation starts with its hinge flat, not with the
 // triangle covering it. The source video lifts this triangle with the petal.
 unfold(t,[.1,.5],[.03,.4],'8a: Open the top triangle along the petal hinge before lifting the front flap.');
 t.add({kind:'petal',ends:[t.at([-a,.5]),t.at([a,.5])],petal:t.at([.02,.2]),direction:'valley'},'8b: Lift the lower front flap and collapse the existing kite creases into the first petal.');
}
export function birdBase(t,slug){
 t.turn(slug==='bird'?'9: Turn over.':'9a: Turn over to repeat the petal on the other side.');
 for(const sign of [-1,1])t.line([0,0],[sign*a,.5],[sign*.3,.35],`${slug==='bird'?'10':'9'}${slug==='bird'?(sign<0?'a':'b'):(sign<0?'b':'c')}: Precrease the lower ${sign<0?'left':'right'} edge to the center.`,{kind:'precrease',scope:1});
 t.add({kind:'petal',ends:[t.at([-a,.5]),t.at([a,.5])],petal:t.at([.02,.2]),direction:'valley'},`${slug==='bird'?'11':'9d'}: Petal fold the lower front flap upward to complete the bird base.`);
}
export function dump(t,name){
 fs.writeFileSync(path.join(output,`${name}.json`),JSON.stringify({doc:t.doc,log:t.log,scenes:t.states.map(h=>t.e.scene(h)),stateHashes:t.states.map(h=>sha(JSON.stringify(t.e.canonical_keys(h).sort())))},null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 for(const slug of ['bird','crow']){
  const {t,sha256}=load(slug);
  assert.equal(t.doc.steps.length,14,'Investigate from the unchanged source-6 prefix');
  try{opening(t);birdBase(t,slug);}catch(e){console.log(slug,e.message);}
  dump(t,slug+'-continued');
  console.log(JSON.stringify({slug,inputSha256:sha256,nodes:t.doc.steps.length,last:t.doc.steps.at(-1).note}));
 }
}

// Material stacks, not just silhouettes: compare independently constructed
// endpoints while allowing different topology subdivisions from precreases.
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
const inside=(p,poly)=>{
 const signs=poly.map((v,i)=>{const w=poly[(i+1)%poly.length];return(w.x-v.x)*(p[1]-v.y)-(w.y-v.y)*(p[0]-v.x);});
 return signs.every(x=>x>=-1e-9)||signs.every(x=>x<=1e-9);
};
function stack(t,state,p){
 const scene=t.e.scene(state),cell=scene.subfaces.find(c=>inside(p,c.polygon));
 if(!cell)return [];
 return cell.faces_top_to_bottom.map((f,i)=>({sheet:t.at(p,i,state),front:scene.faces[f].front_up}));
}
export function sameMaterial(t,left,right,label){
 const scenes=[t.e.scene(left),t.e.scene(right)];
 const points=scenes.flatMap(s=>s.subfaces.map(c=>[0,1].map(i=>c.polygon.reduce((sum,v)=>sum+(i?v.y:v.x),0)/c.polygon.length)));
 // Offset centroids if they happen to hit a boundary in the other subdivision.
 const safe=points.map(p=>p.map((v,i)=>v+(i?2:1)*1e-7));
 for(const p of safe){
  const a=stack(t,left,p),b=stack(t,right,p);
  assert.equal(a.length,b.length,label+': stack depth at '+p);
  assert(a.every((v,i)=>v.front===b[i].front&&near(v.sheet,b[i].sheet)),label+': ordered sheet material at '+p);
 }
 return {label,witnesses:safe.length};
}
export function verify(t){
 const checks=[];
 checks.push(sameMaterial(t,t.states[13],t.states[15],'Lifting triangle restores the source-5 packet, including order'));
 checks.push(sameMaterial(t,t.states[11],t.states[17],'Opening both sides restores the square-base material stacks'));
 checks.push(sameMaterial(t,t.states[17],t.states[19],'Lifting triangle before petal restores the open top'));
 const restore=t.state; t.state=t.states[11];
 const seed=t.at([.01,.65]);const folded=t.e.apply(t.state,{kind:'valley',line:{via:'free',through:[t.at([-a,.5]),t.at([a,.5])]},moving:seed,seed:{scope:'all'}});
 assert.equal(folded.status,'ok');checks.push(sameMaterial(t,folded.state,t.states[18],'Source-7 endpoint matches folding only the top of the square base'));
 const petal=t.e.apply(t.state,{kind:'petal',ends:[t.at([-a,.5]),t.at([a,.5])],petal:t.at([.02,.2]),direction:'valley'});
 assert.equal(petal.status,'ok');checks.push(sameMaterial(t,petal.state,t.states[20],'First petal matches a direct canonical square-base petal'));
 const turned=t.e.apply(petal.state,{kind:'turn',axis:'vertical'});assert.equal(turned.status,'ok');t.state=turned.state;
 const other=t.e.apply(t.state,{kind:'petal',ends:[t.at([-a,.5]),t.at([a,.5])],petal:t.at([.02,.2]),direction:'valley'});
 assert.equal(other.status,'ok');checks.push(sameMaterial(t,other.state,t.states[24],'Completed base matches two direct petals, including hidden stacks'));
 t.state=restore;
 for(const index of [18,20,21,24]){
  const s=t.e.scene(t.states[index]);assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'Colored front remains exposed at '+index);
 }
 return checks;
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv.includes('--verify')){
 const audit={date:'2026-10-14',finding:'F020',models:[]};
 for(const slug of ['bird','crow']){
  const input=load(slug),t=input.t;opening(t);birdBase(t,slug);
  const checks=verify(t),fresh=new Trial('fresh-'+slug,t.doc.title,t.doc.paper),hashes=[];
  for(const [i,n] of t.doc.steps.entries()){
   fresh.add(n.op,n.note,n.choices);
   const expected=sha(JSON.stringify(t.e.canonical_keys(t.states[i+1]).sort())),actual=sha(JSON.stringify(fresh.e.canonical_keys(fresh.state).sort()));
   assert.equal(actual,expected,'Every operation freshly replayed');hashes.push(expected);
  }
  audit.models.push({slug,inputSha256:input.sha256,nodes:t.doc.steps.length,checks,replayedStates:hashes.length+1,stateHashes:[sha(JSON.stringify(t.e.canonical_keys(t.states[0]).sort())),...hashes]});
  const project=structuredClone(input.project);project.workspace.foldSequences=[t.doc];
  project.workspace.viewState.fold={...project.workspace.viewState.fold,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(n=>[n.parent??'',n.id]))};
  const serialized=JSON.stringify(project,null,2)+'\n';
  fs.writeFileSync(path.join(output,slug+'.osf'),serialized);
  if(process.argv.includes('--publish')){
   assert.equal(sha(fs.readFileSync(input.file)),input.sha256,'Preserve any intervening user edit');
   if(!fs.existsSync(input.checkpoint))fs.writeFileSync(input.checkpoint,input.bytes,{flag:'wx'});
   fs.writeFileSync(input.file,serialized);
   const manifestFile=path.join(dir,`batches/${slug}.validation.json`);
   const old=JSON.parse(fs.readFileSync(manifestFile));
   fs.writeFileSync(manifestFile,JSON.stringify({...old,fileSha256:sha(serialized),nodes:t.doc.steps.length,
    folds:t.doc.steps.filter(n=>!['turn','rotate'].includes(n.op.kind)).length,finalFaces:t.scene().faces.length,
    stateHashes:audit.models.at(-1).stateHashes,allStatesReplayedIdentically:true,
    sourceStepsCompleted:slug==='bird'?11:9,blockedAtSourceStep:null,
    audit:'Verified prefix ready for audit; shared opening resolved; final design unfinished',
    allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:25,
    latestReport:'bird-crow-opening-2026-10-14.md',checks,
   },null,2)+'\n');
   fs.writeFileSync(path.join(dir,`batches/${slug}.operations.json`),JSON.stringify(t.log,null,2)+'\n');
  }
 }
 assert.deepEqual(audit.models[0].stateHashes,audit.models[1].stateHashes,'Both native models reproduce exactly the same shared states');
 fs.writeFileSync(path.join(dir,'batches/bird-crow-opening-2026-10-14.json'),JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify(audit.models.map(({slug,nodes,checks,replayedStates})=>({slug,nodes,checks,replayedStates})),null,2));
}
