//! A compound step's motion, as the animation draws it (plan D15, research
//! §9): legs, each turning groups of paper about a hinge, with exact
//! endpoints.
//!
//! A plain fold is one rigid motion of two groups and the web plays it from
//! the step's own geometry. A reverse fold has no rigid motion short of
//! unfolding the vertex where ℓ meets the spine flat (research §9, `r1-
//! folding3d-sim-animation` E): its two branches meet only there. So its
//! motion is *visual*: each block turns about ℓ as a hinge, the lower blocks
//! one way and the upper the other, as if the spine let go; the first frame
//! is the parent and the last the landed state, exactly.
//!
//! Two legs, split where the turning paper stands edge-on (a quarter turn),
//! where it covers no area and its stacking can change without a jump:
//!
//! - **spread**: from flat to edge-on, stacked as the parent stacks it;
//! - **close**: from edge-on to landed, stacked as the landed state does,
//!   so the last frame draws what lands, in the order it lands in.
//!
//! A vertex fold (squash, petal, rabbit ear, swivel) turns some paper about
//! more than one crease: its blocks' motions are products of reflections.
//! Its motion is staged ([`StepMotion::staged`]): each stage a spread and a
//! close leg, each block turning about one of its creases per stage or
//! resting, a group's `then` taking it from where the turn leaves it to
//! where it lands. Every leg places every moving face, and only the last
//! stacks as the landed state.

use std::f64::consts::{FRAC_PI_2, PI};

use oristudio_geometry::Line;
use serde::Serialize;

use crate::isometry::Isometry;
use crate::pattern::FaceId;
use crate::refusal::Side;

type Point = [f64; 2];

/// Whether a motion is the paper's own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MotionKind {
    /// Every frame is a pose the paper can take.
    Rigid,
    /// Only the endpoints are states; the frames between are a picture.
    Visual,
}

/// What a leg does, for the transport's pacing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LegName {
    /// The moving paper lifts from where it lay to edge-on.
    Spread,
    /// It comes down from edge-on to where it lands.
    Close,
}

/// Which state's layer order draws the turning paper against the paper that
/// stays, during a leg.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Stacking {
    /// The parent's: each turning face as its parent face lay.
    Parent,
    /// The landed state's.
    Landed,
}

/// Paper turning about one hinge during one leg.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MotionGroup {
    /// The landed state's faces that turn together.
    pub faces: Vec<FaceId>,
    /// The hinge, in the parent's model frame (and the landed state's, which
    /// is the same: what stays keeps its isometry).
    pub axis: Line,
    /// The side of `axis` the faces start on.
    pub side: Side,
    /// The turn at the leg's start and end, in radians: 0 where the faces
    /// lay before this turn, ±π where it leaves them; positive lifts them
    /// toward +z of the model frame.
    pub from: f64,
    pub to: f64,
    /// What the faces still do after this turn, in the model frame: the
    /// identity (left out) when this turn lands them. A vertex fold turns
    /// some paper twice (`StepMotion::staged`).
    #[serde(default, skip_serializing_if = "is_identity")]
    pub then: Isometry,
}

impl MotionGroup {
    /// Where the turn `angle` puts a point of one of the group's faces,
    /// given where it lands (a model-frame point of the landed state): its
    /// model-frame position and its height above the paper that stays.
    /// At ±π this is where the turn leaves it (`landed`, for the last turn)
    /// at height 0; at 0, where it lay before the turn (where the parent
    /// had it, for the first).
    pub fn place(&self, landed: Point, angle: f64) -> [f64; 3] {
        let n = match self.side {
            Side::Positive => self.axis.n,
            Side::Negative => [-self.axis.n[0], -self.axis.n[1]],
        };
        // The point where the turn starts is where it leaves it reflected
        // across the hinge.
        let start = self.axis.reflect_point(self.then.inverse().apply(landed));
        let d = n[0] * start[0] + n[1] * start[1]
            - match self.side {
                Side::Positive => self.axis.d,
                Side::Negative => -self.axis.d,
            };
        let pulled = d * (1.0 - angle.cos());
        [
            start[0] - pulled * n[0],
            start[1] - pulled * n[1],
            d * angle.sin(),
        ]
    }
}

/// One leg of a motion: groups turning at once.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MotionLeg {
    pub name: LegName,
    pub stacking: Stacking,
    pub groups: Vec<MotionGroup>,
}

/// A step's motion: its legs, played in order (see the module docs).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StepMotion {
    pub kind: MotionKind,
    pub legs: Vec<MotionLeg>,
}

impl StepMotion {
    /// Groups turning about `axis` from `side` by a half turn each, upward
    /// (toward +z) or downward, through a spread and a close leg (see the
    /// module docs). Each entry of `groups` is a group's landed faces and
    /// whether it turns upward.
    pub(crate) fn half_turns(
        axis: Line,
        side: Side,
        groups: &[(Vec<FaceId>, bool)],
        kind: MotionKind,
    ) -> StepMotion {
        let leg = |name: LegName, stacking: Stacking, from: f64, to: f64| MotionLeg {
            name,
            stacking,
            groups: groups
                .iter()
                .map(|(faces, up)| {
                    let sign = if *up { 1.0 } else { -1.0 };
                    MotionGroup {
                        faces: faces.clone(),
                        axis,
                        side,
                        from: sign * from,
                        to: sign * to,
                        then: Isometry::IDENTITY,
                    }
                })
                .collect(),
        };
        StepMotion {
            kind,
            legs: vec![
                leg(LegName::Spread, Stacking::Parent, 0.0, FRAC_PI_2),
                leg(LegName::Close, Stacking::Landed, FRAC_PI_2, PI),
            ],
        }
    }

    /// Blocks turning in stages (a vertex fold's visual motion, plan D15):
    /// each block's motion is the product of half turns about its `turns`,
    /// applied in order, each in its own stage. A stage is a spread and a
    /// close leg, as [`StepMotion::half_turns`]'s, in which every block
    /// appears: turning, if it turns then, or resting where its turns so far
    /// left it (`from == to`), so a frame of any leg places every moving
    /// face. Every leg stacks as the parent but the last, which stacks as
    /// the landed state. `up` lifts every turn toward +z of the model frame.
    pub(crate) fn staged(blocks: &[StagedBlock], up: bool, kind: MotionKind) -> StepMotion {
        let stages = blocks
            .iter()
            .flat_map(|b| b.turns.iter().map(|(stage, _)| stage + 1))
            .max()
            .unwrap_or(0);
        let sign = if up { 1.0 } else { -1.0 };
        let mut legs = Vec::with_capacity(2 * stages);
        for stage in 0..stages {
            for (name, from, to) in [
                (LegName::Spread, 0.0, FRAC_PI_2),
                (LegName::Close, FRAC_PI_2, PI),
            ] {
                let last = stage + 1 == stages && name == LegName::Close;
                let groups = blocks
                    .iter()
                    .filter_map(|b| b.group(stage, sign * from, sign * to, sign * PI))
                    .collect();
                legs.push(MotionLeg {
                    name,
                    stacking: if last {
                        Stacking::Landed
                    } else {
                        Stacking::Parent
                    },
                    groups,
                });
            }
        }
        StepMotion { kind, legs }
    }
}

/// A block of a vertex fold as its motion draws it ([`StepMotion::staged`]).
#[derive(Debug, Clone)]
pub(crate) struct StagedBlock {
    /// The landed state's faces in the block.
    pub(crate) faces: Vec<FaceId>,
    /// Its half turns in the order they apply, each with its stage: the
    /// block's motion is their reflections' product, the last outermost.
    pub(crate) turns: Vec<(usize, Line)>,
    /// A model-frame point inside the block's landed paper: what tells the
    /// side of each hinge it turns from.
    pub(crate) at: Point,
}

impl StagedBlock {
    /// The block's group in `stage`: turning from `from` to `to` about the
    /// turn it makes then, or resting where its turns leave it, at 0 before
    /// its next turn or at `rest` (±π) after its last. None for a block with
    /// no turns.
    fn group(&self, stage: usize, from: f64, to: f64, rest: f64) -> Option<MotionGroup> {
        let (k, from, to) = match self.turns.iter().position(|(s, _)| *s == stage) {
            Some(k) => (k, from, to),
            None => match self.turns.iter().position(|(s, _)| *s > stage) {
                Some(k) => (k, 0.0, 0.0),
                None => (self.turns.len().checked_sub(1)?, rest, rest),
            },
        };
        let axis = self.turns[k].1;
        let then = self.turns[k + 1..]
            .iter()
            .fold(Isometry::IDENTITY, |m, (_, line)| {
                reflection(line).after(&m)
            });
        let start = axis.reflect_point(then.inverse().apply(self.at));
        Some(MotionGroup {
            faces: self.faces.clone(),
            axis,
            side: Side::of_point(&axis, start).unwrap_or(Side::Positive),
            from,
            to,
            then,
        })
    }
}

/// The reflection across a line.
pub(crate) fn reflection(line: &Line) -> Isometry {
    Isometry::reflection(line.n, line.d)
}

fn is_identity(m: &Isometry) -> bool {
    *m == Isometry::IDENTITY
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: [f64; 3], b: [f64; 3]) -> bool {
        a.iter().zip(&b).all(|(x, y)| (x - y).abs() < 1e-12)
    }

    #[test]
    fn a_half_turn_ends_where_the_fold_lands_it() {
        // ℓ: x = 0.5; the tip started at x > 0.5, landed reflected.
        let Some(axis) = Line::new([1.0, 0.0], 0.5) else {
            unreachable!()
        };
        let motion = StepMotion::half_turns(
            axis,
            Side::Positive,
            &[(vec![FaceId(1)], true), (vec![FaceId(2)], false)],
            MotionKind::Visual,
        );
        assert_eq!(motion.legs.len(), 2);
        let [spread, closing] = [&motion.legs[0], &motion.legs[1]];
        assert_eq!(spread.stacking, Stacking::Parent);
        assert_eq!(closing.stacking, Stacking::Landed);
        // The legs meet edge-on, and the groups turn opposite ways.
        let (up, down) = (&closing.groups[0], &closing.groups[1]);
        assert_eq!(spread.groups[0].to, up.from);
        assert_eq!(up.to, PI);
        assert_eq!(down.to, -PI);
        let landed = [0.2, 0.7];
        assert!(close(up.place(landed, up.to), [0.2, 0.7, 0.0]));
        assert!(close(up.place(landed, 0.0), [0.8, 0.7, 0.0]));
        // Edge-on: over the hinge, as high as the point was far from it.
        assert!(close(up.place(landed, up.from), [0.5, 0.7, 0.3]));
        assert!(close(down.place(landed, down.from), [0.5, 0.7, -0.3]));
        // The same from the other side.
        let other = MotionGroup {
            side: Side::Negative,
            ..up.clone()
        };
        assert!(close(other.place([0.8, 0.1], PI), [0.8, 0.1, 0.0]));
        assert!(close(other.place([0.8, 0.1], 0.0), [0.2, 0.1, 0.0]));
    }

    #[test]
    fn a_staged_motion_turns_each_block_in_turn_and_never_jumps() {
        // Block 0 turns across x = 0.5 and then y = 0.5; block 1 across
        // y = 0.5 only, in the second stage.
        let (Some(x), Some(y)) = (Line::new([1.0, 0.0], 0.5), Line::new([0.0, 1.0], 0.5)) else {
            unreachable!()
        };
        let landed =
            |start: Point, turns: &[Line]| turns.iter().fold(start, |p, l| l.reflect_point(p));
        let (a0, b0) = ([0.8, 0.7], [0.3, 0.9]);
        let (a, b) = (landed(a0, &[x, y]), landed(b0, &[y]));
        let blocks = [
            StagedBlock {
                faces: vec![FaceId(1)],
                turns: vec![(0, x), (1, y)],
                at: a,
            },
            StagedBlock {
                faces: vec![FaceId(2)],
                turns: vec![(1, y)],
                at: b,
            },
        ];
        let motion = StepMotion::staged(&blocks, true, MotionKind::Visual);
        assert_eq!(motion.legs.len(), 4);
        assert_eq!(motion.legs[2].stacking, Stacking::Parent);
        assert_eq!(motion.legs[3].stacking, Stacking::Landed);
        for (k, (landed, start)) in [(a, a0), (b, b0)].into_iter().enumerate() {
            let at = |leg: usize, end: bool| {
                let g = &motion.legs[leg].groups[k];
                g.place(landed, if end { g.to } else { g.from })
            };
            assert!(close(at(0, false), [start[0], start[1], 0.0]), "block {k}");
            assert!(close(at(3, true), [landed[0], landed[1], 0.0]), "block {k}");
            for leg in 0..3 {
                assert!(
                    close(at(leg, true), at(leg + 1, false)),
                    "block {k} leg {leg}"
                );
            }
        }
        // Block 1 rests through the first stage, block 0 turns in both.
        assert_eq!(motion.legs[0].groups[1].from, motion.legs[0].groups[1].to);
        assert!(motion.legs[0].groups[0].to > motion.legs[0].groups[0].from);
        assert!(motion.legs[2].groups[0].to > motion.legs[2].groups[0].from);
    }
}
