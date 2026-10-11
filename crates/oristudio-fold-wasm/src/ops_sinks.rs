//! Sinks on the bridge (plan Phase 11, research §5.4): the document's
//! `open-sink`, `closed-sink` and `unsink` ops resolved in their parent and
//! landed, and the queries a sink tool asks before it commits one.
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineSinkWire.ts` holds these shapes.
//! class FoldEngine {
//!   /** For a sink op, `{ family: 'sink', analysis, open }`: the point it
//!    *  names and how it sinks — its outline, its outside's letter, its apex
//!    *  and the square line (the open sink's landmark), why an open sink is
//!    *  refused, and its pockets, each with what a step stores to choose
//!    *  it. Not asked of an unsink. */
//!   compound_analysis(state: number, op: FoldSinkOp, choices?: FoldChoices):
//!     Outcome<FoldCompoundAnalysis>;
//!   /** How many orders the sink leaves with these choices: one when it is
//!    *  decided, and nothing to choose. */
//!   sink_orders(state: number, op: FoldSinkOp, choices?: FoldChoices):
//!     Outcome<{ count: ChoiceCount; components: ComponentCount[] }>;
//!   /** The completion a step stores for one listed order per component;
//!    *  null when the sink is decided. */
//!   sink_pick(state: number, op: FoldSinkOp, choices: FoldChoices | undefined,
//!     choice: Uint32Array): Outcome<{ completion: WitnessOrder | null }>;
//! }
//! ```
//!
//! A sink lands through `apply`, like every step, so a commit lands exactly
//! as a replay will: its line resolves as a fold's (an axiom with its root,
//! a free line, an existing crease, or the tools' model line), `moving` or
//! the seed's point names the side the point's tip is on — for an unsink,
//! the side the sunk tip lies on — and the seed names the point (plan D6).
//! The stored pocket and completion are the engine's: a sheet point on the
//! faces either side of the pocket, and FOLD `faceOrders` triples over
//! witnesses. A sink that needs a choice the step does not store is refused
//! `choice_needed` (its `pocket` or its `completion`); one whose stored
//! choice no longer resolves, `choice_broken` — the compound folds' own, on
//! the seam's one path (`crate::compound`). Either marks a replayed step
//! broken. A landed one reports as the step's `compound`,
//! `{ family: 'sink', step, … }`, its motion's legs among it.

use oristudio_fold::{
    ActionKind, ChoiceCount, CompoundRefused, Direction, Side, SinkChoices, SinkFold, SinkFolded,
    SinkKind, SinkOutcome, SinkPoint, State, StepSummary, StoredPocket, Unsink, WitnessOrder,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::{Bridge, settle};
use crate::compound::{
    CompoundAsked, CompoundLanded, CompoundOp, CompoundStepReport, NeededChoice, Parent,
    choice_needed, compound_refusal, landed,
};
use crate::io::ComponentCount;
use crate::resolve::{Rejection, along_line, check_choices, finite_point};
use crate::wire::{
    AlongLine, BridgeError, Choices, LineInput, Motion, Op, Outcome, Point, Refusal, SeedInput,
};
use crate::{FoldEngine, bridge_error, parse, parse_choices, to_js_value};

/// A sink op (`FoldSinkOp`): the line, as a fold along one names it; the
/// side, by `moving` (or the tools' `side` of a model line) or the seed's
/// point; and the seed naming the point, or the sunk tip of an unsink.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct SinkOp {
    pub line: LineInput,
    #[serde(default)]
    pub moving: Option<Point>,
    #[serde(default)]
    pub side: Option<Side>,
    pub seed: SeedInput,
}

/// A sink op resolved in its parent: the engine's sink or unsink, with its
/// stored choices.
#[derive(Debug, Clone)]
pub enum SinkResolved {
    Sink { op: SinkFold, choices: SinkChoices },
    Unsink { op: Unsink, choices: SinkChoices },
}

impl SinkResolved {
    fn outcome(&self, parent: &State) -> Result<SinkOutcome, CompoundRefused> {
        match self {
            SinkResolved::Sink { op, choices } => parent.sink(op, choices),
            SinkResolved::Unsink { op, choices } => parent.unsink(op, choices),
        }
    }
}

/// What a sink tool previews (`compound_analysis`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SinkAnalysed {
    pub analysis: SinkPoint,
    /// Why an open sink of this point is refused, with its fixes; none when
    /// one may land.
    pub open: Option<Refusal>,
}

/// How many orders a sink leaves (`sink_orders`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SinkOrders {
    pub count: ChoiceCount,
    pub components: Vec<ComponentCount>,
}

/// What a step stores for a pick (`sink_pick`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SinkPicked {
    pub completion: Option<WitnessOrder>,
}

/// A sink op and its choices, resolved in `parent`: the line as a fold's,
/// and the choices a sink takes — a closed sink's pocket, any sink's
/// completion, an axiom line's root — which are checked before
/// (`resolve::check_choices`, by `wire::Op::takes`).
pub fn resolve(
    parent: &State,
    op: &Op,
    sink: &SinkOp,
    choices: &Choices,
) -> Result<SinkResolved, Rejection> {
    let closed = matches!(op, Op::ClosedSink(_));
    let along = AlongLine {
        line: sink.line.clone(),
        direction: None,
        motion: Motion {
            moving: sink.moving,
            side: sink.side,
            seed: sink.seed.clone(),
            placement: Default::default(),
            closure: Default::default(),
        },
    };
    // The direction is no part of a sink: any one resolves the line.
    let resolved = along_line(
        parent,
        &along,
        Direction::Valley,
        ActionKind::Fold,
        choices.root.as_ref(),
    )?;
    let fold = match resolved.plain(parent) {
        Some(Ok(fold)) => fold,
        Some(Err(refusal)) => return Err(refusal.into()),
        None => {
            return Err(BridgeError::InvalidInput(
                "a sink's line resolves to no fold line".to_string(),
            )
            .into());
        }
    };
    let pocket = match choices.pocket {
        Some([above, below]) => {
            finite_point("pocket", above)?;
            finite_point("pocket", below)?;
            Some(StoredPocket { above, below })
        }
        None => None,
    };
    let choices = SinkChoices {
        pocket,
        order: choices
            .completion
            .clone()
            .filter(|order| !order.orders.is_empty()),
    };
    Ok(match op {
        Op::Unsink(_) => SinkResolved::Unsink {
            op: Unsink {
                line: fold.line,
                side: fold.side,
                anchor: fold.seed,
            },
            choices,
        },
        _ => SinkResolved::Sink {
            op: SinkFold {
                line: fold.line,
                side: fold.side,
                anchor: fold.seed,
                kind: if closed {
                    SinkKind::Closed
                } else {
                    SinkKind::Open
                },
            },
            choices,
        },
    })
}

impl CompoundOp for SinkResolved {
    /// What a sink tool previews: the point and how it sinks. An unsink has
    /// no point to analyse, and is the caller's mistake.
    fn ask(&self, parent: &State) -> Result<Result<CompoundAsked, Refusal>, BridgeError> {
        let SinkResolved::Sink { op, .. } = self else {
            return Err(BridgeError::InvalidInput(
                "an unsink has no point to analyse: it unsinks the tip its seed names".to_string(),
            ));
        };
        Ok(parent
            .analyse_sink(op)
            .map(|analysis| {
                CompoundAsked::Sink(Box::new(SinkAnalysed {
                    open: analysis.open.clone().map(Refusal::from),
                    analysis,
                }))
            })
            .map_err(Refusal::from))
    }

    /// Land it: refused when it needs a choice the step does not store, or
    /// a stored one no longer resolves.
    fn apply(&self, parent: &State) -> Result<Box<dyn CompoundLanded>, Refusal> {
        Ok(Box::new(Landed(landed(self.outcome(parent))?)))
    }
}

/// A landed sink or unsink, held by the bridge: its summary counts the
/// layers along ℓ on the side the paper moved from; its push arrow is still
/// to come.
#[derive(Debug)]
struct Landed(Box<SinkFolded>);

impl CompoundLanded for Landed {
    fn state(&self) -> &State {
        &self.0.state
    }

    fn report(&self) -> CompoundStepReport {
        CompoundStepReport::Sink(Box::new(self.0.report.clone()))
    }

    fn summary(&self, parent: Parent<'_>) -> Result<Result<StepSummary, Refusal>, BridgeError> {
        Ok(self.0.summary(parent?).map_err(Refusal::from))
    }
}

/// How many orders a sink leaves with these choices: one when it is
/// decided.
pub fn sink_orders(
    bridge: &Bridge,
    state: u32,
    op: &Op,
    choices: &Choices,
) -> Result<Outcome<SinkOrders>, BridgeError> {
    let (parent, sink) = match sink_of(bridge, state, op, choices)? {
        Ok(found) => found,
        Err(refusal) => return Ok(Outcome::Refused(refusal)),
    };
    Ok(match sink.outcome(parent) {
        Ok(SinkOutcome::Landed(_)) => Outcome::Ok(SinkOrders {
            count: ChoiceCount {
                orders: 1,
                exact: true,
            },
            components: Vec::new(),
        }),
        Ok(SinkOutcome::ChooseOrder(choice)) => Outcome::Ok(SinkOrders {
            count: choice.count(),
            components: choice
                .completions()
                .components()
                .iter()
                .map(|c| ComponentCount {
                    orders: c.orders.len(),
                    truncated: c.truncated,
                })
                .collect(),
        }),
        Ok(SinkOutcome::ChoosePocket(_)) => Outcome::Refused(choice_needed(NeededChoice::Pocket)),
        Err(refused) => Outcome::Refused(compound_refusal(refused)),
    })
}

/// The completion a step stores for `choice`, one listed order per
/// component; none when the sink is decided.
pub fn sink_pick(
    bridge: &Bridge,
    state: u32,
    op: &Op,
    choices: &Choices,
    choice: &[usize],
) -> Result<Outcome<SinkPicked>, BridgeError> {
    let (parent, sink) = match sink_of(bridge, state, op, choices)? {
        Ok(found) => found,
        Err(refusal) => return Ok(Outcome::Refused(refusal)),
    };
    Ok(match sink.outcome(parent) {
        Ok(SinkOutcome::Landed(_)) => Outcome::Ok(SinkPicked { completion: None }),
        Ok(SinkOutcome::ChooseOrder(pending)) => match pending.pick(choice) {
            Ok(folded) => Outcome::Ok(SinkPicked {
                completion: folded.report.stored.order,
            }),
            Err(refusal) => Outcome::Refused(refusal.into()),
        },
        Ok(SinkOutcome::ChoosePocket(_)) => Outcome::Refused(choice_needed(NeededChoice::Pocket)),
        Err(refused) => Outcome::Refused(compound_refusal(refused)),
    })
}

/// The held state and the sink op resolved in it, its choices checked as
/// `apply` checks them; a refusal when it does not resolve. Any other op is
/// the caller's mistake.
fn sink_of<'b>(
    bridge: &'b Bridge,
    state: u32,
    op: &Op,
    choices: &Choices,
) -> Result<Result<(&'b State, SinkResolved), Refusal>, BridgeError> {
    let parent = bridge.state(state)?;
    let (Op::OpenSink(sink) | Op::ClosedSink(sink) | Op::Unsink(sink)) = op else {
        return Err(BridgeError::InvalidInput(format!(
            "a {} step is no sink: give an open-sink, closed-sink or unsink op",
            op.kind()
        )));
    };
    let resolved =
        check_choices(op.takes(), choices).and_then(|()| resolve(parent, op, sink, choices));
    Ok(settle(resolved)?.map(|sink| (parent, sink)))
}

#[wasm_bindgen]
impl FoldEngine {
    /// How many orders a sink leaves with these choices.
    pub fn sink_orders(
        &self,
        state: u32,
        op: JsValue,
        choices: JsValue,
    ) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(&sink_orders(&self.inner, state, &op, &choices).map_err(bridge_error)?)
    }

    /// The completion a step stores for one listed order per component.
    pub fn sink_pick(
        &self,
        state: u32,
        op: JsValue,
        choices: JsValue,
        choice: &[u32],
    ) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        let choices = parse_choices(choices)?;
        let choice: Vec<usize> = choice.iter().map(|&k| k as usize).collect();
        to_js_value(&sink_pick(&self.inner, state, &op, &choices, &choice).map_err(bridge_error)?)
    }
}
