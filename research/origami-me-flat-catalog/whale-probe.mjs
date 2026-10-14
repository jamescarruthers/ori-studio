import fs from 'node:fs';import {Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';
const t=new Trial('whale-control','Control',{shape:{kind:'square'},startSide:'back'}),r=Math.SQRT1_2,top=Math.SQRT2;
t.add({kind:'rotate',rotate:{amount:'eighth',direction:'cw'}},'Control orientation');t.line([0,0],[0,top],[.3,.7],'Control spine',{kind:'precrease'});
const op={kind:'rabbit-ear',corners:[[0,0],[0,top],[-r,r]].map(p=>t.at(p)),emergent:[1,0],seed:{scope:'flaps',at:[t.at([-.3,.7])]},stayer:t.at([.1,.3]),direction:'valley'};
const analysis=t.e.compound_analysis(t.state,op);console.log(JSON.stringify(analysis));
const result=t.e.apply(t.state,op);console.log(JSON.stringify(result.status==='ok'?t.e.scene(result.state).faces.map(f=>({front:f.front_up,outline:f.outline})):result));fs.writeFileSync(new URL('batches/whale-control-probe.json',import.meta.url),JSON.stringify({op,analysis,result},null,2));
if(result.status==='ok'){
 t.add(op,'Control: left ear without source precreases');
 const second={kind:'rabbit-ear',corners:[[0,0],[0,top],[r,r]].map(p=>t.at(p)),emergent:[0,1],seed:{scope:'flaps',at:[t.at([.3,.7])]},stayer:t.at([-.1,.3],'bottom'),direction:'valley'};
 const result2=t.e.apply(t.state,second);console.log(JSON.stringify({second,result2:result2.status==='ok'?t.e.scene(result2.state).faces.map(f=>({front:f.front_up,outline:f.outline})):result2}));
 fs.writeFileSync(new URL('batches/whale-control-second-ear.json',import.meta.url),JSON.stringify({second,result:result2},null,2));
}
