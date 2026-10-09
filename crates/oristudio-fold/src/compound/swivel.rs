//! The swivel (plan Phase 11, research §5.3), a vertex fold
//! ([`super::vertex`]) at a free vertex: four rays from a point inside the
//! chosen layers ([`super::fan`]), three toward given points and the
//! emergent fourth, folded as the rabbit ear's are. Free: the vertex lies in
//! no crease, so the layers are cut there afresh. With the direction seed
//! the spike found each of its cases unique (research §5.3).

use serde::{Deserialize, Serialize};

use crate::complete::CompletionLimits;
use crate::compound::CompoundRefused;
use crate::compound::fan::{FanAnalysis, FanInput};
use crate::compound::vertex::{VertexChoices, VertexFoldKind, VertexOutcome, unit};
use crate::fold::Seed;
use crate::refusal::{FoldRefusal, Refused};
use crate::state::State;
use crate::view::Direction;

type Point = [f64; 2];

/// A swivel, named the way a step stores it (plan D6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Swivel {
    /// The vertex, in the parent's model frame.
    pub vertex: Point,
    /// The points the three given rays run toward, in the parent's model
    /// frame.
    pub toward: [Point; 3],
    /// The fourth ray, a direction from the vertex in the parent's model
    /// frame: the nearest Kawasaki candidate is taken.
    pub emergent: Point,
    /// The layers the creases cut, at the vertex.
    pub layers: Seed,
    /// A sheet point on paper that stays.
    pub stayer: Point,
    /// As the viewer sees it.
    pub direction: Direction,
}

impl Swivel {
    fn input(&self) -> Result<FanInput, Refused> {
        let ray = |p: Point| unit([p[0] - self.vertex[0], p[1] - self.vertex[1]]);
        let [a, b, c] = self.toward;
        let (Some(a), Some(b), Some(c)) = (ray(a), ray(b), ray(c)) else {
            return Err(FoldRefusal::FanNotFlat.into());
        };
        Ok(FanInput {
            kind: VertexFoldKind::Swivel,
            center: self.vertex,
            given: [a, b, c],
            emergent: self.emergent,
            layers: self.layers.clone(),
            stayer: self.stayer,
            direction: self.direction,
            ridge: None,
        })
    }
}

impl State {
    /// A swivel's rays, emergent candidates and layers, without folding.
    pub fn analyse_swivel(&self, op: &Swivel) -> Result<FanAnalysis, Refused> {
        op.input()?.analyse(self)
    }

    /// A swivel, with its stored choices (empty for a new step), under the
    /// default completion limits.
    pub fn swivel(
        &self,
        op: &Swivel,
        choices: &VertexChoices,
    ) -> Result<VertexOutcome, CompoundRefused> {
        self.swivel_within(op, choices, &CompletionLimits::default())
    }

    /// [`State::swivel`] under `limits`. A refusal of its emergent ray
    /// offers the candidates that land.
    pub fn swivel_within(
        &self,
        op: &Swivel,
        choices: &VertexChoices,
        limits: &CompletionLimits,
    ) -> Result<VertexOutcome, CompoundRefused> {
        op.input()
            .map_err(CompoundRefused::Refused)?
            .land(self, choices, limits)
    }
}
