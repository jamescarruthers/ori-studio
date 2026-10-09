//! The engine's incremental layer-order problem against one built from
//! scratch: after every fold of seeded random sequences, `State::problem()`
//! (rebuilt by `make_after` from the previous state's problem over the faces
//! the fold touched) decides what a fresh `ConstraintProblem::build` of the
//! landed view decides — the same variables, constraints and ambiguities,
//! and cells with the same faces.
//!
//! Cell polygons are compared to 1e-9 rather than bit for bit: the gate
//! re-derives every isometry from the root, so a face the fold did not touch
//! can land in its last bits elsewhere than before, and the rebuild keeps the
//! cells it had (`oristudio-layer-order`'s `Overlay::rebuild`).
//!
//! Folds are along creases (refolding precreases, unfolding), through vertex
//! images and freely through the middle, with every kind of seed, and some
//! are precreases. `incremental_problem_matches_a_fresh_build` runs a modest
//! campaign on every `cargo test`; `incremental_problem_campaign` (ignored) a
//! larger one:
//! `cargo test -p oristudio-fold --release --test incremental_order -- --ignored`.

use oristudio_fold::random::{Rng, plain_fold_along};
use oristudio_fold::{PlainFold, Sheet, StartSide, State, VertexId};
use oristudio_geometry::Line;
use oristudio_layer_order::ConstraintProblem;

type Point = [f64; 2];

fn images(state: &State) -> Vec<Point> {
    (0..state.vertices().len())
        .filter_map(|v| state.vertex_image(VertexId(v as u32)))
        .collect()
}

fn random_line(state: &State, rng: &mut Rng) -> Option<Line> {
    let points = images(state);
    match rng.below(4) {
        0 => {
            let crease = &state.creases()[rng.below(state.creases().len())];
            state.crease_line(crease.id)
        }
        1 => {
            let (p, q) = (
                points[rng.below(points.len())],
                points[rng.below(points.len())],
            );
            Line::from_points(p, q)
        }
        2 => {
            let p = points[rng.below(points.len())];
            let a = rng.below(16) as f64 * std::f64::consts::PI / 16.0;
            Line::from_point_direction(p, [a.cos(), a.sin()])
        }
        _ => {
            let [x0, y0, x1, y1] = oristudio_geometry::convex::bounding_box(&points);
            let c = [
                x0 + (0.3 + 0.4 * rng.next_f64()) * (x1 - x0),
                y0 + (0.3 + 0.4 * rng.next_f64()) * (y1 - y0),
            ];
            let a = rng.next_f64() * std::f64::consts::PI;
            Line::from_point_direction(c, [a.cos(), a.sin()])
        }
    }
}

/// A fold along a line drawn here, with the side, direction and seed
/// `oristudio_fold::random` draws.
fn random_op(state: &State, rng: &mut Rng) -> Option<PlainFold> {
    let line = random_line(state, rng)?;
    plain_fold_along(state, line, rng)
}

/// What differs between the state's problem and a fresh build, if anything.
fn mismatch(state: &State) -> Option<String> {
    let kept = state.problem();
    let fresh = ConstraintProblem::build(state.folded_view());
    if kept.variables() != fresh.variables() {
        return Some("variables".into());
    }
    if kept.constraints() != fresh.constraints() {
        return Some("constraints".into());
    }
    if kept.ambiguities() != fresh.ambiguities() {
        return Some(format!(
            "ambiguities {:?} against {:?}",
            kept.ambiguities(),
            fresh.ambiguities()
        ));
    }
    let (a, b) = (kept.overlay().cells(), fresh.overlay().cells());
    if a.len() != b.len() {
        return Some(format!("{} cells against {}", a.len(), b.len()));
    }
    for (c, (x, y)) in a.iter().zip(b).enumerate() {
        if x.faces != y.faces || x.polygon.len() != y.polygon.len() {
            return Some(format!("cell {c}: {:?} against {:?}", x.faces, y.faces));
        }
        let drift = x
            .polygon
            .iter()
            .zip(&y.polygon)
            .map(|(p, q)| (p[0] - q[0]).abs().max((p[1] - q[1]).abs()))
            .fold(0.0, f64::max);
        if drift > 1e-9 {
            return Some(format!("cell {c} moved by {drift:e}"));
        }
    }
    None
}

/// Folds checked, and the largest state reached.
fn campaign(seed: u64, sequences: u64, steps: usize, max_faces: usize) -> (usize, usize) {
    let (mut checked, mut largest) = (0, 0);
    for s in 0..sequences {
        let mut rng = Rng::new(seed + s);
        let sheet = match rng.below(3) {
            0 => Sheet::square(),
            1 => {
                Sheet::rectangle(0.5 + 0.5 * rng.next_f64(), 1.0).unwrap_or_else(|e| panic!("{e}"))
            }
            _ => Sheet::regular(3 + rng.below(6) as u32).unwrap_or_else(|e| panic!("{e}")),
        };
        let mut state = State::flat(sheet, StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
        let mut done = 0;
        for _ in 0..6 * steps {
            if done == steps || state.faces().len() > max_faces {
                break;
            }
            let Some(op) = random_op(&state, &mut rng) else {
                continue;
            };
            let landed = if rng.chance(0.15) {
                state.precrease(&op)
            } else {
                state.fold(&op)
            };
            let Ok(landed) = landed else {
                continue;
            };
            let next = landed.state;
            if let Some(what) = mismatch(&next) {
                panic!(
                    "sequence {s} fold {done} ({} faces): {what}",
                    next.faces().len()
                );
            }
            checked += 1;
            largest = largest.max(next.faces().len());
            state = next;
            done += 1;
        }
    }
    (checked, largest)
}

#[test]
fn incremental_problem_matches_a_fresh_build() {
    let (checked, largest) = campaign(5100, 10, 10, 48);
    eprintln!("{checked} folds checked, largest state {largest} faces");
    assert!(checked >= 60, "only {checked} folds checked");
    assert!(largest > 24, "largest state {largest} faces");
}

#[test]
#[ignore = "larger campaign; run in release"]
fn incremental_problem_campaign() {
    let (checked, largest) = campaign(61_000, 80, 16, 256);
    eprintln!("{checked} folds checked, largest state {largest} faces");
    assert!(checked >= 600, "only {checked} folds checked");
}
