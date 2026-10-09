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
//! A tuck is one block turning the same way. A crimp is four legs: its strip
//! and tip spread and close about ℓ1 as a reverse fold's blocks do, then the
//! tip spreads and closes again about where ℓ2 went; the tip's first two
//! legs end where the strip carried it (`MotionGroup::before`).

use std::f64::consts::FRAC_PI_2;

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
    /// lay in the parent, ±π where they land; positive lifts them toward +z
    /// of the model frame.
    pub from: f64,
    pub to: f64,
    /// Where this turn's ±π puts the faces, from where they land, when that
    /// is not where they land: a crimp's tip turns about ℓ1 with its strip
    /// and lands only after a second turn, about ℓ2, so its first turn ends
    /// at `before` applied to its landed points. None for every leg of a
    /// plain or reverse fold.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<Isometry>,
}

impl MotionGroup {
    /// Where the turn `angle` puts a point of one of the group's faces,
    /// given where it lands (a model-frame point of the landed state): its
    /// model-frame position and its height above the paper that stays.
    /// At ±π this is `landed` at height 0 (`before` it, when there is one);
    /// at 0, where the faces were when the turn started.
    pub fn place(&self, landed: Point, angle: f64) -> [f64; 3] {
        let landed = self.before.map_or(landed, |before| before.apply(landed));
        let n = match self.side {
            Side::Positive => self.axis.n,
            Side::Negative => [-self.axis.n[0], -self.axis.n[1]],
        };
        // The point where the turn starts it is the one it ends at
        // reflected across the hinge.
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
        let turn = Turn { axis, side };
        StepMotion {
            kind,
            legs: vec![
                turn.leg(LegName::Spread, Stacking::Parent, 0.0, groups, None),
                turn.leg(LegName::Close, Stacking::Landed, FRAC_PI_2, groups, None),
            ],
        }
    }

    /// A crimp's motion, visual: the strip and the tip turn about ℓ1 as a
    /// reverse fold's blocks do (`first`, from the side they start on), the
    /// tip ending its turn where the strip carried it (`carried`, from where
    /// it lands); then the tip turns about where ℓ2 went (`second`, from the
    /// side it is carried to). Each group is its landed faces and whether
    /// it turns upward; every turn spreads to edge-on and closes, stacked as
    /// the parent stacks it only while nothing has landed.
    pub(crate) fn crimp(
        first: Turn,
        second: Turn,
        strip: &[(Vec<FaceId>, bool)],
        tip: &[(Vec<FaceId>, bool)],
        carried: Isometry,
    ) -> StepMotion {
        let both = |stacking: Stacking, from: f64, name: LegName| {
            let mut leg = first.leg(name, stacking, from, strip, None);
            leg.groups
                .extend(first.leg(name, stacking, from, tip, Some(carried)).groups);
            leg
        };
        StepMotion {
            kind: MotionKind::Visual,
            legs: vec![
                both(Stacking::Parent, 0.0, LegName::Spread),
                both(Stacking::Landed, FRAC_PI_2, LegName::Close),
                second.leg(LegName::Spread, Stacking::Landed, 0.0, tip, None),
                second.leg(LegName::Close, Stacking::Landed, FRAC_PI_2, tip, None),
            ],
        }
    }
}

/// A hinge groups turn about: its line in the parent's model frame, and the
/// side of it they start on.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Turn {
    pub(crate) axis: Line,
    pub(crate) side: Side,
}

impl Turn {
    /// A quarter turn from `from` (0 or π/2) of each group, upward or down.
    fn leg(
        &self,
        name: LegName,
        stacking: Stacking,
        from: f64,
        groups: &[(Vec<FaceId>, bool)],
        before: Option<Isometry>,
    ) -> MotionLeg {
        MotionLeg {
            name,
            stacking,
            groups: groups
                .iter()
                .map(|(faces, up)| {
                    let sign = if *up { 1.0 } else { -1.0 };
                    MotionGroup {
                        faces: faces.clone(),
                        axis: self.axis,
                        side: self.side,
                        from: sign * from,
                        to: sign * (from + FRAC_PI_2),
                        before,
                    }
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::f64::consts::PI;

    use super::*;

    fn close(a: [f64; 3], b: [f64; 3]) -> bool {
        a.iter().zip(&b).all(|(x, y)| (x - y).abs() < 1e-12)
    }

    #[test]
    fn a_crimps_tip_turns_twice_and_its_legs_meet() {
        // ℓ1: x = 0.5 and ℓ2: x = 0.8, the tip beyond x = 0.8: the strip
        // reflects across ℓ1, the tip translates by −0.6 (ρ1 ∘ ρ2), and ℓ2
        // goes to x = 0.2.
        let line = |c: f64| Line::new([1.0, 0.0], c).unwrap_or_else(|| unreachable!());
        let motion = StepMotion::crimp(
            Turn {
                axis: line(0.5),
                side: Side::Positive,
            },
            Turn {
                axis: line(0.2),
                side: Side::Negative,
            },
            &[(vec![FaceId(1)], true)],
            &[(vec![FaceId(2)], true)],
            Isometry::reflection([1.0, 0.0], 0.2),
        );
        let names: Vec<LegName> = motion.legs.iter().map(|l| l.name).collect();
        assert_eq!(
            names,
            [
                LegName::Spread,
                LegName::Close,
                LegName::Spread,
                LegName::Close
            ]
        );
        let tip_of = |leg: &MotionLeg| {
            leg.groups
                .iter()
                .find(|g| g.faces == [FaceId(2)])
                .cloned()
                .unwrap_or_else(|| panic!("no tip in {leg:?}"))
        };
        let tips: Vec<MotionGroup> = motion.legs.iter().map(tip_of).collect();
        let landed = [0.3, 0.3];
        assert!(close(tips[0].place(landed, tips[0].from), [0.9, 0.3, 0.0]));
        assert!(close(tips[1].place(landed, tips[1].to), [0.1, 0.3, 0.0]));
        assert!(close(tips[2].place(landed, tips[2].from), [0.1, 0.3, 0.0]));
        assert!(close(tips[3].place(landed, tips[3].to), [0.3, 0.3, 0.0]));
        for k in 0..3 {
            let (a, b) = (&tips[k], &tips[k + 1]);
            if a.axis == b.axis {
                assert!(close(a.place(landed, a.to), b.place(landed, b.from)));
            }
        }
        // The strip turns about ℓ1 only.
        assert_eq!(motion.legs[2].groups.len(), 1);
        assert!(motion.legs[0].groups[0].before.is_none());
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
