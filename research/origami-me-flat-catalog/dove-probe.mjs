import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const record=(name,data)=>fs.writeFileSync(new URL(`batches/dove-${name}.json`,import.meta.url),JSON.stringify(data,null,2)+'\n');
export function doveStart(){
 const t=new Trial('dove','Dove — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond. Source: https://origami.me/dove/');
 t.pp([0,0],[0,2*r],'1: Fold the lower tip upward. The text says unfold, but diagrams 1–2 require the folded triangle; follow the diagrams.');
 t.pp([-r,r],[r,r],'2: Fold the left corner to the right corner.');
 return t;
}
if(process.argv[2]==='probe'){
 const t=doveStart(),r=Math.SQRT1_2;let completed=2;
 try{
  t.line([0,r],[r/2,1.5*r],[.5,.8],'3: Fold the front triangular packet upward.',{scope:1});completed=3;
  record('after-front-triangle',{scene:t.scene(),log:t.log.at(-1)});
  const a=t.at([0,1.5*r]),b=t.at([.07,1.5*r]),m=t.at([.02,1.9*r]);
  t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:m,seed:{scope:'depth',at:m,layers:1},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},'4: Pinch the left edge midpoint of the front flap; mark length 0.07 sheet units.');completed=4;
  t.line([r/4,1.25*r],[r/4,1.75*r],[.3,1.5*r],'5: Precrease the front flap tip onto the midpoint pinch.',{kind:'precrease',scope:1});completed=5;
  const moving=t.at([.3,1.5*r]);const op={kind:'inside-reverse',line:{via:'free',through:[t.at([r/4,1.25*r]),t.at([r/4,1.75*r])]},moving,seed:{scope:'depth',at:moving,layers:1}};
  record('first-reverse-attempt',{op,analysis:t.e.compound_analysis(t.state,op)});
  t.add(op,'6: Inside-reverse the front tip.');completed=6;
 }catch(error){record('failure',{message:error.message,log:t.log});}
 publish(t,'https://origami.me/dove/',{sourceSteps:16,sourceStepsCompleted:completed,sourceDiagramsReviewed:17,audit:'pending visual review'});
}
