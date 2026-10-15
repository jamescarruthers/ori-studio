// Reproduce the completed Dove from its preserved seven-node checkpoint.
// Writes diagnostic artifacts only; never overwrites a native model.
import fs from'node:fs';import assert from'node:assert/strict';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
const source='research/2026-10-13-origami-fold-trials/models/archive/checkpoints/dove-before-completion.osf';
const project=JSON.parse(fs.readFileSync(source)),doc=project.workspace.foldSequences[0];export const t=new Trial('dove',doc.title,doc.paper),r=Math.SQRT1_2;for(const n of doc.steps)t.add(n.op,n.note,n.choices);
export function save(label){const s=t.scene();fs.writeFileSync('artifacts/blocker-continuation/dove-'+label+'.json',JSON.stringify({doc:t.doc,log:t.log,scene:s},null,2));}
function reverse(a,b,m,n,layers=2){const at=t.at(m),op={kind:'inside-reverse',line:{via:'free',through:[t.at(a),t.at(b)]},moving:at,seed:layers==='all'?{scope:'all'}:{scope:'depth',at,layers}},analysis=t.e.compound_analysis(t.state,op);assert.equal(analysis.status,'ok',JSON.stringify(analysis));console.log('reverse analysis',JSON.stringify(analysis));const opening=analysis.analysis.flaps.map(f=>{const o=f.openings.filter(o=>o.upper.length===o.lower.length);assert.equal(o.length,1,JSON.stringify(f));return o[0].stored;});t.add(op,n,{opening});}
try{
t.turn('7: Turn over.');
t.line([0,r],[-r/2,1.5*r],[-.5,.8],'8a: Repeat the front triangular packet fold on the back.',{scope:1});
{const a=t.at([0,1.5*r]),b=t.at([-.07,1.5*r]),m=t.at([-.02,1.9*r]);t.add({kind:'precrease',direction:'valley',line:{via:'free',through:[a,b]},moving:m,seed:{scope:'depth',at:m,layers:1},extent:{kind:'segment',from:{kind:'point',at:a},to:{kind:'point',at:b}}},'8b: Repeat the midpoint pinch, 0.07 sheet units long.');}
t.line([-r/4,1.25*r],[-r/4,1.75*r],[-.3,1.5*r],'8c: Precrease the back tip to its midpoint mark.',{kind:'precrease',scope:1});
reverse([-r/4,1.25*r],[-r/4,1.75*r],[-.3,1.5*r],'8d: Reverse the two nested pairs on the back.');save('8');
t.add({kind:'turn',axis:'horizontal'},'9: Turn over from bottom to top.');save('9');
const h=[-r/10,-1.1*r],mid=[0,-1.5*r],head=[-.01*r,-1.05*r];
t.line(h,mid,head,'10: Precrease the beak. Free proportion: hinge from 10% along the upper diagonal to the right-edge midpoint.',{kind:'precrease'});
reverse(h,mid,head,'11: Inside reverse the beak on the prepared crease.','all');save('11');
t.line([-r/4,-1.25*r],mid,[-.05*r,-1.8*r],'12: Lift the first wing along the upper diagonal.',{scope:1});save('12');
t.turn('13a: Turn over to reach the second wing.');
t.line([r/4,-1.25*r],mid,[.05*r,-1.8*r],'13b: Lift the second wing along its matching upper diagonal.',{scope:1});
t.turn('13c: Return to the first side.');save('13');
const first=[[-r/4,-1.75*r],mid],q=(Math.SQRT2-1)/Math.SQRT2/2,second=[[-q*r,-(2-q)*r],mid],tip=[-.01*r,-1.9*r];
for(const [ends,note]of [[second,'14: Precrease the tail edge onto the diagonal body boundary.'],[first,'15: Precrease the tail on the diagonal body boundary.']]){
 const through=ends.map(p=>t.at(p)),moving=t.at(tip);t.add({kind:'precrease',direction:'valley',line:{via:'free',through},moving,seed:{scope:'all'},extent:{kind:'segment',from:{kind:'point',at:through[0]},to:{kind:'point',at:through[1]}}},note);
}
save('15');
const moving=t.at(tip),op={kind:'crimp',crimp:'inside',line:{via:'free',through:first.map(p=>t.at(p))},second:{via:'free',through:second.map(p=>t.at(p))},moving,seed:{scope:'depth',at:moving,layers:2}},a=t.e.compound_analysis(t.state,op);console.log('crimp analysis',JSON.stringify(a));
assert.equal(a.status,'ok',JSON.stringify(a));
const opening=a.analysis.tip.flaps.map(f=>{const os=f.openings.filter(o=>o.upper.length===o.lower.length);assert.equal(os.length,1,JSON.stringify(f));return os[0].stored;});
t.add(op,'16: Crimp the tail flat on its two prepared boundary-meeting hinges.',{opening});save('16');
t.rotate(70,'Presentation: rotate counterclockwise 70 degrees as shown in the tutorial.');save('final');
}catch(e){save('failure');throw e;}
