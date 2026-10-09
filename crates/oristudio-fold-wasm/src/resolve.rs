//! A stored step resolved in its parent (plan D6): the document's op and
//! choices as the engine's folds.
//!
//! A line named by anchors — a free line through two sheet points, an
//! existing crease by a point on it, an axiom on its inputs with the root it
//! chose — becomes `oristudio_fold`'s [`AnchoredFold`], and the engine
//! resolves it: sheet points through `State::resolve_point` (boundaries
//! included, so a landmark on a crease or at a vertex resolves), the axiom's
//! root to the nearest candidate, the moving side from the axiom, `moving` or
//! the seed. Only a line the tools give in the model frame (`via: 'model'`)
//! is folded here as a [`PlainFold`], its side taken by the same rule.
//!
//! What the bridge checks itself is what the engine has no word for: the
//! crease a point names and whether it is flat or folded, and which choices
//! an op takes.

use oristudio_fold::{
    ActionKind, AnchoredFold, Axiom, CreaseKind, Direction, FoldLine, LineRefusal, PlainFold, Seed,
    SheetSegment, Side, State,
};
use oristudio_geometry::Line;

use crate::wire::{
    AlongCrease, AlongLine, BridgeError, BridgeRefusal, Choices, LineInput, Motion, Op, Point,
    RefInput, Refusal, SeedInput, Unsupported,
};

/// Why an op did not reach the engine.
#[derive(Debug, Clone, PartialEq)]
pub enum Rejection {
    /// The caller's mistake: thrown.
    Input(BridgeError),
    /// The parent cannot resolve it: a refusal.
    Refused(Refusal),
}

impl From<BridgeError> for Rejection {
    fn from(error: BridgeError) -> Rejection {
        Rejection::Input(error)
    }
}

impl From<BridgeRefusal> for Rejection {
    fn from(refusal: BridgeRefusal) -> Rejection {
        Rejection::Refused(refusal.into())
    }
}

impl From<LineRefusal> for Rejection {
    fn from(refusal: LineRefusal) -> Rejection {
        Rejection::Refused(refusal.into())
    }
}

/// An op, resolved against its parent.
#[derive(Debug, Clone)]
pub enum Resolved {
    /// A fold whose line and side anchors name: the engine resolves them.
    Anchored {
        fold: AnchoredFold,
        kind: ActionKind,
    },
    /// A fold along a line the tools gave in the parent's model frame.
    Plain { fold: PlainFold, kind: ActionKind },
    /// A turn or a rotation: the same model, seen another way.
    View(State),
}

impl Resolved {
    /// The plain fold it names: the line, side and seed the engine folds
    /// along. None for a view change.
    pub fn plain(&self, parent: &State) -> Option<Result<PlainFold, LineRefusal>> {
        match self {
            Resolved::Anchored { fold, .. } => Some(parent.resolve_anchored(fold).map(|r| r.fold)),
            Resolved::Plain { fold, .. } => Some(Ok(fold.clone())),
            Resolved::View(_) => None,
        }
    }
}

/// The op and its choices, resolved in `parent`.
pub fn resolve(parent: &State, op: &Op, choices: &Choices) -> Result<Resolved, Rejection> {
    if let Some(choice) = choices.unexpected(op.is_axiom()) {
        return Err(BridgeRefusal::UnexpectedChoice { choice }.into());
    }
    let root = choices.root.as_ref();
    match op {
        Op::Valley(a) => along_line(parent, a, Direction::Valley, ActionKind::Fold, root),
        Op::Mountain(a) => along_line(parent, a, Direction::Mountain, ActionKind::Fold, root),
        Op::Precrease(a) => {
            let direction = a.direction.ok_or_else(|| {
                BridgeError::InvalidInput("a precrease needs its direction".to_string())
            })?;
            along_line(parent, a, direction, ActionKind::Precrease, root)
        }
        Op::Unfold(c) => along_crease(parent, c, true),
        Op::Refold(c) => along_crease(parent, c, false),
        Op::Turn { axis } => Ok(Resolved::View(parent.turn_over_about(*axis))),
        Op::Rotate { rotate } => Ok(Resolved::View(parent.rotate(rotate.angle()))),
        // Import CP: its loaders and completion are Phase 8's.
        Op::CpJump {} => Err(BridgeRefusal::UnsupportedOp {
            feature: Unsupported::CpJump,
        }
        .into()),
    }
}

/// A valley, mountain or precrease op.
fn along_line(
    parent: &State,
    op: &AlongLine,
    direction: Direction,
    kind: ActionKind,
    root: Option<&Line>,
) -> Result<Resolved, Rejection> {
    let line = match &op.line {
        LineInput::Free { through: [a, b] } => {
            finite_point("line.through", *a)?;
            finite_point("line.through", *b)?;
            FoldLine::Free { a: *a, b: *b }
        }
        LineInput::Crease { at } => FoldLine::Crease {
            segment: crease(parent, *at)?.0,
        },
        LineInput::Axiom { axiom, inputs } => FoldLine::Axiom {
            axiom: axiom_of(*axiom, inputs)?,
            root: model_line(root.ok_or(BridgeRefusal::RootMissing)?)?.0,
        },
        LineInput::Model { line } => {
            let (line, flipped) = model_line(line)?;
            return Ok(Resolved::Plain {
                fold: plain(parent, line, flipped, direction, &op.motion)?,
                kind,
            });
        }
    };
    Ok(Resolved::Anchored {
        fold: anchored(line, direction, &op.motion)?,
        kind,
    })
}

/// An unfold or refold op: a fold along the crease's line, which must be
/// folded (`folded`) or flat. The sheet's border is neither.
fn along_crease(parent: &State, op: &AlongCrease, folded: bool) -> Result<Resolved, Rejection> {
    let (segment, kind) = crease(parent, op.crease)?;
    let point = op.crease;
    match (folded, kind) {
        (true, CreaseKind::Folded(_)) | (false, CreaseKind::Flat(_)) => {}
        (true, _) => return Err(BridgeRefusal::CreaseNotFolded { point }.into()),
        (false, _) => return Err(BridgeRefusal::CreaseNotFlat { point }.into()),
    }
    Ok(Resolved::Anchored {
        fold: anchored(FoldLine::Crease { segment }, op.direction, &op.motion)?,
        kind: ActionKind::Fold,
    })
}

/// The engine's anchored fold. Its side is the axiom's, `moving`'s or the
/// seed's: a `side` relative to a normal goes only with a model line, which
/// has one.
fn anchored(
    line: FoldLine,
    direction: Direction,
    motion: &Motion,
) -> Result<AnchoredFold, BridgeError> {
    if motion.side.is_some() {
        return Err(BridgeError::InvalidInput(
            "`side` names a side of a model line; name the moving side of this line with `moving`"
                .to_string(),
        ));
    }
    let mut fold = AnchoredFold::new(line, direction)
        .with_seed(seed(&motion.seed)?)
        .with_placement(placement(motion)?)
        .with_closure(motion.closure);
    if let Some(p) = motion.moving {
        finite_point("moving", p)?;
        fold = fold.toward(p);
    }
    Ok(fold)
}

/// A fold along a model line, its side given against the normal as written
/// (`flipped` when canonicalising reversed it), or else named by a sheet
/// point: `moving`, or the seed's own point — the anchored fold's rule.
fn plain(
    parent: &State,
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
        (Some(side), None) if flipped => side.opposite(),
        (Some(side), None) => side,
        (None, moving) => {
            let point = moving.or(match &seed {
                Seed::All => None,
                Seed::Depth { at, .. } => Some(*at),
                Seed::Flaps { at } => at.first().copied(),
            });
            let point = point.ok_or(LineRefusal::NoSide)?;
            finite_point("moving", point)?;
            let image = parent
                .resolve_point(point)
                .ok_or(LineRefusal::PointOffPaper { point })?;
            Side::of_point(&line, image).ok_or(LineRefusal::SideOnLine { point })?
        }
    };
    Ok(PlainFold::new(line, side, direction)
        .with_seed(seed)
        .with_placement(placement(motion)?)
        .with_closure(motion.closure))
}

/// The axiom a document line names: its inputs in the crate's slot order
/// (`AXIOM_SLOTS`), a point slot taking a point or a mark's point and a line
/// slot an edge. The inverse of `wire::axiom_inputs`.
pub fn axiom_of(number: u8, inputs: &[RefInput]) -> Result<Axiom, BridgeError> {
    let point = |k: usize| -> Result<Point, BridgeError> {
        match inputs.get(k) {
            Some(RefInput::Point { at } | RefInput::Mark { at, .. }) => {
                finite_point("axiom input", *at)?;
                Ok(*at)
            }
            other => Err(slot_error(number, k, "a point", other)),
        }
    };
    let segment = |k: usize| -> Result<SheetSegment, BridgeError> {
        match inputs.get(k) {
            Some(RefInput::Edge { a, b }) => {
                finite_point("axiom input", *a)?;
                finite_point("axiom input", *b)?;
                Ok(SheetSegment::new(*a, *b))
            }
            other => Err(slot_error(number, k, "an edge", other)),
        }
    };
    let slots = match number {
        1..=4 => 2,
        5 | 7 => 3,
        6 => 4,
        _ => {
            return Err(BridgeError::InvalidInput(format!(
                "axiom must be 1 to 7, got {number}"
            )));
        }
    };
    if inputs.len() != slots {
        return Err(BridgeError::InvalidInput(format!(
            "axiom O{number} takes {slots} inputs, got {}",
            inputs.len()
        )));
    }
    Ok(match number {
        1 => Axiom::O1 {
            p: point(0)?,
            q: point(1)?,
        },
        2 => Axiom::O2 {
            p: point(0)?,
            q: point(1)?,
        },
        3 => Axiom::O3 {
            m1: segment(0)?,
            m2: segment(1)?,
        },
        4 => Axiom::O4 {
            p: point(0)?,
            m: segment(1)?,
        },
        5 => Axiom::O5 {
            pivot: point(0)?,
            p: point(1)?,
            m1: segment(2)?,
        },
        6 => Axiom::O6 {
            p1: point(0)?,
            m1: segment(1)?,
            p2: point(2)?,
            m2: segment(3)?,
        },
        _ => Axiom::O7 {
            p: point(0)?,
            m1: segment(1)?,
            m2: segment(2)?,
        },
    })
}

fn slot_error(number: u8, k: usize, wanted: &str, got: Option<&RefInput>) -> BridgeError {
    let got = match got {
        Some(RefInput::Point { .. }) => "a point",
        Some(RefInput::Mark { .. }) => "a mark",
        Some(RefInput::Edge { .. }) => "an edge",
        None => "nothing",
    };
    BridgeError::InvalidInput(format!(
        "axiom O{number}'s input {k} must be {wanted}, got {got}"
    ))
}

/// The crease whose sheet segment holds `at`, as that segment, and what it
/// is.
fn crease(state: &State, at: Point) -> Result<(SheetSegment, CreaseKind), Rejection> {
    finite_point("crease point", at)?;
    let crease = state
        .crease_at(at)
        .ok_or(BridgeRefusal::CreaseNotFound { point: at })?;
    let [a, b] = crease.vertices.map(|v| state.vertices()[v.0 as usize]);
    Ok((SheetSegment::new(a, b), crease.kind))
}

/// A model line, validated and canonicalised, and whether canonicalising
/// reversed its normal (so a side given against it flips).
pub fn model_line(line: &Line) -> Result<(Line, bool), BridgeError> {
    if !(line.n[0].is_finite() && line.n[1].is_finite() && line.d.is_finite()) {
        return Err(BridgeError::InvalidInput(
            "line n and d must be finite".to_string(),
        ));
    }
    let canonical = Line::new(line.n, line.d)
        .ok_or_else(|| BridgeError::InvalidInput("the line's normal is zero".to_string()))?;
    let flipped = canonical.n[0] * line.n[0] + canonical.n[1] * line.n[1] < 0.0;
    Ok((canonical, flipped))
}

fn seed(seed: &SeedInput) -> Result<Seed, BridgeError> {
    match seed {
        SeedInput::All => {}
        SeedInput::Depth { at, .. } => finite_point("seed.at", *at)?,
        SeedInput::Flaps { at } => {
            for p in at {
                finite_point("seed.at", *p)?;
            }
        }
    }
    Ok(seed.seed())
}

fn placement(motion: &Motion) -> Result<oristudio_fold::Placement, BridgeError> {
    match &motion.placement {
        oristudio_fold::Placement::OnTop => {}
        oristudio_fold::Placement::Over { at } | oristudio_fold::Placement::Under { at } => {
            finite_point("placement.at", *at)?;
        }
    }
    Ok(motion.placement.clone())
}

pub fn finite_point(name: &str, p: Point) -> Result<(), BridgeError> {
    if p[0].is_finite() && p[1].is_finite() {
        Ok(())
    } else {
        Err(BridgeError::InvalidInput(format!(
            "{name} must be finite, got {p:?}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::axiom_inputs;

    #[test]
    fn axioms_round_trip_through_the_documents_slots() {
        let s = SheetSegment::new([0.0, 0.0], [1.0, 0.0]);
        let t = SheetSegment::new([0.0, 0.0], [0.0, 1.0]);
        let (p, q) = ([0.2, 0.3], [0.7, 0.9]);
        let axioms = [
            Axiom::O1 { p, q },
            Axiom::O2 { p, q },
            Axiom::O3 { m1: s, m2: t },
            Axiom::O4 { p, m: s },
            Axiom::O5 {
                pivot: p,
                p: q,
                m1: s,
            },
            Axiom::O6 {
                p1: p,
                m1: s,
                p2: q,
                m2: t,
            },
            Axiom::O7 { p, m1: s, m2: t },
        ];
        for axiom in axioms {
            let inputs = axiom_inputs(&axiom);
            assert_eq!(axiom_of(axiom.number(), &inputs), Ok(axiom));
        }
        // A mark is a point slot's input too; a point is no line.
        let mark = RefInput::Mark {
            at: p,
            mark: "fmark-1".to_string(),
        };
        assert_eq!(
            axiom_of(2, &[mark, RefInput::Point { at: q }]),
            Ok(Axiom::O2 { p, q })
        );
        let wrong = axiom_of(4, &[RefInput::Point { at: p }, RefInput::Point { at: q }]);
        assert!(matches!(wrong, Err(BridgeError::InvalidInput(_))));
        assert!(matches!(
            axiom_of(8, &[]),
            Err(BridgeError::InvalidInput(_))
        ));
        assert!(matches!(
            axiom_of(1, &[RefInput::Point { at: p }]),
            Err(BridgeError::InvalidInput(_))
        ));
    }
}
