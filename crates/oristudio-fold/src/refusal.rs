//! Typed refusals (plan D4, D14): everything the engine declines to build,
//! naming the faces, vertices and creases involved, with the fixes it can
//! offer. A refusal is never a crash and never an approximation.
//!
//! [`FoldRefusal::code`] is the stable identifier the bridge, the UI and the
//! `fold refused` analytics event use (plan D18).

use oristudio_geometry::Line;
use oristudio_layer_order::Violation;
use serde::Serialize;
use thiserror::Error;

use crate::complete::BudgetLimit;
use crate::compound::reverse::{NoOpening, ReverseKind};
use crate::compound::tuck::TuckSide;
use crate::pattern::{EdgeId, FaceId, VertexId};

type Point = [f64; 2];

/// Why a near miss is one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NearMissCause {
    /// The vertex lies between the tolerance and the minimum feature from the
    /// line asked for or from the snapped line.
    Band,
    /// Snapping the line moved the vertex to the other side of it, or onto it.
    SnapChangesSide,
    /// The vertex was snapped onto the line, but the snapped line misses it by
    /// more than [`crate::numerics::EXACT`].
    SnapAmbiguous,
}

/// Everything the engine refuses.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(rename_all = "snake_case", tag = "code")]
pub enum FoldRefusal {
    // --- The sheet -------------------------------------------------------
    #[error("a sheet outline needs at least three points, got {count}")]
    SheetTooFewPoints { count: usize },
    #[error("a sheet outline has a coordinate that is not finite")]
    SheetNotFinite,
    #[error("the sheet outline is not convex")]
    SheetNotConvex,
    #[error("side {index} of the sheet outline is {length}, shorter than the minimum feature")]
    SheetSideTooShort { index: usize, length: f64 },
    #[error(
        "the sheet outline is not in the unit frame (bounding box at the origin, longer side 1)"
    )]
    SheetNotInUnitFrame,
    #[error("a rectangle needs a finite, positive width and height")]
    InvalidRectangle,
    #[error("a regular polygon sheet cannot have {sides} sides")]
    InvalidSides { sides: u32 },

    // --- The state (State::make) -----------------------------------------
    #[error("{what} {id} appears more than once")]
    DuplicateId { what: &'static str, id: u32 },
    #[error("face {face} names vertex {vertex}, which does not exist")]
    UnknownVertex { face: FaceId, vertex: VertexId },
    #[error("crease {edge} names vertex {vertex}, which does not exist")]
    CreaseUnknownVertex { edge: EdgeId, vertex: VertexId },
    #[error("vertex {vertex} is on no face")]
    UnusedVertex { vertex: VertexId },
    #[error("face {face} has fewer than three vertices")]
    FaceTooSmall { face: FaceId },
    #[error("face {face} has the side {vertices:?}, which is no crease")]
    MissingCrease {
        face: FaceId,
        vertices: [VertexId; 2],
    },
    #[error("crease {edge} borders {faces} faces")]
    CreaseFaceCount { edge: EdgeId, faces: usize },
    #[error("face {face} is not a convex counter-clockwise polygon")]
    NonConvexFace { face: FaceId },
    #[error("the faces cover {faces_area} of the sheet's {sheet_area}")]
    AreaMismatch { faces_area: f64, sheet_area: f64 },
    #[error("vertex {vertex} is not on the sheet")]
    VertexOffSheet { vertex: VertexId },
    #[error("border crease {edge} does not lie along a side of the sheet")]
    BorderOffOutline { edge: EdgeId },
    #[error("the root face {face}'s isometry is not a rigid motion")]
    RootNotRigid { face: FaceId },
    #[error("the view's rotation is not a finite angle")]
    ViewNotFinite,
    #[error("the root face {face} is not in the state")]
    UnknownRoot { face: FaceId },
    #[error("face {face} is not connected to the root face")]
    UnreachedFace { face: FaceId },
    #[error("vertex {vertex} lands {residual} apart through face {face} and the root's path")]
    Residual {
        vertex: VertexId,
        face: FaceId,
        residual: f64,
    },
    #[error("crease {edge} is {kind} between faces {faces:?} of the wrong orientations")]
    HingeOrientation {
        edge: EdgeId,
        faces: [FaceId; 2],
        kind: &'static str,
    },
    #[error("the folded image is malformed: {message}")]
    FoldedImage { message: String, faces: Vec<FaceId> },
    #[error("the layer order breaks {} rule(s)", violations.len())]
    LayerOrder { violations: Vec<Violation> },

    // --- A fold ---------------------------------------------------------
    #[error("the fold line misses the paper on the moving side")]
    NoMovingSide,
    #[error("the fold line passes {distance} from vertex {vertex}: a near miss")]
    NearMiss {
        vertex: VertexId,
        distance: f64,
        cause: NearMissCause,
    },
    #[error("the sheet point {point:?} is in no face (off the sheet, or on a crease)")]
    WitnessNotInFace { point: Point },
    #[error("the sheet point {point:?} is not on the moving side")]
    SeedNotOnMovingSide { point: Point },
    #[error("the seed names no layer on the moving side")]
    EmptySeed,
    #[error("everything would move: nothing stays put")]
    NothingStays,
    #[error("the fold also moves flaps {added:?}")]
    ClosureAddsFlaps { added: Vec<usize> },
    #[error("the tuck target {face} would move")]
    TuckTargetMoves { face: FaceId },
    #[error("face {face} does not split into two pieces along the fold line")]
    DegenerateSplit { face: FaceId },
    #[error("the new crease {vertices:?} is {length}, shorter than the minimum feature")]
    ShortCrease {
        vertices: [VertexId; 2],
        length: f64,
    },
    #[error(
        "splitting face {face} leaves a piece {width} wide, thinner than half the minimum feature"
    )]
    ThinPiece { face: FaceId, width: f64 },
    #[error("vertex {vertex} lands {penetration} inside face {face}: a sliver")]
    Sliver {
        vertex: VertexId,
        face: FaceId,
        penetration: f64,
    },
    #[error("face {face} lands {residual} from where the fold puts it")]
    PredictionMismatch { face: FaceId, residual: f64 },
    #[error("unfolding the precrease moved more than the folded layers")]
    PrecreaseUnfoldMovedMore,

    // --- A compound fold (plan D4) --------------------------------------
    /// No layer order puts the moved paper anywhere: the faces the conflict
    /// traces to, in the landed state.
    #[error("no layer order fits the fold; faces {faces:?} conflict")]
    NoOrder { faces: Vec<FaceId> },
    #[error("the layer-order search hit its {limit:?} budget after {nodes} nodes")]
    BudgetExceeded { limit: BudgetLimit, nodes: u64 },
    #[error("the choice {choice:?} names no listed order")]
    NoSuchChoice { choice: Vec<usize> },
    /// A flap of a reverse fold's tip cannot open: its faces, in the parent.
    #[error("flap {faces:?} has no opening to reverse it through ({cause:?})")]
    ReverseNoOpening {
        faces: Vec<FaceId>,
        cause: NoOpening,
    },
    /// The tip cannot swing: layers that are not part of it lie in its way.
    /// `blocking` are those layers' faces in the parent; `faces` every face
    /// the conflict traces to in the landed state.
    #[error("the tip is not free: faces {blocking:?} are in its way")]
    ReverseTipNotFree {
        blocking: Vec<FaceId>,
        faces: Vec<FaceId>,
    },
    /// No layer order fits a reverse fold of this kind: the faces the
    /// conflict traces to, in the landed state.
    #[error("no {kind:?} reverse fold fits; faces {faces:?} conflict")]
    ReverseKindInfeasible {
        kind: ReverseKind,
        faces: Vec<FaceId>,
    },

    // --- Tucks and crimps (plan Phase 11) -------------------------------
    /// No order puts the block immediately under (or over) its target: T,
    /// which stays, and the faces the conflict traces to in the landed
    /// state.
    #[error("the fold cannot be tucked {placement:?} face {target}; faces {faces:?} conflict")]
    TuckInfeasible {
        target: FaceId,
        placement: TuckSide,
        faces: Vec<FaceId>,
    },
    /// A crimp's second line meets its first over the paper it moves, or
    /// within the minimum feature of it: the tip's faces there, in the
    /// parent.
    #[error("the crimp's lines meet over faces {faces:?}")]
    CrimpLinesMeet { faces: Vec<FaceId> },
    /// A crimp's second line crosses none of the paper beyond its first: it
    /// would be a reverse fold.
    #[error("the crimp's second line misses the tip")]
    CrimpMissesTip,
    /// A flap that opens at the first line does not open at the second: one
    /// of its blocks reaches past the second line without the other, or
    /// with nothing there to hinge to. Its faces, in the parent.
    #[error("flap {faces:?} does not open at the crimp's second line")]
    CrimpNoOpening { faces: Vec<FaceId> },
    /// No order fits a crimp of this kind: the faces the conflict traces to,
    /// in the landed state.
    #[error("no {kind:?} crimp fits; faces {faces:?} conflict")]
    CrimpKindInfeasible {
        kind: ReverseKind,
        faces: Vec<FaceId>,
    },
    /// The crimped paper cannot swing: layers that are not part of it lie in
    /// its way. `blocking` are those layers' faces in the parent; `faces`
    /// every face the conflict traces to in the landed state.
    #[error("the crimp is not free: faces {blocking:?} are in its way")]
    CrimpTipNotFree {
        blocking: Vec<FaceId>,
        faces: Vec<FaceId>,
    },
    /// A defect, never the input's fault.
    #[error("internal error: {message}")]
    Internal { message: String },
}

impl FoldRefusal {
    /// The stable snake_case code.
    pub fn code(&self) -> &'static str {
        match self {
            FoldRefusal::SheetTooFewPoints { .. } => "sheet_too_few_points",
            FoldRefusal::SheetNotFinite => "sheet_not_finite",
            FoldRefusal::SheetNotConvex => "sheet_not_convex",
            FoldRefusal::SheetSideTooShort { .. } => "sheet_side_too_short",
            FoldRefusal::SheetNotInUnitFrame => "sheet_not_in_unit_frame",
            FoldRefusal::InvalidRectangle => "invalid_rectangle",
            FoldRefusal::InvalidSides { .. } => "invalid_sides",
            FoldRefusal::DuplicateId { .. } => "duplicate_id",
            FoldRefusal::UnknownVertex { .. } => "unknown_vertex",
            FoldRefusal::CreaseUnknownVertex { .. } => "crease_unknown_vertex",
            FoldRefusal::UnusedVertex { .. } => "unused_vertex",
            FoldRefusal::FaceTooSmall { .. } => "face_too_small",
            FoldRefusal::MissingCrease { .. } => "missing_crease",
            FoldRefusal::CreaseFaceCount { .. } => "crease_face_count",
            FoldRefusal::NonConvexFace { .. } => "non_convex_face",
            FoldRefusal::AreaMismatch { .. } => "area_mismatch",
            FoldRefusal::VertexOffSheet { .. } => "vertex_off_sheet",
            FoldRefusal::BorderOffOutline { .. } => "border_off_outline",
            FoldRefusal::RootNotRigid { .. } => "root_not_rigid",
            FoldRefusal::ViewNotFinite => "view_not_finite",
            FoldRefusal::UnknownRoot { .. } => "unknown_root",
            FoldRefusal::UnreachedFace { .. } => "unreached_face",
            FoldRefusal::Residual { .. } => "residual",
            FoldRefusal::HingeOrientation { .. } => "hinge_orientation",
            FoldRefusal::FoldedImage { .. } => "folded_image",
            FoldRefusal::LayerOrder { .. } => "layer_order",
            FoldRefusal::NoMovingSide => "no_moving_side",
            FoldRefusal::NearMiss { .. } => "near_miss",
            FoldRefusal::WitnessNotInFace { .. } => "witness_not_in_face",
            FoldRefusal::SeedNotOnMovingSide { .. } => "seed_not_on_moving_side",
            FoldRefusal::EmptySeed => "empty_seed",
            FoldRefusal::NothingStays => "nothing_stays",
            FoldRefusal::ClosureAddsFlaps { .. } => "closure_adds_flaps",
            FoldRefusal::TuckTargetMoves { .. } => "tuck_target_moves",
            FoldRefusal::DegenerateSplit { .. } => "degenerate_split",
            FoldRefusal::ShortCrease { .. } => "short_crease",
            FoldRefusal::ThinPiece { .. } => "thin_piece",
            FoldRefusal::Sliver { .. } => "sliver",
            FoldRefusal::PredictionMismatch { .. } => "prediction_mismatch",
            FoldRefusal::PrecreaseUnfoldMovedMore => "precrease_unfold_moved_more",
            FoldRefusal::NoOrder { .. } => "no_order",
            FoldRefusal::BudgetExceeded { .. } => "budget_exceeded",
            FoldRefusal::NoSuchChoice { .. } => "no_such_choice",
            FoldRefusal::ReverseNoOpening { .. } => "reverse_no_opening",
            FoldRefusal::ReverseTipNotFree { .. } => "reverse_tip_not_free",
            FoldRefusal::ReverseKindInfeasible { .. } => "reverse_kind_infeasible",
            FoldRefusal::TuckInfeasible { .. } => "tuck_infeasible",
            FoldRefusal::CrimpLinesMeet { .. } => "crimp_lines_meet",
            FoldRefusal::CrimpMissesTip => "crimp_misses_tip",
            FoldRefusal::CrimpNoOpening { .. } => "crimp_no_opening",
            FoldRefusal::CrimpKindInfeasible { .. } => "crimp_kind_infeasible",
            FoldRefusal::CrimpTipNotFree { .. } => "crimp_tip_not_free",
            FoldRefusal::Internal { .. } => "internal",
        }
    }

    /// The faces the refusal names, ascending.
    pub fn faces(&self) -> Vec<FaceId> {
        let mut faces = match self {
            FoldRefusal::UnknownVertex { face, .. }
            | FoldRefusal::FaceTooSmall { face }
            | FoldRefusal::MissingCrease { face, .. }
            | FoldRefusal::NonConvexFace { face }
            | FoldRefusal::UnknownRoot { face }
            | FoldRefusal::RootNotRigid { face }
            | FoldRefusal::UnreachedFace { face }
            | FoldRefusal::Residual { face, .. }
            | FoldRefusal::TuckTargetMoves { face }
            | FoldRefusal::DegenerateSplit { face }
            | FoldRefusal::ThinPiece { face, .. }
            | FoldRefusal::Sliver { face, .. }
            | FoldRefusal::PredictionMismatch { face, .. } => vec![*face],
            FoldRefusal::HingeOrientation { faces, .. } => faces.to_vec(),
            FoldRefusal::FoldedImage { faces, .. }
            | FoldRefusal::NoOrder { faces }
            | FoldRefusal::ReverseNoOpening { faces, .. }
            | FoldRefusal::ReverseKindInfeasible { faces, .. }
            | FoldRefusal::CrimpLinesMeet { faces }
            | FoldRefusal::CrimpNoOpening { faces }
            | FoldRefusal::CrimpKindInfeasible { faces, .. } => faces.clone(),
            FoldRefusal::ReverseTipNotFree { blocking, .. }
            | FoldRefusal::CrimpTipNotFree { blocking, .. } => blocking.clone(),
            FoldRefusal::TuckInfeasible { target, faces, .. } => {
                faces.iter().copied().chain([*target]).collect()
            }
            FoldRefusal::LayerOrder { violations } => {
                violations.iter().flat_map(Violation::faces).collect()
            }
            _ => Vec::new(),
        };
        faces.sort_unstable();
        faces.dedup();
        faces
    }

    /// The vertices the refusal names.
    pub fn vertices(&self) -> Vec<VertexId> {
        match self {
            FoldRefusal::UnknownVertex { vertex, .. }
            | FoldRefusal::CreaseUnknownVertex { vertex, .. }
            | FoldRefusal::UnusedVertex { vertex }
            | FoldRefusal::VertexOffSheet { vertex }
            | FoldRefusal::Residual { vertex, .. }
            | FoldRefusal::NearMiss { vertex, .. }
            | FoldRefusal::Sliver { vertex, .. } => vec![*vertex],
            FoldRefusal::MissingCrease { vertices, .. }
            | FoldRefusal::ShortCrease { vertices, .. } => vertices.to_vec(),
            _ => Vec::new(),
        }
    }
}

/// A side of a line, relative to its normal: `Positive` is where
/// `n · p > d`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Positive,
    Negative,
}

impl Side {
    pub fn opposite(self) -> Side {
        match self {
            Side::Positive => Side::Negative,
            Side::Negative => Side::Positive,
        }
    }

    /// The side of `line` that `p` lies on; none within the tolerance of it.
    pub fn of_point(line: &Line, p: Point) -> Option<Side> {
        let d = line.signed_distance(p);
        if d > crate::numerics::TOL {
            Some(Side::Positive)
        } else if d < -crate::numerics::TOL {
            Some(Side::Negative)
        } else {
            None
        }
    }
}

/// A flap: a connected part of the moving side, joined across creases with an
/// end on the moving side (the closure's adjacency rule, plan D3). A hinge on
/// the fold line separates two flaps.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Flap {
    /// Its faces, ascending.
    pub faces: Vec<FaceId>,
    /// An interior sheet point of one of its faces whose image is on the
    /// moving side: what a seed or a stored choice names it by.
    pub witness: Point,
}

/// A remedy the engine can offer with a refusal (plan D14).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case", tag = "fix")]
pub enum Fix {
    /// Include these flaps, which the closure would move anyway.
    IncludeFlaps { flaps: Vec<usize> },
    /// The same fold the other way is valid.
    OppositeDirection,
    /// Everything would move: pick one of these flaps to fold.
    PickFlap { flaps: Vec<Flap> },
    /// Fold along this landmark line instead, with the same moving side.
    UseLine { line: Line, side: Side },
    /// The same reverse fold, or crimp, of the other kind is valid (plan
    /// D14).
    OtherKind { kind: ReverseKind },
    /// The same tuck against this layer instead is valid: its face, and the
    /// sheet point that names it.
    TuckTarget { face: FaceId, at: Point },
}

/// A refused operation and what could be done instead.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[error("{refusal}")]
pub struct Refused {
    pub refusal: FoldRefusal,
    pub fixes: Vec<Fix>,
}

impl From<FoldRefusal> for Refused {
    fn from(refusal: FoldRefusal) -> Refused {
        Refused {
            refusal,
            fixes: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_snake_case_and_name_their_faces() {
        let r = FoldRefusal::Sliver {
            vertex: VertexId(4),
            face: FaceId(9),
            penetration: 1e-4,
        };
        assert_eq!(r.code(), "sliver");
        assert_eq!(r.faces(), vec![FaceId(9)]);
        assert_eq!(r.vertices(), vec![VertexId(4)]);
    }

    #[test]
    fn the_serialized_tag_is_the_code() {
        let refusals = [
            FoldRefusal::NothingStays,
            FoldRefusal::SheetNotConvex,
            FoldRefusal::NearMiss {
                vertex: VertexId(1),
                distance: 1e-4,
                cause: NearMissCause::Band,
            },
            FoldRefusal::ClosureAddsFlaps { added: vec![2] },
            FoldRefusal::LayerOrder {
                violations: Vec::new(),
            },
        ];
        for r in refusals {
            let json = serde_json::to_value(&r).unwrap_or_default();
            assert_eq!(json["code"], r.code(), "{json}");
        }
    }

    #[test]
    fn side_of_point_respects_the_tolerance() {
        let Some(line) = Line::new([1.0, 0.0], 0.5) else {
            unreachable!()
        };
        assert_eq!(Side::of_point(&line, [0.9, 0.0]), Some(Side::Positive));
        assert_eq!(Side::of_point(&line, [0.1, 0.0]), Some(Side::Negative));
        assert_eq!(Side::of_point(&line, [0.5 + 1e-7, 0.0]), None);
        assert_eq!(Side::Positive.opposite(), Side::Negative);
    }
}
