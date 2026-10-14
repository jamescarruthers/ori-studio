import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Trial } from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import { publish } from './batch-001.mjs';
const dir = path.dirname(fileURLToPath(import.meta.url));
const point = at => ({ kind: 'point', at });
const close = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]) < 1e-8;
const r = Math.SQRT1_2;

export function bookmark() {
  const t = new Trial('bookmark', 'Bookmark — Origami.me (batch 2)', {shape:{kind:'square'}, startSide:'back'});
  let completed = 0;
  try {
    t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}}, 'Set-up: white side up in a diamond orientation. Source: https://origami.me/bookmark/');
    t.line([-r,r],[r,r],[.03,1.2], '1: Make the horizontal diagonal precrease.', {kind:'precrease'}); completed=1;
    t.add({kind:'precrease',direction:'valley', line:{via:'free',through:[t.at([0,0]),t.at([0,2*r])]},
      moving:t.at([-.25,.5]),seed:{scope:'all'},extent:{kind:'segment',from:point(t.at([0,0])),to:point(t.at([0,r]))}},
      '2: Precrease only the lower half of the vertical diagonal.'); completed=2;
    const partialScene=t.scene();
    assert.equal(partialScene.crease_marks.length,1);
    fs.writeFileSync(path.join(dir,'batches/bookmark-partial-precrease.json'),JSON.stringify(partialScene.crease_marks,null,2)+'\n');
    t.pp([0,2*r],[0,r], '3: Bring the upper corner to the center.'); completed=3;
    t.pp([0,0],[0,r], '4: Bring the lower corner to the center.'); completed=4;
    t.line([-.4,r],[.4,r],[.02,.5], '5: Fold the lower half upward.'); completed=5;
    t.line([-r/2,1.5*r],[0,r],[-.5,.8], '6: Raise the left side, aligning the lower edge with the centerline.'); completed=6;
    t.line([r/2,1.5*r],[0,r],[.5,.8], '7: Repeat on the right side.'); completed=7;
    t.turn('8: Turn over to expose the pocket.'); completed=8;
    t.line([-.2,1.5*r],[.2,1.5*r],[.05,1.3], '9: Precrease both upper flaps down to the lower point, then leave them unfolded.', {kind:'precrease'}); completed=9;
    const moving=t.at([.05,1.3]);
    const op={kind:'tuck',direction:'valley',line:{via:'free',through:[t.at([-.2,1.5*r]),t.at([.2,1.5*r])]},
      moving,seed:{scope:'all'},target:t.at([.03,.9],1)};
    const witnesses=[[-.05,.9],[.05,.9],[-.2,1.02],[.2,1.02]];
    const before=witnesses.map(p=>t.at(p));
    const deeperOp={...op,target:[1/3,1/3]};
    const deeper=t.e.tuck(t.state,deeperOp);
    assert.equal(deeper.status,'ok');
    assert.equal(deeper.outcome,'landed');
    assert(witnesses.every((p,i)=>close(t.at(p,0,deeper.state),before[i])));
    const wrongStack=Array.from({length:8},(_,i)=>t.at([.03,.9],i,deeper.state));
    fs.writeFileSync(path.join(dir,'batches/bookmark-deeper-pocket.json'),JSON.stringify({op:deeperOp,result:deeper,exposedMaterialUnchanged:true,wrongStack},null,2)+'\n');
    const pocketPoints=[[-.03,.9],[.03,.9]];
    const pocketBefore=pocketPoints.map(p=>Array.from({length:6},(_,i)=>t.at(p,i)));
    const result=t.e.tuck(t.state,op);
    fs.writeFileSync(path.join(dir,'batches/bookmark-tuck-probe.json'),JSON.stringify({op,result,witnesses,before},null,2)+'\n');
    console.log('bookmark tuck',result.status,result.outcome??result.refusal?.code);
    assert.equal(result.status,'ok');
    let choices;
    if(result.outcome==='choose_order') {
      const matching=result.candidates.filter(c=>witnesses.every((p,i)=>close(t.at(p,0,c.state),before[i])));
      assert.equal(matching.length,1,'one order must keep the pocket wall exposed over both tucked flaps');
      choices=matching[0].stored;
    }
    t.add(op,'10: Tuck both upper flaps inside the pocket, between the two original folded-corner pocket walls.',choices); completed=10;
    witnesses.forEach((p,i)=>assert(close(t.at(p),before[i]),'the pocket wall must remain on top'));
    assert(!close(t.at([.03,.9],2),wrongStack[2]),'identical exposed material must not hide the different pocket slot');
    const pocketAfter=pocketPoints.map(p=>Array.from({length:8},(_,i)=>t.at(p,i)));
    pocketBefore.forEach((stack,p)=>stack.forEach((anchor,i)=>assert(close(anchor,pocketAfter[p][i<2?i:i+2]),'the tucked layers must enter between the original corner pocket walls')));
    fs.writeFileSync(path.join(dir,'batches/bookmark-pocket-witnesses.json'),JSON.stringify({pocketPoints,pocketBefore,pocketAfter,insertedDepths:[2,3]},null,2)+'\n');
    assert(Math.abs(t.bounds()[3]-1.5*r)<1e-8,'the top flaps must disappear inside the pocket');
    t.rotate(135,'Presentation: rotate the flat triangle to match the final source illustration.');
  } catch(error) {
    fs.writeFileSync(path.join(dir,'batches/bookmark-attempt-failure.json'),JSON.stringify({completed,message:error.message,attempts:t.log},null,2)+'\n');
    console.log('BOOKMARK STOP',completed,error.message);
  }
  return publish(t,'https://origami.me/bookmark/',{sourceStepsCompleted:completed,sourceSteps:10,audit:completed===10?'ready for user audit; all native nodes visually reviewed':'partial; investigate next step'});
}
if(process.argv[2]==='bookmark') bookmark();

export function dog() {
  const t = new Trial('dog', 'Dog — partial through source step 12 (batch 2)', {shape:{kind:'square'},startSide:'back'});
  const top=Math.SQRT2, k=top-1, p1=r-.07, top1=2*p1, p2=(top1+k)/2, p3=p2-.055, top2=2*p3-k;
  let completed=0;
  try {
    t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Set-up: white side up, diamond orientation. Source: https://origami.me/dog/');
    t.line([0,0],[0,top],[.3,.7],'1: Precrease the vertical diagonal.',{kind:'precrease'});completed=1;
    t.line([0,top],[-k,k],[-.5,.7],'2a: Align the upper-left edge with the centerline.');
    t.line([0,top],[k,k],[.5,.7],'2b: Repeat on the right.');completed=2;
    t.turn('3: Turn over.');completed=3;
    t.pp([0,top],[0,0],'4: Bring the top corner to the bottom corner.');completed=4;
    t.line([-.2,p1],[.2,p1],[.02,.05],'5: Raise the folded flap; first pleat width is 0.07 sheet units (approximate source reference).',{scope:2});completed=5;
    t.turn('6: Turn over to the open kite edges.');completed=6;
    t.pp([0,top1],[0,k],'7: Bring the top corner to the bottom edge of the colored portion.');completed=7;
    t.line([-.1,p3],[.1,p3],[.01,k+.04],'8: Raise the top flap; second pleat width is 0.055 sheet units (approximate source reference).',{scope:2});completed=8;
    t.pp([0,0],[0,k],'9: Raise the lower corner to the bottom edge of the colored portion.');completed=9;
    const p4=k/2+.06;
    t.line([-.08,p4],[.08,p4],[.01,k-.02],'10: Lower the small corner flap; tail pleat width is 0.06 sheet units (approximate).',{scope:1});completed=10;
    t.line([-.05,(top2+p3)/2],[.05,(top2+p3)/2],[.01,top2-.03],'11: Lower the top point to the bottom edge of the top pleat.',{scope:2});completed=11;
    t.line([0,.15],[0,.9],[.25,.4],'12a: Mountain-fold the right half behind the left half.',{kind:'mountain'});
    t.rotate(45,'12b: Orient the model to match diagram 13. The text says a quarter turn, but the drawing shows a 45-degree turn with a horizontal bottom edge.');completed=12;
  } catch(error) {
    fs.writeFileSync(path.join(dir,'batches/dog-attempt-failure.json'),JSON.stringify({completed,message:error.message,attempts:t.log},null,2)+'\n');
    console.log('DOG STOP',completed,error.message);
  }
  return publish(t,'https://origami.me/dog/',{sourceStepsCompleted:completed,sourceSteps:15,blockedAtSourceStep:13,audit:'partial; native nodes reviewed, step 13 unresolved',proportions:{p1,p2,p3,top1,top2}});
}
if(process.argv[2]==='dog') dog();
