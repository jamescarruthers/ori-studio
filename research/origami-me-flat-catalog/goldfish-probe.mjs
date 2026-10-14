import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const t=new Trial('goldfish','Goldfish — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
let completed=0;
try {
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/goldfish/');
 t.line([0,0],[0,2*r],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
 t.pp([0,2*r],[0,0],'2: Fold the upper corner down.');completed=2;
 t.pp([-r,r],[0,0],'3a: Bring the left corner to the lower point.');
 t.pp([r,r],[0,0],'3b: Bring the right corner to the lower point.');completed=3;
 t.line([-r/2,r/2],[r/2,r/2],[-.03,.08],'4a: Raise the front left tip.',{scope:1});
 t.line([-r/2,r/2],[r/2,r/2],[.03,.08],'4b: Raise the front right tip.',{scope:1});completed=4;
 t.line([0,r/2],[-(r-.5)/2,(r+.5)/2],[-.025,.63],'5: Fold the left horn outward so its diagonal edge becomes horizontal.',{scope:1});completed=5;
 t.line([0,r/2],[(r-.5)/2,(r+.5)/2],[.025,.63],'6: Repeat for the right horn.',{scope:1});completed=6;
 t.line([-.2,3*r/8],[.2,3*r/8],[.01,.06],'7: Raise the front lower flap; approximate crease y=3r/8.',{scope:1});completed=7;
 t.line([-r/2,r/2],[r/2,r/2],[.02,.30],'8: Raise the two front layers along the horizontal centerline.',{scope:2});completed=8;
 t.turn('9: Turn over.');completed=9;
 t.line([-r/2,r/2],[r/2,r/2],[.02,.08],'10a: Raise the remaining bottom corner.',{scope:1});
 t.turn('10b: Turn back to the horns.');completed=10;
 fs.writeFileSync(new URL('batches/goldfish-before-opening.json',import.meta.url),JSON.stringify({doc:t.doc,scene:t.scene()},null,2)+'\n');
 const op={kind:'squash',flap:t.at([.12,.42]),direction:'valley'};
 fs.writeFileSync(new URL('batches/goldfish-opening-attempt.json',import.meta.url),JSON.stringify({sourceStep:11,viewPick:[.12,.42],op,result:t.e.apply(t.state,op)},null,2)+'\n');
 t.add(op,'11: Open the lower pocket and flatten across its center.');completed=11;
}catch(error){fs.writeFileSync(new URL('batches/goldfish-failure.json',import.meta.url),JSON.stringify({completed,message:error.message,log:t.log},null,2)+'\n');}
publish(t,'https://origami.me/goldfish/',{sourceStepsCompleted:completed,sourceSteps:14,audit:'pending visual review'});
