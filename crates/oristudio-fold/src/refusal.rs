//! Typed refusals (plan D4, D14): everything the engine declines to build,
//! naming the faces, vertices and creases involved, with the fixes it can
//! offer. A refusal is never a crash and never an approximation.
//!
//! [`Refusal::code`] is the stable identifier the bridge, the UI and the
//! `fold refused` analytics event use (plan D18).

use oristudio_geometry::Line;
use oristudio_layer_order::Violation;
use serde::Serialize;
use thiserror::Error;

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
pub enum Refusal {
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
}

impl Refusal {
    /// The stable snake_case code.
    pub fn code(&self) -> &'static str {
        match self {
            Refusal::SheetTooFewPoints { .. } => "sheet_too_few_points",
            Refusal::SheetNotFinite => "sheet_not_finite",
            Refusal::SheetNotConvex => "sheet_not_convex",
            Refusal::SheetSideTooShort { .. } => "sheet_side_too_short",
            Refusal::SheetNotInUnitFrame => "sheet_not_in_unit_frame",
            Refusal::InvalidRectangle => "invalid_rectangle",
            Refusal::InvalidSides { .. } => "invalid_sides",
            Refusal::DuplicateId { .. } => "duplicate_id",
            Refusal::UnknownVertex { .. } => "unknown_vertex",
            Refusal::CreaseUnknownVertex { .. } => "crease_unknown_vertex",
            Refusal::UnusedVertex { .. } => "unused_vertex",
            Refusal::FaceTooSmall { .. } => "face_too_small",
            Refusal::MissingCrease { .. } => "missing_crease",
            Refusal::CreaseFaceCount { .. } => "crease_face_count",
            Refusal::NonConvexFace { .. } => "non_convex_face",
            Refusal::AreaMismatch { .. } => "area_mismatch",
            Refusal::UnknownRoot { .. } => "unknown_root",
            Refusal::UnreachedFace { .. } => "unreached_face",
            Refusal::Residual { .. } => "residual",
            Refusal::HingeOrientation { .. } => "hinge_orientation",
            Refusal::FoldedImage { .. } => "folded_image",
            Refusal::LayerOrder { .. } => "layer_order",
            Refusal::NoMovingSide => "no_moving_side",
            Refusal::NearMiss { .. } => "near_miss",
            Refusal::WitnessNotInFace { .. } => "witness_not_in_face",
            Refusal::SeedNotOnMovingSide { .. } => "seed_not_on_moving_side",
            Refusal::EmptySeed => "empty_seed",
            Refusal::NothingStays => "nothing_stays",
            Refusal::ClosureAddsFlaps { .. } => "closure_adds_flaps",
            Refusal::TuckTargetMoves { .. } => "tuck_target_moves",
            Refusal::DegenerateSplit { .. } => "degenerate_split",
            Refusal::ShortCrease { .. } => "short_crease",
            Refusal::ThinPiece { .. } => "thin_piece",
            Refusal::Sliver { .. } => "sliver",
            Refusal::PredictionMismatch { .. } => "prediction_mismatch",
            Refusal::PrecreaseUnfoldMovedMore => "precrease_unfold_moved_more",
        }
    }

    /// The faces the refusal names, ascending.
    pub fn faces(&self) -> Vec<FaceId> {
        let mut faces = match self {
            Refusal::UnknownVertex { face, .. }
            | Refusal::FaceTooSmall { face }
            | Refusal::MissingCrease { face, .. }
            | Refusal::NonConvexFace { face }
            | Refusal::UnknownRoot { face }
            | Refusal::UnreachedFace { face }
            | Refusal::Residual { face, .. }
            | Refusal::TuckTargetMoves { face }
            | Refusal::DegenerateSplit { face }
            | Refusal::ThinPiece { face, .. }
            | Refusal::Sliver { face, .. }
            | Refusal::PredictionMismatch { face, .. } => vec![*face],
            Refusal::HingeOrientation { faces, .. } => faces.to_vec(),
            Refusal::FoldedImage { faces, .. } => faces.clone(),
            Refusal::LayerOrder { violations } => {
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
            Refusal::UnknownVertex { vertex, .. }
            | Refusal::CreaseUnknownVertex { vertex, .. }
            | Refusal::UnusedVertex { vertex }
            | Refusal::Residual { vertex, .. }
            | Refusal::NearMiss { vertex, .. }
            | Refusal::Sliver { vertex, .. } => vec![*vertex],
            Refusal::MissingCrease { vertices, .. } | Refusal::ShortCrease { vertices, .. } => {
                vertices.to_vec()
            }
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
}

/// A refused operation and what could be done instead.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[error("{refusal}")]
pub struct Refused {
    pub refusal: Refusal,
    pub fixes: Vec<Fix>,
}

impl From<Refusal> for Refused {
    fn from(refusal: Refusal) -> Refused {
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
        let r = Refusal::Sliver {
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
            Refusal::NothingStays,
            Refusal::SheetNotConvex,
            Refusal::NearMiss {
                vertex: VertexId(1),
                distance: 1e-4,
                cause: NearMissCause::Band,
            },
            Refusal::ClosureAddsFlaps { added: vec![2] },
            Refusal::LayerOrder {
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
