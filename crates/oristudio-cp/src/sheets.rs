//! The sheets a canvas holds: each separate crease pattern, found from its
//! border.
//!
//! **Ori Studio original.** Oriedita edits one sheet; this canvas holds as many
//! patterns as the user lays out, and several surfaces need to know which one a
//! line belongs to — the selection toolbar asking whether a selection is one
//! whole pattern, the Diagram resolving a step's pattern, Simulate listing them,
//! References planning one. This is the answer they share
//! (`implementation-plans/large-document-open-and-select.md`, Phase 2).
//!
//! # What a sheet is
//!
//! The region inside a closed **outer** border. Border (`Black0`) lines are split
//! where they meet or cross one another and welded at [`Epsilon::POINT`] — the
//! kernel's own "same point" — and each connected group's outer boundary is
//! traced. A border line *inside* that boundary — a wall across the sheet, a
//! tail into it, a loop within it — neither splits the sheet nor makes one: it
//! is a member like any crease. An area closed only by creases is not a sheet.
//!
//! A loop with nothing drawn inside it is still a hole when the sheet's faces are
//! built (`FoldGraph::drop_hole_faces`). That is a question about faces, not
//! about which lines belong where, so it is answered there.
//!
//! # Which lines a sheet holds
//!
//! Every line whose midpoint lies inside the outline or on it, of every colour:
//! the rule region containment has always used, so a pattern's lines are the
//! lines its saved fingerprints were taken over.
//!
//! # Cost
//!
//! Only the border lines are arranged — 13,169 of the 489,093 lines on the
//! largest canvas measured — and every line then costs one grid lookup and a
//! point-in-polygon test against the few sheets near it. No crease face is ever
//! traced.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::fold_graph::VertexIndex;
use crate::geometry::{Epsilon, LineColor, LineSegment, Point};
use crate::meetings::{cross, distance, dot, lerp, split_where_they_meet, sub};
use crate::model::CreasePatternModel;

/// Two points this close are one, and a point this close to a line is on it.
const TOLERANCE: f64 = Epsilon::POINT;

/// One sheet: its outline, the box around it, and how many lines it holds.
#[derive(Debug, Clone, PartialEq)]
pub struct Sheet {
    /// The outer border as a closed ring of corners, wound with positive signed
    /// area in the model's own axes. Vertices that only subdivide a straight
    /// edge are dropped, so a square is four points however its sides were split.
    pub outline: Vec<Point>,
    /// `[min_x, min_y, max_x, max_y]` of the outline.
    pub bounds: [f64; 4],
    /// How many lines of the document lie in this sheet.
    pub line_count: u32,
}

/// Every sheet of a document, and which one each line is in.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SheetIndex {
    /// In reading order — top first, then left first — as segmentation has always
    /// numbered regions.
    pub sheets: Vec<Sheet>,
    /// For each line of `line_segments`, in order: the index of its sheet in
    /// [`Self::sheets`], or `-1` for a line inside no sheet.
    pub line_sheet: Vec<i32>,
}

/// The sheets of `model`. See the module docs for what a sheet is.
pub fn sheet_index(model: &CreasePatternModel) -> SheetIndex {
    let mut sheets: Vec<Sheet> = outer_borders(&model.line_segments)
        .into_iter()
        .map(|outline| Sheet {
            bounds: bounds_of(&outline),
            outline,
            line_count: 0,
        })
        .collect();
    sheets.sort_by(|a, b| {
        a.bounds[1]
            .total_cmp(&b.bounds[1])
            .then(a.bounds[0].total_cmp(&b.bounds[0]))
    });
    let line_sheet = place_lines(&model.line_segments, &mut sheets);
    SheetIndex { sheets, line_sheet }
}

/// [`SheetIndex`] as flat arrays, the shape both bridges hand to the frontend.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct CompactSheetIndex {
    /// `[min_x, min_y, max_x, max_y]` per sheet.
    pub bounds: Vec<f64>,
    /// Sheet `i`'s outline is vertices `outline_offsets[i]..outline_offsets[i + 1]`
    /// of `outline_coords`; `sheet count + 1` entries.
    pub outline_offsets: Vec<u32>,
    /// `[x, y]` per outline vertex.
    pub outline_coords: Vec<f64>,
    /// Lines per sheet.
    pub line_counts: Vec<u32>,
    /// Per line: its sheet, or `-1`.
    pub line_sheet: Vec<i32>,
}

/// Leads the binary form, and changes whenever its layout does, so a stale
/// decoder fails instead of misreading.
pub const COMPACT_SHEET_INDEX_MAGIC: u32 = 0x4f53_4931; // "OSI1"

impl From<&SheetIndex> for CompactSheetIndex {
    fn from(index: &SheetIndex) -> Self {
        let mut compact = Self {
            line_sheet: index.line_sheet.clone(),
            ..Self::default()
        };
        compact.outline_offsets.push(0);
        for sheet in &index.sheets {
            compact.bounds.extend_from_slice(&sheet.bounds);
            for point in &sheet.outline {
                compact.outline_coords.push(point.x);
                compact.outline_coords.push(point.y);
            }
            compact
                .outline_offsets
                .push((compact.outline_coords.len() / 2) as u32);
            compact.line_counts.push(sheet.line_count);
        }
        compact
    }
}

impl CompactSheetIndex {
    /// Little-endian: the magic and five array lengths, then the arrays —
    /// `bounds` and `outline_coords` (f64), `outline_offsets` and `line_counts`
    /// (u32), `line_sheet` (i32). The f64 arrays come first so they start
    /// 8-byte aligned after the 24-byte header.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(
            24 + (self.bounds.len() + self.outline_coords.len()) * 8
                + (self.outline_offsets.len() + self.line_counts.len() + self.line_sheet.len()) * 4,
        );
        out.extend_from_slice(&COMPACT_SHEET_INDEX_MAGIC.to_le_bytes());
        for count in [
            self.bounds.len(),
            self.outline_coords.len(),
            self.outline_offsets.len(),
            self.line_counts.len(),
            self.line_sheet.len(),
        ] {
            out.extend_from_slice(&(count as u32).to_le_bytes());
        }
        for value in self.bounds.iter().chain(&self.outline_coords) {
            out.extend_from_slice(&value.to_le_bytes());
        }
        for value in self.outline_offsets.iter().chain(&self.line_counts) {
            out.extend_from_slice(&value.to_le_bytes());
        }
        for value in &self.line_sheet {
            out.extend_from_slice(&value.to_le_bytes());
        }
        out
    }
}

// --- outlines ----------------------------------------------------------------

fn outer_borders(segments: &[LineSegment]) -> Vec<Vec<Point>> {
    let borders: Vec<[Point; 2]> = segments
        .iter()
        .filter(|segment| segment.color == LineColor::Black0)
        .map(|segment| [segment.a, segment.b])
        .filter(|[a, b]| distance(*a, *b) > TOLERANCE)
        .collect();
    if borders.is_empty() {
        return Vec::new();
    }
    // Cut where they meet, so a border drawn with a corner overshooting, or a
    // wall ending part-way along a side, still closes.
    let graph = BorderGraph::build(&split_where_they_meet(&borders));
    let mut outlines: Vec<Vec<Point>> = graph
        .outer_walks()
        .iter()
        .flat_map(|walk| simple_cycles(&without_bridges(walk)))
        .map(|cycle| {
            // An outer walk runs the other way round from the region it encloses.
            let mut ring: Vec<Point> = cycle
                .into_iter()
                .map(|vertex| graph.points[vertex])
                .collect();
            ring.reverse();
            corners(&ring)
        })
        .filter(|ring| ring.len() >= 3 && signed_area(ring) > TOLERANCE * TOLERANCE)
        .collect();
    drop_nested(&mut outlines);
    outlines
}

/// The welded border lines as a planar graph, each vertex's neighbours sorted
/// by direction.
struct BorderGraph {
    points: Vec<Point>,
    neighbours: Vec<Vec<usize>>,
    edge_count: usize,
}

impl BorderGraph {
    fn build(pieces: &[[Point; 2]]) -> Self {
        let mut index = VertexIndex::with_capacity(pieces.len() * 2);
        let mut edges: HashSet<(usize, usize)> = HashSet::with_capacity(pieces.len());
        for [a, b] in pieces {
            let (u, v) = (index.index_of(*a), index.index_of(*b));
            if u != v {
                edges.insert((u.min(v), u.max(v)));
            }
        }
        let points = index.into_points();
        let mut neighbours = vec![Vec::new(); points.len()];
        for &(u, v) in &edges {
            neighbours[u].push(v);
            neighbours[v].push(u);
        }
        for (vertex, around) in neighbours.iter_mut().enumerate() {
            let centre = points[vertex];
            around.sort_by(|&a, &b| {
                direction(centre, points[a]).total_cmp(&direction(centre, points[b]))
            });
        }
        Self {
            points,
            neighbours,
            edge_count: edges.len(),
        }
    }

    /// The outer face walk of every connected group that encloses anything.
    ///
    /// Walked by always taking the next neighbour clockwise, every bounded face
    /// comes out with positive signed area and each group's outer face with
    /// negative; a group that encloses nothing (a tree) walks to zero area.
    fn outer_walks(&self) -> Vec<Vec<(usize, usize)>> {
        let mut visited: HashSet<(usize, usize)> = HashSet::with_capacity(self.edge_count * 2);
        let mut walks = Vec::new();
        for start in 0..self.points.len() {
            for &next in &self.neighbours[start] {
                if visited.contains(&(start, next)) {
                    continue;
                }
                let walk = self.walk(start, next, &mut visited);
                let area = signed_area(
                    &walk
                        .iter()
                        .map(|&(from, _)| self.points[from])
                        .collect::<Vec<_>>(),
                );
                if area < -(TOLERANCE * TOLERANCE) {
                    walks.push(walk);
                }
            }
        }
        walks
    }

    fn walk(
        &self,
        from: usize,
        to: usize,
        visited: &mut HashSet<(usize, usize)>,
    ) -> Vec<(usize, usize)> {
        let mut walk = Vec::new();
        let (mut tail, mut head) = (from, to);
        loop {
            visited.insert((tail, head));
            walk.push((tail, head));
            let around = &self.neighbours[head];
            // Every edge is listed at both of its ends, so `tail` is always found.
            let Some(at) = around.iter().position(|&vertex| vertex == tail) else {
                break;
            };
            let next = around[(at + around.len() - 1) % around.len()];
            (tail, head) = (head, next);
            if (tail, head) == (from, to) || walk.len() > 2 * self.edge_count {
                break;
            }
        }
        walk
    }
}

/// An outer walk without the edges it runs along both ways: a tail sticking out
/// of a sheet, or a single line joining two sheets, has the outer face on both
/// of its sides and encloses nothing.
fn without_bridges(walk: &[(usize, usize)]) -> Vec<(usize, usize)> {
    let present: HashSet<(usize, usize)> = walk.iter().copied().collect();
    walk.iter()
        .copied()
        .filter(|&(tail, head)| !present.contains(&(head, tail)))
        .collect()
}

/// Split a closed walk into simple cycles, so two sheets touching at one corner
/// come out as two outlines rather than one ring that visits the corner twice.
fn simple_cycles(edges: &[(usize, usize)]) -> Vec<Vec<usize>> {
    let mut leaving: HashMap<usize, Vec<usize>> = HashMap::new();
    for (index, &(tail, _)) in edges.iter().enumerate() {
        leaving.entry(tail).or_default().push(index);
    }
    let mut used = vec![false; edges.len()];
    let mut cycles = Vec::new();
    for start in 0..edges.len() {
        if used[start] {
            continue;
        }
        let mut path = vec![edges[start].0];
        let mut on_path: HashMap<usize, usize> = HashMap::from([(edges[start].0, 0)]);
        let mut edge = start;
        loop {
            used[edge] = true;
            let head = edges[edge].1;
            if let Some(&at) = on_path.get(&head) {
                let cycle: Vec<usize> = path.drain(at..).collect();
                for vertex in &cycle {
                    on_path.remove(vertex);
                }
                cycles.push(cycle);
            }
            on_path.insert(head, path.len());
            path.push(head);
            let next = leaving
                .get(&head)
                .and_then(|out| out.iter().copied().find(|&index| !used[index]));
            match next {
                Some(index) => edge = index,
                None => break,
            }
        }
    }
    cycles
}

/// The ring's corners: vertices that only subdivide a straight edge dropped,
/// each judged against its original neighbours — the same reduction region
/// references compare outlines by.
fn corners(ring: &[Point]) -> Vec<Point> {
    let count = ring.len();
    if count < 4 {
        return ring.to_vec();
    }
    let kept: Vec<Point> = (0..count)
        .filter_map(|index| {
            let previous = ring[(index + count - 1) % count];
            let current = ring[index];
            let next = ring[(index + 1) % count];
            let span = sub(next, previous);
            let length = dot(span, span).sqrt();
            if length == 0.0 {
                return Some(current);
            }
            (cross(sub(current, previous), span).abs() / length > TOLERANCE).then_some(current)
        })
        .collect();
    if kept.len() >= 3 { kept } else { ring.to_vec() }
}

/// Drop every outline that lies inside another: a loop drawn within a sheet is
/// part of that sheet, not a sheet of its own. Separate groups of border lines
/// never cross (crossing would have joined them), so one vertex decides.
fn drop_nested(outlines: &mut Vec<Vec<Point>>) {
    let mut by_size: Vec<usize> = (0..outlines.len()).collect();
    by_size.sort_by(|&a, &b| signed_area(&outlines[b]).total_cmp(&signed_area(&outlines[a])));
    let mut kept: Vec<usize> = Vec::new();
    for index in by_size {
        let probe = outlines[index][0];
        let inside_another = kept.iter().any(|&outer| {
            let bounds = bounds_of(&outlines[outer]);
            within_bounds(bounds, probe, 0.0)
                && !on_outline(&outlines[outer], probe)
                && inside_outline(&outlines[outer], probe)
        });
        if !inside_another {
            kept.push(index);
        }
    }
    kept.sort_unstable();
    let mut position = 0;
    outlines.retain(|_| {
        let keep = kept.binary_search(&position).is_ok();
        position += 1;
        keep
    });
}

// --- placing lines -------------------------------------------------------------

fn place_lines(segments: &[LineSegment], sheets: &mut [Sheet]) -> Vec<i32> {
    if sheets.is_empty() {
        return vec![-1; segments.len()];
    }
    let grid = SheetGrid::new(sheets);
    segments
        .iter()
        .map(|segment| {
            let middle = Point::new(
                (segment.a.x + segment.b.x) / 2.0,
                (segment.a.y + segment.b.y) / 2.0,
            );
            // Candidates come in reading order, so a line on the outline of two
            // sheets that touch goes to the earlier one.
            let found = grid
                .near(middle)
                .iter()
                .copied()
                .find(|&index| holds(&sheets[index], middle));
            match found {
                Some(index) => {
                    sheets[index].line_count += 1;
                    index as i32
                }
                None => -1,
            }
        })
        .collect()
}

fn holds(sheet: &Sheet, point: Point) -> bool {
    within_bounds(sheet.bounds, point, TOLERANCE)
        && (inside_outline(&sheet.outline, point) || on_outline(&sheet.outline, point))
}

/// Sheets bucketed by the cells their bounds cover, so a point is tested against
/// the few sheets near it rather than all of them.
struct SheetGrid {
    cell: f64,
    cells: HashMap<(i64, i64), Vec<usize>>,
}

impl SheetGrid {
    fn new(sheets: &[Sheet]) -> Self {
        let mut extent = [
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        ];
        for sheet in sheets {
            extent[0] = extent[0].min(sheet.bounds[0]);
            extent[1] = extent[1].min(sheet.bounds[1]);
            extent[2] = extent[2].max(sheet.bounds[2]);
            extent[3] = extent[3].max(sheet.bounds[3]);
        }
        let span = (extent[2] - extent[0])
            .max(extent[3] - extent[1])
            .max(TOLERANCE);
        // About two cells across a sheet when sheets tile the canvas.
        let cell = span / (2.0 * (sheets.len() as f64).sqrt()).max(1.0);
        let mut cells: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
        for (index, sheet) in sheets.iter().enumerate() {
            let low = Self::cell_of(
                cell,
                sheet.bounds[0] - TOLERANCE,
                sheet.bounds[1] - TOLERANCE,
            );
            let high = Self::cell_of(
                cell,
                sheet.bounds[2] + TOLERANCE,
                sheet.bounds[3] + TOLERANCE,
            );
            for x in low.0..=high.0 {
                for y in low.1..=high.1 {
                    cells.entry((x, y)).or_default().push(index);
                }
            }
        }
        Self { cell, cells }
    }

    fn cell_of(cell: f64, x: f64, y: f64) -> (i64, i64) {
        ((x / cell).floor() as i64, (y / cell).floor() as i64)
    }

    fn near(&self, point: Point) -> &[usize] {
        self.cells
            .get(&Self::cell_of(self.cell, point.x, point.y))
            .map_or(&[], Vec::as_slice)
    }
}

// --- geometry -----------------------------------------------------------------

/// The direction from `centre` to `point`, as an angle, for ordering neighbours.
fn direction(centre: Point, point: Point) -> f64 {
    (point.y - centre.y).atan2(point.x - centre.x)
}

fn signed_area(ring: &[Point]) -> f64 {
    let count = ring.len();
    (0..count)
        .map(|index| cross(ring[index], ring[(index + 1) % count]))
        .sum::<f64>()
        / 2.0
}

fn bounds_of(ring: &[Point]) -> [f64; 4] {
    ring.iter().fold(
        [
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        ],
        |bounds, point| {
            [
                bounds[0].min(point.x),
                bounds[1].min(point.y),
                bounds[2].max(point.x),
                bounds[3].max(point.y),
            ]
        },
    )
}

fn within_bounds(bounds: [f64; 4], point: Point, pad: f64) -> bool {
    point.x >= bounds[0] - pad
        && point.x <= bounds[2] + pad
        && point.y >= bounds[1] - pad
        && point.y <= bounds[3] + pad
}

/// Even-odd ray cast.
fn inside_outline(ring: &[Point], point: Point) -> bool {
    let mut inside = false;
    let count = ring.len();
    for index in 0..count {
        let a = ring[index];
        let b = ring[(index + 1) % count];
        if (a.y > point.y) != (b.y > point.y)
            && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)
        {
            inside = !inside;
        }
    }
    inside
}

fn on_outline(ring: &[Point], point: Point) -> bool {
    let count = ring.len();
    (0..count).any(|index| {
        let a = ring[index];
        let b = ring[(index + 1) % count];
        let direction = sub(b, a);
        let length_sq = dot(direction, direction);
        let at = if length_sq == 0.0 {
            0.0
        } else {
            (dot(sub(point, a), direction) / length_sq).clamp(0.0, 1.0)
        };
        distance(lerp([a, b], at), point) <= TOLERANCE
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(ax: f64, ay: f64, bx: f64, by: f64, color: LineColor) -> LineSegment {
        LineSegment::with_color(Point::new(ax, ay), Point::new(bx, by), color)
    }

    fn border(ax: f64, ay: f64, bx: f64, by: f64) -> LineSegment {
        line(ax, ay, bx, by, LineColor::Black0)
    }

    fn square(x: f64, y: f64, side: f64) -> Vec<LineSegment> {
        vec![
            border(x, y, x + side, y),
            border(x + side, y, x + side, y + side),
            border(x + side, y + side, x, y + side),
            border(x, y + side, x, y),
        ]
    }

    fn index_of(lines: Vec<LineSegment>) -> SheetIndex {
        sheet_index(&CreasePatternModel {
            line_segments: lines,
            ..Default::default()
        })
    }

    fn corners_of(sheet: &Sheet) -> Vec<(f64, f64)> {
        let mut corners: Vec<(f64, f64)> = sheet.outline.iter().map(|p| (p.x, p.y)).collect();
        corners.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)));
        corners
    }

    #[test]
    fn two_separate_squares_are_two_sheets_in_reading_order() {
        let mut lines = square(10.0, 0.0, 4.0);
        lines.extend(square(0.0, 0.0, 4.0));
        lines.push(line(1.0, 1.0, 3.0, 3.0, LineColor::Red1));
        lines.push(line(11.0, 1.0, 13.0, 3.0, LineColor::Blue2));
        let index = index_of(lines);

        assert_eq!(index.sheets.len(), 2);
        assert_eq!(
            corners_of(&index.sheets[0]),
            vec![(0.0, 0.0), (0.0, 4.0), (4.0, 0.0), (4.0, 4.0)]
        );
        assert_eq!(index.sheets[1].bounds, [10.0, 0.0, 14.0, 4.0]);
        // The left square was drawn second but reads first.
        assert_eq!(index.line_sheet, vec![1, 1, 1, 1, 0, 0, 0, 0, 0, 1]);
        assert_eq!(index.sheets[0].line_count, 5);
        assert!(signed_area(&index.sheets[0].outline) > 0.0);
    }

    #[test]
    fn a_square_with_split_sides_has_four_corners() {
        let lines = vec![
            border(0.0, 0.0, 1.0, 0.0),
            border(1.0, 0.0, 2.0, 0.0),
            border(2.0, 0.0, 2.0, 2.0),
            border(2.0, 2.0, 0.0, 2.0),
            border(0.0, 2.0, 0.0, 1.0),
            border(0.0, 1.0, 0.0, 0.0),
        ];
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].outline.len(), 4);
        assert_eq!(index.sheets[0].line_count, 6);
    }

    #[test]
    fn a_border_wall_across_a_sheet_neither_splits_nor_refuses_it() {
        // Sides split where the wall meets them, so the wall shares endpoints.
        let lines = vec![
            border(0.0, 0.0, 2.0, 0.0),
            border(2.0, 0.0, 4.0, 0.0),
            border(4.0, 0.0, 4.0, 4.0),
            border(4.0, 4.0, 2.0, 4.0),
            border(2.0, 4.0, 0.0, 4.0),
            border(0.0, 4.0, 0.0, 0.0),
            border(2.0, 0.0, 2.0, 4.0),
        ];
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(
            corners_of(&index.sheets[0]),
            vec![(0.0, 0.0), (0.0, 4.0), (4.0, 0.0), (4.0, 4.0)]
        );
        assert_eq!(index.line_sheet, vec![0; 7]);
    }

    #[test]
    fn two_squares_sharing_a_side_are_one_sheet() {
        let mut lines = square(0.0, 0.0, 2.0);
        lines.extend([
            border(2.0, 0.0, 4.0, 0.0),
            border(4.0, 0.0, 4.0, 2.0),
            border(4.0, 2.0, 2.0, 2.0),
        ]);
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].bounds, [0.0, 0.0, 4.0, 2.0]);
        assert_eq!(index.sheets[0].outline.len(), 4);
    }

    #[test]
    fn a_wall_ending_part_way_along_the_sides_is_a_member() {
        // Unsplit sides: the wall meets them at T-junctions, not endpoints.
        let mut lines = square(0.0, 0.0, 4.0);
        lines.push(border(2.0, 0.0, 2.0, 4.0));
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].outline.len(), 4);
        assert_eq!(index.line_sheet, vec![0; 5]);
    }

    #[test]
    fn a_loop_inside_a_sheet_is_a_member_not_a_sheet() {
        let mut lines = square(0.0, 0.0, 10.0);
        lines.extend(square(4.0, 4.0, 2.0));
        lines.push(line(1.0, 1.0, 3.0, 1.0, LineColor::Red1));
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].bounds, [0.0, 0.0, 10.0, 10.0]);
        assert_eq!(index.line_sheet, vec![0; 9]);
    }

    #[test]
    fn a_corner_drawn_overshooting_still_closes() {
        let lines = vec![
            border(0.0, 0.0, 4.0, 0.0),
            border(4.0, 0.0, 4.0, 4.0),
            border(4.0, 4.0, 0.0, 4.0),
            // The left side runs past the bottom-left corner.
            border(0.0, 4.0, 0.0, -1.0),
        ];
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(
            corners_of(&index.sheets[0]),
            vec![(0.0, 0.0), (0.0, 4.0), (4.0, 0.0), (4.0, 4.0)]
        );
    }

    #[test]
    fn a_tail_outside_the_border_is_not_part_of_the_outline() {
        let mut lines = square(0.0, 0.0, 4.0);
        lines.push(border(4.0, 4.0, 6.0, 6.0));
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].outline.len(), 4);
        assert_eq!(index.line_sheet, vec![0, 0, 0, 0, -1]);
    }

    #[test]
    fn two_squares_touching_at_a_corner_are_two_sheets() {
        let mut lines = square(0.0, 0.0, 2.0);
        lines.extend(square(2.0, 2.0, 2.0));
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 2);
        assert!(index.sheets.iter().all(|sheet| sheet.outline.len() == 4));
    }

    #[test]
    fn an_open_border_or_a_crease_only_area_is_not_a_sheet() {
        let open = index_of(vec![
            border(0.0, 0.0, 4.0, 0.0),
            border(4.0, 0.0, 4.0, 4.0),
            border(4.0, 4.0, 0.0, 4.0),
        ]);
        assert!(open.sheets.is_empty());
        assert_eq!(open.line_sheet, vec![-1, -1, -1]);

        let creases_only = index_of(vec![
            line(0.0, 0.0, 4.0, 0.0, LineColor::Red1),
            line(4.0, 0.0, 4.0, 4.0, LineColor::Red1),
            line(4.0, 4.0, 0.0, 0.0, LineColor::Blue2),
        ]);
        assert!(creases_only.sheets.is_empty());
    }

    #[test]
    fn lines_ending_on_the_border_and_aux_lines_belong_to_the_sheet() {
        // As on large imported canvases: aux lines end part-way along the border
        // without splitting it.
        let mut lines = square(0.0, 0.0, 4.0);
        lines.push(line(1.0, 0.0, 1.0, 4.0, LineColor::Cyan3));
        lines.push(line(0.0, 2.0, 4.0, 2.0, LineColor::Red1));
        let index = index_of(lines);
        assert_eq!(index.sheets.len(), 1);
        assert_eq!(index.sheets[0].outline.len(), 4);
        assert_eq!(index.line_sheet, vec![0; 6]);
    }

    #[test]
    fn an_empty_document_has_no_sheets() {
        let index = index_of(Vec::new());
        assert!(index.sheets.is_empty());
        assert!(index.line_sheet.is_empty());
    }

    #[test]
    fn the_compact_form_round_trips_its_counts_and_offsets() {
        let mut lines = square(0.0, 0.0, 4.0);
        lines.extend(square(10.0, 0.0, 4.0));
        let compact = CompactSheetIndex::from(&index_of(lines));
        assert_eq!(compact.outline_offsets, vec![0, 4, 8]);
        assert_eq!(compact.bounds.len(), 8);
        assert_eq!(compact.line_counts, vec![4, 4]);
        let bytes = compact.to_bytes();
        assert_eq!(
            u32::from_le_bytes(bytes[0..4].try_into().unwrap()),
            COMPACT_SHEET_INDEX_MAGIC
        );
        assert_eq!(bytes.len(), 24 + (8 + 16) * 8 + (3 + 2 + 8) * 4);
    }

    /// Committed bytes of a small index — two squares, a crease in the first, a
    /// line outside both — read by the TypeScript decoder's test
    /// (`apps/web/src/engine/oristudioCpSheetIndex.test.ts`).
    ///
    /// Asserts rather than writes, as `binary_codec_golden_fixture_is_current`
    /// does for the geometry transport: change the layout and this fails until
    /// the fixture is regenerated, and the regenerated bytes then fail the
    /// TypeScript test until the native path's decoder follows.
    ///
    /// Regenerate with:
    /// `UPDATE_FIXTURES=1 cargo test -p oristudio-cp --lib sheet_index_golden`
    #[test]
    fn sheet_index_golden_fixture_is_current() {
        let mut lines = square(0.0, 0.0, 4.0);
        lines.push(line(0.0, 0.0, 4.0, 4.0, LineColor::Red1));
        lines.extend(square(10.0, 0.0, 4.0));
        lines.push(line(20.0, 0.0, 24.0, 0.0, LineColor::Cyan3));
        let bytes = CompactSheetIndex::from(&index_of(lines)).to_bytes();
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../tests/fixtures/oristudio-cp/sheet-index-golden.bin");

        if std::env::var_os("UPDATE_FIXTURES").is_some() {
            std::fs::write(&path, &bytes).expect("write golden fixture");
            return;
        }
        let committed = std::fs::read(&path).unwrap_or_else(|err| {
            panic!(
                "sheet-index golden fixture missing at {}: {err}\n\
                 regenerate: UPDATE_FIXTURES=1 cargo test -p oristudio-cp --lib sheet_index_golden",
                path.display()
            )
        });
        assert_eq!(
            committed,
            bytes,
            "sheet-index golden fixture is stale — the encoder changed but {} did not.\n\
             Regenerate: UPDATE_FIXTURES=1 cargo test -p oristudio-cp --lib sheet_index_golden",
            path.display()
        );
    }
}
