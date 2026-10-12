//! The vertex folds — squash, petal fold, rabbit ear, swivel (plan Phase 11)
//! — on the bridge.
//!
//! **Ops** are the Fold document's own shapes (`FoldSquashOp`,
//! `FoldPetalOp`, `FoldRabbitEarOp`, `FoldSwivelOp` in
//! `apps/web/src/fold/document/foldSequenceDocument.ts`). What names paper is
//! a sheet point, resolved here in the parent (plan D6): the flap and the
//! petal on their layers, a point on H's precrease, the triangle's corners,
//! the swivel's vertex and the points its rays run toward, the stayer. What
//! the step chose is a result: the spine's target and the emergent ray are
//! directions in the parent's model frame, and replay takes the nearest (an
//! axiom's root is replayed the same way). A step's `choices.completion` is
//! the engine's `VertexChoices` as it is. A rabbit ear's fourth crease rises
//! as its ridge, so it has none to choose: an older step's `ridge` is an
//! unknown field, ignored.
//!
//! A swivel takes either form ([`SwivelOp`]): by its rays, or by its edge
//! (`via: 'edge'`: the pivot, a sheet point on the edge, the target line as
//! a crease's point or two points, the layers, the direction, and the ridge
//! when it is not the foot's — a direction, the nearer far ray taken, the
//! choice stored as its result). `compound_analysis` answers the edge form
//! with `kind: 'swivel-by-edge'` (the engine's `SwivelEdgeAnalysis`: vertex,
//! creases with their letters as seen, landing, ridges, moving regions) and
//! per ridge in `emergents`; a refusal's `use_emergent` fix names the other
//! ridge, to store as `ridge`.
//!
//! **Replay** (`FoldEngine::apply`, through the compound seam,
//! [`crate::compound`]): a stored step lands, or is refused — the engine's
//! refusal, a stored choice that no longer resolves (`choice_broken`), or a
//! completion that leaves a choice the step does not store
//! (`choice_needed`) — and the replay marks it broken. A landed one reports
//! as the step's `compound`, `{ family: 'vertex', kind, … }`; its summary is
//! the diff from its parent.
//!
//! **The picture** (`FoldEngine::action` before it lands, `step_action` once
//! it has) is the engine's along the one crease that tells the fold best
//! (`compound::vertex`): a squash's lower crease with its arrow and the push
//! onto its spine, a petal fold's H, a fan's crease from its center. A
//! vertex fold folds along no one line, so it answers none of a plain fold's
//! other queries (what moves, its depth choices).
//!
//! **The tools** ask the compound question, as the reverse fold's do: what
//! the op names (its flap, line or fan), which of a fan's fourth rays land,
//! and the orders it leaves, each the `completion` that picks it. A tool
//! then previews and commits the step with its choices through `step`, like
//! any other. The calls below are the family's
//! own besides ([`Pending`]): a fold that leaves a choice is held under its
//! own handle, like an opened import, and each pick lands one order as a
//! held state with the choices the step stores.
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineSquashWire.ts` holds these shapes.
//! class FoldEngine {
//!   /** For a vertex op, `{ family: 'vertex', analysis, emergents, orders }`:
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

use oristudio_fold::numerics::MIN_FEATURE;
use oristudio_fold::{
    ChoiceCount, CompoundRefused, Direction, FanAnalysis, FoldActionGeometry, LineRefusal,
    PetalAnalysis, PetalFold, RabbitEar, Refused, Squash, SquashAnalysis, State, StepSummary,
    Swivel, SwivelByEdge, SwivelEdgeAnalysis, VertexChoice, VertexChoices, VertexFolded,
    VertexOutcome, WitnessOrder,
};
use oristudio_geometry::Line;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::{Bridge, settle};
use crate::compound::{
    CompoundAsked, CompoundLanded, CompoundOp, CompoundStepReport, Parent, compound_refusal, landed,
};
use crate::ops_reverse::MAX_ORDERS;
use crate::resolve::{Rejection, check_choices, finite_point};
use crate::wire::{
    Applied, BridgeError, BridgeRefusal, Choices, LineInput, Op, Outcome, Point, Refusal, SeedInput,
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
/// ray as a model-frame direction from the incenter, the layers at the
/// incenter (`seed`), a sheet point that stays, the direction. An older
/// step's `ridge` is not read.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct RabbitEarOp {
    pub corners: [Point; 3],
    pub emergent: Point,
    pub seed: SeedInput,
    pub stayer: Point,
    pub direction: Direction,
}

/// A swivel op in either of the document's forms: by its rays
/// (`FoldSwivelOp`, no `via`) or by its edge (`FoldSwivelEdgeOp`,
/// `via: 'edge'`). Any other `via` is the caller's mistake.
#[derive(Debug, Clone, PartialEq)]
pub enum SwivelOp {
    Rays(SwivelRaysOp),
    Edge(SwivelEdgeOp),
}

impl<'de> Deserialize<'de> for SwivelOp {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<SwivelOp, D::Error> {
        use serde::de::Error;
        let value = serde_json::Value::deserialize(deserializer)?;
        match value.get("via") {
            None => serde_json::from_value(value)
                .map(SwivelOp::Rays)
                .map_err(D::Error::custom),
            Some(via) if via == "edge" => serde_json::from_value(value)
                .map(SwivelOp::Edge)
                .map_err(D::Error::custom),
            Some(via) => Err(D::Error::custom(format!(
                "a swivel's `via` is 'edge' or absent, got {via}"
            ))),
        }
    }
}

/// `FoldSwivelOp`: the vertex and the points its three given rays run
/// toward as sheet points, the emergent ray as a model-frame direction, the
/// layers at the vertex, a sheet point that stays, the direction.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SwivelRaysOp {
    pub vertex: Point,
    pub toward: [Point; 3],
    pub emergent: Point,
    pub seed: SeedInput,
    pub stayer: Point,
    pub direction: Direction,
}

/// `FoldSwivelEdgeOp`: swivel the edge through the sheet point `edge` (a raw
/// edge or a folded crease) onto `target`, pivoting at the sheet point
/// `pivot` (its image moved onto the nearer bisector of edge and target);
/// the layers at the vertex; the ridge, a model-frame direction, when it is
/// not the crease square to the edge; the direction. The target is a crease
/// or edge by a sheet point on it (`via: 'crease'`) or the line through two
/// sheet points' images (`via: 'free'`): an axiom's would need a root the
/// step does not store, and a model line is not one it can store.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SwivelEdgeOp {
    pub pivot: Point,
    pub edge: Point,
    pub target: LineInput,
    pub seed: SeedInput,
    #[serde(default)]
    pub ridge: Option<Point>,
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
    SwivelByEdge(SwivelByEdge),
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
            })
        }
        Op::Swivel(SwivelOp::Rays(op)) => {
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
        Op::Swivel(SwivelOp::Edge(op)) => {
            finite_point("edge", op.edge)?;
            EngineOp::SwivelByEdge(SwivelByEdge {
                pivot: image("pivot", op.pivot)?,
                edge: op.edge,
                target: swivel_target(parent, &op.target)?,
                layers: seed(&op.seed)?,
                ridge: op.ridge.map(|r| direction("ridge", r)).transpose()?,
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

/// A swivel's target in the parent's model frame: the line of the crease
/// or edge whose sheet segment holds a point, or the line through two sheet
/// points' images.
fn swivel_target(parent: &State, target: &LineInput) -> Result<Line, Rejection> {
    match target {
        LineInput::Crease { at } => {
            finite_point("target.at", *at)?;
            parent
                .crease_at(*at)
                .and_then(|c| parent.crease_line(c.id))
                .ok_or_else(|| BridgeRefusal::CreaseNotFound { point: *at }.into())
        }
        LineInput::Free { through: [a, b] } => {
            let image = |p: Point| -> Result<Point, Rejection> {
                finite_point("target.through", p)?;
                parent
                    .resolve_point(p)
                    .ok_or_else(|| LineRefusal::PointOffPaper { point: p }.into())
            };
            let (pa, pb) = (image(*a)?, image(*b)?);
            let distance = (pb[0] - pa[0]).hypot(pb[1] - pa[1]);
            if distance < MIN_FEATURE {
                return Err(LineRefusal::FreeLineTooShort {
                    a: *a,
                    b: *b,
                    distance,
                }
                .into());
            }
            Line::from_points(pa, pb).ok_or_else(|| {
                LineRefusal::FreeLineTooShort {
                    a: *a,
                    b: *b,
                    distance,
                }
                .into()
            })
        }
        LineInput::Axiom { .. } | LineInput::Model { .. } => Err(BridgeError::InvalidInput(
            "a swivel's target is a crease or edge (`via: 'crease'`) or a line through two \
             points (`via: 'free'`)"
                .to_string(),
        )
        .into()),
    }
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

/// The picture of `op` on `parent`, with `landed`'s cover at the arrow's
/// head once it has landed (the engine's `compound::vertex`).
fn picture(
    parent: &State,
    op: &EngineOp,
    landed: Option<&State>,
) -> Result<FoldActionGeometry, Refused> {
    match op {
        EngineOp::Squash(op) => parent.squash_action(op, landed),
        EngineOp::Petal(op) => parent.petal_action(op, landed),
        EngineOp::RabbitEar(op) => parent.rabbit_ear_action(op, landed),
        EngineOp::Swivel(op) => parent.swivel_action(op, landed),
        EngineOp::SwivelByEdge(op) => parent.swivel_by_edge_action(op, landed),
    }
}

/// The fold, as the engine lands it.
fn fold(parent: &State, fold: &VertexFold) -> Result<VertexOutcome, CompoundRefused> {
    let choices = &fold.choices;
    match &fold.op {
        EngineOp::Squash(op) => parent.squash(op, choices),
        EngineOp::Petal(op) => parent.petal_fold(op, choices),
        EngineOp::RabbitEar(op) => parent.rabbit_ear(op, choices),
        EngineOp::Swivel(op) => parent.swivel(op, choices),
        EngineOp::SwivelByEdge(op) => parent.swivel_by_edge(op, choices),
    }
}

/// The flap, petal or fan an op names, before it folds.
fn analyse(parent: &State, op: &EngineOp) -> Result<VertexAnalysis, Refused> {
    match op {
        EngineOp::Squash(op) => parent.analyse_squash(op).map(VertexAnalysis::Squash),
        EngineOp::Petal(op) => parent.analyse_petal(op).map(VertexAnalysis::Petal),
        EngineOp::RabbitEar(op) => parent.analyse_rabbit_ear(op).map(VertexAnalysis::RabbitEar),
        EngineOp::Swivel(op) => parent.analyse_swivel(op).map(VertexAnalysis::Swivel),
        EngineOp::SwivelByEdge(op) => parent
            .analyse_swivel_by_edge(op)
            .map(|a| VertexAnalysis::SwivelByEdge(Box::new(a))),
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

/// Per emergent candidate of a rabbit ear or a swivel, whether the fold
/// lands with it, its other inputs as asked (as a reverse fold's question
/// says which kinds land): what a tool takes first, and marks the others by.
/// Empty for the other folds.
fn emergents(parent: &State, op: &EngineOp, analysis: &VertexAnalysis) -> Vec<bool> {
    let none = VertexChoices::default();
    match (op, analysis) {
        (EngineOp::RabbitEar(ear), VertexAnalysis::RabbitEar(fan)) => fan
            .candidates
            .iter()
            .map(|&emergent| {
                let each = RabbitEar {
                    emergent,
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
        // A swivel by its edge's: per ridge it can take.
        (EngineOp::SwivelByEdge(swivel), VertexAnalysis::SwivelByEdge(analysis)) => analysis
            .ridges
            .iter()
            .map(|&ridge| {
                let each = SwivelByEdge {
                    ridge: Some(ridge),
                    ..swivel.clone()
                };
                parent.swivel_by_edge(&each, &none).is_ok()
            })
            .collect(),
        _ => Vec::new(),
    }
}

impl CompoundOp for VertexFold {
    /// Its picture along the crease that tells it best: no plain fold's
    /// analysis or depth pick, since it folds along no one line.
    fn action(&self, parent: &State) -> Option<Result<FoldActionGeometry, Refusal>> {
        Some(picture(parent, &self.op, None).map_err(Refusal::from))
    }

    /// The flap, petal or fan it names, before it folds, and what a tool
    /// chooses among (as a reverse fold's question lists its kinds and
    /// orders): which of a fan's emergent candidates land, and the orders it
    /// leaves, whichever completion is stored, so a chooser can move between
    /// them.
    fn ask(&self, parent: &State) -> Result<Result<CompoundAsked, Refusal>, BridgeError> {
        let analysis = match analyse(parent, &self.op) {
            Ok(analysis) => analysis,
            Err(refused) => return Ok(Err(refused.into())),
        };
        let unstored = VertexFold {
            op: self.op.clone(),
            choices: VertexChoices::default(),
        };
        Ok(Ok(CompoundAsked::Vertex(Box::new(VertexAnalysed {
            emergents: emergents(parent, &self.op, &analysis),
            analysis,
            orders: listed(fold(parent, &unstored)),
        }))))
    }

    /// The one state its op and stored choice name (replay), or a refusal
    /// through the seam's one path.
    fn apply(&self, parent: &State) -> Result<Box<dyn CompoundLanded>, Refusal> {
        Ok(Box::new(Landed {
            folded: landed(fold(parent, self))?,
            op: self.op.clone(),
        }))
    }
}

/// A landed vertex fold, held by the bridge with the op that landed it: its
/// summary is the diff from its parent, its picture drawn on its parent from
/// the op, with its own cover at the arrow's head.
#[derive(Debug)]
struct Landed {
    folded: Box<VertexFolded>,
    op: EngineOp,
}

impl CompoundLanded for Landed {
    fn state(&self) -> &State {
        &self.folded.state
    }

    fn report(&self) -> CompoundStepReport {
        CompoundStepReport::Vertex(Box::new(self.folded.report.clone()))
    }

    fn summary(&self, parent: Parent<'_>) -> Result<Result<StepSummary, Refusal>, BridgeError> {
        Ok(Ok(StepSummary::new(parent?, &self.folded.state, None)))
    }

    fn action(
        &self,
        parent: Parent<'_>,
    ) -> Result<Option<Result<FoldActionGeometry, Refusal>>, BridgeError> {
        Ok(Some(
            picture(parent?, &self.op, Some(&self.folded.state)).map_err(Refusal::from),
        ))
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
    /// A swivel by its edge (`via: 'edge'`): its vertex, creases with their
    /// letters, landing, ridges and moving paper.
    SwivelByEdge(Box<SwivelEdgeAnalysis>),
}

/// What `compound_analysis` answers for a vertex op.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VertexAnalysed {
    pub analysis: VertexAnalysis,
    /// A rabbit ear's or a swivel's: per emergent candidate (the analysis'
    /// `candidates`), whether the fold lands with it; a swivel by its
    /// edge's, per ridge (the analysis' `ridges`). Empty for the other
    /// folds.
    pub emergents: Vec<bool>,
    /// The orders the op leaves as asked, its stored completion aside, when
    /// it leaves more than one; null when it lands with one, or is refused.
    pub orders: Option<VertexOrders>,
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

/// Every choice of orders the caller still holds, each with its parent's
/// handle and the op it folds (which a landed pick is pictured by). Handles
/// start at 1 and are never reused while this store lives.
#[derive(Debug, Default)]
pub struct Pending {
    held: HashMap<u32, (u32, VertexChoice, EngineOp)>,
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
            Ok(VertexOutcome::Landed(folded)) => {
                let landed = Landed {
                    folded,
                    op: resolved.op,
                };
                Outcome::Ok(VertexTried::Landed(Box::new(
                    bridge.hold_compound(Box::new(landed), state),
                )))
            }
            Ok(VertexOutcome::ChooseOrder(choice)) => {
                let count = choice.count();
                let components = choice
                    .completions()
                    .components()
                    .iter()
                    .map(|c| c.orders.len())
                    .collect();
                Outcome::Ok(VertexTried::Choose(Choose {
                    pending: self.hold(state, *choice, resolved.op),
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
        let (parent, held, op) = self
            .held
            .get(&pending)
            .ok_or_else(|| BridgeError::InvalidInput(format!("no pending choice {pending}")))?;
        Ok(match held.pick(choice) {
            Ok(folded) => {
                let landed = Landed {
                    folded: Box::new(folded),
                    op: op.clone(),
                };
                Outcome::Ok(bridge.hold_compound(Box::new(landed), *parent))
            }
            Err(refusal) => Outcome::Refused(refusal.into()),
        })
    }

    /// Let a pending choice go; whether it was held.
    pub fn release(&mut self, pending: u32) -> bool {
        self.held.remove(&pending).is_some()
    }

    fn hold(&mut self, parent: u32, choice: VertexChoice, op: EngineOp) -> u32 {
        loop {
            self.last = self.last.wrapping_add(1);
            if self.last != 0 && !self.held.contains_key(&self.last) {
                break;
            }
        }
        self.held.insert(self.last, (parent, choice, op));
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
