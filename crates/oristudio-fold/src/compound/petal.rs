//! The petal fold (plan Phase 11, research §5.3), a vertex fold
//! ([`super::vertex`]): a flap's lower point lifted along a line H while its
//! sides fold in along the kite creases — a fan at the two ends of H.
//!
//! - **Inputs**: H (a model-frame line), a sheet point on the flap's top
//!   layer below H inside the kite (the petal), and the direction (a valley
//!   lifts the petal toward the viewer).
//! - **Precondition**: H and the kite creases are precreased, as a folder
//!   does it. The macro then scores nothing: every crease it folds is there,
//!   flat, and the hinge diff refolds it. A piece H or a kite line crosses
//!   is refused, naming it.
//! - **The flap**: its *top layer* is the petal's face grown across flat
//!   creases below H; its folded creases to the rest are its closed edges,
//!   which H meets at its two ends PL and PR. A kite crease is the flat
//!   crease of the top layer through PL (or PR) below H; the two meet at
//!   the flap's open corner. The *second layer* is the paper across the
//!   closed edges below H, grown the same way.
//! - **Motions** (6 blocks with what stays, research §5.3): the petal
//!   reflects across H; the top layer outside each kite crease reflects
//!   across it and then across H; the second layer outside it across it
//!   alone. At PL, H, the kite crease and the closed edge meet, so the three
//!   reflections compose to one there: the second layer creases on the
//!   kite line, and the closed edge below PL unfolds.

use std::collections::BTreeSet;

use oristudio_geometry::{Line, convex};
use serde::{Deserialize, Serialize};

use crate::complete::CompletionLimits;
use crate::compound::CompoundRefused;
use crate::compound::pieces::Scoring;
use crate::compound::vertex::{
    Compiled, VertexChoices, VertexFoldKind, VertexOutcome, drop_empty, stack_toward, toward,
};
use crate::fold::{ActionKind, FoldActionGeometry, FoldAnalysis, Snap, Within};
use crate::numerics::TOL;
use crate::pattern::{CreaseKind, FaceId};
use crate::refusal::{FoldRefusal, Refused, Side};
use crate::state::State;
use crate::view::Direction;

type Point = [f64; 2];

/// A petal fold, named the way a step stores it (plan D6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PetalFold {
    /// H, in the parent's model frame: the line the petal lifts about.
    pub line: Line,
    /// A sheet point on the flap's top layer as the viewer sees it, below H
    /// and between the kite creases.
    pub petal: Point,
    /// As the viewer sees it.
    pub direction: Direction,
}

/// Which crease of a petal fold is not precreased.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PetalCrease {
    /// The line H.
    Line,
    /// A kite crease, from an end of H to the open corner.
    Kite,
}

/// Why a petal fold has no flap.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NoPetal {
    /// H does not meet the top layer's closed edges at two points.
    NoEnds,
    /// The kite creases do not meet below H.
    NoCorner,
}

/// A petal fold's flap and creases, before it lands: what a tool previews.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PetalAnalysis {
    pub line: Line,
    /// H's ends on the closed edges, and the corner the kite creases meet
    /// at, in the parent's model frame.
    pub ends: [Point; 2],
    pub corner: Point,
    pub kites: [Line; 2],
    /// The parent's faces of the top and second layers below H, in id
    /// order.
    pub top: Vec<FaceId>,
    pub second: Vec<FaceId>,
}

/// The flap by face positions.
struct Petal {
    line: Line,
    ends: [Point; 2],
    corner: Point,
    kites: [Line; 2],
    top: Vec<usize>,
    second: Vec<usize>,
    /// A model point inside the kite below H.
    inside: Point,
}

impl State {
    /// A petal fold's flap and creases, without folding.
    pub fn analyse_petal(&self, op: &PetalFold) -> Result<PetalAnalysis, Refused> {
        let direction = self.view().model_direction(op.direction);
        let petal = self.petal_flap(op, direction)?;
        let ids = |faces: &[usize]| faces.iter().map(|&f| self.faces()[f].id).collect();
        Ok(PetalAnalysis {
            line: petal.line,
            ends: petal.ends,
            corner: petal.corner,
            kites: petal.kites,
            top: ids(&petal.top),
            second: ids(&petal.second),
        })
    }

    /// A petal fold, with its stored choices (empty for a new step), under
    /// the default completion limits.
    pub fn petal_fold(
        &self,
        op: &PetalFold,
        choices: &VertexChoices,
    ) -> Result<VertexOutcome, CompoundRefused> {
        self.petal_fold_within(op, choices, &CompletionLimits::default())
    }

    /// [`State::petal_fold`] under `limits`; refusals as the squash's.
    pub fn petal_fold_within(
        &self,
        op: &PetalFold,
        choices: &VertexChoices,
        limits: &CompletionLimits,
    ) -> Result<VertexOutcome, CompoundRefused> {
        let direction = self.view().model_direction(op.direction);
        let compiled = self
            .compile_petal(op, direction)
            .map_err(CompoundRefused::Refused)?;
        compiled.land(self, choices, limits, || {
            self.compile_petal(op, direction.opposite()).ok()
        })
    }

    /// The picture of the petal fold `op` on this state, with `landed`'s
    /// cover at the arrow's head when it is given (see [`super::vertex`]): H
    /// where the flap's top layer meets it, and the arrow lifting the petal
    /// across it, from inside the kite. Refused as [`State::analyse_petal`]
    /// is.
    pub fn petal_action(
        &self,
        op: &PetalFold,
        landed: Option<&State>,
    ) -> Result<FoldActionGeometry, Refused> {
        let direction = self.view().model_direction(op.direction);
        let petal = self.petal_flap(op, direction)?;
        let side = Side::of_point(&petal.line, petal.inside)
            .ok_or(FoldRefusal::SeedNotOnMovingSide { point: op.petal })?;
        let mut moving: Vec<FaceId> = petal.top.iter().map(|&f| self.faces()[f].id).collect();
        moving.sort_unstable();
        let analysis = FoldAnalysis {
            line: petal.line,
            side,
            snap: Snap::NONE,
            direction,
            flaps: Vec::new(),
            picked: Vec::new(),
            added: Vec::new(),
            moving,
        };
        // The petal turns across H alone; the sides outside the kite fold
        // in first, so the grip stays inside it.
        let kite = [convex::normalize(&[
            petal.ends[0],
            petal.ends[1],
            petal.corner,
        ])];
        self.fold_action_within(
            &analysis,
            ActionKind::Fold,
            landed,
            Within {
                ray: None,
                reach: Some(&kite),
            },
        )
    }

    fn compile_petal(&self, op: &PetalFold, direction: Direction) -> Result<Compiled, Refused> {
        let petal = self.petal_flap(op, direction)?;
        let nf = self.faces().len();
        let images = &self.geometry().images;
        let mut layer = vec![0_u8; nf];
        for &f in &petal.top {
            layer[f] = 1;
        }
        for &f in &petal.second {
            layer[f] = 2;
        }
        // Outside a kite line: on its side away from the kite's inside.
        let outside = |kite: &Line, c: Point| {
            kite.signed_distance(c) * kite.signed_distance(petal.inside) < 0.0
        };
        let mut block_of = vec![None; nf];
        for f in 0..nf {
            if layer[f] == 0 {
                continue;
            }
            let c =
                oristudio_geometry::convex::centroid(&images[f]).ok_or(FoldRefusal::Internal {
                    message: "a petal face has no centroid".to_string(),
                })?;
            let side = (0..2).find(|&k| outside(&petal.kites[k], c));
            block_of[f] = match (layer[f], side) {
                (1, None) => Some(0),
                (1, Some(k)) => Some(1 + k),
                (_, Some(k)) => Some(3 + k),
                (_, None) => None,
            };
        }
        let [left, right] = petal.kites;
        let turns = vec![
            vec![(1, petal.line)],
            vec![(0, left), (1, petal.line)],
            vec![(0, right), (1, petal.line)],
            vec![(0, left)],
            vec![(0, right)],
        ];
        let turns = drop_empty(&mut block_of, turns);
        Ok(Compiled {
            kind: VertexFoldKind::Petal,
            scoring: Scoring::unscored(self),
            block_of,
            turns,
            vertices: petal.ends.to_vec(),
            direction,
            extra: Vec::new(),
        })
    }

    /// The flap `op` names and its creases, checked precreased and
    /// uncovered.
    fn petal_flap(&self, op: &PetalFold, direction: Direction) -> Result<Petal, Refused> {
        let faces = self.faces();
        let creases = self.creases();
        let geometry = self.geometry();
        let topology = self.topology();
        let images = &geometry.vertex_images;
        let ids = |set: &[usize]| -> Vec<FaceId> {
            let mut ids: Vec<FaceId> = set.iter().map(|&f| faces[f].id).collect();
            ids.sort_unstable();
            ids.dedup();
            ids
        };
        let line = op.line;
        let p = self
            .face_at(op.petal)
            .and_then(|id| self.face_position(id))
            .ok_or(FoldRefusal::WitnessNotInFace { point: op.petal })?;
        let at = geometry.isometries[p].apply(op.petal);
        let below = line.signed_distance(at).signum();
        if line.distance_to_point(at) <= TOL {
            return Err(FoldRefusal::SeedNotOnMovingSide { point: op.petal }.into());
        }
        let stack = stack_toward(self, at, direction).ok_or(FoldRefusal::Internal {
            message: "the layers at the petal do not stack".to_string(),
        })?;
        if let Some(i) = stack.iter().position(|&f| f == p)
            && i > 0
        {
            return Err(FoldRefusal::SquashFlapCovered {
                faces: ids(&stack[..i]),
                flap: ids(&[p]),
            }
            .into());
        }
        // Below H: every vertex of the face on the petal's side, or on H.
        let below_h = |f: usize| {
            faces[f]
                .ring
                .iter()
                .all(|v| line.signed_distance(images[v.index()]) * below >= -TOL)
        };
        let straddles = |f: usize| {
            let d: Vec<f64> = faces[f]
                .ring
                .iter()
                .map(|v| line.signed_distance(images[v.index()]) * below)
                .collect();
            d.iter().any(|&x| x > TOL) && d.iter().any(|&x| x < -TOL)
        };
        let grow = |seeds: &[usize]| -> Vec<usize> {
            let mut seen = vec![false; faces.len()];
            let mut queue: Vec<usize> = seeds.to_vec();
            for &f in seeds {
                seen[f] = true;
            }
            while let Some(f) = queue.pop() {
                for &k in &topology.face_creases[f] {
                    if !matches!(creases[k].kind, CreaseKind::Flat(_)) {
                        continue;
                    }
                    if let Some(g) = topology.across(k, f)
                        && !seen[g]
                        && (below_h(g) || straddles(g))
                    {
                        seen[g] = true;
                        queue.push(g);
                    }
                }
            }
            (0..faces.len()).filter(|&f| seen[f]).collect()
        };
        let top = grow(&[p]);
        let not_precreased = |faces: Vec<usize>, missing| -> Refused {
            FoldRefusal::PetalNotPrecreased {
                faces: ids(&faces),
                missing,
            }
            .into()
        };
        let crossing: Vec<usize> = top.iter().copied().filter(|&f| straddles(f)).collect();
        if !crossing.is_empty() {
            return Err(not_precreased(crossing, PetalCrease::Line));
        }

        // The closed edges: the top layer's folded creases to other paper
        // below H. H's ends are where they meet it.
        let in_top = |f: usize| top.binary_search(&f).is_ok();
        let mut closed: Vec<(usize, usize)> = Vec::new();
        for &f in &top {
            for &k in &topology.face_creases[f] {
                if let (CreaseKind::Folded(_), Some(g)) = (creases[k].kind, topology.across(k, f))
                    && !in_top(g)
                {
                    closed.push((k, g));
                }
            }
        }
        let point_of = |k: usize| creases[k].vertices.map(|v| images[v.index()]);
        let mut ends: Vec<Point> = Vec::new();
        for &(k, _) in &closed {
            for end in point_of(k) {
                if line.distance_to_point(end) <= TOL && !ends.iter().any(|e| close(*e, end)) {
                    ends.push(end);
                }
            }
        }
        let no_petal = |cause| -> Refused {
            FoldRefusal::PetalNoFlap {
                faces: ids(&top),
                cause,
            }
            .into()
        };
        let [a, b] = ends[..] else {
            return Err(no_petal(NoPetal::NoEnds));
        };
        // The kite creases: the top layer's flat creases from each end that
        // run below H.
        let kite_from = |end: Point| -> Option<Line> {
            top.iter()
                .flat_map(|&f| topology.face_creases[f].iter().copied())
                .filter(|&k| matches!(creases[k].kind, CreaseKind::Flat(_)))
                .find_map(|k| {
                    let [x, y] = point_of(k);
                    let far = if close(x, end) {
                        y
                    } else if close(y, end) {
                        x
                    } else {
                        return None;
                    };
                    (line.signed_distance(far) * below > TOL)
                        .then(|| Line::from_points(end, far))
                        .flatten()
                })
        };
        let (Some(left), Some(right)) = (kite_from(a), kite_from(b)) else {
            return Err(not_precreased(top, PetalCrease::Kite));
        };
        let corner = left
            .intersect(&right)
            .filter(|c| line.signed_distance(*c) * below > TOL)
            .ok_or(no_petal(NoPetal::NoCorner))?;
        let inside = [
            (a[0] + b[0] + corner[0]) / 3.0,
            (a[1] + b[1] + corner[1]) / 3.0,
        ];

        // The second layer: the paper across the closed edges below H.
        let across: Vec<usize> = closed
            .iter()
            .filter(|&&(_, g)| below_h(g) || straddles(g))
            .map(|&(_, g)| g)
            .collect();
        let mut second = grow(&across);
        second.retain(|f| !in_top(*f));
        let kite_crossed: Vec<usize> = top
            .iter()
            .chain(&second)
            .copied()
            .filter(|&f| {
                let d = |kite: &Line| -> Vec<f64> {
                    faces[f]
                        .ring
                        .iter()
                        .map(|v| kite.signed_distance(images[v.index()]))
                        .collect()
                };
                [left, right].iter().any(|kite| {
                    let d = d(kite);
                    d.iter().any(|&x| x > TOL) && d.iter().any(|&x| x < -TOL)
                })
            })
            .collect();
        if !kite_crossed.is_empty() {
            return Err(not_precreased(kite_crossed, PetalCrease::Kite));
        }
        let crossing: Vec<usize> = second.iter().copied().filter(|&f| straddles(f)).collect();
        if !crossing.is_empty() {
            return Err(not_precreased(crossing, PetalCrease::Line));
        }

        // Uncovered: no other paper over the top layer, or between the two,
        // on the side the petal lifts toward.
        let mut flap = vec![false; faces.len()];
        for &f in top.iter().chain(&second) {
            flap[f] = true;
        }
        let mut covering = BTreeSet::new();
        for (pair, _) in self.order().pairs() {
            let (Some(f), Some(g)) = (self.face_position(pair.lo()), self.face_position(pair.hi()))
            else {
                continue;
            };
            let (x, y) = match (flap[f], flap[g]) {
                (true, false) => (g, f),
                (false, true) => (f, g),
                _ => continue,
            };
            if in_top(y) && toward(self, x, y, direction) == Some(true) {
                covering.insert(x);
            }
        }
        if !covering.is_empty() {
            let covering: Vec<usize> = covering.into_iter().collect();
            return Err(FoldRefusal::SquashFlapCovered {
                faces: ids(&covering),
                flap: ids(&top),
            }
            .into());
        }
        Ok(Petal {
            line,
            ends: [a, b],
            corner,
            kites: [left, right],
            top,
            second,
            inside,
        })
    }
}

fn close(a: Point, b: Point) -> bool {
    (a[0] - b[0]).hypot(a[1] - b[1]) <= TOL
}
