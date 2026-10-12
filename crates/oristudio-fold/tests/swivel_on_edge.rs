//! The swivel on a folded edge (`compound::swivel_on_edge`): the classic
//! swivel, its creases meeting where the line halfway between the edge and
//! the target crosses a folded edge. The owner's case — Abrashi's "What is
//! Swivel fold?" on the squashed preliminary base — lands as the diagram's
//! second picture shows; the kite base narrows at its tip, one side and
//! then both; every landing passes the full gate, Kawasaki and Maekawa at
//! its vertex, lays its edge on the target and takes the letters the module
//! docs derive; the refusals are codes; a free swivel is spelled and folded
//! as before; and a seeded campaign checks every one that lands.

mod beloch;
mod support;
mod vertex;

use std::f64::consts::{FRAC_1_SQRT_2, PI};

use oristudio_fold::pattern::opposite;
use oristudio_fold::random::{self, Rng};
use oristudio_fold::{
    CompoundRefused, CreaseKind, Direction, FaceId, Fix, FoldRefusal, Letter, Seed, State,
    SwivelByEdge, SwivelEdgeAnalysis, SwivelRay, SwivelWedge, VertexChoices, VertexFolded,
    VertexOutcome,
};
use oristudio_geometry::Line;
use vertex::cases::{self, FoldSwivelCase, landed};
use vertex::{check, folded_segments, letters_at, only_order_of_its_pattern};

type Point = [f64; 2];

fn case(name: &str) -> FoldSwivelCase {
    cases::fold_swivel_cases()
        .into_iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("no case {name}"))
}

fn analysis(state: &State, op: &SwivelByEdge) -> SwivelEdgeAnalysis {
    state
        .analyse_swivel_by_edge(op)
        .unwrap_or_else(|e| panic!("{e} {e:?}"))
}

fn refusal(outcome: Result<VertexOutcome, CompoundRefused>) -> oristudio_fold::Refused {
    match outcome {
        Err(CompoundRefused::Refused(refused)) => refused,
        Err(CompoundRefused::Broken(b)) => panic!("broken {b}"),
        Ok(_) => panic!("landed"),
    }
}

fn close(p: Point, q: Point) -> bool {
    (p[0] - q[0]).hypot(p[1] - q[1]) < 1e-9
}

/// A model point as the viewer sees it.
fn scene(state: &State, p: Point) -> Point {
    state.view().transform().apply(p)
}

/// The faces at a point the viewer sees, nearest first.
fn seen_stack(state: &State, at_scene: Point) -> Vec<FaceId> {
    let model = state.view().transform().inverse().apply(at_scene);
    let mut stack = state.stack_at(model).unwrap_or_default();
    if state.view().flipped {
        stack.reverse();
    }
    stack
}

/// The parent's face a landed face is, or is a piece of.
fn lineage(parent: &State, folded: &State, face: FaceId) -> FaceId {
    folded
        .face(face)
        .and_then(|f| f.parent)
        .filter(|p| parent.face(*p).is_some())
        .unwrap_or(face)
}

/// Kawasaki's theorem at a sheet vertex: alternate sectors between its
/// folded creases sum to a half turn.
fn assert_kawasaki(state: &State, at: Point, label: &str) {
    let mut angles: Vec<f64> = state
        .creases()
        .iter()
        .filter(|c| c.kind.is_folded())
        .filter_map(|c| {
            let [a, b] = c.vertices.map(|v| state.vertices()[v.0 as usize]);
            let other = if close(a, at) {
                b
            } else if close(b, at) {
                a
            } else {
                return None;
            };
            Some(
                (other[1] - at[1])
                    .atan2(other[0] - at[0])
                    .rem_euclid(2.0 * PI),
            )
        })
        .collect();
    angles.sort_by(f64::total_cmp);
    assert_eq!(angles.len(), 4, "{label}: {angles:?}");
    let alternate = (angles[1] - angles[0]) + (angles[3] - angles[2]);
    assert!((alternate - PI).abs() < 1e-9, "{label}: {alternate}");
}

/// The landed state's sheet point at the swivel's vertex: where its new
/// creases meet.
fn vertex_sheet(folded: &VertexFolded) -> Point {
    let state = &folded.state;
    let ends: Vec<Point> = folded
        .report
        .fold
        .created
        .iter()
        .filter_map(|&id| state.crease(id))
        .flat_map(|c| c.vertices.map(|v| state.vertices()[v.0 as usize]))
        .collect();
    *ends
        .iter()
        .max_by_key(|p| ends.iter().filter(|q| close(**p, **q)).count())
        .unwrap_or_else(|| panic!("no new creases"))
}

/// The parent's model point at a sheet vertex.
fn vertex_at(state: &State, p: Point) -> Point {
    let v = state
        .vertices()
        .iter()
        .position(|q| close(*q, p))
        .unwrap_or_else(|| panic!("no vertex at {p:?}"));
    state
        .vertex_image(oristudio_fold::VertexId(v as u32))
        .unwrap_or_else(|| panic!("no image of {p:?}"))
}

/// Every vertex the landed state has along the edge's sheet segment lies
/// on the target once folded where the edge runs from where it meets the
/// target on (the part that swivels), and stays where it was on the other
/// side of that point; returns how many lie on the target.
fn assert_edge_on_target(
    parent: &State,
    folded: &VertexFolded,
    edge: [Point; 2],
    a: &SwivelEdgeAnalysis,
    label: &str,
) -> usize {
    let (ma, mb) = (vertex_at(parent, edge[0]), vertex_at(parent, edge[1]));
    let far = a.edge[1];
    let u = [far[0] - a.meet[0], far[1] - a.meet[1]];
    let length = u[0].hypot(u[1]);
    let u = [u[0] / length, u[1] / length];
    let state = &folded.state;
    let run = [edge[1][0] - edge[0][0], edge[1][1] - edge[0][1]];
    let run2 = run[0] * run[0] + run[1] * run[1];
    let mut on = 0;
    for (k, &s) in state.vertices().iter().enumerate() {
        let rel = [s[0] - edge[0][0], s[1] - edge[0][1]];
        let off = (rel[0] * run[1] - rel[1] * run[0]).abs() / run2.sqrt();
        let t = (rel[0] * run[0] + rel[1] * run[1]) / run2;
        if off > 1e-9 || !(-1e-9..=1.0 + 1e-9).contains(&t) {
            continue;
        }
        let before = [ma[0] + t * (mb[0] - ma[0]), ma[1] + t * (mb[1] - ma[1])];
        let along = (before[0] - a.meet[0]) * u[0] + (before[1] - a.meet[1]) * u[1];
        let after = state
            .vertex_image(oristudio_fold::VertexId(k as u32))
            .unwrap_or_else(|| panic!("{label}: no image"));
        if along > 1e-9 {
            let d = a.target.distance_to_point(after);
            assert!(d < 1e-9, "{label}: {s:?} lands {d} off the target");
            on += 1;
        } else if along < -1e-9 {
            let moved = (after[0] - before[0]).hypot(after[1] - before[1]);
            assert!(moved < 1e-9, "{label}: {s:?} past the meeting point moved");
        }
    }
    on
}

/// The faces joined to `faces` across flat creases, theirs included.
fn flat_closure(state: &State, faces: Vec<FaceId>) -> std::collections::BTreeSet<FaceId> {
    let mut out: std::collections::BTreeSet<FaceId> = faces.into_iter().collect();
    let holds = |f: &oristudio_fold::Face, a, b| {
        let n = f.ring.len();
        (0..n).any(|i| {
            let (p, q) = (f.ring[i], f.ring[(i + 1) % n]);
            (p, q) == (a, b) || (p, q) == (b, a)
        })
    };
    loop {
        let before = out.len();
        for c in state.creases() {
            if !matches!(c.kind, CreaseKind::Flat(_)) {
                continue;
            }
            let [a, b] = c.vertices;
            let sides: Vec<FaceId> = state
                .faces()
                .iter()
                .filter(|f| holds(f, a, b))
                .map(|f| f.id)
                .collect();
            if sides.iter().any(|f| out.contains(f)) {
                out.extend(sides);
            }
        }
        if out.len() == before {
            return out;
        }
    }
}

/// The letters the new creases fold as the viewer saw each one's layer in
/// the parent, by the ray they run along: (ray, letter) per created crease.
fn seen_letters(
    parent: &State,
    folded: &VertexFolded,
    a: &SwivelEdgeAnalysis,
) -> Vec<(SwivelRay, FaceId, Letter)> {
    let state = &folded.state;
    let mut out = Vec::new();
    for &id in &folded.report.fold.created {
        let Some(crease) = state.crease(id) else {
            continue;
        };
        let CreaseKind::Folded(letter) = crease.kind else {
            panic!("new crease {id} is not folded");
        };
        let [p, q] = crease.vertices;
        let face = state
            .faces()
            .iter()
            .find(|f| f.ring.contains(&p) && f.ring.contains(&q))
            .unwrap_or_else(|| panic!("no face holds crease {id}"));
        let layer = lineage(parent, state, face.id);
        let t = parent.isometry(layer).unwrap_or_default();
        let [mp, mq] = [p, q].map(|v| t.apply(state.vertices()[v.0 as usize]));
        let far = if close(mp, a.vertex) { mq } else { mp };
        let d = [far[0] - a.vertex[0], far[1] - a.vertex[1]];
        let ray = a
            .creases
            .iter()
            .find(|c| {
                (c.direction[0] * d[1] - c.direction[1] * d[0]).abs() < 1e-7 * d[0].hypot(d[1])
            })
            .map(|c| c.ray)
            .unwrap_or_else(|| panic!("crease {id} runs along no ray"));
        let seen_up = parent.seen_front_up(layer).unwrap_or(true);
        out.push((ray, layer, if seen_up { letter } else { opposite(letter) }));
    }
    out
}

/// Land a swivel on a folded edge as it must, and check it every way: the
/// full gate and its motion, Kawasaki and Maekawa (3 : 1) at its vertex, the
/// folded edge's half that opens lying flat, the letters (the edge layer's
/// swivel crease and the other's second as the direction, the other's
/// swivel crease the other way, as the viewer saw each layer), its edge on
/// the target, the regions it previews, and its picture.
fn swivel_checked(c: &FoldSwivelCase, op: &SwivelByEdge, label: &str) -> VertexFolded {
    let parent = &c.state;
    let a = analysis(parent, op);
    let folded = landed(parent.swivel_by_edge(op, &VertexChoices::default()));
    check(parent, &folded);
    let at = vertex_sheet(&folded);
    assert_kawasaki(&folded.state, at, label);
    let (m, v) = letters_at(&folded.state, at);
    assert!(
        (m, v) == (1, 3) || (m, v) == (3, 1),
        "{label}: {m} M, {v} V"
    );
    assert!(folded.report.fold.created.len() >= 3, "{label}");
    assert!(!folded.report.fold.unfolded.is_empty(), "{label}: h₋ opens");
    assert!(a.fold.is_some(), "{label}: no fold");
    let given = match op.direction {
        Direction::Valley => Letter::Valley,
        Direction::Mountain => Letter::Mountain,
    };
    // The other layer is the paper the second crease cuts, and all of it
    // joined flat (the edge's layer, folded to it, never is).
    let letters = seen_letters(parent, &folded, &a);
    let other = flat_closure(
        parent,
        letters
            .iter()
            .filter(|(ray, _, _)| *ray == SwivelRay::Hinge)
            .map(|&(_, layer, _)| layer)
            .collect(),
    );
    for (ray, layer, letter) in letters {
        let expected = match ray {
            SwivelRay::Hinge => given,
            SwivelRay::Meet if other.contains(&layer) => opposite(given),
            SwivelRay::Meet => given,
            other => panic!("{label}: a {other:?} crease"),
        };
        assert_eq!(letter, expected, "{label}: {ray:?} in face {layer}");
    }
    assert!(
        assert_edge_on_target(parent, &folded, c.edge, &a, label) >= 1,
        "{label}: too few of the edge's vertices checked"
    );
    let wedges: std::collections::HashSet<_> = a.regions.iter().map(|r| r.wedge).collect();
    assert_eq!(
        wedges,
        [SwivelWedge::Near, SwivelWedge::Turn, SwivelWedge::Beyond]
            .into_iter()
            .collect(),
        "{label}"
    );
    let action = parent
        .swivel_by_edge_action(op, Some(&folded.state))
        .unwrap_or_else(|e| panic!("{label}: {e}"));
    assert!(action.line.is_some(), "{label}: {action:?}");
    assert!(!action.moving.is_empty(), "{label}");
    folded
}

/// Abrashi's "What is Swivel fold?" on the owner's squashed preliminary
/// base: the kite's lower-left edge onto the centre line, the creases
/// meeting on its upper-left edge, where the line halfway between them
/// crosses it. The swivel turns about the bottom tip; the edge's layer
/// creases from there to the tip; the top layer creases along the same line
/// and along the one to the kite's right corner, and folds up along it.
/// The landing is the diagram's second picture: the edge on the centre
/// line, a narrow triangle beside it, the top layer's strip shown from
/// behind between the centre line and the right corner, the little
/// triangle by the left corner turned a quarter turn over it.
#[test]
fn abrashi_s_swivel_lands_as_the_diagram_shows() {
    let c = case("Abrashi's swivel");
    let parent = &c.state;
    let a = analysis(parent, &c.op);
    let k = FRAC_1_SQRT_2;
    // As the viewer sees it: the tip at the origin, the closed point at
    // (0, k), the kite's corners at (∓(k − ½), k − ½).
    let near = |p: Point, q: Point| (p[0] - q[0]).hypot(p[1] - q[1]) < 1e-9;
    let v = scene(parent, a.vertex);
    assert!(near(v, [-(1.0 - k) / 2.0, k / 2.0]), "{v:?}");
    assert!(near(scene(parent, a.meet), [0.0, 0.0]));
    assert!(
        (a.rotation.abs() - PI / 2.0).abs() < 1e-12,
        "{}",
        a.rotation
    );
    assert_eq!(
        a.creases
            .iter()
            .map(|c| (c.ray, c.letter, c.ridge))
            .collect::<Vec<_>>(),
        vec![
            (SwivelRay::Meet, Letter::Valley, false),
            (SwivelRay::Meet, Letter::Mountain, true),
            (SwivelRay::Hinge, Letter::Valley, false),
        ]
    );
    // The edge layer's crease runs to the tip; the top layer's second to
    // the kite's right corner.
    assert!(near(scene(parent, a.creases[0].to), [0.0, 0.0]));
    assert!(near(scene(parent, a.creases[2].to), [k - 0.5, k - 0.5]));
    // Seen from the top layer, its swivel crease shows from the vertex to
    // its raw edge, the edge layer's from there to the tip.
    assert!(near(a.creases[1].from, a.vertex));
    assert!(near(a.creases[0].from, a.creases[1].to));
    assert!(a.ridges.is_empty());
    let fold = a.fold.clone().unwrap_or_else(|| panic!("no fold"));
    assert!(near(scene(parent, fold.opens[1]), [-(k - 0.5), k - 0.5]));
    assert_eq!(fold.faces.len(), 2);
    assert_eq!(a.layers.len(), 2);

    let folded = swivel_checked(&c, &c.op, c.name);
    let state = &folded.state;
    // Pictured along the swivel crease from the vertex, the arrow from the
    // triangle that swivels to where it lands.
    let action = parent
        .swivel_by_edge_action(&c.op, Some(state))
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(action.grip.is_some(), "{action:?}");
    // One order, which the crease pattern and its letters alone allow.
    assert!(only_order_of_its_pattern(state));
    // The kite's lower-left edge lies along the centre line, from the tip up
    // to (0, 1 − k).
    let edge_ends: Vec<Point> = state
        .vertices()
        .iter()
        .enumerate()
        .filter(|(_, s)| (s[0] - 1.0).abs() < 1e-9 && s[1] >= k - 1e-9)
        .filter_map(|(i, _)| state.vertex_image(oristudio_fold::VertexId(i as u32)))
        .map(|p| scene(state, p))
        .collect();
    assert!(edge_ends.iter().any(|&p| near(p, [0.0, 0.0])));
    assert!(edge_ends.iter().any(|&p| near(p, [0.0, 1.0 - k])));
    assert!(edge_ends.iter().all(|p| p[0].abs() < 1e-9), "{edge_ends:?}");

    // The second picture, as the viewer sees it, top layer first.
    let (top_layer, edge_layer) = (a.layers[0], a.layers[1]);
    let faces_of = |p: Point| -> Vec<(FaceId, bool)> {
        seen_stack(state, p)
            .into_iter()
            .map(|f| {
                let from = lineage(parent, state, f);
                let turned = state.seen_front_up(f) != parent.seen_front_up(from);
                (from, turned)
            })
            .collect()
    };
    // Between the vertex, the centre line and (0, √2 − 1): the top layer's
    // little triangle by the left corner, a quarter turn round as it was,
    // over its strip shown from behind, over the rest of the top layer.
    let little = faces_of([-0.05, 0.37]);
    assert_eq!(little[0], (top_layer, false), "{little:?}");
    assert_eq!(little[1], (top_layer, true), "{little:?}");
    assert_eq!(little[2], (top_layer, false), "{little:?}");
    assert_eq!(little[3], (edge_layer, false), "{little:?}");
    // Below it, the swivelled triangle of the edge's layer, turned over, on
    // the rest of that layer.
    let swung = faces_of([-0.03, 0.15]);
    assert_eq!(swung[0], (edge_layer, true), "{swung:?}");
    assert_eq!(swung[1], (edge_layer, false), "{swung:?}");
    // Right of the centre line, the strip folded up shows its back up to the
    // line from (0, √2 − 1) to the right corner; below that line the flap's
    // right half, as before.
    let strip = faces_of([0.06, 0.3]);
    assert!(strip[0].1, "{strip:?}");
    assert_ne!(strip[0].0, edge_layer);
    let below = faces_of([0.05, 0.12]);
    assert!(!below[0].1, "{below:?}");
    assert!(parent.faces().iter().any(|f| f.id == below[0].0));
    // The crease pattern: the four new creases and the half that opened,
    // on top of the squash's.
    let before = folded_segments(parent);
    let after = folded_segments(state);
    assert_eq!(after.difference(&before).count(), 4, "{after:?}");
}

/// The other direction, the paper behind: the edge's triangle would have
/// to pass behind the base's other flaps, which it is joined in front of.
/// Refused for want of an order, offering the valley.
#[test]
fn abrashi_s_swivel_as_a_mountain_offers_the_valley() {
    let c = case("Abrashi's swivel");
    let op = SwivelByEdge {
        direction: Direction::Mountain,
        ..c.op.clone()
    };
    let refused = refusal(c.state.swivel_by_edge(&op, &VertexChoices::default()));
    assert_eq!(refused.refusal.code(), "no_order", "{refused:?}");
    assert_eq!(refused.fixes, vec![Fix::OppositeDirection]);
}

/// The kite base narrowed at its tip: each side's edge q c onto the
/// diagonal, the creases meeting on that side's kite crease; then the other
/// side on the first's landing. The flap over the kite crease folds across
/// the diagonal, over the other flap.
#[test]
fn the_kite_base_narrows_at_its_tip() {
    let right = case("kite narrowed at c, right");
    let a = analysis(&right.state, &right.op);
    // The bisector from c meets a q₁ at (k, 1 − k): α = 45°.
    let k = FRAC_1_SQRT_2;
    assert!(close(a.vertex, [k, 1.0 - k]), "{:?}", a.vertex);
    assert!(close(a.meet, [1.0, 1.0]));
    let one = swivel_checked(&right, &right.op, right.name);
    let left = case("kite narrowed at c, left");
    swivel_checked(&left, &left.op, left.name);
    // Both sides, the second on the first.
    let second = cases::on_fold(
        &one.state,
        left.op.fold.unwrap_or_default(),
        left.op.edge,
        [0.5, 0.5],
    );
    let both = FoldSwivelCase {
        name: "kite narrowed at c, both",
        state: one.state.clone(),
        op: second.clone(),
        edge: left.edge,
        fold: left.fold,
    };
    let folded = swivel_checked(&both, &second, both.name);
    // Mirror-symmetric across a c, (x, y) ↦ (y, x).
    let segments = folded_segments(&folded.state);
    let mirrored: std::collections::BTreeSet<_> = segments
        .iter()
        .map(|&(l, p, q)| {
            let (p, q) = ([p[1], p[0]], [q[1], q[0]]);
            if p <= q { (l, p, q) } else { (l, q, p) }
        })
        .collect();
    assert_eq!(mirrored, segments);
}

/// The refusals, each a code: a point on no folded crease, a bisector that
/// crosses the folded edge nowhere, a swivel crease meeting the folded edge
/// at a right angle, a crease running into a fold before the paper's edge,
/// and an edge the swivelling wedge does not hold.
#[test]
fn a_swivel_on_a_folded_edge_that_does_not_fit_is_refused_by_code() {
    let none = VertexChoices::default();
    let c = case("Abrashi's swivel");
    let state = &c.state;
    let k = FRAC_1_SQRT_2;
    // The centre line's precrease, and the kite's raw edge: no fold.
    for point in [[0.75, 0.5], [1.0, (k + 1.0) / 2.0]] {
        let op = SwivelByEdge {
            fold: Some(point),
            ..c.op.clone()
        };
        let refused = refusal(state.swivel_by_edge(&op, &none));
        assert_eq!(refused.refusal, FoldRefusal::SwivelNotAFold { point });
        assert!(state.analyse_swivel_by_edge(&op).is_err());
    }
    // The kite's upper-right edge: the bisector from the tip runs up the
    // left half, never crossing it.
    let op = SwivelByEdge {
        fold: Some([0.75, (0.5 + 1.0 - k) / 2.0]),
        ..c.op.clone()
    };
    let refused = refusal(state.swivel_by_edge(&op, &none));
    assert_eq!(refused.refusal.code(), "swivel_misses_fold", "{refused:?}");
    assert_eq!(refused.refusal.faces().len(), 2);
    // The square folded on b d: its bottom layer's left edge onto the
    // bottom edge's line meets b d at a right angle from a.
    let tri = cases::valley(&cases::square(), [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]);
    let bottom = tri
        .crease_at([0.5, 0.0])
        .and_then(|c| tri.crease_line(c.id))
        .unwrap_or_else(|| panic!("no bottom edge"));
    let op = SwivelByEdge {
        pivot: [0.5, 0.5],
        edge: [0.0, 0.5],
        target: bottom,
        layers: Seed::All,
        ridge: None,
        direction: Direction::Valley,
        fold: Some([0.5, 0.5]),
    };
    let refused = refusal(tri.swivel_by_edge(&op, &none));
    assert_eq!(refused.refusal.code(), "swivel_fold_wide", "{refused:?}");
    // The top layer's raw edge along the kite's middle onto the centre line:
    // the same vertex, but the edge's layer is now the top one, and the
    // creases in the layer under it run into the fold down the centre.
    let op = cases::on_fold(
        state,
        c.op.fold.unwrap_or_default(),
        [1.0, 0.6],
        [0.75, 0.5],
    );
    let refused = refusal(state.swivel_by_edge(&op, &none));
    assert_eq!(refused.refusal.code(), "fan_ray_blocked", "{refused:?}");
}

/// The edge names a line: the base flaps' lower-left edges lie behind the
/// kite's along the model's lower-left edge, and a click on any of them
/// names that line — the swivel is the same, its own triangle's edge laid
/// on the centre line.
#[test]
fn edges_stacked_on_one_line_name_one_swivel() {
    let c = case("Abrashi's swivel");
    let state = &c.state;
    let none = VertexChoices::default();
    let by_kite = landed(state.swivel_by_edge(&c.op, &none));
    for behind in [[0.0, 0.75], [0.75, 1.0]] {
        let op = cases::on_fold(state, c.op.fold.unwrap_or_default(), behind, [0.75, 0.5]);
        let by_base = landed(state.swivel_by_edge(&op, &none));
        assert_eq!(
            folded_segments(&by_base.state),
            folded_segments(&by_kite.state),
            "{behind:?}"
        );
        let a = analysis(state, &op);
        let [p, q] = a.landed[0];
        let k = FRAC_1_SQRT_2;
        let near = |x: Point, y: Point| (x[0] - y[0]).hypot(x[1] - y[1]) < 1e-9;
        // From the tip up the centre line to (0, 1 − k), as the viewer sees it.
        assert!(near(scene(state, p), [0.0, 0.0]), "{p:?}");
        assert!(near(scene(state, q), [0.0, 1.0 - k]), "{q:?}");
    }
}

/// An edge of a third flap: on a drawn state (the square's top two thirds
/// folded down, that flap's corner folded back up), the swivel's creases
/// meet on the first fold, but the edge clicked — the corner's, along the
/// line x ≈ 0.33 — is in neither layer that fold joins, and the swivelling
/// wedge has no side along its line: nothing would land on the target.
#[test]
fn an_edge_neither_layer_holds_stays() {
    let mut rng = Rng::new(77_319);
    let state = random::folded(&mut rng).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(state.faces().len(), 3);
    let fold = [0.5, 0.328_091_868_022_873_05];
    let op = SwivelByEdge {
        pivot: state.resolve_point(fold).unwrap_or_default(),
        edge: [0.664_020_994_937_064_8, 1.0],
        target: Line::new(
            [0.311_617_507_588_146_77, 0.950_207_624_135_141_9],
            0.311_617_507_588_146_77,
        )
        .unwrap_or_else(|| panic!("no target")),
        layers: Seed::All,
        ridge: None,
        direction: Direction::Valley,
        fold: Some(fold),
    };
    let refused = refusal(state.swivel_by_edge(&op, &VertexChoices::default()));
    assert_eq!(refused.refusal.code(), "swivel_edge_stays", "{refused:?}");
}

/// A free swivel's op is spelled as it always was, with no `fold`; one on a
/// folded edge carries it, and reads back as it was.
#[test]
fn the_folded_edge_is_spelled_only_when_the_creases_meet_on_one() {
    let free = cases::by_edge(
        [0.8, 0.3],
        [0.5, 0.0],
        support::through([0.0, 0.0], [1.0, 1.0]),
    );
    let json = serde_json::to_value(&free).unwrap_or_default();
    assert!(json.get("fold").is_none(), "{json}");
    let c = case("Abrashi's swivel");
    let json = serde_json::to_value(&c.op).unwrap_or_default();
    assert!(json.get("fold").is_some(), "{json}");
    let read: SwivelByEdge = serde_json::from_value(json).unwrap_or_else(|e| panic!("{e}"));
    assert_eq!(read, c.op);
    // There is no rays form: the vertex lies on a crease.
    let refused = c
        .state
        .swivel_by_edge_as_rays(&c.op)
        .expect_err("a rays form");
    assert_eq!(refused.refusal.code(), "fan_center");
}

/// The seeded campaign: on drawn folded states, a folded crease (its sheet
/// midpoint), an edge (a raw or folded crease's), a target through two
/// vertex images. Every swivel on a folded edge that lands passes the full
/// gate, is flat at its vertex with Maekawa's 3 : 1, and lays its edge on
/// the target.
#[test]
fn every_swivel_on_a_folded_edge_that_lands_folds_flat_with_its_edge_on_the_target() {
    let (mut landed_count, mut tried) = (0, 0);
    for seed in 0..1500u64 {
        let mut rng = Rng::new(31_337 + seed);
        let Ok(state) = random::folded(&mut rng) else {
            continue;
        };
        if state.faces().len() > 24 {
            continue;
        }
        let sheet_of = |kind: fn(&CreaseKind) -> bool| -> Vec<[Point; 2]> {
            state
                .creases()
                .iter()
                .filter(|c| kind(&c.kind))
                .map(|c| c.vertices.map(|v| state.vertices()[v.0 as usize]))
                .filter(|[p, q]| (q[0] - p[0]).hypot(q[1] - p[1]) > 0.05)
                .collect()
        };
        let folds = sheet_of(|k| matches!(k, CreaseKind::Folded(_)));
        let edges = sheet_of(|k| matches!(k, CreaseKind::Border | CreaseKind::Folded(_)));
        let (Some(fold), Some(edge)) = (rng.pick(&folds), rng.pick(&edges)) else {
            continue;
        };
        let images: Vec<Point> = (0..state.vertices().len())
            .filter_map(|v| state.vertex_image(oristudio_fold::VertexId(v as u32)))
            .collect();
        let (Some(p), Some(q)) = (rng.pick(&images), rng.pick(&images)) else {
            continue;
        };
        let Some(target) = Line::from_points(p, q) else {
            continue;
        };
        let mid = |s: [Point; 2]| [(s[0][0] + s[1][0]) / 2.0, (s[0][1] + s[1][1]) / 2.0];
        let Some(pivot) = state.resolve_point(mid(fold)) else {
            continue;
        };
        let op = SwivelByEdge {
            pivot,
            edge: mid(edge),
            target,
            layers: Seed::All,
            ridge: None,
            direction: if rng.chance(0.5) {
                Direction::Valley
            } else {
                Direction::Mountain
            },
            fold: Some(mid(fold)),
        };
        tried += 1;
        let Ok(VertexOutcome::Landed(_)) = state.swivel_by_edge(&op, &VertexChoices::default())
        else {
            continue;
        };
        let label = format!("seed {seed}");
        let c = FoldSwivelCase {
            name: "campaign",
            state: state.clone(),
            op: op.clone(),
            edge,
            fold,
        };
        swivel_checked(&c, &op, &label);
        landed_count += 1;
    }
    eprintln!("{landed_count} of {tried} drawn swivels on folded edges landed");
    assert!(landed_count >= 30, "{landed_count} of {tried}");
}
