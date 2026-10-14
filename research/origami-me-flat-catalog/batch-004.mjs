import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const record=(name,data)=>fs.writeFileSync(path.join(dir,'batches',name+'.json'),JSON.stringify(data,null,2)+'\n');
const point=at=>({kind:'point',at});
export function witchHat(){
 const t=new Trial('witch-hat','Witch Hat — before brim collapse (batch 4)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,top=Math.SQRT2,k=top-1,q=(k+r)/2;
 let completed=0;
 try{
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/witch-hat/');
 t.line([0,0],[0,top],[.3,.7],'1a: Precrease the vertical diagonal.',{kind:'precrease'});
 t.line([-r,r],[r,r],[.1,.3],'1b: Precrease the horizontal diagonal.',{kind:'precrease'});completed=1;
 t.line([0,top],[-k,k],[-.5,.7],'2a: Fold the upper-left edge to the middle.');
 t.line([0,top],[k,k],[.5,.7],'2b: Repeat on the right.');completed=2;
 t.line([-k,k],[k,k],[.01,.05],'3a: Precrease at the boundary between colored and white paper.',{kind:'precrease'});
 t.turn('3b: Turn over.');completed=3;
 t.pp([0,0],[0,top],'4: Precrease the lower tip onto the upper tip.',{kind:'precrease'});completed=4;
 t.line([-.3,q],[.3,q],[.01,.45],'5a: Precrease the lower reference onto the upper one.',{kind:'precrease'});
 t.turn('5b: Turn over.');completed=5;
 for(const [sign,note] of [[-1,'6a: Open the left long flap.'],[1,'6b: Open the right long flap.']]){
 const m=t.at([sign*.08,.8]);t.add({kind:'unfold',crease:t.at([sign*k*.5,(top+k)/2]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},note);
 }completed=6;
 const x=k*(top-q),a=t.at([-x,q]),b=t.at([x,q]);
 t.add({kind:'precrease',line:{via:'free',through:[a,b]},moving:t.at([.01,q-.05]),seed:{scope:'all'},direction:'valley',extent:{kind:'segment',from:point(a),to:point(b)}},'7: Reverse only the middle section of the brim precrease; retain the flat unfolded endpoint.');completed=7;
 record('witch-hat-before-collapse',t.scene());
 }catch(error){record('witch-hat-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/witch-hat/',{sourceStepsCompleted:completed,sourceSteps:14,audit:'partial pending visual review',blockedAtSourceStep:completed+1,blocker:'Partial precrease on an existing flat crease refuses extent_misses_layers; coordinated brim collapse remains unattempted.'});
}
if(process.argv[2]==='witch-hat') witchHat();

export function happi(){
 const t=new Trial('happi','Happi — Origami.me (batch 4)',{shape:{kind:'rectangle',aspect:[1,2]},startSide:'back'}),top=1.85,collar=1.45,half=collar/2,quarter=3*collar/4;
 const scale=p=>p.map(v=>v/2),at=(p,l=0)=>t.at(scale(p),l),line=(a,b,m,n,o)=>t.line(scale(a),scale(b),scale(m),n,o);
 let completed=0,valid;
 try{
 line([-1,top],[0,top],[-.4,1.95],'1a: Fold a 0.15-unit top strip on the half-square rectangle. Source: https://origami.me/happi/');
 t.turn('1b: Turn over.');completed=1;
 line([0,collar],[.4,top],[.04,1.8],'2a: Fold the left upper corner, leaving a 0.2-unit gap between collar edges.');
 line([1,collar],[.6,top],[.96,1.8],'2b: Repeat on the right.');completed=2;
 const pinch=(a,b,m,note)=>t.add({kind:'precrease',line:{via:'free',through:[at(a),at(b)]},moving:at(m),seed:{scope:'all'},direction:'valley',extent:{kind:'segment',from:point(at(a)),to:point(at(b))}},note);
 pinch([0,half],[.14,half],[.05,.6],'3a: Pinch halfway from the lower edge to the collar at the left edge.');
 pinch([.86,half],[1,half],[.95,.6],'3b: Repeat the midpoint pinch at the right edge.');completed=3;
 pinch([0,quarter],[.14,quarter],[.05,1],'4: Pinch halfway between the previous mark and collar.');completed=4;
 line([0,quarter],[1,quarter],[.5,.1],'5a: Mountain fold the lower body on the new pinch.',{kind:'mountain'});
 t.turn('5b: Turn over.');completed=5;valid={state:t.state,states:[...t.states],steps:[...t.doc.steps],log:[...t.log]};
 line([-1,collar],[0,collar],[-.5,2.1],'6a: Lower the top flap along the collar bottom reference.',{scope:1});
 t.turn('6b: Turn over.');completed=6;
 line([.2,1],[.2,1.5],[.05,1.2],'7a: Align the left outer edge with the collar inner edge.');
 line([.8,1],[.8,1.5],[.95,1.2],'7b: Repeat on the right.');
 t.turn('7c: Turn over as shown by the source diagram.');completed=7;
 record('happi-before-sleeves',t.scene());
 }catch(error){record('happi-failure',{completed,message:error.message,attempts:t.log});}
 record('happi-unverified-downstream',{steps:t.doc.steps,states:t.states,log:t.log});
 if(valid){t.state=valid.state;t.states=valid.states;t.doc.steps=valid.steps;t.log=valid.log;completed=5;}
 return publish(t,'https://origami.me/happi/',{sourceStepsCompleted:completed,sourceSteps:9,audit:'partial: source-6 collar reference interpretation unresolved',blockedAtSourceStep:6,proportions:'Top strip 0.15 sheet-width units; collar gap 0.20 (1.5 cm on the recommended 7.5 cm width).'});
}
if(process.argv[2]==='happi') happi();

export function parrot(){
 const t=new Trial('parrot','Parrot — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),top=Math.SQRT2,k=top-1,c=1-k,x=k/Math.SQRT2;
 let completed=0;
 try{
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/parrot/');
 t.line([0,0],[0,top],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
 t.line([0,0],[-k,1],[-.5,.7],'2a: Fold the lower-left edge onto the center.');
 t.line([0,0],[k,1],[.5,.7],'2b: Fold the lower-right edge onto the center.');completed=2;
 t.line([-k,1],[k,1],[.01,1.3],'3: Fold the upper white triangle behind.',{kind:'mountain'});completed=3;
 t.line([0,1],[-x,1-x],[-.34,.94],'4a: Fold the left upper edge onto the center.',{scope:1});
 t.line([0,1],[x,1-x],[.34,.94],'4b: Fold the right upper edge onto the center.',{scope:1});completed=4;
 record('parrot-through4',{state:t.state,scene:t.scene()});
 const old={kind:'squash',flap:t.at([.05,.8]),direction:'valley'};
 record('parrot-folded-squash-attempt',{op:old,result:t.e.apply(t.state,old)});
 const m=t.at([.05,.8]);t.add({kind:'unfold',crease:t.at([x/2,1-x/2]),moving:m,seed:{scope:'flaps',at:[m]},direction:'valley'},'5: Open the right upper flap again.');completed=5;
 const op={kind:'squash',flap:t.at([.2,.9]),direction:'valley'};
 record('parrot-squash-analysis',{op,result:t.e.compound_analysis(t.state,op)});
 t.add(op,'5–6: Open and squash the right upper pocket to the centerline.');completed=6;
 record('parrot-through6',{state:t.state,scene:t.scene()});
 }catch(error){record('parrot-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/parrot/',{sourceStepsCompleted:completed,sourceSteps:12,audit:'partial pending visual review'});
}
if(process.argv[2]==='parrot') parrot();

export function penguin(){
 const t=new Trial('penguin','Penguin — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'front'}),top=Math.SQRT2;
 let completed=0;
 try{
 t.rotate(45,'Set-up: colored-side-up diamond. Source: https://origami.me/penguin/');
 t.line([0,0],[0,top],[.3,.7],'1a: Precrease the vertical diagonal shown in the diagram (the text names the other diagonal).',{kind:'precrease'});
 t.turn('1b: Turn over.');completed=1;
 t.line([0,top],[-.5,.5],[-.6,.7],'2a: Fold the left upper edge inward, leaving a central white gap; chosen crease meets the lower edge at (-0.5,0.5).');
 t.line([0,top],[.5,.5],[.6,.7],'2b: Repeat symmetrically on the right.');completed=2;
 t.turn('3: Turn over to the colored back.');completed=3;
 t.line([-.4,top-.8*(top-.5)],[-.25,.25],[-.47,.5],'4a: Fold the left side corner inward.');
 t.line([.4,top-.8*(top-.5)],[.25,.25],[.47,.5],'4b: Repeat the corner shaping on the right.');completed=4;
 t.line([-.25,.25],[.25,.25],[.01,.05],'5: Fold the bottom corner up at the lower ends of the side flaps.');completed=5;
 t.line([0,.3],[0,top],[-.1,.8],'6: Fold the left half over to the right.');completed=6;
 const m=t.at([.015,1.3]),op={kind:'outside-reverse',line:{via:'free',through:[t.at([0,1.08]),t.at([.1,1.025])]},moving:m,seed:{scope:'depth',at:m,layers:1}};
 const q=t.e.compound_analysis(t.state,op);record('penguin-head-analysis',{op,result:q});
 const choices=q.status==='ok'?{opening:q.analysis.flaps.map(f=>f.openings.find(o=>o.upper.length===o.lower.length)?.stored)}:undefined;
 t.add(op,'7: Outside reverse the head across the neck, as the tutorial specifies; symmetric central opening.',choices);completed=7;
 }catch(error){record('penguin-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/penguin/',{sourceStepsCompleted:completed,sourceSteps:7,audit:'pending visual review',proportions:'Symmetric chest gap and side shaping; approximate head angle specified in saved free-line anchors. Flat profile endpoint; no spatial opening.'});
}
if(process.argv[2]==='penguin') penguin();

export function fox(){
 const t=new Trial('fox','Fox — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,top=Math.SQRT2;
 let completed=0,valid;
 try{
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/fox/');
 t.line([0,0],[0,top],[.3,.7],'1: Precrease vertically.',{kind:'precrease'});completed=1;
 t.pp([0,0],[0,top],'2: Fold the lower point up.');completed=2;
 t.pp([-r,r],[0,top],'3a: Raise the left corner to the upper point.');
 t.pp([r,r],[0,top],'3b: Repeat on the right.');completed=3;
 t.turn('4: Turn over.');completed=4;
 t.line([0,r],[0,top],[-.1,1],'5: Fold the left half over to the right.');completed=5;
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'6: Rotate clockwise by 45 degrees.');completed=6;
 t.line([1,.5],[.88,.88],[.98,.92],'7: Fold just the front flap left to form the ear; approximate reference chosen at (0.88,0.88).',{scope:1});completed=7;
 valid={state:t.state,states:[...t.states],steps:[...t.doc.steps],log:[...t.log]};
 record('fox-before-squash',{state:t.state,scene:t.scene()});
 const direct={kind:'squash',flap:t.at([.98,.92]),direction:'valley'};record('fox-direct-squash',{op:direct,result:t.e.apply(t.state,direct)});
 t.line([1,.5],[.88,.88],[.98,.92],'8–9a: Fold the middle two-ply flap to establish the hinge before squashing it open.',{scope:2});
 record('fox-middle-fold',{state:t.state,scene:t.scene()});
 const op={kind:'squash',flap:t.at([.83,.83]),direction:'valley'};record('fox-squash-analysis',{op,result:t.e.compound_analysis(t.state,op)});
 t.add(op,'8–9b: Open the middle pocket and squash flat; temporary lifted pose is not saved.');completed=9;
 t.line([.67,.5],[.67,.67],[.55,.52],'10: Fold the left tail corner inward, keeping its lower edge aligned.');completed=10;
 }catch(error){record('fox-failure',{completed,message:error.message,attempts:t.log});}
 record('fox-unverified-downstream',{steps:t.doc.steps,states:t.states,log:t.log});
 if(completed<10&&valid){t.state=valid.state;t.states=valid.states;t.doc.steps=valid.steps;t.log=valid.log;completed=7;}
 return publish(t,'https://origami.me/fox/',{sourceStepsCompleted:completed,sourceSteps:10,audit:'pending visual review',proportions:'Ear crease and tail width are approximate as instructed. Decorative eyes omitted.'});
}
if(process.argv[2]==='fox') fox();

export function lantern(){
 const t=new Trial('lantern','Lantern — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'});
 let completed=0;
 try{
 t.line([-1,0],[0,1],[-.7,.9],'1a: Precrease the first diagonal. Source: https://origami.me/lantern/',{kind:'precrease'});
 t.line([-1,1],[0,0],[-.8,.2],'1b: Precrease the other diagonal.',{kind:'precrease'});completed=1;
 for(const [source,corners,center] of [[2,[[-1,0],[0,0],[0,1],[-1,1]],[-.5,.5]],[3,[[.5,0],[1,.5],[.5,1],[0,.5]],[.5,.5]],[4,[[-.75,.25],[-.25,.25],[-.25,.75],[-.75,.75]],[-.5,.5]]]){
  for(const [i,c] of corners.entries())t.pp(c,center,`${source}${String.fromCharCode(97+i)}: Bring this corner to the center.`);
  t.turn(`${source}e: Turn over after all four corners.`);completed=source;
 }
 record('lantern-before-opening',{state:t.state,scene:t.scene()});
 const op={kind:'squash',flap:t.at([.47,.66]),direction:'valley'};record('lantern-opening-attempt',{op,result:t.e.compound_analysis(t.state,op)});
 t.add(op,'5a: Open the upper pocket and flatten it.');
 }catch(error){record('lantern-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/lantern/',{sourceStepsCompleted:completed,sourceSteps:5,audit:'partial pending visual review'});
}
if(process.argv[2]==='lantern') lantern();
