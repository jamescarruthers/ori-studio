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
//! **Replay** (`FoldEngine::apply`, through the compound seam,
//! [`crate::compound`]): a stored step lands, or is refused — the engine's
//! refusal, a stored choice that no longer resolves (`choice_broken`), or a
//! completion that leaves a choice the step does not store
//! (`choice_needed`) — and the replay marks it broken. A landed one reports
//! as the step's `compound`, `{ family: 'vertex', kind, … }`; its summary is
//! the diff from its parent, and it folds along no one line to picture.
//!
//! **The tools** ask the compound question, as the reverse fold's do: what
//! the op names (its flap, line or fan), the orders it leaves, each the
//! `completion` that picks it, and a rabbit ear's two ridge options, each
//! with its own orders. A tool then previews and commits the step with its
//! choices through `step`, like any other. The calls below are the family's
//! own besides ([`Pending`]): a fold that leaves a choice is held under its
//! own handle, like an opened import, and each pick lands one order as a
//! held state with the choices the step stores.
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineSquashWire.ts` holds these shapes.
//! class FoldEngine {
//!   /** For a vertex op, `{ family: 'vertex', analysis, orders, ridges }`:
//!    *  the flap, line or fan it names, before it folds, and the choices it
//!    *  leaves. */
//!   compound_analysis(state: number, op: FoldVertexOp, choices?: FoldChoices):
//!     Outcome<FoldCompoundAnalysis>;
//!   /** Fold it: landed (a held state, as `apply` returns it) or a choice
//!    *  of orders held under `pending`. `choices` may be undefined. */
//!   vertex_fold(state: number, op: FoldVertexOp, choices?: FoldChoices): Outcome<VertexTried>;
//!   /** Land one listed order per component; its `compound.stored` is what
//!    *  the step stores. */
//!   vertex_pick(pending: number, choice: Uint32Array): Outcome<Applied>;
//!   /** Let pending choices go; how many were held. */
//!   release_vertex_choices(pending: Uint32Array): number;
//! }
//! ```

use std::collections::HashMap;

use oristudio_fold::{
    ChoiceCount, CompoundRefused, Direction, FanAnalysis, FoldRefusal, PetalAnalysis, PetalFold,
    RabbitEar, Refused, Squash, SquashAnalysis, State, StepSummary, Swivel, VertexChoice,
    VertexChoices, VertexFolded, VertexOutcome, WitnessOrder,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::{Bridge, settle};
use crate::compound::{
    CompoundAsked, CompoundLanded, CompoundOp, CompoundStepReport, Parent, compound_refusal, landed,
};
use crate::ops_reverse::MAX_ORDERS;
use crate::resolve::{Rejection, check_choices, finite_point};
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

/// Resolve a vertex op's anchors in `parent`; any other op is the caller's
/// mistake. Its choices are checked before (`resolve::check_choices`).
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

/// The flap, petal or fan an op names, before it folds.
fn analyse(parent: &State, op: &EngineOp) -> Result<VertexAnalysis, Refused> {
    match op {
        EngineOp::Squash(op) => parent.analyse_squash(op).map(VertexAnalysis::Squash),
        EngineOp::Petal(op) => parent.analyse_petal(op).map(VertexAnalysis::Petal),
        EngineOp::RabbitEar(op) => parent.analyse_rabbit_ear(op).map(VertexAnalysis::RabbitEar),
        EngineOp::Swivel(op) => parent.analyse_swivel(op).map(VertexAnalysis::Swivel),
    }
}

/// The orders a fold leaves to choose from, when it leaves several: the
/// first [`MAX_ORDERS`], each as the completion that picks it. None when it
/// lands with one, or is refused (the preview says why).
fn listed(outcome: Result<VertexOutcome, CompoundRefused>) -> Option<VertexOrders> {
    let Ok(VertexOutcome::ChooseOrder(choice)) = outcome else {
        return None;
    };
    let (picks, more) = choice.choices(MAX_ORDERS);
    Some(VertexOrders {
        count: choice.count(),
        orders: picks
            .iter()
            .filter_map(|pick| choice.pick(pick).ok()?.report.stored.completion)
            .collect(),
        more,
    })
}

/// A rabbit ear's ridge options (research §5.3): of its four rays — the
/// three to the corners and the emergent one the analysis names — the two
/// the engine takes as a ridge, the far wedge's, each with whether it lands
/// and the orders it leaves. Asked of the engine ray by ray, so the far
/// wedge is the engine's own (the paper joined to the stayer decides it),
/// never worked out a second way.
fn ridges(parent: &State, ear: &RabbitEar, analysis: &VertexAnalysis) -> Vec<VertexRidge> {
    let VertexAnalysis::RabbitEar(fan) = analysis else {
        return Vec::new();
    };
    let Some(&emergent) = fan.emergent.and_then(|k| fan.candidates.get(k)) else {
        return Vec::new();
    };
    let rays = fan
        .given
        .iter()
        .enumerate()
        .map(|(k, &ray)| (Some(k), ray))
        .chain([(None, emergent)]);
    rays.filter_map(|(given, direction)| {
        let ridged = RabbitEar {
            ridge: Some(direction),
            ..ear.clone()
        };
        match parent.rabbit_ear(&ridged, &VertexChoices::default()) {
            Err(CompoundRefused::Refused(refused))
                if matches!(refused.refusal, FoldRefusal::FanRidgeNotRay) =>
            {
                None
            }
            outcome => Some(VertexRidge {
                direction,
                given,
                lands: outcome.is_ok(),
                orders: listed(outcome),
            }),
        }
    })
    .collect()
}

/// Per emergent candidate of a rabbit ear or a swivel, whether the fold
/// lands with it, its other inputs as asked (as a reverse fold's question
/// says which kinds land): what a tool takes first, and marks the others by.
/// A rabbit ear is asked without its ridge, which only decides between
/// orders. Empty for the other folds.
fn emergents(parent: &State, op: &EngineOp, analysis: &VertexAnalysis) -> Vec<bool> {
    let none = VertexChoices::default();
    match (op, analysis) {
        (EngineOp::RabbitEar(ear), VertexAnalysis::RabbitEar(fan)) => fan
            .candidates
            .iter()
            .map(|&emergent| {
                let each = RabbitEar {
                    emergent,
                    ridge: None,
                    ..ear.clone()
                };
                parent.rabbit_ear(&each, &none).is_ok()
            })
            .collect(),
        (EngineOp::Swivel(swivel), VertexAnalysis::Swivel(fan)) => fan
            .candidates
            .iter()
            .map(|&emergent| {
                let each = Swivel {
                    emergent,
                    ..swivel.clone()
                };
                parent.swivel(&each, &none).is_ok()
            })
            .collect(),
        _ => Vec::new(),
    }
}

impl CompoundOp for VertexFold {
    /// The flap, petal or fan it names, before it folds, and what a tool
    /// chooses among (as a reverse fold's question lists its kinds and
    /// orders): which of a fan's emergent candidates land; the orders it
    /// leaves, whichever completion is stored, so a chooser can move between
    /// them; and, for a rabbit ear asked without its ridge, the two rays
    /// that can be its ridge. The ridges are asked only of a fold that gets
    /// as far as its completion: a refusal is the preview's to say.
    fn ask(&self, parent: &State) -> Result<Result<CompoundAsked, Refusal>, BridgeError> {
        let analysis = match analyse(parent, &self.op) {
            Ok(analysis) => analysis,
            Err(refused) => return Ok(Err(refused.into())),
        };
        let unstored = VertexFold {
            op: self.op.clone(),
            choices: VertexChoices::default(),
        };
        let outcome = fold(parent, &unstored);
        let ridges = match (&self.op, &outcome) {
            (EngineOp::RabbitEar(ear), Ok(_)) if ear.ridge.is_none() => {
                ridges(parent, ear, &analysis)
            }
            _ => Vec::new(),
        };
        Ok(Ok(CompoundAsked::Vertex(Box::new(VertexAnalysed {
            emergents: emergents(parent, &self.op, &analysis),
            analysis,
            orders: listed(outcome),
            ridges,
        }))))
    }

    /// The one state its op and stored choice name (replay), or a refusal
    /// through the seam's one path.
    fn apply(&self, parent: &State) -> Result<Box<dyn CompoundLanded>, Refusal> {
        Ok(Box::new(Landed(landed(fold(parent, self))?)))
    }
}

/// A landed vertex fold, held by the bridge: its summary is the diff from
/// its parent; it folds along no one line to picture.
#[derive(Debug)]
struct Landed(Box<VertexFolded>);

impl CompoundLanded for Landed {
    fn state(&self) -> &State {
        &self.0.state
    }

    fn report(&self) -> CompoundStepReport {
        CompoundStepReport::Vertex(Box::new(self.0.report.clone()))
    }

    fn summary(&self, parent: Parent<'_>) -> Result<Result<StepSummary, Refusal>, BridgeError> {
        Ok(Ok(StepSummary::new(parent?, &self.0.state, None)))
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

/// What `compound_analysis` answers for a vertex op.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VertexAnalysed {
    pub analysis: VertexAnalysis,
    /// A rabbit ear's or a swivel's: per emergent candidate (the analysis'
    /// `candidates`), whether the fold lands with it, a rabbit ear's without
    /// its ridge. Empty for the other folds.
    pub emergents: Vec<bool>,
    /// The orders the op leaves as asked, its stored completion aside, when
    /// it leaves more than one; null when it lands with one, or is refused.
    /// A rabbit ear asked without its ridge leaves the two its ridge
    /// decides: its `ridges` list each one's own.
    pub orders: Option<VertexOrders>,
    /// A rabbit ear asked without its ridge, that gets as far as its
    /// completion: the two rays that can be its ridge. Empty otherwise.
    pub ridges: Vec<VertexRidge>,
}

/// The orders a vertex fold leaves (as a reverse fold's question lists
/// them, `ops_reverse::ReverseOrders`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VertexOrders {
    /// The true ‹ n of m ›.
    pub count: ChoiceCount,
    /// The first [`MAX_ORDERS`], each the `completion` that picks it.
    pub orders: Vec<WitnessOrder>,
    /// More are listed than `orders` holds.
    pub more: bool,
}

/// One of a rabbit ear's two ridge options: a ray of its far wedge.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VertexRidge {
    /// The ray, a direction from the incenter in the parent's model frame:
    /// what the step stores as its `ridge`.
    pub direction: Point,
    /// Which corner's ray it is, in the op's corner order; null for the
    /// emergent ray.
    pub given: Option<usize>,
    /// Whether the ear lands with it.
    pub lands: bool,
    /// The orders it leaves when more than one: what the step stores as its
    /// `completion` beside the ridge.
    pub orders: Option<VertexOrders>,
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
        // The choices first, as `apply` checks them; then the anchors, which
        // only a vertex op has.
        let resolved =
            check_choices(op.takes(), choices).and_then(|()| resolve(parent, op, choices));
        let resolved = match settle(resolved)? {
            Ok(resolved) => resolved,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        Ok(match fold(parent, &resolved) {
            Ok(VertexOutcome::Landed(folded)) => Outcome::Ok(VertexTried::Landed(Box::new(
                bridge.hold_compound(Box::new(Landed(folded)), state),
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
            Ok(folded) => {
                Outcome::Ok(bridge.hold_compound(Box::new(Landed(Box::new(folded))), *parent))
            }
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

// ---------------------------------------------------------------------------
// On `FoldEngine`

#[wasm_bindgen]
impl FoldEngine {
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
