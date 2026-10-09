//! The bridge's engine, without wasm-bindgen: landed states held by handle,
//! and the coarse calls a replay, the tools and the panes make on them.
//!
//! A state never crosses the boundary. Each landed one stays here under a
//! `u32` handle until the caller releases it, so a step costs one call however
//! large the state is, and a replay's cache holds handles rather than copies.
//! Handles start at 1 and are never reused while this engine lives; a worker
//! that is terminated and respawned starts a fresh engine, which knows none
//! of the old ones (`unknown_state`).
//!
//! A held state remembers the step that landed it — its parent's handle and,
//! for a fold, the fold — so the step's summary and its picture are asked of
//! the child alone, computed when asked rather than on every step a replay
//! lands, while the parent is still held. An import keeps no parent: it
//! replaces the state rather than changing it, so nothing about it is asked
//! of the state before it.

use std::collections::HashMap;

use oristudio_fold::{
    ActionKind, AnchoredRefused, CreaseDiff, CreaseKind, FoldAnalysis, Folded, Letter, Sheet, Side,
    State, StepSummary,
};
use oristudio_geometry::Line;

use crate::canonical::canonical_keys;
use crate::compound::CompoundLanded;
use crate::joins::section_joins;
use crate::resolve::{Rejection, Resolved, axiom_of, finite_point, model_line, resolve};
use crate::wire::{
    Acted, Analysed, Applied, BridgeError, Candidates, Choices, CreaseCounts, DepthChosen, Fix,
    LineInput, Op, Outcome, Paper, Point, Refusal, Section, Sectioned, SheetMade, StepActed,
    StoredStep, Summarised, Summary, TopVisible,
};

/// Every landed state the caller still holds.
#[derive(Debug, Default)]
pub struct Bridge {
    states: HashMap<u32, Held>,
    last: u32,
}

/// A held state and the step that landed it.
#[derive(Debug)]
enum Held {
    /// A flat sheet.
    Sheet(State),
    /// A turn or a rotation of `parent`.
    View { state: State, parent: u32 },
    /// A fold of `parent`, with its report.
    Fold {
        folded: Box<Folded>,
        parent: u32,
        kind: ActionKind,
    },
    /// An imported crease pattern (a `cp-jump`, plan D16), landed after a
    /// state it replaces.
    Jump(State),
    /// A compound fold of `parent` (`crate::compound`).
    Compound {
        landed: Box<dyn CompoundLanded>,
        parent: u32,
    },
    /// A compound fold that keeps no parent (a crimp, a tuck,
    /// `ops_crimp_tuck`), with its step's summary, taken when it landed, so
    /// its parent need not stay held: its picture is its motion, in its
    /// report.
    Summarised { state: State, step: StepSummary },
}

impl Held {
    fn state(&self) -> &State {
        match self {
            Held::Sheet(state)
            | Held::View { state, .. }
            | Held::Jump(state)
            | Held::Summarised { state, .. } => state,
            Held::Fold { folded, .. } => &folded.state,
            Held::Compound { landed, .. } => landed.state(),
        }
    }
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
                    state: self.hold(Held::Sheet(state)),
                    summary,
                })
            }
            Err(refusal) => Outcome::Refused(refusal.into()),
        }
    }

    /// What a fold along a line would move, without folding (D14 tier 2):
    /// the moving set, the flaps, which the seed picked and which the
    /// closure added. A turn or a rotation moves no paper and is not asked.
    pub fn analyse(
        &self,
        state: u32,
        op: &Op,
        choices: &Choices,
    ) -> Result<Outcome<Analysed>, BridgeError> {
        let parent = self.state(state)?;
        Ok(analysis(parent, op, choices)?
            .map(|(analysis, _)| Analysed { analysis })
            .into())
    }

    /// The picture of a fold the op would make (plan D12, per step): its
    /// line with visible and hidden spans, the faces that move and the
    /// arrow's grip, on `state` and in its scene frame, before anything
    /// lands.
    pub fn action(
        &self,
        state: u32,
        op: &Op,
        choices: &Choices,
    ) -> Result<Outcome<Acted>, BridgeError> {
        let parent = self.state(state)?;
        let action = match settle(resolve(parent, op, choices))? {
            // A compound fold pictures itself: a reverse fold's push.
            Ok(Resolved::Compound(compound)) => compound.action(parent),
            resolved => analysis_of(parent, op, resolved)?.and_then(|(analysis, kind)| {
                parent
                    .fold_action(&analysis, kind, None)
                    .map_err(Refusal::from)
            }),
        };
        Ok(action.map(|action| Acted { action }).into())
    }

    /// The distinct moving sets of the top 1, 2, … layers at the sheet point
    /// `at` (the bottom ones for a mountain), for a fold along the op's
    /// line: the depth picker's preview. The op's seed is replaced.
    pub fn depth_choices(
        &self,
        state: u32,
        op: &Op,
        choices: &Choices,
        at: Point,
    ) -> Result<Outcome<DepthChosen>, BridgeError> {
        let parent = self.state(state)?;
        finite_point("at", at)?;
        let plain = match settle(resolve(parent, op, choices))? {
            Ok(resolved) => resolved.plain(parent).ok_or_else(|| moves_no_paper(op))?,
            Err(refusal) => return Ok(Outcome::Refused(refusal)),
        };
        Ok(plain
            .map_err(Refusal::from)
            .and_then(|fold| parent.depth_choices(&fold, at).map_err(Refusal::from))
            .map(|choices| DepthChosen { choices })
            .into())
    }

    /// The paper along a model-frame line on one side of it, as the layer
    /// picker shows it (plan D14), with where bends join its rows. `side` is
    /// relative to the normal as given.
    pub fn cross_section(
        &self,
        state: u32,
        line: &Line,
        side: Side,
    ) -> Result<Outcome<Sectioned>, BridgeError> {
        let parent = self.state(state)?;
        let (line, flipped) = model_line(line)?;
        let side = if flipped { side.opposite() } else { side };
        Ok(parent
            .cross_section(&line, side)
            .map(|section| Sectioned {
                section: Section {
                    joins: section_joins(parent, &section),
                    section,
                },
            })
            .map_err(Refusal::from)
            .into())
    }

    /// The folds an axiom yields here, each with its root number, its line
    /// and the side it moves: the candidate chooser's (plan D14). `line` is
    /// the document's axiom line.
    pub fn axiom_candidates(
        &self,
        state: u32,
        line: &LineInput,
    ) -> Result<Outcome<Candidates>, BridgeError> {
        let parent = self.state(state)?;
        let LineInput::Axiom { axiom, inputs } = line else {
            return Err(BridgeError::InvalidInput(
                "candidates are an axiom line's: give `{ via: 'axiom', axiom, inputs }`"
                    .to_string(),
            ));
        };
        let axiom = axiom_of(*axiom, inputs)?;
        Ok(parent
            .axiom_candidates(&axiom)
            .map(|candidates| Candidates { candidates })
            .map_err(Refusal::from)
            .into())
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
        // A crimp or a tuck lands as its stored choices decide it.
        if let Some(landed) = crate::ops_crimp_tuck::replay(parent, op, choices) {
            return Ok(match landed? {
                Ok((landed, step)) => {
                    let summary = summary(&landed);
                    Outcome::Ok(Applied {
                        state: self.hold_compound_state(landed, step),
                        report: None,
                        summary,
                    })
                }
                Err(refusal) => Outcome::Refused(refusal),
            });
        }
        let fold = |folded: Folded, kind| Held::Fold {
            folded: Box::new(folded),
            parent: state,
            kind,
        };
        let landed = match settle(resolve(parent, op, choices))? {
            Ok(Resolved::Anchored {
                fold: anchored,
                kind,
            }) => match kind {
                ActionKind::Fold => parent.fold_anchored(&anchored),
                ActionKind::Precrease => parent.precrease_anchored(&anchored),
            }
            .map(|folded| fold(folded, kind))
            .map_err(|refused| anchored_refusal(refused, kind)),
            Ok(Resolved::Plain { fold: plain, kind }) => match kind {
                ActionKind::Fold => parent.fold(&plain),
                ActionKind::Precrease => parent.precrease(&plain),
            }
            .map(|folded| fold(folded, kind))
            .map_err(Refusal::from),
            Ok(Resolved::View(landed)) => Ok(Held::View {
                state: landed,
                parent: state,
            }),
            Ok(Resolved::Jump(landed)) => Ok(Held::Jump(landed)),
            Ok(Resolved::Compound(compound)) => {
                compound.apply(parent).map(|landed| Held::Compound {
                    landed,
                    parent: state,
                })
            }
            Err(refusal) => Err(refusal),
        };
        Ok(match landed {
            Ok(held) => {
                let summary = summary(held.state());
                let (report, compound) = match &held {
                    Held::Fold { folded, .. } => (Some(folded.report.clone()), None),
                    Held::Compound { landed, .. } => (None, Some(landed.report())),
                    Held::Sheet(_) | Held::View { .. } | Held::Jump(_) | Held::Summarised { .. } => {
                        (None, None)
                    }
                };
                Outcome::Ok(Applied {
                    state: self.hold(held),
                    report,
                    compound,
                    summary,
                })
            }
            Err(refusal) => Outcome::Refused(refusal),
        })
    }

    pub fn summary(&self, state: u32) -> Result<Summary, BridgeError> {
        self.state(state).map(summary)
    }

    /// The summary of the step that landed `state` (plan D14): its
    /// front-relative counts, the crease-pattern diff from its parent and,
    /// for a fold, "Layers". None for a flat sheet. The parent of a fold, a
    /// turn or a rotation must still be held; an import's summary is the
    /// pattern it brings ([`imported`]), which needs none.
    pub fn step_summary(&self, state: u32) -> Result<Outcome<Summarised>, BridgeError> {
        let summary = match self.held(state)? {
            Held::Sheet(_) => Ok(None),
            Held::View {
                state: child,
                parent,
            } => Ok(Some(StepSummary::new(
                self.parent(state, *parent)?,
                child,
                None,
            ))),
            Held::Fold { folded, parent, .. } => folded
                .summary(self.parent(state, *parent)?)
                .map(Some)
                .map_err(Refusal::from),
            Held::Compound { landed, parent } => {
                landed.summary(self.parent(state, *parent)?).map(Some)
            }
            Held::Jump(child) => Ok(Some(imported(child))),
            Held::Summarised { step, .. } => Ok(Some(step.clone())),
        };
        Ok(summary.map(|summary| Summarised { summary }).into())
    }

    /// The picture of the step that landed `state` (plan D12, per step), on
    /// its parent with the landed state's cover at the arrow's head. None for
    /// a flat sheet, a turn, a rotation or an import. A fold's parent must
    /// still be held.
    pub fn step_action(&self, state: u32) -> Result<Outcome<StepActed>, BridgeError> {
        let action = match self.held(state)? {
            Held::Sheet(_) | Held::View { .. } | Held::Jump(_) | Held::Summarised { .. } => {
                Ok(None)
            }
            Held::Fold {
                folded,
                parent,
                kind,
            } => folded
                .action(self.parent(state, *parent)?, *kind)
                .map(Some)
                .map_err(Refusal::from),
            Held::Compound { landed, parent } => {
                landed.action(self.parent(state, *parent)?).map(Some)
            }
        };
        Ok(action.map(|action| StepActed { action }).into())
    }

    /// The state's scene (plan D12).
    pub fn scene(&self, state: u32) -> Result<oristudio_fold::FoldScene, BridgeError> {
        self.state(state).map(State::scene)
    }

    /// The state's landmarks with their provenance and visibility, with
    /// Divide-line `marks` (sheet points) among its points.
    pub fn landmarks(
        &self,
        state: u32,
        marks: &[Point],
    ) -> Result<oristudio_fold::Landmarks, BridgeError> {
        for &mark in marks {
            finite_point("mark", mark)?;
        }
        self.state(state).map(|s| s.landmarks(marks))
    }

    /// The face the viewer sees at a model-frame point, and the sheet point
    /// there; none off the paper or on a crease.
    pub fn top_visible_at(&self, state: u32, at: Point) -> Result<Option<TopVisible>, BridgeError> {
        finite_point("at", at)?;
        Ok(self
            .state(state)?
            .top_visible_at(at)
            .map(|(face, sheet)| TopVisible { face, sheet }))
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
        self.held(state).map(Held::state)
    }

    fn held(&self, state: u32) -> Result<&Held, BridgeError> {
        self.states
            .get(&state)
            .ok_or(BridgeError::UnknownState(state))
    }

    fn parent(&self, state: u32, parent: u32) -> Result<&State, BridgeError> {
        self.state(parent)
            .map_err(|_| BridgeError::ParentReleased { state, parent })
    }

    /// Hold a compound fold (`ops_crimp_tuck`) with its step's summary; its
    /// handle.
    pub(crate) fn hold_compound_state(&mut self, state: State, step: StepSummary) -> u32 {
        self.hold(Held::Summarised { state, step })
    }

    fn hold(&mut self, held: Held) -> u32 {
        // Wrapping (which no session reaches) skips 0 and every handle still
        // held, so a live handle never names a second state.
        loop {
            self.last = self.last.wrapping_add(1);
            if self.last != 0 && !self.states.contains_key(&self.last) {
                break;
            }
        }
        self.states.insert(self.last, held);
        self.last
    }
}

/// What the op's fold would move, and whether it folds or precreases.
fn analysis(
    parent: &State,
    op: &Op,
    choices: &Choices,
) -> Result<Result<(FoldAnalysis, ActionKind), Refusal>, BridgeError> {
    analysis_of(parent, op, settle(resolve(parent, op, choices))?)
}

/// [`analysis`] of an op already resolved.
fn analysis_of(
    parent: &State,
    op: &Op,
    resolved: Result<Resolved, Refusal>,
) -> Result<Result<(FoldAnalysis, ActionKind), Refusal>, BridgeError> {
    Ok(match resolved {
        Ok(Resolved::Anchored { fold, kind }) => parent
            .analyse_anchored(&fold)
            .map(|analysis| (analysis, kind))
            .map_err(|refused| anchored_refusal(refused, kind)),
        Ok(Resolved::Plain { fold, kind }) => parent
            .analyse_fold(&fold)
            .map(|analysis| (analysis, kind))
            .map_err(Refusal::from),
        Ok(Resolved::Compound(compound)) => compound
            .analysis(parent)
            .map(|analysis| (analysis, ActionKind::Fold)),
        Ok(Resolved::View(_) | Resolved::Jump(_)) => return Err(moves_no_paper(op)),
        Err(refusal) => Err(refusal),
    })
}

/// An import's summary (plan D14, D16): the crease pattern it brings, by
/// letter. Its diff is empty and it has no layers: it replaces the state
/// before it rather than changing it, so none of its creases is a change to
/// that state's, and nothing folds along a line.
fn imported(state: &State) -> StepSummary {
    StepSummary {
        counts: state.crease_counts(),
        diff: CreaseDiff::default(),
        layers: None,
    }
}

fn moves_no_paper(op: &Op) -> BridgeError {
    BridgeError::InvalidInput(format!(
        "a {} step moves no paper: there is nothing to analyse",
        op.kind()
    ))
}

/// A refused anchored fold on the wire: each sliver remedy's `use_line` fix
/// carries the step that folds along it (plan D5).
fn anchored_refusal(refused: AnchoredRefused, kind: ActionKind) -> Refusal {
    match refused {
        AnchoredRefused::Line(line) => Refusal::from(line),
        AnchoredRefused::Fold { refused, remedies } => {
            let mut refusal = Refusal::from(refused);
            for fix in &mut refusal.fixes {
                let Fix::UseLine { line, side, step } = fix else {
                    continue;
                };
                *step = remedies
                    .iter()
                    .find(|r| r.line == *line && r.side == *side)
                    .and_then(|r| StoredStep::of(&r.fold, kind == ActionKind::Precrease));
            }
            refusal
        }
    }
}

/// A resolved op, a refusal, or (thrown) the caller's mistake.
fn settle<T>(resolved: Result<T, Rejection>) -> Result<Result<T, Refusal>, BridgeError> {
    match resolved {
        Ok(value) => Ok(Ok(value)),
        Err(Rejection::Refused(refusal)) => Ok(Err(refusal)),
        Err(Rejection::Input(error)) => Err(error),
    }
}

pub(crate) fn summary(state: &State) -> Summary {
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
