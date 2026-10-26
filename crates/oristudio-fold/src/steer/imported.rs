//! An imported crease pattern's faces and the faces Edit folds of it, one
//! for one (`implementation-plans/layer-order-dialog.md`, row H10): what lets
//! Fold's Import CP choose its layer order in the Layer order dialog.
//!
//! The dialog analyses a [`LayerSource`], Oriedita's faces of the creases;
//! Fold's import ([`ImportedPattern`]) traces its own faces of the same
//! creases and numbers them its own way. [`ImportedFaces`] matches the two by
//! the rule a saved record's faces are found again by
//! (`restore.rs`): each Oriedita face's interior point lies in one imported
//! face, no two in the same one, and their paper areas agree within
//! [`AREA_TOLERANCE`]. With as many faces on each side, every face is then
//! matched, and an order goes across exactly, pair for pair:
//!
//! - **into the dialog**, an imported order as Oriedita's relations over its
//!   faces ([`ImportedFaces::oriedita_relations`]): the order the dialog
//!   opens on, so an Apply that changed nothing is that order;
//! - **back from it**, the relations its Apply chose as Oriedita relations
//!   over the imported faces ([`ImportedFaces::to_imported`]), which
//!   [`ImportedPattern::oriedita_face_seeds`] turns into the import's seeds:
//!   every pair fixed as the dialog chose it, with the letters.
//!
//! When the faces do not match (a crease one side folds and the other does
//! not), [`FacesDiffer`] says which, and the import keeps its own chooser.
//!
//! **Ori Studio original work**, beside the ports: it reads both through
//! their public accessors and changes neither.

use oristudio_cp::folding::HierarchyRelation;
use oristudio_geometry::convex;
use oristudio_layer_order::{LayerOrder, OrieditaRelation};
use serde::Serialize;
use thiserror::Error;

use super::restore::AREA_TOLERANCE;
use super::source::LayerSource;
use super::stacks::ViewSide;
use crate::import::ImportedPattern;
use crate::pattern::FaceId;

type Point = [f64; 2];

/// Why an import's faces are not the faces Edit folds of its creases. Faces
/// are Oriedita's (the dialog's) indices.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(tag = "cause", rename_all = "snake_case")]
pub enum FacesDiffer {
    /// The two trace different numbers of faces.
    #[error("Edit folds {oriedita} faces, the import {imported}")]
    Count { oriedita: usize, imported: usize },
    /// Oriedita face `face` is no imported face: its interior point lies in
    /// none, or in one another face took, or in one of another area.
    #[error("face {face} is no face of the import")]
    Unmatched { face: FaceId },
}

/// How Fold shows the imported state, in the dialog's terms
/// (`LayerOrderLook`): the side of the folded paper seen, and how far it is
/// turned, clockwise on screen, from Oriedita's picture of that side.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ImportedLook {
    pub side: ViewSide,
    pub turn_deg: f64,
}

/// See the module docs.
#[derive(Debug, Clone, PartialEq)]
pub struct ImportedFaces {
    /// The imported face of each Oriedita face, by its index.
    imported: Vec<FaceId>,
    /// The Oriedita face of each imported face, by its index.
    oriedita: Vec<FaceId>,
    /// The imported face Oriedita's fold starts from.
    start: FaceId,
}

impl ImportedFaces {
    /// Match `layer`'s faces with `pattern`'s (see the module docs).
    pub fn of(
        layer: &LayerSource,
        pattern: &ImportedPattern,
    ) -> Result<ImportedFaces, FacesDiffer> {
        let wireframe = layer.render_inputs().wireframe();
        let parts = pattern.unordered().parts();
        let (n, m) = (wireframe.faces.len(), parts.faces.len());
        if n != m {
            return Err(FacesDiffer::Count {
                oriedita: n,
                imported: m,
            });
        }
        let mut imported = Vec::with_capacity(n);
        let mut oriedita: Vec<Option<FaceId>> = vec![None; m];
        for k in 0..n {
            let face = FaceId(k as u32);
            let unmatched = FacesDiffer::Unmatched { face };
            let point = layer.interior_point(face).ok_or(unmatched.clone())?;
            let f = pattern
                .unordered()
                .face_at(pattern.to_sheet(point))
                .ok_or(unmatched.clone())?;
            let index = parts
                .faces
                .iter()
                .position(|candidate| candidate.id == f)
                .ok_or(unmatched.clone())?;
            if oriedita[index].is_some() {
                return Err(unmatched);
            }
            let theirs = layer.paper_area(face).unwrap_or(0.0).abs();
            let ours = input_area(pattern, index);
            // False for a NaN area too: no match.
            let same_area = (ours - theirs).abs() <= AREA_TOLERANCE * theirs;
            if !same_area {
                return Err(unmatched);
            }
            oriedita[index] = Some(face);
            imported.push(f);
        }
        let start = *imported
            .get(wireframe.starting_face)
            .ok_or(FacesDiffer::Unmatched {
                face: FaceId(wireframe.starting_face as u32),
            })?;
        Ok(ImportedFaces {
            imported,
            // Every slot is filled: n faces, each taking a slot of its own.
            oriedita: oriedita.into_iter().flatten().collect(),
            start,
        })
    }

    /// The imported face of Oriedita face `face`.
    pub fn imported_face(&self, face: FaceId) -> Option<FaceId> {
        self.imported.get(face.0 as usize).copied()
    }

    /// The Oriedita face of imported face `face`.
    pub fn oriedita_face(&self, face: FaceId) -> Option<FaceId> {
        self.oriedita.get(face.0 as usize).copied()
    }

    /// The imported face Oriedita's fold starts from: what
    /// [`ImportedPattern::oriedita_face_seeds`] reads the relations' sense
    /// from.
    pub fn start(&self) -> FaceId {
        self.start
    }

    /// `order`, over the imported faces, as Oriedita's relations over
    /// `layer`'s: every determined pair that shares an Oriedita subface,
    /// ascending, `upper_face` nearer a viewer of the starting face's front,
    /// as [`LayerSource::oriedita_relations`] gives the dialog's own.
    pub fn oriedita_relations(
        &self,
        layer: &LayerSource,
        pattern: &ImportedPattern,
        order: &LayerOrder,
    ) -> Vec<HierarchyRelation> {
        let start_front_up = pattern
            .unordered()
            .isometry(self.start)
            .is_some_and(|t| t.front_up());
        let mut relations: Vec<HierarchyRelation> = order
            .to_oriedita(start_front_up)
            .into_iter()
            .filter_map(|r| {
                let (upper, lower) = (
                    self.oriedita_face(r.upper_face)?,
                    self.oriedita_face(r.lower_face)?,
                );
                layer
                    .shares_subface(upper, lower)
                    .then_some(HierarchyRelation {
                        upper_face: upper.0 as usize,
                        lower_face: lower.0 as usize,
                    })
            })
            .collect();
        relations.sort_by_key(|r| (r.upper_face, r.lower_face));
        relations
    }

    /// Relations over Oriedita's faces, `[upper, lower]` as the dialog's
    /// Apply hands them, as Oriedita relations over the imported faces;
    /// `None` when one names a face Oriedita's fold does not have.
    pub fn to_imported(&self, relations: &[[usize; 2]]) -> Option<Vec<OrieditaRelation>> {
        relations
            .iter()
            .map(|&[upper, lower]| {
                Some(OrieditaRelation {
                    upper_face: *self.imported.get(upper)?,
                    lower_face: *self.imported.get(lower)?,
                })
            })
            .collect()
    }

    /// How Fold shows the imported state (see [`ImportedLook`]): Oriedita
    /// draws its starting face where the crease pattern has it, y down, front
    /// up; Fold draws it through its placement on the sheet, its isometry
    /// into the model frame and the view, y up. The side is the one that map
    /// keeps, and the turn its rotation, read off the images of the crease
    /// pattern's axes (for the back, after the back's mirror image, x ↦ −x).
    pub fn look(&self, pattern: &ImportedPattern) -> ImportedLook {
        let unordered = pattern.unordered();
        let isometry = unordered.isometry(self.start).unwrap_or_default();
        let view = unordered.parts().view.transform();
        let shown = |p: Point| {
            let [x, y] = view.apply(isometry.apply(pattern.to_sheet(p)));
            // The screen's y runs down.
            [x, -y]
        };
        let origin = shown([0.0, 0.0]);
        let axis = |p: Point| {
            let [x, y] = shown(p);
            [x - origin[0], y - origin[1]]
        };
        let (ex, ey) = (axis([1.0, 0.0]), axis([0.0, 1.0]));
        let det = ex[0] * ey[1] - ex[1] * ey[0];
        let side = if det >= 0.0 {
            ViewSide::Front
        } else {
            ViewSide::Back
        };
        // The back's picture is the front's mirrored, x ↦ −x: the crease
        // pattern's x axis lands on the back at −x.
        let x_image = match side {
            ViewSide::Front => ex,
            ViewSide::Back => [-ex[0], -ex[1]],
        };
        let turn = x_image[1].atan2(x_image[0]).to_degrees();
        ImportedLook {
            side,
            turn_deg: wrap_degrees(turn),
        }
    }
}

/// Imported face `index`'s area on the sheet, in the input's units squared
/// (its ring mapped back through the placement).
fn input_area(pattern: &ImportedPattern, index: usize) -> f64 {
    let parts = pattern.unordered().parts();
    let ring: Vec<Point> = parts.faces[index]
        .ring
        .iter()
        .filter_map(|v| parts.vertices.get(v.index()).copied())
        .map(|p| pattern.to_input(p))
        .collect();
    convex::signed_area(&ring).abs()
}

/// An angle in [0, 360), with −0 and values within a hair of 360 as 0.
fn wrap_degrees(degrees: f64) -> f64 {
    let wrapped = degrees.rem_euclid(360.0);
    if (360.0 - wrapped).abs() < 1e-9 || wrapped.abs() < 1e-9 {
        0.0
    } else {
        wrapped
    }
}
