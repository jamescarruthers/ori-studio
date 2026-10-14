import fs from'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';import{publish}from'./batch-001.mjs';
const rec=(n,x)=>fs.writeFileSync(new URL('batches/shirt-'+n+'.json',import.meta.url),JSON.stringify(x,null,2)+'\n');
export function shirt(){const t=new Trial('shirt','Shirt — Origami.me (batch 4)',{shape:{kind:'rectangle',aspect:[1,2]},startSide:'back'});let completed=0;
try{
t.line([-.5,.94],[0,.94],[-.2,.98],'1: Mountain-fold the upper strip behind, retaining a white collar. Chosen strip height 0.06. Source: https://origami.me/shirt/',{kind:'mountain'});completed=1;
t.line([-.25,0],[-.25,.94],[-.1,.4],'2: Precrease the vertical center.',{kind:'precrease'});completed=2;
t.line([-.375,0],[-.375,.9],[-.45,.4],'3a: Precrease the left edge onto the center.',{kind:'precrease'});t.line([-.125,0],[-.125,.9],[-.05,.4],'3b: Repeat on the right.',{kind:'precrease'});completed=3;
t.line([-.5,.125],[-.375,0],[-.47,.03],'4a: Fold the lower-left corner onto the nearby quarter crease.');t.line([0,.125],[-.125,0],[-.03,.03],'4b: Repeat on the right.');completed=4;
t.line([-.375,0],[-.375,.9],[-.45,.4],'5a: Fold the left side into the center.');t.line([-.125,0],[-.125,.9],[-.05,.4],'5b: Fold the right side into the center.');completed=5;
t.line([-.375,.125],[-.125,.125],[-.2,.03],'6: Precrease the lower strip behind at the white triangle tip.',{kind:'precrease',direction:'mountain'});completed=6;
rec('before-sleeves',t.scene());
const p=[-.34,.08],op={kind:'squash',flap:t.at(p),direction:'valley'};rec('sleeve-attempt',{op,result:t.e.compound_analysis(t.state,op)});t.add(op,'7a: Open and squash the left sleeve pocket.');
rec('after-first-sleeve',t.scene());
}catch(error){rec('failure',{completed,message:error.message,attempts:t.log});}return publish(t,'https://origami.me/shirt/',{sourceStepsCompleted:completed,sourceSteps:10,audit:'pending visual review'});}
if(process.argv[2]==='probe')shirt();
