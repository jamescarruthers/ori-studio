import {modelPath} from '../origami-me-flat-catalog/model-paths.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Trial,dir} from './trial-lib.mjs';
import {completedHeart, completedSwan} from './complete-flat-designs.mjs';

// Keep exploratory files intact. Publish only the best verified path per model.
const specs=[
 {slug:'cicada',source:'cicada',title:'Cicada — completed flat sequence',status:'complete flat sequence'},
 {slug:'swan',source:'swan-reverse-alternative',complete:completedSwan,title:'Swan — completed outside-reverse sequence',status:'complete flat sequence; outside neck and head'},
 {slug:'heart',source:'heart',complete:completedHeart,title:'Heart — completed flat sequence',status:'complete flat sequence'},
 {slug:'box',source:'box',title:'Masu box — flat preparation only',status:'complete flat preparation; upright assembly deferred'},
 {slug:'crane',source:'crane-reverse-alternative',title:'Crane — flat reverse-fold alternative',status:'complete flat model; wing opening deferred'},
];
const out=path.join(dir,'models');fs.mkdirSync(out,{recursive:true});
const exports=path.join(dir,'interchange-exports');fs.mkdirSync(exports,{recursive:true});
const template=JSON.parse(fs.readFileSync(path.join(dir,'../../tests/fixtures/fold-examples/petal-fold.osf')));
for(const key of ['createdBy','modifiedBy'])template[key].savedAt='2026-10-13T00:00:00.000Z';
const docs=[];const validation=[];
const hash=(e,state)=>createHash('sha256').update(JSON.stringify(e.canonical_keys(state).sort())).digest('hex');
for(const spec of specs){
 const d=spec.complete ? spec.complete() : JSON.parse(fs.readFileSync(path.join(dir,spec.source+'.sequence.json')));
 const t=new Trial(spec.slug,spec.title,d.paper);
 const stateHashes=[];
 for(const s of d.steps.slice(0,spec.limit)){t.add(s.op,s.note,s.choices);stateHashes.push(hash(t.e,t.state));}
 const p=structuredClone(template);p.workspace.id='workspace-origami-'+spec.slug;p.workspace.title=spec.title;p.workspace.foldSequences=[t.doc];
 p.workspace.viewState={fold:{v:1,sequenceId:t.doc.id,cursor:t.doc.steps.at(-1)?.id??null,activeChild:Object.fromEntries(t.doc.steps.map(s=>[s.parent??'',s.id]))}};
 const osf=modelPath(spec.slug),serialized=JSON.stringify(p,null,2)+'\n';
 if(fs.existsSync(osf))assert.equal(fs.readFileSync(osf,'utf8'),serialized,`Preserve existing model ${osf}; save a new revision instead.`);
 fs.mkdirSync(path.dirname(osf),{recursive:true});fs.writeFileSync(osf,serialized);
 fs.copyFileSync(osf,path.join(dir,'../../tests/fixtures/fold-design-completion',spec.slug+'.osf'));
 const f=t.e.export_fold(new Uint32Array(t.states),spec.title);assert.equal(f.status,'ok');
 fs.writeFileSync(path.join(exports,spec.slug+'.fold'),JSON.stringify(JSON.parse(f.text))+'\n');
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
const bundle=path.join(out,'archive/combined/origami-trials.osf');
fs.mkdirSync(path.dirname(bundle),{recursive:true});
fs.writeFileSync(bundle,JSON.stringify(combined,null,2)+'\n');
fs.writeFileSync(path.join(dir,'validation.json'),JSON.stringify({sourceCommit:'aa736f95d126d339f70cd531b85daf60770193a3',completion:'flat-only; outside reverse and multiple-target tuck',models:validation},null,2)+'\n');
console.table(validation.map(({stateHashes,...v})=>v));
