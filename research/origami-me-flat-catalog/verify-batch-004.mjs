import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const folder=new URL('./',import.meta.url),eq=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
const hash=x=>createHash('sha256').update(x).digest('hex');
const inside=(p,poly)=>{let sign=0;return poly.every((a,i)=>{const b=poly[(i+1)%poly.length],c=(b.x-a.x)*(p[1]-a.y)-(b.y-a.y)*(p[0]-a.x);if(Math.abs(c)<1e-9)return true;if(sign*c<0)return false;sign=c;return true;});};
for(const slug of process.argv.slice(2)){
 const text=fs.readFileSync(new URL(`models/${slug}.osf`,folder)),d=JSON.parse(text).workspace.foldSequences[0];
 const manifest=JSON.parse(fs.readFileSync(new URL(`batches/${slug}.validation.json`,folder)));
 assert.equal(hash(text),manifest.fileSha256,'Retain user edits; do not validate changed files as generated.');
 const t=new Trial(slug,d.title,d.paper),states=[hash(JSON.stringify(t.e.canonical_keys(t.state).sort()))];
 for(const n of d.steps){t.add(n.op,n.note,n.choices);states.push(hash(JSON.stringify(t.e.canonical_keys(t.state).sort())));}
 assert.deepEqual(states,manifest.stateHashes);
 const evidence={slug,allStatesReplayedIdentically:true};
 if(slug==='crow'){
  const p=[-.06,.3],before=t.at(p,0,t.states[12]),after=t.at(p,0,t.states[13]);
  assert(eq(before,after),'The right kite fold preserves the folded left flap material.');
  evidence.leftKiteUnchanged={point:p,before,after};
  const s=t.scene();assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up));
  evidence.exposedPacketColored=true;
 }
 if(slug==='crab'){
  const p=[-.3,.35],before=t.at(p,0,t.states[12]),after=t.at(p,0,t.states[13]);
  assert(eq(before,after),'The first right-pocket squash preserves the exposed left panel.');
  evidence.firstSquashPreservesLeftPanel={point:p,before,after};
  const s=t.scene();evidence.paperSides=[];
  for(const [p,colored] of [[[.02,.4],true],[[-.05,.12],false],[[.05,.12],false]]){
   const cell=s.subfaces.find(c=>inside(p,c.polygon));assert(cell);assert.equal(s.faces[cell.faces_top_to_bottom[0]].front_up,colored);
   evidence.paperSides.push({point:p,colored,originalSheetPoint:t.at(p)});
  }
 }
 if(slug==='chicken'){
  assert.equal(t.e.scene(t.states[8]).crease_marks.length,8,'Two two-ply pinches plus four-ply partial reference retained.');
  evidence.partialMarks=8;
  const p=[.17,.9],before=Array.from({length:8},(_,i)=>t.at(p,i,t.states[10])),after=Array.from({length:16},(_,i)=>t.at(p,i));
  for(let i=0;i<4;i++){assert(eq(before[i],after[i]));assert(eq(before[i+4],after[i+12]));}
  evidence.insideFeetStack={point:p,before,after,oldWallsAtDepth:[0,1,2,3,12,13,14,15]};
  for(let i=0;i<8;i++)assert(eq(t.at([.1,1.15],i,t.states[10]),t.at([.1,1.15],i)),'Feet reversal preserves all upper-body layers.');
  evidence.upperBodyUnchanged=true;
 }
 if(slug==='camellia'){
  evidence.unchangedOverlap=[];
  for(const p of [[-.4,.23],[-.2,.6]]){
   const before=t.at(p,0,t.states[6]),after=t.at(p);
   assert(eq(before,after),'Reverse-fold closure preserves the bottom and right outer panels.');
   evidence.unchangedOverlap.push({point:p,before,after});
  }
  const s=t.scene();assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'The closed packet is colored across its exposed face.');
  evidence.exposedPacketColored=true;
 }
 if(slug==='4-pointed-star'){
  const marks=t.e.scene(t.states[12]).crease_marks;
  assert.equal(marks.length,8,'All eight partial precreases retained as marks.');
  evidence.partialCreases=marks;
  const s=t.scene();
  for(const p of [[-.8,.6],[-.4,.6],[-.8,.2],[-.4,.2]]){
   const cell=s.subfaces.find(c=>inside(p,c.polygon));assert(cell);
   assert.equal(s.faces[cell.faces_top_to_bottom[0]].front_up,false,'Four exposed panels white after turnover.');
  }
  evidence.allFourPanelsWhite=true;
 }
 if(slug==='pentagon-from-square-paper'){
  const marks=t.e.scene(t.states[3]).crease_marks;
  assert.equal(marks.length,2);
  assert(marks.every(m=>m.from.y<.5&&m.to.y<.5),'Reference pinches stay on the folded-up front ply, not the stationary back ply.');
  evidence.frontPlyOnlyReferenceMarks=marks;
 }
 if(slug==='rectangle-to-hexagon'){
  const marks=t.e.scene(t.states[2]).crease_marks;
  assert.equal(marks.length,1);
  assert(Math.abs(marks[0].from.y-Math.SQRT1_2/4)<1e-8);
  evidence.quarterHeightPartialMark=marks;
 }
 if(slug==='goldfish'){
  evidence.horns=[];
  for(const p of [[-.2,.58],[.2,.58]]){
   const before=t.at(p,0,t.states[9]),after=t.at(p);
   assert(eq(before,after),'Hem and back folds preserve both horn materials.');
   evidence.horns.push({point:p,before,after});
  }
  const s=t.scene();
  const band=s.subfaces.find(c=>inside([.02,.4],c.polygon));
  assert.equal(s.faces[band.faces_top_to_bottom[0]].front_up,false);
  evidence.bandStaysWhite=true;
 }
 if(slug.startsWith('ninja-star-')){
  const p=slug.endsWith('a')?[-.45,.57]:[-.8,.57];
  const before=t.at(p,0,t.states[8]),after=t.at(p,0,t.states[9]);
  assert(eq(before,after),'Folding the lower tip must preserve the already folded upper tip.');
  evidence.upperTipUnchanged={point:p,before,after};
  const scene=t.scene();
  assert(scene.subfaces.every(cell=>scene.faces[cell.faces_top_to_bottom[0]].front_up),'Both modules must show colored paper throughout.');
  evidence.allExposedSubfacesColored=true;
 }
 if(slug==='penguin'){
  const p=[.05,1.035],before=[0,1].map(i=>t.at(p,i,t.states[10])),after=[0,1,2,3].map(i=>t.at(p,i));
  assert(eq(before[0],after[1])&&eq(before[1],after[2]),'Outside head wraps around both original neck walls.');
  assert(!eq(before[0],after[0])&&!eq(before[1],after[3]));
  const s=t.scene();evidence.paperSides=[];
  for(const [label,p,colored] of [['chest',[.03,.7],false],['wing',[.2,.7],true],['head',[.05,1.035],true]]){
   const cell=s.subfaces.find(c=>inside(p,c.polygon));assert(cell,label);assert.equal(s.faces[cell.faces_top_to_bottom[0]].front_up,colored,label);
   evidence.paperSides.push({label,point:p,colored});
   if(label!=='head')assert(eq(t.at(p),t.at(p,0,t.states[10])),'Head fold must preserve body material.');
  }
  evidence.outsideHeadStack={point:p,before,after,oldWallsAtDepth:[1,2]};
 }
 fs.writeFileSync(new URL(`batches/${slug}.material-checks.json`,folder),JSON.stringify(evidence,null,2)+'\n');
}
