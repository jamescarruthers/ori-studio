import fs from 'node:fs';
import {Trial,dir,pack} from './trial-lib.mjs';
const d=JSON.parse(fs.readFileSync(`${dir}/swan.sequence.json`));
const t=new Trial('swan-reverse-alternative','Swan — reverse fold alternative',d.paper);
for(const s of d.steps.slice(0,7))t.add(s.op,s.note,s.choices);
try {
 t.line([0,.05],[0,1.35],[.02,.3],'Alternative: fold kite in half',{kind:'mountain'});
 const moving=t.at([-.015,.15]);
 const op={kind:'inside-reverse',line:{via:'free',through:[t.at([-.12,Math.SQRT1_2-.12*Math.tan(Math.PI/8)]),t.at([-.005,Math.SQRT1_2-.005*Math.tan(Math.PI/8)])]},moving,seed:{scope:'depth',at:moving,layers:1}};
 const q=t.e.compound_analysis(t.state,op);fs.writeFileSync(`${dir}/swan-alternative-choice.json`,JSON.stringify(q,null,2)+'\n');
 if(q.status!=='ok')throw new Error(JSON.stringify(q));
 const opening=q.analysis.flaps.map(f=>f.openings.reduce((best,o)=>Math.abs(o.upper.length-o.lower.length)<Math.abs(best.upper.length-best.lower.length)?o:best).stored);
 t.add(op,'Alternative: inside reverse long point to raise neck',{opening});
 const headMoving=t.at([-.48,1.18]);
 const head={kind:'inside-reverse',line:{via:'free',through:[t.at([-.4,1.062]),t.at([-.4,1.105])]},moving:headMoving,seed:{scope:'depth',at:headMoving,layers:1}};
 const h=t.e.compound_analysis(t.state,head);
 fs.writeFileSync(`${dir}/swan-head-choice.json`,JSON.stringify(h,null,2)+'\n');
 if(h.status!=='ok')throw new Error(JSON.stringify(h));
 const headOpening=h.analysis.flaps.map(f=>f.openings.reduce((best,o)=>Math.abs(o.upper.length-o.lower.length)<Math.abs(best.upper.length-best.lower.length)?o:best).stored);
 try { t.add(head,'Probe: inside reverse the tip to form the head',{opening:headOpening}); } catch {
 t.add({...head,kind:'outside-reverse'},'Alternative: outside reverse the tip to form the head (engine suggested kind)',{opening:headOpening});
 }
 t.add({kind:'rotate',rotate:{amount:'quarter',direction:'cw'}},'Orient the swan upright');
} catch(e){console.log('SWAN ALTERNATIVE',e.message);}
t.save('completed flat swan via reverse-fold alternative');pack([t]);
