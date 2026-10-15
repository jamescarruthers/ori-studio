import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Trial } from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
import { publish } from './batch-001.mjs';
import { modelPath } from './model-paths.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(dir, '../../tests/fixtures/fold-examples/rabbit-ear-precreased-whale.json')));
export function whale() {
  const t = new Trial('whale', 'Whale — Origami.me', fixture.paper);
  for (const node of fixture.steps) t.add(node.op, node.note, node.choices);
  t.add(fixture.op, '5a: Collapse the left rabbit ear along the existing preparation creases, with its fin tip toward the upper corner.');
  t.add(fixture.second, '5b: Collapse the right rabbit ear; both fins point toward the upper tip.');
  const r = Math.SQRT1_2, k = Math.SQRT2 - 1, head = (Math.SQRT2 + 1) / 2;
  t.line([-.05, head], [.05, head], [.01, 1.3], '6a: Mountain fold the upper tip back to the level of the two ear tips (y=1).', {kind:'mountain'});
  t.turn('6b: Turn over to the plain colored face.');
  const side = k / 2;
  t.line([-side, .6], [-side, .8], [-.27, r], '7a: Fold the left corner inward on x=−(√2−1)/2; approximate diagram proportion, tip stays on the horizontal precrease.');
  t.line([side, .6], [side, .8], [.27, r], '7b: Repeat symmetrically on the right.');
  t.line([0, .2], [0, 1.1], [.1, .5], '8a: Fold the right half over the left half.');
  t.rotate(90, '8b: Rotate counterclockwise so the head is on the left and the tail on the right.');
  t.line([-r, 0], [-r-.1, -Math.sqrt(3)*.1], [-.9, -.025], '9a: Lower the exposed two-ply fin only. Chosen hinge is 60° to the horizontal; the diagram gives no exact angle.', {scope:2});
  t.turn('9b: Turn over to reach the other fin.');
  t.line([r, 0], [r+.1, -Math.sqrt(3)*.1], [.9, -.025], '9c: Lower the opposite two-ply fin along the mirrored hinge, leaving the body and first fin still.', {scope:2});
  t.turn('9d: Return to the source viewing side.');
  t.line([-.15, 0], [-.2, -.05], [-.04, -.005], '10: Mountain fold the tail behind the body along a 45° crease at x=−0.15 on the top edge. Approximate source proportion; ordinary mountain-fold option, not the optional outside reverse.', {kind:'mountain'});
  return t;
}

const near = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]) < 1e-8;
function stack(t, state, point) {
  const scene = t.e.scene(state);
  const cell = scene.subfaces.find(c => {
    const signs=c.polygon.map((v,j,poly)=>{const w=poly[(j+1)%poly.length];return(w.x-v.x)*(point[1]-v.y)-(w.y-v.y)*(point[0]-v.x);});
    return signs.every(x=>x>=-1e-9)||signs.every(x=>x<=1e-9);
  });
  assert(cell, `Paper at ${point}`);
  return cell.faces_top_to_bottom.map((_,i)=>t.at(point,i,state));
}
const reflection = (point, origin, unit) => {
  const d=point.map((x,i)=>x-origin[i]),dot=d[0]*unit[0]+d[1]*unit[1];
  return d.map((x,i)=>origin[i]+2*dot*unit[i]-x);
};

export function verifyWhale(t) {
  const evidence={source:'https://origami.me/whale/',checks:[]};
  const unchanged=(before,after,point,label)=>{
    const a=stack(t,t.states[before],point),b=stack(t,t.states[after],point);
    assert.equal(a.length,b.length,label);assert(a.every((p,i)=>near(p,b[i])),label);
    evidence.checks.push({label,point,before:a,after:b});
  };
  for(const [before,after,sign] of [[15,16,1],[17,18,-1]]) {
    for(const p of [[-1.1,-.03],[-.3,-.04]])unchanged(before,after,[sign*p[0],p[1]],'Fin fold preserves complete head/tail body stack');
    const p=[sign*-.9,-.025],q=reflection(p,[sign*-Math.SQRT1_2,0],[sign*.5,Math.sqrt(3)/2]);
    const a=stack(t,t.states[before],p),b=stack(t,t.states[after],q),remaining=stack(t,t.states[after],p);
    assert(near(a[0],b[1])&&near(a[1],b[0]),'Exactly the exposed two fin plies reverse onto the body');
    assert.equal(remaining.length,a.length-2);
    assert(remaining.every((p,i)=>near(p,a[i+2])),'Underlying material stays in place and in order');
    evidence.checks.push({label:'Fin material and order',beforeNode:before,afterNode:after,point:p,landing:q,before:a,after:b,remaining});
  }
  for(const p of [[-1.1,-.03],[-.65,-.1]])unchanged(19,20,p,'Tail fold preserves head and fin stacks');
  const p=[-.04,-.005],q=reflection(p,[-.15,0],[Math.SQRT1_2,Math.SQRT1_2]);
  const a=stack(t,t.states[19],p),b=stack(t,t.states[20],q);
  assert.equal(a.length,b.length);assert(a.every((p,i)=>near(p,b[b.length-1-i])),'All tail plies reverse together');
  evidence.checks.push({label:'Tail material and order',point:p,landing:q,before:a,after:b});
  for(let node=9;node<t.states.length;node++){
    const s=t.e.scene(t.states[node]);
    assert(s.subfaces.every(c=>s.faces[c.faces_top_to_bottom[0]].front_up),'All exposed material colored from completed fish base onward');
  }
  const final=t.scene();assert(final.subfaces.every(c=>final.faces[c.faces_top_to_bottom.at(-1)].front_up===false),'Reverse viewing side is also entirely colored');
  evidence.allExposedMaterialColoredFromNode=9;
  evidence.finalReverseSideColored=true;
  return evidence;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = whale();
  fs.mkdirSync(path.join(dir, '../../artifacts/whale-completion'), {recursive:true});
  fs.writeFileSync(path.join(dir, '../../artifacts/whale-completion/current.json'), JSON.stringify({doc:t.doc,scene:t.scene(),states:t.states},null,2));
  const evidence=verifyWhale(t);
  fs.writeFileSync(path.join(dir,'batches/whale.material-checks.json'),JSON.stringify(evidence,null,2)+'\n');
  if(process.argv.includes('--publish')){
    const existing=modelPath('whale'), bytes=fs.readFileSync(existing);
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'batches/whale.validation.json')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.fileSha256,'Preserve user changes');
    const archive=path.join(dir,'../2026-10-13-origami-fold-trials/models/archive/checkpoints/whale-before-rabbit-ear.osf');
    fs.mkdirSync(path.dirname(archive),{recursive:true});
    if(!fs.existsSync(archive))fs.copyFileSync(existing,archive,fs.constants.COPYFILE_EXCL);
    publish(t,'https://origami.me/whale/',{sourceSteps:10,sourceStepsCompleted:10,sourceDiagramsReviewed:11,
      audit:'pending visual review',proportions:'Side folds x=±(√2−1)/2, fins 60°, tail 45° through x=−0.15; source provides no exact measurements.',
      checks:['Complete material stacks preserved outside each fin and tail fold.','Each fin moves exactly its two exposed plies.','All tail plies reverse together.','All exposed final material is colored on both viewing sides.']});
  }
  console.log('Whale material and layer-order checks passed.');
}
