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
//! never carries a sentence: the UI words it from the code. A sliver
//! remedy's `use_line` fix also carries the step that folds along it, in the
//! document's shapes, so the tools commit it as it is ([`StoredStep`]).

use oristudio_fold::{
    AnchoredFold, Axiom, AxiomCandidate, ClosurePolicy, CrossSection, DepthChoice, Direction,
    FaceId, Fix as EngineFix, Flap, FoldActionGeometry, FoldLine, FoldRefusal, LineRefusal,
    Placement, Refused, ReverseKind, Seed, SheetSegment, SheetShape, Side, StartSide, StepSummary,
    TurnAxis, VertexId, View,
};
use oristudio_geometry::Line;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::joins::SectionJoin;

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
    /// Import CP (plan D16): a stored crease pattern and its order, landed
    /// as a new model (`io::jump`).
    CpJump(crate::io::CpJump),
    // The vertex folds (plan Phase 11): `ops_squash_family`.
    Squash(crate::ops_squash_family::SquashOp),
    Petal(crate::ops_squash_family::PetalOp),
    RabbitEar(crate::ops_squash_family::RabbitEarOp),
    Swivel(crate::ops_squash_family::SwivelOp),
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
            Op::CpJump(_) => "cp-jump",
            Op::Squash(_) => "squash",
            Op::Petal(_) => "petal",
            Op::RabbitEar(_) => "rabbit-ear",
            Op::Swivel(_) => "swivel",
        }
    }

    /// Whether it ends at a completion, whose choice it stores as
    /// `completion`.
    pub fn takes_completion(&self) -> bool {
        matches!(
            self,
            Op::Squash(_) | Op::Petal(_) | Op::RabbitEar(_) | Op::Swivel(_)
        )
    }

    /// Whether its fold line is an axiom's, the one line that takes a stored
    /// root.
    pub fn is_axiom(&self) -> bool {
        matches!(
            self,
            Op::Valley(a) | Op::Mountain(a) | Op::Precrease(a)
                if matches!(a.line, LineInput::Axiom { .. })
        )
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
    /// stores it only when neither the line (an axiom that carries a point)
    /// nor the seed implies the side.
    #[serde(default)]
    pub moving: Option<Point>,
    /// The tools' alternative to `moving` for a model line: a side of it,
    /// relative to its normal as given. Never both.
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
    /// An axiom on anchors, in the shared crate's input order
    /// (`AXIOM_SLOTS`); the root it gave is the step's `choices.root`.
    Axiom { axiom: u8, inputs: Vec<RefInput> },
    /// A line `n · p = d` in the parent's model frame: the tools'.
    Model { line: Line },
}

/// An axiom input (`FoldRef`): a sheet point, a mark's resolved sheet point,
/// or a line by two sheet points on it (an edge or a crease).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RefInput {
    Point {
        at: Point,
    },
    /// The mark's id rides along for the sentence and provenance only:
    /// replay reads `at`.
    Mark {
        at: Point,
        mark: String,
    },
    Edge {
        a: Point,
        b: Point,
    },
}

/// `FoldSeed`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum SeedInput {
    All,
    Depth { at: Point, layers: usize },
    Flaps { at: Vec<Point> },
}

impl SeedInput {
    /// The engine's seed.
    pub fn seed(&self) -> Seed {
        match self {
            SeedInput::All => Seed::All,
            SeedInput::Depth { at, layers } => Seed::Depth {
                at: *at,
                layers: *layers,
            },
            SeedInput::Flaps { at } => Seed::Flaps { at: at.clone() },
        }
    }
}

impl From<&Seed> for SeedInput {
    fn from(seed: &Seed) -> SeedInput {
        match seed {
            Seed::All => SeedInput::All,
            Seed::Depth { at, layers } => SeedInput::Depth {
                at: *at,
                layers: *layers,
            },
            Seed::Flaps { at } => SeedInput::Flaps { at: at.clone() },
        }
    }
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

/// `FoldChoices`. An axiom's `root` and a vertex fold's `completion` are
/// read; the rest only for whether they are present: no op this build folds
/// takes one yet (openings and pockets arrive with the other compound
/// folds), and a stored choice the op cannot use breaks its step rather than
/// being dropped.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct Choices {
    /// The line the axiom's chosen root gave, in the parent's model frame.
    #[serde(default)]
    pub root: Option<Line>,
    /// The pairs a completion left free, as chosen (`FoldPairChoice`).
    #[serde(default)]
    pub completion: Option<Vec<oristudio_fold::PairChoice>>,
    #[serde(default)]
    pub pocket: Option<IgnoredAny>,
    #[serde(default)]
    pub opening: Option<Vec<IgnoredAny>>,
}

impl Choices {
    /// The first choice present that an op takes none of, by its document
    /// key: `root` unless the op folds along an axiom, `completion` unless
    /// it ends at one. An empty list is no choice, as the document reads it.
    pub fn unexpected(&self, takes_root: bool, takes_completion: bool) -> Option<&'static str> {
        if self.root.is_some() && !takes_root {
            Some("root")
        } else if self.completion.as_ref().is_some_and(|c| !c.is_empty()) && !takes_completion {
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

impl<T> From<Result<T, Refusal>> for Outcome<T> {
    fn from(result: Result<T, Refusal>) -> Outcome<T> {
        match result {
            Ok(value) => Outcome::Ok(value),
            Err(refusal) => Outcome::Refused(refusal),
        }
    }
}

/// A refusal on the wire: its body (`{ code, … }`), the fixes the engine
/// offers, and every face and vertex it names, so the UI can highlight them
/// without knowing each code's fields. The body is boxed: a refusal is the
/// rare answer, and every `Result` that may carry one stays small.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Refusal {
    pub refusal: Box<RefusalBody>,
    pub fixes: Vec<Fix>,
    pub faces: Vec<FaceId>,
    pub vertices: Vec<VertexId>,
}

impl Refusal {
    pub fn code(&self) -> &'static str {
        self.refusal.code()
    }

    fn of(refusal: RefusalBody) -> Refusal {
        Refusal {
            refusal: Box::new(refusal),
            fixes: Vec::new(),
            faces: Vec::new(),
            vertices: Vec::new(),
        }
    }
}

/// The refusal itself, tagged by `code`: the engine's, a line that does not
/// resolve, or the bridge's own.
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
    /// An anchored fold's line or side that does not resolve
    /// (`oristudio_fold::LineRefusal`).
    Line(LineRefusal),
    Bridge(BridgeRefusal),
}

impl RefusalBody {
    pub fn code(&self) -> &'static str {
        match self {
            RefusalBody::Engine(r) => r.code(),
            RefusalBody::FoldedImage { code, .. } => code,
            RefusalBody::Line(r) => r.code(),
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
            refusal: Box::new(refusal),
            fixes: refused.fixes.into_iter().map(Fix::from).collect(),
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

impl From<LineRefusal> for Refusal {
    fn from(refusal: LineRefusal) -> Refusal {
        Refusal::of(RefusalBody::Line(refusal))
    }
}

impl From<BridgeRefusal> for Refusal {
    fn from(refusal: BridgeRefusal) -> Refusal {
        Refusal::of(RefusalBody::Bridge(refusal))
    }
}

/// A remedy offered with a refusal (plan D14): the engine's
/// `oristudio_fold::Fix`, with a sliver remedy's storable step.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "fix")]
pub enum Fix {
    /// Include these flaps, which the closure would move anyway.
    IncludeFlaps { flaps: Vec<usize> },
    /// The same fold the other way is valid.
    OppositeDirection,
    /// Everything would move: pick one of these flaps to fold.
    PickFlap { flaps: Vec<Flap> },
    /// Fold along this line instead, with the same moving side: send it back
    /// as `{ via: 'model', line }` with `side` to preview it. A sliver
    /// remedy also names it as an axiom on anchors, the step to commit
    /// (plan D5); a near miss's landmark line has none.
    UseLine {
        line: Line,
        side: Side,
        #[serde(skip_serializing_if = "Option::is_none")]
        step: Option<StoredStep>,
    },
    /// The same reverse fold of the other kind is valid.
    OtherKind { kind: ReverseKind },
    /// The same rabbit ear or swivel with this emergent ray (a direction in
    /// the parent's model frame) lands: store it as the op's `emergent`.
    UseEmergent { direction: Point },
}

impl From<EngineFix> for Fix {
    fn from(fix: EngineFix) -> Fix {
        match fix {
            EngineFix::IncludeFlaps { flaps } => Fix::IncludeFlaps { flaps },
            EngineFix::OppositeDirection => Fix::OppositeDirection,
            EngineFix::PickFlap { flaps } => Fix::PickFlap { flaps },
            EngineFix::UseLine { line, side } => Fix::UseLine {
                line,
                side,
                step: None,
            },
            EngineFix::OtherKind { kind } => Fix::OtherKind { kind },
            EngineFix::UseEmergent { direction } => Fix::UseEmergent { direction },
        }
    }
}

/// A step as the document stores it (`FoldStep`'s `op` and `choices`): a
/// sliver remedy, an axiom fold whose root is its choice.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredStep {
    pub op: StoredOp,
    pub choices: StoredChoices,
}

/// The document's valley, mountain or precrease op along an axiom.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum StoredOp {
    Valley(StoredFold),
    Mountain(StoredFold),
    Precrease(StoredFold),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredFold {
    pub line: StoredLine,
    /// A precrease's; a valley or mountain is its kind.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<Direction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moving: Option<Point>,
    pub seed: SeedInput,
}

/// `FoldLineInput`'s axiom form.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "via", rename_all = "snake_case")]
pub enum StoredLine {
    Axiom { axiom: u8, inputs: Vec<RefInput> },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredChoices {
    pub root: Line,
}

impl StoredStep {
    /// The step that folds `fold`, a fold along an axiom (what a sliver
    /// remedy names), as a precrease or not. None for any other line, and
    /// for a tuck, which the document cannot store.
    pub fn of(fold: &AnchoredFold, precrease: bool) -> Option<StoredStep> {
        let FoldLine::Axiom { axiom, root } = &fold.line else {
            return None;
        };
        if fold.placement != Placement::OnTop {
            return None;
        }
        let stored = |direction| StoredFold {
            line: StoredLine::Axiom {
                axiom: axiom.number(),
                inputs: axiom_inputs(axiom),
            },
            direction,
            moving: fold.toward,
            seed: SeedInput::from(&fold.seed),
        };
        let op = match (precrease, fold.direction) {
            (true, direction) => StoredOp::Precrease(stored(Some(direction))),
            (false, Direction::Valley) => StoredOp::Valley(stored(None)),
            (false, Direction::Mountain) => StoredOp::Mountain(stored(None)),
        };
        Some(StoredStep {
            op,
            choices: StoredChoices { root: *root },
        })
    }
}

/// An axiom's inputs as the document spells them, in the crate's slot
/// order (`AXIOM_SLOTS`): the inverse of `resolve::axiom_of`.
pub fn axiom_inputs(axiom: &Axiom) -> Vec<RefInput> {
    let p = |at: &Point| RefInput::Point { at: *at };
    let m = |s: &SheetSegment| RefInput::Edge { a: s.a, b: s.b };
    match axiom {
        Axiom::O1 { p: a, q } | Axiom::O2 { p: a, q } => vec![p(a), p(q)],
        Axiom::O3 { m1, m2 } => vec![m(m1), m(m2)],
        Axiom::O4 { p: a, m: l } => vec![p(a), m(l)],
        Axiom::O5 { pivot, p: a, m1 } => vec![p(pivot), p(a), m(m1)],
        Axiom::O6 { p1, m1, p2, m2 } => vec![p(p1), m(m1), p(p2), m(m2)],
        Axiom::O7 { p: a, m1, m2 } => vec![p(a), m(m1), m(m2)],
    }
}

/// What the bridge refuses before the engine sees the op: a crease that no
/// longer resolves in the parent, a stored choice the op cannot use, or a
/// stored import that no longer lands. A replay marks the step broken,
/// exactly as for an engine refusal; the codes never collide with the
/// engine's. (An op this build cannot read never reaches the bridge: the
/// document reader locks it.)
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum BridgeRefusal {
    #[error("the op takes no {choice} choice")]
    UnexpectedChoice { choice: &'static str },
    #[error("a fold along an axiom needs the root it chose")]
    RootMissing,
    #[error("no crease passes through the sheet point {point:?}")]
    CreaseNotFound { point: Point },
    #[error("the crease through {point:?} is not flat, so it cannot be refolded")]
    CreaseNotFlat { point: Point },
    #[error("the crease through {point:?} is not folded, so it cannot be unfolded")]
    CreaseNotFolded { point: Point },
    /// A stored `cp-jump` that no longer lands, or an io call's refusal,
    /// under its own `import_*` or `fold_export_*` code (`io::IoRefusal`).
    #[serde(untagged)]
    #[error(transparent)]
    Io(crate::io::IoRefusal),
    /// A stored vertex fold whose choice no longer resolves, or that leaves
    /// one it does not store (`ops_squash_family::VertexRefusal`).
    #[serde(untagged)]
    #[error(transparent)]
    Vertex(crate::ops_squash_family::VertexRefusal),
}

impl BridgeRefusal {
    /// The stable snake_case code.
    pub fn code(&self) -> &'static str {
        match self {
            BridgeRefusal::UnexpectedChoice { .. } => "unexpected_choice",
            BridgeRefusal::RootMissing => "root_missing",
            BridgeRefusal::CreaseNotFound { .. } => "crease_not_found",
            BridgeRefusal::CreaseNotFlat { .. } => "crease_not_flat",
            BridgeRefusal::CreaseNotFolded { .. } => "crease_not_folded",
            BridgeRefusal::Io(refusal) => refusal.code(),
            BridgeRefusal::Vertex(refusal) => refusal.code(),
        }
    }
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
    /// What a vertex fold did, with its motion (plan D15); absent for every
    /// other step.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex: Option<Box<oristudio_fold::VertexReport>>,
}

/// A fold's picture on the state it starts from (plan D12, per step).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Acted {
    pub action: FoldActionGeometry,
}

/// The picture of the step that landed a state; none for a step that folds
/// nothing, or for the sheet.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StepActed {
    pub action: Option<FoldActionGeometry>,
}

/// The cross-section at a fold line (plan D14): the engine's, and where a
/// bend joins two of its rows.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Sectioned {
    pub section: Section,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Section {
    #[serde(flatten)]
    pub section: CrossSection,
    /// Ascending by rows, then along the line.
    pub joins: Vec<SectionJoin>,
}

/// The distinct moving sets a depth seed can pick at a point.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DepthChosen {
    pub choices: Vec<DepthChoice>,
}

/// A step's summary (plan D14): front-relative counts, the crease-pattern
/// diff and "Layers"; none for the flat sheet. An import's diff is empty: it
/// replaces the state before it rather than changing it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summarised {
    pub summary: Option<StepSummary>,
}

/// The folds an axiom yields here, for the candidate chooser.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Candidates {
    pub candidates: Vec<AxiomCandidate>,
}

/// The face the viewer sees at a model-frame point, and the sheet point
/// there: where a mark made by a pick goes.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct TopVisible {
    pub face: FaceId,
    pub sheet: Point,
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
    #[error("state {state} was folded from state {parent}, which has been released")]
    ParentReleased { state: u32, parent: u32 },
}

impl BridgeError {
    pub fn code(&self) -> &'static str {
        match self {
            BridgeError::InvalidInput(_) => "invalid_input",
            BridgeError::UnknownState(_) => "unknown_state",
            BridgeError::ParentReleased { .. } => "parent_released",
        }
    }
}
