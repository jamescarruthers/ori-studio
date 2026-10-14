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
