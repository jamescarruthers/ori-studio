import fs from 'node:fs';
import {Trial,dir} from './trial-lib.mjs';
function replay(slug){const d=JSON.parse(fs.readFileSync(`${dir}/${slug}.sequence.json`));const t=new Trial(slug,d.title,d.paper);for(const s of d.steps)t.add(s.op,s.note,s.choices);return t;}
const probes=[];
function probe(t,label,op){let analysis,applied;try{analysis=t.e.compound_analysis(t.state,op);applied=t.e.apply(t.state,op);}catch(e){applied={status:'thrown',error:e};}probes.push({model:t.slug,label,parentStep:t.doc.steps.at(-1).id,op,analysis,applied});console.log(t.slug,label,JSON.stringify(applied));}
const swan=replay('swan');
const target={via:'free',through:[swan.at([-.18,1.03]),swan.at([-.08,.93])]};
const neckEdge=swan.at([-.10,Math.SQRT2-.1/Math.tan(Math.PI/16)]);
for(const [label,fold] of [['neck spine',[.35,.35]],['neck root',[.44,.56]]])for(const direction of ['valley','mountain'])for(const swivel of ['open','inside']){
 probe(swan,`9: ${label}, ${swivel}, ${direction}`,{kind:'swivel',via:'edge',fold,edge:neckEdge,target,direction,...(swivel==='inside'?{swivel}:{})});
}
const crane=replay('crane');
try {
 const target={via:'free',through:[crane.at([-.1,.7]),crane.at([-.05,.65])]};
 const edge=[.25,.04972809184491499];
 for(const direction of ['valley','mountain'])for(const swivel of ['open','inside']){
  probe(crane,`24: tail outward, ${swivel}, ${direction}`,{kind:'swivel',via:'edge',fold:[.5,.04972809184491499],edge,target,direction,...(swivel==='inside'?{swivel}:{})});
 }
}catch(e){probes.push({model:'crane',pickingError:e.message});}
fs.writeFileSync(`${dir}/compound-probes.json`,JSON.stringify(probes,null,2)+'\n');
