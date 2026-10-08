//! The overlay of the face images into cells: convex regions, each lying in
//! one fixed set of faces. Transitivity is derived from it (three faces that
//! share a cell are stacked there, so their order cannot be cyclic), so the
//! checker and a completion search that both read these cells agree on it by
//! construction; it is also where Fold's display cells (`subfaces`) come from.
//!
//! # Construction
//!
//! It starts from one empty cell, a box around every face. Faces are added in
//! view order, and each cuts every cell it overlaps into the part inside it
//! (which gains the face) and pieces outside it; at the end the cells no face
//! covers are dropped. Every cut is [`convex::carve`] at [`TOL`]: nothing
//! `TOL` wide or less is ever cut off, so every cell is wider than `TOL`, and
//! a face joins a cell only when it covers more than a sliver of it. There is
//! no global point merging, the step whose ε heuristic built a wrong
//! arrangement for 7% of the spike's states in Flat-Folder (research §7).
//!
//! Cells are a cover up to the tolerance: two may overlap, or leave a gap,
//! by at most `TOL`. Cutting along whole edge lines splits more finely than
//! the arrangement would, so cells with equal face sets can sit side by side;
//! on the spike's states there are one to four cells per face.
//!
//! Taking the uncovered part of each face out of the cells it meets instead
//! of starting from a box gave nearly the same cells, but cost 1.4 s against
//! 38 ms on a 315-face state, almost all of it subtracting cells from the
//! fragments of the face.

use std::collections::{BTreeMap, BTreeSet};

use oristudio_geometry::convex;
use oristudio_geometry::tol::TOL;

use crate::view::{FaceId, FoldedView};

/// One cell of the overlay.
#[derive(Debug, Clone, PartialEq)]
pub struct Cell {
    /// Counter-clockwise and convex, wider than [`TOL`].
    pub polygon: Vec<[f64; 2]>,
    /// The faces covering it, ascending.
    pub faces: Vec<FaceId>,
}

/// The cells of a view, with each face's cells.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Overlay {
    cells: Vec<Cell>,
    faces_cells: BTreeMap<FaceId, Vec<usize>>,
    /// Per cell, its faces' positions in the view, in `faces` order.
    positions: Vec<Vec<usize>>,
    /// The first cell of each distinct face set, ascending.
    distinct: Vec<usize>,
}

impl Overlay {
    /// Overlay every face of the view. A face covers at least one cell
    /// unless every cell it overlaps meets it in a sliver;
    /// [`crate::ConstraintProblem`] then reports its overlaps as ambiguous.
    pub fn build(view: &FoldedView) -> Overlay {
        struct Draft {
            polygon: Vec<[f64; 2]>,
            bbox: [f64; 4],
            faces: Vec<usize>,
        }
        let draft = |polygon: Vec<[f64; 2]>, faces: Vec<usize>| Draft {
            bbox: convex::bounding_box(&polygon),
            polygon,
            faces,
        };
        let faces = view.faces();
        let mut cells: Vec<Draft> = Vec::new();
        if let Some(universe) = universe(view) {
            cells.push(draft(universe, Vec::new()));
        }
        for (i, face) in faces.iter().enumerate() {
            let bbox = *view.bounding_box(i);
            for c in 0..cells.len() {
                let cell = &cells[c];
                if !convex::boxes_overlap(&cell.bbox, &bbox, 0.0)
                    || convex::penetration(&cell.polygon, &face.polygon) <= TOL
                {
                    continue;
                }
                let Some(carved) = convex::carve(&cell.polygon, &face.polygon, TOL) else {
                    continue;
                };
                // Pieces outside the face keep the cell's faces; they lie
                // outside it, so this loop need not visit them.
                let before = cells[c].faces.clone();
                cells.extend(carved.outside.into_iter().map(|p| draft(p, before.clone())));
                cells[c].bbox = convex::bounding_box(&carved.inside);
                cells[c].polygon = carved.inside;
                cells[c].faces.push(i);
            }
        }
        let mut faces_cells: BTreeMap<FaceId, Vec<usize>> =
            faces.iter().map(|f| (f.id, Vec::new())).collect();
        let mut positions = Vec::new();
        let cells: Vec<Cell> = cells
            .into_iter()
            .filter(|d| !d.faces.is_empty())
            .enumerate()
            .map(|(c, mut d)| {
                d.faces.sort_unstable_by_key(|&i| faces[i].id);
                let ids: Vec<FaceId> = d.faces.iter().map(|&i| faces[i].id).collect();
                for id in &ids {
                    faces_cells.entry(*id).or_default().push(c);
                }
                positions.push(d.faces);
                Cell {
                    polygon: d.polygon,
                    faces: ids,
                }
            })
            .collect();
        let mut seen = BTreeSet::new();
        let distinct = (0..cells.len())
            .filter(|&c| seen.insert(cells[c].faces.as_slice()))
            .collect();
        Overlay {
            faces_cells,
            positions,
            distinct,
            cells,
        }
    }

    pub fn cells(&self) -> &[Cell] {
        &self.cells
    }

    /// The cells a face covers, ascending; empty for a face not in the view.
    pub fn faces_cells(&self, face: FaceId) -> &[usize] {
        self.faces_cells.get(&face).map_or(&[], Vec::as_slice)
    }

    /// The faces other than `f` and `g` that share a cell with both: the
    /// third faces of their transitivity constraints.
    pub fn third_faces(&self, f: FaceId, g: FaceId) -> BTreeSet<FaceId> {
        let g_cells: BTreeSet<usize> = self.faces_cells(g).iter().copied().collect();
        self.faces_cells(f)
            .iter()
            .filter(|c| g_cells.contains(c))
            .flat_map(|&c| self.cells[c].faces.iter().copied())
            .filter(|&h| h != f && h != g)
            .collect()
    }

    /// Whether `f` and `g` share a cell.
    pub fn share_cell(&self, f: FaceId, g: FaceId) -> bool {
        let g_cells = self.faces_cells(g);
        self.faces_cells(f)
            .iter()
            .any(|c| g_cells.binary_search(c).is_ok())
    }

    /// Cell `c`'s faces as positions in the view it was built from.
    pub(crate) fn positions(&self, c: usize) -> &[usize] {
        &self.positions[c]
    }

    /// One cell per distinct face set: what a test over each cell's faces
    /// needs to visit.
    pub(crate) fn distinct_cells(&self) -> &[usize] {
        &self.distinct
    }
}

/// A box around every face with a margin as wide as the faces' extent, so
/// no face edge lies near its sides; `None` for a view without faces.
fn universe(view: &FoldedView) -> Option<Vec<[f64; 2]>> {
    let n = view.faces().len();
    let [x0, y0, x1, y1] = (0..n).map(|i| *view.bounding_box(i)).reduce(|a, b| {
        [
            a[0].min(b[0]),
            a[1].min(b[1]),
            a[2].max(b[2]),
            a[3].max(b[3]),
        ]
    })?;
    let margin = (x1 - x0).max(y1 - y0).max(1.0);
    let (x0, y0, x1, y1) = (x0 - margin, y0 - margin, x1 + margin, y1 + margin);
    Some(vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::view::Face;

    fn rect(x0: f64, y0: f64, x1: f64, y1: f64) -> Vec<[f64; 2]> {
        vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    }

    fn view(polygons: Vec<Vec<[f64; 2]>>) -> FoldedView {
        let faces = polygons
            .into_iter()
            .enumerate()
            .map(|(i, polygon)| Face {
                id: FaceId(i as u32),
                polygon,
                front_up: true,
            })
            .collect();
        FoldedView::new(faces, Vec::new()).unwrap_or_else(|e| panic!("{e}"))
    }

    fn ids(ids: &[u32]) -> Vec<FaceId> {
        ids.iter().map(|&i| FaceId(i)).collect()
    }

    /// Total cell area per face set.
    fn areas(overlay: &Overlay) -> BTreeMap<Vec<FaceId>, f64> {
        let mut out = BTreeMap::new();
        for cell in overlay.cells() {
            *out.entry(cell.faces.clone()).or_insert(0.0) += convex::signed_area(&cell.polygon);
        }
        out
    }

    fn assert_area(areas: &BTreeMap<Vec<FaceId>, f64>, faces: &[u32], area: f64) {
        let got = areas.get(&ids(faces)).copied().unwrap_or(0.0);
        assert!((got - area).abs() < 1e-12, "{faces:?}: {got} != {area}");
    }

    #[test]
    fn coincident_faces_share_one_cell() {
        let overlay = Overlay::build(&view(vec![rect(0.0, 0.0, 1.0, 1.0); 3]));
        assert_eq!(overlay.cells().len(), 1);
        assert_eq!(overlay.cells()[0].faces, ids(&[0, 1, 2]));
        assert_eq!(
            overlay.third_faces(FaceId(0), FaceId(2)),
            ids(&[1]).into_iter().collect()
        );
    }

    #[test]
    fn overlapping_squares_split_into_three_regions() {
        let overlay = Overlay::build(&view(vec![
            rect(0.0, 0.0, 2.0, 2.0),
            rect(1.0, 1.0, 3.0, 3.0),
        ]));
        let a = areas(&overlay);
        assert_area(&a, &[0], 3.0);
        assert_area(&a, &[1], 3.0);
        assert_area(&a, &[0, 1], 1.0);
        assert_eq!(a.len(), 3);
        assert!(overlay.share_cell(FaceId(0), FaceId(1)));
        for cell in overlay.cells() {
            assert!(convex::is_convex(&cell.polygon, TOL));
            assert!(convex::width(&cell.polygon) > TOL);
        }
    }

    #[test]
    fn faces_that_only_touch_share_no_cell() {
        // Side by side, corner to corner, and overlapping by a sliver.
        let overlay = Overlay::build(&view(vec![
            rect(0.0, 0.0, 1.0, 1.0),
            rect(1.0, 0.0, 2.0, 1.0),
            rect(2.0, 1.0, 3.0, 2.0),
            rect(0.0, 1.0 - 1e-7, 1.0, 2.0),
        ]));
        for (f, g) in [(0, 1), (1, 2), (0, 3)] {
            assert!(!overlay.share_cell(FaceId(f), FaceId(g)), "{f} {g}");
        }
        assert_eq!(overlay.cells().len(), 4);
    }

    #[test]
    fn a_stack_with_a_shifted_layer() {
        // Two coincident layers and a third covering half of them and more.
        let overlay = Overlay::build(&view(vec![
            rect(0.0, 0.0, 1.0, 1.0),
            rect(0.0, 0.0, 1.0, 1.0),
            rect(0.5, 0.0, 1.5, 1.0),
        ]));
        let a = areas(&overlay);
        assert_area(&a, &[0, 1], 0.5);
        assert_area(&a, &[0, 1, 2], 0.5);
        assert_area(&a, &[2], 0.5);
        assert_eq!(
            overlay.third_faces(FaceId(0), FaceId(2)),
            ids(&[1]).into_iter().collect()
        );
        assert!(overlay.faces_cells(FaceId(9)).is_empty());
    }

    #[test]
    fn cells_cover_each_face_once() {
        // Triangles and squares at odd angles: the cells of each face sum to
        // its area, and no two cells overlap.
        let tri = |cx: f64, cy: f64, r: f64, t: f64| -> Vec<[f64; 2]> {
            (0..3)
                .map(|k| {
                    let a = t + k as f64 * std::f64::consts::TAU / 3.0;
                    [cx + r * a.cos(), cy + r * a.sin()]
                })
                .collect()
        };
        let polygons = vec![
            tri(0.0, 0.0, 1.0, 0.1),
            tri(0.3, 0.2, 0.8, 0.7),
            rect(-0.5, -0.4, 0.6, 0.3),
            tri(-0.2, 0.1, 0.6, 2.0),
            tri(0.0, 0.0, 1.0, 0.1),
        ];
        let v = view(polygons);
        let overlay = Overlay::build(&v);
        for face in v.faces() {
            let total: f64 = overlay
                .faces_cells(face.id)
                .iter()
                .map(|&c| convex::signed_area(&overlay.cells()[c].polygon))
                .sum();
            let area = convex::signed_area(&face.polygon);
            assert!(
                (total - area).abs() < 1e-9,
                "face {}: {total} != {area}",
                face.id
            );
        }
        let cells = overlay.cells();
        for i in 0..cells.len() {
            for j in i + 1..cells.len() {
                assert!(
                    !convex::overlaps(&cells[i].polygon, &cells[j].polygon),
                    "{i} {j}"
                );
            }
        }
    }
}
