//! Compound folds through one pipeline (plan D4, research §5.1).
//!
//! Every compound fold — the inside reverse fold now; the outside reverse,
//! crimp, tuck, squash, petal, rabbit ear, swivel and sinks later — compiles
//! to a `Macro` and lands through the same steps:
//!
//! 1. **Macro.** The operation's inputs become a score line, a partition of
//!    the faces that move into *blocks* (faces whose mutual stacking moves as
//!    one stack), each block's motion, and seeds.
//! 2. **Score** the block faces the line crosses, through the one split
//!    every fold shares (`fold::score`): one new vertex per crossed crease,
//!    the line snapped and every vertex classified first (`fold::line`).
//! 3. **Hinge diff.** A crease folds where its two faces' new orientations
//!    differ and lies flat where they agree. That is the fold, unfold or
//!    toggle the declared motions imply, so a macro never lists hinges beside
//!    its motions and the two cannot disagree (a fan of rays does not say
//!    which hinges change; research §5.1). A new crease that would lie flat
//!    is refused.
//! 4. **Derive** the isometries from the stayer, the parent root's piece
//!    that stays, keeping its isometry.
//! 5. **Gate**: the residual and hinge consistency (`Unordered`), every face
//!    where its block's motion puts it, and the image–image guard (research
//!    §6) on every pair whose relative motion changed.
//! 6. **Carry** only the pairs whose faces both stay or are in one block:
//!    kept under a rotation, reversed under a reflection. Never because two
//!    isometries happen to be equal: every block of a reverse fold moves by
//!    the same reflection, yet the blocks keep their absolute order (§5.2).
//! 7. **Seed** the macro's placements (a block against named faces) and the
//!    pairs across blocks, by the macro's rule (`Across`).
//! 8. **Complete** the rest (`crate::complete`), searching only around the
//!    faces that moved.
//! 9. **Letters** from the order, and **validate** through `State::make`.
//!
//! Zero completions is a refusal that names the conflicting faces; exactly
//! one is the result; more than one is a choice, whose result is stored as
//! the pairs it decided, keyed by witnesses (plan D6), and replayed.

pub mod crimp;
pub mod motion;
pub mod reverse;
pub mod reverse_step;
pub mod tuck;

use std::collections::BTreeSet;

use oristudio_geometry::convex;
use oristudio_layer_order::{LayerOrder, Violation};
use serde::Serialize;
use thiserror::Error;

use crate::complete::{CompletionLimits, CompletionRefusal, Completions, FixedKind, FixedPair};
use crate::fold::Refold;
use crate::fold::apply::{deepest, thinner};
use crate::fold::line::Classified;
use crate::fold::score::{self, Piece};
use crate::isometry::Isometry;
use crate::numerics::{MIN_FEATURE, TOL};
use crate::pattern::{CreaseKind, EdgeId, FaceId, Letter};
use crate::refusal::{FoldRefusal, Refused};
use crate::state::{State, StateParts, Topology, ring_position};
use crate::unordered::Unordered;
use crate::witness::{Broken, WitnessOrder};

/// How the pairs of two faces in different blocks are ordered (step 7).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Across {
    /// As they were, in absolute terms: reverse folds and tucks (research
    /// §5.2, `crossBlock: "keep"`). Seeds, since the blocks' creases between
    /// them change.
    Keep,
    /// As they were between blocks that move alike; left to the seeds and
    /// the completion between blocks that move differently. A crimp's strip
    /// and tip: as two reverse folds, the second places the tip only against
    /// its own strip, and orders nothing else of the tip against the strip
    /// afresh.
    Alike,
}

/// A block placed against the pieces of some parent faces that stay: above
/// or below each one it overlaps once landed (step 7).
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Against {
    pub(crate) block: usize,
    /// Parent face positions; a face the score splits stands for its piece
    /// that stays.
    pub(crate) faces: Vec<usize>,
    pub(crate) above: bool,
}

/// A compound fold compiled (step 1).
#[derive(Debug, Clone)]
pub(crate) struct Macro {
    /// The score line, snapped, with every vertex classified: the blocks'
    /// pieces are on its positive side.
    pub(crate) line: Classified,
    /// Per parent face position, the block its piece on the line's positive
    /// side moves with (the whole face, when it has nothing on the negative
    /// side); none for a face that stays.
    pub(crate) block_of: Vec<Option<usize>>,
    /// Each block's motion in the parent's model frame: a face's isometry
    /// becomes `motion ∘ T`.
    pub(crate) blocks: Vec<Isometry>,
    pub(crate) against: Vec<Against>,
    pub(crate) across: Across,
}

impl Macro {
    /// Whether blocks `x` and `y` move by the same motion.
    fn alike(&self, x: usize, y: usize) -> bool {
        let (p, q) = (self.blocks[x].0, self.blocks[y].0);
        p.iter().zip(&q).all(|(a, b)| (a - b).abs() <= 1e-12)
    }
}

/// What a compound fold did, beside the state it landed.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CompoundReport {
    /// The parent's faces that move, in id order.
    pub moving: Vec<FaceId>,
    /// Per block, the landed state's faces in it, in id order.
    pub blocks: Vec<Vec<FaceId>>,
    /// The creases the score made.
    pub created: Vec<EdgeId>,
    /// Folded creases that lie flat now.
    pub unfolded: Vec<EdgeId>,
    /// Flat creases that fold again.
    pub refolded: Vec<Refold>,
    /// Folded creases whose letter turned, M↔V: a reverse fold's spine.
    pub reversed: Vec<EdgeId>,
    /// How many faces the score split.
    pub split: usize,
}

/// A landed compound fold.
#[derive(Debug, Clone)]
pub struct CompoundFolded {
    pub state: State,
    pub report: CompoundReport,
}

/// Why a compound fold did not land.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(rename_all = "snake_case", tag = "stage")]
pub enum CompoundRefused {
    /// The fold cannot land as asked: a refusal with the fixes that would
    /// (plan D14).
    #[error("{0}")]
    Refused(Refused),
    /// A stored choice no longer resolves (plan D6): the step, and its
    /// subtree, are broken.
    #[error("{0}")]
    Broken(Broken),
}

/// A compound fold with everything but its order decided (steps 2–7).
#[derive(Debug, Clone)]
pub(crate) struct Prepared {
    unordered: Unordered,
    fixed: Vec<FixedPair>,
    /// Where `fixed`'s placements start: every pair from there on puts a
    /// block against paper it lands on, the rest are carried or across.
    placed: usize,
    /// Per landed face position, its block; none for a face that stays.
    block_of: Vec<Option<usize>>,
    blocks: usize,
    moving: Vec<FaceId>,
    created: Vec<EdgeId>,
    unfolded: Vec<EdgeId>,
    /// Flat creases folding again: their position and remembered letter.
    refolds: Vec<(usize, Letter)>,
    /// Folded creases whose letter the order decides again: their position
    /// and the letter they had.
    relettered: Vec<(usize, Letter)>,
    split: usize,
}

/// Steps 2–7 of `m` on `state`, as its next step.
pub(crate) fn prepare(state: &State, m: &Macro) -> Result<Prepared, FoldRefusal> {
    let parts = state.parts();
    let classes = &m.line.classes;
    let nf = parts.faces.len();
    let has = |f: usize, class: i8| {
        parts.faces[f]
            .ring
            .iter()
            .any(|v| classes[v.index()] == class)
    };
    if let Some(f) = (0..nf).find(|&f| m.block_of[f].is_some() && !has(f, 1)) {
        return Err(FoldRefusal::DegenerateSplit {
            face: parts.faces[f].id,
        });
    }

    // 2. Score: a block face the line crosses keeps its positive piece in
    // the block; the rest of it stays.
    let split: Vec<bool> = (0..nf)
        .map(|f| m.block_of[f].is_some() && has(f, -1))
        .collect();
    let scored = score::score(
        parts,
        state.topology(),
        classes,
        &m.line.distances,
        &split,
        state.step() + 1,
        state.next_ids(),
    )?;
    let block_of: Vec<Option<usize>> = scored
        .faces
        .iter()
        .map(|s| match s.piece {
            Piece::Negative => None,
            Piece::Whole | Piece::Positive => m.block_of[s.old],
        })
        .collect();
    prepare_scored(
        state,
        m,
        Scoring {
            scored,
            block_of,
            split,
        },
    )
}

/// What a macro's score made of the parent: its own line's (`prepare`), or
/// more than one line's, such as a crimp's two.
pub(crate) struct Scoring {
    /// The parts after every score, each face's `old` its parent face, the
    /// chords last.
    pub(crate) scored: score::Scored,
    /// Per scored face position, its block; none for a face that stays.
    pub(crate) block_of: Vec<Option<usize>>,
    /// Per parent face position, whether a score split it.
    pub(crate) split: Vec<bool>,
}

/// Steps 3–7 of `m` on `state` once it is scored. `m.line` is not read: the
/// scoring is the macro's own.
pub(crate) fn prepare_scored(
    state: &State,
    m: &Macro,
    scoring: Scoring,
) -> Result<Prepared, FoldRefusal> {
    let Scoring {
        scored,
        block_of,
        split,
    } = scoring;
    let parts = state.parts();
    let geometry = state.geometry();
    let nf = parts.faces.len();
    let step = state.step() + 1;
    let predicted: Vec<Isometry> = scored
        .faces
        .iter()
        .zip(&block_of)
        .map(|(s, block)| {
            let old = geometry.isometries[s.old];
            match block {
                Some(b) => m.blocks[*b].after(&old),
                None => old,
            }
        })
        .collect();
    let root = {
        let r = state
            .face_position(parts.root)
            .ok_or(FoldRefusal::UnknownRoot { face: parts.root })?;
        scored.child_of[r]
            .iter()
            .copied()
            .find(|&a| block_of[a].is_none())
            .or_else(|| block_of.iter().position(Option::is_none))
            .ok_or(FoldRefusal::NothingStays)?
    };
    let chords_from = scored.chords_from();
    let score::Scored {
        vertices,
        faces,
        child_of,
        creases,
        created,
        split: split_count,
    } = scored;
    let old_of: Vec<usize> = faces.iter().map(|s| s.old).collect();
    let mut next = StateParts {
        sheet: parts.sheet.clone(),
        vertices,
        creases,
        faces: faces.into_iter().map(|s| s.face).collect(),
        root: FaceId(0),
        root_isometry: geometry.isometries[old_of[root]],
        order: LayerOrder::new(),
        view: parts.view,
        step,
    };
    next.root = next.faces[root].id;
    let topology = Topology::build(&next)?;

    // 3. The hinge diff the motions imply.
    let mut unknown = Vec::new();
    let mut unfolded = Vec::new();
    let mut refolds = Vec::new();
    let mut relettered = Vec::new();
    for k in 0..next.creases.len() {
        let [f, g] = match topology.crease_faces[k][..] {
            [f, g] => [f, g],
            _ => continue,
        };
        let folds = predicted[f].front_up() != predicted[g].front_up();
        let crease = &mut next.creases[k];
        if k >= chords_from {
            if !folds {
                return Err(FoldRefusal::HingeOrientation {
                    edge: crease.id,
                    faces: [next.faces[f].id, next.faces[g].id],
                    kind: "folded",
                });
            }
            unknown.push(crease.id);
            continue;
        }
        match (crease.kind, folds) {
            (CreaseKind::Folded(letter), true) if block_of[f] != block_of[g] => {
                unknown.push(crease.id);
                relettered.push((k, letter));
            }
            (CreaseKind::Folded(letter), false) => {
                crease.kind = CreaseKind::Flat(letter);
                unfolded.push(crease.id);
            }
            (CreaseKind::Flat(letter), true) => {
                crease.kind = CreaseKind::Folded(letter);
                unknown.push(crease.id);
                refolds.push((k, letter));
            }
            _ => {}
        }
    }

    // 4–5. Derive from the stayer and gate the geometry.
    let ids: Vec<FaceId> = next.faces.iter().map(|f| f.id).collect();
    let touched: BTreeSet<FaceId> = (0..ids.len())
        .filter(|&a| block_of[a].is_some() || split[old_of[a]])
        .map(|a| ids[a])
        .collect();
    let focus: BTreeSet<FaceId> = (0..ids.len())
        .filter(|&a| block_of[a].is_some())
        .map(|a| ids[a])
        .collect();
    let rings: Vec<Vec<[f64; 2]>> = next
        .faces
        .iter()
        .map(|f| f.ring.iter().map(|v| next.vertices[v.index()]).collect())
        .collect();
    let unordered = Unordered::after(next, unknown, state, touched, focus)?;
    // The parts keep their id order, so positions are the scored ones.
    let landed = unordered.geometry();
    for (a, ring) in rings.iter().enumerate() {
        let residual = landed.isometries[a].distance_on(&predicted[a], ring.iter().copied());
        if residual > TOL || residual.is_nan() {
            return Err(FoldRefusal::PredictionMismatch {
                face: ids[a],
                residual,
            });
        }
    }
    let position = |id: FaceId| ids.binary_search(&id).ok();
    image_guard(state, &unordered, m, &block_of, &old_of, &position)?;
    if !unordered.problem().ambiguities().is_empty() {
        return Err(FoldRefusal::LayerOrder {
            violations: unordered
                .problem()
                .ambiguities()
                .iter()
                .map(|&ambiguity| Violation::AmbiguousOverlap { ambiguity })
                .collect(),
        });
    }

    // 6–7. Carry and seed.
    let problem = unordered.problem();
    let mut fixed = Vec::new();
    let pair = |upper: usize, lower: usize, kind: FixedKind| {
        problem
            .is_variable(ids[upper], ids[lower])
            .then_some(FixedPair {
                upper: ids[upper],
                lower: ids[lower],
                kind,
            })
    };
    for (old, lo_above) in state.order().pairs() {
        let Some(lo_above) = lo_above else {
            continue;
        };
        let (Some(f), Some(g)) = (state.face_position(old.lo()), state.face_position(old.hi()))
        else {
            continue;
        };
        for &a in &child_of[f] {
            for &b in &child_of[g] {
                let (a_above, kind) = match (block_of[a], block_of[b]) {
                    (None, None) => (lo_above, FixedKind::Carried),
                    // A block turns over under a reflection: its inner order
                    // reverses.
                    (Some(x), Some(y)) if x == y => {
                        (lo_above == m.blocks[x].front_up(), FixedKind::Carried)
                    }
                    (Some(x), Some(y)) => match m.across {
                        Across::Keep => (lo_above, FixedKind::Seed),
                        Across::Alike if m.alike(x, y) => (lo_above, FixedKind::Seed),
                        Across::Alike => continue,
                    },
                    _ => continue,
                };
                fixed.extend(if a_above {
                    pair(a, b, kind)
                } else {
                    pair(b, a, kind)
                });
            }
        }
    }
    let placed = fixed.len();
    for against in &m.against {
        let body: Vec<usize> = against
            .faces
            .iter()
            .flat_map(|&p| child_of[p].iter().copied())
            .filter(|&s| block_of[s].is_none())
            .collect();
        for a in (0..ids.len()).filter(|&a| block_of[a] == Some(against.block)) {
            for &s in &body {
                fixed.extend(if against.above {
                    pair(a, s, FixedKind::Seed)
                } else {
                    pair(s, a, FixedKind::Seed)
                });
            }
        }
    }

    let moving = (0..nf)
        .filter(|&f| m.block_of[f].is_some())
        .map(|f| parts.faces[f].id)
        .collect();
    unfolded.sort_unstable();
    Ok(Prepared {
        unordered,
        fixed,
        placed,
        block_of,
        blocks: m.blocks.len(),
        moving,
        created,
        unfolded,
        refolds,
        relettered,
        split: split_count,
    })
}

/// The image–image guard (plan D5, research §6): every pair whose relative
/// motion changed — a moving face against one that stays, and faces of two
/// blocks that move differently — that overlaps by more than the tolerance
/// but less than the minimum feature is a sliver, named by the moving vertex
/// deepest inside the other face and that face in the parent.
fn image_guard(
    state: &State,
    unordered: &Unordered,
    m: &Macro,
    block_of: &[Option<usize>],
    old_of: &[usize],
    position: &impl Fn(FaceId) -> Option<usize>,
) -> Result<(), FoldRefusal> {
    let geometry = unordered.geometry();
    for pair in unordered.problem().variables() {
        let (Some(a), Some(b)) = (position(pair.lo()), position(pair.hi())) else {
            continue;
        };
        let changed = match (block_of[a], block_of[b]) {
            (None, None) => false,
            (Some(x), Some(y)) => x != y && !m.alike(x, y),
            _ => true,
        };
        if !changed {
            continue;
        }
        let penetration = convex::penetration(&geometry.images[a], &geometry.images[b]);
        if penetration < MIN_FEATURE && penetration < thinner(geometry, a, b) - TOL {
            let (mover, other) = if block_of[a].is_some() {
                (a, b)
            } else {
                (b, a)
            };
            let (at, _) = deepest(&geometry.images[mover], &geometry.images[other]);
            let ring = &unordered.parts().faces[mover].ring;
            let front_up = geometry.isometries[mover].front_up();
            return Err(FoldRefusal::Sliver {
                vertex: ring[ring_position(at, ring.len(), front_up)],
                face: state.faces()[old_of[other]].id,
                penetration,
            });
        }
    }
    Ok(())
}

impl Prepared {
    /// Every order the carried pairs and the seeds allow, with `extra` fixed
    /// beside them (step 8).
    pub(crate) fn complete(
        &self,
        extra: &[FixedPair],
        limits: &CompletionLimits,
    ) -> Result<Completions, CompletionRefusal> {
        if extra.is_empty() {
            return self.unordered.complete(&self.fixed, limits);
        }
        let mut all = self.fixed.clone();
        all.extend_from_slice(extra);
        self.unordered.complete(&all, limits)
    }

    /// The fold with one order (step 9): letters derived, the gate passed.
    pub(crate) fn land(&self, order: LayerOrder) -> Result<CompoundFolded, FoldRefusal> {
        let state = self.unordered.state(order)?;
        Ok(self.folded(state))
    }

    /// Replay a stored choice (plan D6): its pairs fixed beside the seeds,
    /// exactly one order, or broken.
    pub(crate) fn replay(
        &self,
        stored: &WitnessOrder,
        limits: &CompletionLimits,
    ) -> Result<CompoundFolded, Broken> {
        let state = self.unordered.replay(stored, &self.fixed, limits)?;
        Ok(self.folded(state))
    }

    /// A choice's pairs, keyed by the landed faces' witnesses: what the step
    /// stores.
    pub(crate) fn stored(&self, pairs: &[[FaceId; 2]]) -> Option<WitnessOrder> {
        self.unordered.witness_order(pairs)
    }

    /// The landed parts, checked up to their order: what a macro reads to
    /// place its blocks by the landed geometry.
    pub(crate) fn unordered(&self) -> &Unordered {
        &self.unordered
    }

    /// Per landed face position, its block; none for a face that stays.
    pub(crate) fn blocks_of(&self) -> &[Option<usize>] {
        &self.block_of
    }

    /// Placements a macro decides from the landed geometry, beside the ones
    /// its `against` gives — a crimp's tip against its own strip, a tuck's
    /// block around its target: seeds in every completion and replay, turned
    /// with the rest by [`Prepared::lands_flipped`]. A pair of faces that do
    /// not overlap is left out.
    pub(crate) fn place(&mut self, pairs: impl IntoIterator<Item = [FaceId; 2]>) {
        let placed = self.seeds(pairs);
        self.fixed.extend(placed);
    }

    /// Whether the same fold placed another way — `pairs` in place of every
    /// placement it has, such as a tuck against another target — has an
    /// order; none when the budget ran out first.
    pub(crate) fn lands_placed(
        &self,
        pairs: impl IntoIterator<Item = [FaceId; 2]>,
        limits: &CompletionLimits,
    ) -> Option<bool> {
        let mut fixed = self.fixed[..self.placed].to_vec();
        fixed.extend(self.seeds(pairs));
        match self.unordered.complete(&fixed, &first(limits)) {
            Ok(_) => Some(true),
            Err(CompletionRefusal::BudgetExceeded { .. }) => None,
            Err(_) => Some(false),
        }
    }

    /// Pairs `[upper, lower]` as seeds, leaving out faces that do not
    /// overlap.
    fn seeds(&self, pairs: impl IntoIterator<Item = [FaceId; 2]>) -> Vec<FixedPair> {
        let problem = self.unordered.problem();
        pairs
            .into_iter()
            .filter(|&[upper, lower]| problem.is_variable(upper, lower))
            .map(|[upper, lower]| FixedPair {
                upper,
                lower,
                kind: FixedKind::Seed,
            })
            .collect()
    }

    /// Whether some order fits: a search that stops at the first order of
    /// each component.
    pub(crate) fn lands(&self, limits: &CompletionLimits) -> bool {
        self.unordered.complete(&self.fixed, &first(limits)).is_ok()
    }

    /// [`Prepared::lands`] for the same fold with every placement the other
    /// way round: the other kind of a reverse fold or a crimp, on the
    /// geometry already landed rather than scored and gated again, since
    /// neither its carry nor its pairs across blocks depend on the kind.
    pub(crate) fn lands_flipped(&self, limits: &CompletionLimits) -> bool {
        let mut fixed = self.fixed.clone();
        for pair in &mut fixed[self.placed..] {
            std::mem::swap(&mut pair.upper, &mut pair.lower);
        }
        self.unordered.complete(&fixed, &first(limits)).is_ok()
    }

    /// The landed state's faces in block `b`, in id order.
    fn block_faces(&self, b: usize) -> Vec<FaceId> {
        self.unordered
            .parts()
            .faces
            .iter()
            .zip(&self.block_of)
            .filter(|(_, block)| **block == Some(b))
            .map(|(f, _)| f.id)
            .collect()
    }

    fn folded(&self, state: State) -> CompoundFolded {
        let creases = state.creases();
        let letter = |k: usize| match creases.get(k).map(|c| c.kind) {
            Some(CreaseKind::Folded(letter)) => Some(letter),
            _ => None,
        };
        let refolded = self
            .refolds
            .iter()
            .filter_map(|&(k, remembered)| {
                Some(Refold {
                    edge: creases.get(k)?.id,
                    remembered,
                    letter: letter(k)?,
                })
            })
            .collect();
        let mut reversed: Vec<EdgeId> = self
            .relettered
            .iter()
            .filter(|&&(k, before)| letter(k).is_some_and(|now| now != before))
            .filter_map(|&(k, _)| creases.get(k).map(|c| c.id))
            .collect();
        reversed.sort_unstable();
        let report = CompoundReport {
            moving: self.moving.clone(),
            blocks: (0..self.blocks).map(|b| self.block_faces(b)).collect(),
            created: self.created.clone(),
            unfolded: self.unfolded.clone(),
            refolded,
            reversed,
            split: self.split,
        };
        CompoundFolded { state, report }
    }
}

/// A compound fold whose completion left more than one order (plan D4): the
/// orders to choose from, and the landing of each.
#[derive(Debug, Clone)]
pub(crate) struct Pending {
    pub(crate) prepared: Prepared,
    pub(crate) completions: Completions,
}

impl Pending {
    /// Land the order `choice` names (one listed order per component) and
    /// what the step stores for it: the pairs it decided beyond the forced
    /// ones, keyed by witnesses.
    pub(crate) fn pick(
        &self,
        choice: &[usize],
    ) -> Result<(CompoundFolded, WitnessOrder), FoldRefusal> {
        let no_such = || FoldRefusal::NoSuchChoice {
            choice: choice.to_vec(),
        };
        let order = self.completions.order(choice).ok_or_else(no_such)?;
        let pairs = self.completions.chosen_pairs(choice).ok_or_else(no_such)?;
        let stored = self
            .prepared
            .stored(&pairs)
            .ok_or_else(|| FoldRefusal::Internal {
                message: "a chosen pair names a face with no witness".to_string(),
            })?;
        Ok((self.prepared.land(order)?, stored))
    }
}

/// `limits` for a search that stops at the first order of each component:
/// whether a fold lands, not how.
pub(crate) fn first(limits: &CompletionLimits) -> CompletionLimits {
    CompletionLimits {
        per_component: 1,
        ..*limits
    }
}

/// A completion's refusal as a fold's: no order names the faces it traces
/// to; the rest are the budget or a defect.
pub(crate) fn no_order(refusal: CompletionRefusal) -> FoldRefusal {
    match refusal {
        CompletionRefusal::BudgetExceeded { limit, nodes } => {
            FoldRefusal::BudgetExceeded { limit, nodes }
        }
        CompletionRefusal::AmbiguousOverlap { ambiguities } => FoldRefusal::LayerOrder {
            violations: ambiguities
                .into_iter()
                .map(|ambiguity| Violation::AmbiguousOverlap { ambiguity })
                .collect(),
        },
        CompletionRefusal::FixedContradictory { pair } => FoldRefusal::NoOrder {
            faces: pair.faces().to_vec(),
        },
        CompletionRefusal::InvalidProblem { message } => FoldRefusal::Internal { message },
        refusal => FoldRefusal::NoOrder {
            faces: refusal.faces(),
        },
    }
}
