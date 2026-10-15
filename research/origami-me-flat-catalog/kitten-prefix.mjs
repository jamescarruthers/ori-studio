import {publish} from './batch-001.mjs';import {sameMaterial} from './bird-crow-opening.mjs';
import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
export const t=new Trial('kitten','Kitten — Origami.me',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
const P=([x,y])=>[2*r*(x-.5),2*r*y],at=(p,l=0)=>t.at(P(p),l),line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond. https://origami.me/kitten/');
line([.5,0],[.5,1],[.7,.5],'1: Precrease the vertical diagonal.',{kind:'precrease'});
const k=Math.SQRT1_2-.5,h=Math.SQRT1_2;
line([.5,0],[k,h],[.2,.4],'2a: Fold the lower left edge to the center.');
line([.5,0],[1-k,h],[.8,.4],'2b: Fold the lower right edge to the center.');
const y=h/2;
line([.4,y],[.6,y],[.5,.1],'3: Bring the bottom corner to the color boundary.');
for(const sign of [-1,1]){const a=at([.5,h]),b=at([.5+sign*(Math.SQRT2-1)*y,y]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:at([.5+sign*.2,.6]),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},`4: Precrease the ${sign<0?'left':'right'} lower layers along the top flap edge, stopping at its tip.`);}
t.add({kind:'unfold',crease:at([.45,y]),moving:at([.5,.5]),seed:{scope:'depth',at:at([.48,.5]),layers:2},direction:'valley'},'5: Unfold the top flap.');

const checks=[2,6,7].map(i=>sameMaterial(t,t.states[i-1],t.states[i],`Precrease node ${i} preserves material stacks`));checks.push(sameMaterial(t,t.states[4],t.states[8],'Source 5 restores the original kite material and order'));
fs.writeFileSync(new URL('batches/kitten-material-checks.json',import.meta.url),JSON.stringify(checks,null,2)+'\n');
if(process.argv.includes('--publish'))publish(t,'https://origami.me/kitten/',{sourceSteps:27,sourceStepsCompleted:5,sourceDiagramsReviewed:30,blockedAtSourceStep:6,audit:'Verified prefix; side-opening collapse correspondence unresolved',allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:9,checks,latestReport:'kitten-prefix-2026-10-14.md'});
