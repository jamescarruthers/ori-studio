import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Trial,dir} from './trial-lib.mjs';

// Keep exploratory files intact. Publish only the best verified path per model.
const specs=[
 {slug:'cicada',source:'cicada',title:'Cicada — completed flat sequence',status:'complete flat sequence'},
 {slug:'swan',source:'swan-reverse-alternative',title:'Swan — reverse-fold alternative',status:'complete flat alternative'},
 {slug:'heart',source:'heart',limit:9,title:'Heart — partial through source step 7',status:'partial; pocket opening unresolved'},
 {slug:'box',source:'box',title:'Masu box — flat preparation only',status:'partial; upright walls unavailable in flat state'},
 {slug:'crane',source:'crane-reverse-alternative',title:'Crane — flat reverse-fold alternative',status:'complete flat alternative; 3D opening excluded'},
];
const out=path.join(dir,'models');fs.mkdirSync(out,{recursive:true});
const template=JSON.parse(fs.readFileSync(path.join(dir,'../../tests/fixtures/fold-examples/petal-fold.osf')));
for(const key of ['createdBy','modifiedBy'])template[key].savedAt='2026-10-13T00:00:00.000Z';
const docs=[];const validation=[];
const hash=(e,state)=>createHash('sha256').update(JSON.stringify(e.canonical_keys(state).sort())).digest('hex');
for(const spec of specs){
 const d=JSON.parse(fs.readFileSync(path.join(dir,spec.source+'.sequence.json')));
 const t=new Trial(spec.slug,spec.title,d.paper);
 const stateHashes=[];
 for(const s of d.steps.slice(0,spec.limit)){t.add(s.op,s.note,s.choices);stateHashes.push(hash(t.e,t.state));}
 const p=structuredClone(template);p.workspace.id='workspace-origami-'+spec.slug;p.workspace.title=spec.title;p.workspace.foldSequences=[t.doc];
 p.workspace.viewState={fold:{v:1,sequenceId:t.doc.id,cursor:t.doc.steps.at(-1)?.id??null,activeChild:Object.fromEntries(t.doc.steps.map(s=>[s.parent??'',s.id]))}};
 const osf=path.join(out,spec.slug+'.osf');fs.writeFileSync(osf,JSON.stringify(p,null,2)+'\n');
 const f=t.e.export_fold(new Uint32Array(t.states),spec.title);assert.equal(f.status,'ok');
 fs.writeFileSync(path.join(out,spec.slug+'.fold'),JSON.stringify(JSON.parse(f.text))+'\n');
 const exported=JSON.parse(f.text);assert.equal(exported.file_frames.length,t.states.length);
 // Reopen the serialized native file in a fresh engine, including every stored choice.
 const reopened=JSON.parse(fs.readFileSync(osf));const check=new Trial('check',spec.title,d.paper);
 for(const [i,s]of reopened.workspace.foldSequences[0].steps.entries()){
  assert.equal(s.parent,i===0?null:reopened.workspace.foldSequences[0].steps[i-1].id);
  check.add(s.op,s.note,s.choices);assert.equal(hash(check.e,check.state),stateHashes[i]);
 }
 docs.push(t.doc);validation.push({model:spec.slug,status:spec.status,source:spec.source+'.sequence.json',nodes:t.doc.steps.length,folds:t.doc.steps.filter(s=>!['turn','rotate'].includes(s.op.kind)).length,finalFaces:t.scene().faces.length,foldFrames:exported.file_frames.length,allStatesReplayedIdentically:true,stateHashes});
}
const combined=structuredClone(template);combined.workspace.id='workspace-origami-trials';combined.workspace.title='Origami.me — five Fold workspace trials';combined.workspace.foldSequences=docs;
const first=docs[0];combined.workspace.viewState={fold:{v:1,sequenceId:first.id,cursor:first.steps.at(-1).id,activeChild:Object.fromEntries(first.steps.map(s=>[s.parent??'',s.id]))}};
fs.writeFileSync(path.join(out,'origami-trials.osf'),JSON.stringify(combined,null,2)+'\n');
fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify({sourceCommit:'ad3b1265b1cb37d7d7bb708a04a7d76463b0c89d',models:validation},null,2)+'\n');
console.table(validation.map(({stateHashes,...v})=>v));
