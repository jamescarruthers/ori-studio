//! The squash fold through the compound pipeline (plan Phase 11; research
//! §5.3), on the vertex spike's named cases and its seeded campaign
//! (`r2-spike-squash-petal-rabbit`, `cases.mjs` and `campaign.mjs`): the
//! preliminary base by the diagonal route against Beloch's, the waterbomb
//! base by the midline route, per-layer creases, the preconditions as
//! refusals, and every free, uncovered flap squashing to one state.

mod beloch;
mod support;
mod vertex;

use std::collections::BTreeMap;

use oristudio_fold::random::{self, Rng};
use oristudio_fold::{
    CompoundRefused, Direction, FaceId, FoldRefusal, Letter, NoFlap, Squash, State, VertexChoices,
    VertexOutcome,
};
use vertex::cases::{self, landed, squash_op};
use vertex::{Segment, check, folded_segments, frame_segments, symmetries_between};

fn refusal(state: &State, op: &Squash) -> FoldRefusal {
    match state.squash(op, &VertexChoices::default()) {
        Err(CompoundRefused::Refused(refused)) => refused.refusal,
        Err(CompoundRefused::Broken(broken)) => panic!("broken {broken}"),
        Ok(_) => panic!("{op:?} landed"),
    }
}

/// Spike case 1b: two squashes along the diagonal route are the preliminary
/// base, Beloch's `side-preliminary-1.fold` exactly when folded in mirror
/// image (the spike's route matches it under x ↦ 1 − x); each squash is the
/// only state, and the base the only order its crease pattern and letters
/// allow.
#[test]
fn the_diagonal_route_squashes_into_belochs_preliminary_base() {
    let doc = beloch::document("side-preliminary-1.fold");
    let frame = beloch::final_frame(&doc).unwrap_or_else(|e| panic!("{e}"));
    let route = cases::preliminary(true);
    for (parent, folded) in &route.steps {
        check(parent, folded);
    }
    // Front: two new creases fold, the spine and the upper layer's hinge
    // unfold. Back: the upper layer's hinge lies flat after the first
    // squash, so it folds again (research §5.3: "3 fold, 1 unfold").
    let [front, back] = [&route.steps[0].1.report.fold, &route.steps[1].1.report.fold];
    assert_eq!(
        (
            front.created.len(),
            front.unfolded.len(),
            front.refolded.len()
        ),
        (2, 2, 0)
    );
    assert_eq!(
        (back.created.len(), back.unfolded.len(), back.refolded.len()),
        (2, 1, 1)
    );
    let base = route.last();
    assert_eq!(base.faces().len(), 8);
    beloch::matches(base, &frame).unwrap_or_else(|e| panic!("{e}"));
    assert!(vertex::only_order_of_its_pattern(base));

    // The spike's own route folds the mirror image: its creases are
    // Beloch's under x ↦ 1 − x (and the base's own symmetries), never as
    // they are.
    let spike = cases::preliminary(false);
    let symmetries = symmetries_between(&folded_segments(spike.last()), &frame_segments(&frame));
    assert!(
        symmetries.contains(&"flip x") && !symmetries.contains(&"id"),
        "{symmetries:?}"
    );
}

/// Spike case 1a: the square folded in half twice and squashed, front and
/// back, is the waterbomb base — both diagonals one letter, one midline the
/// other, the second midline flat — and not the preliminary base, as the
/// spike found against the task brief.
#[test]
fn the_midline_route_squashes_into_the_waterbomb_base() {
    let route = cases::waterbomb();
    for (parent, folded) in &route.steps {
        check(parent, folded);
    }
    let base = route.last();
    let ours = folded_segments(base);
    let key = |p: [f64; 2]| [(p[0] * 1e6).round() as i64, (p[1] * 1e6).round() as i64];
    let segment = |l, a, b| -> Segment {
        let (a, b) = (key(a), key(b));
        if a <= b { (l, a, b) } else { (l, b, a) }
    };
    let waterbomb = |diagonals, midline| {
        [
            segment(diagonals, [0.0, 0.0], [1.0, 1.0]),
            segment(diagonals, [1.0, 0.0], [0.0, 1.0]),
            segment(midline, [0.0, 0.5], [1.0, 0.5]),
        ]
        .into_iter()
        .collect()
    };
    let matched = [
        (Letter::Valley, Letter::Mountain),
        (Letter::Mountain, Letter::Valley),
    ]
    .into_iter()
    .any(|(d, l)| !symmetries_between(&ours, &waterbomb(d, l)).is_empty());
    assert!(matched, "{ours:?}");
    let preliminary = beloch::final_frame(&beloch::document("side-preliminary-1.fold"))
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(symmetries_between(&ours, &frame_segments(&preliminary)).is_empty());
    assert!(vertex::only_order_of_its_pattern(base));
}

/// Spike case "1a asymmetric, per-layer axes": the spine landing at 200°
/// rather than on the hinge. The two layers crease on lines of their own,
/// mirror images in the bisector of hinge and spine (one shared line left
/// the spike a residual of 0.342), and the spine lands on its target.
#[test]
fn an_asymmetric_squash_creases_each_layer_on_its_own_line() {
    let start = cases::small_square();
    let t = 200_f64.to_radians();
    let op = squash_op(&start, [0.2, 0.1], Some([t.cos(), t.sin()]));
    let analysis = start.analyse_squash(&op).unwrap_or_else(|e| panic!("{e}"));
    assert!(analysis.share.abs() > 0.1, "{analysis:?}");
    assert!(!analysis.upper_crease.approx_eq(&analysis.lower_crease));
    // The lower crease bisects spine and target.
    let angle = |v: [f64; 2]| v[1].atan2(v[0]);
    let lower = analysis.lower_crease.direction();
    let bisector = (angle(analysis.spine_direction) + t) / 2.0;
    assert!((lower[0] * bisector.sin() - lower[1] * bisector.cos()).abs() < 1e-9);
    let folded = landed(start.squash(&op, &VertexChoices::default()));
    check(&start, &folded);
    // Where the spine's far end lands: on the target ray from the vertex.
    let o = analysis.vertex;
    let far = [
        o[0] + analysis.spine_direction[0] * 0.1,
        o[1] + analysis.spine_direction[1] * 0.1,
    ];
    let reflected = analysis.lower_crease.reflect_point(far);
    let off = (reflected[0] - o[0]) * t.sin() - (reflected[1] - o[1]) * t.cos();
    assert!(off.abs() < 1e-12, "{off}");
    // The symmetric squash creases both layers on one line, the hinge's
    // bisector.
    let symmetric = start
        .analyse_squash(&squash_op(&start, [0.2, 0.1], None))
        .unwrap_or_else(|e| panic!("{e}"));
    assert!(symmetric.upper_crease.approx_eq(&symmetric.lower_crease));
}

/// The preconditions, checked up front and refused naming the faces in the
/// way (research §5.3: every failure to close had the flap attached off its
/// hinge; every closed squash without an order had it covered).
#[test]
fn a_squash_needs_a_free_uncovered_two_layer_flap() {
    // The second layer of the four-layer triangle: the top one covers it.
    let tri = cases::small_triangle(false);
    let stack = tri.stack_at([0.1, 0.5]).unwrap_or_default();
    let under = tri
        .isometry(stack[1])
        .unwrap_or_default()
        .inverse()
        .apply([0.1, 0.5]);
    let op = Squash {
        flap: under,
        target: None,
        direction: Direction::Valley,
    };
    assert_eq!(
        refusal(&tri, &op),
        FoldRefusal::SquashFlapCovered {
            faces: vec![stack[0]],
            flap: vec![stack[1]],
        }
    );
    // One layer; and a book fold, whose spine ends at the paper's edge.
    let square = cases::square();
    assert_eq!(
        refusal(&square, &squash_op(&square, [0.3, 0.3], None)),
        FoldRefusal::SquashNoFlap {
            faces: vec![FaceId(0)],
            cause: NoFlap::SingleLayer,
        }
    );
    let book = cases::valley(&square, [0.5, 0.0], [0.5, 1.0], [1.0, 0.5]);
    assert!(matches!(
        refusal(&book, &squash_op(&book, [0.3, 0.3], None)),
        FoldRefusal::SquashNoFlap {
            cause: NoFlap::NoHinge,
            ..
        }
    ));
    // A target beyond the hinge: outside the flap's wedge.
    let analysis = tri
        .analyse_squash(&squash_op(&tri, [0.1, 0.5], None))
        .unwrap_or_else(|e| panic!("{e}"));
    let s = analysis.spine_direction;
    let away = Some([-s[0], -s[1]]);
    assert_eq!(
        refusal(&tri, &squash_op(&tri, [0.1, 0.5], away)),
        FoldRefusal::SquashTargetOutside
    );
    // A flap held off its hinge: the campaign's first.
    let (state, op, faces) = not_free().unwrap_or_else(|| panic!("no flap held off its hinge"));
    let FoldRefusal::SquashFlapNotFree { faces: held, flap } = refusal(&state, &op) else {
        unreachable!()
    };
    assert_eq!(held, faces);
    assert!(held.iter().all(|f| !flap.contains(f)));
    // Through JSON, by code.
    let json = serde_json::to_value(CompoundRefused::Refused(
        FoldRefusal::SquashTargetOutside.into(),
    ))
    .unwrap_or_default();
    assert_eq!(json["refusal"]["code"], "squash_target_outside");
}

/// The first draw of the campaign whose flap is held off its hinge.
fn not_free() -> Option<(State, Squash, Vec<FaceId>)> {
    for i in 0..200 {
        let Some((state, op)) = campaign_case(1, i) else {
            continue;
        };
        if let Err(CompoundRefused::Refused(refused)) = state.squash(&op, &VertexChoices::default())
            && let FoldRefusal::SquashFlapNotFree { faces, .. } = refused.refusal
        {
            return Some((state, op, faces));
        }
    }
    None
}

/// Draw `i` of seed `seed`: a random state of one to four plain folds of at
/// most 60 faces, and a squash at one of its faces (the spike draws three
/// per state; each draw here is a state of its own).
fn campaign_case(seed: u64, i: u64) -> Option<(State, Squash)> {
    let mut rng = Rng::new(seed * 7919 + i);
    let state = random::folded(&mut rng).ok()?;
    if state.faces().len() > 60 {
        return None;
    }
    let op = random::squash(&state, &mut rng)?;
    Some((state, op))
}

/// The spike's campaign: a squash refused by a precondition is counted by
/// its code; every other lands, passes every check, and replays from what
/// it stores.
fn campaign(seeds: std::ops::RangeInclusive<u64>, setups: u64) -> BTreeMap<String, usize> {
    let mut tally: BTreeMap<String, usize> = BTreeMap::new();
    for seed in seeds {
        for i in 0..setups {
            let Some((state, op)) = campaign_case(seed, i) else {
                continue;
            };
            *tally.entry("drawn".into()).or_default() += 1;
            let outcome = state.squash(&op, &VertexChoices::default());
            let key = match &outcome {
                Ok(VertexOutcome::Landed(_)) => "unique".to_string(),
                Ok(VertexOutcome::ChooseOrder(c)) => format!("choice of {}", c.count().orders),
                Err(CompoundRefused::Refused(r)) => r.refusal.code().to_string(),
                Err(CompoundRefused::Broken(b)) => panic!("s{seed}-{i}: broken {b}"),
            };
            *tally.entry(key).or_default() += 1;
            for folded in cases::every(outcome) {
                check(&state, &folded);
                let again = landed(state.squash(&op, &folded.report.stored));
                assert_eq!(again.state.parts(), folded.state.parts(), "s{seed}-{i}");
            }
        }
    }
    tally
}

/// Research §5.3: every free, uncovered flap squashed to exactly one state
/// (416 of 416). The engine refuses the others up front, so every squash it
/// does not refuse that way lands, and lands one way. (Requiring the upper
/// layer to be hinged as well as the lower — the spike's vertex is where
/// it is — is what keeps the two halves of an upper layer held by its
/// spine alone from being a free pair: 2 of 67 here before it.)
#[test]
fn the_seeded_campaign_squashes_every_free_uncovered_flap_one_way() {
    let tally = campaign(1..=1, 400);
    eprintln!("{tally:#?}");
    let count = |k: &str| tally.get(k).copied().unwrap_or(0);
    assert!(count("unique") >= 40, "{tally:?}");
    for (key, n) in &tally {
        assert!(
            matches!(
                key.as_str(),
                "drawn"
                    | "unique"
                    | "squash_no_flap"
                    | "squash_flap_not_free"
                    | "squash_flap_covered"
                    | "squash_target_outside"
                    | "short_crease"
                    | "thin_piece"
                    | "near_miss"
                    | "sliver"
            ),
            "{n} squashes {key}: {tally:?}"
        );
    }
}

/// The spike's campaign at its size: 3,000 draws.
///
/// `cargo test -p oristudio-fold --release --test squash -- --ignored --nocapture`
#[test]
#[ignore = "the spike's full campaign; run with --release --ignored"]
fn the_spikes_campaign() {
    let start = std::time::Instant::now();
    let tally = campaign(1..=3, 1000);
    eprintln!("{tally:#?}\nin {:.1} s", start.elapsed().as_secs_f64());
}

/// The mirrored route's steps are the spike route's mirror images, step by
/// step: a squash is defined by its flap, not by how the sheet lies.
#[test]
fn a_mirrored_route_squashes_in_mirror_image() {
    let (ours, theirs) = (cases::preliminary(false), cases::preliminary(true));
    for k in 0..2 {
        let (a, b) = (&ours.steps[k].1.state, &theirs.steps[k].1.state);
        let symmetries = symmetries_between(&folded_segments(a), &folded_segments(b));
        assert!(symmetries.contains(&"flip x"), "step {k}: {symmetries:?}");
        assert!(!symmetries.contains(&"id"), "step {k}");
    }
}
