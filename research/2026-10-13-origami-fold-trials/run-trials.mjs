import {Trial,pack} from './trial-lib.mjs';
const r=Math.SQRT1_2;
const cicada=new Trial('cicada','Cicada — Origami.me');
try {
 cicada.rotate(45,'Orientation: square to diamond');
 cicada.pp([0,0],[0,2*r],'1: lower tip to upper tip');
 cicada.pp([-r,r],[0,2*r],'2a: left corner to peak');
 cicada.pp([r,r],[0,2*r],'2b: right corner to peak');
 cicada.line([-r/2,1.5*r],[0,1.43*r],[-.08,1.8*r],'3a: left wing folded down',{scope:1});
 cicada.line([0,1.43*r],[r/2,1.5*r],[.08,1.8*r],'3b: right wing folded down',{scope:1});
 cicada.line([-.21,1.7*r],[.21,1.7*r],[0,1.9*r],'4: one top layer down',{scope:1});
 cicada.line([-.24,1.66*r],[.24,1.66*r],[0,1.9*r],'5: remaining tip down, leaving a band');
 cicada.line([-.20,1.57*r],[.20,1.57*r],[0,1.65*r],'6: fold upper band down');
 cicada.line([-.17,1.57*r],[-.115,.65],[-.28,1.02],'7a: left side behind',{kind:'mountain'});
 cicada.line([.17,1.57*r],[.115,.65],[.28,1.02],'7b: right side behind',{kind:'mountain'});
} catch(e){console.log('CICADA PICK',e.message);}
cicada.save('complete flat sequence');
pack([cicada]);
const swan=new Trial('swan','Swan — Origami.me');
try {
 swan.rotate(45,'Orientation: square to diamond');
 swan.line([0,0],[0,2*r],[.2,r],'1: center precrease',{kind:'precrease'});
 swan.line([0,0],[-(Math.SQRT2-1),1],[-.5,r],'2a: lower left edge to center');
 swan.line([0,0],[(Math.SQRT2-1),1],[.5,r],'2b: lower right edge to center');
 swan.turn('3: turn over the kite');
 const k=Math.tan(Math.PI/16), y=2*r/(1+k);
 swan.line([0,0],[-k*y,y],[-.3,.95],'4a: narrow left side again');
 swan.line([0,0],[k*y,y],[.3,.95],'4b: narrow right side again');
 swan.pp([0,0],[0,2*r],'5: long tip up');
 swan.line([-.025,1.27],[.025,1.27],[.008,1.37],'7: head tip down',{scope:1});
 swan.line([0,r],[0,1.27],[.06,1.06],'8: mountain half fold',{kind:'mountain'});
} catch(e){console.log('SWAN STOP',e.message);}
swan.save('through body half fold; neck and head swivel next');pack([cicada,swan]);
const heart=new Trial('heart','Heart — Origami.me');
try {
 heart.line([.5,0],[.5,1],[.8,.4],'1: vertical center precrease',{kind:'precrease'});
 heart.line([0,.5],[1,.5],[.4,.2],'2: horizontal center precrease',{kind:'precrease'});
 heart.pp([.5,0],[.5,.5],'3: bottom edge to center');
 heart.turn('4: turn over');
 heart.line([-.5,.25],[-1,.75],[-.9,.35],'5a: left bottom edge to center');
 heart.line([-.5,.25],[0,.75],[-.1,.35],'5b: right bottom edge to center');
 heart.turn('6: turn over');
 heart.line([.125,.625],[.5,1],[.1,.9],'7a: upper left edge inward');
 heart.line([.5,1],[.875,.625],[.9,.9],'7b: upper right edge inward');
 heart.line([.15,.625],[.85,.625],[.48,.9],'8 probe: lower the upper flap using one top layer',{scope:1});
} catch(e){console.log('HEART STOP',e.message);}
heart.save('through step 7 plus accepted-but-wrong step 8 probe; final deliverable omits probe');
const box=new Trial('box','Masu box — Origami.me');
try {
 box.line([.5,0],[.5,1],[.8,.3],'1a: vertical center precrease',{kind:'precrease'});
 box.line([0,.5],[1,.5],[.3,.2],'1b: horizontal center precrease',{kind:'precrease'});
 box.pp([0,0],[.5,.5],'2: first corner to center');
 box.pp([1,0],[.5,.5],'3a: second corner to center');
 box.pp([1,1],[.5,.5],'3b: third corner to center');
 box.pp([0,1],[.5,.5],'3c: fourth corner to center');
 box.rotate(45,'4: orient the blintz as a square');
 box.line([-.3535533905932738,.8838834764831844],[.3535533905932738,.8838834764831844],[.1,1.01],'4a: upper edge to center and unfold',{kind:'precrease'});
 box.line([-.3535533905932738,.5303300858899107],[.3535533905932738,.5303300858899107],[.1,.4],'4b: lower edge to center and unfold',{kind:'precrease'});
} catch(e){console.log('BOX STOP',e.message);}
try {
 for(const [crease,at] of [[[.78,.72],[.8055555555555551,.805555555555555]],[[.28,.22],[.1944444444444444,.1944444444444444]]]) {
 box.add({kind:'unfold',crease,direction:'valley',moving:at,seed:{scope:'flaps',at:[at]}},'5: unfold one blintz flap');
 }
 box.line([-r/4,.53],[-r/4,.88],[-.3,r],'6a: left wall precrease',{kind:'precrease'});
 box.line([r/4,.53],[r/4,.88],[.3,r],'6b: right wall precrease',{kind:'precrease'});
} catch(e){console.log('BOX OPEN STOP',e.message);}
box.save('flat preparation; 90-degree walls require nonflat state');pack([cicada,swan,heart,box]);
const crane=new Trial('crane','Crane — Origami.me');
try {
 // A familiar sequential square-base route replaces the simultaneous collapse in source step 4.
 crane.pp([1,1],[0,0],'4a: diagonal fold to begin square base');
 crane.pp([1,0],[0,1],'4b: triangle in half');
 crane.add({kind:'squash',flap:[.5,.1],direction:'valley'},'4c: squash front pocket');
 crane.turn('4d: turn over square-base preparation');
 crane.add({kind:'squash',flap:[.09629426024596952,.7078284734910991],direction:'valley'},'4e: squash other pocket');
 const fs=await import('node:fs');
 const known=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/fold-examples/petal-fold.osf',import.meta.url))).workspace.foldSequences[0];
 for(const [i,s] of known.steps.slice(5).entries()) crane.add(s.op,['5a: left petal precrease','5b: right petal precrease','6–8: lift the front petal over its hinge','9: turn over','10a: left petal precrease','10b: right petal precrease','11: lift the back petal to finish bird base'][i],s.choices);
 crane.rotate(45,'Orient bird base with split points downward');
} catch(e){console.log('CRANE STOP',e.message);}
try {
 const k=Math.tan(Math.PI/16);
 crane.line([0,0],[-k*.5,.5],[-.11,.4],'12a: narrow front left',{scope:1});
 crane.line([0,0],[k*.5,.5],[.11,.4],'12b: narrow front right',{scope:1});
 crane.turn('13: turn over');
 crane.line([0,0],[-k*.5,.5],[-.11,.4],'14a: narrow back left',{scope:1});
 crane.line([0,0],[k*.5,.5],[.11,.4],'14b: narrow back right',{scope:1});
} catch(e){console.log('CRANE NARROW STOP',e.message);}
try {
 crane.line([0,.1],[0,.9],[.025,.35],'15: front page right to left',{scope:1});
 crane.turn('16: turn over');
 crane.line([0,.1],[0,.9],[.025,.35],'17: back page right to left',{scope:1});
 crane.line([-.04,.5],[.04,.5],[-.012,.1],'18: raise first narrow point',{scope:1});
 crane.turn('19: turn over');
 crane.line([-.04,.5],[.04,.5],[-.012,.1],'20: raise second narrow point',{scope:1});
 crane.line([0,.51],[0,.9],[.025,.65],'21: turn front page back',{scope:1});
 crane.turn('22: turn over');
 crane.line([0,.51],[0,.9],[.025,.65],'23: turn back page back',{scope:1});
} catch(e){console.log('CRANE NECK STOP',e.message);}
crane.save('tutorial-order attempt through source step 23; swivel probe follows');pack([cicada,swan,heart,box,crane]);
