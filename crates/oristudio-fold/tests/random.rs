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
//! The sequences are `oristudio_fold::random`'s, the draws the oracles in
//! `crates/oracle-tests` replay. `random_sequences_hold_their_invariants` runs
//! a modest campaign on every `cargo test`; `random_campaign` (ignored) a
//! larger one:
//! `cargo test -p oristudio-fold --release --test random -- --ignored`.

mod support;

use std::collections::{BTreeMap, BTreeSet};

use oristudio_fold::numerics::{MIN_FEATURE, TOL};
use oristudio_fold::random::{self, Op, Outcome, Rng, Sequence};
use oristudio_fold::{CreaseKind, Folded, PlainFold, Sheet, Side, StartSide, State, VertexId};
use oristudio_geometry::Line;
use support::*;

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

/// Sequence `s` of the campaign seeded `seed` is
/// `Sequence::new(seed · 0x2545_f491_4f6c_dd1d ^ s)`, the name the oracles
/// give it too.
fn campaign(sequences: u64, steps: usize, max_faces: usize, seed: u64) -> Tally {
    let mut tally = Tally::default();
    for sequence in 0..sequences {
        let named = seed.wrapping_mul(0x2545_f491_4f6c_dd1d) ^ sequence;
        let drawn = Sequence::new(named, steps, max_faces).unwrap_or_else(|e| panic!("{e}"));
        for step in drawn {
            let parent = &step.parent;
            match (&step.op, &step.outcome) {
                (Op::TurnOver, Outcome::Viewed(turned)) => {
                    assert_eq!(turned.creases(), parent.creases());
                    assert_eq!(turned.order(), parent.order());
                    tally.turns += 1;
                }
                (Op::Rotate(_), Outcome::Viewed(_)) => tally.turns += 1,
                (Op::Fold(op) | Op::Precrease(op), Outcome::Landed(folded)) => {
                    let precrease = matches!(step.op, Op::Precrease(_));
                    check_fold(parent, op, folded, precrease);
                    tally.applied += 1;
                    tally.precreases += usize::from(precrease);
                    tally.max_faces = tally.max_faces.max(folded.state.faces().len());
                }
                (_, Outcome::Refused(e)) => {
                    *tally.refused.entry(e.refusal.code()).or_default() += 1;
                }
                (op, _) => panic!("{op:?} had another kind of outcome"),
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

/// A digest of everything the larger campaign's steps produce: each
/// operation and its outcome, landed parts (every coordinate to the bit, as
/// `Debug` prints an `f64`) and reports, or the refusal. A change meant to
/// leave the engine's results alone (a faster path) prints the same digest
/// as the build before it:
/// `cargo test -p oristudio-fold --release --test random -- --ignored campaign_digest --nocapture`.
#[test]
#[ignore = "prints a digest to compare between builds; run with --release --ignored"]
fn campaign_digest() {
    use std::hash::{DefaultHasher, Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    let mut steps = 0;
    for seed in 2..6u64 {
        for sequence in 0..400u64 {
            let named = seed.wrapping_mul(0x2545_f491_4f6c_dd1d) ^ sequence;
            let drawn = Sequence::new(named, 12, 160).unwrap_or_else(|e| panic!("{e}"));
            for step in drawn {
                format!("{:?}", step.op).hash(&mut hasher);
                match &step.outcome {
                    Outcome::Landed(folded) => {
                        format!("{:?} {:?}", folded.state.parts(), folded.report).hash(&mut hasher);
                    }
                    Outcome::Viewed(state) => format!("{:?}", state.view()).hash(&mut hasher),
                    Outcome::Refused(refused) => format!("{refused:?}").hash(&mut hasher),
                }
                steps += 1;
            }
        }
    }
    eprintln!("{steps} steps, digest {:016x}", hasher.finish());
}

#[test]
fn every_crease_kind_is_reached() {
    // The campaign exercises unfolds and refolds, not only new creases.
    let mut rng = Rng::new(7);
    let mut state =
        State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut kinds = BTreeSet::new();
    for _ in 0..200 {
        if state.faces().len() > 40 {
            state =
                State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
        }
        let Some(op) = random::plain_fold(&state, &mut rng) else {
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
