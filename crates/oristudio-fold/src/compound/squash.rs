//! The squash fold (plan Phase 11, research §5.3), a vertex fold
//! ([`super::vertex`]): a two-layer flap opened and pressed flat about the
//! vertex where its spine meets its hinge.
//!
//! - **The flap** is named by a sheet point on its upper layer as the viewer
//!   sees it: the face there must be the first at its point from the side
//!   the direction names (the top for a valley), and the face next to it is
//!   the lower layer. A folded crease between the two is the **spine** s;
//!   the end of the spine where the lower layer folds over a hinge is the
//!   **vertex** O, and that crease's line is the **hinge** h. Each layer is
//!   its face grown across flat creases off h and folded ones on s.
//! - **Preconditions, checked up front** (research §5.3: every free flap
//!   closed, 491 of 491; every free, uncovered one was unique, 416 of 416):
//!   both layers are held along h (the upper one folded over it, or flat
//!   beside it once an earlier squash has unfolded it); the flap is *free*,
//!   attached to the rest only along h; and it is *uncovered*, with no
//!   other paper over it, or inside it, on the side it squashes toward. Each
//!   is a refusal naming the faces in the way. An upper layer held by its
//!   spine alone has no squash: its hinge side would lie loose, both ways
//!   round (2 of 67 seeded draws, before this was checked).
//! - **The creases are per layer.** With the flap's wedge D from h to s and
//!   the spine's target t at μD (μ = 0, the hinge line, by default), the
//!   lower layer creases on the bisector of s and t, at h + (1 + μ)D/2, and
//!   the upper one at h + (1 − μ)D/2. One shared line closes only when the
//!   spine lands on h; for an asymmetric squash the spike measured a
//!   residual of 0.342 (research §5.3), so the lines are computed from
//!   (flap, target), never drawn.
//! - **Motions**: the lower layer's spine side reflects across its crease;
//!   the upper layer's spine side turns about O, across the spine and then
//!   with it (the spine unfolds); its hinge side reflects across h (its
//!   hinge toggles); everything else stays.

use std::collections::BTreeSet;
use std::f64::consts::PI;

use oristudio_geometry::Line;
use serde::{Deserialize, Serialize};

use crate::complete::CompletionLimits;
use crate::compound::CompoundRefused;
use crate::compound::pieces::{Cut, score_cuts};
use crate::compound::vertex::{
    Compiled, VertexChoices, VertexFoldKind, VertexOutcome, angle_between, cross, drop_empty,
    piece_centroid, rotate, stack_toward, toward, unit,
};
use crate::fold::line::Axis;
use crate::numerics::TOL;
use crate::pattern::{CreaseKind, FaceId};
use crate::refusal::{FoldRefusal, Refused, Side};
use crate::state::State;
use crate::view::Direction;

type Point = [f64; 2];

/// A squash fold, named the way a step stores it (plan D6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Squash {
    /// A sheet point on the flap's upper layer as the viewer sees it: the
    /// top layer at its image for a valley, the bottom one for a mountain.
    pub flap: Point,
    /// Where the spine lands: a direction from the vertex in the parent's
    /// model frame. None for the hinge line, the symmetric squash.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<Point>,
    /// As the viewer sees it.
    pub direction: Direction,
}

/// Why there is no flap to squash at a point.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NoFlap {
    /// Only one layer there.
    SingleLayer,
    /// The two layers there are joined by no folded crease.
    NoSpine,
    /// The lower layer folds over no hinge at either end of the spine.
    NoHinge,
    /// The upper layer is held by the spine alone, not along the hinge.
    UpperNotHinged,
}

/// A squash's flap and its creases, before it lands: what a tool previews.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SquashAnalysis {
    /// O, in the parent's model frame.
    pub vertex: Point,
    pub hinge: Line,
    pub spine: Line,
    /// Unit directions from O along the hinge and along the spine: a
    /// target is a direction between them, `wedge` from the first.
    pub hinge_direction: Point,
    pub spine_direction: Point,
    /// The flap's layers: the parent's faces, in id order.
    pub upper: Vec<FaceId>,
    pub lower: Vec<FaceId>,
    /// Each layer's crease, through O.
    pub upper_crease: Line,
    pub lower_crease: Line,
    /// The wedge D from the hinge to the spine, radians, counter-clockwise
    /// positive; and the target's share μ of it.
    pub wedge: f64,
    pub share: f64,
}

/// The flap by face positions, and its creases.
struct Flap {
    upper: Vec<usize>,
    lower: Vec<usize>,
    vertex: Point,
    /// The hinge's direction from the vertex.
    hinge: Point,
    wedge: f64,
    share: f64,
    lines: [Line; 4],
}

impl Flap {
    fn hinge_line(&self) -> Line {
        self.lines[0]
    }
    fn spine_line(&self) -> Line {
        self.lines[1]
    }
    fn lower_crease(&self) -> Line {
        self.lines[2]
    }
    fn upper_crease(&self) -> Line {
        self.lines[3]
    }
}

impl State {
    /// A squash's flap and creases, without folding.
    pub fn analyse_squash(&self, op: &Squash) -> Result<SquashAnalysis, Refused> {
        let direction = self.view().model_direction(op.direction);
        let flap = self.squash_flap(op, direction)?;
        let ids = |faces: &[usize]| faces.iter().map(|&f| self.faces()[f].id).collect();
        Ok(SquashAnalysis {
            vertex: flap.vertex,
            hinge: flap.hinge_line(),
            spine: flap.spine_line(),
            hinge_direction: flap.hinge,
            spine_direction: rotate(flap.hinge, flap.wedge),
            upper: ids(&flap.upper),
            lower: ids(&flap.lower),
            upper_crease: flap.upper_crease(),
            lower_crease: flap.lower_crease(),
            wedge: flap.wedge,
            share: flap.share,
        })
    }

    /// A squash fold, with its stored choices (empty for a new step), under
    /// the default completion limits.
    pub fn squash(
        &self,
        op: &Squash,
        choices: &VertexChoices,
    ) -> Result<VertexOutcome, CompoundRefused> {
        self.squash_within(op, choices, &CompletionLimits::default())
    }

    /// [`State::squash`] under `limits`. A refusal names the faces in the
    /// way; when no order fits, it offers the other direction if that
    /// lands. A stored choice that no longer resolves is
    /// [`CompoundRefused::Broken`].
    pub fn squash_within(
        &self,
        op: &Squash,
        choices: &VertexChoices,
        limits: &CompletionLimits,
    ) -> Result<VertexOutcome, CompoundRefused> {
        let direction = self.view().model_direction(op.direction);
        let compiled = self
            .compile_squash(op, direction)
            .map_err(CompoundRefused::Refused)?;
        compiled.land(self, choices, limits, || {
            self.compile_squash(op, direction.opposite()).ok()
        })
    }

    fn compile_squash(&self, op: &Squash, direction: Direction) -> Result<Compiled, Refused> {
        let flap = self.squash_flap(op, direction)?;
        let nf = self.faces().len();
        let mask = |faces: &[usize]| {
            let mut mask = vec![false; nf];
            for &f in faces {
                mask[f] = true;
            }
            mask
        };
        let (lower, upper) = (mask(&flap.lower), mask(&flap.upper));
        let scoring = score_cuts(
            self,
            &[
                Cut {
                    axis: Axis::new(&flap.lower_crease(), Side::Positive),
                    faces: lower.clone(),
                },
                Cut {
                    axis: Axis::new(&flap.upper_crease(), Side::Positive),
                    faces: upper.clone(),
                },
            ],
        )?;
        // Which side of a layer's crease a piece is on: the spine's, or
        // the hinge's.
        let on_spine_side = |c: Point, crease: Point| {
            cross(crease, [c[0] - flap.vertex[0], c[1] - flap.vertex[1]]) * flap.wedge.signum()
                > 0.0
        };
        let lower_dir = rotate(flap.hinge, (1.0 + flap.share) * flap.wedge / 2.0);
        let upper_dir = rotate(flap.hinge, (1.0 - flap.share) * flap.wedge / 2.0);
        let mut block_of = Vec::with_capacity(scoring.faces.len());
        for a in 0..scoring.faces.len() {
            let old = scoring.old[a];
            let block = if lower[old] || upper[old] {
                let c = piece_centroid(self, &scoring, a).ok_or(FoldRefusal::Internal {
                    message: "a squashed piece has no centroid".to_string(),
                })?;
                match (
                    lower[old],
                    on_spine_side(c, lower_dir),
                    on_spine_side(c, upper_dir),
                ) {
                    (true, true, _) => Some(0),
                    (true, false, _) => None,
                    (false, _, true) => Some(1),
                    (false, _, false) => Some(2),
                }
            } else {
                None
            };
            block_of.push(block);
        }
        // Q′ reflects across its crease; P′ across the spine, then with Q′;
        // the upper layer's hinge side back across the hinge.
        let turns = vec![
            vec![(1, flap.lower_crease())],
            vec![(0, flap.spine_line()), (1, flap.lower_crease())],
            vec![(1, flap.hinge_line())],
        ];
        let turns = drop_empty(&mut block_of, turns);
        Ok(Compiled {
            kind: VertexFoldKind::Squash,
            scoring,
            block_of,
            turns,
            vertices: vec![flap.vertex],
            direction,
            extra: Vec::new(),
        })
    }

    /// The flap `op` names, checked free and uncovered, and its creases.
    fn squash_flap(&self, op: &Squash, direction: Direction) -> Result<Flap, Refused> {
        let faces = self.faces();
        let geometry = self.geometry();
        let topology = self.topology();
        let images = &geometry.vertex_images;
        let ids = |set: &[usize]| -> Vec<FaceId> {
            let mut ids: Vec<FaceId> = set.iter().map(|&f| faces[f].id).collect();
            ids.sort_unstable();
            ids.dedup();
            ids
        };
        let p = self
            .face_at(op.flap)
            .and_then(|id| self.face_position(id))
            .ok_or(FoldRefusal::WitnessNotInFace { point: op.flap })?;
        let at = geometry.isometries[p].apply(op.flap);
        let stack = stack_toward(self, at, direction).ok_or(FoldRefusal::Internal {
            message: "the layers at the flap point do not stack".to_string(),
        })?;
        match stack.iter().position(|&f| f == p) {
            Some(0) => {}
            Some(i) => {
                return Err(FoldRefusal::SquashFlapCovered {
                    faces: ids(&stack[..i]),
                    flap: ids(&[p]),
                }
                .into());
            }
            None => return Err(FoldRefusal::WitnessNotInFace { point: op.flap }.into()),
        }
        let Some(&q) = stack.get(1) else {
            return Err(FoldRefusal::SquashNoFlap {
                faces: ids(&[p]),
                cause: NoFlap::SingleLayer,
            }
            .into());
        };

        // The spine: the folded creases between the two.
        let creases = self.creases();
        let spine: Vec<usize> = topology.face_creases[p]
            .iter()
            .copied()
            .filter(|&k| creases[k].kind.is_folded() && topology.across(k, p) == Some(q))
            .collect();
        let no_flap = |cause| -> Refused {
            FoldRefusal::SquashNoFlap {
                faces: ids(&[p, q]),
                cause,
            }
            .into()
        };
        let Some(&first) = spine.first() else {
            return Err(no_flap(NoFlap::NoSpine));
        };
        let [a, b] = creases[first].vertices.map(|v| images[v.index()]);
        let spine_line = Line::from_points(a, b).ok_or(FoldRefusal::Internal {
            message: "a spine crease has no length".to_string(),
        })?;
        // Its two ends: the extreme vertices along it.
        let mut ends: Vec<(f64, usize)> = spine
            .iter()
            .flat_map(|&k| creases[k].vertices)
            .map(|v| (spine_line.parameter(images[v.index()]), v.index()))
            .collect();
        ends.sort_by(|x, y| x.0.total_cmp(&y.0));
        let (Some(&(_, lo)), Some(&(_, hi))) = (ends.first(), ends.last()) else {
            return Err(no_flap(NoFlap::NoSpine));
        };

        // The vertex: the end where the lower layer folds over a hinge.
        let Some((o, other, hinge)) = [(lo, hi), (hi, lo)]
            .into_iter()
            .find_map(|(v, w)| self.hinge_at(q, v, &spine_line).map(|h| (v, w, h)))
        else {
            return Err(no_flap(NoFlap::NoHinge));
        };
        let vertex = images[o];
        let spine_dir = unit([images[other][0] - vertex[0], images[other][1] - vertex[1]])
            .ok_or(no_flap(NoFlap::NoSpine))?;
        let hinge_dir =
            unit([hinge[0] - vertex[0], hinge[1] - vertex[1]]).ok_or(no_flap(NoFlap::NoHinge))?;
        let wedge = angle_between(hinge_dir, spine_dir);
        let hinge_line =
            Line::from_point_direction(vertex, hinge_dir).ok_or(no_flap(NoFlap::NoHinge))?;

        // The flap: both faces grown across flat creases off the hinge line
        // and folded ones on the spine's; attached elsewhere, it is not free.
        let on = |line: &Line, k: usize| {
            creases[k]
                .vertices
                .iter()
                .all(|v| line.distance_to_point(images[v.index()]) <= TOL)
        };
        let mut in_flap = vec![false; faces.len()];
        in_flap[p] = true;
        in_flap[q] = true;
        let mut queue = vec![p, q];
        while let Some(f) = queue.pop() {
            for &k in &topology.face_creases[f] {
                let Some(g) = topology.across(k, f) else {
                    continue;
                };
                let joins = match creases[k].kind {
                    CreaseKind::Flat(_) => !on(&hinge_line, k),
                    CreaseKind::Folded(_) => on(&spine_line, k),
                    CreaseKind::Border => false,
                };
                if joins && !in_flap[g] {
                    in_flap[g] = true;
                    queue.push(g);
                }
            }
        }
        let flap: Vec<usize> = (0..faces.len()).filter(|&f| in_flap[f]).collect();
        let attached: Vec<usize> = flap
            .iter()
            .flat_map(|&f| {
                topology.face_creases[f]
                    .iter()
                    .filter_map(move |&k| topology.across(k, f).map(|g| (k, g)))
            })
            .filter(|&(k, g)| !in_flap[g] && !on(&hinge_line, k))
            .map(|(_, g)| g)
            .collect();
        if !attached.is_empty() {
            return Err(FoldRefusal::SquashFlapNotFree {
                faces: ids(&attached),
                flap: ids(&flap),
            }
            .into());
        }
        // The upper layer must be held along the hinge too (folded over it,
        // or flat beside it): one held by its spine alone has no squash, its
        // hinge side lying loose.
        let up = geometry.isometries[p].front_up();
        let hinged = flap.iter().any(|&f| {
            geometry.isometries[f].front_up() == up
                && topology.face_creases[f].iter().any(|&k| {
                    topology.across(k, f).is_some_and(|g| !in_flap[g]) && on(&hinge_line, k)
                })
        });
        if !hinged {
            return Err(no_flap(NoFlap::UpperNotHinged));
        }
        // Uncovered: no other paper on the side it squashes toward.
        let mut covering = BTreeSet::new();
        for (pair, _) in self.order().pairs() {
            let (Some(f), Some(g)) = (self.face_position(pair.lo()), self.face_position(pair.hi()))
            else {
                continue;
            };
            let (x, y) = match (in_flap[f], in_flap[g]) {
                (true, false) => (g, f),
                (false, true) => (f, g),
                _ => continue,
            };
            if toward(self, x, y, direction) == Some(true) {
                covering.insert(x);
            }
        }
        if !covering.is_empty() {
            let covering: Vec<usize> = covering.into_iter().collect();
            return Err(FoldRefusal::SquashFlapCovered {
                faces: ids(&covering),
                flap: ids(&flap),
            }
            .into());
        }
        let (upper, lower): (Vec<usize>, Vec<usize>) = flap
            .iter()
            .partition(|&&f| geometry.isometries[f].front_up() == up);

        // Where the spine lands, and each layer's crease.
        let share = match op.target {
            None => 0.0,
            Some(target) => {
                let target = unit(target).ok_or(FoldRefusal::SquashTargetOutside)?;
                angle_between(hinge_dir, target) / wedge
            }
        };
        // A share that is not a number is outside too.
        let inside = share.abs() < 1.0;
        if !inside || wedge.abs() >= PI {
            return Err(FoldRefusal::SquashTargetOutside.into());
        }
        let crease = |share: f64| {
            Line::from_point_direction(vertex, rotate(hinge_dir, share * wedge / 2.0))
                .ok_or(FoldRefusal::SquashTargetOutside)
        };
        let lower_crease = crease(1.0 + share)?;
        let upper_crease = crease(1.0 - share)?;
        Ok(Flap {
            upper,
            lower,
            vertex,
            hinge: hinge_dir,
            wedge,
            share,
            lines: [hinge_line, spine_line, lower_crease, upper_crease],
        })
    }

    /// Where the lower layer `q` folds over a hinge at its vertex `v`, an end
    /// of the spine on `spine`: walking round `v` from the spine across flat
    /// creases, the far end of the first folded crease off the spine's line.
    /// None at a border.
    fn hinge_at(&self, q: usize, v: usize, spine: &Line) -> Option<Point> {
        let topology = self.topology();
        let creases = self.creases();
        let images = &self.geometry().vertex_images;
        let on_spine = |k: usize| {
            creases[k]
                .vertices
                .iter()
                .all(|w| spine.distance_to_point(images[w.index()]) <= TOL)
        };
        // The crease the walk came across, and the face it is in.
        let (mut face, mut came) = (q, None::<usize>);
        for _ in 0..self.faces().len() {
            let ring = &self.faces()[face].ring;
            let i = ring.iter().position(|w| w.index() == v)?;
            let n = ring.len();
            let edges = [
                topology.face_creases[face][(i + n - 1) % n],
                topology.face_creases[face][i],
            ];
            let next = match came {
                None => edges.into_iter().find(|&k| !on_spine(k))?,
                Some(c) => edges.into_iter().find(|&k| k != c)?,
            };
            match creases[next].kind {
                CreaseKind::Folded(_) if !on_spine(next) => {
                    let w = creases[next].vertices.iter().find(|w| w.index() != v)?;
                    return Some(images[w.index()]);
                }
                CreaseKind::Flat(_) => {
                    face = topology.across(next, face)?;
                    came = Some(next);
                }
                _ => return None,
            }
        }
        None
    }
}
