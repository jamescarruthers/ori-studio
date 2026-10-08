//! A face image with its edges' half-planes computed once per build. The pair
//! tests, the cell cuts and the edge-through-face tests meet each face
//! hundreds of times, and `oristudio_geometry::convex` normalises every edge
//! again on each call (a `hypot` per edge, which was most of a pair test).
//! The answers are `convex`'s own, from the same half-planes in the same
//! order; the tests hold them to it bit for bit.

use oristudio_geometry::convex::HalfPlane;

use crate::view::{FaceId, FoldedView};

type Point = [f64; 2];

/// One face of a view, ready for repeated tests.
pub(crate) struct Shape<'a> {
    pub(crate) id: FaceId,
    pub(crate) polygon: &'a [Point],
    pub(crate) bbox: [f64; 4],
    /// Left of each edge with a direction, in ring order: the planes
    /// `convex` tests a counter-clockwise ring against.
    pub(crate) planes: Vec<HalfPlane>,
}

impl<'a> Shape<'a> {
    pub(crate) fn new(id: FaceId, polygon: &'a [Point], bbox: [f64; 4]) -> Shape<'a> {
        Shape {
            id,
            polygon,
            bbox,
            planes: planes(polygon),
        }
    }

    /// Every face of the view, in its order.
    pub(crate) fn of_view(view: &'a FoldedView) -> Vec<Shape<'a>> {
        view.faces()
            .iter()
            .enumerate()
            .map(|(i, f)| Shape::new(f.id, &f.polygon, *view.bounding_box(i)))
            .collect()
    }

    /// `convex::penetration(self.polygon, other.polygon)`.
    pub(crate) fn penetration(&self, other: &Shape<'_>) -> f64 {
        let depth = reach(&self.planes, other.polygon).min(reach(&other.planes, self.polygon));
        if depth.is_finite() { depth } else { 0.0 }
    }

    /// `convex::segment_length_inside(a, b, self.polygon, margin)`.
    pub(crate) fn segment_length_inside(&self, a: Point, b: Point, margin: f64) -> f64 {
        let (mut t0, mut t1) = (0.0_f64, 1.0_f64);
        for plane in &self.planes {
            let da = plane.signed_distance(a) - margin;
            let db = plane.signed_distance(b) - margin;
            if da <= 0.0 && db <= 0.0 {
                return 0.0;
            }
            if da < 0.0 {
                t0 = t0.max(da / (da - db));
            } else if db < 0.0 {
                t1 = t1.min(da / (da - db));
            }
            if t1 <= t0 {
                return 0.0;
            }
        }
        if self.planes.is_empty() {
            0.0
        } else {
            (t1 - t0) * (b[0] - a[0]).hypot(b[1] - a[1])
        }
    }
}

/// The half-planes left of a ring's edges, skipping edges with no direction.
pub(crate) fn planes(polygon: &[Point]) -> Vec<HalfPlane> {
    let n = polygon.len();
    (0..n)
        .filter_map(|i| HalfPlane::left_of(polygon[i], polygon[(i + 1) % n]))
        .collect()
}

/// For each plane, how far the points reach into it; the least of those.
/// Infinite when there is no plane.
pub(crate) fn reach(planes: &[HalfPlane], points: &[Point]) -> f64 {
    let mut depth = f64::INFINITY;
    for plane in planes {
        let reach = points
            .iter()
            .map(|&x| plane.signed_distance(x))
            .fold(f64::NEG_INFINITY, f64::max);
        depth = depth.min(reach);
    }
    depth
}

/// `convex::penetration(polygon, shape.polygon)` for a polygon met once.
pub(crate) fn penetration_with(polygon: &[Point], shape: &Shape<'_>) -> f64 {
    let depth = reach(&planes(polygon), shape.polygon).min(reach(&shape.planes, polygon));
    if depth.is_finite() { depth } else { 0.0 }
}

#[cfg(test)]
mod tests {
    use oristudio_geometry::convex;

    use super::*;

    /// SplitMix64.
    struct Rng(u64);

    impl Rng {
        fn next(&mut self) -> f64 {
            self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut z = self.0;
            z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            ((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    /// A convex ring: points on a circle at increasing angles, some of them
    /// nearly coincident so that short edges are skipped.
    fn ring(rng: &mut Rng) -> Vec<Point> {
        let (cx, cy, r) = (rng.next(), rng.next(), 0.05 + rng.next());
        let n = 3 + (rng.next() * 6.0) as usize;
        let mut angles: Vec<f64> = (0..n).map(|_| rng.next() * std::f64::consts::TAU).collect();
        angles.sort_by(f64::total_cmp);
        let mut out: Vec<Point> = angles
            .iter()
            .map(|a| [cx + r * a.cos(), cy + r * a.sin()])
            .collect();
        if rng.next() < 0.3 {
            let p = out[0];
            out.insert(1, [p[0] + 1e-10, p[1]]);
        }
        out
    }

    #[test]
    fn cached_tests_are_convexs_bit_for_bit() {
        let mut rng = Rng(7);
        for _ in 0..4000 {
            let (p, q) = (ring(&mut rng), ring(&mut rng));
            let (sp, sq) = (
                Shape::new(FaceId(0), &p, convex::bounding_box(&p)),
                Shape::new(FaceId(1), &q, convex::bounding_box(&q)),
            );
            let want = convex::penetration(&p, &q);
            assert_eq!(sp.penetration(&sq).to_bits(), want.to_bits());
            assert_eq!(penetration_with(&p, &sq).to_bits(), want.to_bits());
            let (a, b) = (q[0], [rng.next() * 2.0 - 0.5, rng.next() * 2.0 - 0.5]);
            for margin in [0.0, 1e-6, -1e-6] {
                assert_eq!(
                    sp.segment_length_inside(a, b, margin).to_bits(),
                    convex::segment_length_inside(a, b, &p, margin).to_bits()
                );
            }
        }
    }
}
