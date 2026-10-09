//! The crimp and the tuck across the bridge (plan Phase 11): the document's
//! `crimp` and `tuck` ops resolved in their parent, their analyses, and their
//! landings, beside the calls in [`crate::bridge`].
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineCrimpTuckWire.ts` holds these shapes in full.
//! class FoldEngine {
//!   /** A crimp's tip at ℓ1 with its flaps' openings, what lies beyond ℓ2,
//!    *  and the kinds that land: null while a flap opening several ways is
//!    *  still to choose. */
//!   analyse_crimp(state: number, op: CrimpOp, choices?: FoldChoices):
//!     Outcome<{ analysis: CrimpAnalysis; kinds: ('inside' | 'outside')[] | null }>;
//!   /** What a tuck moves and every layer its block lands on, each with
//!    *  whether it takes the tuck: the targets a tool offers. */
//!   analyse_tuck(state: number, op: TuckOp, choices?: FoldChoices):
//!     Outcome<{ analysis: TuckAnalysis }>;
//!   /** Fold it: landed; an opening to choose; or the orders to choose
//!    *  from, each already landed under its own handle with what its step
//!    *  stores. Every landed state stays held until released. */
//!   crimp(state: number, op: CrimpOp, choices?: FoldChoices): Outcome<Compound<CrimpReport>>;
//!   tuck(state: number, op: TuckOp, choices?: FoldChoices): Outcome<Compound<TuckReport>>;
//! }
//! ```
//!
//! A stored crimp or tuck replays through `apply`, as every step does: it
//! lands only when its stored choices decide it, and is refused
//! `choice_needed` when they do not and `choice_broken` when they no longer
//! resolve, so the replay marks the step broken (plan D6). The ops' lines are
//! the document's anchors: a tuck's line may be an axiom with its stored
//! root; a crimp's first line may, and its second is named by two sheet
//! points or a crease, since a step stores one root.

use oristudio_fold::complete::Deadline;
use oristudio_fold::numerics::MIN_FEATURE;
use oristudio_fold::{
    ActionKind, CompletionLimits, CompoundRefused, CrimpAnalysis, CrimpFold, CrimpOutcome,
    CrimpReport, Direction, LineRefusal, PlainFold, ReverseChoices, ReverseKind, Side, State,
    StepSummary, StoredOpening, TuckAnalysis, TuckChoices, TuckFold, TuckOutcome, TuckReport,
    WitnessOrder,
};
use oristudio_geometry::Line;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::Bridge;
use crate::compound::{NeededChoice, choice_needed, compound_refusal};
use crate::resolve::{self, Rejection, finite_point, model_line};
use crate::wire::{
    AlongLine, BridgeError, BridgeRefusal, Choices, LineInput, Motion, Op, Outcome, Point, Refusal,
    SeedInput, Summary,
};
use crate::{FoldEngine, bridge_error, parse, parse_choices, to_js_value};

/// The most orders a choice lands at once; past it, the rest are counted,
/// not landed.
pub const MAX_CANDIDATES: usize = 16;

/// What a tuck's target listing may spend, in milliseconds. A tool lists
/// them once per line, side, direction and seed (plan D14, tier 2), and
/// each target is a completion: at 129–256 faces natively about 60 ms, so a
/// deep stack's thirty would take seconds. A target the budget leaves
/// undecided (`feasible: null`) is one the tool lets the fold itself decide.
pub const TUCK_TARGETS_BUDGET_MS: f64 = 150.0;

/// Milliseconds on a monotonic clock, for a completion's deadline: the
/// page's `performance.now()` in a browser or worker.
#[cfg(target_arch = "wasm32")]
mod clock {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = performance, js_name = now)]
        fn performance_now() -> f64;
    }

    pub fn now_ms() -> f64 {
        performance_now()
    }
}

#[cfg(not(target_arch = "wasm32"))]
mod clock {
    use std::sync::OnceLock;
    use std::time::Instant;

    pub fn now_ms() -> f64 {
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1e3
    }
}

/// A crimp (`FoldCrimpOp`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct CrimpOp {
    /// ℓ1, the line nearer the body.
    pub line: LineInput,
    /// ℓ2, the line nearer the tip.
    pub second: LineInput,
    /// Inside or outside, on both lines.
    pub crimp: ReverseKind,
    /// A sheet point on ℓ1's tip side, when the seed does not name one.
    #[serde(default)]
    pub moving: Option<Point>,
    /// The tools' alternative to `moving` for a model line.
    #[serde(default)]
    pub side: Option<Side>,
    /// What the tip grows from.
    pub seed: SeedInput,
}

/// A tuck (`FoldTuckOp`): valley under its target, mountain over it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct TuckOp {
    pub line: LineInput,
    pub direction: Direction,
    #[serde(default)]
    pub moving: Option<Point>,
    #[serde(default)]
    pub side: Option<Side>,
    pub seed: SeedInput,
    /// A sheet point inside the layer the block lands against.
    pub target: Point,
}

/// What a crimp or tuck stores (`FoldChoices`' keys): the openings chosen
/// among several, and the order chosen among several.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
pub struct StoredChoices {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub opening: Vec<StoredOpening>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion: Option<WitnessOrder>,
}

/// A landed crimp or tuck, held under `state`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CompoundLanded<R> {
    pub state: u32,
    pub report: R,
    pub summary: Summary,
    /// What the step stores, beside a root of its line's.
    pub stored: StoredChoices,
}

/// Where a crimp or tuck got to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum Compound<R> {
    Landed(CompoundLanded<R>),
    /// A flap opens several ways: store one of each such flap's openings
    /// (`choices.opening`) and fold again.
    ChooseOpening {
        analysis: Box<CrimpAnalysis>,
    },
    /// More than one order fits: each landed (up to [`MAX_CANDIDATES`]).
    ChooseOrder {
        /// The true ‹ n of m ›, and whether it is exact.
        orders: u64,
        exact: bool,
        candidates: Vec<CompoundLanded<R>>,
    },
}

/// A crimp's analysis and the kinds that land.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CrimpAnalysed {
    pub analysis: CrimpAnalysis,
    pub kinds: Option<Vec<ReverseKind>>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TuckAnalysed {
    pub analysis: TuckAnalysis,
}

/// A stored order, none when it is empty: as the document reads it, an
/// empty one is no choice.
fn order(choices: &Choices) -> Option<WitnessOrder> {
    choices
        .completion
        .clone()
        .filter(|o| !o.faces.is_empty() || !o.orders.is_empty())
}

/// A crimp's choices, as the engine takes them.
fn crimp_choices(choices: &Choices) -> ReverseChoices {
    ReverseChoices {
        openings: choices.opening.clone().unwrap_or_default(),
        order: order(choices),
    }
}

fn stored(choices: &ReverseChoices) -> StoredChoices {
    StoredChoices {
        opening: choices.openings.clone(),
        completion: choices.order.clone(),
    }
}

/// The choices an op takes none of: an axiom's root is the line's, so it
/// goes only with an axiom line; a tuck has no opening; a pocket is a
/// sink's.
fn check_choices(choices: &Choices, axiom: bool, opening: bool) -> Result<(), Rejection> {
    let unexpected = if choices.root.is_some() && !axiom {
        Some("root")
    } else if choices.pocket.is_some() {
        Some("pocket")
    } else if !opening && choices.opening.as_ref().is_some_and(|o| !o.is_empty()) {
        Some("opening")
    } else {
        None
    };
    match unexpected {
        Some(choice) => Err(BridgeRefusal::UnexpectedChoice { choice }.into()),
        None => Ok(()),
    }
}

/// The plain fold a line, a side and a seed name in `parent`: the line, its
/// moving side and the seed resolved as a valley or mountain step's.
fn plain(
    parent: &State,
    line: &LineInput,
    direction: Direction,
    moving: Option<Point>,
    side: Option<Side>,
    seed: &SeedInput,
    root: Option<&Line>,
) -> Result<PlainFold, Rejection> {
    let along = AlongLine {
        line: line.clone(),
        direction: Some(direction),
        motion: Motion {
            moving,
            side,
            seed: seed.clone(),
            placement: Default::default(),
            closure: Default::default(),
        },
    };
    let resolved = resolve::along_line(parent, &along, direction, ActionKind::Fold, root)?;
    match resolved.plain(parent) {
        Some(fold) => fold.map_err(Rejection::from),
        None => Err(BridgeError::InvalidInput("the line names no fold".to_string()).into()),
    }
}

/// A crimp's second line in `parent`'s model frame: through two sheet
/// points, along a crease, or (the tools') a model line.
fn second_line(parent: &State, line: &LineInput) -> Result<Line, Rejection> {
    match line {
        LineInput::Free { through: [a, b] } => {
            finite_point("second.through", *a)?;
            finite_point("second.through", *b)?;
            let point = |p: Point| {
                parent
                    .resolve_point(p)
                    .ok_or(LineRefusal::PointOffPaper { point: p })
            };
            let (ia, ib) = (point(*a)?, point(*b)?);
            let distance = (ib[0] - ia[0]).hypot(ib[1] - ia[1]);
            Line::from_points(ia, ib)
                .filter(|_| distance >= MIN_FEATURE)
                .ok_or_else(|| {
                    LineRefusal::FreeLineTooShort {
                        a: *a,
                        b: *b,
                        distance,
                    }
                    .into()
                })
        }
        LineInput::Crease { at } => {
            let (segment, _) = resolve::crease(parent, *at)?;
            if segment.length() < MIN_FEATURE {
                return Err(LineRefusal::SegmentTooShort { segment }.into());
            }
            parent
                .resolve_segment(&segment)
                .ok_or_else(|| LineRefusal::SegmentNotOnAFace { segment }.into())
        }
        LineInput::Model { line } => Ok(model_line(line)?.0),
        LineInput::Axiom { .. } => Err(BridgeError::InvalidInput(
            "a crimp's second line is named by two sheet points or a crease: a step stores one root"
                .to_string(),
        )
        .into()),
    }
}

fn crimp_fold(parent: &State, op: &CrimpOp, choices: &Choices) -> Result<CrimpFold, Rejection> {
    let axiom = matches!(op.line, LineInput::Axiom { .. });
    check_choices(choices, axiom, true)?;
    let first = plain(
        parent,
        &op.line,
        Direction::Valley,
        op.moving,
        op.side,
        &op.seed,
        choices.root.as_ref(),
    )?;
    Ok(CrimpFold {
        first: first.line,
        second: second_line(parent, &op.second)?,
        side: first.side,
        anchor: first.seed,
        kind: op.crimp,
    })
}

fn tuck_fold(parent: &State, op: &TuckOp, choices: &Choices) -> Result<TuckFold, Rejection> {
    let axiom = matches!(op.line, LineInput::Axiom { .. });
    check_choices(choices, axiom, false)?;
    finite_point("target", op.target)?;
    let fold = plain(
        parent,
        &op.line,
        op.direction,
        op.moving,
        op.side,
        &op.seed,
        choices.root.as_ref(),
    )?;
    Ok(TuckFold {
        line: fold.line,
        side: fold.side,
        direction: op.direction,
        seed: fold.seed,
        target: op.target,
    })
}

/// A compound fold's refusal on the wire: the engine's, or a stored choice
/// that no longer resolves (the seam's, `crate::compound`).
fn refused(refusal: CompoundRefused) -> Refusal {
    compound_refusal(refusal)
}

/// A resolved op, a refusal, or (thrown) the caller's mistake.
fn settle<T>(resolved: Result<T, Rejection>) -> Result<Result<T, Refusal>, BridgeError> {
    match resolved {
        Ok(value) => Ok(Ok(value)),
        Err(Rejection::Refused(refusal)) => Ok(Err(refusal)),
        Err(Rejection::Input(error)) => Err(error),
    }
}

impl Bridge {
    /// A crimp's analysis, and the kinds that land.
    pub fn analyse_crimp(
        &self,
        state: u32,
        op: &CrimpOp,
        choices: &Choices,
    ) -> Result<Outcome<CrimpAnalysed>, BridgeError> {
        let parent = self.state(state)?;
        let fold = match settle(crimp_fold(parent, op, choices))? {
            Ok(fold) => fold,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        let analysis = match parent.analyse_crimp(&fold) {
            Ok(analysis) => analysis,
            Err(refused) => return Ok(Outcome::Refused(refused.into())),
        };
        let open = analysis.tip.flaps.iter().any(|f| f.openings.len() > 1)
            && choices.opening.as_ref().is_none_or(Vec::is_empty);
        let kinds = if open {
            None
        } else {
            match parent.crimp_kinds(&fold, &crimp_choices(choices)) {
                Ok(kinds) => Some(kinds),
                Err(refusal) => return Ok(Outcome::Refused(refused(refusal))),
            }
        };
        Ok(Outcome::Ok(CrimpAnalysed { analysis, kinds }))
    }

    /// A tuck's analysis: every layer its block lands on, with whether it
    /// takes the tuck.
    pub fn analyse_tuck(
        &self,
        state: u32,
        op: &TuckOp,
        choices: &Choices,
    ) -> Result<Outcome<TuckAnalysed>, BridgeError> {
        let parent = self.state(state)?;
        let fold = match settle(tuck_fold(parent, op, choices))? {
            Ok(fold) => fold,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        let limits = CompletionLimits {
            deadline: Some(Deadline {
                now_ms: clock::now_ms,
                at_ms: clock::now_ms() + TUCK_TARGETS_BUDGET_MS,
            }),
            ..CompletionLimits::default()
        };
        Ok(parent
            .analyse_tuck(&fold, &limits)
            .map(|analysis| TuckAnalysed { analysis })
            .map_err(Refusal::from)
            .into())
    }

    /// Fold a crimp: landed, an opening to choose, or every order landed.
    pub fn crimp(
        &mut self,
        state: u32,
        op: &CrimpOp,
        choices: &Choices,
    ) -> Result<Outcome<Compound<CrimpReport>>, BridgeError> {
        let parent = self.state(state)?.clone();
        let fold = match settle(crimp_fold(&parent, op, choices))? {
            Ok(fold) => fold,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        let layers = layers(&parent, &fold.first, fold.side);
        Ok(match parent.crimp_fold(&fold, &crimp_choices(choices)) {
            Ok(CrimpOutcome::Landed(folded)) => {
                let stored = stored(&folded.report.stored);
                Outcome::Ok(Compound::Landed(self.hold_compound(
                    &parent,
                    folded.state,
                    folded.report,
                    stored,
                    layers,
                )))
            }
            Ok(CrimpOutcome::ChooseOpening(analysis)) => {
                Outcome::Ok(Compound::ChooseOpening { analysis })
            }
            Ok(CrimpOutcome::ChooseOrder(choice)) => {
                let count = choice.count();
                let mut candidates = Vec::new();
                for pick in picks(
                    &choice
                        .completions()
                        .components()
                        .iter()
                        .map(|c| c.orders.len())
                        .collect::<Vec<_>>(),
                ) {
                    let Ok(folded) = choice.pick(&pick) else {
                        continue;
                    };
                    let stored = stored(&folded.report.stored);
                    candidates.push(self.hold_compound(
                        &parent,
                        folded.state,
                        folded.report,
                        stored,
                        layers,
                    ));
                }
                Outcome::Ok(Compound::ChooseOrder {
                    orders: count.orders,
                    exact: count.exact,
                    candidates,
                })
            }
            Err(refusal) => Outcome::Refused(refused(refusal)),
        })
    }

    /// Fold a tuck: landed, or every order landed.
    pub fn tuck(
        &mut self,
        state: u32,
        op: &TuckOp,
        choices: &Choices,
    ) -> Result<Outcome<Compound<TuckReport>>, BridgeError> {
        let parent = self.state(state)?.clone();
        let fold = match settle(tuck_fold(&parent, op, choices))? {
            Ok(fold) => fold,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        let layers = layers(&parent, &fold.line, fold.side);
        let tuck_choices = TuckChoices {
            order: order(choices),
        };
        let stored_of = |stored: &TuckChoices| StoredChoices {
            opening: Vec::new(),
            completion: stored.order.clone(),
        };
        Ok(match parent.tuck_fold(&fold, &tuck_choices) {
            Ok(TuckOutcome::Landed(folded)) => {
                let stored = stored_of(&folded.report.stored);
                Outcome::Ok(Compound::Landed(self.hold_compound(
                    &parent,
                    folded.state,
                    folded.report,
                    stored,
                    layers,
                )))
            }
            Ok(TuckOutcome::ChooseOrder(choice)) => {
                let count = choice.count();
                let mut candidates = Vec::new();
                for pick in picks(
                    &choice
                        .completions()
                        .components()
                        .iter()
                        .map(|c| c.orders.len())
                        .collect::<Vec<_>>(),
                ) {
                    let Ok(folded) = choice.pick(&pick) else {
                        continue;
                    };
                    let stored = stored_of(&folded.report.stored);
                    candidates.push(self.hold_compound(
                        &parent,
                        folded.state,
                        folded.report,
                        stored,
                        layers,
                    ));
                }
                Outcome::Ok(Compound::ChooseOrder {
                    orders: count.orders,
                    exact: count.exact,
                    candidates,
                })
            }
            Err(refusal) => Outcome::Refused(refused(refusal)),
        })
    }

    fn hold_compound<R>(
        &mut self,
        parent: &State,
        state: State,
        report: R,
        stored: StoredChoices,
        layers: Option<usize>,
    ) -> CompoundLanded<R> {
        let summary = crate::bridge::summary(&state);
        let step = StepSummary::new(parent, &state, layers);
        CompoundLanded {
            state: self.hold_compound_state(state, step),
            report,
            summary,
            stored,
        }
    }
}

/// A replayed compound step: the state it lands and its step's summary, or
/// a refusal; thrown, the caller's mistake.
pub(crate) type Replayed = Result<Result<(State, StepSummary), Refusal>, BridgeError>;

/// A stored crimp or tuck replayed in `parent` (`Bridge::apply`): the state
/// it lands, with its step's summary, when its stored choices decide it.
/// None for any other op.
pub(crate) fn replay(parent: &State, op: &Op, choices: &Choices) -> Option<Replayed> {
    let landed = match op {
        Op::Crimp(op) => settle(crimp_fold(parent, op, choices)).map(|fold| {
            fold.and_then(|fold| {
                let layers = layers(parent, &fold.first, fold.side);
                match parent.crimp_fold(&fold, &crimp_choices(choices)) {
                    Ok(CrimpOutcome::Landed(folded)) => Ok((folded.state, layers)),
                    Ok(CrimpOutcome::ChooseOpening(_)) => Err(choice_needed(NeededChoice::Opening)),
                    Ok(CrimpOutcome::ChooseOrder(_)) => {
                        Err(choice_needed(NeededChoice::Completion))
                    }
                    Err(refusal) => Err(refused(refusal)),
                }
            })
        }),
        Op::Tuck(op) => settle(tuck_fold(parent, op, choices)).map(|fold| {
            fold.and_then(|fold| {
                let layers = layers(parent, &fold.line, fold.side);
                let stored = TuckChoices {
                    order: order(choices),
                };
                match parent.tuck_fold(&fold, &stored) {
                    Ok(TuckOutcome::Landed(folded)) => Ok((folded.state, layers)),
                    Ok(TuckOutcome::ChooseOrder(_)) => Err(choice_needed(NeededChoice::Completion)),
                    Err(refusal) => Err(refused(refusal)),
                }
            })
        }),
        _ => return None,
    };
    Some(landed.map(|landed| {
        landed.map(|(state, layers)| {
            let step = StepSummary::new(parent, &state, layers);
            (state, step)
        })
    }))
}

/// "Layers" for a compound step (plan D14): the display layers along its
/// (first) line on the side that moves.
fn layers(parent: &State, line: &Line, side: Side) -> Option<usize> {
    parent
        .cross_section(line, side)
        .ok()
        .map(|section| section.layers)
}

/// Every choice of one order per component, at most [`MAX_CANDIDATES`].
fn picks(sizes: &[usize]) -> Vec<Vec<usize>> {
    let mut picks = vec![Vec::new()];
    for &n in sizes {
        picks = picks
            .into_iter()
            .flat_map(|p: Vec<usize>| {
                (0..n).map(move |k| {
                    let mut q = p.clone();
                    q.push(k);
                    q
                })
            })
            .take(MAX_CANDIDATES)
            .collect();
    }
    picks
}

#[wasm_bindgen]
impl FoldEngine {
    /// A crimp's analysis, and the kinds that land.
    pub fn analyse_crimp(
        &self,
        state: u32,
        op: JsValue,
        choices: JsValue,
    ) -> Result<JsValue, JsValue> {
        let op: CrimpOp = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(
            &self
                .inner
                .analyse_crimp(state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }

    /// A tuck's analysis: the layers its block can be tucked against.
    pub fn analyse_tuck(
        &self,
        state: u32,
        op: JsValue,
        choices: JsValue,
    ) -> Result<JsValue, JsValue> {
        let op: TuckOp = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(
            &self
                .inner
                .analyse_tuck(state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }

    /// Fold a crimp; `choices` may be `undefined` or `null`.
    pub fn crimp(&mut self, state: u32, op: JsValue, choices: JsValue) -> Result<JsValue, JsValue> {
        let op: CrimpOp = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(
            &self
                .inner
                .crimp(state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }

    /// Fold a tuck; `choices` may be `undefined` or `null`.
    pub fn tuck(&mut self, state: u32, op: JsValue, choices: JsValue) -> Result<JsValue, JsValue> {
        let op: TuckOp = parse("op", op)?;
        let choices = parse_choices(choices)?;
        to_js_value(
            &self
                .inner
                .tuck(state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }
}
