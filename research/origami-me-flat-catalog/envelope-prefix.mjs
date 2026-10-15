import fs from 'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
import{publish}from'./batch-001.mjs';import{sameMaterial}from'./bird-crow-opening.mjs';
const output=new URL('../../artifacts/envelope-continuation/',import.meta.url);fs.mkdirSync(output,{recursive:true});
const t=new Trial('envelope','Envelope — Origami.me',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond. https://origami.me/envelope/');
t.line([0,0],[0,2*r],[.3,r],'1a: Precrease the vertical diagonal.',{kind:'precrease'});t.line([-r,r],[r,r],[0,.2],'1b: Precrease the horizontal diagonal.',{kind:'precrease'});
t.pp([0,0],[0,r],'2a: Bring the lower point to the center.');t.pp([0,2*r],[0,r],'2b: Bring the upper point to the center.');
t.add({kind:'rotate',rotate:{amount:'quarter',direction:'cw'}},'3: Rotate clockwise a quarter turn.');
fs.writeFileSync(new URL('before4.json',output),JSON.stringify(t.scene(),null,2));
const P=([x,y])=>[r*(x+1),r*y],at=p=>t.at(P(p));const line=(a,b,m,n,o)=>t.line(P(a),P(b),P(m),n,o);
const pa=at([-.05,.5]),pb=at([.05,.5]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[pa,pb]},moving:at([0,.9]),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:pa},to:{kind:'point',at:pb}}},'4: Pinch the top corner to the center; mark width 0.1 normalized units.');
t.pp(P([0,-1]),P([0,.5]),'5: Precrease the bottom corner to the pinch.',{kind:'precrease'});
const folds=[];const fold=(a,b,m,n)=>{const crease=at(a.map((v,k)=>.4*v+.6*b[k])),moving=at(m);line(a,b,m,n);folds.push({crease,moving});};
fold([-.375,-.625],[.375,-.625],[.02,-.9],'6: Bring the bottom tip to the source-5 crease.');
fold([-.5,-.25],[-.125,-.625],[-.4,-.5],'7: Align the left lower edge with the source-5 crease.');
fold([.5,-.25],[.125,-.625],[.4,-.5],'8: Repeat on the right.');
for(const [i,f]of folds.reverse().entries())t.add({kind:'unfold',...f,seed:{scope:'flaps',at:[f.moving]},direction:'valley'},`9${String.fromCharCode(97+i)}: Unfold source ${8-i}.`);
fs.writeFileSync(new URL('through9.json',output),JSON.stringify({doc:t.doc,log:t.log,scene:t.scene()},null,2));
for(const s of [-1,1]){const a=at([s*.125,-.875]),b=at([s*.125,-.625]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:at([s*.18,-.75]),seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},`10: Precrease the ${s<0?'left':'right'} vertical lower segment, using the unfolded corner crease as its upper endpoint.`);}
line([-.125,-.875],[.125,-.875],[.02,-.95],'11: Fold the bottom point up between the segment endpoints.');
line([-.375,-.625],[.375,-.625],[.02,-.8],'12: Lift the lower area along the existing crease.');
line([-.5,-.25],[-.125,-.625],[-.4,-.5],'13a: Fold the left lower section inward.');
line([.5,-.25],[.125,-.625],[.4,-.5],'13b: Repeat on the right.');
fs.writeFileSync(new URL('through13.json',output),JSON.stringify({doc:t.doc,log:t.log,scene:t.scene()},null,2));
const project=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/fold-examples/petal-fold.osf',import.meta.url)));project.workspace.title=t.doc.title;project.workspace.foldSequences=[t.doc];project.workspace.viewState={fold:{v:1,sequenceId:t.doc.id,cursor:t.doc.steps.at(-1).id,activeChild:Object.fromEntries(t.doc.steps.map(n=>[n.parent??'',n.id]))}};fs.writeFileSync(new URL('envelope.osf',output),JSON.stringify(project,null,2)+'\n');

const checks=[];for(const i of [2,3,7,8,15,16])checks.push(sameMaterial(t,t.states[i-1],t.states[i],`Precrease node ${i}: identical material stacks`));checks.push(sameMaterial(t,t.states[8],t.states[14],'Source 9 restores the source-5 geometry, paper sides and complete layer stacks'));
fs.writeFileSync(new URL('material-checks.json',output),JSON.stringify(checks,null,2)+'\n');
if(process.argv.includes('--publish'))publish(t,'https://origami.me/envelope/',{sourceSteps:24,sourceStepsCompleted:13,sourceDiagramsReviewed:27,blockedAtSourceStep:14,audit:'Verified prefix; hidden-flap authoring investigation',allSavedStatesVisuallyCheckedInFold:true,visuallyCheckedStates:21,checks,latestReport:'envelope-prefix-2026-10-14.md'});
