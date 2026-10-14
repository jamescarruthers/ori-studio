import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const t=new Trial('horse','Horse — Origami.me (batch 4)'),r=Math.SQRT1_2,a=r-.5;
let completed=0;
try {
 t.rotate(45,'Set-up: colored-side-up diamond. Source: https://origami.me/horse/');
 t.line([0,0],[0,2*r],[.3,.7],'1a: Precrease vertically.',{kind:'precrease'});
 t.line([-r,r],[r,r],[.1,.3],'1b: Precrease horizontally.',{kind:'precrease'});completed=1;
 t.turn('2: Turn over.');completed=2;
 t.line([-r/2,r/2],[r/2,3*r/2],[-.4,.7],'3a: Precrease between opposite edge midpoints.',{kind:'precrease'});
 t.line([r/2,r/2],[-r/2,3*r/2],[.4,.7],'3b: Repeat for the other midpoints.',{kind:'precrease'});completed=3;
 t.pp([0,2*r],[0,0],'4a: Begin the square-base collapse by bringing the upper point down.');
 t.pp([-r,r],[r,r],'4b: Fold the two-ply left half over to the right.');
 t.add({kind:'squash',flap:t.at([.35,.59]),direction:'valley'},'4c: Squash the first pocket; pick nearer its folded spine.');
 t.turn('4d: Turn over to expose the remaining pocket.');
 t.add({kind:'squash',flap:t.at([-.35,.59]),direction:'valley'},'4e: Squash the second pocket to complete the square base.');completed=4;
 t.line([0,0],[-a,.5],[-.3,.35],'5a: Fold the front left edge to the center.',{scope:1});
 t.line([0,0],[a,.5],[.3,.35],'5b: Fold the front right edge to the center.',{scope:1});completed=5;
 t.line([-a,.5],[a,.5],[.01,.65],'6: Fold and unfold the upper triangle.',{kind:'precrease',scope:1});completed=6;
 for(const sign of [-1,1]){const m=t.at([sign*.07,.3]);t.add({kind:'unfold',crease:t.at([sign*a/2,.25]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'7: Reopen the lower kite flap.');}completed=7;
 fs.writeFileSync(new URL('batches/horse-cut-requirement.json',import.meta.url),JSON.stringify({sourceStep:8,reason:'No public Fold cut operation exists.',required:{pathInView:[[0,0],[0,.5]],layers:'front top layer only',termination:'interior end at horizontal precrease',repeat:'other face'},scene:t.scene()},null,2)+'\n');
} catch(error){fs.writeFileSync(new URL('batches/horse-failure.json',import.meta.url),JSON.stringify({completed,message:error.message,log:t.log},null,2)+'\n');}
publish(t,'https://origami.me/horse/',{sourceStepsCompleted:completed,sourceSteps:20,audit:'pending visual review'});
