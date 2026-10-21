//! A plain fold's layer orders, solved (the `solved` landing): every order
//! the moving paper can land in, listed by the layer-order solver, per
//! independent part, and the one chosen stored as the order itself.
//!
//! # What is listed
//!
//! - **One geometry.** Every order moves the same paper: the seed's
//!   material-connected flaps (the seed grown across every crease with an
//!   end on the moving side), reflected across ℓ as one block. That is the
//!   paper the recipe search ([`super::placements`]) already admits every
//!   candidate by. A landing that moves other paper — a closure that adds
//!   flaps above the block, an old tuck's target-bounded closure — is a fold
//!   of more flaps, reached by naming them in the seed, never a layer-order
//!   choice of this one.
//! - **The parent's order is never asked again.** Every pair of faces where
//!   neither face moves keeps the parent's order, fixed (the compound
//!   pipeline's carry); pairs inside the block keep theirs, reversed by the
//!   reflection; each hinge keeps the fold's direction (valley: the block's
//!   face above the face it is hinged to). Only pairs between the moving
//!   paper and the paper it can lie against, pass or slide between are open.
//! - **Parts** are the completion's independent components. A part made only
//!   of faces that do not move is never offered: its pairs are pinned to the
//!   parent's order before anything is listed ([`FoldOrders::pins`]). The
//!   carry already fixes every such pair, so the pin is a guard; the corpus
//!   probe (`tests/solved_orders.rs`) checks it never fires.
//! - **A choice** is one listed order per part. The fold asks only when the
//!   moving paper has more than one valid order ([`FoldOrders::count`]).
//!
//! # What a step stores
//!
//! The `solved` landing ([`super::placements::FoldLanding::Solved`]) with the
//! chosen order's open pairs as `choices.completion`: every pair of every
//! part, not just enough to tell the options apart, so replay is pinned on
//! every pair it chose. Replay prepares the same block, fixes those pairs and
//! completes ([`State::fold_solved`]): exactly one order lands, anything else
//! breaks the step ([`Broken`]), never a guess.
//!
//! # Every listed order lands — almost
//!
//! The completion searches around the moving faces (`complete_around`); the
//! gate a pick lands through checks the whole state. On rare folds (3 of
//! 1,123 listed in the seeded campaign, none in the corpora) the completion's
//! one order is one the gate refuses: such a fold is listed as having no
//! order. A listing of several orders is not landed whole up front, so a pick
//! the gate refuses is refused when it is picked (never seen in either).
//!
//! # When it cannot list
//!
//! [`State::fold_orders`] says why it could not ([`Unlisted`]): no order at
//! all, which refuses the fold; or a listing it could not finish — the
//! preparation refused (a face or stacking cap, a gate only the compound
//! pipeline runs), the completion ran out of nodes or time, or a part listed
//! fewer orders than it has. Only then does a tool fall back to the recipe
//! search, whose count is never exact.

use serde::Serialize;

use crate::compound::tuck::{SelectionBlock, TuckFold};
use crate::compound::{CompoundFolded, CompoundRefused, no_order};
use crate::fold::{FoldAnalysis, FoldReport, Folded, PlainFold};
use crate::pattern::FaceId;
use crate::refusal::{FoldRefusal, Refused};
use crate::state::State;
use crate::witness::WitnessOrder;
use crate::{ChoiceCount, CompletionLimits, CompletionRefusal, Completions};

/// One part of a fold's orders the folder chooses in: an independent
/// component of the completion with more than one order.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OrderPart {
    /// Its component, the index a choice gives its pick at.
    pub component: usize,
    /// The orders it lists.
    pub orders: usize,
    /// More exist than are listed.
    pub truncated: bool,
    /// The landed faces its pairs order, ascending: at least one of them
    /// moves.
    pub faces: Vec<FaceId>,
}

/// Why a fold's orders were not listed.
#[derive(Debug, Clone, PartialEq)]
pub enum Unlisted {
    /// The moving paper has no valid order: the fold is refused.
    NoOrder(Refused),
    /// The listing could not finish within its limits, or the fold could not
    /// be prepared as one block: the recipe search is the fallback.
    Unfinished(Unfinished),
}

/// What stopped a listing short.
#[derive(Debug, Clone, PartialEq)]
pub enum Unfinished {
    /// The block could not be prepared: a cap, or a gate.
    Prepare(Refused),
    /// The completion ran out of its node budget or its time.
    Budget(FoldRefusal),
    /// A part has more orders than the limits list.
    Truncated,
}

/// Every order a plain fold of the seed's flaps can land in.
#[derive(Debug)]
pub struct FoldOrders {
    block: SelectionBlock,
    completions: Completions,
    analysis: FoldAnalysis,
    /// Pairs `[upper, lower]` of faces that do not move, left open by the
    /// completion and pinned to the parent's order (see the module docs).
    pins: Vec<[FaceId; 2]>,
}

/// A solved fold landed, with what its step stores.
#[derive(Debug, Clone)]
pub struct SolvedFolded {
    pub folded: Folded,
    /// The open pairs it took; none when there was one order.
    pub stored: Option<WitnessOrder>,
}

impl FoldOrders {
    /// The true ‹ n of m ›: the product of the parts' counts.
    pub fn count(&self) -> ChoiceCount {
        self.completions.count()
    }

    /// The completion: every component, a part or not.
    pub fn completions(&self) -> &Completions {
        &self.completions
    }

    /// The parts the folder chooses in: the components with more than one
    /// order, in component order.
    pub fn parts(&self) -> Vec<OrderPart> {
        self.completions
            .components()
            .iter()
            .enumerate()
            .filter(|(_, c)| c.orders.len() > 1 || c.truncated)
            .map(|(k, c)| {
                let mut faces: Vec<FaceId> = c.pairs.iter().flat_map(|p| p.faces()).collect();
                faces.sort_unstable();
                faces.dedup();
                OrderPart {
                    component: k,
                    orders: c.orders.len(),
                    truncated: c.truncated,
                    faces,
                }
            })
            .collect()
    }

    /// The parent's faces that move, in id order.
    pub fn moving(&self) -> &[FaceId] {
        &self.block.moving
    }

    /// The landed faces that move, in id order.
    pub fn moving_landed(&self) -> Vec<FaceId> {
        let (parts, blocks) = self.block.prepared.landed();
        parts
            .faces
            .iter()
            .zip(blocks)
            .filter(|(_, block)| block.is_some())
            .map(|(face, _)| face.id)
            .collect()
    }

    /// The landed faces in id order: a landed state's positions.
    pub fn landed_faces(&self) -> Vec<FaceId> {
        let (parts, _) = self.block.prepared.landed();
        parts.faces.iter().map(|f| f.id).collect()
    }

    /// What it moves, as a plain fold's analysis reads.
    pub fn analysis(&self) -> &FoldAnalysis {
        &self.analysis
    }

    /// The pairs pinned to the parent's order because the completion left
    /// them open with neither face moving (see the module docs): a guard
    /// that the corpus shows never fires.
    pub fn pins(&self) -> &[[FaceId; 2]] {
        &self.pins
    }

    /// Land the order `choice` names, one listed order per component, and
    /// what its step stores.
    pub fn pick(&self, choice: &[usize]) -> Result<SolvedFolded, FoldRefusal> {
        let no_such = || FoldRefusal::NoSuchChoice {
            choice: choice.to_vec(),
        };
        let order = self.completions.order(choice).ok_or_else(no_such)?;
        let mut pairs = if self.completions.is_unique() {
            Vec::new()
        } else {
            self.completions.chosen_pairs(choice).ok_or_else(no_such)?
        };
        pairs.extend_from_slice(&self.pins);
        let stored = if pairs.is_empty() {
            None
        } else {
            Some(
                self.block
                    .prepared
                    .stored(&pairs)
                    .ok_or_else(|| FoldRefusal::Internal {
                        message: "a chosen pair names a face with no witness".to_string(),
                    })?,
            )
        };
        let folded = self.block.prepared.land(order)?;
        Ok(SolvedFolded {
            folded: plain_folded(&self.analysis, folded),
            stored,
        })
    }
}

impl State {
    /// Every order the plain fold `op` of the seed's material-connected
    /// flaps can land in, per part (see the module docs). `op.placement` and
    /// `op.closure` are not read: the block is the seed's flaps whatever the
    /// closure would add.
    pub fn fold_orders(
        &self,
        op: &PlainFold,
        limits: &CompletionLimits,
    ) -> Result<FoldOrders, Unlisted> {
        let block = self
            .selection_block(&as_tuck(op))
            .map_err(|refused| Unlisted::Unfinished(Unfinished::Prepare(refused)))?;
        let completions = match block.prepared.complete(&[], limits) {
            Ok(completions) => completions,
            Err(refusal) => return Err(unlisted(refusal)),
        };
        let mut orders = FoldOrders {
            analysis: solved_analysis(&block),
            completions,
            block,
            pins: Vec::new(),
        };
        let pins = orders.unmoved_pairs(self);
        if !pins.is_empty() {
            orders.block.prepared.place(pins.iter().copied());
            orders.completions = match orders.block.prepared.complete(&[], limits) {
                Ok(completions) => completions,
                Err(refusal) => return Err(unlisted(refusal)),
            };
            orders.pins = pins;
        }
        if !orders.completions.count().exact {
            return Err(Unlisted::Unfinished(Unfinished::Truncated));
        }
        // The completion searches around the moving faces only; the gate checks
        // everything. A fold with one order is landed here, so one the gate
        // refuses is no order at all rather than a choice that cannot land.
        if orders.completions.is_unique()
            && let Err(refusal) = orders.pick(&vec![0; orders.completions.components().len()])
        {
            return Err(Unlisted::NoOrder(refusal.into()));
        }
        Ok(orders)
    }

    /// Replay a solved landing: the same block, the stored pairs fixed,
    /// exactly one order (see the module docs). With nothing stored, the
    /// block must have one order of its own.
    pub fn fold_solved(
        &self,
        op: &PlainFold,
        stored: Option<&WitnessOrder>,
        limits: &CompletionLimits,
    ) -> Result<Folded, CompoundRefused> {
        let block = self
            .selection_block(&as_tuck(op))
            .map_err(CompoundRefused::Refused)?;
        let analysis = solved_analysis(&block);
        let folded = match stored {
            Some(stored) => block
                .prepared
                .replay(stored, limits)
                .map_err(CompoundRefused::Broken)?,
            None => {
                let completions = block.prepared.complete(&[], limits).map_err(|refusal| {
                    CompoundRefused::Broken(crate::Broken::Completion { refusal })
                })?;
                if !completions.is_unique() {
                    return Err(CompoundRefused::Broken(crate::Broken::NotUnique {
                        orders: completions.count(),
                    }));
                }
                let order = completions
                    .order(&vec![0; completions.components().len()])
                    .ok_or(CompoundRefused::Broken(crate::Broken::NotUnique {
                        orders: completions.count(),
                    }))?;
                block
                    .prepared
                    .land(order)
                    .map_err(|refusal| CompoundRefused::Broken(crate::Broken::Gate { refusal }))?
            }
        };
        Ok(plain_folded(&analysis, folded))
    }

    /// What a solved fold moves, as a plain fold's analysis reads, before it
    /// lands.
    pub fn analyse_solved(&self, op: &PlainFold) -> Result<FoldAnalysis, Refused> {
        let block = self.selection_block(&as_tuck(op))?;
        Ok(solved_analysis(&block))
    }
}

impl FoldOrders {
    /// The pairs of every component with no moving face, `[upper, lower]`
    /// as the parent orders their faces (see the module docs).
    fn unmoved_pairs(&self, parent: &State) -> Vec<[FaceId; 2]> {
        let (parts, blocks) = self.block.prepared.landed();
        let position = |id: FaceId| parts.faces.binary_search_by_key(&id, |f| f.id).ok();
        let moves = |id: FaceId| position(id).is_some_and(|at| blocks[at].is_some());
        // A landed face that stays is a parent face or a piece of one.
        let parent_of = |id: FaceId| match parent.face(id) {
            Some(_) => Some(id),
            None => position(id).and_then(|at| parts.faces[at].parent),
        };
        let mut pins = Vec::new();
        for component in self.completions.components() {
            if component
                .pairs
                .iter()
                .any(|p| p.faces().iter().any(|&f| moves(f)))
            {
                continue;
            }
            for pair in &component.pairs {
                let [lo, hi] = pair.faces();
                let (Some(a), Some(b)) = (parent_of(lo), parent_of(hi)) else {
                    continue;
                };
                match parent.above(a, b) {
                    Some(true) => pins.push([lo, hi]),
                    Some(false) => pins.push([hi, lo]),
                    None => {}
                }
            }
        }
        pins
    }
}

/// The tuck the plain fold's line, side, direction and seed name, its target
/// unread: [`State::selection_block`]'s question.
fn as_tuck(op: &PlainFold) -> TuckFold {
    TuckFold {
        line: op.line,
        side: op.side,
        direction: op.direction,
        seed: op.seed.clone(),
        target: [0.0, 0.0],
        additional_targets: Vec::new(),
    }
}

fn unlisted(refusal: CompletionRefusal) -> Unlisted {
    match refusal {
        CompletionRefusal::BudgetExceeded { .. } => {
            Unlisted::Unfinished(Unfinished::Budget(no_order(refusal)))
        }
        // A defect or an undecidable overlap says nothing about the fold's
        // orders: the recipe search may still land it.
        CompletionRefusal::InvalidProblem { .. } | CompletionRefusal::AmbiguousOverlap { .. } => {
            Unlisted::Unfinished(Unfinished::Prepare(no_order(refusal).into()))
        }
        refusal => Unlisted::NoOrder(no_order(refusal).into()),
    }
}

/// The block's analysis, as a plain fold's reads: every flap the seed names
/// picked, none added.
fn solved_analysis(block: &SelectionBlock) -> FoldAnalysis {
    let picked = block
        .flaps
        .iter()
        .enumerate()
        .filter(|(_, flap)| {
            flap.faces
                .iter()
                .any(|f| block.moving.binary_search(f).is_ok())
        })
        .map(|(k, _)| k)
        .collect();
    FoldAnalysis {
        line: block.line,
        side: block.side,
        snap: block.snap,
        direction: block.direction,
        flaps: block.flaps.clone(),
        picked,
        added: Vec::new(),
        moving: block.moving.clone(),
    }
}

/// A landed block as a plain fold's landing reads.
fn plain_folded(analysis: &FoldAnalysis, folded: CompoundFolded) -> Folded {
    let report = folded.report;
    let mut moving: Vec<FaceId> = report.blocks.into_iter().flatten().collect();
    moving.sort_unstable();
    // The block lies outside what stays — above it for a valley, below for a
    // mountain — unless some face that stays lies beyond a moving one.
    let on_top = analysis.direction == crate::view::Direction::Valley;
    let state = &folded.state;
    let inserted = state.order().pairs().any(|(pair, lo_above)| {
        let [lo, hi] = pair.faces();
        let (Some(lo_above), lo_moves, hi_moves) = (
            lo_above,
            moving.binary_search(&lo).is_ok(),
            moving.binary_search(&hi).is_ok(),
        ) else {
            return false;
        };
        lo_moves != hi_moves && (lo_above == lo_moves) != on_top
    });
    Folded {
        state: folded.state,
        report: FoldReport {
            analysis: analysis.clone(),
            moving_faces: moving,
            created: report.created,
            unfolded: report.unfolded,
            refolded: report.refolded,
            split: report.split,
            inserted,
        },
        extent: None,
    }
}
