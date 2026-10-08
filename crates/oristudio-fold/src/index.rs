//! A bounding-box index over face images: which boxes may overlap a query
//! box. The fold asks it which layers a moving piece can touch, so pairs whose
//! boxes are apart are never tested (research §12).
//!
//! A uniform grid over the boxes' extent, about one cell per box. Folded
//! paper stacks many faces in one place, and a query there returns them all;
//! that is the answer, not the index failing.

use oristudio_geometry::convex;

/// Box indices by grid cell.
pub(crate) struct BoxIndex {
    origin: [f64; 2],
    cell: [f64; 2],
    dims: [usize; 2],
    cells: Vec<Vec<u32>>,
    boxes: Vec<[f64; 4]>,
}

impl BoxIndex {
    /// Index `boxes` (`[min_x, min_y, max_x, max_y]`); an inverted box is
    /// never returned.
    pub(crate) fn new(boxes: Vec<[f64; 4]>) -> BoxIndex {
        let extent = boxes.iter().filter(|b| b[0] <= b[2] && b[1] <= b[3]).fold(
            [
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ],
            |e, b| {
                [
                    e[0].min(b[0]),
                    e[1].min(b[1]),
                    e[2].max(b[2]),
                    e[3].max(b[3]),
                ]
            },
        );
        let side = (boxes.len() as f64).sqrt().ceil().max(1.0) as usize;
        let span = [
            (extent[2] - extent[0]).max(f64::MIN_POSITIVE),
            (extent[3] - extent[1]).max(f64::MIN_POSITIVE),
        ];
        let mut index = BoxIndex {
            origin: [extent[0], extent[1]],
            cell: [span[0] / side as f64, span[1] / side as f64],
            dims: [side, side],
            cells: vec![Vec::new(); side * side],
            boxes,
        };
        if !extent[0].is_finite() {
            return index;
        }
        for i in 0..index.boxes.len() {
            let b = index.boxes[i];
            if b[0] > b[2] || b[1] > b[3] {
                continue;
            }
            let ([x0, y0], [x1, y1]) = index.range(&b);
            for y in y0..=y1 {
                for x in x0..=x1 {
                    index.cells[y * index.dims[0] + x].push(i as u32);
                }
            }
        }
        index
    }

    /// Cell coordinates covering a box, clamped to the grid.
    fn range(&self, b: &[f64; 4]) -> ([usize; 2], [usize; 2]) {
        let at = |v: f64, axis: usize| {
            let k = ((v - self.origin[axis]) / self.cell[axis]).floor();
            if k.is_nan() || k < 0.0 {
                0
            } else {
                (k as usize).min(self.dims[axis] - 1)
            }
        };
        ([at(b[0], 0), at(b[1], 1)], [at(b[2], 0), at(b[3], 1)])
    }

    /// The boxes that overlap `query` grown by `margin`, ascending, each once.
    pub(crate) fn query(&self, query: &[f64; 4], margin: f64) -> Vec<usize> {
        let grown = [
            query[0] - margin,
            query[1] - margin,
            query[2] + margin,
            query[3] + margin,
        ];
        let mut hits = Vec::new();
        if self.cells.is_empty() || grown[0] > grown[2] || grown[1] > grown[3] {
            return hits;
        }
        let ([x0, y0], [x1, y1]) = self.range(&grown);
        for y in y0..=y1 {
            for x in x0..=x1 {
                for &i in &self.cells[y * self.dims[0] + x] {
                    if convex::boxes_overlap(&self.boxes[i as usize], query, margin) {
                        hits.push(i as usize);
                    }
                }
            }
        }
        hits.sort_unstable();
        hits.dedup();
        hits
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queries_find_exactly_the_overlapping_boxes() {
        let boxes = vec![
            [0.0, 0.0, 1.0, 1.0],
            [0.5, 0.5, 1.5, 1.5],
            [2.0, 2.0, 3.0, 3.0],
            [0.0, 0.0, 0.1, 0.1],
            [
                f64::INFINITY,
                f64::INFINITY,
                f64::NEG_INFINITY,
                f64::NEG_INFINITY,
            ],
        ];
        let index = BoxIndex::new(boxes.clone());
        for q in &boxes[..4] {
            let brute: Vec<usize> = (0..4)
                .filter(|&i| convex::boxes_overlap(&boxes[i], q, 0.0))
                .collect();
            assert_eq!(index.query(q, 0.0), brute);
        }
        assert_eq!(index.query(&[1.2, 1.2, 1.3, 1.3], 0.0), vec![1]);
        assert_eq!(index.query(&[1.6, 1.6, 1.9, 1.9], 0.0), Vec::<usize>::new());
        assert_eq!(index.query(&[1.6, 1.6, 1.9, 1.9], 0.2), vec![1, 2]);
        assert!(
            BoxIndex::new(Vec::new())
                .query(&[0.0, 0.0, 1.0, 1.0], 0.0)
                .is_empty()
        );
    }
}
