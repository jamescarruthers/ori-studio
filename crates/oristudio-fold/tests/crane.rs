//! A real sequence through the reverse fold (plan Phase 9's fixtures;
//! research §5.2: "still untested: a real sequence beyond the preliminary
//! base"): the traditional crane by Ida's route as Beloch writes it
//! (`crane.bel`; Ida 2020, Fig. 7.19). The triangle; the preliminary base by
//! two inside reverses; the bird base by four more, of the side corners onto
//! the centre line, and the two petal folds; the legs narrowed by four plain
//! folds; then the neck, the tail and the head reversed.
//!
//! Every frame Beloch commits for it is matched exactly — the same faces, the
//! same isometries after one rigid map, the same layer order — numbering-free
//! (`beloch::matches`): the frames of `bird-base-petal.fold` step by step,
//! and the finished 60-face `crane.fold`. The neck, tail and head are also
//! folded on the bird base imported from `bird-base-petal.fold`'s crease
//! pattern through Import CP, the route a sequence takes before squash and
//! petal folds exist, and land on the same crane.
//!
//! The lines are Beloch's, in its table frame (`notes/2026-09-25-crane-
//! oracle.md` gives each as Ida's ray): the triangle's corner c = (1, 1), the
//! centre line y = x, the point L = (1 − √2/4, 1 − √2/4) where the side
//! corners land. The head is a free choice in folding practice; its line is
//! read off the creases `crane.fold` has and the tailed crane lacks.

mod beloch;
mod compound;
mod support;

use oristudio_fold::{
    Direction, FaceId, ImportKind, Isometry, PlainFold, ReverseChoices, ReverseFold, ReverseKind,
    ReverseOutcome, Seed, Sheet, StartSide, State,
};
use oristudio_geometry::{Line, convex};
use support::*;

const SQRT2: f64 = std::f64::consts::SQRT_2;

/// Where the side corners land on the centre line.
const L: Point = [1.0 - SQRT2 / 4.0, 1.0 - SQRT2 / 4.0];

/// The petal folds' line, perpendicular to the centre line through L.
fn petal_line() -> Line {
    Line::new([1.0, 1.0], 2.0 * L[0]).unwrap_or_else(|| unreachable!())
}

/// A state with the rigid map from its model frame to Beloch's table.
struct Folding {
    state: State,
    /// Table to model.
    to_model: Isometry,
}

impl Folding {
    fn point(&self, table: Point) -> Point {
        self.to_model.apply(table)
    }

    fn line(&self, table: Line) -> Line {
        let foot = table.foot();
        let dir = table.direction();
        let (p, q) = (
            self.point(foot),
            self.point([foot[0] + dir[0], foot[1] + dir[1]]),
        );
        through(p, q)
    }

    /// A reverse fold of the tip on the side of `toward` (a table point),
    /// grown from the face holding the sheet point `anchor`, opened along
    /// `spine` (a table line) when it opens several ways.
    fn reverse(&mut self, line: Line, toward: Point, anchor: Point, spine: Option<Line>) {
        let line = self.line(line);
        let op = ReverseFold {
            line,
            side: side(&line, self.point(toward)),
            anchor: Seed::Flaps { at: vec![anchor] },
            kind: ReverseKind::Inside,
        };
        let choices = match self.state.reverse_fold(&op, &ReverseChoices::default()) {
            Ok(ReverseOutcome::ChooseOpening(asked)) => {
                let spine = self.line(spine.unwrap_or_else(|| panic!("{op:?} opens several ways")));
                let opening = asked.flaps[0]
                    .openings
                    .iter()
                    .find(|o| o.spine.approx_eq(&spine))
                    .unwrap_or_else(|| panic!("no opening along {spine:?}"));
                ReverseChoices {
                    openings: vec![opening.stored.clone()],
                    order: None,
                }
            }
            _ => ReverseChoices::default(),
        };
        let folded = compound::landed(&self.state, &op, &choices);
        compound::check(&self.state, &op, &folded);
        self.state = folded.state;
    }

    /// A plain fold along `line` of the layers from the top (valley) or the
    /// bottom (mountain) down to the face whose sheet polygon holds every one
    /// of `holds`, counted at the table point `at`, which moves.
    fn fold(&mut self, line: Line, direction: Direction, at: Point, holds: &[Point]) {
        let (line, at) = (self.line(line), self.point(at));
        let stack = self
            .state
            .stack_at(at)
            .unwrap_or_else(|| panic!("no stack at {at:?}"));
        let k = stack
            .iter()
            .position(|&f| holds_all(&self.state, f, holds))
            .unwrap_or_else(|| panic!("no face holding {holds:?} at {at:?}"));
        let face = stack[k];
        let layers = match direction {
            Direction::Valley => k + 1,
            Direction::Mountain => stack.len() - k,
        };
        let seed = Seed::Depth {
            at: self
                .state
                .isometry(face)
                .unwrap_or_default()
                .inverse()
                .apply(at),
            layers,
        };
        let op = PlainFold::new(line, side(&line, at), direction).with_seed(seed);
        self.state = fold(&self.state, &op).state;
        assert_valid(&self.state);
    }
}

/// Whether face `f`'s sheet polygon holds every point (its boundary
/// included).
fn holds_all(state: &State, f: FaceId, points: &[Point]) -> bool {
    let polygon: Vec<Point> = state
        .face(f)
        .map(|face| {
            face.ring
                .iter()
                .map(|v| state.vertices()[v.0 as usize])
                .collect()
        })
        .unwrap_or_default();
    points
        .iter()
        .all(|&p| convex::contains_point(&polygon, p, -1e-9))
}

/// Folding `state` matched to Beloch's frame: the map from table to model.
fn matched(state: State, frame: &beloch::Frame) -> Folding {
    let phi = beloch::matches(&state, frame).unwrap_or_else(|e| panic!("{e}"));
    Folding {
        state,
        to_model: phi.inverse(),
    }
}

const A: Point = [0.0, 0.0];
const B: Point = [1.0, 0.0];
const C: Point = [1.0, 1.0];
const D: Point = [0.0, 1.0];
const O: Point = [0.5, 0.5];

/// The bird base from the square, each step matched against
/// `bird-base-petal.fold`'s frame.
fn bird_base() -> Folding {
    let doc = beloch::document("bird-base-petal.fold");
    let frame = |k| beloch::frame(&doc, Some(k)).unwrap_or_else(|e| panic!("{e}"));
    let square = State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut f = matched(square, &frame(0));
    // fold (map .a onto .c) as --bd
    let bd = through(B, D);
    f.state = fold(&f.state, &all(f.line(bd), f.point(A), Direction::Valley)).state;
    f = matched(f.state, &frame(1));
    // reverse (map .b onto .c) as --h; reverse (map .d onto .c) as --v
    f.reverse(y_eq(0.5), [0.9, 0.2], [0.9, 0.05], None);
    f = matched(f.state, &frame(2));
    f.reverse(x_eq(0.5), [0.2, 0.9], [0.05, 0.9], None);
    f = matched(f.state, &frame(3));
    // The side corners .sr = m_ab, .sl = m_da, .br = m_bc and .bl = m_cd,
    // each reversed onto the centre line through c: the line through c and
    // the midpoint of the corner and L.
    let corners: [(Point, Point); 4] = [
        ([1.0, 0.5], [0.55, 0.02]),
        ([0.5, 1.0], [0.02, 0.55]),
        ([1.0, 0.5], [0.98, 0.45]),
        ([0.5, 1.0], [0.45, 0.98]),
    ];
    for (k, (corner, anchor)) in corners.into_iter().enumerate() {
        let mid = [(corner[0] + L[0]) / 2.0, (corner[1] + L[1]) / 2.0];
        f.reverse(through(C, mid), corner, anchor, None);
        f = matched(f.state, &frame(4 + k));
    }
    // The petals: the front valley up to the face holding a and o, the back
    // mountain up to the face holding c and o, at c.
    f.fold(petal_line(), Direction::Valley, [0.97, 0.97], &[A, O]);
    f = matched(f.state, &frame(8));
    f.fold(petal_line(), Direction::Mountain, [0.97, 0.97], &[C, O]);
    matched(f.state, &frame(9))
}

/// The crane from a bird base: the legs narrowed, the neck, tail and head
/// reversed; matched against `crane.fold`.
fn crane(mut f: Folding) -> State {
    // Narrow each leg: its outer edge, through the leg tip (1, 1) at 67.5°
    // (front right) or 22.5° (left), onto the centre line, along the
    // bisector at 56.25° or 33.75°. The front layers valley, the back ones
    // mountain, each up to the face holding the leg's tip and the centre at
    // a point just inside the leg by the petal crease.
    let tip = [1.0, 1.0];
    let edge = at_angle(tip, 67.5)
        .intersect(&petal_line())
        .unwrap_or_else(|| unreachable!());
    let centre = (edge[0] + edge[1] + 1.0) / 3.0;
    let e1 = [
        edge[0] + 0.05 * (centre - edge[0]),
        edge[1] + 0.05 * (centre - edge[1]),
    ];
    let e2 = [e1[1], e1[0]];
    for (degrees, at, corner, direction) in [
        (56.25, e1, B, Direction::Valley),
        (33.75, e2, D, Direction::Valley),
        (56.25, e1, B, Direction::Mountain),
        (33.75, e2, D, Direction::Mountain),
    ] {
        f.fold(at_angle(tip, degrees), direction, at, &[corner, O]);
    }
    assert_eq!(f.state.faces().len(), 36);
    // The neck and the tail: each leg reversed about the perpendicular to its
    // narrowed edge through L, opening along the centre line.
    let centre_line = through(O, C);
    f.reverse(at_angle(L, 146.25), tip, [0.98, 0.01], Some(centre_line));
    f.reverse(at_angle(L, 123.75), tip, [0.01, 0.98], Some(centre_line));
    assert_eq!(f.state.faces().len(), 52);
    // The head, on the neck by b.
    let doc = beloch::document("crane.fold");
    let head = head_line(&f.state, &doc);
    let b_image = vertex_image(&f.state, B);
    let op = ReverseFold {
        line: head,
        side: side(&head, b_image),
        anchor: Seed::Flaps {
            at: vec![[0.98, 0.01]],
        },
        kind: ReverseKind::Inside,
    };
    let folded = compound::landed(&f.state, &op, &ReverseChoices::default());
    compound::check(&f.state, &op, &folded);
    let frame = beloch::frame(&doc, None).unwrap_or_else(|e| panic!("{e}"));
    beloch::matches(&folded.state, &frame).unwrap_or_else(|e| panic!("the crane: {e}"));
    folded.state
}

/// The image of the sheet vertex at `p`.
fn vertex_image(state: &State, p: Point) -> Point {
    let v = state
        .vertices()
        .iter()
        .position(|q| close(*q, p))
        .unwrap_or_else(|| panic!("no vertex at {p:?}"));
    state
        .vertex_image(oristudio_fold::VertexId(v as u32))
        .unwrap_or_default()
}

/// The line, in `state`'s model frame, of the creases `doc`'s crease pattern
/// has that `state` lacks: each lies inside one of the state's faces, which
/// takes it to the model frame.
fn head_line(state: &State, doc: &serde_json::Value) -> Line {
    let pattern = beloch::pattern(doc).unwrap_or_else(|e| panic!("{e}"));
    let mut images: Vec<Point> = Vec::new();
    for segment in &pattern.segments {
        if segment.kind == ImportKind::Border {
            continue;
        }
        let mid = [
            (segment.from[0] + segment.to[0]) / 2.0,
            (segment.from[1] + segment.to[1]) / 2.0,
        ];
        if state.crease_at(mid).is_some() {
            continue;
        }
        let face = state
            .face_at(mid)
            .unwrap_or_else(|| panic!("a new crease at {mid:?} lies in no face"));
        let t = state.isometry(face).unwrap_or_default();
        images.extend([t.apply(segment.from), t.apply(segment.to)]);
    }
    assert!(images.len() >= 4, "no head creases");
    let (p, q) = images
        .iter()
        .flat_map(|&p| images.iter().map(move |&q| (p, q)))
        .max_by(|a, b| {
            let length = |(p, q): &(Point, Point)| (p[0] - q[0]).hypot(p[1] - q[1]);
            length(a).total_cmp(&length(b))
        })
        .unwrap_or_else(|| unreachable!());
    let line = through(p, q);
    assert!(images.iter().all(|&x| line.signed_distance(x).abs() < 1e-9));
    line
}

#[test]
fn the_bird_base_by_reverse_folds_is_belochs_frame_by_frame() {
    let bird = bird_base();
    assert_eq!(bird.state.faces().len(), 16);
    // Every corner's image: the legs b and d at (1, 1), the petals' points a
    // and c past the centre, in the table frame.
    let table = bird.to_model.inverse();
    for (corner, want) in [
        (B, [1.0, 1.0]),
        (D, [1.0, 1.0]),
        (A, [1.0 - SQRT2 / 2.0; 2]),
        (C, [1.0 - SQRT2 / 2.0; 2]),
    ] {
        let at = table.apply(vertex_image(&bird.state, corner));
        assert!(
            (at[0] - want[0]).abs() < 1e-12 && (at[1] - want[1]).abs() < 1e-12,
            "{corner:?} at {at:?}"
        );
    }
}

/// From the square: 16 steps, 60 faces, Beloch's crane.
#[test]
fn the_crane_from_the_square_is_belochs_crane() {
    let crane = crane(bird_base());
    assert_eq!(crane.faces().len(), 60);
}

/// The neck, tail and head on the bird base imported from Beloch's crease
/// pattern (Import CP, its frame's order replayed by witnesses): the same
/// crane.
#[test]
fn the_crane_neck_reverses_on_an_imported_bird_base() {
    let doc = beloch::document("bird-base-petal.fold");
    let imported = beloch::final_state(&doc).unwrap_or_else(|e| panic!("{e}"));
    let frame = beloch::frame(&doc, None).unwrap_or_else(|e| panic!("{e}"));
    let crane = crane(matched(imported, &frame));
    assert_eq!(crane.faces().len(), 60);
}
