import fs from 'node:fs';import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const t=new Trial('bird-control','Bird control'),r=Math.SQRT1_2;t.rotate(45);t.turn();t.pp([0,2*r],[0,0],'same triangle without precreases');t.pp([-r,r],[r,r],'same half without precreases');
const op={kind:'squash',flap:t.at([.15,.5]),direction:'valley'},result=t.e.apply(t.state,op);console.log(JSON.stringify(result.status==='ok'?{status:result.status}:result));fs.writeFileSync(new URL('batches/bird-uncreased-control.json',import.meta.url),JSON.stringify({op,result},null,2));
