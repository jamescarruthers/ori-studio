//! The bridge's engine, without wasm-bindgen: landed states held by handle,
//! and the coarse calls a replay and the tools make on them.
//!
//! A state never crosses the boundary. Each landed one stays here under a
//! `u32` handle until the caller releases it, so a step costs one call however
//! large the state is, and a replay's cache holds handles rather than copies.
//! Handles start at 1 and are never reused while this engine lives; a worker
//! that is terminated and respawned starts a fresh engine, which knows none
//! of the old ones (`unknown_state`).

use std::collections::HashMap;

use oristudio_fold::{CreaseKind, Direction, Letter, PlainFold, Sheet, State};

use crate::canonical::canonical_keys;
use crate::resolve::{Rejection, along_crease, along_line};
use crate::wire::{
    Analysed, Applied, BridgeError, BridgeRefusal, Choices, CreaseCounts, Op, Outcome, Paper,
    Refusal, SheetMade, Summary, Unsupported,
};

/// Every landed state the caller still holds.
#[derive(Debug, Default)]
pub struct Bridge {
    states: HashMap<u32, State>,
    last: u32,
}

impl Bridge {
    pub fn new() -> Bridge {
        Bridge::default()
    }

    /// The flat sheet a sequence starts from.
    pub fn sheet(&mut self, paper: &Paper) -> Outcome<SheetMade> {
        let made = Sheet::new(&paper.shape.sheet_shape())
            .and_then(|sheet| State::flat(sheet, paper.start_side));
        match made {
            Ok(state) => {
                let summary = summary(&state);
                Outcome::Ok(SheetMade {
                    state: self.hold(state),
                    summary,
                })
            }
            Err(refusal) => Outcome::Refused(refusal.into()),
        }
    }

    /// What a fold along a line would move, without folding (D14 tier 2):
    /// the moving set, the flaps, which the seed picked and which the
    /// closure added. A turn or a rotation moves no paper and is not asked.
    pub fn analyse(&self, state: u32, op: &Op) -> Result<Outcome<Analysed>, BridgeError> {
        let parent = self.state(state)?;
        Ok(match settle(resolve(parent, op))? {
            Ok(Resolved::Fold { fold, .. }) => match parent.analyse_fold(&fold) {
                Ok(analysis) => Outcome::Ok(Analysed { analysis }),
                Err(refused) => Outcome::Refused(refused.into()),
            },
            Ok(Resolved::View(_)) => {
                return Err(BridgeError::InvalidInput(format!(
                    "a {} step moves no paper: there is nothing to analyse",
                    op.kind()
                )));
            }
            Err(refusal) => Outcome::Refused(refusal),
        })
    }

    /// One step from the state `state`, landing a new one under a new
    /// handle. The parent stays held.
    pub fn apply(
        &mut self,
        state: u32,
        op: &Op,
        choices: &Choices,
    ) -> Result<Outcome<Applied>, BridgeError> {
        let parent = self.state(state)?;
        if let Some(choice) = choices.first_present() {
            return Ok(Outcome::Refused(
                BridgeRefusal::UnexpectedChoice { choice }.into(),
            ));
        }
        let landed = match settle(resolve(parent, op))? {
            Ok(Resolved::Fold { fold, precrease }) => {
                let folded = if precrease {
                    parent.precrease(&fold)
                } else {
                    parent.fold(&fold)
                };
                folded
                    .map(|folded| (folded.state, Some(folded.report)))
                    .map_err(Refusal::from)
            }
            Ok(Resolved::View(state)) => Ok((state, None)),
            Err(refusal) => Err(refusal),
        };
        Ok(match landed {
            Ok((state, report)) => {
                let summary = summary(&state);
                Outcome::Ok(Applied {
                    state: self.hold(state),
                    report,
                    summary,
                })
            }
            Err(refusal) => Outcome::Refused(refusal),
        })
    }

    pub fn summary(&self, state: u32) -> Result<Summary, BridgeError> {
        self.state(state).map(summary)
    }

    /// The keys of the state's `fs1` fingerprint ([`canonical_keys`]).
    pub fn canonical_keys(&self, state: u32) -> Result<Vec<String>, BridgeError> {
        self.state(state).map(canonical_keys)
    }

    /// Let a state go; whether it was held.
    pub fn release(&mut self, state: u32) -> bool {
        self.states.remove(&state).is_some()
    }

    /// Let every state go.
    pub fn clear(&mut self) {
        self.states.clear();
    }

    /// How many states are held.
    pub fn len(&self) -> usize {
        self.states.len()
    }

    pub fn is_empty(&self) -> bool {
        self.states.is_empty()
    }

    pub fn state(&self, state: u32) -> Result<&State, BridgeError> {
        self.states
            .get(&state)
            .ok_or(BridgeError::UnknownState(state))
    }

    fn hold(&mut self, state: State) -> u32 {
        // Wrapping (which no session reaches) skips 0 and every handle still
        // held, so a live handle never names a second state.
        loop {
            self.last = self.last.wrapping_add(1);
            if self.last != 0 && !self.states.contains_key(&self.last) {
                break;
            }
        }
        self.states.insert(self.last, state);
        self.last
    }
}

/// An op, resolved against its parent.
enum Resolved {
    /// A fold along a line, folded back again when `precrease`.
    Fold { fold: PlainFold, precrease: bool },
    /// A turn or a rotation: the same model, seen another way.
    View(State),
}

fn resolve(parent: &State, op: &Op) -> Result<Resolved, Rejection> {
    let fold = |fold, precrease| Ok(Resolved::Fold { fold, precrease });
    match op {
        Op::Valley(a) => fold(along_line(parent, a, Direction::Valley)?, false),
        Op::Mountain(a) => fold(along_line(parent, a, Direction::Mountain)?, false),
        Op::Precrease(a) => {
            let direction = a.direction.ok_or_else(|| {
                BridgeError::InvalidInput("a precrease needs its direction".to_string())
            })?;
            fold(along_line(parent, a, direction)?, true)
        }
        Op::Unfold(c) => fold(along_crease(parent, c, true)?, false),
        Op::Refold(c) => fold(along_crease(parent, c, false)?, false),
        Op::Turn { axis } => Ok(Resolved::View(parent.turn_over_about(*axis))),
        Op::Rotate { rotate } => Ok(Resolved::View(parent.rotate(rotate.angle()))),
        // Import CP: its loaders and completion are Phase 8's.
        Op::CpJump {} => Err(BridgeRefusal::UnsupportedOp {
            feature: Unsupported::CpJump,
        }
        .into()),
    }
}

/// A resolved fold, a refusal, or (thrown) the caller's mistake.
fn settle<T>(resolved: Result<T, Rejection>) -> Result<Result<T, Refusal>, BridgeError> {
    match resolved {
        Ok(value) => Ok(Ok(value)),
        Err(Rejection::Refused(refusal)) => Ok(Err(refusal.into())),
        Err(Rejection::Input(error)) => Err(error),
    }
}

fn summary(state: &State) -> Summary {
    let mut creases = CreaseCounts::default();
    for crease in state.creases() {
        match crease.kind {
            CreaseKind::Border => creases.border += 1,
            CreaseKind::Folded(Letter::Mountain) => creases.mountain += 1,
            CreaseKind::Folded(Letter::Valley) => creases.valley += 1,
            CreaseKind::Flat(_) => creases.flat += 1,
        }
    }
    Summary {
        step: state.step(),
        faces: state.faces().len(),
        pairs: state.order().len(),
        creases,
        view: state.view(),
        residual: state.residual(),
        sheet: state.sheet().outline().to_vec(),
    }
}
