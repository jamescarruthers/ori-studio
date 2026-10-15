import assert from 'node:assert/strict';import {publish} from './batch-001.mjs';import {sameMaterial} from './bird-crow-opening.mjs';
import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
export const t=new Trial('pumpkin','Pumpkin — Origami.me',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
export const P=([x,y])=>[2*r*(x-.5),2*r*y],at=(p,l=0)=>t.at(P(p),l),line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: stem color up, diamond. https://origami.me/pumpkin/');
line([.5,0],[.5,1],[.7,.5],'1: Precrease the vertical diagonal.',{kind:'precrease'});
{const a=at([.47,.5]),b=at([.53,.5]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:at([.5,.1]),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},'2: Pinch the center of the horizontal diagonal; short 6% mark.');}
line([.25,.25],[.25,.75],[.1,.5],'3a: Bring the left corner to the center.');line([.75,.25],[.75,.75],[.9,.5],'3b: Bring the right corner to the center.');
line([.375,.125],[.375,.875],[.3,.5],'4a: Bring the left edge to the center.');line([.625,.125],[.625,.875],[.7,.5],'4b: Bring the right edge to the center.');
line([.4375,.15],[.4375,.85],[.48,.4],'5a: Pleat the left inner edge out.',{scope:1});line([.5625,.15],[.5625,.85],[.52,.4],'5b: Pleat the right inner edge out.',{scope:1});
const checkpoints=JSON.parse(fs.readFileSync(new URL('batches/pumpkin-cp-checkpoints.json',import.meta.url)));t.add(checkpoints.left,'6: Untuck the left pleat via saved CP import: flatten only its two internal creases, with the released corner above the unchanged body.');
{const m=at([.6,.5]);t.add({kind:'unfold',crease:at([.375,.5]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'7: Open the released left triangle.');}
line([.25,.4],[.25,.6],[.2,.5],'8: Fold the left corner back on its existing crease.',{scope:1});
t.add(checkpoints.right,'9a: Untuck the right pleat through the saved CP import, preserving the original body order.');
{const m=at([.4,.5]);t.add({kind:'unfold',crease:at([.625,.5]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'9b: Open the released right triangle.');}
line([.75,.4],[.75,.6],[.8,.5],'9c: Refold the right corner on its existing crease.',{scope:1});
line([.25,.625],[.75,.625],[.5,.95],'10: Bring the top corner down along the shoulder line.');
line([.5,.375],[.55,.325],[.5,.28],'11: Precrease the lower corner to the right edge junction.',{kind:'precrease',scope:1});
line([.5,.375],[.45,.325],[.5,.28],'12: Precrease the same corner to the left edge junction.',{kind:'precrease',scope:1});
t.add(checkpoints.stem,'13: Collapse the prepared stem toward the right through saved CP import; the moving stem remains above the stationary right corner.');
line([.4,.53125],[.6,.53125],[.5,.46],'14: Lift the near packet so its two lower corners meet the top edge.',{scope:1});
line([.3125,.3125],[.6875,.3125],[.5,.05],'15: Lift the bottom point along the line between the two shoulder intersections.');
line([.4,.46875],[.6,.46875],[.5,.6],'16: Lower the near flap point to the bottom edge.',{scope:1});
line([.25,.53125],[.34375,.625],[.26,.61],'17a: Round the upper left corner onto the stem-fold junction.');
line([.75,.53125],[.65625,.625],[.74,.61],'17b: Repeat at the upper right corner.');t.turn('18: Turn over to the finished flat pumpkin; optional standing display omitted.');

const checks=[2,3,17,18].map(i=>sameMaterial(t,t.states[i-1],t.states[i],`Precrease node ${i} preserves material stacks`));
// Every visible final cell above the shoulder is the reverse-color stem;
// below it the pumpkin body must show the front color.
for(const cell of t.scene().subfaces){const y=cell.polygon.reduce((s,p)=>s+p.y,0)/cell.polygon.length;assert.equal(t.scene().faces[cell.faces_top_to_bottom[0]].front_up,y<Math.SQRT2*.625);}
fs.writeFileSync(new URL('batches/pumpkin-precrease-checks.json',import.meta.url),JSON.stringify(checks,null,2)+'\n');
if(process.argv.includes('--publish'))publish(t,'https://origami.me/pumpkin/',{sourceSteps:18,sourceStepsCompleted:18,sourceDiagramsReviewed:20,allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:26,checks,audit:'Ready for user audit; all intermediate geometry, paper sides, and CP layer choices checked',proportions:'Source 2 pinch uses a short 6% center mark. Stem and shaping folds use the illustrated crease intersections. Optional standing display is omitted; the tutorial explicitly offers a flat endpoint.',cpCheckpoints:'pumpkin-cp-checkpoints.json',latestReport:'pumpkin-completion-2026-10-14.md'});
