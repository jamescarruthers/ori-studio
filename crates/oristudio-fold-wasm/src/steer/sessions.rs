//! The Layer order dialog's constraint sessions, held by handle
//! ([`LayerSessions`]), and every call on them in plain Rust: what
//! [`super::bindings`] puts on `FoldEngine` and `tests/layer_session.rs`
//! drives natively.
//!
//! A session is `oristudio_fold::steer::ConstraintSession` over the solver's
//! view of exactly what the host folded (`LayerSource::from_oriedita`). It
//! stays here, by handle, until it is closed or its worker is terminated; a
//! worker that is respawned starts with none.

use std::collections::HashMap;

use oristudio_cp::folding::{FoldedFigureModel, FoldedPaperScene};
use oristudio_cp::session::FoldSource;
use oristudio_fold::steer::{
    Commit, ConstraintSession, EncodeRefusal, LayerSource, Preview, RecordRead, Restored, ViewSide,
    encode_record, read_record,
};

use super::wire::{
    CommitDone, Committing, LayerCallError, LayerLimits, LayerOpened, LayerRefusal, LayerRestored,
    Opening, PackedStacks, PreviewFits, Previewed, Restoring, SavedFaces, Saving, Sides,
    candidate_of, constraints_of, flat_pairs, order_status, session_refusal, source_refusal,
    thrown, triples_of,
};
use crate::ops_crimp_tuck::clock;

/// Every constraint session the caller still holds. Handles start at 1 and
/// are never reused while this store lives.
#[derive(Debug, Default)]
pub struct LayerSessions {
    held: HashMap<u32, ConstraintSession>,
    last: u32,
}

impl LayerSessions {
    pub fn new() -> LayerSessions {
        LayerSessions::default()
    }

    /// Open a session on what a host folded: the letters' deduction and a
    /// first order of every independent part, with no constraints.
    pub fn open(
        &mut self,
        source: &FoldSource,
        limits: &LayerLimits,
    ) -> Result<Opening, LayerCallError> {
        let limits = limits.limits(clock::now_ms)?;
        let layer = match LayerSource::from_oriedita(source) {
            Ok(layer) => layer,
            Err(refusal) => return source_refusal(refusal).map(Opening::Refused),
        };
        match ConstraintSession::open(layer, &limits) {
            Ok(session) => Ok(Opening::Opened(self.hold(session))),
            Err(refusal) => session_refusal(refusal).map(Opening::Refused),
        }
    }

    /// Open a session on what a host folded and restore a saved record onto
    /// it (decision D10): the record as the host stores it, one JSON string.
    /// The session is held whatever the outcome; a clash or a timeout
    /// commits no constraint, and the rows say why.
    pub fn restore(
        &mut self,
        source: &FoldSource,
        record: &str,
        limits: &LayerLimits,
    ) -> Result<Restoring, LayerCallError> {
        let limits = limits.limits(clock::now_ms)?;
        let record = match read_record(record) {
            RecordRead::Read { record, .. } => record,
            RecordRead::Newer => return Ok(Restoring::Refused(LayerRefusal::RecordNewer)),
            RecordRead::Damaged(damage) => {
                return Ok(Restoring::Refused(LayerRefusal::RecordDamaged { damage }));
            }
        };
        let layer = match LayerSource::from_oriedita(source) {
            Ok(layer) => layer,
            Err(refusal) => return source_refusal(refusal).map(Restoring::Refused),
        };
        let Restored {
            session,
            faces,
            constraints,
            order,
            outcome,
        } = match ConstraintSession::restore(layer, &record, &limits) {
            Ok(restored) => restored,
            Err(refusal) => return session_refusal(refusal).map(Restoring::Refused),
        };
        let committed = triples_of(session.constraints());
        Ok(Restoring::Restored(Box::new(LayerRestored {
            opened: self.hold(session),
            constraints: committed,
            outcome: outcome.into(),
            faces: SavedFaces::of(&faces),
            constraint_status: constraints,
            order_status: order_status(&order),
        })))
    }

    /// The pairs deduction leaves open, flat (see [`LayerOpened::open_pairs`]).
    pub fn open_pairs(&self, session: u32) -> Result<Vec<u32>, LayerCallError> {
        Ok(flat_pairs(&self.session(session)?.open_pairs()))
    }

    /// The committed constraints, as triples, in the order made.
    pub fn constraints(&self, session: u32) -> Result<Vec<i32>, LayerCallError> {
        Ok(triples_of(self.session(session)?.constraints()))
    }

    /// Whether the committed constraints and `candidate` (one triple) leave
    /// an order, and the fitting one closest to the order on screen. Never
    /// changes the session. A timeout is no verdict: keep trying is the same
    /// call with a larger `deadlineMs`.
    pub fn preview(
        &self,
        session: u32,
        candidate: &[i32],
        limits: &LayerLimits,
    ) -> Result<Previewed, LayerCallError> {
        let limits = limits.limits(clock::now_ms)?;
        let candidate = candidate_of(candidate)?;
        let preview = self
            .session(session)?
            .preview(candidate, &limits)
            .map_err(thrown)?;
        Ok(match preview {
            Preview::Fits(fit) => Previewed::Fits(PreviewFits {
                stacks: Sides {
                    front: PackedStacks::from(&fit.stacks(ViewSide::Front)),
                    back: PackedStacks::from(&fit.stacks(ViewSide::Back)),
                },
                changed: fit.changed,
                stage: fit.stage,
                nodes: fit.nodes,
            }),
            Preview::CantFit(cant) => Previewed::CantFit(cant.into()),
            Preview::TimedOut(out) => Previewed::TimedOut(out),
        })
    }

    /// Make `constraints` (triples) the committed list: Add, remove, undo,
    /// redo and Clear all are each a new list. A list that cannot fit, or
    /// runs out of time, changes nothing.
    pub fn commit(
        &mut self,
        session: u32,
        constraints: &[i32],
        limits: &LayerLimits,
    ) -> Result<Committing, LayerCallError> {
        let limits = limits.limits(clock::now_ms)?;
        let constraints = constraints_of(constraints)?;
        let held = self.session_mut(session)?;
        Ok(match held.commit(constraints, &limits).map_err(thrown)? {
            Commit::Committed(done) => Committing::Committed(CommitDone {
                changed: done.changed,
                stacks: stacks_of(held),
                open_pairs: flat_pairs(&held.open_pairs()),
                stage: done.stage,
                nodes: done.nodes,
            }),
            Commit::CantFit(cant) => Committing::CantFit(cant.into()),
            Commit::TimedOut(out) => Committing::TimedOut(out),
        })
    }

    /// The order on screen's stacks from `side`.
    pub fn stacks(&self, session: u32, side: ViewSide) -> Result<PackedStacks, LayerCallError> {
        Ok(PackedStacks::from(&self.session(session)?.stacks(side)))
    }

    /// The paper scene of the order on screen from `side`, with the host's
    /// model, through the CP kernel's own builder: what Apply's new handle
    /// will draw. `None` when the figure has no subfaces.
    pub fn scene(
        &self,
        session: u32,
        side: ViewSide,
        model: &FoldedFigureModel,
    ) -> Result<Option<FoldedPaperScene>, LayerCallError> {
        self.session(session)?.scene(side, model).map_err(thrown)
    }

    /// The order on screen as Oriedita's relations, flat
    /// `[upper, lower, …]`: what the CP bridge's
    /// `folded_figure_fold_with_order` takes at Apply.
    pub fn oriedita_relations(&self, session: u32) -> Result<Vec<u32>, LayerCallError> {
        Ok(self
            .session(session)?
            .oriedita_relations()
            .iter()
            .flat_map(|r| [face_index(r.upper_face), face_index(r.lower_face)])
            .collect())
    }

    /// The saved record, encoded: refused only when it would be over the
    /// record budget (1 MB).
    pub fn save(&self, session: u32) -> Result<Saving, LayerCallError> {
        let record = self.session(session)?.save().map_err(thrown)?;
        match encode_record(&record) {
            Ok(json) => Ok(Saving::Saved { json }),
            Err(EncodeRefusal::OverBudget { bytes, budget }) => {
                Ok(Saving::Refused(LayerRefusal::RecordOverBudget {
                    bytes,
                    budget,
                }))
            }
            Err(EncodeRefusal::Invalid { part }) => Err(LayerCallError::Defect {
                code: "session_internal",
                message: format!(
                    "the session saved a record whose {} would not read back",
                    part.word()
                ),
            }),
        }
    }

    /// Let a session go; whether it was held.
    pub fn close(&mut self, session: u32) -> bool {
        self.held.remove(&session).is_some()
    }

    /// Let every session go.
    pub fn clear(&mut self) {
        self.held.clear();
    }

    /// How many sessions are held.
    pub fn len(&self) -> usize {
        self.held.len()
    }

    pub fn is_empty(&self) -> bool {
        self.held.is_empty()
    }

    fn session(&self, session: u32) -> Result<&ConstraintSession, LayerCallError> {
        self.held
            .get(&session)
            .ok_or(LayerCallError::UnknownSession(session))
    }

    fn session_mut(&mut self, session: u32) -> Result<&mut ConstraintSession, LayerCallError> {
        self.held
            .get_mut(&session)
            .ok_or(LayerCallError::UnknownSession(session))
    }

    /// Hold `session` under a new handle, and what an open reports of it.
    fn hold(&mut self, session: ConstraintSession) -> LayerOpened {
        let view = session.source().view();
        let front_up: Vec<u8> = view
            .faces()
            .iter()
            .map(|face| u8::from(face.front_up))
            .collect();
        let open_pairs = flat_pairs(&session.open_pairs());
        let spots = u32::try_from(session.spot_count()).unwrap_or(u32::MAX);
        // As `Bridge`'s handles: wrapping skips 0 and every handle held.
        loop {
            self.last = self.last.wrapping_add(1);
            if self.last != 0 && !self.held.contains_key(&self.last) {
                break;
            }
        }
        self.held.insert(self.last, session);
        LayerOpened {
            session: self.last,
            faces: u32::try_from(front_up.len()).unwrap_or(u32::MAX),
            front_up,
            open_pairs,
            spots,
        }
    }
}

fn stacks_of(session: &ConstraintSession) -> Sides<PackedStacks> {
    Sides {
        front: PackedStacks::from(&session.stacks(ViewSide::Front)),
        back: PackedStacks::from(&session.stacks(ViewSide::Back)),
    }
}

/// An Oriedita face index, below the face cap, as the wire's number.
fn face_index(face: usize) -> u32 {
    u32::try_from(face).unwrap_or(u32::MAX)
}
