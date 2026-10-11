//! The tuck (plan Phase 11, research §4.4 and §5.2): a plain fold slid
//! immediately under, or over, a named layer T, through the compound
//! pipeline ([`super`]).
//!
//! - **The direction names the placement.** As the viewer sees it, a valley
//!   tuck goes under its target and a mountain tuck over it: the flap turns
//!   toward T's side of the stack and stops against T.
//! - **What moves** is Beloch's bounded closure (ADR 0052): the seed, grown
//!   across every crease with an end on the moving side, and every
//!   moving-side layer the block would otherwise pass through on its way to
//!   T — for a valley tuck a layer above a moving piece that lies under every
//!   face of T it meets (or meets none), for a mountain tuck the mirror. The
//!   spike's hinges-only closure leaves such a layer inside the taco (its
//!   case 4d). T itself never moves: a seed or a crease that would take it
//!   is refused.
//! - **The order** reads "immediately under T" strictly (the spike's H1):
//!   pairs that stay are kept and the block turns over as one; the block lies
//!   under T; a layer G that meets T lies beyond T where it is under every
//!   face of T it meets, and the block then lies over G, and on T's side
//!   otherwise, the block under G (a mountain tuck, the mirror). A layer that
//!   meets no face of T is the completion's. Read loosely — the block against
//!   T alone — the order is not unique in 26% of the spike's feasible tucks;
//!   read strictly, it is in 99.1%.
//! - **The targets.** Only 40% of the layers a plain fold lands on take a
//!   tuck (research §5.2), so the engine lists them rather than let any be
//!   picked: [`State::analyse_tuck`] gives every layer the block lands on,
//!   each with whether it takes the tuck.
//!
//! The plain fold's own [`crate::Placement::Over`] and
//! [`crate::Placement::Under`] stay what they were: a closed-form placement
//! accepted only if the gate passes it (research §4.4).

use std::collections::VecDeque;

use oristudio_geometry::{Line, convex};
use oristudio_layer_order::{FacePair, Violation};
use serde::{Deserialize, Serialize};

use crate::complete::{ChoiceCount, CompletionLimits, Completions};
use crate::compound::motion::{MotionKind, StepMotion};
use crate::compound::{
    Across, CompoundFolded, CompoundRefused, CompoundReport, Macro, Pending, Prepared, no_order,
    prepare,
};
use crate::fold::closure::{MovingSide, moving_side, resolve_seed};
use crate::fold::line::{self, Axis, Classified};
use crate::fold::{
    ActionKind, FoldActionGeometry, FoldAnalysis, PlainFold, ResolvedSeed, Seed, Snap,
};
use crate::index::BoxIndex;
use crate::numerics::TOL;
use crate::pattern::FaceId;
use crate::refusal::{Fix, FoldRefusal, Refused, Side};
use crate::state::State;
use crate::view::Direction;
use crate::witness::WitnessOrder;

type Point = [f64; 2];

/// The most other targets a refusal tries, and offers, as its fixes.
const MAX_FIX_TARGETS_TRIED: usize = 8;
const MAX_FIX_TARGETS: usize = 3;

/// Which side of its target a tuck's block lands on, in the model frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TuckSide {
    Under,
    Over,
}

/// A tuck, named the way a step stores it (plan D6).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TuckFold {
    /// ℓ, in the parent's model frame.
    pub line: Line,
    /// The side of ℓ that moves.
    pub side: Side,
    /// As the viewer sees it: a valley tuck goes under its target, a
    /// mountain tuck over it.
    pub direction: Direction,
    /// What moves with the moving side, as a plain fold's seed.
    pub seed: Seed,
    /// A sheet point inside T, the layer the block lands against.
    pub target: Point,
}

/// A layer a tuck's block lands on.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TuckTarget {
    pub face: FaceId,
    /// An interior sheet point of it: what a step stores to name it.
    pub at: Point,
    /// Whether the block can lie immediately under (or over) it; none when
    /// the completion's budget ran out before it was decided.
    pub feasible: Option<bool>,
}

/// What a tuck moves and which layers it can be tucked against, before it
/// lands.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TuckAnalysis {
    /// The line folded along, after snapping, and its moving side.
    pub line: Line,
    pub side: Side,
    pub snap: Snap,
    /// The direction and the placement in the model frame.
    pub direction: Direction,
    pub placement: TuckSide,
    /// The parent's faces that move with a target the block does not reach
    /// into (most targets'), in id order.
    pub moving: Vec<FaceId>,
    /// Every layer the block lands on that stays, in id order.
    pub targets: Vec<TuckTarget>,
}

/// A tuck's choices as a step stores them (plan D6).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct TuckChoices {
    /// The pairs the completion left free, as they were chosen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<WitnessOrder>,
}

/// What a tuck did.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TuckReport {
    pub line: Line,
    pub side: Side,
    pub snap: Snap,
    /// The direction and the placement in the model frame.
    pub direction: Direction,
    pub placement: TuckSide,
    /// T, which stays (and keeps its id).
    pub target: FaceId,
    #[serde(flatten)]
    pub fold: CompoundReport,
    /// The animation's legs (plan D15): the block turning about ℓ.
    pub motion: StepMotion,
    /// What the step stores: the order chosen among several.
    pub stored: TuckChoices,
}

/// A landed tuck.
#[derive(Debug, Clone)]
pub struct TuckFolded {
    pub state: State,
    pub report: TuckReport,
}

/// A tuck whose completion left more than one order (plan D4).
#[derive(Debug, Clone)]
pub struct TuckChoice {
    pending: Pending,
    context: Context,
}

impl TuckChoice {
    /// Every order there is to choose from, per independent component.
    pub fn completions(&self) -> &Completions {
        &self.pending.completions
    }

    /// The true ‹ n of m ›.
    pub fn count(&self) -> ChoiceCount {
        self.pending.completions.count()
    }

    /// Land the order `choice` names (one listed order per component); the
    /// report's `stored` holds what the step stores for it.
    pub fn pick(&self, choice: &[usize]) -> Result<TuckFolded, FoldRefusal> {
        let (folded, order) = self.pending.pick(choice)?;
        Ok(self.context.report(folded, Some(order)))
    }
}

/// Where a tuck got to.
#[derive(Debug, Clone)]
pub enum TuckOutcome {
    Landed(Box<TuckFolded>),
    /// More than one order fits: pick one.
    ChooseOrder(Box<TuckChoice>),
}

/// What turns a landed compound fold into a tuck's report.
#[derive(Debug, Clone)]
struct Context {
    line: Line,
    side: Side,
    snap: Snap,
    direction: Direction,
    placement: TuckSide,
    target: FaceId,
}

impl Context {
    fn report(&self, folded: CompoundFolded, order: Option<WitnessOrder>) -> TuckFolded {
        let groups: Vec<(Vec<FaceId>, bool)> = folded
            .report
            .blocks
            .iter()
            .map(|faces| (faces.clone(), self.direction == Direction::Valley))
            .collect();
        let motion = StepMotion::half_turns(self.line, self.side, &groups, MotionKind::Visual);
        TuckFolded {
            state: folded.state,
            report: TuckReport {
                line: self.line,
                side: self.side,
                snap: self.snap,
                direction: self.direction,
                placement: self.placement,
                target: self.target,
                fold: folded.report,
                motion,
                stored: TuckChoices { order },
            },
        }
    }
}

/// A tuck's line, moving side and seed on a state, before its target.
struct Tuck {
    classified: Classified,
    side: MovingSide,
    /// In the model frame.
    direction: Direction,
    /// Seed face positions.
    seed: Vec<usize>,
    /// Per face position, its moving piece's box (an empty box for none).
    boxes: Vec<[f64; 4]>,
    index: BoxIndex,
}

impl Tuck {
    fn placement(&self) -> TuckSide {
        match self.direction {
            Direction::Valley => TuckSide::Under,
            Direction::Mountain => TuckSide::Over,
        }
    }

    fn under(&self) -> bool {
        self.placement() == TuckSide::Under
    }

    fn line(&self) -> Line {
        self.classified.axis.line_and_side().0
    }

    fn side(&self) -> Side {
        self.classified.axis.line_and_side().1
    }

    /// The faces that move for a tuck against the face at position `target`
    /// (or against no face yet, for the targets' listing), per face position
    /// (see the module docs). Refused when everything would move, or T
    /// would.
    fn closure(&self, state: &State, target: Option<usize>) -> Result<Vec<bool>, Refused> {
        let faces = state.faces();
        let target_moves =
            |f: usize| -> Refused { FoldRefusal::TuckTargetMoves { face: faces[f].id }.into() };
        let under = self.under();
        // Whether a moving-side layer lies on the near side of every face of
        // T it meets: under T for a valley tuck, over it for a mountain one.
        let short_of_target = |c: usize| match (target, &self.side.pieces[c]) {
            (Some(t), Some(piece)) => {
                convex::penetration(piece, &state.geometry().images[t]) <= TOL
                    || state.above(faces[c].id, faces[t].id) == Some(!under)
            }
            _ => true,
        };
        let mut moving = vec![false; faces.len()];
        let mut queue = VecDeque::new();
        for &f in &self.seed {
            if Some(f) == target {
                return Err(target_moves(f));
            }
            if !moving[f] {
                moving[f] = true;
                queue.push_back(f);
            }
        }
        while let Some(m) = queue.pop_front() {
            for &p in &self.side.adjacent[m] {
                if Some(p) == target {
                    return Err(target_moves(p));
                }
                if !moving[p] {
                    moving[p] = true;
                    queue.push_back(p);
                }
            }
            let Some(piece_m) = &self.side.pieces[m] else {
                continue;
            };
            for c in self.index.query(&self.boxes[m], TOL) {
                if moving[c] || Some(c) == target {
                    continue;
                }
                let Some(piece_c) = &self.side.pieces[c] else {
                    continue;
                };
                if convex::penetration(piece_c, piece_m) <= TOL {
                    continue;
                }
                let Some(above) = state.above(faces[c].id, faces[m].id) else {
                    return Err(FoldRefusal::LayerOrder {
                        violations: FacePair::new(faces[c].id, faces[m].id)
                            .map(|pair| Violation::MissingPair { pair })
                            .into_iter()
                            .collect(),
                    }
                    .into());
                };
                // The block turns toward the layers above it for a valley:
                // those it would pass on its way to T come along.
                if above == under && short_of_target(c) {
                    moving[c] = true;
                    queue.push_back(c);
                }
            }
        }
        let stays = |f: usize| {
            state.faces()[f]
                .ring
                .iter()
                .any(|v| self.classified.classes[v.index()] == -1)
        };
        if (0..faces.len()).all(|f| moving[f] && !stays(f)) {
            let fixes = if self.side.flaps.len() > 1 {
                vec![Fix::PickFlap {
                    flaps: self.side.flaps.clone(),
                }]
            } else {
                Vec::new()
            };
            return Err(Refused {
                refusal: FoldRefusal::NothingStays,
                fixes,
            });
        }
        Ok(moving)
    }

    /// The compound fold of `moving`, through the pipeline's steps 2–7: one
    /// block reflected across ℓ, placed by [`placements`] afterwards.
    fn prepare(&self, state: &State, moving: &[bool]) -> Result<Prepared, FoldRefusal> {
        prepare(
            state,
            &Macro {
                line: self.classified.clone(),
                block_of: moving.iter().map(|&m| m.then_some(0)).collect(),
                blocks: vec![self.classified.axis.reflection()],
                against: Vec::new(),
                across: Across::Keep,
            },
        )
    }

    /// Whether the face at position `f` stays whole and the block, landed,
    /// lies over it somewhere: a layer it could be tucked against.
    fn lands_on(&self, state: &State, moving: &[bool], f: usize) -> bool {
        if moving[f] {
            return false;
        }
        let reflection = self.classified.axis.reflection();
        let image = &state.geometry().images[f];
        (0..moving.len()).filter(|&m| moving[m]).any(|m| {
            self.side.pieces[m].as_ref().is_some_and(|piece| {
                let landed: Vec<Point> = piece.iter().rev().map(|&p| reflection.apply(p)).collect();
                convex::penetration(&landed, image) > TOL
            })
        })
    }
}

/// The strict placements of a tuck against `target` (see the module docs),
/// each as `[upper, lower]` over the landed faces of `prepared`: the block
/// against T, and against every layer that meets T, by which side of T it
/// is on.
fn placements(state: &State, prepared: &Prepared, target: FaceId, under: bool) -> Vec<[FaceId; 2]> {
    let unordered = prepared.unordered();
    let landed = &unordered.parts().faces;
    let blocks = prepared.blocks_of();
    let problem = unordered.problem();
    let position = |id: FaceId| landed.binary_search_by_key(&id, |f| f.id).ok();
    // A stationary landed face is a parent face or the piece of one the
    // score split; either way it stands where that parent face stood.
    let parent_of = |at: usize| {
        let face = &landed[at];
        if state.face(face.id).is_some() {
            face.id
        } else {
            face.parent.unwrap_or(face.id)
        }
    };
    let mut out = Vec::new();
    for pair in problem.variables() {
        let (Some(a), Some(b)) = (position(pair.lo()), position(pair.hi())) else {
            continue;
        };
        let (block, other) = match (blocks[a], blocks[b]) {
            (Some(_), None) => (a, b),
            (None, Some(_)) => (b, a),
            _ => continue,
        };
        let g = landed[other].id;
        let beyond = if g == target {
            false
        } else if problem.is_variable(g, target) {
            match state.above(parent_of(other), target) {
                Some(above) => above != under,
                None => continue,
            }
        } else {
            continue;
        };
        // Under T: over a layer beyond T, under one on T's side and under T
        // itself; over T, the mirror.
        let block_above = beyond == under;
        let block = landed[block].id;
        out.push(if block_above { [block, g] } else { [g, block] });
    }
    out
}

impl State {
    /// What a tuck would move and every layer its block lands on, each with
    /// whether the block can lie immediately under (over) it, without
    /// folding. `op.target` is not read.
    pub fn analyse_tuck(
        &self,
        op: &TuckFold,
        limits: &CompletionLimits,
    ) -> Result<TuckAnalysis, Refused> {
        let tuck = self.tuck(op)?;
        let open = tuck.closure(self, None)?;
        // A target with no paper on the moving side is not met by the
        // closure, so its moving set is the open one; a target that crosses
        // ℓ keeps the layers above it (below it) out, so it is grown its own.
        let mut groups: Vec<(Vec<bool>, Vec<usize>)> = vec![(open.clone(), Vec::new())];
        for f in 0..self.faces().len() {
            let moving = if tuck.side.pieces[f].is_some() {
                match tuck.closure(self, Some(f)) {
                    Ok(moving) => moving,
                    Err(_) => continue,
                }
            } else {
                open.clone()
            };
            if !tuck.lands_on(self, &moving, f) {
                continue;
            }
            match groups.iter_mut().find(|(set, _)| *set == moving) {
                Some((_, targets)) => targets.push(f),
                None => groups.push((moving, vec![f])),
            }
        }
        let under = tuck.under();
        let mut targets = Vec::new();
        for (moving, faces) in groups.iter().filter(|(_, faces)| !faces.is_empty()) {
            // One geometry per moving set, placed against each target.
            let prepared = tuck.prepare(self, moving).ok();
            for &f in faces {
                let id = self.faces()[f].id;
                let feasible = match &prepared {
                    Some(prepared) => {
                        prepared.lands_placed(placements(self, prepared, id, under), limits)
                    }
                    None => Some(false),
                };
                if let Some(at) = self.face_witness(id) {
                    targets.push(TuckTarget {
                        face: id,
                        at,
                        feasible,
                    });
                }
            }
        }
        targets.sort_by_key(|t| t.face);
        Ok(TuckAnalysis {
            line: tuck.line(),
            side: tuck.side(),
            snap: tuck.classified.snap,
            direction: tuck.direction,
            placement: tuck.placement(),
            moving: (0..open.len())
                .filter(|&f| open[f])
                .map(|f| self.faces()[f].id)
                .collect(),
            targets,
        })
    }

    /// A tuck, with its stored choices (empty for a new step), under the
    /// default completion limits.
    pub fn tuck_fold(
        &self,
        op: &TuckFold,
        choices: &TuckChoices,
    ) -> Result<TuckOutcome, CompoundRefused> {
        self.tuck_fold_within(op, choices, &CompletionLimits::default())
    }

    /// [`State::tuck_fold`] under `limits`. A tuck no order fits is refused
    /// naming T and the faces the conflict traces to, with the targets near
    /// it that take the tuck; a stored choice that no longer resolves is
    /// [`CompoundRefused::Broken`].
    pub fn tuck_fold_within(
        &self,
        op: &TuckFold,
        choices: &TuckChoices,
        limits: &CompletionLimits,
    ) -> Result<TuckOutcome, CompoundRefused> {
        let refused = |r: Refused| CompoundRefused::Refused(r);
        let tuck = self.tuck(op).map_err(refused)?;
        let target = self
            .face_at(op.target)
            .and_then(|id| self.face_position(id))
            .ok_or(FoldRefusal::WitnessNotInFace { point: op.target })
            .map_err(|r| refused(r.into()))?;
        let target_id = self.faces()[target].id;
        let moving = tuck.closure(self, Some(target)).map_err(refused)?;
        let under = tuck.under();
        let mut prepared = tuck.prepare(self, &moving).map_err(|r| refused(r.into()))?;
        let unplaced = prepared.clone();
        prepared.place(placements(self, &prepared, target_id, under));
        let context = Context {
            line: tuck.line(),
            side: tuck.side(),
            snap: tuck.classified.snap,
            direction: tuck.direction,
            placement: tuck.placement(),
            target: target_id,
        };
        if let Some(stored) = &choices.order {
            let folded = prepared
                .replay(stored, limits)
                .map_err(CompoundRefused::Broken)?;
            return Ok(TuckOutcome::Landed(Box::new(
                context.report(folded, Some(stored.clone())),
            )));
        }
        let completions = match prepared.complete(&[], limits) {
            Ok(completions) => completions,
            Err(refusal) => {
                return Err(refused(self.diagnose_tuck(
                    &tuck,
                    &moving,
                    &unplaced,
                    target,
                    no_order(refusal),
                    limits,
                )));
            }
        };
        if completions.is_unique() {
            let order = completions
                .order(&vec![0; completions.components().len()])
                .ok_or_else(|| {
                    refused(
                        FoldRefusal::Internal {
                            message: "a unique completion has no order".to_string(),
                        }
                        .into(),
                    )
                })?;
            let folded = prepared.land(order).map_err(|r| refused(r.into()))?;
            return Ok(TuckOutcome::Landed(Box::new(context.report(folded, None))));
        }
        Ok(TuckOutcome::ChooseOrder(Box::new(TuckChoice {
            pending: Pending {
                prepared,
                completions,
            },
            context,
        })))
    }

    /// The tuck's line classified, its moving side and its seed.
    fn tuck(&self, op: &TuckFold) -> Result<Tuck, Refused> {
        let classified =
            line::classify(&self.geometry().vertex_images, Axis::new(&op.line, op.side))?;
        let side = moving_side(self, &classified)?;
        let direction = self.view().model_direction(op.direction);
        let seed = resolve_seed(
            self,
            &side.pieces,
            direction,
            &ResolvedSeed::from(&op.seed),
            &classified.axis,
        )?;
        let boxes: Vec<[f64; 4]> = side
            .pieces
            .iter()
            .map(|p| convex::bounding_box(p.as_deref().unwrap_or(&[])))
            .collect();
        let index = BoxIndex::new(boxes.clone());
        Ok(Tuck {
            classified,
            side,
            direction,
            seed,
            boxes,
            index,
        })
    }

    /// A tuck against the face at `target` that no order fits: refused
    /// naming T and the faces the conflict traces to, offering the targets
    /// near T that the same moving set takes — the layers that meet T first.
    fn diagnose_tuck(
        &self,
        tuck: &Tuck,
        moving: &[bool],
        unplaced: &Prepared,
        target: usize,
        refusal: FoldRefusal,
        limits: &CompletionLimits,
    ) -> Refused {
        let FoldRefusal::NoOrder { faces } = refusal else {
            return refusal.into();
        };
        let target_id = self.faces()[target].id;
        let under = tuck.under();
        let mut near: Vec<usize> = (0..self.faces().len())
            .filter(|&f| f != target && tuck.lands_on(self, moving, f))
            .filter(|&f| {
                tuck.side.pieces[f].is_none()
                    || tuck
                        .closure(self, Some(f))
                        .is_ok_and(|other| other == moving)
            })
            .collect();
        near.sort_by_key(|&f| (self.above(self.faces()[f].id, target_id).is_none(), f));
        let fixes = near
            .into_iter()
            .take(MAX_FIX_TARGETS_TRIED)
            .filter(|&f| {
                let id = self.faces()[f].id;
                unplaced.lands_placed(placements(self, unplaced, id, under), limits) == Some(true)
            })
            .take(MAX_FIX_TARGETS)
            .filter_map(|f| {
                let face = self.faces()[f].id;
                Some(Fix::TuckTarget {
                    face,
                    at: self.face_witness(face)?,
                })
            })
            .collect();
        Refused {
            refusal: FoldRefusal::TuckInfeasible {
                target: target_id,
                placement: tuck.placement(),
                faces,
            },
            fixes,
        }
    }
}

// ---------------------------------------------------------------------------
// What the tools and the panes ask of a tuck beside landing it (plan D12,
// D14): what it moves against its target, the plain fold the depth picker
// previews the stacks of, and its picture. A tuck's geometry is a plain
// fold's of its block (one reflection across ℓ), so each reads as a plain
// fold's:
//
// - **What moves** is the bounded closure against T, the moving side's
//   flaps those of the plain fold along ℓ (which the chips number and a
//   refusal's fixes index), the ones the seed named picked and every other
//   flap the closure reaches added.
// - **The picture** is a plain fold's of the block: ℓ across the silhouette,
//   the spans where the block meets it, and the arrow from the block to where
//   it lands, under (or over) T.

impl TuckFold {
    /// The plain fold its line, side, direction and seed name: what the depth
    /// picker previews the stacks of, and whose flaps the layer picker shows.
    pub fn plain(&self) -> PlainFold {
        PlainFold::new(self.line, self.side, self.direction).with_seed(self.seed.clone())
    }
}

impl State {
    /// What the tuck `op` moves against its target, as a plain fold's
    /// analysis reads (see above). Refused as the tuck is before it lands: a
    /// target off the paper, a target that would move, nothing staying.
    pub fn analyse_tuck_fold(&self, op: &TuckFold) -> Result<FoldAnalysis, Refused> {
        let tuck = self.tuck(op)?;
        let target = self
            .face_at(op.target)
            .and_then(|id| self.face_position(id))
            .ok_or(FoldRefusal::WitnessNotInFace { point: op.target })?;
        let moving = tuck.closure(self, Some(target))?;
        let moving: Vec<FaceId> = (0..moving.len())
            .filter(|&f| moving[f])
            .map(|f| self.faces()[f].id)
            .collect();
        let (flaps, picked) = match self.analyse_fold(&op.plain()) {
            Ok(plain) => (plain.flaps, plain.picked),
            // The plain fold refused (its own closure would take T, say):
            // the moving side's flaps, every one of them named.
            Err(_) => {
                let flaps = tuck.side.flaps.clone();
                let picked = (0..flaps.len()).collect();
                (flaps, picked)
            }
        };
        let added = (0..flaps.len())
            .filter(|k| !picked.contains(k))
            .filter(|&k| {
                flaps[k]
                    .faces
                    .iter()
                    .any(|f| moving.binary_search(f).is_ok())
            })
            .collect();
        Ok(FoldAnalysis {
            line: tuck.line(),
            side: tuck.side(),
            snap: tuck.classified.snap,
            direction: tuck.direction,
            flaps,
            picked,
            added,
            moving,
        })
    }

    /// The picture of the tuck `op` on this state, before it lands (see
    /// above): no cover at the arrow's head yet.
    pub fn tuck_action(&self, op: &TuckFold) -> Result<FoldActionGeometry, Refused> {
        let analysis = self.analyse_tuck_fold(op)?;
        self.fold_action(&analysis, ActionKind::Fold, None)
    }
}

impl TuckReport {
    /// The landed tuck's picture on `parent`, the state it folded, with
    /// `landed`'s cover at the arrow's head when it is given.
    pub fn action(
        &self,
        parent: &State,
        landed: Option<&State>,
    ) -> Result<FoldActionGeometry, Refused> {
        let analysis = FoldAnalysis {
            line: self.line,
            side: self.side,
            snap: self.snap,
            direction: self.direction,
            flaps: Vec::new(),
            picked: Vec::new(),
            added: Vec::new(),
            moving: self.fold.moving.clone(),
        };
        parent.fold_action(&analysis, ActionKind::Fold, landed)
    }
}

impl TuckFolded {
    /// Its picture on `parent`, the state it folded, with the landed state's
    /// cover at the arrow's head.
    pub fn action(&self, parent: &State) -> Result<FoldActionGeometry, Refused> {
        self.report.action(parent, Some(&self.state))
    }
}
