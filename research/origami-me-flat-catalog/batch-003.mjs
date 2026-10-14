import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const point=at=>({kind:'point',at});
const record=(name,data)=>fs.writeFileSync(path.join(dir,'batches',name+'.json'),JSON.stringify(data,null,2)+'\n');
export function envelope(){
 const h=Math.SQRT1_2;
 const t=new Trial('paper-envelope','Paper Envelope — partial (batch 3)',{shape:{kind:'rectangle',aspect:[1,h]},startSide:'back'});
 const xy=([x,y])=>[x-1,y*h];
 const at=(p,layer=0)=>t.at(xy(p),layer);
 const line=(a,b,m,note,opts)=>t.line(xy(a),xy(b),xy(m),note,opts);
 let completed=0;
 try{
  for(const [a,b,m] of [[[.5,0],[.5,.1],[.6,.05]],[[.5,.9],[.5,1],[.6,.95]],[[0,.5],[.08,.5],[.04,.6]],[[.92,.5],[1,.5],[.96,.6]]]){
   t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[at(a),at(b)]},moving:at(m),seed:{scope:'all'},extent:{kind:'segment',from:point(at(a)),to:point(at(b))}},'1: Make one of four short midpoint pinch marks. Source: https://origami.me/paper-envelope/');
  }completed=1;
  line([.25,0],[.25,1],[.1,.3],'2a: Precrease the left quarter line.',{kind:'precrease'});
  line([.75,0],[.75,1],[.9,.3],'2b: Precrease the right quarter line.',{kind:'precrease'});completed=2;
  line([0,.08],[1,.08],[.4,.03],'3: Precrease a narrow bottom strip, chosen height 8% (approximate reference).',{kind:'precrease'});completed=3;
  line([0,.75],[1,.75],[.4,.9],'4: Precrease the top quarter line.',{kind:'precrease'});completed=4;
  // A 45-degree diagonal through the quarter-line intersection.
  const shift=.25*h;
  line([0,.75-.25/h],[.25+shift,1],[.08,.9],'5: Precrease the upper-left diagonal through the quarter-line crossing.',{kind:'precrease'});completed=5;
  line([0,.75],[shift,1],[.025,.95],'6: Fold the upper-left corner to the top-quarter horizontal crease.');completed=6;
  line([.25,0],[.25,1],[.1,.4],'7: Fold the left edge to the center.');completed=7;
  const fold=at([.25,.7]);
  const op={kind:'swivel',via:'edge',fold,edge:at([.5,.65]),target:{via:'free',through:[at([.3,.75-.25/h]),at([.45,.75-.25/h])]},direction:'valley',swivel:'open'};
  const result=t.e.apply(t.state,op);record('paper-envelope-swivel-attempt',{sourceStep:'8–9',op,result});
  if(result.status!=='ok') throw new Error('Swivel refused: '+result.refusal?.code);
  t.add(op,'8–9: Swivel the corner and flatten, keeping only the flat endpoint.');completed=9;
 }catch(error){record('paper-envelope-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/paper-envelope/',{sourceStepsCompleted:completed,sourceSteps:14,audit:'in progress',blockedAtSourceStep:completed+1});
}
if(process.argv[2]==='paper-envelope') envelope();

export function necktie(){
 const t=new Trial('necktie','Necktie — partial (batch 3)',{shape:{kind:'square'},startSide:'back'});
 const r=Math.SQRT1_2,top=Math.SQRT2,k=top-1;
 let completed=0;
 let valid;
 try{
  t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'1a: Orient white-side-up paper as a diamond. Source: https://origami.me/necktie/');
  t.line([0,0],[0,top],[.3,.7],'1b: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
  t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[t.at([-.05,r]),t.at([.05,r])]},moving:t.at([0,r+.1]),seed:{scope:'all'},extent:{kind:'segment',from:point(t.at([-.05,r])),to:point(t.at([.05,r]))}},'2: Pinch the middle of the horizontal diagonal.');completed=2;
  t.line([0,top],[-k,k],[-.5,.7],'3a: Fold the left side to the center.');
  t.line([0,top],[k,k],[.5,.7],'3b: Repeat on the right.');completed=3;
  t.pp([0,top],[0,k],'4: Fold the upper point to the bottom of the colored portion.');completed=4;
  valid={state:t.state,states:[...t.states],steps:[...t.doc.steps],log:[...t.log]};
  t.turn('5a: Turn over.');
  t.line([-.2,r],[.2,r],[.01,.8],'5b: Fold the front upper part downward at the pinch, leaving the back flap unfolded.',{scope:1});completed=5;
  t.turn('6a: Turn over.');
  t.line([-.065,r],[-.207,.207],[-.3,.55],'6b: Narrow the left body. Approximate diagram crease through (-0.065, 0.7071) and (-0.207, 0.207).');completed=6;
  const op={kind:'squash',flap:t.at([-.015,.61]),direction:'valley'};
  const result=t.e.apply(t.state,op);record('necktie-squash-attempt',{sourceStep:7,op,result});
  if(result.status!=='ok') throw new Error('Squash refused: '+result.refusal?.code);
  t.add(op,'7: Squash the left knot flap.');completed=7;
 }catch(error){record('necktie-failure',{completed,message:error.message,attempts:t.log});}
 // Source 5's protected back flap was carried by the connected block: only 1–4 match.
 record('necktie-invalid-downstream',{steps:t.doc.steps,states:t.states,log:t.log});
 if(valid){t.state=valid.state;t.states=valid.states;t.doc.steps=valid.steps;t.log=valid.log;completed=4;}
 return publish(t,'https://origami.me/necktie/',{sourceStepsCompleted:completed,sourceSteps:10,audit:'in progress',blockedAtSourceStep:completed+1});
}
if(process.argv[2]==='necktie') necktie();

export function angelfish(){
 const t=new Trial('angelfish','Angelfish — Origami.me (batch 3)');
 t.line([.5,0],[.5,1],[.8,.3],'1a: Precrease side to side. Source: https://origami.me/angelfish/',{kind:'precrease'});
 t.line([0,.5],[1,.5],[.3,.8],'1b: Precrease top to bottom.',{kind:'precrease'});
 t.turn('2: Turn over to the white side.');
 t.line([-1,0],[0,1],[-.8,.7],'3a: Precrease one diagonal.',{kind:'precrease'});
 t.line([-1,1],[0,0],[-.8,.3],'3b: Precrease the other diagonal.',{kind:'precrease'});
 t.line([-1,.5],[0,.5],[-.4,.8],'4a: Begin the waterbomb collapse by closing the horizontal half fold.');
 t.line([-.5,0],[-.5,.5],[-.2,.2],'4b: Close the vertical half fold.');
 const op={kind:'squash',flap:t.at([-.9,.4]),direction:'valley'};
 record('angelfish-base-probe',{op,result:t.e.apply(t.state,op),scene:t.scene()});
 t.add(op,'4c: Squash the front waterbomb pocket.');
 t.turn('4d: Turn over to flatten the second pocket.');
 t.add({kind:'squash',flap:t.at([.9,.4]),direction:'valley'},'4e: Squash the second waterbomb pocket.');
 record('angelfish-base-scene',t.scene());
 t.line([.5,.5],[1/3,0],[.1,.04],'5: Fold the front left corner down, using the approximate one-third base reference.',{scope:1});
 t.line([.5,.5],[2/3,0],[.9,.04],'6: Fold the front right corner down over the first fin.',{scope:1});
 t.turn('7: Turn over to expose the clean body.');
 t.add({kind:'rotate',rotate:{amount:'quarter',direction:'cw'}},'Display: rotate to match the completed fish illustration.');
 return publish(t,'https://origami.me/angelfish/',{audit:'pending visual review',sourceStepsCompleted:7,sourceSteps:7,proportions:'Symmetric fin creases cross the base at one-third and two-thirds; the source says about one-third.'});
}
if(process.argv[2]==='angelfish') angelfish();

export function christmasTree(){
 const t=new Trial('christmas-tree','Christmas Tree — Origami.me (batch 3)',{shape:{kind:'square'},startSide:'back'});
 const top=Math.SQRT2,r=Math.SQRT1_2,k=top-1;
 t.line([-1,1],[0,0],[-.8,.3],'1: Precrease a diagonal. Source: https://origami.me/christmas-tree/',{kind:'precrease'});
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'2: Orient the precrease vertically as a diamond.');
 t.line([0,top],[-k,k],[-.5,.7],'3a: Bring the upper-left edge to the center.');
 t.line([0,top],[k,k],[.5,.7],'3b: Repeat on the right.');
 t.pp([0,0],[0,top],'4: Bring the bottom corner to the top corner.');
 t.line([0,top],[-k*r,r],[-.3,1.03],'5a: Bring the front upper-left edge to the center.',{scope:1});
 t.line([0,top],[k*r,r],[.3,1.03],'5b: Repeat on the right.',{scope:1});
 record('christmas-tree-step5-scene',t.scene());
 const cornerX=3-2*top;
 const lowerReference=r+k*(k*r-cornerX);
 const hinge=(1+lowerReference)/2;
 t.line([-.12,hinge],[.12,hinge],[.01,1.3],'6: Lower the front tip, aligning the colored boundary corners with the lower oblique edges.',{scope:1});
 const low=2*hinge-top;
 t.pp([0,low],[0,r],'7: Raise the new bottom tip to the lower edge of the colored triangle.');
 t.turn('8: Turn over to the tree and white planter.');
 return publish(t,'https://origami.me/christmas-tree/',{sourceStepsCompleted:8,sourceSteps:8,audit:'pending visual review',proportions:'Step 6 aligns both boundary corners with the lower oblique edges, as marked in the source.'});
}
if(process.argv[2]==='christmas-tree') christmasTree();

export function rectangleToSquare(){
 const h=Math.SQRT1_2;
 const t=new Trial('rectangle-paper-to-square','Rectangle to square — before cutting (batch 3)',{shape:{kind:'rectangle',aspect:[1,h]},startSide:'front'});
 t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[[h-.1,h-.1],[h,h]]},moving:[h-.12,h-.04],seed:{scope:'all'},extent:{kind:'segment',from:point([h-.1,h-.1]),to:point([h,h])}},'1: Pinch near the upper edge by bringing the left edge onto the bottom edge. Source: https://origami.me/rectangle-paper-to-square/');
 t.line([h,0],[h,h],[.9,.4],'2: Precrease the strip boundary vertically through the pinch mark.',{kind:'precrease'});
 return publish(t,'https://origami.me/rectangle-paper-to-square/',{sourceStepsCompleted:2,sourceSteps:3,blockedAtSourceStep:3,audit:'partial: cut operation absent from public Fold operation schema'});
}
if(process.argv[2]==='rectangle-paper-to-square') rectangleToSquare();

export function simpleFish(){
 const t=new Trial('fish','Fish — Origami.me (batch 3)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,h=.43,k=Math.SQRT2-1;
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond orientation. Source: https://origami.me/fish/');
 t.pp([0,2*r],[0,0],'1: Fold the upper corner down to the lower corner.');
 t.line([-.4,h],[.4,h],[.01,.05],'2: Raise the front lower corner; chosen hinge y=0.43 (no exact source reference).',{scope:1});
 t.line([-h,h],[h*k,h*k],[.01,.05],'3: Bring the remaining lower-left edge onto the previous horizontal fold.',{scope:1});
 t.line([-h,h],[h*k,.235],[.16,.4],'4: Pleat the lower flap back down; chosen inner hinge endpoint y=0.235.',{scope:1});
 t.line([-.39,r],[-.30,.38],[-.60,.66],'5: Fold the left corner rightward to start the tail; approximate diagram proportion.');
 record('fish-step5-scene',t.scene());
 t.line([-.39,r],[-.17,.56],[-.16,.82],'6: Fold the tail back to the left; approximate second pleat hinge.',{scope:1});
 t.turn('7: Turn over.');
 t.pp([-r,r],[-h*k,h*k],'8: Fold the head corner onto the lower body corner.');
 return publish(t,'https://origami.me/fish/',{sourceStepsCompleted:8,sourceSteps:8,audit:'pending visual review',proportions:'Steps 2, 4, 5, 6 use explicit approximate proportions; head alignment is exact.'});
}
if(process.argv[2]==='fish') simpleFish();

export function whale(){
 const t=new Trial('whale','Whale — partial before fish-base collapse (batch 3)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,top=Math.SQRT2,k=top-1;
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/whale/');
 t.line([0,0],[0,top],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});
 t.line([-r,r],[r,r],[.1,.3],'2: Precrease the horizontal diagonal.',{kind:'precrease'});
 t.line([0,0],[-k,1],[-.5,.7],'3a: Precrease lower-left edge to center.',{kind:'precrease'});
 t.line([0,0],[k,1],[.5,.7],'3b: Repeat on the lower right.',{kind:'precrease'});
 t.line([0,top],[-k,k],[-.5,.7],'4a: Precrease upper-left edge to center.',{kind:'precrease'});
 t.line([0,top],[k,k],[.5,.7],'4b: Repeat on the upper right.',{kind:'precrease'});
 const op={kind:'rabbit-ear',corners:[[0,0],[0,top],[-r,r]].map(p=>t.at(p)),emergent:[1,0],seed:{scope:'flaps',at:[t.at([-.3,.7])]},stayer:t.at([.1,.3]),direction:'valley'};
 const result=t.e.apply(t.state,op);record('whale-fish-base-attempt',{sourceStep:5,op,result});
 if(result.status==='ok')t.add(op,'5a: Collapse the left half of the fish base.');
 return publish(t,'https://origami.me/whale/',{sourceStepsCompleted:4,sourceSteps:10,blockedAtSourceStep:5,audit:'partial: fish base investigation'});
}
if(process.argv[2]==='whale') whale();

export function kimono(){
 const t=new Trial('kimono','Kimono — Origami.me (batch 3)',{shape:{kind:'square'},startSide:'back'}),s=.07;
 let completed=0;
 try{
 t.line([-.5,0],[-.5,1],[-.8,.4],'1: Precrease vertically. Source: https://origami.me/kimono/',{kind:'precrease'});completed=1;
 t.pp([-.5,0],[-.5,1],'2: Fold the lower half upward.');completed=2;
 t.line([-1,1-s],[0,1-s],[-.4,.97],'3: Precrease a narrow top strip (7% of the sheet).',{kind:'precrease',scope:1});completed=3;
 t.line([-1,1-s],[-.5-s,.5],[-.9,.55],'4a: Fold the lower-left corner, aligning its side with the strip crease.');
 t.line([0,1-s],[-.5+s,.5],[-.1,.55],'4b: Repeat on the right.');completed=4;
 t.line([-1,1-s],[0,1-s],[-.4,.97],'5a: Fold the front top strip down.',{scope:1});
 t.turn('5b: Turn over.');completed=5;
 t.line([0,1-s],[1,1-s],[.4,.97],'6: Fold the remaining top strip down to match.',{scope:1});completed=6;
 t.line([.5,1-s],[.25,.68],[.08,.9],'7a: Fold the left upper edge down to the middle.');
 t.line([.5,1-s],[.75,.68],[.92,.9],'7b: Repeat on the right.');
 t.turn('7c: Turn over.');completed=7;
 record('kimono-before-sleeves',t.scene());
 }catch(error){record('kimono-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/kimono/',{sourceStepsCompleted:completed,sourceSteps:8,audit:'pending visual review',proportions:'Top strip is 7% of the square width.'});
}
if(process.argv[2]==='kimono') kimono();

export function pigeon(){
 const t=new Trial('pigeon','Pigeon — Origami.me (batch 3)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2;
 let completed=0;
 try{
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/pigeon/');
 t.line([0,0],[0,2*r],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
 t.pp([0,2*r],[0,0],'2: Fold the upper corner down.');completed=2;
 t.line([-.4,2*r/3],[.4,2*r/3],[.01,.05],'3: Raise both lower layers at the one-third height reference.');completed=3;
 t.line([-.25,7*r/9],[.25,7*r/9],[.01,.9],'4: Lower only the front raised corner; crease one-third up the lower band.',{scope:1});completed=4;
 t.line([0,.3],[0,.8],[.3,.65],'5: Close right to left.');completed=5;
 t.rotate(90,'6: Rotate counterclockwise a quarter turn.');completed=6;
 t.line([-.7,-r/3],[-.4,-r/3],[-.68,-.6],'7: Raise the front wing at y=-r/3, leaving the rear wing down.',{scope:1});completed=7;
 t.turn('8: Turn over.');completed=8;
 t.line([.4,-r/3],[.7,-r/3],[.68,-.6],'9: Raise the second wing to meet the first.',{scope:1});completed=9;
 record('pigeon-before-beak',t.scene());
 t.line([.23,-.0728651597363232],[.39,0],[.19,-.01],'10: Precrease the beak; approximate line through (0.23,-0.072865) and (0.39,0).',{kind:'precrease',scope:2});completed=10;
 const op={kind:'inside-reverse',line:{via:'free',through:[t.at([.23,-.0728651597363232]),t.at([.39,0])]},moving:t.at([.19,-.01]),seed:{scope:'flaps',at:[t.at([.19,-.01])]}};
 record('pigeon-beak-local-attempt',{op,result:t.e.apply(t.state,op),analysis:t.e.compound_analysis(t.state,op)});
 t.add(op,'11: Reverse the beak inside, between the two head walls.');completed=11;
 }catch(error){record('pigeon-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/pigeon/',{sourceStepsCompleted:completed,sourceSteps:11,audit:'pending visual review',proportions:'Thirds used for steps 3–4; wing hinge y=-r/3.'});
}
if(process.argv[2]==='pigeon') pigeon();

export function santa(){
 const t=new Trial('santa','Santa — Origami.me (batch 3)',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,top=Math.SQRT2,k=top-1;
 const a=(top+1)/2,b=(a+1)/2,c=2*b-top;
 let completed=0;
 try{
 t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white-side-up diamond. Source: https://origami.me/santa/');
 t.line([0,0],[0,top],[.3,.7],'1a: Precrease vertically.',{kind:'precrease'});
 t.line([-r,r],[r,r],[.1,.3],'1b: Precrease horizontally.',{kind:'precrease'});completed=1;
 t.line([0,0],[-k,1],[-.5,.7],'2a: Bring the lower-left edge to the center.');
 t.line([0,0],[k,1],[.5,.7],'2b: Bring the lower-right edge to the center.');completed=2;
 t.pp([0,top],[0,1],'3: Precrease the upper tip onto the colored boundary; follow the double arrow showing unfolding.',{kind:'precrease'});completed=3;
 t.line([-.25,b],[.25,b],[0,1.35],'4: Lower the upper flap until the previous crease meets the colored boundary.');completed=4;
 t.line([-.05,(c+1)/2],[.05,(c+1)/2],[.01,c+.025],'5: Raise the front lower tip to the previous crease.',{scope:1});completed=5;
 t.line([-.2,1],[.2,1],[.01,.94],'6: Raise the bottom edge of the front flap along the existing crease.',{scope:1});completed=6;
 t.line([-.2,(1+b)/2],[.2,(1+b)/2],[.01,1.01],'7: Halve the top flap upward.',{scope:1});completed=7;
 t.turn('8: Turn over.');completed=8;
 t.line([-.15,top-.15/k],[-.27,top-.27/k],[-.32,1],'9a: Precrease the left short edge onto the middle.',{kind:'precrease'});
 t.line([.15,top-.15/k],[.27,top-.27/k],[.32,1],'9b: Repeat on the right.',{kind:'precrease'});completed=9;
 t.turn('10a: Turn over.');
 const unfold=(crease,moving,note)=>{const m=t.at(moving);t.add({kind:'unfold',crease:t.at(crease),direction:'valley',moving:m,seed:{scope:'flaps',at:[m]}},note);};
 unfold([-k*.5,.5],[-.08,.5],'10b: Open the left long flap.');
 unfold([k*.5,.5],[.08,.5],'10c: Open the right long flap.');completed=10;
 record('santa-opened-flaps',t.scene());
 const vx=2-Math.SQRT2,vy=2*Math.SQRT2-2,dx=Math.tan(Math.PI/16)*.15;
 t.line([-vx,vy],[-vx+dx,vy-.15],[-.67,r],'11a: Align the upper-left outer edge with the nearest crease.');
 t.line([vx,vy],[vx-dx,vy-.15],[.67,r],'11b: Repeat on the right.');completed=11;
 t.line([0,0],[-k,1],[-.5,.65],'12a: Refold the left long flap on its existing hinge.');
 t.line([0,0],[k,1],[.5,.65],'12b: Refold the right long flap on its existing hinge.');completed=12;
 t.line([-.2,r],[.2,r],[.01,.1],'13: Fold the lower flap behind at the horizontal diagonal.',{kind:'mountain'});completed=13;
 t.line([-.15,top-.15/k],[-.27,top-.27/k],[-.32,1],'14a: Fold the left side fully behind along its precrease.',{kind:'mountain'});
 t.line([.15,top-.15/k],[.27,top-.27/k],[.32,1],'14b: Fold the right side fully behind. The source offers an optional stand; this model uses its flat finish.',{kind:'mountain'});completed=14;
 }catch(error){record('santa-failure',{completed,message:error.message,attempts:t.log});}
 return publish(t,'https://origami.me/santa/',{sourceStepsCompleted:completed,sourceSteps:14,audit:'pending visual review',proportions:'Exact existing crease and edge references; optional standing pose omitted, fully flattened source finish retained.'});
}
if(process.argv[2]==='santa') santa();
