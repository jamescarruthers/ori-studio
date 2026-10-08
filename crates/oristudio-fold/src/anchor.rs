//! Anchors: how a stored step names paper (plan D6). A sheet point names one
//! point of the paper; a [`SheetSegment`] names a straight piece of it by its
//! two end points — an edge or a crease, or any segment lying on one face.
//!
//! Anchors survive replay where face and vertex ids do not: folding only adds
//! creases, so every later face is a subset of an earlier one and a sheet point
//! keeps naming the same paper while the faces around it are split and
//! renumbered (research §10). This module resolves them in a state's model
//! frame, boundaries included: a vertex or a point on a crease lies on several
//! faces, whose isometries agree there within the residual the gate allows.

use oristudio_geometry::{Line, convex};
use serde::{Deserialize, Serialize};

use crate::numerics::{MIN_FEATURE, TOL};
use crate::pattern::FaceId;
use crate::state::State;

type Point = [f64; 2];

/// A straight piece of paper named by its end points in sheet coordinates.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SheetSegment {
    pub a: Point,
    pub b: Point,
}

impl SheetSegment {
    pub fn new(a: Point, b: Point) -> SheetSegment {
        SheetSegment { a, b }
    }

    pub fn length(&self) -> f64 {
        (self.b[0] - self.a[0]).hypot(self.b[1] - self.a[1])
    }

    pub fn midpoint(&self) -> Point {
        [(self.a[0] + self.b[0]) / 2.0, (self.a[1] + self.b[1]) / 2.0]
    }

    /// The point a fraction `u` of the way from `a` to `b`.
    pub fn at(&self, u: f64) -> Point {
        [
            self.a[0] + u * (self.b[0] - self.a[0]),
            self.a[1] + u * (self.b[1] - self.a[1]),
        ]
    }
}

impl State {
    /// The faces whose sheet polygons hold `p`, boundary included (within
    /// the tolerance), in id order: one inside a face, two on a crease, every
    /// face around a vertex; none off the paper.
    pub fn faces_holding(&self, p: Point) -> Vec<FaceId> {
        self.holding_positions(p)
            .into_iter()
            .map(|f| self.faces()[f].id)
            .collect()
    }

    /// The model-frame image of a sheet point anywhere on the paper: inside a
    /// face, on a crease or at a vertex.
    pub fn resolve_point(&self, p: Point) -> Option<Point> {
        let f = *self.holding_positions(p).first()?;
        Some(self.geometry().isometries[f].apply(p))
    }

    /// The faces holding the whole segment, both ends included, in id order:
    /// one for a segment inside a face or along a raw edge, two along a
    /// crease.
    pub fn faces_holding_segment(&self, segment: &SheetSegment) -> Vec<FaceId> {
        self.segment_positions(segment)
            .into_iter()
            .map(|f| self.faces()[f].id)
            .collect()
    }

    /// The model-frame line the segment's image lies on. None when the
    /// segment is shorter than the minimum feature (its direction would be
    /// set by rounding) or no single face holds it (a segment a later fold
    /// bent has no one line).
    pub fn resolve_segment(&self, segment: &SheetSegment) -> Option<Line> {
        if segment.length() < MIN_FEATURE {
            return None;
        }
        let f = *self.segment_positions(segment).first()?;
        let t = self.geometry().isometries[f];
        Line::from_points(t.apply(segment.a), t.apply(segment.b))
    }

    /// Positions of the faces holding `p`.
    pub(crate) fn holding_positions(&self, p: Point) -> Vec<usize> {
        (0..self.faces().len())
            .filter(|&f| holds(&self.sheet_polygon(f), p))
            .collect()
    }

    /// Positions of the faces holding both ends of `segment`.
    pub(crate) fn segment_positions(&self, segment: &SheetSegment) -> Vec<usize> {
        (0..self.faces().len())
            .filter(|&f| {
                let polygon = self.sheet_polygon(f);
                holds(&polygon, segment.a) && holds(&polygon, segment.b)
            })
            .collect()
    }
}

/// Whether a counter-clockwise convex polygon holds `p`, its boundary
/// included within the tolerance.
pub(crate) fn holds(polygon: &[Point], p: Point) -> bool {
    convex::boxes_overlap(
        &convex::bounding_box(polygon),
        &[p[0], p[1], p[0], p[1]],
        TOL,
    ) && convex::contains_point(polygon, p, -TOL)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fold::PlainFold;
    use crate::refusal::Side;
    use crate::sheet::Sheet;
    use crate::view::{Direction, StartSide};

    fn line(n: Point, d: f64) -> Line {
        Line::new(n, d).unwrap_or_else(|| unreachable!())
    }

    /// The square folded in half, the right half over the left.
    fn book() -> State {
        let flat = State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
        let op = PlainFold::new(line([1.0, 0.0], 0.5), Side::Positive, Direction::Valley);
        flat.fold(&op).unwrap_or_else(|e| panic!("{e}")).state
    }

    #[test]
    fn points_resolve_inside_on_creases_and_at_vertices() {
        let s = book();
        let close = |a: Option<Point>, b: Point| {
            a.is_some_and(|a| (a[0] - b[0]).abs() < 1e-12 && (a[1] - b[1]).abs() < 1e-12)
        };
        // Inside the moved half, on the bend, and at a stacked corner.
        assert!(close(s.resolve_point([0.75, 0.25]), [0.25, 0.25]));
        assert_eq!(s.faces_holding([0.5, 0.3]).len(), 2);
        assert!(close(s.resolve_point([0.5, 0.3]), [0.5, 0.3]));
        assert!(close(s.resolve_point([1.0, 0.0]), [0.0, 0.0]));
        assert_eq!(s.faces_holding([1.0, 0.0]).len(), 1);
        assert_eq!(s.faces_holding([0.5, 0.0]).len(), 2);
        // Off the paper.
        assert!(s.resolve_point([1.1, 0.5]).is_none());
        assert!(s.faces_holding([1.0 + 1e-3, 0.5]).is_empty());
        assert!(!s.faces_holding([1.0 + 1e-7, 0.5]).is_empty());
    }

    #[test]
    fn segments_resolve_on_one_face_only() {
        let s = book();
        // The right raw edge lands on x = 0; the bend stays at x = 0.5.
        let edge = SheetSegment::new([1.0, 0.0], [1.0, 1.0]);
        let resolved = s.resolve_segment(&edge);
        assert!(resolved.is_some_and(|l| l.approx_eq(&line([1.0, 0.0], 0.0))));
        let bend = SheetSegment::new([0.5, 0.2], [0.5, 0.9]);
        assert_eq!(s.faces_holding_segment(&bend).len(), 2);
        assert!(
            s.resolve_segment(&bend)
                .is_some_and(|l| l.approx_eq(&line([1.0, 0.0], 0.5)))
        );
        // The bottom edge is bent by the fold: no one line.
        let bottom = SheetSegment::new([0.0, 0.0], [1.0, 0.0]);
        assert!(s.faces_holding_segment(&bottom).is_empty());
        assert!(s.resolve_segment(&bottom).is_none());
        // Too short to have a direction.
        let short = SheetSegment::new([0.2, 0.2], [0.2, 0.2 + MIN_FEATURE / 2.0]);
        assert!(s.resolve_segment(&short).is_none());
    }
}
