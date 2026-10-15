import {publish} from './batch-001.mjs';
import {sameMaterial} from './bird-crow-opening.mjs';
import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';const t=new Trial('heart-envelope','Heart Envelope — Origami.me',{shape:{kind:'rectangle',aspect:[1,2]},startSide:'front'});let cx=.25;const P=([x,y])=>[.5*(x-.5)+cx,.5*y],at=(p,l=0)=>t.at(P(p),l),line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);const turn=n=>{t.turn(n);cx=-cx;};const segment=(a,b,m,n)=>{const pa=at(a),pb=at(b);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[pa,pb]},moving:at(m),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:pa},to:{kind:'point',at:pb}}},n);};
line([.5,0],[.5,2],[.8,.4],'1a: Precrease the vertical center. https://origami.me/heart-envelope/',{kind:'precrease'});line([0,1],[1,1],[.2,.2],'1b: Precrease the horizontal center.',{kind:'precrease'});turn('1c: Turn over.');
segment([.25,1],[.25,2],[.1,1.5],'2a: Precrease the upper left quarter line.');segment([.75,1],[.75,2],[.9,1.5],'2b: Precrease the upper right quarter line.');
line([0,1.5],[1,1.5],[.4,1.9],'3: Bring the top edge to the center.');line([0,1.25],[1,1.25],[.4,1.4],'4a: Precrease the upper edge to the nearest horizontal line.',{kind:'precrease'});
t.add({kind:'unfold',crease:at([.4,1.5]),moving:at([.4,1.4]),seed:{scope:'depth',at:at([.4,1.4]),layers:1},direction:'valley'},'4b: Unfold the top flap.');
line([0,1.25],[1,1.25],[.4,1.9],'5: Fold the top down on the third horizontal crease.');

const output=new URL('../../artifacts/heart-envelope-continuation/',import.meta.url);
const checks=[1,2,4,5,7].map(i=>sameMaterial(t,t.states[i-1],t.states[i],`Precrease node ${i}: same material stacks`));
checks.push(sameMaterial(t,t.states[5],t.states[8],'Source 4 unfolds to the same flat material stacks'));
fs.writeFileSync(new URL('material-checks.json',output),JSON.stringify(checks,null,2)+'\n');
if(process.argv.includes('--publish'))publish(t,'https://origami.me/heart-envelope/',{sourceSteps:30,sourceStepsCompleted:5,sourceDiagramsReviewed:32,blockedAtSourceStep:6,audit:'Verified prefix; source 6–7 layer selection investigation',allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:10,checks,latestReport:'heart-envelope-prefix-2026-10-14.md'});
