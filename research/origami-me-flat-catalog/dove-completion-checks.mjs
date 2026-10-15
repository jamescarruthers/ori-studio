import fs from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{Trial}from'../2026-10-13-origami-fold-trials/trial-lib.mjs';import{sameMaterial}from'./bird-crow-opening.mjs';
const doc=JSON.parse(fs.readFileSync('artifacts/blocker-continuation/dove-final.json')).doc,t=new Trial('dove-verify',doc.title,doc.paper);for(const n of doc.steps)t.add(n.op,n.note,n.choices);
const inv=(m,p)=>{const[a,b,c,d,e,f]=m,x=p[0]-c,y=p[1]-f,k=a*e-b*d;return[(e*x-b*y)/k,(-d*x+a*y)/k]},apply=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2],m[3]*p[0]+m[4]*p[1]+m[5]],near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,centroid=p=>[p.reduce((s,p)=>s+p.x,0)/p.length,p.reduce((s,p)=>s+p.y,0)/p.length];
const inside=(p,poly)=>{const ds=poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])});return ds.every(d=>d>=-1e-9)||ds.every(d=>d<=1e-9)};
const checks=[];for(const n of [10,11,14,20,21])checks.push(sameMaterial(t,t.states[n-1],t.states[n],`Precrease ${n} keeps material and full stack`));
for(const index of [12,15,22]){
 const b=t.e.scene(t.states[index-1]),a=t.e.scene(t.states[index]),report=t.log[index-1].result.compound,polys=b.faces.map((f,i)=>f.outline.map(p=>inv(b.face_transforms[i],[p.x,p.y]))),movingIds=new Set(report.blocks.flat()),stationary=[];let witnesses=0;
 for(const [i,f]of a.faces.entries()){
  const p=centroid(f.outline),sheet=inv(a.face_transforms[i],p),j=polys.findIndex(poly=>inside(sheet,poly));assert(j>=0);const old=apply(b.face_transforms[j],sheet);let expected=old,flips=0;
  if(index===22){const r=Math.SQRT1_2,x=old[0]/r,y=old[1]/r;
   if(y< -1.5-1e-7&&y<x-1.5-1e-7){const reflect=(p,angle)=>{const x=p[0],y=p[1]+1.5*r;return[Math.cos(2*angle)*x+Math.sin(2*angle)*y,-1.5*r+Math.sin(2*angle)*x-Math.cos(2*angle)*y]};if(y<(1+Math.SQRT2)*x-1.5-1e-7){expected=reflect(expected,3*Math.PI/8);flips++;}expected=reflect(expected,Math.PI/4);flips++;}
  }else if(movingIds.has(a.lineage[i].id)){const m=inv(b.view_transform,old),l=report.line,dist=m[0]*l.n[0]+m[1]*l.n[1]-l.d;expected=apply(b.view_transform,[m[0]-2*dist*l.n[0],m[1]-2*dist*l.n[1]]);flips++;}
  assert(near(expected,p),`node ${index} material ${i}`);assert.equal(f.front_up,flips%2?!b.faces[j].front_up:b.faces[j].front_up);if(near(old,p))stationary.push({i,j});witnesses++;
 }
 let pairs=0;for(const cell of a.subfaces){const p=centroid(cell.polygon),order=cell.faces_top_to_bottom.map(i=>stationary.find(x=>x.i===i)).filter(Boolean),previous=b.subfaces.find(c=>inside(p,c.polygon.map(p=>[p.x,p.y])));if(!previous)continue;for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length;j++){const x=previous.faces_top_to_bottom.indexOf(order[i].j),y=previous.faces_top_to_bottom.indexOf(order[j].j);if(x<0||y<0)continue;assert(x<y,`node ${index} stationary order`);pairs++;}}
 assert(pairs>0);checks.push({node:index,materialWitnesses:witnesses,stationaryOrderPairs:pairs,openings:report.openings.length});
}
for(const i of [12,15,16,18,22,23]){const s=t.e.scene(t.states[i]);assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'colored visible side node '+i);}
const hashes=t.states.map(s=>createHash('sha256').update(JSON.stringify(t.e.canonical_keys(s).sort())).digest('hex')),fresh=new Trial('dove-fresh',doc.title,doc.paper);for(const [i,n]of doc.steps.entries()){fresh.add(n.op,n.note,n.choices);assert.equal(createHash('sha256').update(JSON.stringify(fresh.e.canonical_keys(fresh.state).sort())).digest('hex'),hashes[i+1]);}
fs.writeFileSync('artifacts/blocker-continuation/dove-validation.json',JSON.stringify({nodes:doc.steps.length,states:hashes.length,checks,stateHashes:hashes},null,2)+'\n');console.log(JSON.stringify(checks));
