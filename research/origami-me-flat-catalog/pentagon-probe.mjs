import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const t=new Trial('pentagon-from-square-paper','Square to Pentagon — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'});
let completed=0;
try {
 t.line([-1,.5],[0,.5],[-.7,.1],'1: Fold the lower half upward. Source: https://origami.me/pentagon-from-square-paper/');completed=1;
 const point=p=>({kind:'point',at:t.at(p)});
 const partial=(a,b,m,from,to,note)=>t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[t.at(a),t.at(b)]},moving:t.at(m),seed:{scope:'depth',at:t.at(m),layers:1},extent:{kind:'segment',from:point(from),to:point(to)}},note);
 partial([-.32,.75],[0,.75],[-.1,.9],[-.32,.75],[0,.75],'2: Mark half-height on the front layer near the right edge; the diagram shows enough length to cross the next reference.');completed=2;
 partial([-.5,1],[0,.5],[-.1,.9],[-.29,.79],[-.21,.71],'3: Pinch the right-edge-to-bottom-edge bisector at its intersection with the first mark.');completed=3;
 t.pp([-1,.5],[-.25,.75],'4: Bring the lower-left corner to the cross-mark.');completed=4;
 const pivot=[-7/12,.5],theta=(Math.atan2(3,-1)+Math.atan2(3,4))/2;
 t.line(pivot,[pivot[0]+.4*Math.cos(theta),pivot[1]+.4*Math.sin(theta)],[-.3,.76],'5: Bisect the top flap, aligning its right edge with its left folded edge.',{scope:1});completed=5;
 t.line(pivot,[pivot[0]+.6*Math.cos(theta/2),pivot[1]+.6*Math.sin(theta/2)],[-.08,.55],'6: Bring the lower right edge to the nearest folded edge.');completed=6;
 t.turn('7: Turn over.');completed=7;
 const angle=((Math.PI-Math.atan2(3,-1))+(Math.PI-theta/2))/2, p=[-pivot[0],pivot[1]];
 t.line(p,[p[0]+.4*Math.cos(angle),p[1]+.4*Math.sin(angle)],[.65,.8],'8: Halve the packet, bringing its right edge onto its left edge.');completed=8;
 t.add({kind:'rotate',rotate:{amount:'degrees',degrees:Math.round(theta/2*180/Math.PI*1e6)/1e6,direction:'cw'}},'9 set-up: rotate the packet clockwise to the upright cutting orientation shown in the diagram. No cut performed.');
 fs.writeFileSync(new URL('batches/pentagon-from-square-paper-cut-requirement.json',import.meta.url),JSON.stringify({sourceStep:9,reason:'No public Fold cut operation.',required:'Cut across the whole packet along the nearest exposed edge; discard the excess and unfold the retained wedge.',scene:t.scene()},null,2)+'\n');
}catch(error){fs.writeFileSync(new URL('batches/pentagon-from-square-paper-failure.json',import.meta.url),JSON.stringify({completed,message:error.message,log:t.log},null,2)+'\n');}
publish(t,'https://origami.me/pentagon-from-square-paper/',{sourceSteps:10,sourceStepsCompleted:completed,audit:'pending visual review'});
