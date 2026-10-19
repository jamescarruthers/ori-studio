//! Where lines meet other than end to end.
//!
//! **Ori Studio original.** Oriedita's face tracer (`PointSet.calculateFaces`,
//! ported as `FoldGraph::calculate_faces`) assumes its lines meet only at
//! shared endpoints, and Oriedita keeps its own line set that way as lines are
//! drawn. A document opened from elsewhere need not be: a line can end part-way
//! along another (a T-junction), run along it, or cross it. This finds those
//! meetings — so the sheet index can cut its border lines at them, and a
//! sheet's traced faces are trusted only where there are none.
//!
//! "Meet" means within [`Epsilon::POINT`], the distance at which the kernel
//! welds two points into one.

use std::ops::ControlFlow;

use crate::geometry::{Epsilon, Point};

const TOLERANCE: f64 = Epsilon::POINT;

/// Every place one of `segments` is met on its interior — by another's end, or
/// by a crossing — as `(segment, parameter along it)`, in no particular order.
/// `visit` can stop the search early. Segments no longer than the tolerance are
/// points, not lines, and take no part.
pub(crate) fn for_each_meeting(
    segments: &[[Point; 2]],
    mut visit: impl FnMut(usize, f64) -> ControlFlow<()>,
) {
    let low_x = |segment: &[Point; 2]| segment[0].x.min(segment[1].x);
    let high_x = |segment: &[Point; 2]| segment[0].x.max(segment[1].x);
    let low_y = |segment: &[Point; 2]| segment[0].y.min(segment[1].y);
    let high_y = |segment: &[Point; 2]| segment[0].y.max(segment[1].y);

    // Sweep by left edge: only lines whose x-extents overlap can meet.
    let mut order: Vec<usize> = (0..segments.len())
        .filter(|&index| distance(segments[index][0], segments[index][1]) > TOLERANCE)
        .collect();
    order.sort_by(|&i, &j| low_x(&segments[i]).total_cmp(&low_x(&segments[j])));
    let mut active: Vec<usize> = Vec::new();
    for &i in &order {
        let s = segments[i];
        active.retain(|&j| high_x(&segments[j]) >= low_x(&s) - TOLERANCE);
        for &j in &active {
            let t = segments[j];
            if high_y(&t) < low_y(&s) - TOLERANCE || low_y(&t) > high_y(&s) + TOLERANCE {
                continue;
            }
            for end in t {
                if let Some(at) = interior_parameter(s, end)
                    && visit(i, at).is_break()
                {
                    return;
                }
            }
            for end in s {
                if let Some(at) = interior_parameter(t, end)
                    && visit(j, at).is_break()
                {
                    return;
                }
            }
            if let Some((at_s, at_t)) = crossing(s, t)
                && (visit(i, at_s).is_break() || visit(j, at_t).is_break())
            {
                return;
            }
        }
        active.push(i);
    }
}

/// Whether these lines meet nowhere but at shared endpoints: the plane graph a
/// face tracer can read. Stops at the first meeting found.
pub(crate) fn meet_only_at_ends(segments: &[[Point; 2]]) -> bool {
    let mut met = false;
    for_each_meeting(segments, |_, _| {
        met = true;
        ControlFlow::Break(())
    });
    !met
}

/// The lines cut wherever another ends on them or crosses them, so that every
/// meeting is a shared endpoint. Pieces no longer than the tolerance are
/// dropped, and so are segments that were points to begin with.
pub(crate) fn split_where_they_meet(segments: &[[Point; 2]]) -> Vec<[Point; 2]> {
    let mut cuts: Vec<Vec<f64>> = vec![Vec::new(); segments.len()];
    for_each_meeting(segments, |segment, at| {
        cuts[segment].push(at);
        ControlFlow::Continue(())
    });

    let mut pieces = Vec::with_capacity(segments.len());
    for (segment, mut at) in segments.iter().zip(cuts) {
        at.push(0.0);
        at.push(1.0);
        at.sort_by(f64::total_cmp);
        let length = distance(segment[0], segment[1]);
        let mut from = 0.0;
        for &to in &at[1..] {
            if (to - from) * length <= TOLERANCE {
                continue;
            }
            pieces.push([lerp(*segment, from), lerp(*segment, to)]);
            from = to;
        }
    }
    pieces
}

/// Where `point` lies on `segment`'s interior, as a parameter along it, or
/// `None` when it is off the segment or within the tolerance of either end
/// (an end is a meeting the weld already makes).
fn interior_parameter(segment: [Point; 2], point: Point) -> Option<f64> {
    let direction = sub(segment[1], segment[0]);
    let length_sq = dot(direction, direction);
    let at = dot(sub(point, segment[0]), direction) / length_sq;
    let margin = TOLERANCE / length_sq.sqrt();
    if at <= margin || at >= 1.0 - margin {
        return None;
    }
    (distance(lerp(segment, at), point) <= TOLERANCE).then_some(at)
}

/// Where two segments cross in both interiors, as a parameter along each. Lines
/// that only touch, or run along one another, meet at an end and are found by
/// [`interior_parameter`].
fn crossing(s: [Point; 2], t: [Point; 2]) -> Option<(f64, f64)> {
    let r = sub(s[1], s[0]);
    let q = sub(t[1], t[0]);
    let denominator = cross(r, q);
    let scale = dot(r, r).sqrt() * dot(q, q).sqrt();
    if denominator.abs() <= 1e-12 * scale {
        return None;
    }
    let w = sub(t[0], s[0]);
    let at_s = cross(w, q) / denominator;
    let at_t = cross(w, r) / denominator;
    let margin_s = TOLERANCE / dot(r, r).sqrt();
    let margin_t = TOLERANCE / dot(q, q).sqrt();
    (at_s > margin_s && at_s < 1.0 - margin_s && at_t > margin_t && at_t < 1.0 - margin_t)
        .then_some((at_s, at_t))
}

pub(crate) fn sub(a: Point, b: Point) -> Point {
    Point::new(a.x - b.x, a.y - b.y)
}

pub(crate) fn dot(a: Point, b: Point) -> f64 {
    a.x * b.x + a.y * b.y
}

pub(crate) fn cross(a: Point, b: Point) -> f64 {
    a.x * b.y - a.y * b.x
}

pub(crate) fn distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).hypot(a.y - b.y)
}

pub(crate) fn lerp(segment: [Point; 2], at: f64) -> Point {
    Point::new(
        segment[0].x + (segment[1].x - segment[0].x) * at,
        segment[0].y + (segment[1].y - segment[0].y) * at,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(ax: f64, ay: f64, bx: f64, by: f64) -> [Point; 2] {
        [Point::new(ax, ay), Point::new(bx, by)]
    }

    #[test]
    fn lines_meeting_end_to_end_meet_only_at_ends() {
        let square = [
            line(0.0, 0.0, 4.0, 0.0),
            line(4.0, 0.0, 4.0, 4.0),
            line(4.0, 4.0, 0.0, 4.0),
            line(0.0, 4.0, 0.0, 0.0),
            line(0.0, 0.0, 4.0, 4.0),
        ];
        assert!(meet_only_at_ends(&square));
        // A duplicate is end to end with its twin: the weld makes them one edge.
        assert!(meet_only_at_ends(&[square[0], square[0]]));
    }

    #[test]
    fn an_end_on_another_line_a_crossing_and_an_overlap_are_meetings() {
        let t_junction = [line(0.0, 0.0, 8.0, 0.0), line(4.0, 0.0, 4.0, 4.0)];
        let crossing = [line(0.0, 0.0, 4.0, 4.0), line(0.0, 4.0, 4.0, 0.0)];
        let overlap = [line(0.0, 0.0, 4.0, 0.0), line(2.0, 0.0, 6.0, 0.0)];
        for lines in [t_junction, crossing, overlap] {
            assert!(!meet_only_at_ends(&lines), "{lines:?}");
        }
    }

    #[test]
    fn lines_closer_than_the_weld_meet_and_further_ones_do_not() {
        let near = [
            line(0.0, 0.0, 8.0, 0.0),
            line(4.0, TOLERANCE / 2.0, 4.0, 4.0),
        ];
        let far = [
            line(0.0, 0.0, 8.0, 0.0),
            line(4.0, TOLERANCE * 4.0, 4.0, 4.0),
        ];
        assert!(!meet_only_at_ends(&near));
        assert!(meet_only_at_ends(&far));
    }

    #[test]
    fn a_point_drawn_as_a_line_takes_no_part() {
        let lines = [line(0.0, 0.0, 8.0, 0.0), line(4.0, 0.0, 4.0, 0.0)];
        assert!(meet_only_at_ends(&lines));
        assert_eq!(split_where_they_meet(&lines), vec![lines[0]]);
    }

    #[test]
    fn splitting_cuts_each_line_where_it_is_met() {
        let pieces = split_where_they_meet(&[
            line(0.0, 0.0, 8.0, 0.0),
            line(4.0, 0.0, 4.0, 4.0),
            line(2.0, -1.0, 2.0, 1.0),
        ]);
        assert_eq!(
            pieces,
            vec![
                line(0.0, 0.0, 2.0, 0.0),
                line(2.0, 0.0, 4.0, 0.0),
                line(4.0, 0.0, 8.0, 0.0),
                line(4.0, 0.0, 4.0, 4.0),
                line(2.0, -1.0, 2.0, 0.0),
                line(2.0, 0.0, 2.0, 1.0),
            ]
        );
        assert!(meet_only_at_ends(&pieces));
    }
}
