import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
export function birdStart(){
 const t=new Trial('bird','Bird — Origami.me (batch 4)'),r=Math.SQRT1_2;
 t.rotate(45,'Set-up: colored-side-up diamond. Source: https://origami.me/bird/');
 t.line([0,0],[0,2*r],[.3,.7],'1a: Precrease vertically.',{kind:'precrease'});
 t.line([-r,r],[r,r],[.1,.3],'1b: Precrease horizontally.',{kind:'precrease'});
 t.turn('2: Turn over.');
 t.line([-r/2,r/2],[r/2,3*r/2],[-.4,.7],'3a: Precrease between opposite edge midpoints.',{kind:'precrease'});
 t.line([r/2,r/2],[-r/2,3*r/2],[.4,.7],'3b: Repeat for the other midpoints.',{kind:'precrease'});
 return t;
}
if(process.argv[2]==='probe'){
const t=birdStart();let completed=3,valid;
try{
 t.pp([0,2*Math.SQRT1_2],[0,0],'4a: Begin the square-base collapse by bringing the upper point down.');
 t.pp([-Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,Math.SQRT1_2],'4b: Fold the two-ply left half over to the right.');
 const op={kind:'squash',flap:t.at([.35,.59]),direction:'valley'};
 fs.writeFileSync(new URL('batches/bird-square-base-attempt.json',import.meta.url),JSON.stringify({op,result:t.e.compound_analysis(t.state,op)},null,2));
 t.add(op,'4c: Squash the first pocket.');
 t.turn('4d: Turn over to expose the remaining pocket.');
 t.add({kind:'squash',flap:t.at([-.35,.59]),direction:'valley'},'4e: Squash the second pocket to complete the square base.');completed=4;
 const a=Math.SQRT2/2-.5;
 t.line([0,0],[-a,.5],[-.3,.35],'5a: Fold the front left edge to the center.',{scope:1});
 t.line([0,0],[a,.5],[.3,.35],'5b: Fold the front right edge to the center.',{scope:1});completed=5;
 t.line([-a,.5],[a,.5],[.01,.65],'6: Fold the upper triangle down.',{scope:1});completed=6;valid={state:t.state,states:[...t.states],steps:[...t.doc.steps],log:[...t.log]};
 for(const sign of [-1,1]){const m=t.at([sign*.07,.3]);t.add({kind:'unfold',crease:t.at([sign*a/2,.25]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'7: Reopen the lower kite flap.');}completed=7;
 fs.writeFileSync(new URL('batches/bird-before-petal.json',import.meta.url),JSON.stringify({state:t.state,scene:t.scene()},null,2));
 t.add({kind:'petal',ends:[t.at([-a,.5]),t.at([a,.5])],petal:t.at([.02,.2]),direction:'valley'},'8: Raise the lower front flap into the first petal.');completed=8;
 t.turn('9: Turn over.');completed=9;
 fs.writeFileSync(new URL('batches/bird-after-petal.json',import.meta.url),JSON.stringify({state:t.state,scene:t.scene()},null,2));
}catch(error){fs.writeFileSync(new URL('batches/bird-failure.json',import.meta.url),JSON.stringify({message:error.message,log:t.log},null,2));}
fs.writeFileSync(new URL('batches/bird-unverified-downstream.json',import.meta.url),JSON.stringify({steps:t.doc.steps,states:t.states,log:t.log},null,2));
if(completed<17&&valid){t.state=valid.state;t.states=valid.states;t.doc.steps=valid.steps;t.log=valid.log;completed=6;}
publish(t,'https://origami.me/bird/',{sourceStepsCompleted:completed,sourceSteps:17,audit:'pending visual review'});
}
