import {modelFile} from './model-paths.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const folder=new URL('./',import.meta.url);
const eq=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
for(const slug of process.argv.slice(2)){
 const p=JSON.parse(fs.readFileSync(new URL(modelFile(slug),folder)));
 const doc=p.workspace.foldSequences[0],t=new Trial(slug,doc.title,doc.paper);
 for(const node of doc.steps)t.add(node.op,node.note,node.choices);
 const evidence={slug,allStatesReplayed:true};
 if(slug==='angelfish'){
  const w=[.5,-.05],first=t.at(w,0,t.states[11]),under=t.at(w,2,t.states[12]),top=t.at(w,0,t.states[12]);
  assert(eq(first,under),'First two-ply fin must remain below the second two-ply fin at their overlap');assert(eq(t.at(w,1,t.states[11]),t.at(w,3,t.states[12])));assert(!eq(first,top));
  evidence.finOverlap={viewBeforeTurn:w,firstFinOriginal:first,secondFinOriginal:top,firstFinDepthAfter:[2,3]};
 }
 if(slug==='christmas-tree'){
  const s=t.scene(),r=Math.SQRT1_2;let white=0,colored=0;
  for(const sub of s.subfaces){const y=sub.polygon.reduce((a,p)=>a+p.y,0)/sub.polygon.length,front=s.faces[sub.faces_top_to_bottom[0]].front_up;
   if(y>r+1e-8){assert(front,'Tree triangle must expose front paper');colored++;}else{if(!front)white++;}
  }
  assert(white>0&&colored>0);evidence.exposedSides={coloredTreeCells:colored,whitePlanterCells:white};
 }
 if(['angelfish','fish'].includes(slug)){
  const s=t.scene();assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'Completed fish exposes colored paper throughout');evidence.allFinalCellsColored=true;
 }
 if(slug==='pigeon'){
  const p=[.27,-.08],before=[0,1].map(i=>t.at(p,i,t.states[11])),after=[0,1,2,3].map(i=>t.at(p,i,t.states[12]));
  assert(eq(before[0],after[0])&&eq(before[1],after[3]),'Both head walls remain outside the tucked beak');
  assert(!eq(before[0],after[1])&&!eq(before[1],after[2]));
  for(const w of [[.65,.08],[.6,-.1],[.85,-.04]])assert(eq(t.at(w,0,t.states[11]),t.at(w,0,t.states[12])),'Reverse fold must preserve wing, breast and tail');
  evidence.beakPocket={view:p,before,after,insertedDepths:[1,2]};evidence.wingBreastTailMaterialUnchanged=true;
 }
 if(slug==='santa'){
  const same=(p)=>assert(eq(t.at(p,0,t.states[20]),t.at(p)),'Behind folds must preserve the front beard and collar material');
  same([.02,.9]);same([.02,1.08]);
  const s=t.scene();
  const pointIn=(p,poly)=>{let sign=0;return poly.every((a,i)=>{const b=poly[(i+1)%poly.length],c=(b.x-a.x)*(p[1]-a.y)-(b.y-a.y)*(p[0]-a.x);if(Math.abs(c)<1e-9)return true;if(sign*c<0)return false;sign=c;return true;});};
  evidence.exposedSides=[];
  for(const [name,p,colored] of [['hat',[.02,1.2],true],['coat',[.16,.8],true],['beard',[.02,.9],false],['collar',[.02,1.08],false]]){
   const cell=s.subfaces.find(c=>pointIn(p,c.polygon));assert(cell);assert.equal(s.faces[cell.faces_top_to_bottom[0]].front_up,colored,name);
   evidence.exposedSides.push({name,view:p,colored});
  }
 }
 fs.writeFileSync(new URL(`batches/${slug}.material-checks.json`,folder),JSON.stringify(evidence,null,2)+'\n');
}
