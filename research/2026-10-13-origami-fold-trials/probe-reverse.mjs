import fs from 'node:fs';
import {Trial,dir,pack} from './trial-lib.mjs';
const d=JSON.parse(fs.readFileSync(`${dir}/crane.sequence.json`));
const t=new Trial('crane-reverse-alternative','Crane — reverse fold alternative',d.paper);
for(const s of d.steps.slice(0,18))t.add(s.op,s.note,s.choices);
try {
 t.line([-.07,.5-.07*Math.tan(Math.PI/8)],[-.005,.5-.005*Math.tan(Math.PI/8)],[-.008,.1],'Alternative 24: lift left point with inside reverse',{kind:'inside-reverse',scope:1});
 t.line([.005,.5-.005*Math.tan(Math.PI/8)],[.07,.5-.07*Math.tan(Math.PI/8)],[.008,.1],'Alternative 25: lift right point with inside reverse',{kind:'inside-reverse',scope:1});
}catch(e){console.log('ALTERNATE',e.message);}
t.save('alternative route probe');
const op=t.log.at(-1).op;
const answer=t.e.compound_analysis(t.state,op);
fs.writeFileSync(`${dir}/reverse-choice.json`,JSON.stringify(answer,null,2)+'\n');
console.log(JSON.stringify(answer).slice(0,8000));
if(answer.status==='ok' && answer.analysis?.flaps?.length){
 const flap=answer.analysis.flaps[0];
 const centered=flap.openings.find(o=>Math.abs(Math.abs(o.spine.n[0])-Math.SQRT1_2)<1e-6);
 if(centered){try {t.add(op,'Alternative 24: inside reverse using central spine opening',{opening:[centered.stored]});}catch(e){console.log('CENTERED',e.message);}}
 t.save('alternative central opening probe');
}
try {
 const a=t.at([.005,.5-.005*Math.tan(Math.PI/8)]), b=t.at([.07,.5-.07*Math.tan(Math.PI/8)]),moving=t.at([.008,.1]);
 const op2={kind:'inside-reverse',line:{via:'free',through:[a,b]},moving,seed:{scope:'depth',at:moving,layers:1}};
 const q=t.e.compound_analysis(t.state,op2);
 const o=q.analysis.flaps[0].openings.find(o=>Math.abs(Math.abs(o.spine.n[0])-Math.SQRT1_2)<1e-6);
 t.add(op2,'Alternative 25: inside reverse the right point',{opening:[o.stored]});
} catch(e){console.log('OTHER',e.message);}
t.save('both reverse points attempted');
console.log('BOUNDS',t.bounds());
pack([t]);
try {
 const a=t.at([-.310,.79]),b=t.at([-.291,.79]),moving=t.at([-.338,.835]);
 const head={kind:'inside-reverse',line:{via:'free',through:[a,b]},moving,seed:{scope:'depth',at:moving,layers:1}};
 const q=t.e.compound_analysis(t.state,head);
 fs.writeFileSync(`${dir}/crane-head-choice.json`,JSON.stringify(q,null,2)+'\n');
 const f=q.analysis.flaps[0]; const o=f.openings.reduce((best,o)=>Math.abs(o.upper.length-o.lower.length)<Math.abs(best.upper.length-best.lower.length)?o:best);
 t.add(head,'27: reverse the head down',{opening:[o.stored]});
} catch(e){console.log('HEAD',e.message);}
t.save('flat crane with head; wings next');pack([t]);
try {
 t.line([-.10,.65],[.10,.65],[.02,.9],'28a: fold first wing down flat',{scope:1});
 t.turn('Turn over to the second wing');
 t.line([-.10,.65],[.10,.65],[.02,.9],'28b: fold second wing down flat',{scope:1});
}catch(e){console.log('WINGS',e.message);}
t.save('completed flat crane via reverse-fold alternative; 3D wing opening unavailable');pack([t]);
