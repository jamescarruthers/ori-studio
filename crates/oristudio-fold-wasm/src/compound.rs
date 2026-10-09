//! The one seam every compound fold reaches the bridge through (plan D4): a
//! resolved op ([`CompoundOp`]) and what it lands ([`CompoundLanded`]), so
//! the bridge holds, pictures and summarises any of them alike and each
//! family adds a module of its own (`ops_<family>.rs`) rather than arms
//! across [`crate::bridge`].
//!
//! - **Resolving.** A family's op resolves in `resolve` like any other step
//!   — its line and side from the document's anchors, its stored choices
//!   read as the engine's — to a [`CompoundOp`].
//! - **Landing.** [`CompoundOp::apply`] lands it, or refuses. A step whose
//!   stored choices leave more than one result is refused as
//!   `choice_needed`, naming the choice: a tool asks its family's own query
//!   for the candidates and stores one; a replay marks the step broken, as
//!   plan D6 has it. A stored choice that no longer resolves is
//!   `choice_broken`, with the engine's [`Broken`] cause.
//! - **Asking.** What the tools ask before a step lands — what moves, its
//!   picture, the plain fold its line and anchor name for the depth picker —
//!   is the op's; what the panes ask after — the step's summary and picture —
//!   is the landed fold's.
//! - **Reporting.** What a landed compound fold did crosses beside a plain
//!   fold's report as [`CompoundStepReport`], tagged by its op.

use std::fmt::Debug;

use oristudio_fold::{
    Broken, CompoundRefused, FoldActionGeometry, FoldAnalysis, PlainFold, ReverseReport, State,
    StepSummary,
};
use serde::Serialize;

use crate::wire::{BridgeRefusal, Refusal};

/// A compound fold resolved in its parent, ready to land or be asked about.
pub trait CompoundOp: Debug {
    /// What moves, as a plain fold's analysis reads: the line and side, the
    /// moving side's flaps, the ones the anchor picked, and the faces that
    /// move. Its direction is the one the viewer sees the near layer turn.
    fn analysis(&self, parent: &State) -> Result<FoldAnalysis, Refusal>;
    /// Its picture on the parent, before it lands.
    fn action(&self, parent: &State) -> Result<FoldActionGeometry, Refusal>;
    /// The plain fold its line, side and anchor name: what a depth pick
    /// previews the stacks of.
    fn plain(&self) -> PlainFold;
    /// Land it with its stored choices.
    fn apply(&self, parent: &State) -> Result<Box<dyn CompoundLanded>, Refusal>;
}

/// A landed compound fold, held under its handle.
pub trait CompoundLanded: Debug {
    fn state(&self) -> &State;
    /// What it did, on the wire.
    fn report(&self) -> CompoundStepReport;
    /// Its summary, against the parent it folded.
    fn summary(&self, parent: &State) -> Result<StepSummary, Refusal>;
    /// Its picture on the parent it folded, with the landed state's cover.
    fn action(&self, parent: &State) -> Result<FoldActionGeometry, Refusal>;
}

/// What a landed compound fold did, by its op.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "op", rename_all = "kebab-case")]
pub enum CompoundStepReport {
    /// An inside or outside reverse fold (`ops_reverse`).
    Reverse(Box<ReverseReport>),
}

/// The choice a compound step still has to make before it lands, as
/// `choice_needed` names it: the document key it is stored under.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NeededChoice {
    /// A flap opens more than one way (reverse folds, crimps, tucks).
    Opening,
    /// The completion leaves more than one order.
    Completion,
}

/// A compound fold's refusal on the wire: the engine's, with its fixes, or a
/// stored choice that no longer resolves.
pub fn compound_refusal(refused: CompoundRefused) -> Refusal {
    match refused {
        CompoundRefused::Refused(refused) => refused.into(),
        CompoundRefused::Broken(broken) => broken_choice(broken),
    }
}

/// A stored choice that no longer resolves (plan D6).
pub fn broken_choice(broken: Broken) -> Refusal {
    BridgeRefusal::ChoiceBroken { broken }.into()
}

/// A step whose stored choices leave more than one result.
pub fn choice_needed(choice: NeededChoice) -> Refusal {
    BridgeRefusal::ChoiceNeeded { choice }.into()
}
