/** Diagnostic only: writes scratch evidence, never a campaign model. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import * as cp from '../../apps/web/src/generated/oristudio-cp-wasm/oristudio_cp_wasm.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const {keyDigest}=await import('data:text/javascript,'+encodeURIComponent(ts.transpile(fs.readFileSync('apps/web/src/lib/keyDigest.ts','utf8'),{module:ts.ModuleKind.ESNext})));
cp.initSync({module:fs.readFileSync('apps/web/src/generated/oristudio-cp-wasm/oristudio_cp_wasm_bg.wasm')});
fs.mkdirSync('artifacts/linked-cp-collapse',{recursive:true});
const base='research/2026-10-13-origami-fold-trials/models/';
const checkpoint=base+'archive/checkpoints/witch-hat-before-linked-collapse.osf';
const input=fs.readFileSync(checkpoint);
assert.equal(hash(input),'393e372da04d78201012f0dec2d436b61505c2f390ce608c682fe8d803fecce9');
const p=JSON.parse(input),d=p.workspace.foldSequences[0];
const t=new Trial('witch-hat','Witch Hat — Origami.me',d.paper);
for(const n of d.steps)t.add(n.op,n.note,n.choices);
t.doc=structuredClone(d);t.doc.title='Witch Hat — Origami.me';
const h=cp.load_document(p.workspace.creasePattern.creasePattern.document);
// User CP was lettered from the back-up diagram. The import's letters are
// front-relative. This is the same Toggle Mountain/Valley command Edit offers.
const ids=p.workspace.creasePattern.creasePattern.document.crease_pattern.line_segments.map((_,i)=>i+1);
const correction=cp.execute_cp_command(h,'CreaseToggleMv',{line_ids:ids});
assert.equal(correction.status,'OracleTested');
p.workspace.creasePattern.creasePattern.document=cp.document_snapshot(h);
const model=p.workspace.creasePattern.creasePattern.document.crease_pattern;
const revision=keyDigest([...model.line_segments,...model.aux_line_segments].map(({a,b,color,fold_magnitude,fold_direction_hint})=>canonical({a,b,color,fold_magnitude,fold_direction_hint})).sort(),'collapse-cp1:');
const source=cp.export_fold_file(h,new Uint32Array());
const opened=t.e.import_cp({format:'fold'},new TextEncoder().encode(source),{kind:'after',state:t.state},{});
assert.equal(opened.status,'ok');assert.equal(opened.count.orders,1);
const picked=t.e.import_pick(opened.import,new Uint32Array(opened.components.map(()=>0)));
assert.equal(picked.status,'ok');
t.add({...picked.op,origin:'project_cp',source:{documentId:p.workspace.creasePattern.id,revision}},'8: Collapse along the linked project CP. The saved source uses front-relative M/V assignments (Toggle Mountain/Valley correction from the back-up drawing); unique flat layer order.');
assert.deepEqual(t.e.canonical_keys(t.state).sort(),t.e.canonical_keys(picked.state).sort());
const r=Math.SQRT1_2,k=Math.SQRT2-1,bottom=r-k;
console.log('bounds',t.bounds());
// Angle bisectors of the lower white right triangle, exactly as the two
// edge-to-boundary preparations in source 9 and 10.
const hinge=r-k*(Math.SQRT2-1);
t.line([-k,r],[0,hinge],[-.1,.5],'9: Precrease the left lower edge onto the color boundary.',{kind:'precrease'});
t.line([k,r],[0,hinge],[.1,.5],'10: Precrease the right lower edge onto the color boundary.',{kind:'precrease'});
t.line([-k,r],[k,r],[.01,.5],'11 preparation: Precrease the color boundary to bound the lower triangular flap; this is also the final brim hinge.',{kind:'precrease'});
fs.writeFileSync('artifacts/linked-cp-collapse/before-ear.json',JSON.stringify(t.e.export_fold(new Uint32Array([t.state])),null,2));
const op={kind:'rabbit-ear',corners:[[-k,r],[k,r],[0,bottom]].map(pt=>t.at(pt)),emergent:[0,-1],seed:{scope:'flaps',at:[t.at([.01,.5])]},stayer:t.at([0,.68]),direction:'valley'};
const probe=t.e.apply(t.state,op);
console.log('rabbit',JSON.stringify(probe));

fs.writeFileSync('artifacts/linked-cp-collapse/witch-authoring.json',JSON.stringify({correction,opened,op,result:probe,steps:t.doc.steps,scene:t.scene(),after:probe.status==='ok'?t.e.scene(probe.state):null},null,2));

assert.equal(probe.status,'ok');
t.add(op,'11: Collapse the precreased lower triangle as a rabbit ear and lay its middle flap to the left.');
const trim=.06,si=Math.sin(Math.PI/8),co=Math.cos(Math.PI/8);
for(const side of [-1,1]) t.line([side*(k-trim*si),r+trim*co],[side*(k-trim*co),r-trim*si],[side*(k-.01),r],`12: Fold the ${side<0?'left':'right'} brim corner inward. The tutorial gives an approximate amount; use 0.06 sheet units along each edge.`);
t.line([-.3,r],[.3,r],[.02,.60],'13: Fold the bottom corner up along the original color boundary.');
fs.writeFileSync('artifacts/linked-cp-collapse/brim.json',JSON.stringify({steps:t.doc.steps,scene:t.scene()},null,2));
p.workspace.foldSequences=[t.doc];p.workspace.viewState={...p.workspace.viewState,fold:{v:1,sequenceId:t.doc.id,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(s=>[s.parent??'',s.id]))}};
fs.writeFileSync('artifacts/linked-cp-collapse/witch-hat.osf',JSON.stringify(p,null,2)+'\n');
const tuckPoint=[-.03,.75],wallPoint=[-.12,.84];
const tuckOp={kind:'tuck',direction:'valley',line:{via:'free',through:[t.at([-(r-hinge),r]),t.at([0,2*r-hinge])]},seed:{scope:'flaps',at:[t.at(tuckPoint,2)]},moving:t.at(tuckPoint,2),target:t.at(wallPoint,2)};
const tuckResult=t.e.tuck(t.state,tuckOp);console.log('tuck',JSON.stringify(tuckResult));
fs.writeFileSync('artifacts/linked-cp-collapse/tuck-probe.json',JSON.stringify({op:tuckOp,result:tuckResult,wallPoint,wallAnchors:[0,1,2,3].map(n=>t.at(wallPoint,n))},null,2));
const analysis=t.e.compound_analysis(t.state,tuckOp);fs.writeFileSync('artifacts/linked-cp-collapse/tuck-analysis.json',JSON.stringify(analysis,null,2));console.log('tuck analysis',JSON.stringify(analysis).slice(0,2500));
const probes=[];
for(const depth of [0,1]){const candidate={...tuckOp,target:t.at(wallPoint,depth)};const result=t.e.tuck(t.state,candidate);probes.push({label:`wall ${depth}`,op:candidate,result});console.log('wall',depth,JSON.stringify(result).slice(0,700));}
const both={...tuckOp,target:t.at(wallPoint,0),additionalTargets:[t.at(wallPoint,1)]};const bothResult=t.e.tuck(t.state,both);probes.push({label:'both walls',op:both,result:bothResult});console.log('both',JSON.stringify(bothResult).slice(0,700));
fs.writeFileSync('artifacts/linked-cp-collapse/tuck-probes.json',JSON.stringify(probes,null,2));
for(const depth of [0,1,2,3]){const candidate={...tuckOp,direction:'mountain',target:t.at(wallPoint,depth)};const result=t.e.tuck(t.state,candidate);probes.push({label:`mountain wall ${depth}`,op:candidate,result});console.log('mountain wall',depth,JSON.stringify(result).slice(0,1000));}
fs.writeFileSync('artifacts/linked-cp-collapse/tuck-probes.json',JSON.stringify(probes,null,2));
const pocket={...tuckOp,target:t.at([-.12,.76],0),additionalTargets:[t.at(wallPoint,0)]};const pocketResult=t.e.tuck(t.state,pocket);probes.push({label:'brim and raised lower flap',op:pocket,result:pocketResult});console.log('pocket',JSON.stringify(pocketResult).slice(0,2000));
fs.writeFileSync('artifacts/linked-cp-collapse/tuck-probes.json',JSON.stringify(probes,null,2));
for(const seedLayer of [1,2,3]){const at=t.at(tuckPoint,seedLayer);const candidate={...pocket,seed:{scope:'flaps',at:[at]},moving:at};const result=t.e.tuck(t.state,candidate);probes.push({label:`ear seed ${seedLayer}`,op:candidate,result});console.log('ear seed',seedLayer,JSON.stringify(result).slice(0,700));}
fs.writeFileSync('artifacts/linked-cp-collapse/tuck-probes.json',JSON.stringify(probes,null,2));
