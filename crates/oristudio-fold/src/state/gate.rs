//! The gate every state passes (research §3.3, plan D4): the checks
//! [`super::State::make`] runs, in order, each refusal naming what failed.
//!
//! 1. Structure: unique ids, a root, every ring side a crease, every crease
//!    bounding one face (border) or two.
//! 2. Faces convex and counter-clockwise in sheet coordinates, covering the
//!    sheet.
//! 3. Isometries from the root, every vertex landing in one place
//!    (residual ≤ tol).
//! 4. Hinge consistency: a folded crease joins faces of opposite orientation,
//!    a flat one faces of the same. The residual alone once admitted a state
//!    that broke this (the squash spike, research §3.3).
//! 5. The folded image as the layer order sees it: convex face images, every
//!    crease on the boundary of both its faces with the sides its kind says.
//! 6. The layer order through `oristudio-layer-order`'s checker: complete on
//!    overlapping pairs, transitive in every cell, the taco-taco,
//!    taco-tortilla and tortilla-tortilla families, and every letter derived
//!    from the order.

use std::collections::BTreeSet;

use oristudio_geometry::convex;
use oristudio_layer_order::{
    ConstraintProblem, Edge, EdgeKind, Face as ViewFace, FacePair, FoldedView, LayerOrder,
    LayerOrderError, Scope, Violation, check_problem,
};

use crate::numerics::TOL;
use crate::pattern::{CreaseKind, FaceId};
use crate::refusal::FoldRefusal;
use crate::state::derive::{Geometry, Topology};
use crate::state::{Derived, State, StateParts};

/// Run the gate. With a previous state and the faces an operation touched,
/// the layer-order problem is rebuilt incrementally and its constraints are
/// checked where they involve a touched face; pair completeness is always
/// checked in full, so a pair an operation forgot to carry is never missed.
pub(super) fn run(
    parts: &StateParts,
    previous: Option<(&State, &BTreeSet<FaceId>)>,
) -> Result<Derived, FoldRefusal> {
    for pair in parts.faces.windows(2) {
        if pair[0].id == pair[1].id {
            return Err(FoldRefusal::DuplicateId {
                what: "face",
                id: pair[0].id.0,
            });
        }
    }
    for pair in parts.creases.windows(2) {
        if pair[0].id == pair[1].id {
            return Err(FoldRefusal::DuplicateId {
                what: "crease",
                id: pair[0].id.0,
            });
        }
    }
    let root = parts
        .faces
        .binary_search_by_key(&parts.root, |f| f.id)
        .map_err(|_| FoldRefusal::UnknownRoot { face: parts.root })?;

    let topology = Topology::build(parts)?;

    let mut area = 0.0;
    for face in &parts.faces {
        let ring: Vec<[f64; 2]> = face
            .ring
            .iter()
            .map(|v| parts.vertices[v.index()])
            .collect();
        if !convex::is_convex(&ring, TOL) {
            return Err(FoldRefusal::NonConvexFace { face: face.id });
        }
        area += convex::signed_area(&ring);
    }
    let sheet_area = parts.sheet.area();
    if (area - sheet_area).abs() > TOL {
        return Err(FoldRefusal::AreaMismatch {
            faces_area: area,
            sheet_area,
        });
    }

    let geometry = Geometry::derive(parts, &topology, root, TOL)?;

    let mut edges = Vec::new();
    let mut view_creases = Vec::new();
    for (k, crease) in parts.creases.iter().enumerate() {
        if crease.kind == CreaseKind::Border {
            continue;
        }
        let [f, g] = [topology.crease_faces[k][0], topology.crease_faces[k][1]];
        let folded = crease.kind.is_folded();
        let (f_up, g_up) = (
            geometry.isometries[f].front_up(),
            geometry.isometries[g].front_up(),
        );
        if folded == (f_up == g_up) {
            return Err(FoldRefusal::HingeOrientation {
                edge: crease.id,
                faces: [parts.faces[f].id, parts.faces[g].id],
                kind: if folded { "folded" } else { "flat" },
            });
        }
        let t = &geometry.isometries[f];
        edges.push(Edge {
            faces: [parts.faces[f].id, parts.faces[g].id],
            segment: crease.vertices.map(|v| t.apply(parts.vertices[v.index()])),
            kind: match crease.kind {
                CreaseKind::Folded(letter) => EdgeKind::Folded(Some(letter)),
                _ => EdgeKind::Flat,
            },
        });
        view_creases.push(k);
    }
    let faces = parts
        .faces
        .iter()
        .zip(&geometry.images)
        .zip(&geometry.isometries)
        .map(|((face, image), t)| ViewFace {
            id: face.id,
            polygon: image.clone(),
            front_up: t.front_up(),
        })
        .collect();
    let view = FoldedView::new(faces, edges)
        .map_err(|e| folded_image(&e, parts, &topology, &view_creases))?;

    let (problem, scope_faces) = match previous {
        Some((previous, touched)) => {
            let mut scope: BTreeSet<FaceId> = touched.clone();
            scope.extend(
                parts
                    .faces
                    .iter()
                    .map(|f| f.id)
                    .filter(|&id| previous.face_position(id).is_none()),
            );
            (previous.derived.problem.rebuild(&view, &scope), Some(scope))
        }
        None => (ConstraintProblem::build(&view), None),
    };
    let scope = match &scope_faces {
        Some(faces) => Scope::Faces(faces),
        None => Scope::All,
    };
    let report = check_problem(&problem, &view, &parts.order, scope)
        .map_err(|e| folded_image(&e, parts, &topology, &view_creases))?;
    let mut violations: BTreeSet<Violation> = report.violations.into_iter().collect();
    if scope_faces.is_some() {
        violations.extend(pair_completeness(&problem, &parts.order));
    }
    if !violations.is_empty() {
        return Err(FoldRefusal::LayerOrder {
            violations: violations.into_iter().collect(),
        });
    }
    Ok(Derived {
        topology,
        geometry,
        view,
        problem,
    })
}

/// Missing, undetermined and extra pairs over the whole state, by one merge
/// of two sorted lists.
fn pair_completeness(problem: &ConstraintProblem, order: &LayerOrder) -> Vec<Violation> {
    let mut out = Vec::new();
    let variables = problem.variables();
    let mut pairs = order.pairs().peekable();
    let mut v = 0;
    loop {
        let next_var = variables.get(v).copied();
        let next_pair: Option<(FacePair, Option<bool>)> = pairs.peek().copied();
        match (next_var, next_pair) {
            (None, None) => break,
            (Some(var), None) => {
                out.push(Violation::MissingPair { pair: var });
                v += 1;
            }
            (None, Some((pair, _))) => {
                out.push(Violation::ExtraPair { pair });
                pairs.next();
            }
            (Some(var), Some((pair, lo_above))) => match var.cmp(&pair) {
                std::cmp::Ordering::Less => {
                    out.push(Violation::MissingPair { pair: var });
                    v += 1;
                }
                std::cmp::Ordering::Greater => {
                    out.push(Violation::ExtraPair { pair });
                    pairs.next();
                }
                std::cmp::Ordering::Equal => {
                    if lo_above.is_none() {
                        out.push(Violation::UndeterminedPair { pair });
                    }
                    v += 1;
                    pairs.next();
                }
            },
        }
    }
    out
}

/// A malformed folded image, with the faces it involves. `view_creases` maps
/// the folded view's edges to crease positions.
fn folded_image(
    error: &LayerOrderError,
    parts: &StateParts,
    topology: &Topology,
    view_creases: &[usize],
) -> FoldRefusal {
    let faces = match error {
        LayerOrderError::DuplicateFace(f)
        | LayerOrderError::NonConvexFace(f)
        | LayerOrderError::DegenerateFace(f)
        | LayerOrderError::SameFace(f)
        | LayerOrderError::FaceNotInView(f) => vec![*f],
        LayerOrderError::InvalidPolygon { face, .. }
        | LayerOrderError::UnknownEdgeFace { face, .. }
        | LayerOrderError::SelfEdge { face, .. }
        | LayerOrderError::EdgeOffFace { face, .. } => vec![*face],
        LayerOrderError::ContradictoryOrder { pair } => pair.faces().to_vec(),
        LayerOrderError::EdgeKindMismatch { edge, .. }
        | LayerOrderError::DegenerateEdge { edge, .. } => view_creases
            .get(*edge)
            .map(|&k| {
                topology.crease_faces[k]
                    .iter()
                    .map(|&f| parts.faces[f].id)
                    .collect()
            })
            .unwrap_or_default(),
        LayerOrderError::InvalidFaceOrder { .. } | LayerOrderError::ProblemMismatch => Vec::new(),
    };
    FoldRefusal::FoldedImage {
        message: error.to_string(),
        faces,
    }
}
