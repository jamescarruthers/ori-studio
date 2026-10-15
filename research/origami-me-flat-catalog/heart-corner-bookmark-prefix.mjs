import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';import {sameMaterial} from './bird-crow-opening.mjs';
const output=new URL('../../artifacts/heart-corner-bookmark-continuation/',import.meta.url);fs.mkdirSync(output,{recursive:true});
const t=new Trial('heart-corner-bookmark','Heart Corner Bookmark — Origami.me',{shape:{kind:'rectangle',aspect:[1,2]},startSide:'back'});let cx=-.25,cy=0;const P=([x,y])=>[.5*(x-.5)+cx,.5*y+cy],at=(p,l=0)=>t.at(P(p),l),line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);const turn=n=>{t.turn(n);cx=-cx;};
line([.5,0],[.5,2],[.8,.4],'1a: Precrease the vertical center. https://origami.me/heart-corner-bookmark/',{kind:'precrease'});line([0,1],[1,1],[.2,.2],'1b: Precrease the horizontal center.',{kind:'precrease'});
{const a=at([.95,.5]),b=at([1,.5]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:at([.98,.1]),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},'2: Pinch the right edge halfway to the center.');}
line([0,.25],[1,.25],[.2,.1],'3: Bring the bottom edge to the pinch.');turn('4: Turn over.');
line([0,.75],[.5,.25],[.1,.35],'5a: Fold the bottom left edge to the center.');line([1,.75],[.5,.25],[.9,.35],'5b: Fold the bottom right edge to the center.');turn('6: Turn over.');
line([.125,.625],[.875,.625],[.5,.3],'7: Bring the bottom tip to the horizontal center.');turn('8: Turn over.');
fs.writeFileSync(new URL('through8.json',output),JSON.stringify({doc:t.doc,scene:t.scene(),log:t.log},null,2));
const attempts=[];for(const [p,l] of [[[.6,.67],0],[[.6,.67],1],[[.6,.67],2],[[.6,.67],3],[[.6,.67],4],[[.6,.67],5],[[.6,.85],0]]){const op={kind:'squash',flap:at(p,l),direction:'valley'},a=t.e.compound_analysis(t.state,op);console.log(JSON.stringify({p,l,op,analysis:a}));attempts.push({p,l,op,analysis:a});}fs.writeFileSync(new URL('squash-attempts.json',output),JSON.stringify(attempts,null,2));

const checks=[1,2,3].map(i=>sameMaterial(t,t.states[i-1],t.states[i],`Precrease node ${i}: same material stacks`));
fs.writeFileSync(new URL('material-checks.json',output),JSON.stringify(checks,null,2)+'\n');
if(process.argv.includes('--publish'))publish(t,'https://origami.me/heart-corner-bookmark/',{sourceSteps:23,sourceStepsCompleted:8,sourceDiagramsReviewed:24,blockedAtSourceStep:9,audit:'Verified prefix; connected squash authoring investigation',allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:11,checks,latestReport:'heart-corner-bookmark-prefix-2026-10-14.md'});
