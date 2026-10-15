import fs from 'node:fs';
import {Trial} from '../2026-10-13-origami-fold-trials/trial-lib.mjs';
const dir=new URL('./',import.meta.url);
const d=JSON.parse(fs.readFileSync(new URL('../2026-10-13-origami-fold-trials/models/in-progress/dog.osf',dir))).workspace.foldSequences[0];
const t=new Trial('probe-dog',d.title,d.paper);
for(const s of d.steps) t.add(s.op,s.note,s.choices);
const p3=(2*(Math.SQRT1_2-.07)+Math.SQRT2-1)/2-.055;
const x=-Math.SQRT1_2*p3;
const moving=t.at([-.6,.2]),line={via:'free',through:[t.at([x,.03]),t.at([x,.5])]};
const op={kind:'valley',line,moving,seed:{scope:'depth',at:moving,layers:1}};
const result=t.e.apply(t.state,op);
const tuck={...op,kind:'tuck',direction:'valley',target:t.at([-.56,.46])};
const tuckResult=t.e.tuck(t.state,tuck);
fs.writeFileSync(new URL('batches/dog-step13-probe.json',dir),JSON.stringify({source:'https://origami.me/dog/',sourceStep:13,view:{creaseX:x,moving:[-.6,.2],target:[-.56,.46]},op,result,tuck,tuckResult},null,2)+'\n');
console.log(JSON.stringify({plain:result.status,refusal:result.refusal,tuck:tuckResult.status,tuckRefusal:tuckResult.refusal,fixes:tuckResult.fixes},null,2));
const analysis=t.e.analyse(t.state,op);
const headPoint=[-.65,.63];
const headAnchor=t.at(headPoint);
// Candidate swivel: the same vertical crease, terminated at the head pleat.
// This probes the existing folded-edge operation, not a guard exemption.
const edgeView=[-(Math.SQRT1_2+(2-Math.SQRT2))/2,(1-Math.SQRT1_2)/2];
const targetA=[2*x-edgeView[0],edgeView[1]], targetB=[2*x+Math.SQRT1_2,1-Math.SQRT1_2];
const swivel={kind:'swivel',via:'edge',fold:t.at([x-.03,-x-.03]),edge:t.at(edgeView),target:{via:'free',through:[t.at(targetA),t.at(targetB)]},direction:'valley',swivel:'inside'};
let swivelResult;try{swivelResult=t.e.apply(t.state,swivel);}catch(e){swivelResult={error:String(e)}}
fs.writeFileSync(new URL('batches/dog-step13-analysis.json',dir),JSON.stringify({analysis,headPoint,headAnchor,swivel,swivelResult},null,2)+'\n');
console.log('swivel',JSON.stringify(swivelResult));
// Preserve the earlier crease-position and boundary-pivot attempts as well.
const earlierLine={via:'free',through:[t.at([-.5,.05]),t.at([-.5,.45])]};
const earlierValley={...op,line:earlierLine};
const earlierTuck={...tuck,line:earlierLine};
const boundarySwivel={...swivel,fold:t.at([x,-x])};
const attempts=[
  {label:'Earlier body-fold line at x=-0.5',op:earlierValley,result:t.e.apply(t.state,earlierValley)},
  {label:'Earlier tuck at x=-0.5',op:earlierTuck,result:t.e.tuck(t.state,earlierTuck)},
  {label:'Boundary swivel pivot; not a valid folded-edge anchor',op:boundarySwivel,result:t.e.apply(t.state,boundarySwivel)},
  {label:'Head-pleat line; plain fold moves the head',op,result},
  {label:'Head-pleat line; tuck target moves',op:tuck,result:tuckResult},
  {label:'Interior view pick still does not resolve a folded-edge anchor',op:swivel,result:swivelResult},
];
fs.writeFileSync(new URL('batches/dog-step13-attempts.json',dir),JSON.stringify(attempts,null,2)+'\n');
