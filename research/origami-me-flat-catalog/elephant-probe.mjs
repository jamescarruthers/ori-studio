import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';import{publish}from'./batch-001.mjs';
const rec=(n,x)=>fs.writeFileSync(new URL('batches/elephant-'+n+'.json',import.meta.url),JSON.stringify(x,null,2)+'\n');
export function elephant(){const t=new Trial('elephant','Elephant — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),top=Math.SQRT2,r=Math.SQRT1_2,k=top-1,neck=.64;let completed=0;
try{
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/elephant/');t.line([0,0],[0,top],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
t.line([0,top],[-k,k],[-.5,.7],'2a: Fold the upper-left edge into the middle.');t.line([0,top],[k,k],[.5,.7],'2b: Repeat on the right.');t.turn('2c: Turn over.');completed=2;
t.pp([0,top],[0,0],'3: Lower the top corner onto the bottom corner.');completed=3;
t.line([-.2,neck],[.2,neck],[.01,.1],'4: Raise the front lower corner, leaving a 0.0671-wide pleat. Approximate source reference.',{scope:1});completed=4;
t.turn('5: Turn over.');completed=5;
t.pp([0,0],[0,k],'6: Fold the bottom corner to the white/colored boundary.');completed=6;
t.line([0,k/2],[0,2*neck],[.1,.5],'7a: Fold the right half over to the left.');t.rotate(90,'7b: Rotate counterclockwise by 90 degrees.');completed=7;rec('before-head',t.scene());
const op={kind:'swivel',via:'edge',fold:t.at([-neck,-.18]),edge:t.at([-.96,-.32*(top-1)]),target:{via:'free',through:[t.at([-.96,-.11]),t.at([-.72,-.22])]},direction:'valley'};rec('head-attempt',{op,result:t.e.compound_analysis(t.state,op)});t.add(op,'8: Swivel the head downward; trial edge/target interpretation.');completed=8;
}catch(error){rec('failure',{completed,message:error.message,attempts:t.log});}return publish(t,'https://origami.me/elephant/',{sourceStepsCompleted:completed,sourceSteps:11,audit:'pending visual review'});}
if(process.argv[2]==='probe')elephant();
