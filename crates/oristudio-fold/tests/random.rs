//! Property tests over seeded random sequences (plan D19): folds along lines
//! through landmarks — two vertex images, their perpendicular bisector, a
//! crease's line, the bisector of two creases, a vertex at a sixteenth of a
//! turn — plus a few free lines, with every kind of seed, precreases,
//! turn-overs and rotations, on square, rectangular and polygonal sheets.
//!
//! Every landed state passes the full gate from scratch and the layer-order
//! checker with a newly built problem. Every applied fold satisfies:
//!
//! - **the snap invariant**: no vertex changes band between the line asked
//!   for and the line folded along, and none is a near miss;
//! - vertices move rigidly: a moving-side vertex of a moved face lands at its
//!   reflection across the folded line, every other vertex stays put (a
//!   precrease returns every vertex);
//! - creases off the line keep what they were; one face more per split.
//!
//! `random_sequences_hold_their_invariants` runs a modest campaign on every
//! `cargo test`; `random_campaign` (ignored) a larger one:
//! `cargo test -p oristudio-fold --release --test random -- --ignored`.

mod support;

use std::collections::{BTreeMap, BTreeSet};

use oristudio_fold::numerics::{MIN_FEATURE, TOL};
use oristudio_fold::{
    CreaseKind, Direction, Folded, PlainFold, Seed, Sheet, Side, StartSide, State, VertexId,
};
use oristudio_geometry::Line;
use support::*;

/// SplitMix64, so the campaign needs no dependency and replays exactly.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        ((z ^ (z >> 31)) >> 11) as f64 / (1u64 << 53) as f64
    }

    fn below(&mut self, n: usize) -> usize {
        ((self.next() * n as f64) as usize).min(n.saturating_sub(1))
    }

    fn chance(&mut self, p: f64) -> bool {
        self.next() < p
    }

    fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[self.below(items.len())]
    }
}

fn sheet(rng: &mut Rng) -> Sheet {
    let x = rng.next();
    let built = if x < 0.5 {
        Ok(Sheet::square())
    } else if x < 0.75 {
        Sheet::rectangle(0.4 + rng.next(), 1.0)
    } else {
        Sheet::regular(3 + rng.below(6) as u32)
    };
    built.unwrap_or_else(|e| panic!("{e}"))
}

/// The distinct vertex images.
fn landmarks(state: &State) -> Vec<Point> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for v in 0..state.vertices().len() {
        if let Some(p) = state.vertex_image(VertexId(v as u32)) {
            let key = ((p[0] * 1e8).round() as i64, (p[1] * 1e8).round() as i64);
            if seen.insert(key) {
                out.push(p);
            }
        }
    }
    out
}

/// A crease's image segment.
fn crease_segment(state: &State, rng: &mut Rng) -> Option<(Point, Point)> {
    let crease = &state.creases()[rng.below(state.creases().len())];
    let [a, b] = crease.vertices.map(|v| state.vertex_image(v));
    Some((a?, b?))
}

fn random_line(state: &State, rng: &mut Rng) -> Option<Line> {
    let points = landmarks(state);
    let two = |rng: &mut Rng| {
        let p = rng.pick(&points);
        let q = rng.pick(&points);
        ((p[0] - q[0]).hypot(p[1] - q[1]) > 1e-6).then_some((p, q))
    };
    match rng.below(6) {
        0 => two(rng).and_then(|(p, q)| Line::from_points(p, q)),
        1 => two(rng).and_then(|(p, q)| Line::perpendicular_bisector(p, q)),
        2 => crease_segment(state, rng).and_then(|(a, b)| Line::from_points(a, b)),
        3 => {
            let ((a, b), (c, d)) = (crease_segment(state, rng)?, crease_segment(state, rng)?);
            let (u, w) = (
                unit([b[0] - a[0], b[1] - a[1]])?,
                unit([d[0] - c[0], d[1] - c[1]])?,
            );
            let (l1, l2) = (Line::from_points(a, b)?, Line::from_points(c, d)?);
            let x = l1.intersect(&l2)?;
            let s = if u[0] * w[0] + u[1] * w[1] >= 0.0 {
                1.0
            } else {
                -1.0
            };
            let bisector = [u[0] + s * w[0], u[1] + s * w[1]];
            let dir = if rng.chance(0.5) {
                bisector
            } else {
                [-bisector[1], bisector[0]]
            };
            Line::from_point_direction(x, dir)
        }
        4 => {
            let p = rng.pick(&points);
            let angle = if rng.chance(0.7) {
                rng.below(16) as f64 * std::f64::consts::PI / 16.0
            } else {
                rng.next() * std::f64::consts::PI
            };
            Line::from_point_direction(p, [angle.cos(), angle.sin()])
        }
        _ => {
            let (x0, y0, x1, y1) = points.iter().fold(
                (
                    f64::INFINITY,
                    f64::INFINITY,
                    f64::NEG_INFINITY,
                    f64::NEG_INFINITY,
                ),
                |b, p| (b.0.min(p[0]), b.1.min(p[1]), b.2.max(p[0]), b.3.max(p[1])),
            );
            let p = [x0 + rng.next() * (x1 - x0), y0 + rng.next() * (y1 - y0)];
            let angle = rng.next() * std::f64::consts::PI;
            Line::from_point_direction(p, [angle.cos(), angle.sin()])
        }
    }
}

fn unit(v: Point) -> Option<Point> {
    let len = v[0].hypot(v[1]);
    (len > 1e-12).then(|| [v[0] / len, v[1] / len])
}

/// A sheet point of a random face whose image lies on the moving side.
fn moving_side_point(state: &State, line: &Line, side: Side, rng: &mut Rng) -> Option<Point> {
    for _ in 0..8 {
        let face = state.faces()[rng.below(state.faces().len())].id;
        let image = state.face_image(face)?;
        let weights: Vec<f64> = image.iter().map(|_| rng.next() + 0.05).collect();
        let total: f64 = weights.iter().sum();
        let p = image.iter().zip(&weights).fold([0.0, 0.0], |s, (q, w)| {
            [s[0] + q[0] * w / total, s[1] + q[1] * w / total]
        });
        let d = line.signed_distance(p);
        let d = if side == Side::Positive { d } else { -d };
        if d > MIN_FEATURE {
            let t = state.isometry(face)?;
            return Some(t.inverse().apply(p));
        }
    }
    None
}

fn random_op(state: &State, rng: &mut Rng) -> Option<PlainFold> {
    let line = random_line(state, rng)?;
    let side = if rng.chance(0.5) {
        Side::Positive
    } else {
        Side::Negative
    };
    let direction = if rng.chance(0.5) {
        Direction::Valley
    } else {
        Direction::Mountain
    };
    let op = PlainFold::new(line, side, direction);
    let x = rng.next();
    let seed = if x < 0.4 {
        Seed::All
    } else if x < 0.85 {
        let at = moving_side_point(state, &line, side, rng)?;
        let stack = state.stack_at(state.image_of(at)?)?.len().max(1);
        Seed::Depth {
            at,
            layers: 1 + rng.below(stack),
        }
    } else {
        let flaps = state.analyse_fold(&op).ok()?.flaps;
        let flap = &flaps[rng.below(flaps.len())];
        Seed::Flaps {
            at: vec![flap.witness],
        }
    };
    Some(op.with_seed(seed))
}

fn band(d: f64) -> i8 {
    let a = d.abs();
    if a <= TOL {
        0
    } else if a < MIN_FEATURE {
        9
    } else if d > 0.0 {
        1
    } else {
        -1
    }
}

fn oriented(line: &Line, side: Side, p: Point) -> f64 {
    let d = line.signed_distance(p);
    if side == Side::Positive { d } else { -d }
}

/// The per-fold invariants.
fn check_fold(parent: &State, op: &PlainFold, folded: &Folded, precrease: bool) {
    let child = &folded.state;
    let applied = &folded.report.analysis;
    assert_valid(child);
    assert!(child.residual() <= TOL);

    // The snap invariant.
    for v in 0..parent.vertices().len() {
        let Some(p) = parent.vertex_image(VertexId(v as u32)) else {
            continue;
        };
        let asked = band(oriented(&op.line, op.side, p));
        let folded_along = band(oriented(&applied.line, applied.side, p));
        assert_ne!(asked, 9, "vertex {v} folded as a near miss");
        assert_eq!(
            asked, folded_along,
            "the snap moved vertex {v} across a band"
        );
    }

    // Rigid motion of every old vertex.
    let reflect = |p: Point| applied.line.reflect_point(p);
    let moved: BTreeSet<_> = applied.moving.iter().copied().collect();
    let mut moves = vec![false; parent.vertices().len()];
    for face in parent.faces().iter().filter(|f| moved.contains(&f.id)) {
        for &v in &face.ring {
            let p = parent.vertex_image(v).unwrap_or([0.0, 0.0]);
            if band(oriented(&applied.line, applied.side, p)) == 1 {
                moves[v.0 as usize] = true;
            }
        }
    }
    for (v, &m) in moves.iter().enumerate() {
        let id = VertexId(v as u32);
        let (Some(before), Some(after)) = (parent.vertex_image(id), child.vertex_image(id)) else {
            continue;
        };
        let expected = if m && !precrease {
            reflect(before)
        } else {
            before
        };
        let off = (after[0] - expected[0]).hypot(after[1] - expected[1]);
        assert!(
            off < 1e-9,
            "vertex {v} landed {off} from where the fold puts it"
        );
    }

    // Creases off the line keep their kind; one face more per split.
    let toggled: BTreeSet<_> = folded
        .report
        .unfolded
        .iter()
        .copied()
        .chain(folded.report.refolded.iter().map(|r| r.edge))
        .collect();
    for crease in parent.creases() {
        if let Some(now) = child.crease(crease.id)
            && !toggled.contains(&crease.id)
            && !precrease
        {
            assert_eq!(now.kind, crease.kind, "crease {} changed", crease.id);
        }
    }
    assert_eq!(
        child.faces().len(),
        parent.faces().len() + folded.report.split
    );
}

#[derive(Default)]
struct Tally {
    applied: usize,
    precreases: usize,
    refused: BTreeMap<&'static str, usize>,
    turns: usize,
    max_faces: usize,
}

fn campaign(sequences: u64, steps: usize, max_faces: usize, seed: u64) -> Tally {
    let mut tally = Tally::default();
    for sequence in 0..sequences {
        let mut rng = Rng(seed.wrapping_mul(0x2545_f491_4f6c_dd1d) ^ sequence);
        let start = if rng.chance(0.2) {
            StartSide::Back
        } else {
            StartSide::Front
        };
        let mut state = State::flat(sheet(&mut rng), start).unwrap_or_else(|e| panic!("{e}"));
        for _ in 0..steps {
            if state.faces().len() > max_faces {
                break;
            }
            let x = rng.next();
            if x < 0.06 {
                let turned = state.turn_over();
                assert_eq!(turned.creases(), state.creases());
                assert_eq!(turned.order(), state.order());
                tally.turns += 1;
                state = turned;
                continue;
            }
            if x < 0.1 {
                state = state.rotate(rng.next() * std::f64::consts::TAU);
                tally.turns += 1;
                continue;
            }
            let Some(op) = random_op(&state, &mut rng) else {
                continue;
            };
            let precrease = x < 0.2;
            let result = if precrease {
                state.precrease(&op)
            } else {
                state.fold(&op)
            };
            match result {
                Ok(folded) => {
                    check_fold(&state, &op, &folded, precrease);
                    tally.applied += 1;
                    tally.precreases += usize::from(precrease);
                    tally.max_faces = tally.max_faces.max(folded.state.faces().len());
                    state = folded.state;
                }
                Err(e) => *tally.refused.entry(e.refusal.code()).or_default() += 1,
            }
        }
    }
    tally
}

#[test]
fn random_sequences_hold_their_invariants() {
    let tally = campaign(160, 10, 64, 1);
    eprintln!(
        "applied {} (precreases {}), turns {}, max faces {}, refused {:?}",
        tally.applied, tally.precreases, tally.turns, tally.max_faces, tally.refused
    );
    assert!(tally.applied >= 600, "only {} folds applied", tally.applied);
    assert!(tally.precreases >= 60);
    assert!(tally.max_faces >= 40);
    // Folds the engine must never refuse for these inputs.
    for code in [
        "layer_order",
        "residual",
        "prediction_mismatch",
        "degenerate_split",
        "folded_image",
    ] {
        assert!(
            !tally.refused.contains_key(code),
            "refused as {code}: {:?}",
            tally.refused
        );
    }
}

/// A face between μ/2 and μ wide (which the thin-piece rule allows) landing
/// across another overlaps it by its own width, less than μ. That is the face,
/// not a sliver between two faces, so it lands (found by the campaign on a
/// regular heptagon, seed 2, sequence 21; `tests/fixtures/thin-face-landing.json`).
#[test]
fn a_thin_face_landing_across_another_is_no_sliver() {
    use oristudio_geometry::convex;

    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/thin-face-landing.json"
    );
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path}: {e}"));
    let ops: Vec<PlainFold> = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{e}"));
    let sheet = Sheet::regular(7).unwrap_or_else(|e| panic!("{e}"));
    let mut state = State::flat(sheet, StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut last = None;
    for op in &ops {
        let folded = fold(&state, op);
        check_fold(&state, op, &folded, false);
        state = folded.state.clone();
        last = Some(folded);
    }
    let Some(last) = last else { unreachable!() };
    let moving: BTreeSet<_> = last.report.moving_faces.iter().copied().collect();
    let mut thin_landings = 0;
    for &m in &moving {
        for f in state.faces().iter().filter(|f| !moving.contains(&f.id)) {
            let (Some(a), Some(b)) = (state.face_image(m), state.face_image(f.id)) else {
                continue;
            };
            let penetration = convex::penetration(a, b);
            if penetration > TOL && penetration < MIN_FEATURE {
                let thinner = convex::width(a).min(convex::width(b));
                assert!(
                    penetration >= thinner - TOL,
                    "a sliver landed: {penetration}"
                );
                thin_landings += 1;
            }
        }
    }
    assert!(
        thin_landings > 0,
        "the case no longer reaches the exemption"
    );
}

#[test]
#[ignore = "a larger campaign; run with --release --ignored"]
fn random_campaign() {
    for seed in 2..6 {
        let tally = campaign(400, 12, 160, seed);
        eprintln!(
            "seed {seed}: applied {} (precreases {}), turns {}, max faces {}, refused {:?}",
            tally.applied, tally.precreases, tally.turns, tally.max_faces, tally.refused
        );
        for code in [
            "layer_order",
            "residual",
            "prediction_mismatch",
            "degenerate_split",
            "folded_image",
        ] {
            assert!(
                !tally.refused.contains_key(code),
                "seed {seed}: refused as {code}"
            );
        }
    }
}

#[test]
fn every_crease_kind_is_reached() {
    // The campaign exercises unfolds and refolds, not only new creases.
    let mut rng = Rng(7);
    let mut state =
        State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut kinds = BTreeSet::new();
    for _ in 0..200 {
        if state.faces().len() > 40 {
            state =
                State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
        }
        let Some(op) = random_op(&state, &mut rng) else {
            continue;
        };
        if let Ok(folded) = state.fold(&op) {
            for c in folded.state.creases() {
                kinds.insert(match c.kind {
                    CreaseKind::Border => 0,
                    CreaseKind::Folded(_) => 1,
                    CreaseKind::Flat(_) => 2,
                });
            }
            state = folded.state;
        }
    }
    assert_eq!(kinds.len(), 3, "{kinds:?}");
}
