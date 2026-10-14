import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const t=new Trial('rectangle-to-hexagon','Rectangle to Hexagon — Origami.me (batch 4)',{shape:{kind:'rectangle',aspect:[Math.SQRT2,1]},startSide:'back'}),h=Math.SQRT1_2;
let completed=0;
try {
 t.line([-1,h/2],[0,h/2],[-.9,.1],'1: Precrease the horizontal half-height. A4 ratio √2:1. Source: https://origami.me/rectangle-to-hexagon/',{kind:'precrease'});completed=1;
 const point=p=>({kind:'point',at:t.at(p)});
 t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[t.at([-1,h/4]),t.at([-.64,h/4])]},moving:t.at([-.95,.05]),seed:{scope:'all'},extent:{kind:'segment',from:point([-1,h/4]),to:point([-.64,h/4])}},'2: Mark the quarter-height near the left edge, folding the lower edge to the center. Mark length 0.36 accommodates the next corner landing shown in the diagram.');completed=2;
 const op={kind:'valley',line:{via:'axiom',axiom:5,inputs:[point([-1,h/2]),point([-1,0]),{kind:'edge',a:t.at([-1,h/4]),b:t.at([-.64,h/4])}]},moving:t.at([-.98,.02]),seed:{scope:'all'}};
 const roots=t.e.axiom_candidates(t.state,op.line);
 fs.writeFileSync(new URL('batches/rectangle-to-hexagon-roots.json',import.meta.url),JSON.stringify({op,roots},null,2)+'\n');
 assert.equal(roots.status,'ok');
 const valid=roots.candidates.filter(c=>{const r=t.e.apply(t.state,op,{root:c.line});if(r.status!=='ok')return false;return t.e.scene(r.state).faces.flatMap(f=>f.outline).every(p=>p.x>=-1-1e-8&&p.x<=1e-8);});
 assert.equal(valid.length,1,'Only the rightward landing stays inside the rectangle.');
 t.add(op,'3: Bring the lower-left corner onto the short quarter-height mark, with the crease through the left midpoint. Choose the inward/rightward solution.',{root:valid[0].line});completed=3;
 const m=t.at([-.88,.17]);
 t.add({kind:'unfold',crease:t.at([-1+h/(4*Math.sqrt(3)),h/4]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'4: Reopen the corner fold.');completed=4;
 t.line([-1,h/2],[0,h/2],[-.5,.1],'5: Fold the lower half upward.');completed=5;
 fs.writeFileSync(new URL('batches/rectangle-to-hexagon-cut-requirement.json',import.meta.url),JSON.stringify({sourceStep:6,reason:'No public Fold cut operation.',pathInView:[[-1,h/2],[-1+h/(2*Math.sqrt(3)),h]],layers:'both folded layers',discard:'left triangular offcut',scene:t.scene()},null,2)+'\n');
}catch(error){fs.writeFileSync(new URL('batches/rectangle-to-hexagon-failure.json',import.meta.url),JSON.stringify({completed,message:error.message,log:t.log},null,2)+'\n');}
publish(t,'https://origami.me/rectangle-to-hexagon/',{sourceSteps:11,sourceStepsCompleted:completed,audit:'pending visual review'});
