/** Explicitly opt in to publication; preserve the user's complete project. */
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

const collapseScene=t.e.scene(t.states[14]);
for(const cell of collapseScene.subfaces){
 const y=cell.polygon.reduce((sum,p)=>sum+p.y,0)/cell.polygon.length;
 assert.equal(collapseScene.faces[cell.faces_top_to_bottom[0]].front_up,y>r,'Reference exposed paper side');
}
const witnesses=[[-.13,1.03],[.14,1.02],[-.2,.8],[.21,.79],[-.1,.55],[.11,.54]];
const materialChecks=witnesses.map(point=>{
 const anchor=t.at(point,0,t.states[14]);
 for(const state of t.states.slice(15))assert(Math.hypot(...t.at(point,0,state).map((x,i)=>x-anchor[i]))<1e-8);
 return{point,exposedOriginalSheet:anchor};
});

// Only the source-verified prefix is published. Keep the rabbit-ear/tuck
// investigation separate: a matching outline did not establish its hidden order.
p.workspace.foldSequences=[t.doc];
p.workspace.title='Witch Hat — through source step 10';
p.workspace.viewState={...p.workspace.viewState,fold:{v:1,sequenceId:t.doc.id,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(s=>[s.parent??'',s.id]))}};
for(let i=d.steps.length;i<t.doc.steps.length;i++)t.doc.steps[i].expect=keyDigest(t.e.canonical_keys(t.states[i+1]).sort(),'fs1:');
const expected=t.states.map(state=>hash(JSON.stringify(t.e.canonical_keys(state).sort())));
const serialized=JSON.stringify(p,null,2)+'\n';
const check=new Trial('witch-fresh-replay',t.doc.title,t.doc.paper);
assert.equal(hash(JSON.stringify(check.e.canonical_keys(check.state).sort())),expected[0]);
for(const [i,node] of JSON.parse(serialized).workspace.foldSequences[0].steps.entries()){
 check.add(node.op,node.note,node.choices);
 assert.equal(hash(JSON.stringify(check.e.canonical_keys(check.state).sort())),expected[i+1]);
}
const file=base+'in-progress/witch-hat.osf';
const evidence={source:'https://origami.me/witch-hat/',sourceSteps:14,sourceStepsCompleted:10,blockedAtSourceStep:11,
 file:'../2026-10-13-origami-fold-trials/models/in-progress/witch-hat.osf',fileSha256:hash(serialized),nodes:t.doc.steps.length,
 folds:t.doc.steps.filter(n=>!['rotate','turn'].includes(n.op.kind)).length,finalFaces:t.scene().faces.length,
 allStatesReplayedIdentically:true,stateHashes:expected,
 blocker:'Source 11 collapse geometry/layers need further authoring verification. A rabbit-ear candidate reaches the source 13 silhouette but tested tucks of the middle ear are refused; not a confirmed engine gap.',
 audit:'New source 8–10 prefix ready for audit; tutorial not complete.',
 correction:{operation:'CreaseToggleMv',reason:'Front-relative M/V assignments for a CP drawn from the back-up reference.',originalSha256:hash(input)},
 materialChecks,
 collapse:{node:t.doc.steps[d.steps.length].id,revision,orders:opened.count,faces:picked.summary.faces},
 checks:['Source 8 colored hat and band with white lower triangle.','Source 9/10 leave geometry, exposed sides and layer order unchanged.','All 17 states replay identically in a fresh engine.']};
fs.writeFileSync('artifacts/linked-cp-collapse/witch-hat.osf',serialized);
fs.writeFileSync('artifacts/linked-cp-collapse/verified-prefix.json',JSON.stringify(evidence,null,2)+'\n');
if(process.argv.includes('--publish')){
 const previousFile='research/origami-me-flat-catalog/batches/witch-hat.validation.json';
 const previous=JSON.parse(fs.readFileSync(previousFile));
 const current=hash(fs.readFileSync(file));
 assert(current===hash(input)||current===previous.fileSha256,'Preserve new user edits');
 fs.writeFileSync(file,serialized);
 fs.writeFileSync(previousFile,JSON.stringify(evidence,null,2)+'\n');
 fs.writeFileSync('research/origami-me-flat-catalog/batches/witch-hat.operations.json',JSON.stringify(t.log,null,2)+'\n');
}
cp.free_document(h);
