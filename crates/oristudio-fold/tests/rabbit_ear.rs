//! The rabbit ear and the swivel through the compound pipeline (plan Phase
//! 11; research §5.3), on the vertex spike's case 3 (`cases.mjs`): each
//! emergent ray's ‹ n of m › with the direction seed, the ridge making a
//! rabbit ear unique, the rays that do not close refused with the ones that
//! do, stored choices replayed, and the fan's own refusals.

mod beloch;
mod support;
mod vertex;

use std::collections::BTreeMap;

use oristudio_fold::{
    Broken, BrokenWitness, CompoundRefused, Direction, Fix, FoldRefusal, Letter, RabbitEar, Seed,
    State, Swivel, VertexChoices, VertexOutcome, WitnessOrder,
};
use vertex::cases::{self, EarCase, candidates_of, every, landed};
use vertex::check;

/// What a vertex fold came to: one state, a choice of n, or a refusal's
/// code.
#[derive(Debug, PartialEq)]
enum Came {
    One,
    Choice(u64),
    Refused(&'static str),
}

fn came(outcome: &Result<VertexOutcome, CompoundRefused>) -> Came {
    match outcome {
        Ok(VertexOutcome::Landed(_)) => Came::One,
        Ok(VertexOutcome::ChooseOrder(c)) => Came::Choice(c.count().orders),
        Err(CompoundRefused::Refused(r)) => Came::Refused(r.refusal.code()),
        Err(CompoundRefused::Broken(b)) => panic!("broken {b}"),
    }
}

/// Each case's outcome per emergent candidate, by its direction in whole
/// degrees; every state it lands checked.
fn per_candidate(case: &EarCase) -> BTreeMap<i32, Came> {
    candidates_of(&case.state, &case.op)
        .into_iter()
        .map(|(deg, direction)| {
            let op = RabbitEar {
                emergent: direction,
                ..case.op.clone()
            };
            let outcome = case.state.rabbit_ear(&op, &VertexChoices::default());
            let result = came(&outcome);
            for folded in every(outcome) {
                check(&case.state, &folded);
            }
            (deg, result)
        })
        .collect()
}

fn case(name: &str) -> EarCase {
    cases::ear_cases()
        .into_iter()
        .find(|c| c.name == name)
        .unwrap_or_else(|| panic!("no case {name}"))
}

/// Research §5.3's table: with the direction seed a rabbit ear leaves two
/// orders (or one, for the two-layer triangle's 45° ray), and an emergent
/// ray into a hinge to paper that stays does not close.
#[test]
fn each_emergent_ray_lands_as_the_spike_found() {
    use Came::{Choice, One, Refused};
    let want: [(&str, Vec<(i32, Came)>); 5] = [
        (
            "3a both layers",
            vec![(45, One), (180, Choice(2)), (270, Choice(2))],
        ),
        (
            "3b top layer",
            vec![
                (45, Refused("fan_ray_blocked")),
                (180, Choice(2)),
                (270, Choice(2)),
            ],
        ),
        (
            "3c flat square",
            vec![
                (0, Choice(2)),
                (135, Refused("fan_ray_blocked")),
                (270, Choice(2)),
            ],
        ),
        ("3d fish ear 1", vec![(180, Choice(2))]),
        (
            "3e kite flap",
            vec![
                (45, Choice(2)),
                (135, Choice(2)),
                // 292.5°, the spike's "293".
                (292, Refused("fan_ray_blocked")),
            ],
        ),
    ];
    for (name, want) in want {
        let got = per_candidate(&case(name));
        for (deg, came) in want {
            assert_eq!(got.get(&deg), Some(&came), "{name} at {deg}°: {got:?}");
        }
    }
}

/// A ray that does not close is refused naming the paper it runs into, with
/// the candidates that land as fixes.
#[test]
fn a_blocked_ray_offers_the_rays_that_land() {
    let case = case("3b top layer");
    let candidates = candidates_of(&case.state, &case.op);
    let degree = |d: i32| {
        candidates
            .iter()
            .find(|(deg, _)| *deg == d)
            .map(|c| c.1)
            .unwrap_or_else(|| panic!("no {d}° candidate"))
    };
    let op = RabbitEar {
        emergent: degree(45),
        ..case.op.clone()
    };
    let Err(CompoundRefused::Refused(refused)) =
        case.state.rabbit_ear(&op, &VertexChoices::default())
    else {
        panic!("the 45° ray landed");
    };
    let FoldRefusal::FanRayBlocked { faces } = &refused.refusal else {
        panic!("{refused:?}");
    };
    // The bottom layer, which the top one's ray runs into.
    assert_eq!(faces.len(), 1);
    let offered: Vec<i32> = refused
        .fixes
        .iter()
        .map(|fix| match fix {
            Fix::UseEmergent { direction } => direction[1]
                .atan2(direction[0])
                .to_degrees()
                .rem_euclid(360.0)
                .round() as i32,
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(offered, vec![180, 270]);
}

/// The ridge, one of the far wedge's two rays, makes the ear unique: the
/// two ridges are the two orders the direction leaves, and the ridge's
/// crease in the first layer has the letter none of the other three has.
#[test]
fn the_ridge_makes_the_ear_unique() {
    for (name, deg) in [("3a both layers", 180), ("3c flat square", 270)] {
        let case = case(name);
        let candidates = candidates_of(&case.state, &case.op);
        let emergent = candidates
            .iter()
            .find(|(d, _)| *d == deg)
            .map(|c| c.1)
            .unwrap_or_default();
        let op = RabbitEar {
            emergent,
            ..case.op.clone()
        };
        let free = every(case.state.rabbit_ear(&op, &VertexChoices::default()));
        assert_eq!(free.len(), 2, "{name}");
        let analysis = case
            .state
            .analyse_rabbit_ear(&op)
            .unwrap_or_else(|e| panic!("{e}"));
        let first = analysis.layers[0];
        let mut landed_with = Vec::new();
        for ray in analysis.given.iter().copied().chain([emergent]) {
            let op = RabbitEar {
                ridge: Some(ray),
                ..op.clone()
            };
            match case.state.rabbit_ear(&op, &VertexChoices::default()) {
                Ok(VertexOutcome::Landed(folded)) => {
                    check(&case.state, &folded);
                    // The first layer's four new creases: three one letter,
                    // the ridge's the other.
                    let state = &folded.state;
                    let letters: Vec<Letter> = folded
                        .report
                        .fold
                        .created
                        .iter()
                        .filter_map(|&e| state.crease(e))
                        .filter(|c| {
                            state.faces().iter().any(|f| {
                                f.parent == Some(first)
                                    && f.ring.contains(&c.vertices[0])
                                    && f.ring.contains(&c.vertices[1])
                            })
                        })
                        .filter_map(|c| c.kind.letter())
                        .collect();
                    assert_eq!(letters.len(), 4, "{name}");
                    let mountains = letters.iter().filter(|&&l| l == Letter::Mountain).count();
                    assert!(mountains == 1 || mountains == 3, "{name}: {letters:?}");
                    landed_with.push(folded.state);
                }
                Err(CompoundRefused::Refused(r)) => {
                    assert_eq!(r.refusal, FoldRefusal::FanRidgeNotRay, "{name}");
                }
                other => panic!("{name}: {:?}", other.map(|_| ())),
            }
        }
        // Two of the four rays are the far wedge's.
        assert_eq!(landed_with.len(), 2, "{name}");
        assert_ne!(landed_with[0].order(), landed_with[1].order(), "{name}");
    }
}

/// Plan D6: a choice is stored as the pairs it decided, each face by a
/// witness, in the document's shape (FOLD `faceOrders` triples over
/// witnesses, `FoldCompletionChoice`), and replays to the state it was
/// chosen as; a witness off the paper, or a pair that conflicts, breaks the
/// step.
#[test]
fn a_stored_choice_replays_or_breaks() {
    let case = case("3a both layers");
    let emergent = candidates_of(&case.state, &case.op)
        .into_iter()
        .find(|(d, _)| *d == 180)
        .map(|c| c.1)
        .unwrap_or_default();
    let op = RabbitEar {
        emergent,
        ..case.op.clone()
    };
    let Ok(VertexOutcome::ChooseOrder(choice)) =
        case.state.rabbit_ear(&op, &VertexChoices::default())
    else {
        panic!("no choice");
    };
    for k in 0..2 {
        let picked = choice.pick(&[k]).unwrap_or_else(|e| panic!("{e}"));
        let stored = picked.report.stored.clone();
        assert!(stored.completion.is_some());
        let replayed = landed(case.state.rabbit_ear(&op, &stored));
        assert_eq!(replayed.state.parts(), picked.state.parts());
        // Through JSON, as the document stores it (`FoldCompletionChoice`).
        let json = serde_json::to_value(&stored).unwrap_or_default();
        assert!(json["completion"]["orders"][0].is_array(), "{json}");
        let back: VertexChoices = serde_json::from_value(json).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(
            landed(case.state.rabbit_ear(&op, &back)).state.parts(),
            picked.state.parts()
        );
    }
    let stored: WitnessOrder = choice
        .pick(&[0])
        .ok()
        .and_then(|f| f.report.stored.completion)
        .unwrap_or_else(|| unreachable!());
    // A witness off the paper.
    let mut off = stored.clone();
    off.faces[0] = [3.0, 3.0];
    assert!(matches!(
        case.state.rabbit_ear(
            &op,
            &VertexChoices {
                completion: Some(off)
            }
        ),
        Err(CompoundRefused::Broken(Broken::Witness {
            witness: BrokenWitness::NoFace { witness: 0, .. }
        }))
    ));
    // A pair stored both ways round conflicts.
    let (f, g, s) = stored.orders[0];
    let mut flipped = stored.clone();
    flipped.orders.push((f, g, -s));
    let both = VertexChoices {
        completion: Some(flipped),
    };
    assert!(matches!(
        case.state.rabbit_ear(&op, &both),
        Err(CompoundRefused::Broken(Broken::Completion { .. }))
    ));
}

/// Spike case 3d: the fish base's second ear, on the state the first one
/// landed (each with its ridge, so each lands), perpendicular to its edge.
#[test]
fn the_fish_base_takes_two_ears() {
    let case = case("3d fish ear 1");
    let candidate = |state: &State, op: &RabbitEar, deg: i32| {
        candidates_of(state, op)
            .into_iter()
            .find(|(d, _)| *d == deg)
            .map(|c| c.1)
            .unwrap_or_else(|| panic!("no {deg}° candidate"))
    };
    let op = RabbitEar {
        emergent: candidate(&case.state, &case.op, 180),
        ..case.op.clone()
    };
    let first = every(case.state.rabbit_ear(&op, &VertexChoices::default()));
    assert_eq!(first.len(), 2);
    let ear = &first[0];
    check(&case.state, ear);
    let state = &ear.state;
    let second = RabbitEar {
        corners: [[1.0, 1.0], [0.0, 1.0], [1.0, 0.0]],
        emergent: [1.0, 0.0],
        layers: Seed::Flaps {
            at: vec![[0.8, 0.8]],
        },
        stayer: cases::seen_bottom(state, [0.45, 0.45]),
        direction: Direction::Valley,
        ridge: None,
    };
    let second = RabbitEar {
        emergent: candidate(state, &second, 90),
        ..second
    };
    let outcome = state.rabbit_ear(&second, &VertexChoices::default());
    assert_eq!(came(&outcome), Came::Choice(2));
    for folded in every(outcome) {
        check(state, &folded);
    }
}

/// Spike case 3f: a free four-ray vertex on the flat square, each of its
/// three emergent rays unique with the direction seed.
#[test]
fn every_swivel_ray_lands_one_way() {
    let (square, op) = cases::swivel_case();
    let analysis = square.analyse_swivel(&op).unwrap_or_else(|e| panic!("{e}"));
    let mut degrees = Vec::new();
    for &c in &analysis.candidates {
        degrees.push(c[1].atan2(c[0]).to_degrees().rem_euclid(360.0).round() as i32);
        let op = Swivel {
            emergent: c,
            ..op.clone()
        };
        let folded = landed(square.swivel(&op, &VertexChoices::default()));
        check(&square, &folded);
        assert_eq!(folded.state.faces().len(), 4);
    }
    degrees.sort_unstable();
    assert_eq!(degrees, vec![90, 208, 332]);
}

/// A fan whose center lies on a crease, or a ridge that is no ray of the
/// far wedge, is refused.
#[test]
fn the_fans_own_refusals() {
    // The incenter of a b d lies on the precreased diagonal a c.
    let square = cases::precrease(
        &cases::square(),
        [0.0, 0.0],
        [1.0, 1.0],
        [0.0, 1.0],
        Seed::All,
    );
    let op = RabbitEar {
        corners: [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        emergent: [-1.0, 0.0],
        layers: Seed::All,
        stayer: [0.9, 0.95],
        direction: Direction::Valley,
        ridge: None,
    };
    let Err(CompoundRefused::Refused(refused)) = square.rabbit_ear(&op, &VertexChoices::default())
    else {
        panic!("a fan centred on a crease landed");
    };
    assert_eq!(refused.refusal.code(), "fan_center");
    // A ray next to the stayer's wedge is no ridge.
    let case = case("3c flat square");
    let analysis = case
        .state
        .analyse_rabbit_ear(&case.op)
        .unwrap_or_else(|e| panic!("{e}"));
    let refusals = analysis
        .given
        .iter()
        .filter(|&&ray| {
            let op = RabbitEar {
                emergent: analysis.candidates[1],
                ridge: Some(ray),
                ..case.op.clone()
            };
            matches!(
                case.state.rabbit_ear(&op, &VertexChoices::default()),
                Err(CompoundRefused::Refused(r)) if r.refusal == FoldRefusal::FanRidgeNotRay
            )
        })
        .count();
    assert!(refusals >= 1);
}
