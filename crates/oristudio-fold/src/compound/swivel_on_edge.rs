//! The swivel on a folded edge (plan Phase 11, research §5.3's "swivels on
//! folded paper"): the classic swivel, whose creases meet on a folded edge
//! of the model. A [`SwivelByEdge`] with its `fold` set.
//!
//! # In a folder's words
//!
//! *Swivel this edge onto that line, the creases meeting on this folded
//! edge.* Two layers are joined along a folded edge `h`: the layer whose
//! edge `e` moves, and the other one, folded over it (or under it) along
//! `h`. The edge's line meets the target `t` at `M`, the point the swivel
//! turns about: in Abrashi's "What is Swivel fold?", the squashed flap's
//! bottom tip, where its lower-left edge meets the centre line. The swivel
//! crease `s` is the line halfway between `e` and `t` through `M` (one of
//! their two bisectors), so a fold along it lays `e` on `t`; it runs from `M`
//! up the edge's layer until it meets the folded edge, at `V`. That is where
//! the creases meet, and what the first click names: a point on the folded
//! edge, moved along it to `V` (as a free swivel's pivot is moved onto the
//! bisector, so a click near the crossing lands on it and replay recomputes
//! it exactly). The clicks are the free swivel's three — the folded edge
//! (by a point on it), the edge that moves, the line it lands on — and the
//! layers are the two the folded edge joins, so there are none to pick.
//!
//! The edge that moves names a line. Edges of several layers can lie along
//! one line of the folded form — the squashed flap's lower-left edge runs
//! along the base flaps' behind it, the model's lower-left edge — and a click
//! takes whichever is nearest; what swivels is the edge layer's own side
//! along that line, which is what lands on the target. The edge's layer is
//! the one of the two whose wedge `D` has such a side (the face the clicked
//! edge bounds is tried first).
//!
//! At `V` the folded edge has two halves: `h₋`, toward the edge that moves,
//! and `h₊`, the other. With `α` the angle from `h₋` to `s` (at `V`, inside
//! the paper):
//!
//! - **The edge's layer** creases along `s` alone. Its paper between `h₋` and
//!   `s` — the wedge `D` holding the edge — folds over `s`, laying the edge
//!   on the target. That is the swivel proper: `D` turns about `M`, and the
//!   fold along `s` is the direction's (a valley lifts `D` toward the
//!   viewer).
//! - **The folded edge opens along `h₋`**: the other layer's paper on it,
//!   `W₃` (between `h₋` and `s`), goes with `D`, unfolded beside it. Turned by
//!   both reflections, `R_s ∘ R_h`, it turns in place about `V` by `2α`.
//! - **The other layer creases twice**: along `s` too, where `W₃` leaves it,
//!   and along `s′`, the folded edge's line reflected in `s` — at `α` past
//!   `s`, Abrashi's line to the squashed flap's right corner. Its strip `W₂`
//!   between them folds over `s′` ("the top layer folds up and over along
//!   it"), and `W₃` comes to lie on it: `s′` folds as the direction says and
//!   that layer's `s` the other way, the crease `W₃` folds back over `W₂`
//!   along.
//! - **What stays**: the other layer past `s′` (`W₁`), the edge's layer past
//!   `s` (`W₅`), the folded edge's half `h₊` between them, and everything
//!   else.
//!
//! Round `V` the motions are `R_s` (`D`), `R_s ∘ R_h` (`W₃`, across the
//! opened `h₋`), `R_s ∘ R_h ∘ R_s = R_{s′}` (`W₂`, across the other layer's
//! `s`) and the identity (`W₁`, across `s′`): they close for every `s`, and
//! Kawasaki's theorem holds at `V` — on the sheet, in the edge layer's frame
//! from `h₊`, the sectors are `180° − 2α`, `α`, `2α` and `180° − α` between
//! `h₊`, the other layer's `s′` and `s`, and the edge layer's `s`, with `h₋`
//! flat. That needs `α < 90°`, or `s′` would lie past `h₊`, outside the other
//! layer's paper (`swivel_fold_wide`). The letters are Maekawa's 3 : 1.
//!
//! The regions name these wedges as the free swivel's do: `D` the near one
//! (it folds across the meet ray, `s`), `W₃` the one that turns in place,
//! `W₂` the one beyond (it folds across `s′`, as the free swivel's beyond
//! wedge folds across its hinge).
//!
//! **Into the pipeline** (`super::vertex`): each crease is scored through
//! the layers it runs through (`pieces::score_cuts`, a line per crease, as a
//! squash's per layer): from `V` through its layer, on across every flat
//! crease, to the paper's edge (or a vertex). The blocks are the paper
//! joined to each moving wedge across every crease but the new ones and
//! `h₋`; the direction seeds every block above (a valley) the paper that
//! stays; the completion does the rest — `W₃` above `W₂` is forced, since
//! `D` and `W₃` lie flat across the fold `W₂` makes with `W₁`.
//!
//! **Refusals** (plan D14), besides the free swivel's on the edge and the
//! target: a point on no folded crease (`swivel_not_a_fold`); a bisector that
//! crosses the folded edge nowhere inside one of its creases
//! (`swivel_misses_fold`); `V` on the edge's line (`swivel_pivot_on_edge`); a
//! crease meeting the folded edge at a right angle or wider
//! (`swivel_fold_wide`); a crease that runs into a fold before the paper's
//! edge, or paper that joins two wedges (`fan_ray_blocked`, naming it); an
//! edge whose line neither layer's wedge `D` has a side along, past where it
//! meets the target (`swivel_edge_stays`); and no order (`no_order`, offering
//! the other direction when it lands).

use std::collections::HashMap;

use oristudio_geometry::{Line, convex};

use crate::complete::CompletionLimits;
use crate::compound::CompoundRefused;
use crate::compound::pieces::{Cut, Scoring, score_cuts};
use crate::compound::swivel::{
    SwivelByEdge, SwivelCrease, SwivelEdgeAnalysis, SwivelFold, SwivelRay, SwivelRegion,
    SwivelWedge, dot, edge_run, internal, sub, wrap,
};
use crate::compound::vertex::{
    Compiled, VertexChoices, VertexFoldKind, VertexOutcome, angle_between, cross, drop_empty, unit,
};
use crate::fold::line::Axis;
use crate::fold::{ActionKind, FoldActionGeometry, FoldAnalysis, Snap, Within};
use crate::numerics::{Band, MIN_FEATURE, TOL};
use crate::pattern::{CreaseKind, FaceId, Letter, VertexId, opposite};
use crate::refusal::{FoldRefusal, NearMissCause, Refused, Side};
use crate::state::State;
use crate::view::Direction;

type Point = [f64; 2];

/// A swivel on a folded edge resolved in its parent (the module docs).
#[derive(Debug, Clone)]
pub(crate) struct OnFold {
    pivot: Point,
    vertex: Point,
    meet: Point,
    /// The edge's straight run, its end nearer `meet` first.
    edge: [Point; 2],
    edge_faces: Vec<FaceId>,
    /// The same faces, by position.
    edge_faces_positions: Vec<usize>,
    /// The unit direction of `eₛ`, from `meet`.
    along: Point,
    foot: Point,
    target: Line,
    /// The folded edge's line, and its straight run in the model frame.
    fold_line: Line,
    fold_run: [Point; 2],
    /// The run's creases, by position in the parent.
    run: Vec<usize>,
    /// The two faces the folded edge joins at the vertex, by position.
    faces: [usize; 2],
    /// Unit directions from the vertex: the folded edge's half toward the
    /// edge that moves (`h₋`, it opens), its other half (`h₊`), the swivel
    /// crease into the paper (`s`) and the other layer's second (`s′`).
    opens: Point,
    stays: Point,
    swivel: Point,
    second: Point,
    rotation: f64,
    landed: Vec<[Point; 2]>,
}

/// The faces a crease runs through in one layer, from the vertex, and
/// where it leaves the last of them.
struct RayRun {
    faces: Vec<usize>,
    end: Point,
}

/// A swivel on a folded edge compiled with one reading of its two layers.
struct FoldCompiled {
    compiled: Compiled,
    /// Per block of `compiled`, its wedge.
    wedges: Vec<SwivelWedge>,
    /// The edge's layer and the other one, by position.
    edge_layer: usize,
    other_layer: usize,
    /// Where each crease leaves its layer: the edge layer's `s`, the other
    /// layer's `s`, its `s′`.
    ends: [Point; 3],
    /// The stretch of the edge's line, past where it meets the target, that
    /// the wedge folding across `s` has a side along (`edge_reach`): the
    /// edge that swivels onto the target. None when it has none.
    reach: Option<[f64; 2]>,
}

impl FoldCompiled {
    /// Where the edge lies once folded, on the target: the wedge's side
    /// along it, reflected in the swivel crease.
    fn landed(&self, built: &OnFold) -> Option<[Point; 2]> {
        let [a, b] = self.reach?;
        let s_line = built.swivel_line().ok()?;
        let at = |t: f64| {
            [
                built.meet[0] + t * built.along[0],
                built.meet[1] + t * built.along[1],
            ]
        };
        Some([s_line.reflect_point(at(a)), s_line.reflect_point(at(b))])
    }
}

impl OnFold {
    fn ids(&self, state: &State) -> Vec<FaceId> {
        let mut ids: Vec<FaceId> = self.faces.iter().map(|&f| state.faces()[f].id).collect();
        ids.sort_unstable();
        ids
    }

    fn swivel_line(&self) -> Result<Line, Refused> {
        Line::from_point_direction(self.vertex, self.swivel)
            .ok_or_else(|| internal("a swivel crease has no line"))
    }

    fn second_line(&self) -> Result<Line, Refused> {
        Line::from_point_direction(self.vertex, self.second)
            .ok_or_else(|| internal("a swivel crease has no line"))
    }

    /// The readings of the two layers to try, which is the edge's: the face
    /// the edge clicked bounds first, when it bounds one of the two.
    fn readings(&self) -> Vec<usize> {
        let [a, b] = self.faces;
        if self.edge_faces_positions.contains(&b) && !self.edge_faces_positions.contains(&a) {
            vec![b, a]
        } else {
            vec![a, b]
        }
    }
}

impl SwivelByEdge {
    /// The vertex on the folded edge through the sheet point `fold`, and
    /// the creases from it (the module docs).
    pub(crate) fn on_fold(&self, state: &State, fold: Point) -> Result<OnFold, Refused> {
        let run = edge_run(state, self.edge)?;
        let edge_faces = run.faces.clone();
        let [e1, e2] = run.ends;
        let edge = Line::from_points(e1, e2).ok_or_else(|| internal("an edge has no length"))?;
        let parallel = || {
            Refused::from(FoldRefusal::SwivelTargetParallel {
                faces: edge_faces.clone(),
            })
        };
        let target = Line::new(self.target.n, self.target.d)
            .filter(|t| t.d.is_finite())
            .ok_or_else(parallel)?;
        let meet = edge.intersect(&target).ok_or_else(parallel)?;

        // The folded edge: the folded crease through the sheet point, run
        // on straight.
        let not_a_fold = || Refused::from(FoldRefusal::SwivelNotAFold { point: fold });
        let named = state
            .crease_at(fold)
            .filter(|c| matches!(c.kind, CreaseKind::Folded(_)))
            .ok_or_else(not_a_fold)?;
        let named_faces: Vec<FaceId> = {
            let k = state
                .creases()
                .iter()
                .position(|c| c.id == named.id)
                .ok_or_else(|| internal("no folded crease"))?;
            let mut ids: Vec<FaceId> = state.topology().crease_faces[k]
                .iter()
                .map(|&f| state.faces()[f].id)
                .collect();
            ids.sort_unstable();
            ids
        };
        let fold_run = edge_run(state, fold)?;
        let [h1, h2] = fold_run.ends;
        let fold_line =
            Line::from_points(h1, h2).ok_or_else(|| internal("a folded edge has no length"))?;
        let missed = || {
            Refused::from(FoldRefusal::SwivelMissesFold {
                faces: named_faces.clone(),
            })
        };

        // Where each bisector through the meeting point crosses one of the
        // run's creases, away from its ends; the one nearer the pivot.
        let (ue, ut) = (edge.direction(), target.direction());
        let geometry = state.geometry();
        let topology = state.topology();
        let images = &geometry.vertex_images;
        let crossing = |d: Point| -> Option<(Point, usize)> {
            let bisector = Line::from_point_direction(meet, unit(d)?)?;
            let v = bisector.intersect(&fold_line)?;
            fold_run.creases.iter().copied().find_map(|k| {
                let [a, b] = state.creases()[k].vertices.map(|w| images[w.index()]);
                let length = (b[0] - a[0]).hypot(b[1] - a[1]);
                let t = dot(sub(v, a), sub(b, a)) / length;
                (t > MIN_FEATURE && t < length - MIN_FEATURE).then_some((v, k))
            })
        };
        let (vertex, k) = [
            [ue[0] + ut[0], ue[1] + ut[1]],
            [ue[0] - ut[0], ue[1] - ut[1]],
        ]
        .into_iter()
        .filter_map(crossing)
        .min_by(|(p, _), (q, _)| {
            let off = |v: &Point| (v[0] - self.pivot[0]).hypot(v[1] - self.pivot[1]);
            off(p).total_cmp(&off(q))
        })
        .ok_or_else(missed)?;
        if edge.distance_to_point(vertex) < MIN_FEATURE {
            return Err(FoldRefusal::SwivelPivotOnEdge { faces: edge_faces }.into());
        }
        let faces: [usize; 2] = match topology.crease_faces[k][..] {
            [a, b] => [a, b],
            _ => return Err(internal("a folded crease does not join two faces")),
        };

        // The edge's half-line from the meeting point on the vertex's side.
        let es = if dot(sub(vertex, meet), ue) > 0.0 {
            ue
        } else {
            [-ue[0], -ue[1]]
        };
        let along = |p: Point| dot(sub(p, meet), es);
        let at = |s: f64| [meet[0] + s * es[0], meet[1] + s * es[1]];
        let foot = at(along(vertex));
        let (near, far) = if along(e1) <= along(e2) {
            (e1, e2)
        } else {
            (e2, e1)
        };

        // The swivel crease into the paper: the side of the folded edge
        // its two layers lie on.
        let s_line = Line::from_points(meet, vertex).ok_or_else(missed)?;
        let paper = convex::centroid(&geometry.images[faces[0]])
            .ok_or_else(|| internal("a layer has no centroid"))?;
        let paper_side = Side::of_point(&fold_line, paper).ok_or_else(missed)?;
        let sd = s_line.direction();
        let tip = [vertex[0] + sd[0], vertex[1] + sd[1]];
        let swivel = if Side::of_point(&fold_line, tip) == Some(paper_side) {
            sd
        } else {
            [-sd[0], -sd[1]]
        };
        // The folded edge's half on the side of the swivel crease the edge
        // that moves lies on.
        let hd = fold_line.direction();
        let edge_side = Side::of_point(&s_line, at(1.0)).ok_or_else(missed)?;
        let (opens, stays) =
            if Side::of_point(&s_line, [vertex[0] + hd[0], vertex[1] + hd[1]]) == Some(edge_side) {
                (hd, [-hd[0], -hd[1]])
            } else {
                ([-hd[0], -hd[1]], hd)
            };
        let alpha = angle_between(opens, swivel);
        if alpha.abs() >= std::f64::consts::FRAC_PI_2 - 1e-9 {
            return Err(FoldRefusal::SwivelFoldWide { faces: named_faces }.into());
        }
        // The folded edge's half reflected in the swivel crease.
        let c = 2.0 * dot(opens, swivel);
        let second = unit([c * swivel[0] - opens[0], c * swivel[1] - opens[1]])
            .ok_or_else(|| internal("a swivel crease has no direction"))?;
        let rotation = wrap(2.0 * alpha);
        // Where the edge lies once folded: its part from the meeting point
        // (or its near end) on, reflected in the swivel crease.
        let near_start = if along(near) <= 0.0 { meet } else { near };
        let landed = vec![[s_line.reflect_point(near_start), s_line.reflect_point(far)]];
        Ok(OnFold {
            pivot: self.pivot,
            vertex,
            meet,
            edge: [near, far],
            edge_faces_positions: edge_faces
                .iter()
                .filter_map(|&id| state.face_position(id))
                .collect(),
            edge_faces,
            along: es,
            foot,
            target,
            fold_line,
            fold_run: [h1, h2],
            run: fold_run.creases,
            faces,
            opens,
            stays,
            swivel,
            second,
            rotation,
            landed,
        })
    }
}

/// The faces a crease from `from`, on the boundary of face `start`'s image,
/// runs through along the unit model direction `u`: `start`, then on across
/// every flat crease it leaves through, until it leaves through the paper's
/// raw edge or a vertex. A crease it would leave through that is folded is
/// in its way (`fan_ray_blocked`, naming the paper across); a vertex it
/// passes within a near miss of is refused as the fan's are.
fn ray_run(state: &State, start: usize, from: Point, u: Point) -> Result<RayRun, Refused> {
    let parts = state.parts();
    let topology = state.topology();
    let geometry = state.geometry();
    let (mut f, mut at) = (start, from);
    let mut faces = vec![start];
    for _ in 0..parts.faces.len() {
        let face = &parts.faces[f];
        let t = geometry.isometries[f];
        let inverse = t.inverse();
        let p = inverse.apply(at);
        let tip = inverse.apply([at[0] + u[0], at[1] + u[1]]);
        let v = sub(tip, p);
        let ring: Vec<Point> = face
            .ring
            .iter()
            .map(|w| parts.vertices[w.index()])
            .collect();
        let n = ring.len();
        let off = |q: Point| cross(v, sub(q, p));
        let ahead = |q: Point| dot(v, sub(q, p));
        // Through a ring vertex ahead, or across a side.
        let mut out: Option<(Option<usize>, usize, f64)> = None;
        for i in 0..n {
            let (a, b) = (ring[i], ring[(i + 1) % n]);
            let d = off(a);
            if ahead(a) > MIN_FEATURE / 2.0 {
                match Band::of(d) {
                    Band::On => {
                        out = Some((Some(i), i, 0.0));
                        break;
                    }
                    Band::Near => {
                        return Err(Refused::from(FoldRefusal::NearMiss {
                            vertex: face.ring[i],
                            distance: d.abs(),
                            cause: NearMissCause::Band,
                        }));
                    }
                    _ => {}
                }
            }
            let e = off(b);
            if (d > TOL && e < -TOL || d < -TOL && e > TOL) && out.is_none() {
                let s = d / (d - e);
                let x = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])];
                if ahead(x) > MIN_FEATURE / 2.0 {
                    out = Some((None, i, s));
                }
            }
        }
        let Some((through, i, s)) = out else {
            return Err(FoldRefusal::FanCenter {
                faces: vec![face.id],
            }
            .into());
        };
        let exit = match through {
            Some(i) => ring[i],
            None => {
                let (a, b) = (ring[i], ring[(i + 1) % n]);
                [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]
            }
        };
        let end = t.apply(exit);
        if through.is_some() {
            return Ok(RayRun { faces, end });
        }
        let k = topology.face_creases[f][i];
        match parts.creases[k].kind {
            CreaseKind::Border => return Ok(RayRun { faces, end }),
            CreaseKind::Folded(_) => {
                let across = topology.across(k, f).map_or(face.id, |g| parts.faces[g].id);
                return Err(FoldRefusal::FanRayBlocked {
                    faces: vec![across],
                }
                .into());
            }
            CreaseKind::Flat(_) => {
                let g = topology
                    .across(k, f)
                    .ok_or_else(|| internal("a flat crease with one face"))?;
                if faces.contains(&g) {
                    return Err(internal("a swivel crease runs back into its paper"));
                }
                faces.push(g);
                f = g;
                at = end;
            }
        }
    }
    Err(internal("a swivel crease runs on without end"))
}

/// A unit direction halfway between two at less than a half turn.
fn halfway(a: Point, b: Point) -> Option<Point> {
    unit([a[0] + b[0], a[1] + b[1]])
}

fn compile(
    state: &State,
    built: &OnFold,
    edge_layer: usize,
    direction: Direction,
) -> Result<FoldCompiled, Refused> {
    let [a, b] = built.faces;
    let other_layer = if edge_layer == a { b } else { a };
    let v = built.vertex;
    let s_edge = ray_run(state, edge_layer, v, built.swivel)?;
    let s_other = ray_run(state, other_layer, v, built.swivel)?;
    let s_second = ray_run(state, other_layer, v, built.second)?;
    let nf = state.faces().len();
    let mask = |runs: &[&RayRun]| {
        let mut mask = vec![false; nf];
        for run in runs {
            for &f in &run.faces {
                mask[f] = true;
            }
        }
        mask
    };
    let s_line = built.swivel_line()?;
    let second_line = built.second_line()?;
    let scoring = score_cuts(
        state,
        &[
            Cut {
                axis: Axis::new(&s_line, Side::Positive),
                faces: mask(&[&s_edge, &s_other]),
            },
            Cut {
                axis: Axis::new(&second_line, Side::Positive),
                faces: mask(&[&s_second]),
            },
        ],
    )?;

    // The folded edge's half that opens: the pieces of the run's creases
    // past the vertex on the edge's side.
    let geometry = state.geometry();
    let topology = state.topology();
    let parent_sheet = state.vertices();
    let on_segment = |p: Point, a: Point, b: Point| {
        let length = (b[0] - a[0]).hypot(b[1] - a[1]);
        let t = dot(sub(p, a), sub(b, a)) / length;
        (cross(sub(b, a), sub(p, a)) / length).abs() <= TOL && t >= -TOL && t <= length + TOL
    };
    let opened: Vec<[VertexId; 2]> = scoring
        .creases
        .iter()
        .filter(|c| {
            let [p, q] = c.vertices.map(|w| scoring.vertices[w.index()]);
            built.run.iter().any(|&k| {
                let [ka, kb] = state.creases()[k].vertices.map(|w| parent_sheet[w.index()]);
                if !on_segment(p, ka, kb) || !on_segment(q, ka, kb) {
                    return false;
                }
                let Some(&g) = topology.crease_faces[k].first() else {
                    return false;
                };
                let mid = geometry.isometries[g].apply([(p[0] + q[0]) / 2.0, (p[1] + q[1]) / 2.0]);
                dot(sub(mid, v), built.opens) > MIN_FEATURE / 2.0
            })
        })
        .map(|c| c.vertices)
        .collect();
    let created: Vec<[VertexId; 2]> = scoring
        .creases
        .iter()
        .filter(|c| scoring.created.binary_search(&c.id).is_ok())
        .map(|c| c.vertices)
        .collect();
    let key = |e: [VertexId; 2]| (e[0].0.min(e[1].0), e[0].0.max(e[1].0));
    let cut: Vec<(u32, u32)> = created.iter().chain(&opened).map(|&e| key(e)).collect();

    // Paper joined across every crease but the new ones and the opened half.
    let count = scoring.faces.len();
    let mut sides: HashMap<(u32, u32), Vec<usize>> = HashMap::new();
    for (p, face) in scoring.faces.iter().enumerate() {
        let m = face.ring.len();
        for i in 0..m {
            sides
                .entry(key([face.ring[i], face.ring[(i + 1) % m]]))
                .or_default()
                .push(p);
        }
    }
    let mut parent: Vec<usize> = (0..count).collect();
    fn root(parent: &mut [usize], mut a: usize) -> usize {
        while parent[a] != a {
            parent[a] = parent[parent[a]];
            a = parent[a];
        }
        a
    }
    for (side, faces) in &sides {
        if let [p, q] = faces[..]
            && !cut.contains(side)
        {
            let (rp, rq) = (root(&mut parent, p), root(&mut parent, q));
            parent[rp.max(rq)] = rp.min(rq);
        }
    }
    let component: Vec<usize> = (0..count).map(|p| root(&mut parent, p)).collect();

    // Each wedge's piece at the vertex, by a point just inside it.
    let piece = |layer: usize, from: Point, to: Point| -> Result<usize, Refused> {
        let mid = halfway(from, to).ok_or_else(|| internal("a swivel wedge has no middle"))?;
        let step = MIN_FEATURE / 4.0;
        let q = [v[0] + step * mid[0], v[1] + step * mid[1]];
        let sheet = geometry.isometries[layer].inverse().apply(q);
        (0..count)
            .find(|&p| {
                scoring.old[p] == layer && convex::contains_point(&scoring.polygon(p), sheet, TOL)
            })
            .ok_or_else(|| internal("a swivel wedge has no paper at the vertex"))
    };
    let (opens, stays, swivel, second) = (built.opens, built.stays, built.swivel, built.second);
    let staying = component[piece(edge_layer, swivel, stays)?];
    let wedges = [
        (
            SwivelWedge::Near,
            component[piece(edge_layer, opens, swivel)?],
        ),
        (
            SwivelWedge::Turn,
            component[piece(other_layer, opens, swivel)?],
        ),
        (
            SwivelWedge::Beyond,
            component[piece(other_layer, swivel, second)?],
        ),
    ];
    let beyond_stays = component[piece(other_layer, second, stays)?];
    let ids = |set: Vec<usize>| -> Vec<FaceId> {
        let mut ids: Vec<FaceId> = set
            .into_iter()
            .map(|p| state.faces()[scoring.old[p]].id)
            .collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    };
    // Paper joined to two wedges holds them together: no fold.
    let held = |c: usize| -> Refused {
        let cut_layers = [&s_edge, &s_other, &s_second];
        let holding: Vec<usize> = (0..count)
            .filter(|&p| {
                component[p] == c && !cut_layers.iter().any(|r| r.faces.contains(&scoring.old[p]))
            })
            .collect();
        let all: Vec<usize> = (0..count).filter(|&p| component[p] == c).collect();
        FoldRefusal::FanRayBlocked {
            faces: ids(if holding.is_empty() { all } else { holding }),
        }
        .into()
    };
    if beyond_stays != staying {
        return Err(internal("the paper that stays is in two parts"));
    }
    for (i, &(_, c)) in wedges.iter().enumerate() {
        if c == staying {
            return Err(held(c));
        }
        if wedges[..i].iter().any(|&(_, d)| d == c) {
            return Err(held(c));
        }
    }
    let mut block_of: Vec<Option<usize>> = (0..count)
        .map(|p| wedges.iter().position(|&(_, c)| c == component[p]))
        .collect();
    let opened_line = built.fold_line;
    let turns = vec![
        vec![(1, s_line)],
        vec![(0, opened_line), (1, s_line)],
        vec![(1, second_line)],
    ];
    let reach = edge_reach(state, built, &scoring, &block_of, 0);
    let wedge_names: Vec<SwivelWedge> = wedges.iter().map(|&(w, _)| w).collect();
    let mut kept = Vec::new();
    for (b, &w) in wedge_names.iter().enumerate() {
        if block_of.contains(&Some(b)) {
            kept.push(w);
        }
    }
    let turns = drop_empty(&mut block_of, turns);
    Ok(FoldCompiled {
        compiled: Compiled {
            kind: VertexFoldKind::Swivel,
            scoring,
            block_of,
            turns,
            vertices: vec![v],
            direction,
            extra: Vec::new(),
        },
        wedges: kept,
        edge_layer,
        other_layer,
        ends: [s_edge.end, s_other.end, s_second.end],
        reach,
    })
}

/// Where the swivelling wedge's own paper runs along the edge's line, past
/// where it meets the target: the stretch of block `near`'s sides on that
/// line, as distances along `eₛ` from the meeting point. None when it has no
/// side there, so nothing it carries lands on the target.
///
/// The edge names a line, not one layer's crease: edges stacked along one
/// line of the folded form (the squashed flap's lower-left edge over the
/// base flaps' behind it) all name it, and the wedge's own is the one that
/// swivels.
fn edge_reach(
    state: &State,
    built: &OnFold,
    scoring: &Scoring,
    block_of: &[Option<usize>],
    near: usize,
) -> Option<[f64; 2]> {
    let geometry = state.geometry();
    let line = Line::from_points(built.edge[0], built.edge[1])?;
    let along = |p: Point| dot(sub(p, built.meet), built.along);
    let mut reach: Option<[f64; 2]> = None;
    for (p, face) in scoring.faces.iter().enumerate() {
        if block_of[p] != Some(near) {
            continue;
        }
        let isometry = geometry.isometries[scoring.old[p]];
        let m = face.ring.len();
        for i in 0..m {
            let x = isometry.apply(scoring.vertices[face.ring[i].index()]);
            let y = isometry.apply(scoring.vertices[face.ring[(i + 1) % m].index()]);
            if line.distance_to_point(x) > TOL || line.distance_to_point(y) > TOL {
                continue;
            }
            let (a, b) = (along(x).min(along(y)), along(x).max(along(y)));
            if b <= MIN_FEATURE / 2.0 {
                continue;
            }
            let a = a.max(0.0);
            reach = Some(reach.map_or([a, b], |[lo, hi]| [lo.min(a), hi.max(b)]));
        }
    }
    reach
}

/// The reading that lands the edge on the target, compiled. Otherwise, when
/// a reading compiled, its edge stays (`swivel_edge_stays`); when none did,
/// the first reading's refusal.
fn compile_reading(
    state: &State,
    built: &OnFold,
    direction: Direction,
) -> Result<FoldCompiled, Refused> {
    let mut first: Option<Refused> = None;
    let mut compiled_any = false;
    for layer in built.readings() {
        match compile(state, built, layer, direction) {
            Ok(compiled) if compiled.reach.is_some() => return Ok(compiled),
            Ok(_) => compiled_any = true,
            Err(refused) => {
                first.get_or_insert(refused);
            }
        }
    }
    if compiled_any {
        return Err(FoldRefusal::SwivelEdgeStays {
            faces: built.edge_faces.clone(),
        }
        .into());
    }
    Err(first.unwrap_or_else(|| internal("a folded edge with no layers")))
}

/// How far a crease runs along `u` from `from` before `to`, and where the
/// part of it seen from the direction's side starts once the nearer layer's
/// crease along the same line is drawn: what a tool draws.
fn seen_from(from: Point, covered_to: Option<Point>, to: Point, u: Point) -> Point {
    match covered_to {
        Some(c) if dot(sub(c, from), u) > dot(sub(to, from), u) - TOL => to,
        Some(c) => c,
        None => from,
    }
}

impl State {
    /// A swivel on a folded edge before it folds (the module docs): its
    /// vertex, creases with their letters as seen, landing, the folded
    /// edge and the half of it that opens, and the paper that moves.
    pub(crate) fn analyse_swivel_on_fold(
        &self,
        op: &SwivelByEdge,
        fold: Point,
    ) -> Result<SwivelEdgeAnalysis, Refused> {
        let built = op.on_fold(self, fold)?;
        let direction = self.view().model_direction(op.direction);
        let given = match op.direction {
            Direction::Valley => Letter::Valley,
            Direction::Mountain => Letter::Mountain,
        };
        let compiled = compile_reading(self, &built, direction);
        // The layers' order as the direction names it, the nearer first;
        // the edge's layer is the first reading's when nothing compiled.
        let (edge_layer, other_layer) = match &compiled {
            Ok(c) => (c.edge_layer, c.other_layer),
            Err(_) => {
                let first = built.readings()[0];
                let [a, b] = built.faces;
                (first, if first == a { b } else { a })
            }
        };
        let id = |f: usize| self.faces()[f].id;
        let other_nearer = self
            .above(id(other_layer), id(edge_layer))
            .is_some_and(|above| above == (direction == Direction::Valley));
        let layers = if other_nearer {
            vec![id(other_layer), id(edge_layer)]
        } else {
            vec![id(edge_layer), id(other_layer)]
        };
        let v = built.vertex;
        // Where each crease ends: through its layer, when it compiled.
        let reach = |run_end: Option<Point>, u: Point| -> Point {
            run_end.unwrap_or_else(|| {
                let t = [edge_layer, other_layer]
                    .iter()
                    .filter_map(|&f| {
                        crate::compound::swivel::exit(&self.geometry().images[f], v, u)
                    })
                    .fold(0.0, f64::max);
                [v[0] + t * u[0], v[1] + t * u[1]]
            })
        };
        let ends = compiled.as_ref().ok().map(|c| c.ends);
        let edge_s = reach(ends.map(|e| e[0]), built.swivel);
        let other_s = reach(ends.map(|e| e[1]), built.swivel);
        let other_second = reach(ends.map(|e| e[2]), built.second);
        // Where the two layers' swivel creases coincide, the one in the
        // layer the viewer sees on top is the one seen.
        let other_seen_on_top = self
            .seen_above(id(other_layer), id(edge_layer))
            .unwrap_or(other_nearer);
        let (edge_from, other_from) = if other_seen_on_top {
            (seen_from(v, Some(other_s), edge_s, built.swivel), v)
        } else {
            (v, seen_from(v, Some(edge_s), other_s, built.swivel))
        };
        let crease = |ray, direction, from, to, letter, ridge| SwivelCrease {
            ray,
            direction,
            from,
            to,
            letter,
            ridge,
        };
        let creases = vec![
            crease(
                SwivelRay::Meet,
                built.swivel,
                edge_from,
                edge_s,
                given,
                false,
            ),
            crease(
                SwivelRay::Meet,
                built.swivel,
                other_from,
                other_s,
                opposite(given),
                true,
            ),
            crease(
                SwivelRay::Hinge,
                built.second,
                v,
                other_second,
                given,
                false,
            ),
        ];
        let opens_to = {
            let run = built.fold_run;
            let t = run
                .iter()
                .map(|&p| dot(sub(p, v), built.opens))
                .fold(0.0, f64::max);
            [v[0] + t * built.opens[0], v[1] + t * built.opens[1]]
        };
        let regions = compiled
            .as_ref()
            .map(|c| on_fold_regions(self, c))
            .unwrap_or_default();
        Ok(SwivelEdgeAnalysis {
            pivot: built.pivot,
            vertex: v,
            meet: built.meet,
            edge: built.edge,
            edge_faces: built.edge_faces.clone(),
            foot: built.foot,
            target: built.target,
            rotation: built.rotation,
            // The wedge's own side along the edge's line, where it compiled.
            landed: compiled
                .as_ref()
                .ok()
                .and_then(|c| c.landed(&built))
                .map_or_else(|| built.landed.clone(), |segment| vec![segment]),
            creases,
            ridges: Vec::new(),
            ridge: 0,
            layers,
            regions,
            fold: Some(SwivelFold {
                edge: built.fold_run,
                opens: [v, opens_to],
                faces: built.ids(self),
            }),
        })
    }

    /// A swivel on a folded edge, landed or refused (the module docs).
    pub(crate) fn swivel_on_fold_within(
        &self,
        op: &SwivelByEdge,
        fold: Point,
        choices: &VertexChoices,
        limits: &CompletionLimits,
    ) -> Result<VertexOutcome, CompoundRefused> {
        let built = op.on_fold(self, fold).map_err(CompoundRefused::Refused)?;
        let direction = self.view().model_direction(op.direction);
        let reading = compile_reading(self, &built, direction).map_err(CompoundRefused::Refused)?;
        let edge_layer = reading.edge_layer;
        reading.compiled.land(self, choices, limits, || {
            compile(self, &built, edge_layer, direction.opposite())
                .ok()
                .map(|c| c.compiled)
        })
    }

    /// The picture of a swivel on a folded edge, with `landed`'s cover at
    /// the arrow's head when it is given: the swivel crease from the vertex
    /// across the edge's layer, and the arrow from the wedge that holds the
    /// edge to where it lays it.
    pub(crate) fn swivel_on_fold_action(
        &self,
        op: &SwivelByEdge,
        fold: Point,
        landed: Option<&State>,
    ) -> Result<FoldActionGeometry, Refused> {
        let built = op.on_fold(self, fold)?;
        let direction = self.view().model_direction(op.direction);
        let reading = compile_reading(self, &built, direction)?;
        let compiled = &reading.compiled;
        let scoring = &compiled.scoring;
        let geometry = self.geometry();
        let near = reading.wedges.iter().position(|&w| w == SwivelWedge::Near);
        let reach: Vec<Vec<Point>> = (0..scoring.faces.len())
            .filter(|&p| near.is_some() && compiled.block_of[p] == near)
            .map(|p| {
                let isometry = geometry.isometries[scoring.old[p]];
                let image: Vec<Point> = scoring
                    .polygon(p)
                    .iter()
                    .map(|&q| isometry.apply(q))
                    .collect();
                convex::normalize(&image)
            })
            .collect();
        let line = built.swivel_line()?;
        let side = reach
            .iter()
            .filter_map(|image| convex::centroid(image))
            .find_map(|c| Side::of_point(&line, c))
            .ok_or_else(|| internal("a swivel's swinging wedge has no side"))?;
        let mut moving: Vec<FaceId> = (0..scoring.faces.len())
            .filter(|&p| compiled.block_of[p].is_some())
            .map(|p| self.faces()[scoring.old[p]].id)
            .collect();
        moving.sort_unstable();
        moving.dedup();
        let analysis = FoldAnalysis {
            line,
            side,
            snap: Snap::NONE,
            direction,
            flaps: Vec::new(),
            picked: Vec::new(),
            added: Vec::new(),
            moving,
        };
        self.fold_action_within(
            &analysis,
            ActionKind::Fold,
            landed,
            Within {
                ray: Some((built.vertex, built.swivel)),
                reach: Some(&reach),
            },
        )
    }
}

/// The paper a swivel on a folded edge moves, by wedge, in the parent's
/// model frame.
fn on_fold_regions(state: &State, reading: &FoldCompiled) -> Vec<SwivelRegion> {
    let geometry = state.geometry();
    let compiled = &reading.compiled;
    let scoring = &compiled.scoring;
    (0..scoring.faces.len())
        .filter_map(|p| {
            let wedge = *reading.wedges.get(compiled.block_of[p]?)?;
            let isometry = geometry.isometries[scoring.old[p]];
            let image: Vec<Point> = scoring
                .polygon(p)
                .iter()
                .map(|&q| isometry.apply(q))
                .collect();
            Some(SwivelRegion {
                wedge,
                polygon: convex::normalize(&image),
            })
        })
        .collect()
}
