//! What crosses the bridge, as serde types.
//!
//! **Inputs** are the Fold document's own shapes (`FoldPaper`, `FoldOp` and
//! `FoldChoices` in `apps/web/src/fold/document/foldSequenceDocument.ts`),
//! spelled as the document spells them, so a replay hands a stored step over
//! unchanged and every sheet anchor is resolved here, in Rust, never in
//! TypeScript. The tools get three additions the document never writes:
//!
//! - `via: 'model'`, a line already in the parent's model frame, and `side`,
//!   a side of it relative to the normal *as given* (a refusal's `use_line`
//!   fix comes back in exactly this form);
//! - `placement`, a tuck over or under a stationary face, and `closure`, the
//!   engine's own types.
//!
//! **Outputs** are the engine's serde types (snake_case, as every bridge's)
//! in an envelope tagged by `status`: `ok`, or `refused` with the refusal's
//! stable `code`, its fixes and the faces and vertices it names. A refusal
//! never carries a sentence: the UI words it from the code.

use oristudio_fold::{
    ClosurePolicy, Direction, FaceId, Fix, FoldRefusal, Placement, Refused, SheetShape, Side,
    StartSide, TurnAxis, VertexId, View,
};
use oristudio_geometry::Line;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type Point = [f64; 2];

// ---------------------------------------------------------------------------
// Inputs

/// The sheet a sequence starts from (`FoldPaper`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Paper {
    pub shape: PaperShape,
    #[serde(default)]
    pub start_side: StartSide,
}

/// `FoldPaperShape`: a rectangle's aspect is `[width, height]`, a polygon its
/// points in the unit sheet frame.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PaperShape {
    Square,
    Rectangle { aspect: [f64; 2] },
    Polygon { points: Vec<Point> },
}

impl PaperShape {
    pub fn sheet_shape(&self) -> SheetShape {
        match self {
            PaperShape::Square => SheetShape::Square,
            PaperShape::Rectangle { aspect } => SheetShape::Rectangle {
                width: aspect[0],
                height: aspect[1],
            },
            PaperShape::Polygon { points } => SheetShape::Polygon {
                points: points.clone(),
            },
        }
    }
}

/// One step (`FoldOp`). Valley, mountain, unfold and refold are all the
/// engine's plain fold; a precrease folds and unfolds; turn and rotate change
/// only the view.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum Op {
    Valley(AlongLine),
    Mountain(AlongLine),
    /// Its `direction` is required.
    Precrease(AlongLine),
    /// Along a folded crease: unfolding the flap the seed picks.
    Unfold(AlongCrease),
    /// Along a flat crease: refolding a precrease.
    Refold(AlongCrease),
    Turn {
        axis: TurnAxis,
    },
    Rotate {
        rotate: Rotation,
    },
    /// Import CP (plan D16): not in this build's engine yet.
    CpJump {},
}

impl Op {
    /// The op's `kind`, as the document spells it.
    pub fn kind(&self) -> &'static str {
        match self {
            Op::Valley(_) => "valley",
            Op::Mountain(_) => "mountain",
            Op::Precrease(_) => "precrease",
            Op::Unfold(_) => "unfold",
            Op::Refold(_) => "refold",
            Op::Turn { .. } => "turn",
            Op::Rotate { .. } => "rotate",
            Op::CpJump {} => "cp-jump",
        }
    }
}

/// A fold along a line: the document's `FoldAlongLine`, plus the tools'
/// additions.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AlongLine {
    pub line: LineInput,
    /// Valley or mountain as seen in the parent's view: the precrease's.
    /// A valley or mountain op takes its direction from its kind.
    #[serde(default)]
    pub direction: Option<Direction>,
    #[serde(flatten)]
    pub motion: Motion,
}

/// A fold along an existing crease, named by a sheet point inside its sheet
/// segment in the parent (`FoldCreaseOp`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AlongCrease {
    pub crease: Point,
    pub direction: Direction,
    #[serde(flatten)]
    pub motion: Motion,
}

/// Which side moves, and what goes with it.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Motion {
    /// A sheet point whose image lies on the moving side. The document
    /// stores it only when the seed does not imply the side.
    #[serde(default)]
    pub moving: Option<Point>,
    /// The tools' alternative to `moving`: a side of the line, relative to
    /// its normal as given. Never both.
    #[serde(default)]
    pub side: Option<Side>,
    pub seed: SeedInput,
    #[serde(default)]
    pub placement: Placement,
    #[serde(default)]
    pub closure: ClosurePolicy,
}

/// Where the fold line comes from (`FoldLineInput`, D14's line modes).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "via", rename_all = "snake_case")]
pub enum LineInput {
    /// Through the images of two sheet points.
    Free { through: [Point; 2] },
    /// Along the crease whose sheet segment holds this point.
    Crease { at: Point },
    /// A line `n · p = d` in the parent's model frame.
    Model { line: Line },
    /// An axiom's root: the engine's axioms are Phase 3.
    Axiom {},
}

/// `FoldSeed`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum SeedInput {
    All,
    Depth { at: Point, layers: usize },
    Flaps { at: Vec<Point> },
}

/// How far, and which way, a rotate step turns the model (`TurnRotation`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Rotation {
    pub amount: RotationAmount,
    pub direction: RotationDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RotationAmount {
    Eighth,
    Quarter,
    Half,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RotationDirection {
    Cw,
    Ccw,
}

impl Rotation {
    /// Radians, counter-clockwise on the display: the engine's sense.
    pub fn angle(&self) -> f64 {
        let turn = match self.amount {
            RotationAmount::Eighth => std::f64::consts::FRAC_PI_4,
            RotationAmount::Quarter => std::f64::consts::FRAC_PI_2,
            RotationAmount::Half => std::f64::consts::PI,
        };
        match self.direction {
            RotationDirection::Ccw => turn,
            RotationDirection::Cw => -turn,
        }
    }
}

/// `FoldChoices`, read only for which are present: no op this build folds
/// takes one yet (axiom roots arrive with Phase 3, completions and openings
/// with the compound folds), and a stored choice the op cannot use breaks
/// its step rather than being dropped.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct Choices {
    #[serde(default)]
    pub root: Option<IgnoredAny>,
    #[serde(default)]
    pub completion: Option<Vec<IgnoredAny>>,
    #[serde(default)]
    pub pocket: Option<IgnoredAny>,
    #[serde(default)]
    pub opening: Option<Vec<IgnoredAny>>,
}

impl Choices {
    /// The first choice present, by its document key. An empty list is no
    /// choice, as the document reads it.
    pub fn first_present(&self) -> Option<&'static str> {
        if self.root.is_some() {
            Some("root")
        } else if self.completion.as_ref().is_some_and(|c| !c.is_empty()) {
            Some("completion")
        } else if self.pocket.is_some() {
            Some("pocket")
        } else if self.opening.as_ref().is_some_and(|o| !o.is_empty()) {
            Some("opening")
        } else {
            None
        }
    }
}

// ---------------------------------------------------------------------------
// Outputs

/// What the bridge made of a request: the result, or a refusal.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum Outcome<T> {
    Ok(T),
    Refused(Refusal),
}

impl<T> Outcome<T> {
    pub fn refused(self) -> Option<Refusal> {
        match self {
            Outcome::Ok(_) => None,
            Outcome::Refused(refusal) => Some(refusal),
        }
    }

    pub fn ok(self) -> Option<T> {
        match self {
            Outcome::Ok(value) => Some(value),
            Outcome::Refused(_) => None,
        }
    }
}

/// A refusal on the wire: its body (`{ code, … }`), the fixes the engine
/// offers, and every face and vertex it names, so the UI can highlight them
/// without knowing each code's fields.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Refusal {
    pub refusal: RefusalBody,
    pub fixes: Vec<Fix>,
    pub faces: Vec<FaceId>,
    pub vertices: Vec<VertexId>,
}

impl Refusal {
    pub fn code(&self) -> &'static str {
        self.refusal.code()
    }
}

/// The refusal itself, tagged by `code`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum RefusalBody {
    Engine(FoldRefusal),
    /// The engine's `folded_image` without its `message`, which is a
    /// diagnostic sentence from the layer-order crate.
    FoldedImage {
        code: &'static str,
        faces: Vec<FaceId>,
    },
    Bridge(BridgeRefusal),
}

impl RefusalBody {
    pub fn code(&self) -> &'static str {
        match self {
            RefusalBody::Engine(r) => r.code(),
            RefusalBody::FoldedImage { code, .. } => code,
            RefusalBody::Bridge(r) => r.code(),
        }
    }
}

impl From<Refused> for Refusal {
    fn from(refused: Refused) -> Refusal {
        let faces = refused.refusal.faces();
        let vertices = refused.refusal.vertices();
        let refusal = match refused.refusal {
            FoldRefusal::FoldedImage { faces, .. } => RefusalBody::FoldedImage {
                code: "folded_image",
                faces,
            },
            other => RefusalBody::Engine(other),
        };
        Refusal {
            refusal,
            fixes: refused.fixes,
            faces,
            vertices,
        }
    }
}

impl From<FoldRefusal> for Refusal {
    fn from(refusal: FoldRefusal) -> Refusal {
        Refused::from(refusal).into()
    }
}

impl From<BridgeRefusal> for Refusal {
    fn from(refusal: BridgeRefusal) -> Refusal {
        Refusal {
            refusal: RefusalBody::Bridge(refusal),
            fixes: Vec::new(),
            faces: Vec::new(),
            vertices: Vec::new(),
        }
    }
}

/// What the bridge refuses before the engine sees the op: an anchor that no
/// longer resolves in the parent, or an op this build cannot fold. A replay
/// marks the step broken, exactly as for an engine refusal; the codes never
/// collide with the engine's.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum BridgeRefusal {
    #[error("this build cannot fold {feature:?} yet")]
    UnsupportedOp { feature: Unsupported },
    #[error("the op takes no {choice} choice")]
    UnexpectedChoice { choice: &'static str },
    #[error("the sheet point {point:?} is not on the paper")]
    PointOffPaper { point: Point },
    #[error("the line's two points land closer than the minimum feature")]
    DegenerateLine,
    #[error("no crease passes through the sheet point {point:?}")]
    CreaseNotFound { point: Point },
    #[error("the crease through {point:?} is not flat, so it cannot be refolded")]
    CreaseNotFlat { point: Point },
    #[error("the crease through {point:?} is not folded, so it cannot be unfolded")]
    CreaseNotFolded { point: Point },
    #[error("a fold of every layer needs its moving side")]
    MovingSideMissing,
    #[error("the sheet point {point:?} lands on the fold line, so it names no side")]
    MovingSideOnLine { point: Point },
}

impl BridgeRefusal {
    /// The stable snake_case code.
    pub fn code(&self) -> &'static str {
        match self {
            BridgeRefusal::UnsupportedOp { .. } => "unsupported_op",
            BridgeRefusal::UnexpectedChoice { .. } => "unexpected_choice",
            BridgeRefusal::PointOffPaper { .. } => "point_off_paper",
            BridgeRefusal::DegenerateLine => "degenerate_line",
            BridgeRefusal::CreaseNotFound { .. } => "crease_not_found",
            BridgeRefusal::CreaseNotFlat { .. } => "crease_not_flat",
            BridgeRefusal::CreaseNotFolded { .. } => "crease_not_folded",
            BridgeRefusal::MovingSideMissing => "moving_side_missing",
            BridgeRefusal::MovingSideOnLine { .. } => "moving_side_on_line",
        }
    }
}

/// What [`BridgeRefusal::UnsupportedOp`] names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Unsupported {
    /// A line from an axiom (Phase 3).
    AxiomLine,
    /// Import CP (Phase 8).
    CpJump,
}

/// A landed sheet.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SheetMade {
    /// The handle that names the state in later calls.
    pub state: u32,
    pub summary: Summary,
}

/// What a fold would move (D14 tier 2): the engine's `FoldAnalysis`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Analysed {
    pub analysis: oristudio_fold::FoldAnalysis,
}

/// A landed step.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Applied {
    pub state: u32,
    /// What the fold did; none for a turn or a rotation.
    pub report: Option<oristudio_fold::FoldReport>,
    pub summary: Summary,
}

/// A state at a glance.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    /// How many steps led here; the flat sheet is 0.
    pub step: u32,
    pub faces: usize,
    /// Ordered pairs of overlapping faces.
    pub pairs: usize,
    /// Front-relative, as stored and exported.
    pub creases: CreaseCounts,
    pub view: View,
    /// The largest disagreement between two images of one vertex.
    pub residual: f64,
    /// The sheet's outline, counter-clockwise, in sheet coordinates.
    pub sheet: Vec<Point>,
}

/// Creases by what they are now: `B | M | V | F`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
pub struct CreaseCounts {
    pub border: usize,
    pub mountain: usize,
    pub valley: usize,
    pub flat: usize,
}

/// Why a request could not even be asked. Thrown as a `{ code, message }`
/// envelope like every other bridge's errors: these are a caller's mistakes,
/// never something a stored step can do.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum BridgeError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("no state {0}: it was released, or never made by this engine")]
    UnknownState(u32),
}

impl BridgeError {
    pub fn code(&self) -> &'static str {
        match self {
            BridgeError::InvalidInput(_) => "invalid_input",
            BridgeError::UnknownState(_) => "unknown_state",
        }
    }
}
