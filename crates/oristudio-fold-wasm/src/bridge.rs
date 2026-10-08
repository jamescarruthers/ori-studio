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

use oristudio_fold::{CreaseKind, Direction, Letter, Sheet, State};

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
        let fold = match op {
            Op::Valley(a) => along_line(parent, a, Direction::Valley),
            Op::Mountain(a) => along_line(parent, a, Direction::Mountain),
            Op::Precrease(a) => precrease_direction(a).and_then(|d| along_line(parent, a, d)),
            Op::Unfold(c) => along_crease(parent, c, true),
            Op::Refold(c) => along_crease(parent, c, false),
            Op::CpJump {} => Err(cp_jump()),
            Op::Turn { .. } | Op::Rotate { .. } => {
                return Err(BridgeError::InvalidInput(format!(
                    "a {} step moves no paper: there is nothing to analyse",
                    op.kind()
                )));
            }
        };
        Ok(match settle(fold)? {
            Ok(fold) => match parent.analyse_fold(&fold) {
                Ok(analysis) => Outcome::Ok(Analysed { analysis }),
                Err(refused) => Outcome::Refused(refused.into()),
            },
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
        let fold = |fold: Result<oristudio_fold::PlainFold, Rejection>, precrease: bool| {
            settle(fold).map(|resolved| {
                resolved.and_then(|fold| {
                    let landed = if precrease {
                        parent.precrease(&fold)
                    } else {
                        parent.fold(&fold)
                    };
                    landed
                        .map(|folded| (folded.state, Some(folded.report)))
                        .map_err(Refusal::from)
                })
            })
        };
        let landed = match op {
            Op::Valley(a) => fold(along_line(parent, a, Direction::Valley), false)?,
            Op::Mountain(a) => fold(along_line(parent, a, Direction::Mountain), false)?,
            Op::Precrease(a) => fold(
                precrease_direction(a).and_then(|d| along_line(parent, a, d)),
                true,
            )?,
            Op::Unfold(c) => fold(along_crease(parent, c, true), false)?,
            Op::Refold(c) => fold(along_crease(parent, c, false), false)?,
            Op::Turn { axis } => Ok((parent.turn_over_about(*axis), None)),
            Op::Rotate { rotate } => Ok((parent.rotate(rotate.angle()), None)),
            Op::CpJump {} => fold(Err(cp_jump()), false)?,
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

/// A precrease's direction, which its op must give.
fn precrease_direction(op: &crate::wire::AlongLine) -> Result<Direction, Rejection> {
    op.direction.ok_or_else(|| {
        Rejection::Input(BridgeError::InvalidInput(
            "a precrease needs its direction".to_string(),
        ))
    })
}

/// Import CP: its loaders and completion are Phase 8's.
fn cp_jump() -> Rejection {
    Rejection::Refused(BridgeRefusal::UnsupportedOp {
        feature: Unsupported::CpJump,
    })
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
