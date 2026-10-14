import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const t=new Trial('camellia','Camellia — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),k=Math.SQRT2-1;
const rec=(name,data)=>fs.writeFileSync(new URL(`batches/camellia-${name}.json`,import.meta.url),JSON.stringify(data,null,2)+'\n');
let completed=0;
try{
 t.line([-1,0],[0,1],[-.8,.8],'1a: Precrease one diagonal, white side up. Source: https://origami.me/camellia/',{kind:'precrease'});
 t.line([-1,1],[0,0],[-.8,.2],'1b: Precrease the other diagonal.',{kind:'precrease'});completed=1;
 t.line([0,0],[-1,k],[-.7,.1],'2: Bring the bottom edge to the descending diagonal.');completed=2;
 t.line([0,1],[-.2,1-.2/k],[-.03,.3],'3: Bring the right edge to the ascending diagonal.');completed=3;
 t.line([-1,1],[-.2,1-.8*k],[-.6,.95],'4: Bring the top edge to the descending diagonal.');completed=4;
 const p=[-.8,.2/k],q=[-.65,.35/k];
 t.line(p,q,[-.9,.6],'5: Fold and unfold the left edge onto the diagonal where the layers overlap.',{kind:'precrease'});completed=5;
 rec('before-reverse',t.scene());
 const m=t.at([-.95,.41]);const op={kind:'inside-reverse',line:{via:'free',through:[t.at(p),t.at(q)]},moving:m,seed:{scope:'depth',at:m,layers:1}};
 const analysis=t.e.compound_analysis(t.state,op);rec('reverse-attempt',{op,analysis});
 const choices={opening:analysis.analysis.flaps.map(f=>f.openings.find(o=>Math.abs(o.spine.d)<1e-8).stored)};
 t.add(op,'6: Fold the upper-left corner rightward while reversing the lower-left overlap; open the original bottom-fold spine.',choices);completed=6;
 rec('after-reverse',t.scene());
 const controls=[[-.32,.28],[-.57,.29],[-.38,.23]].map(p=>{const op={kind:'squash',flap:t.at(p),direction:'valley'};return {point:p,op,result:t.e.apply(t.state,op)};});rec('squash-pick-controls',controls);
 const sq={kind:'squash',flap:t.at([-.43,.23]),direction:'valley'};rec('first-squash-attempt',{op:sq,analysis:t.e.compound_analysis(t.state,sq)});
 t.add(sq,'7: Squash the lower flap upward along its existing creases.');completed=7;
 rec('after-first-squash',t.scene());
}catch(error){rec('failure',{completed,message:error.message,log:t.log});}
publish(t,'https://origami.me/camellia/',{sourceSteps:13,sourceStepsCompleted:completed,sourceDiagramsReviewed:14,audit:'pending visual review'});
