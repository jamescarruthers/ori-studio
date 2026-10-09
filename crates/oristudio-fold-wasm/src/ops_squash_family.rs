//! The vertex folds — squash, petal fold, rabbit ear, swivel (plan Phase 11)
//! — on the bridge.
//!
//! **Ops** are the Fold document's own shapes (`FoldSquashOp`,
//! `FoldPetalOp`, `FoldRabbitEarOp`, `FoldSwivelOp` in
//! `apps/web/src/fold/document/foldSequenceDocument.ts`). What names paper is
//! a sheet point, resolved here in the parent (plan D6): the flap and the
//! petal on their layers, a point on H's precrease, the triangle's corners,
//! the swivel's vertex and the points its rays run toward, the stayer. What
//! the step chose is a result: the spine's target, the emergent ray and the
//! ridge are directions in the parent's model frame, and replay takes the
//! nearest (an axiom's root is replayed the same way). A step's
//! `choices.completion` is the engine's `VertexChoices` as it is.
//!
//! **Replay** (`FoldEngine::apply`, [`land`]): a stored step lands, or is
//! refused — the engine's refusal, a stored choice that no longer resolves
//! (`choice_broken`), or a completion that leaves a choice the step does not
//! store (`choice_needed`) — and the replay marks it broken.
//!
//! **The tools** ([`Pending`] and the calls below): a fold that leaves a
//! choice is held under its own handle, like an opened import, and each pick
//! lands one order as a held state with the choices the step stores.
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineSquashWire.ts` holds these shapes.
//! class FoldEngine {
//!   /** The flap, line or fan a vertex op names, before it folds. */
//!   vertex_analysis(state: number, op: FoldVertexOp): Outcome<{ analysis: VertexAnalysis }>;
//!   /** Fold it: landed (a held state, as `apply` returns it) or a choice
//!    *  of orders held under `pending`. `choices` may be undefined. */
//!   vertex_fold(state: number, op: FoldVertexOp, choices?: FoldChoices): Outcome<VertexTried>;
//!   /** Land one listed order per component; its `vertex.stored` is what
//!    *  the step stores. */
//!   vertex_pick(pending: number, choice: Uint32Array): Outcome<Applied>;
//!   /** Let pending choices go; how many were held. */
//!   release_vertex_choices(pending: Uint32Array): number;
//! }
//! ```

use std::collections::HashMap;

use oristudio_fold::{
    ChoiceCount, CompoundRefused, Direction, FanAnalysis, PetalAnalysis, PetalFold, RabbitEar,
    Squash, SquashAnalysis, State, Swivel, VertexChoice, VertexChoices, VertexFolded,
    VertexOutcome,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::Bridge;
use crate::compound::{NeededChoice, choice_needed, compound_refusal};
use crate::resolve::{Rejection, finite_point};
use crate::wire::{
    Applied, BridgeError, BridgeRefusal, Choices, Op, Outcome, Point, Refusal, SeedInput,
};
use crate::{FoldEngine, bridge_error, parse, parse_choices, to_js_value};

// ---------------------------------------------------------------------------
// The document's ops

/// `FoldSquashOp`: the flap by a sheet point on its upper layer as the
/// viewer sees it; where its spine lands, a model-frame direction from the
/// vertex (absent: the hinge line); valley or mountain as seen.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SquashOp {
    pub flap: Point,
    #[serde(default)]
    pub target: Option<Point>,
    pub direction: Direction,
}

/// `FoldPetalOp`: H by a sheet point inside its precrease's sheet segment,
/// the petal by a sheet point on the flap's top layer below H, the direction.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct PetalOp {
    pub crease: Point,
    pub petal: Point,
    pub direction: Direction,
}

/// `FoldRabbitEarOp`: the triangle's corners as sheet points, the emergent
/// ray and the ridge as model-frame directions from the incenter, the
/// layers at the incenter (`seed`), a sheet point that stays, the direction.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RabbitEarOp {
    pub corners: [Point; 3],
    pub emergent: Point,
    pub seed: SeedInput,
    pub stayer: Point,
    pub direction: Direction,
    #[serde(default)]
    pub ridge: Option<Point>,
}

/// `FoldSwivelOp`: the vertex and the points its three given rays run
/// toward as sheet points, the emergent ray as a model-frame direction, the
/// layers at the vertex, a sheet point that stays, the direction.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SwivelOp {
    pub vertex: Point,
    pub toward: [Point; 3],
    pub emergent: Point,
    pub seed: SeedInput,
    pub stayer: Point,
    pub direction: Direction,
}

/// A vertex op resolved in its parent: the engine's op, and the choice the
/// step stores.
#[derive(Debug, Clone)]
pub struct VertexFold {
    pub op: EngineOp,
    pub choices: VertexChoices,
}

/// The engine's vertex op.
#[derive(Debug, Clone)]
pub enum EngineOp {
    Squash(Squash),
    Petal(PetalFold),
    RabbitEar(RabbitEar),
    Swivel(Swivel),
}

/// Resolve a vertex op's anchors in `parent`. Only the vertex ops reach
/// here (`resolve::resolve`).
pub fn resolve(parent: &State, op: &Op, choices: &Choices) -> Result<VertexFold, Rejection> {
    let image = |name: &str, p: Point| -> Result<Point, Rejection> {
        finite_point(name, p)?;
        parent.resolve_point(p).ok_or(Rejection::Refused(
            oristudio_fold::LineRefusal::PointOffPaper { point: p }.into(),
        ))
    };
    let direction = |name: &str, d: Point| -> Result<Point, BridgeError> {
        finite_point(name, d)?;
        if d[0].hypot(d[1]) > 0.0 {
            Ok(d)
        } else {
            Err(BridgeError::InvalidInput(format!(
                "{name} has no direction"
            )))
        }
    };
    let op = match op {
        Op::Squash(op) => {
            finite_point("flap", op.flap)?;
            EngineOp::Squash(Squash {
                flap: op.flap,
                target: op.target.map(|t| direction("target", t)).transpose()?,
                direction: op.direction,
            })
        }
        Op::Petal(op) => {
            finite_point("crease", op.crease)?;
            finite_point("petal", op.petal)?;
            let line = parent
                .crease_at(op.crease)
                .and_then(|c| parent.crease_line(c.id))
                .ok_or(BridgeRefusal::CreaseNotFound { point: op.crease })?;
            EngineOp::Petal(PetalFold {
                line,
                petal: op.petal,
                direction: op.direction,
            })
        }
        Op::RabbitEar(op) => {
            finite_point("stayer", op.stayer)?;
            let [a, b, c] = op.corners;
            EngineOp::RabbitEar(RabbitEar {
                corners: [
                    image("corners", a)?,
                    image("corners", b)?,
                    image("corners", c)?,
                ],
                emergent: direction("emergent", op.emergent)?,
                layers: seed(&op.seed)?,
                stayer: op.stayer,
                direction: op.direction,
                ridge: op.ridge.map(|r| direction("ridge", r)).transpose()?,
            })
        }
        Op::Swivel(op) => {
            finite_point("stayer", op.stayer)?;
            let [a, b, c] = op.toward;
            EngineOp::Swivel(Swivel {
                vertex: image("vertex", op.vertex)?,
                toward: [
                    image("toward", a)?,
                    image("toward", b)?,
                    image("toward", c)?,
                ],
                emergent: direction("emergent", op.emergent)?,
                layers: seed(&op.seed)?,
                stayer: op.stayer,
                direction: op.direction,
            })
        }
        other => {
            return Err(BridgeError::InvalidInput(format!(
                "a {} step is no vertex fold",
                other.kind()
            ))
            .into());
        }
    };
    Ok(VertexFold {
        op,
        choices: VertexChoices {
            completion: choices.completion().cloned(),
        },
    })
}

fn seed(seed: &SeedInput) -> Result<oristudio_fold::Seed, BridgeError> {
    match seed {
        SeedInput::All => {}
        SeedInput::Depth { at, .. } => finite_point("seed.at", *at)?,
        SeedInput::Flaps { at } => {
            for p in at {
                finite_point("seed.at", *p)?;
            }
        }
    }
    Ok(seed.seed())
}

/// The fold, as the engine lands it.
fn fold(parent: &State, fold: &VertexFold) -> Result<VertexOutcome, CompoundRefused> {
    let choices = &fold.choices;
    match &fold.op {
        EngineOp::Squash(op) => parent.squash(op, choices),
        EngineOp::Petal(op) => parent.petal_fold(op, choices),
        EngineOp::RabbitEar(op) => parent.rabbit_ear(op, choices),
        EngineOp::Swivel(op) => parent.swivel(op, choices),
    }
}

/// Land a stored step (replay): the one state its op and choice name, or a
/// refusal — the compound folds' `choice_needed` and `choice_broken` among
/// them (`crate::compound`).
pub fn land(parent: &State, vertex: &VertexFold) -> Result<VertexFolded, Refusal> {
    match fold(parent, vertex) {
        Ok(VertexOutcome::Landed(folded)) => Ok(*folded),
        Ok(VertexOutcome::ChooseOrder(_)) => Err(choice_needed(NeededChoice::Completion)),
        Err(refused) => Err(compound_refusal(refused)),
    }
}

// ---------------------------------------------------------------------------
// Outputs

/// A vertex op before it folds, by kind.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum VertexAnalysis {
    Squash(SquashAnalysis),
    Petal(PetalAnalysis),
    RabbitEar(FanAnalysis),
    Swivel(FanAnalysis),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Analysed {
    pub analysis: VertexAnalysis,
}

/// What `vertex_fold` came to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum VertexTried {
    /// One order: the step, held as `apply` holds it.
    Landed(Box<Applied>),
    /// More than one: a choice held under `pending`.
    Choose(Choose),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Choose {
    pub pending: u32,
    /// The true ‹ n of m ›.
    pub count: ChoiceCount,
    /// How many orders each independent component lists: a pick names one
    /// of each.
    pub components: Vec<usize>,
}

// ---------------------------------------------------------------------------
// Pending choices

/// Every choice of orders the caller still holds. Handles start at 1 and are
/// never reused while this store lives.
#[derive(Debug, Default)]
pub struct Pending {
    held: HashMap<u32, (u32, VertexChoice)>,
    last: u32,
}

impl Pending {
    pub fn new() -> Pending {
        Pending::default()
    }

    pub fn clear(&mut self) {
        self.held.clear();
    }

    /// Fold `op` on the held state `state`.
    pub fn try_fold(
        &mut self,
        bridge: &mut Bridge,
        state: u32,
        op: &Op,
        choices: &Choices,
    ) -> Result<Outcome<VertexTried>, BridgeError> {
        let parent = bridge.state(state)?;
        let resolved = match crate::resolve::resolve(parent, op, choices) {
            Ok(crate::resolve::Resolved::Vertex(resolved)) => resolved,
            Ok(_) => {
                return Err(BridgeError::InvalidInput(format!(
                    "a {} step is no vertex fold",
                    op.kind()
                )));
            }
            Err(Rejection::Input(error)) => return Err(error),
            Err(Rejection::Refused(refusal)) => return Ok(Outcome::Refused(refusal)),
        };
        Ok(match fold(parent, &resolved) {
            Ok(VertexOutcome::Landed(folded)) => Outcome::Ok(VertexTried::Landed(Box::new(
                bridge.hold_vertex(*folded, state),
            ))),
            Ok(VertexOutcome::ChooseOrder(choice)) => {
                let count = choice.count();
                let components = choice
                    .completions()
                    .components()
                    .iter()
                    .map(|c| c.orders.len())
                    .collect();
                Outcome::Ok(VertexTried::Choose(Choose {
                    pending: self.hold(state, *choice),
                    count,
                    components,
                }))
            }
            Err(refused) => Outcome::Refused(compound_refusal(refused)),
        })
    }

    /// Land the order `choice` names from the held choice `pending`.
    pub fn pick(
        &mut self,
        bridge: &mut Bridge,
        pending: u32,
        choice: &[usize],
    ) -> Result<Outcome<Applied>, BridgeError> {
        let (parent, held) = self
            .held
            .get(&pending)
            .ok_or_else(|| BridgeError::InvalidInput(format!("no pending choice {pending}")))?;
        Ok(match held.pick(choice) {
            Ok(folded) => Outcome::Ok(bridge.hold_vertex(folded, *parent)),
            Err(refusal) => Outcome::Refused(refusal.into()),
        })
    }

    /// Let a pending choice go; whether it was held.
    pub fn release(&mut self, pending: u32) -> bool {
        self.held.remove(&pending).is_some()
    }

    fn hold(&mut self, parent: u32, choice: VertexChoice) -> u32 {
        loop {
            self.last = self.last.wrapping_add(1);
            if self.last != 0 && !self.held.contains_key(&self.last) {
                break;
            }
        }
        self.held.insert(self.last, (parent, choice));
        self.last
    }
}

/// A vertex op's analysis on the held state `state`.
pub fn analysis(bridge: &Bridge, state: u32, op: &Op) -> Result<Outcome<Analysed>, BridgeError> {
    let parent = bridge.state(state)?;
    let resolved = match resolve(parent, op, &Choices::default()) {
        Ok(resolved) => resolved,
        Err(Rejection::Input(error)) => return Err(error),
        Err(Rejection::Refused(refusal)) => return Ok(Outcome::Refused(refusal)),
    };
    let analysis = match &resolved.op {
        EngineOp::Squash(op) => parent.analyse_squash(op).map(VertexAnalysis::Squash),
        EngineOp::Petal(op) => parent.analyse_petal(op).map(VertexAnalysis::Petal),
        EngineOp::RabbitEar(op) => parent.analyse_rabbit_ear(op).map(VertexAnalysis::RabbitEar),
        EngineOp::Swivel(op) => parent.analyse_swivel(op).map(VertexAnalysis::Swivel),
    };
    Ok(analysis
        .map(|analysis| Analysed { analysis })
        .map_err(Refusal::from)
        .into())
}

// ---------------------------------------------------------------------------
// On `FoldEngine`

#[wasm_bindgen]
impl FoldEngine {
    /// The flap, line or fan a vertex op names, before it folds.
    pub fn vertex_analysis(&self, state: u32, op: JsValue) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        to_js_value(&analysis(&self.inner, state, &op).map_err(bridge_error)?)
    }

    /// Fold a vertex op on `state`: landed, or a choice held under its own
    /// handle. `choices` may be `undefined` or `null`.
    pub fn vertex_fold(
        &mut self,
        state: u32,
        op: JsValue,
        choices: JsValue,
    ) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(
            &self
                .vertex
                .try_fold(&mut self.inner, state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }

    /// Land the order `choice` picks, one listed order per component.
    pub fn vertex_pick(&mut self, pending: u32, choice: &[u32]) -> Result<JsValue, JsValue> {
        let choice: Vec<usize> = choice.iter().map(|&k| k as usize).collect();
        to_js_value(
            &self
                .vertex
                .pick(&mut self.inner, pending, &choice)
                .map_err(bridge_error)?,
        )
    }

    /// Let pending choices go; how many were held.
    pub fn release_vertex_choices(&mut self, pending: &[u32]) -> u32 {
        let released = pending.iter().filter(|&&p| self.vertex.release(p)).count();
        u32::try_from(released).unwrap_or(u32::MAX)
    }
}
