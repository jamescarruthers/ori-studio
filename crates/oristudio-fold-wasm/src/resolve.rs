//! A stored step's anchors, resolved in its parent (plan D6): sheet points to
//! their model-frame images, the line to the parent's model frame, the moving
//! side from a sheet point or the seed — into the engine's [`PlainFold`].
//!
//! Sheet points resolve with the boundary included: a free line's points are
//! often landmarks, and a landmark is a vertex or lies on a crease, where
//! several faces meet and their isometries agree within the gate's residual.
//! (`oristudio-fold`'s anchor module, on the axioms branch, gives the engine
//! the same rule as `State::resolve_point`; this switches to it when that
//! lands.)

use oristudio_fold::numerics::{MIN_FEATURE, TOL};
use oristudio_fold::{CreaseKind, Direction, PlainFold, Seed, Side, State};
use oristudio_geometry::{Line, convex};

use crate::wire::{
    AlongCrease, AlongLine, BridgeError, BridgeRefusal, LineInput, Motion, Point, SeedInput,
    Unsupported,
};

/// Why an op did not reach the engine.
#[derive(Debug, Clone, PartialEq)]
pub enum Rejection {
    /// The caller's mistake: thrown.
    Input(BridgeError),
    /// The parent cannot resolve it: a refusal.
    Refused(BridgeRefusal),
}

impl From<BridgeError> for Rejection {
    fn from(error: BridgeError) -> Rejection {
        Rejection::Input(error)
    }
}

impl From<BridgeRefusal> for Rejection {
    fn from(refusal: BridgeRefusal) -> Rejection {
        Rejection::Refused(refusal)
    }
}

/// A valley, mountain or precrease op as the engine's fold.
pub fn along_line(
    state: &State,
    op: &AlongLine,
    direction: Direction,
) -> Result<PlainFold, Rejection> {
    let (line, flipped) = match &op.line {
        LineInput::Free { through: [a, b] } => {
            let (a, b) = (image(state, *a)?, image(state, *b)?);
            if (b[0] - a[0]).hypot(b[1] - a[1]) < MIN_FEATURE {
                return Err(BridgeRefusal::DegenerateLine.into());
            }
            let line = Line::from_points(a, b).ok_or(BridgeRefusal::DegenerateLine)?;
            (line, false)
        }
        LineInput::Crease { at } => (crease(state, *at)?.0, false),
        LineInput::Model { line } => model_line(line)?,
        LineInput::Axiom {} => {
            return Err(BridgeRefusal::UnsupportedOp {
                feature: Unsupported::AxiomLine,
            }
            .into());
        }
    };
    plain(state, line, flipped, direction, &op.motion)
}

/// An unfold or refold op: a plain fold along the crease's line, which must
/// be folded (`folded`) or flat. The sheet's border is neither.
pub fn along_crease(state: &State, op: &AlongCrease, folded: bool) -> Result<PlainFold, Rejection> {
    let (line, kind) = crease(state, op.crease)?;
    let point = op.crease;
    match (folded, kind) {
        (true, CreaseKind::Folded(_)) | (false, CreaseKind::Flat(_)) => {}
        (true, _) => return Err(BridgeRefusal::CreaseNotFolded { point }.into()),
        (false, _) => return Err(BridgeRefusal::CreaseNotFlat { point }.into()),
    }
    plain(state, line, false, op.direction, &op.motion)
}

fn plain(
    state: &State,
    line: Line,
    flipped: bool,
    direction: Direction,
    motion: &Motion,
) -> Result<PlainFold, Rejection> {
    let seed = seed(&motion.seed)?;
    let side = match (motion.side, motion.moving) {
        (Some(_), Some(_)) => {
            return Err(BridgeError::InvalidInput(
                "give the moving side as `side` or as `moving`, not both".to_string(),
            )
            .into());
        }
        (Some(side), None) => {
            if flipped {
                side.opposite()
            } else {
                side
            }
        }
        (None, Some(p)) => side_at(state, &line, p)?,
        (None, None) => match &seed {
            Seed::Depth { at, .. } => side_at(state, &line, *at)?,
            Seed::Flaps { at } => match at.first() {
                Some(p) => side_at(state, &line, *p)?,
                None => return Err(BridgeRefusal::MovingSideMissing.into()),
            },
            Seed::All => return Err(BridgeRefusal::MovingSideMissing.into()),
        },
    };
    match &motion.placement {
        oristudio_fold::Placement::OnTop => {}
        oristudio_fold::Placement::Over { at } | oristudio_fold::Placement::Under { at } => {
            finite_point("placement.at", *at)?;
        }
    }
    Ok(PlainFold::new(line, side, direction)
        .with_seed(seed)
        .with_placement(motion.placement.clone())
        .with_closure(motion.closure))
}

/// The model-frame image of a sheet point anywhere on the paper.
pub fn image(state: &State, p: Point) -> Result<Point, Rejection> {
    finite_point("sheet point", p)?;
    let vertices = state.vertices();
    state
        .faces()
        .iter()
        .find(|face| {
            let polygon: Vec<Point> = face.ring.iter().map(|v| vertices[v.0 as usize]).collect();
            convex::boxes_overlap(
                &convex::bounding_box(&polygon),
                &[p[0], p[1], p[0], p[1]],
                TOL,
            ) && convex::contains_point(&polygon, p, -TOL)
        })
        .and_then(|face| state.isometry(face.id))
        .map(|t| t.apply(p))
        .ok_or(Rejection::Refused(BridgeRefusal::PointOffPaper {
            point: p,
        }))
}

/// The side of `line` the sheet point's image lies on.
fn side_at(state: &State, line: &Line, p: Point) -> Result<Side, Rejection> {
    let q = image(state, p)?;
    Side::of_point(line, q).ok_or(Rejection::Refused(BridgeRefusal::MovingSideOnLine {
        point: p,
    }))
}

/// The model-frame line of the crease whose sheet segment holds `at`, and
/// what the crease is.
fn crease(state: &State, at: Point) -> Result<(Line, CreaseKind), Rejection> {
    finite_point("crease point", at)?;
    let not_found = || Rejection::Refused(BridgeRefusal::CreaseNotFound { point: at });
    let crease = state.crease_at(at).ok_or_else(not_found)?;
    let line = state.crease_line(crease.id).ok_or_else(not_found)?;
    Ok((line, crease.kind))
}

/// A model line, validated and canonicalised, and whether canonicalising
/// reversed its normal (so a side given against it flips).
fn model_line(line: &Line) -> Result<(Line, bool), Rejection> {
    if !(line.n[0].is_finite() && line.n[1].is_finite() && line.d.is_finite()) {
        return Err(BridgeError::InvalidInput("line n and d must be finite".to_string()).into());
    }
    let canonical = Line::new(line.n, line.d)
        .ok_or_else(|| BridgeError::InvalidInput("the line's normal is zero".to_string()))?;
    let flipped = canonical.n[0] * line.n[0] + canonical.n[1] * line.n[1] < 0.0;
    Ok((canonical, flipped))
}

fn seed(seed: &SeedInput) -> Result<Seed, BridgeError> {
    Ok(match seed {
        SeedInput::All => Seed::All,
        SeedInput::Depth { at, layers } => {
            finite_point("seed.at", *at)?;
            Seed::Depth {
                at: *at,
                layers: *layers,
            }
        }
        SeedInput::Flaps { at } => {
            for p in at {
                finite_point("seed.at", *p)?;
            }
            Seed::Flaps { at: at.clone() }
        }
    })
}

fn finite_point(name: &str, p: Point) -> Result<(), BridgeError> {
    if p[0].is_finite() && p[1].is_finite() {
        Ok(())
    } else {
        Err(BridgeError::InvalidInput(format!(
            "{name} must be finite, got {p:?}"
        )))
    }
}
