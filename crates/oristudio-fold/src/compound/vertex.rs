//! The vertex folds — squash, petal fold, rabbit ear and swivel (plan
//! Phase 11, research §5.3) — through the compound pipeline ([`super`]).
//!
//! Each is paper turned about a vertex where its creases meet, and lands the
//! same way:
//!
//! - **Its macro** scores the paper its creases cross (per layer for a
//!   squash, a fan of rays for a rabbit ear or a swivel, nothing for a petal
//!   fold, whose creases are precreased) and puts every piece in a block by
//!   its *motion class*: the product of the reflections across the creases
//!   between it and the paper that stays. The hinge diff follows from those
//!   motions, so no macro lists the hinges it changes (research §5.1: a fan
//!   of rays does not say which).
//! - **The direction seed** puts every moving block above the paper that
//!   stays where they overlap, for a valley as the model frame sees it, or
//!   below it for a mountain. Pairs across blocks are left to the
//!   completion ([`super::Across::Free`]). With it the spike found every
//!   squash and petal unique; a rabbit ear needs its ridge too.
//! - **Choices** are the completion's, stored as the pairs they decided,
//!   keyed by witnesses (plan D6), and replayed.
//! - **The motion** (plan D15) turns each block about its creases in
//!   stages, one half turn per crease (`StepMotion::staged`): visual, with
//!   the parent and the landed state as its exact ends.

use oristudio_geometry::Line;
use serde::{Deserialize, Serialize};

use crate::complete::{ChoiceCount, CompletionLimits, Completions, FixedKind, FixedPair};
use crate::compound::motion::{MotionKind, StagedBlock, StepMotion, reflection};
use crate::compound::pieces::{Pieces, Scoring, prepare_pieces};
use crate::compound::{
    Across, Against, CompoundFolded, CompoundRefused, CompoundReport, Pending, Prepared, no_order,
};
use crate::isometry::Isometry;
use crate::pattern::FaceId;
use crate::refusal::{Fix, FoldRefusal, Refused};
use crate::state::State;
use crate::view::Direction;
use crate::witness::{Broken, BrokenWitness};

type Point = [f64; 2];

/// Which vertex fold a step makes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VertexFoldKind {
    Squash,
    Petal,
    RabbitEar,
    Swivel,
}

/// A vertex fold's choices as a step stores them (plan D6).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct VertexChoices {
    /// The pairs the completion left free, as they were chosen: empty when
    /// the fold had one order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub completion: Vec<PairChoice>,
}

/// One free pair of a completion as a step stores it (plan D6, the Fold
/// document's `FoldPairChoice`): the face holding the sheet point `above`
/// lies above the face holding `below`, in the model frame. The model frame
/// is the parent's (what stays keeps its isometry), so the pair reads the
/// same on every replay.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct PairChoice {
    pub above: Point,
    pub below: Point,
}

/// What a vertex fold did.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VertexReport {
    pub kind: VertexFoldKind,
    /// Where its creases meet, in the parent's model frame: the squash's
    /// vertex, the petal fold's two ends of its line, the rabbit ear's
    /// incenter, the swivel's vertex.
    pub vertices: Vec<Point>,
    /// The lines its blocks turn about, in the parent's model frame.
    pub creases: Vec<Line>,
    /// The direction in the model frame.
    pub direction: Direction,
    #[serde(flatten)]
    pub fold: CompoundReport,
    /// The animation's legs (plan D15).
    pub motion: StepMotion,
    /// What the step stores: the order chosen among several.
    pub stored: VertexChoices,
}

/// A landed vertex fold.
#[derive(Debug, Clone)]
pub struct VertexFolded {
    pub state: State,
    pub report: VertexReport,
}

/// A vertex fold whose completion left more than one order (plan D4).
#[derive(Debug, Clone)]
pub struct VertexChoice {
    pending: Pending,
    context: Context,
}

impl VertexChoice {
    /// Every order there is to choose from, per independent component.
    pub fn completions(&self) -> &Completions {
        &self.pending.completions
    }

    /// The true ‹ n of m ›.
    pub fn count(&self) -> ChoiceCount {
        self.pending.completions.count()
    }

    /// Land the order `choice` names (one listed order per component); the
    /// report's `stored` holds what the step stores for it: the pairs it
    /// decided beyond the forced ones, by witnesses.
    pub fn pick(&self, choice: &[usize]) -> Result<VertexFolded, FoldRefusal> {
        let completions = &self.pending.completions;
        let prepared = &self.pending.prepared;
        let no_such = || FoldRefusal::NoSuchChoice {
            choice: choice.to_vec(),
        };
        let order = completions.order(choice).ok_or_else(no_such)?;
        let witness = |f| {
            prepared
                .unordered
                .face_witness(f)
                .ok_or_else(|| FoldRefusal::Internal {
                    message: "a chosen pair names a face with no witness".to_string(),
                })
        };
        let completion = completions
            .chosen_pairs(choice)
            .ok_or_else(no_such)?
            .into_iter()
            .map(|[upper, lower]| {
                Ok(PairChoice {
                    above: witness(upper)?,
                    below: witness(lower)?,
                })
            })
            .collect::<Result<Vec<_>, FoldRefusal>>()?;
        Ok(self.context.report(prepared.land(order)?, completion))
    }
}

/// Where a vertex fold got to.
#[derive(Debug, Clone)]
pub enum VertexOutcome {
    Landed(Box<VertexFolded>),
    /// More than one order fits: pick one.
    ChooseOrder(Box<VertexChoice>),
}

/// A vertex fold compiled (step 1): its paper scored, every piece in a
/// block, and how each block turns.
#[derive(Debug, Clone)]
pub(crate) struct Compiled {
    pub(crate) kind: VertexFoldKind,
    pub(crate) scoring: Scoring,
    /// Per scored face, its block; none for a face that stays.
    pub(crate) block_of: Vec<Option<usize>>,
    /// Per block, its turns in the order they apply, each with its stage:
    /// the block's motion is the product of their reflections, the last
    /// outermost.
    pub(crate) turns: Vec<Vec<(usize, Line)>>,
    pub(crate) vertices: Vec<Point>,
    /// The direction in the model frame.
    pub(crate) direction: Direction,
    /// More seeds, `[upper, lower]` by scored face position: a rabbit
    /// ear's ridge.
    pub(crate) extra: Vec<[usize; 2]>,
}

impl Compiled {
    /// Block `b`'s motion: its turns' reflections composed.
    fn motion(&self, b: usize) -> Isometry {
        self.turns[b]
            .iter()
            .fold(Isometry::IDENTITY, |m, (_, line)| {
                reflection(line).after(&m)
            })
    }

    /// Steps 2–7 with the direction seed: every block above (valley) or
    /// below (mountain) every face that stays, where they overlap; and the
    /// extra seeds.
    pub(crate) fn prepare(&self, state: &State) -> Result<Prepared, FoldRefusal> {
        let above = self.direction == Direction::Valley;
        let every: Vec<usize> = (0..state.faces().len()).collect();
        let mut prepared = prepare_pieces(
            state,
            Pieces {
                scoring: self.scoring.clone(),
                block_of: self.block_of.clone(),
                blocks: (0..self.turns.len()).map(|b| self.motion(b)).collect(),
                against: (0..self.turns.len())
                    .map(|block| Against {
                        block,
                        faces: every.clone(),
                        above,
                    })
                    .collect(),
                across: Across::Free,
            },
        )?;
        let faces = &self.scoring.faces;
        for &[upper, lower] in &self.extra {
            let (upper, lower) = (faces[upper].id, faces[lower].id);
            if prepared.unordered.problem().is_variable(upper, lower) {
                prepared.fixed.push(FixedPair {
                    upper,
                    lower,
                    kind: FixedKind::Seed,
                });
            }
        }
        Ok(prepared)
    }

    /// Whether at least one order fits: a search that stops at the first
    /// order of each component.
    pub(crate) fn lands(&self, state: &State, limits: &CompletionLimits) -> bool {
        let first = CompletionLimits {
            per_component: 1,
            ..*limits
        };
        self.prepare(state)
            .ok()
            .is_some_and(|prepared| prepared.complete(&[], &first).is_ok())
    }

    /// Land it: replay the stored order, or complete, landing the only
    /// order or offering the choice. A refusal for want of an order offers
    /// the other direction when `other` lands.
    pub(crate) fn land(
        &self,
        state: &State,
        choices: &VertexChoices,
        limits: &CompletionLimits,
        other: impl FnOnce() -> Option<Compiled>,
    ) -> Result<VertexOutcome, CompoundRefused> {
        let prepared = self
            .prepare(state)
            .map_err(|r| CompoundRefused::Refused(r.into()))?;
        let context = Context {
            kind: self.kind,
            vertices: self.vertices.clone(),
            turns: self.turns.clone(),
            direction: self.direction,
        };
        if !choices.completion.is_empty() {
            let folded =
                replay(&prepared, &choices.completion, limits).map_err(CompoundRefused::Broken)?;
            return Ok(VertexOutcome::Landed(Box::new(
                context.report(folded, choices.completion.clone()),
            )));
        }
        let completions = match prepared.complete(&[], limits) {
            Ok(completions) => completions,
            Err(refusal) => {
                let refusal = no_order(refusal);
                let mut fixes = Vec::new();
                if matches!(refusal, FoldRefusal::NoOrder { .. })
                    && other().is_some_and(|c| c.lands(state, limits))
                {
                    fixes.push(Fix::OppositeDirection);
                }
                return Err(CompoundRefused::Refused(Refused { refusal, fixes }));
            }
        };
        if completions.is_unique() {
            let order = completions
                .order(&vec![0; completions.components().len()])
                .ok_or_else(|| {
                    CompoundRefused::Refused(
                        FoldRefusal::Internal {
                            message: "a unique completion has no order".to_string(),
                        }
                        .into(),
                    )
                })?;
            let folded = prepared
                .land(order)
                .map_err(|r| CompoundRefused::Refused(r.into()))?;
            return Ok(VertexOutcome::Landed(Box::new(
                context.report(folded, Vec::new()),
            )));
        }
        Ok(VertexOutcome::ChooseOrder(Box::new(VertexChoice {
            pending: Pending {
                prepared,
                completions,
            },
            context,
        })))
    }
}

/// Replay a stored choice (plan D6): its witnesses resolved to the landed
/// faces, its pairs fixed beside the seeds, exactly one order, or broken. A
/// witness in no face, or two in one face, breaks it.
fn replay(
    prepared: &Prepared,
    completion: &[PairChoice],
    limits: &CompletionLimits,
) -> Result<CompoundFolded, Broken> {
    let unordered = &prepared.unordered;
    let mut named: Vec<(Point, FaceId)> = Vec::new();
    let mut resolve = |point: Point| -> Result<FaceId, Broken> {
        if let Some(&(_, face)) = named.iter().find(|(p, _)| *p == point) {
            return Ok(face);
        }
        let witness = named.len();
        let face = point
            .iter()
            .all(|c| c.is_finite())
            .then(|| unordered.face_at(point))
            .flatten()
            .ok_or(Broken::Witness {
                witness: BrokenWitness::NoFace { witness, point },
            })?;
        if let Some(other) = named.iter().position(|&(_, f)| f == face) {
            return Err(Broken::Witness {
                witness: BrokenWitness::SharedFace {
                    witnesses: [other, witness],
                },
            });
        }
        named.push((point, face));
        Ok(face)
    };
    let mut pairs = Vec::with_capacity(completion.len());
    for pair in completion {
        pairs.push(FixedPair {
            upper: resolve(pair.above)?,
            lower: resolve(pair.below)?,
            kind: FixedKind::Seed,
        });
    }
    let completions = prepared
        .complete(&pairs, limits)
        .map_err(|refusal| Broken::Completion { refusal })?;
    if !completions.is_unique() {
        return Err(Broken::NotUnique {
            orders: completions.count(),
        });
    }
    let order = completions
        .order(&vec![0; completions.components().len()])
        .ok_or(Broken::NotUnique {
            orders: completions.count(),
        })?;
    prepared
        .land(order)
        .map_err(|refusal| Broken::Gate { refusal })
}

/// What turns a landed compound fold into a vertex fold's report.
#[derive(Debug, Clone)]
struct Context {
    kind: VertexFoldKind,
    vertices: Vec<Point>,
    turns: Vec<Vec<(usize, Line)>>,
    direction: Direction,
}

impl Context {
    fn report(&self, folded: CompoundFolded, completion: Vec<PairChoice>) -> VertexFolded {
        let blocks: Vec<StagedBlock> = folded
            .report
            .blocks
            .iter()
            .zip(&self.turns)
            .map(|(faces, turns)| StagedBlock {
                faces: faces.clone(),
                turns: turns.clone(),
                at: faces
                    .first()
                    .and_then(|&f| folded.state.face_image(f))
                    .and_then(oristudio_geometry::convex::centroid)
                    .unwrap_or_default(),
            })
            .collect();
        let motion = StepMotion::staged(
            &blocks,
            self.direction == Direction::Valley,
            MotionKind::Visual,
        );
        let mut creases: Vec<Line> = Vec::new();
        for (_, line) in self.turns.iter().flatten() {
            if !creases.iter().any(|c| c.approx_eq(line)) {
                creases.push(*line);
            }
        }
        VertexFolded {
            state: folded.state,
            report: VertexReport {
                kind: self.kind,
                vertices: self.vertices.clone(),
                creases,
                direction: self.direction,
                fold: folded.report,
                motion,
                stored: VertexChoices { completion },
            },
        }
    }
}

/// The faces of `state` whose images contain the model point `p`, nearest
/// the side `direction` names first (the top for a valley, as the model
/// frame sees it): what a vertex fold's layers are counted from. None when
/// the order does not stack them, which a valid state never does.
pub(crate) fn stack_toward(state: &State, p: Point, direction: Direction) -> Option<Vec<usize>> {
    let mut stack = state.stack_at(p)?;
    if direction == Direction::Mountain {
        stack.reverse();
    }
    stack
        .into_iter()
        .map(|id| state.face_position(id))
        .collect()
}

/// Whether `f` lies on the side `direction` names of `g` (above for a
/// valley), where they overlap.
pub(crate) fn toward(state: &State, f: usize, g: usize, direction: Direction) -> Option<bool> {
    let faces = state.faces();
    state
        .above(faces[f].id, faces[g].id)
        .map(|above| above == (direction == Direction::Valley))
}

/// `v` scaled to unit length; none for a vector shorter than the tolerance
/// or one that is not finite.
pub(crate) fn unit(v: Point) -> Option<Point> {
    let length = v[0].hypot(v[1]);
    (length.is_finite() && length > crate::numerics::TOL).then(|| [v[0] / length, v[1] / length])
}

/// The signed angle from `a` to `b`, counter-clockwise positive, in
/// (−π, π].
pub(crate) fn angle_between(a: Point, b: Point) -> f64 {
    (a[0] * b[1] - a[1] * b[0]).atan2(a[0] * b[0] + a[1] * b[1])
}

/// `v` turned by `angle` radians, counter-clockwise.
pub(crate) fn rotate(v: Point, angle: f64) -> Point {
    let (s, c) = angle.sin_cos();
    [c * v[0] - s * v[1], s * v[0] + c * v[1]]
}

/// The z component of `a × b`.
pub(crate) fn cross(a: Point, b: Point) -> f64 {
    a[0] * b[1] - a[1] * b[0]
}

/// The model-frame centroid of scored face `a`: its sheet centroid through
/// the isometry of the parent face it came from.
pub(crate) fn piece_centroid(state: &State, scoring: &Scoring, a: usize) -> Option<Point> {
    let centroid = oristudio_geometry::convex::centroid(&scoring.polygon(a))?;
    Some(state.geometry().isometries[scoring.old[a]].apply(centroid))
}

/// Blocks with no pieces dropped, the rest renumbered in order.
pub(crate) fn drop_empty(
    block_of: &mut [Option<usize>],
    turns: Vec<Vec<(usize, Line)>>,
) -> Vec<Vec<(usize, Line)>> {
    let used: Vec<bool> = (0..turns.len())
        .map(|b| block_of.contains(&Some(b)))
        .collect();
    let mut renumber = vec![None; turns.len()];
    let mut kept = Vec::new();
    for (b, turn) in turns.into_iter().enumerate() {
        if used[b] {
            renumber[b] = Some(kept.len());
            kept.push(turn);
        }
    }
    for block in block_of.iter_mut() {
        *block = block.and_then(|b| renumber[b]);
    }
    kept
}
