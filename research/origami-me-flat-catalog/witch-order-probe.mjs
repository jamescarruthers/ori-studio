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

const cpFold=JSON.parse(t.e.export_fold(new Uint32Array([t.state])).text);
const cpUnknown={file_spec:1.1,vertices_coords:cpFold.vertices_coords,edges_vertices:[],edges_assignment:[]};
cpFold.edges_vertices.forEach((edge,i)=>{const a=cpFold.edges_assignment[i];if(!['B','M','V'].includes(a))return;cpUnknown.edges_vertices.push(edge);const pts=edge.map(j=>cpFold.vertices_coords[j]);const sum=pts.reduce((s,p)=>s+p[0]-p[1],0)/2;cpUnknown.edges_assignment.push(a!=='B'&&sum < -165.685425+1e-6?'U':a);});
const different=t.e.import_cp({format:'fold'},new TextEncoder().encode(JSON.stringify(cpUnknown)),{kind:'after',state:t.states[17]},{});console.log('orders',JSON.stringify(different));
fs.writeFileSync('artifacts/linked-cp-collapse/order-opened.json',JSON.stringify(different,null,2));

if(different.status==='ok')for(let order=0;order<4;order++){
 const choice=[order%2,Math.floor(order/2)];
 const pick=t.e.import_pick(different.import,new Uint32Array(choice));
 if(pick.status!=='ok')continue;
 const q=new Trial('witch-probe','Witch',d.paper);
 for(const n of t.doc.steps.slice(0,17))q.add(n.op,n.note,n.choices);
 q.add(pick.op,'11: CP collapse, order '+choice);
 const trim=.06,si=Math.sin(Math.PI/8),co=Math.cos(Math.PI/8);
 for(const side of [-1,1])q.line([side*(k-trim*si),r+trim*co],[side*(k-trim*co),r-trim*si],[side*(k-.01),r],'12: Corner');
 q.line([-.3,r],[.3,r],[.02,.60],'13: Brim up');
 const example=JSON.parse(fs.readFileSync('research/origami-me-flat-catalog/batches/witch-hat-linked-collapse-investigation.json')).tuckAttempt.op;
 const result=q.e.tuck(q.state,example);
 const analyse=q.e.compound_analysis(q.state,example);
 fs.writeFileSync(`artifacts/linked-cp-collapse/order-${order}.json`,JSON.stringify({choice,pick,scene:q.scene(),steps:q.doc.steps,result,analyse},null,2));
 console.log('order tuck',choice,JSON.stringify(result).slice(0,700));
}
