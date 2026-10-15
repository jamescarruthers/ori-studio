// Read-only model reconciliation. Writes evidence, never regenerates a native file.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const prior=path.resolve(dir,'../2026-10-13-origami-fold-trials');
const hash=x=>createHash('sha256').update(x).digest('hex');
const files=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(p,e.name)):[path.join(p,e.name)]);
const inventory=[...files(dir),...files(prior)].filter(p=>!p.includes('/reconciliation-2026-10-14.json'));
const result={reviewDate:'2026-10-14',scope:'Flat single-sheet models; no required cuts or multi-sheet assembly. Native files are read only.',inventory:{files:inventory.length,json:0,nativeProjects:0,parseErrors:[]},models:[],unledgeredModels:[],notes:['Canonical replay is not a new visual audit or user approval.','Historical prototypes and combined projects under models/archive/ are inventoried, not counted as extra completed designs.']};
for(const f of inventory.filter(p=>/\.(json|osf)$/.test(p))){
 try{JSON.parse(fs.readFileSync(f,'utf8'));result.inventory[f.endsWith('.osf')?'nativeProjects':'json']++;}
 catch(e){result.inventory.parseErrors.push({file:path.relative(dir,f),error:e.message});}
}
const catalog=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json')));
const log=console.log;console.log=()=>{};
const modelRoot=path.join(prior,'models');
const ledgerFiles=new Set(catalog.designs.flatMap(e=>[e.model,...(e.additionalModels??[])]).filter(Boolean).map(f=>path.resolve(dir,f)));
for(const f of files(modelRoot).filter(p=>p.endsWith('.osf')&&!p.includes('/archive/'))){
 const bytes=fs.readFileSync(f),project=JSON.parse(bytes),slug=path.basename(f,'.osf');
 const mf=path.join(dir,`batches/${slug}.validation.json`),manifest=fs.existsSync(mf)?JSON.parse(fs.readFileSync(mf)):null;
 const item={slug,file:path.relative(dir,f),sha256:hash(bytes),manifestFileHashMatches:manifest?hash(bytes)===manifest.fileSha256:null,sequences:[]};
 if(!ledgerFiles.has(f))result.unledgeredModels.push(item.file);
 for(const d of project.workspace.foldSequences??[]){
  const t=new Trial('reconcile',d.title,d.paper),states=new Map([[null,t.state]]),keys=[];
  const key=state=>hash(JSON.stringify(t.e.canonical_keys(state).sort()));keys.push(key(t.state));
  const seq={title:d.title,nodes:d.steps.length,replayedNodes:0,failures:[],stateHashes:keys};
  for(const [i,n]of d.steps.entries()){
   const parent=states.get(n.parent??null);if(parent===undefined){seq.failures.push({index:i,id:n.id,error:'Parent missing or failed'});continue;}
   try{const r=t.e.apply(parent,n.op,n.choices);if(r.status!=='ok'){seq.failures.push({index:i,id:n.id,result:r});continue;}states.set(n.id,r.state);keys.push(key(r.state));seq.replayedNodes++;}
   catch(e){seq.failures.push({index:i,id:n.id,error:e.message});}
  }
  seq.matchesRecordedStateHashes=manifest?JSON.stringify(keys)===JSON.stringify(manifest.stateHashes):null;
  item.sequences.push(seq);
 }
 result.models.push(item);
}
console.log=log;
result.totals={nativeModelFiles:result.models.length,sequences:result.models.reduce((n,m)=>n+m.sequences.length,0),nodes:result.models.flatMap(m=>m.sequences).reduce((n,s)=>n+s.nodes,0),statesReplayed:result.models.flatMap(m=>m.sequences).reduce((n,s)=>n+s.stateHashes.length,0),failures:result.models.flatMap(m=>m.sequences).flatMap(s=>s.failures).length,hashMismatches:result.models.filter(m=>m.manifestFileHashMatches===false||m.sequences.some(s=>s.matchesRecordedStateHashes===false)).map(m=>m.file)};
fs.writeFileSync(path.join(dir,'batches/reconciliation-2026-10-14.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({inventory:result.inventory,totals:result.totals,unledgeredModels:result.unledgeredModels},null,2));
