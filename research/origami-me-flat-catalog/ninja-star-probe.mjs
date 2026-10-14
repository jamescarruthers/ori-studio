import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import {publish} from './batch-001.mjs';

for(const unit of ['a','b']) {
 const t=new Trial('ninja-star-'+unit,'Ninja Star — unit '+unit.toUpperCase()+' (assembly pending)',{shape:{kind:'square'},startSide:'back'});
 let completed=0;
 try {
  t.line([-.5,0],[-.5,1],[-.8,.3],'1a: Precrease the vertical center. Source: https://origami.me/ninja-star/',{kind:'precrease'});
  t.line([-1,.5],[0,.5],[-.8,.3],'1b: Precrease the horizontal center.',{kind:'precrease'});completed=1;
  t.line([-.75,0],[-.75,1],[-.9,.3],'2a: Bring the left edge to the center.');
  t.line([-.25,0],[-.25,1],[-.1,.3],'2b: Bring the right edge to the center.');completed=2;
  t.line([-.5,0],[-.5,1],[-.3,.3],'3: Fold the right half over the left.');completed=3;
  if(unit==='a'){
   t.pp([-.5,1],[-.75,.75],'4a: Fold the upper edge onto the left edge.');
   t.pp([-.75,0],[-.5,.25],'4b: Fold the lower edge onto the right edge.');completed=4;
   t.line([-.75,.5],[-.5,.75],[-.7,.9],'5a: Fold the upper tip to the right.',{scope:1});
   t.line([-.75,.25],[-.5,.5],[-.55,.1],'5b: Fold the lower tip to the left.',{scope:1});completed=5;
   t.rotate(45,'6: Rotate the first unit 45 degrees counterclockwise.');completed=6;
   t.turn('7: Turn the first unit over.');completed=7;
  }else{
   t.pp([-.75,1],[-.5,.75],'4a: Fold the upper edge onto the right edge.');
   t.pp([-.5,0],[-.75,.25],'4b: Fold the lower edge onto the left edge.');completed=4;
   t.line([-.75,.75],[-.5,.5],[-.55,.9],'5a: Fold the upper tip to the left.',{scope:1});
   t.line([-.75,.5],[-.5,.25],[-.7,.1],'5b: Fold the lower tip to the right.',{scope:1});completed=5;
   t.rotate(45,'6: Rotate the second unit 45 degrees counterclockwise to match diagram 7. Text says about 22 degrees, but that leaves its depicted horizontal/vertical outer edges diagonal.');completed=7;
  }
 }catch(error){fs.writeFileSync(new URL('batches/ninja-star-'+unit+'-failure.json',import.meta.url),JSON.stringify({completed,message:error.message,log:t.log},null,2)+'\n');}
 publish(t,'https://origami.me/ninja-star/',{sourceStepsCompleted:completed,sourceSteps:11,audit:'pending visual review',unit,assembly:'Not attempted: public Fold sequence has one paper and no assembly operation.'});
}
