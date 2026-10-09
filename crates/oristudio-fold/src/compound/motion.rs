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

use std::f64::consts::{FRAC_PI_2, PI};

use oristudio_geometry::Line;
use serde::Serialize;

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
    /// lay in the parent, ±π where they land; positive lifts them toward +z
    /// of the model frame.
    pub from: f64,
    pub to: f64,
}

impl MotionGroup {
    /// Where the turn `angle` puts a point of one of the group's faces,
    /// given where it lands (a model-frame point of the landed state): its
    /// model-frame position and its height above the paper that stays.
    /// At ±π this is `landed` at height 0; at 0, where the parent had it.
    pub fn place(&self, landed: Point, angle: f64) -> [f64; 3] {
        let n = match self.side {
            Side::Positive => self.axis.n,
            Side::Negative => [-self.axis.n[0], -self.axis.n[1]],
        };
        // The point where the parent had it is the landed one reflected
        // across the hinge.
        let start = self.axis.reflect_point(landed);
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
}
