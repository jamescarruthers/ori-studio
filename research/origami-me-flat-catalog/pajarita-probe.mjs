import fs from 'node:fs';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';import{publish}from'./batch-001.mjs';
const rec=(n,x)=>fs.writeFileSync(new URL('batches/pajarita-'+n+'.json',import.meta.url),JSON.stringify(x,null,2)+'\n');
export function pajarita(){
const t=new Trial('pajarita','Pajarita — Origami.me (batch 4)',{shape:{kind:'square'},startSide:'back'});let completed=0;
try{
t.line([-1,0],[0,1],[-.7,.9],'1a: First diagonal precrease. Source: https://origami.me/pajarita/',{kind:'precrease'});t.line([-1,1],[0,0],[-.8,.2],'1b: Second diagonal precrease.',{kind:'precrease'});completed=1;
const corners=[[-1,0],[0,0],[0,1],[-1,1]],blintz=[];
for(const [i,p]of corners.entries()){const a=t.at(p),b=[.5,.5];blintz.push({crease:[(a[0]+.5)/2+.04*(a[1]-.5),(a[1]+.5)/2-.04*(a[0]-.5)],moving:[.8*a[0]+.1+.03*(a[1]-.5),.8*a[1]+.1-.03*(a[0]-.5)]});t.pp(p,[-.5,.5],i?'3: Repeat the blintz on the next corner.':'2: Fold the lower-left corner to the center.');}completed=3;
t.turn('4: Turn over.');completed=4;
for(const p of [[.5,0],[1,.5],[.5,1],[0,.5]])t.pp(p,[.5,.5],'5: Precrease this corner onto the center.',{kind:'precrease'});completed=5;
for(const x of blintz.toReversed())t.add({kind:'unfold',crease:x.crease,moving:x.moving,seed:{scope:'flaps',at:[x.moving]},direction:'mountain'},'6: Reopen the underlying blintz corner; the next diagram shows the full colored square.');completed=6;
t.line([.75,0],[.75,1],[.9,.3],'7: Bring the right edge to the vertical center crease.');completed=7;
const op={kind:'swivel',via:'edge',fold:t.at([.75,.3]),edge:t.at([.5,.1]),target:{via:'free',through:[t.at([.1,.5]),t.at([.4,.5])]},direction:'valley'};rec('first-swivel',{op,result:t.e.compound_analysis(t.state,op)});t.add(op,'8: Swivel the lower-right flap while raising the bottom edge to the horizontal center.');completed=8;
rec('after-first-swivel',t.scene());
}catch(error){rec('failure',{completed,message:error.message,attempts:t.log});}
return publish(t,'https://origami.me/pajarita/',{sourceStepsCompleted:completed,sourceSteps:13,audit:'pending visual review'});
}
if(process.argv[2]==='probe')pajarita();
