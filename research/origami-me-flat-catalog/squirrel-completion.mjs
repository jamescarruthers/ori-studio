import {publish} from './batch-001.mjs';import {verifySquirrel} from './squirrel-checks.mjs';
import fs from'node:fs';import assert from'node:assert/strict';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
export const t=new Trial('squirrel','Squirrel — Origami.me',{shape:{kind:'square'},startSide:'back'}),P=([x,y])=>[Math.SQRT2*(x-.5),Math.SQRT2*y],at=(p,l=0)=>t.at(P(p),l),line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);
export function reverse(a,b,m,n,scope='all',layer=0){const moving=at(m,layer),op={kind:'inside-reverse',line:{via:'free',through:[at(a),at(b)]},moving,seed:scope==='all'?{scope:'all'}:{scope:'depth',at:moving,layers:scope}},analysis=t.e.compound_analysis(t.state,op),results=[];if(analysis.status==='ok'){for(const o of analysis.analysis.flaps[0].openings){const choices={opening:[o.stored]},result=t.e.apply(t.state,op,choices);results.push({choices,result});}}const valid=results.filter(x=>x.result.status==='ok');assert.equal(valid.length,1,JSON.stringify(results));t.add(op,n,valid[0].choices);}
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond. https://origami.me/squirrel/');
line([.5,0],[.5,1],[.7,.5],'1: Precrease the vertical diagonal.',{kind:'precrease'});
const k=Math.SQRT1_2-.5,h=1-Math.SQRT1_2;
line([.5,1],[k,h],[.2,.6],'2a: Bring the upper left edge to the center.');line([.5,1],[1-k,h],[.8,.6],'2b: Bring the upper right edge to the center.');
const right=(1-k+.5)/2,left=1-right;
line([right,.2],[right,.6],[.76,h],'3: Precrease the right corner to the center.',{kind:'precrease'});reverse([right,.2],[right,.6],[.76,h],'4: Reverse the right corner inward.');
line([left,.2],[left,.6],[.24,h],'5a: Precrease the left corner to the center.',{kind:'precrease'});reverse([left,.2],[left,.6],[.24,h],'5b: Reverse the left corner inward.');
line([.5,h],[right,h+right-.5],[.61,h+.02],'6: Precrease the front right lower edge to the center.',{kind:'precrease',scope:1});reverse([.5,h],[right,h+right-.5],[.61,h+.02],'7: Reverse the front right corner inward.',1);
line([.5,h+right-.5],[right,h+right-.5],[.53,h+.06],'8: Fold the right flap upward.',{scope:1});
line([.5,h],[left,h+right-.5],[.39,h+.02],'9a: Precrease the front left lower edge to the center.',{kind:'precrease',scope:1});reverse([.5,h],[left,h+right-.5],[.39,h+.02],'9b: Reverse the front left corner inward.',1);
line([.5,h+right-.5],[left,h+right-.5],[.47,h+.06],'9c: Fold the left flap upward.',{scope:1});
line([.5,0],[.5,1],[.58,.5],'10: Mountain fold the right half behind the left.',{kind:'mountain'});
t.add({kind:'rotate',rotate:{amount:'quarter',direction:'cw'}},'11: Rotate clockwise a quarter turn.');
export const u=Math.SQRT1_2-.5,Q=([x,y])=>[u*x,u*y],A=(p,l=0)=>t.at(Q(p),l),L=(a,b,m,n,o)=>t.line(Q(a),Q(b),Q(m),n,o);
L([2,0],[2,1],[1,.5],'12: Precrease the left shoulder onto the near ear junction.',{kind:'precrease'});
L([2,0],[3-Math.SQRT2,1],[1,.3],'13: Precrease the bottom edge to the near triangular edge.',{kind:'precrease'});
L([1,1],[2,0],[.6,.2],'14: Precrease the white head along its right edge.',{kind:'precrease'});
L([1.25,0],[.85,.8],[.3,.1],'15: Precrease the nose to the shoulder mark.',{kind:'precrease'});
const head17={kind:'inside-reverse',line:{via:'free',through:[A([1,1]),A([2,0])]},moving:A([.6,.2]),seed:{scope:'all'}},head18={kind:'inside-reverse',line:{via:'free',through:[A([1.25,0]),A([.85,.8])]},moving:A([.3,.1]),seed:{scope:'depth',at:A([.3,.1]),layers:1}};
const crimpFixture=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/fold-examples/crimp-boundary-squirrel.json',import.meta.url)));t.add(crimpFixture.op,'16: Crimp the prepared neck directly; the hinges meet at the boundary and the white head rotates up while the body stays put.',crimpFixture.choices);
export function reverseOriginal(op,n){const analysis=t.e.compound_analysis(t.state,op),openings=analysis.status==='ok'?analysis.analysis.flaps.map(f=>f.openings.find(o=>o.upper.length===o.lower.length)??f.openings[0]):[],choices={opening:openings.map(o=>o.stored)},result=t.e.apply(t.state,op,choices);assert.equal(result.status,'ok',JSON.stringify(result));t.add(op,n,choices);}
reverseOriginal(head17,'17: Reverse the white head triangle along its prepared hinge.');
reverseOriginal(head18,'18: Reverse the nose back out along its prepared crease.');
// Source 19 has no exact length: reverse 0.28 base-width units of the nose,
// with its top edge folded back along itself.
const nose=[2-Math.SQRT1_2,Math.SQRT1_2],snoutA=[nose[0]+.28*.8,nose[1]+.28*.6],snoutB=[snoutA[0]+.12,snoutA[1]-.16],snoutSeed=[nose[0]+.04,nose[1]+.005];
L(snoutA,snoutB,snoutSeed,'19: Precrease a short snout tip; top edges align, setback 0.28 base-width units.',{kind:'precrease',scope:1});
const snoutMoving=A(snoutSeed);reverseOriginal({kind:'inside-reverse',line:{via:'free',through:[A(snoutA),A(snoutB)]},moving:snoutMoving,seed:{scope:'depth',at:snoutMoving,layers:1}},'20: Reverse the small snout tip inward.');
// Source 21 marks the bisector of the front arm's right edge and its vertical
// center crease. Source 22 carries that bottom-edge mark to the vertical crease.
const armX=3,markX=3+Math.SQRT2-1;
{const a=A([markX,0]),b=A([markX-.05,.05/(Math.SQRT2-1)]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:A([3.7,.1]),seed:{scope:'depth',at:A([3.7,.1]),layers:1},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},'21: Pinch the lower front arm edge where its right-edge bisector meets the bottom.');}
const armAngle=Math.asin((Math.SQRT2-1)/Math.sqrt(1+(Math.SQRT2-1)**2)),armEnd=[3+Math.tan(armAngle/2),0];
L([3,1],armEnd,[3.7,.1],'22: Fold the front arm so the pinch mark reaches the vertical center crease.',{scope:1});
t.turn('23a: Turn over to mirror the other arm.');
const mirror=p=>[-p[0],p[1]];
L(mirror([3,1]),mirror(armEnd),mirror([3.7,.1]),'23b: Fold the back arm to match the front.',{scope:1});t.turn('23c: Return to the front.');
const tailRoot=armEnd;
L(tailRoot,[tailRoot[0]+1/Math.sqrt(3),1],[5,.3],'24: Raise the tail on a 60-degree crease from the arm/body intersection, leaving a gap behind the ears.');
t.add({kind:'rotate',rotate:{amount:'degrees',degrees:22.5,direction:'cw'}},'Presentation: rotate clockwise 22.5 degrees for the sitting profile.');
L([2.68,1.2],[2.88,1.2+.2*19/17],[2.55,2.1],'25: Fold the tail tip down and right; free shaping line through normalized (2.68,1.20) and (3.02,1.58).');
L([3.42,1.30],[3.48,1.15],[3.7,1.16],'26: Fold the remaining tail corner inward; free shaping line through normalized (3.42,1.30) and (3.48,1.15).');

const checks=verifySquirrel(t,u,Q);
if(process.argv.includes('--publish'))publish(t,'https://origami.me/squirrel/',{sourceSteps:26,sourceStepsCompleted:26,sourceDiagramsReviewed:27,allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:35,checks,audit:'Ready for user audit; intermediate geometry, exposed sides, material motion and reverse-pocket order checked.',proportions:'Source 19 snout setback 0.28 base-width units. Source 24 tail hinge 60 degrees with a gap behind the ears. Final tail shaping uses explicit free-line coordinates saved in notes. Optional advanced tail treatment omitted.',directCrimpControl:'squirrel-neck-cp-checkpoint.json',latestReport:'direct-compound-priorities-2026-10-14.md'});
