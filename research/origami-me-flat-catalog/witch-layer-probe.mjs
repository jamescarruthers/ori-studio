/** Diagnostic of archived source-13 layer picks; never edits a campaign model. */
import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const p=JSON.parse(fs.readFileSync('research/2026-10-13-origami-fold-trials/models/archive/checkpoints/witch-hat-unverified-source-13.osf'));
const d=p.workspace.foldSequences[0];const t=new Trial('witch-seed','Witch',d.paper);
for(const n of d.steps)t.add(n.op,n.note,n.choices);
const original=JSON.parse(fs.readFileSync('research/origami-me-flat-catalog/batches/witch-hat-linked-collapse-investigation.json')).tuckAttempt.op;
fs.mkdirSync('artifacts/linked-cp-collapse',{recursive:true});
const rows=[];
for(const xy of [[-.03,.75],[-.12,.73],[-.01,.84],[.01,.75]])for(let layer=0;layer<15;layer++){
 let at;try{at=t.at(xy,layer)}catch{break}
 for(const direction of ['valley','mountain']){
 const op={...original,direction,seed:{scope:'flaps',at:[at]},moving:at};
 const analysis=t.e.compound_analysis(t.state,op);
 const targets=analysis.analysis?.targets??[];
 const row={xy,layer,at,direction,analysis};rows.push(row);
 console.log(JSON.stringify({xy,layer,at,direction,moving:analysis.analysis?.moving,targets:targets.map(x=>[x.face,x.feasible]),refused:analysis.refusal}));
 for(const target of targets.filter(x=>x.feasible)){
 const candidate={...op,target:target.at};const result=t.e.apply(t.state,candidate);row.success={op:candidate,result};
 if(result.status==='ok')fs.writeFileSync(`artifacts/linked-cp-collapse/tucked-${rows.length}.json`,JSON.stringify({op:candidate,result,scene:t.e.scene(result.state)},null,2));
 }
 }
}
fs.writeFileSync('artifacts/linked-cp-collapse/all-seeds.json',JSON.stringify(rows,null,2));
