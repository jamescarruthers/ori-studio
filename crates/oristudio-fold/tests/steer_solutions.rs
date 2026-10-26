//! The Layer order dialog's explanations and solutions
//! (`implementation-plans/layer-order-dialog.md` row E6) through the
//! session's public calls, on the fixtures CI runs: kabuto,
//! `solution_sample_1` and Oriedita's `colorconstrainttest`.
//!
//! The counts against brute force (every order, grouped by picture) are the
//! unit tests in `src/steer/solutions.rs`; here the stepper and `explain`
//! are held to what the dialog relies on. The same calls over the cpoogle
//! corpus are the local census in
//! `crates/oracle-tests/tests/layer_order_solutions.rs`.

#![cfg(feature = "kernel")]

use std::collections::{BTreeMap, BTreeSet};

use oristudio_cp::session::CpSession;
use oristudio_fold::complete::Deadline;
use oristudio_fold::random::Rng;
use oristudio_fold::steer::{
    Commit, Constraint, ConstraintSession, Explanation, LayerSource, Limits, Preview,
    SessionRefusal, SolutionCaps, StepBy, StepDirection, Stepped, Verb, ViewSide,
};
use oristudio_layer_order::check::Scope;
use oristudio_layer_order::{FacePair, LayerOrder};

const FIXTURES: &[(&str, &str)] = &[
    ("kabuto", "tests/fixtures/flat-folder/kabuto.fold"),
    (
        "solution_sample_1",
        "tests/fixtures/oriedita/solution_sample_1.cp",
    ),
    (
        "colorconstrainttest",
        "third_party/oriedita/oriedita-data/src/test/resources/colorconstrainttest.cp",
    ),
];

const BY: [StepBy; 3] = [
    StepBy::Picture(ViewSide::Front),
    StepBy::Picture(ViewSide::Back),
    StepBy::LayerOrder,
];

fn open(relative: &str) -> ConstraintSession {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{relative}: {e}"));
    let mut cp = CpSession::new();
    let document = if relative.ends_with(".fold") {
        cp.load_fold(&text, "")
    } else {
        cp.load_cp(&text, "")
    }
    .unwrap_or_else(|e| panic!("{relative}: {e:?}"));
    let lines: Vec<usize> = (1..=cp
        .document_summary(document)
        .expect("summary")
        .line_segments)
        .collect();
    let fold = cp
        .fold_source_of_selection(document, &lines, 1)
        .expect("the sheet's source");
    let source = LayerSource::from_oriedita(&fold).unwrap_or_else(|e| panic!("{relative}: {e}"));
    ConstraintSession::open(source, &Limits::default())
        .unwrap_or_else(|e| panic!("{relative}: {e}"))
}

fn unlimited() -> Limits {
    Limits {
        max_nodes: None,
        ..Limits::default()
    }
}

/// The order on screen fits the creases and every committed constraint.
fn assert_fits(session: &ConstraintSession, context: &str) {
    let source = session.source();
    let shown = session.shown_order();
    let report = oristudio_layer_order::check::check_problem(
        source.problem(),
        source.view(),
        &shown,
        Scope::All,
    )
    .expect("the session's problem");
    assert!(report.is_valid(), "{context}: {:?}", report.violations);
    for c in session.constraints() {
        assert!(satisfies(session, &shown, c), "{context}: {c:?}");
    }
}

fn satisfies(session: &ConstraintSession, order: &LayerOrder, c: &Constraint) -> bool {
    let above = c.subject_above(session.source().view()).expect("a side");
    order.above(c.subject, c.object) == Some(above)
}

/// What the stepper tells apart: each spot's top from a side, or, with
/// X-ray, every pair's order.
fn key(session: &ConstraintSession, by: StepBy) -> Vec<u32> {
    match by {
        StepBy::Picture(side) => {
            let stacks = session.stacks(side);
            (0..stacks.len())
                .map(|i| stacks.top(i).unwrap_or(u32::MAX))
                .collect()
        }
        StepBy::LayerOrder => session
            .shown_order()
            .pairs()
            .map(|(_, above)| u32::from(above == Some(true)))
            .collect(),
    }
}

/// Step back to the first solution, then through every one to the last:
/// each step's index one more than the last, each order fitting. The keys
/// in the stepper's order.
fn walk(
    session: &mut ConstraintSession,
    solutions: &mut oristudio_fold::steer::Solutions,
    by: StepBy,
) -> Vec<Vec<u32>> {
    let limits = unlimited();
    while let Stepped::Moved(_) = session
        .step(solutions, by, StepDirection::Previous, &limits)
        .expect("step back")
    {}
    let first = session.position(solutions, by).expect("position");
    assert_eq!(first.index, 1);
    let mut keys = vec![key(session, by)];
    loop {
        match session
            .step(solutions, by, StepDirection::Next, &limits)
            .expect("step")
        {
            Stepped::Moved(moved) => {
                assert_eq!(moved.position.index, keys.len() as u64 + 1);
                assert_eq!(
                    moved.position,
                    session.position(solutions, by).expect("position")
                );
                assert_fits(session, "a step");
                keys.push(key(session, by));
            }
            Stepped::End => break,
            Stepped::TimedOut(out) => panic!("unlimited, but {out:?}"),
        }
    }
    let total = session.position(solutions, by).expect("position").total;
    assert!(total.exact);
    assert_eq!(total.n, keys.len() as u64);
    let distinct: BTreeSet<_> = keys.iter().collect();
    assert_eq!(distinct.len(), keys.len(), "a solution visited twice");
    keys
}

/// Whether `small` appears in `large` in the same order.
fn is_subsequence(small: &[Vec<u32>], large: &[Vec<u32>]) -> bool {
    let mut rest = large.iter();
    small.iter().all(|k| rest.any(|l| l == k))
}

/// A constraint on `pair` the order on screen already satisfies.
fn with_shown(session: &ConstraintSession, pair: FacePair) -> Constraint {
    let lo_above = session
        .shown_order()
        .above(pair.lo(), pair.hi())
        .expect("a pair of the order");
    let (subject, object) = if lo_above {
        (pair.lo(), pair.hi())
    } else {
        (pair.hi(), pair.lo())
    };
    Constraint::seen(
        subject,
        Verb::InFrontOf,
        object,
        ViewSide::Front,
        session.source().view(),
    )
    .expect("faces of the view")
}

/// A constraint on `pair` the order on screen breaks.
fn against_shown(session: &ConstraintSession, pair: FacePair) -> Constraint {
    // The sentence the other way round: a sign is read against its object's
    // side, so swapping subject and object alone would not reverse it.
    let c = with_shown(session, pair);
    Constraint::seen(
        c.object,
        Verb::InFrontOf,
        c.subject,
        ViewSide::Front,
        session.source().view(),
    )
    .expect("faces of the view")
}

// Gate 3: the stepper's order stays put across Add and remove.

#[test]
fn the_stepper_keeps_its_order_across_add_and_remove() {
    let mut rng = Rng::new(0x5eed_e6e6);
    let mut tally: BTreeMap<String, usize> = BTreeMap::new();
    for &(name, relative) in FIXTURES {
        let mut session = open(relative);
        for by in BY {
            let mut solutions = session.solutions().expect("count");
            solutions.advance(&session, &unlimited()).expect("advance");
            let base = walk(&mut session, &mut solutions, by);
            *tally.entry(format!("{name} {by:?}")).or_default() = base.len();
            for _ in 0..4 {
                let open = session.open_pairs();
                if open.is_empty() {
                    break;
                }
                // Add a constraint the solution on screen satisfies: it
                // stays on screen, and keeps its place among the rest.
                let at = base
                    .iter()
                    .position(|k| *k == key(&session, by))
                    .expect("on screen");
                let c = with_shown(&session, open[rng.below(open.len())]);
                let Commit::Committed(_) = session.commit(vec![c], &unlimited()).expect("add")
                else {
                    panic!("a constraint the order satisfies can't fit");
                };
                let mut added = session.solutions().expect("count");
                added.advance(&session, &unlimited()).expect("advance");
                let shown_key = key(&session, by);
                let index = session.position(&added, by).expect("position").index;
                let fewer = walk(&mut session, &mut added, by);
                assert!(is_subsequence(&fewer, &base), "{name} {by:?}");
                assert_eq!(fewer[index as usize - 1], shown_key);
                assert!(
                    fewer.len() <= base.len() && fewer.contains(&base[at]),
                    "{name} {by:?}"
                );
                // Remove it: the very same order, and the solution on screen
                // at its old index.
                let Commit::Committed(_) =
                    session.commit(Vec::new(), &unlimited()).expect("remove")
                else {
                    panic!("no constraints can't fit");
                };
                let mut removed = session.solutions().expect("count");
                removed.advance(&session, &unlimited()).expect("advance");
                let here = key(&session, by);
                let again = base.iter().position(|k| *k == here).expect("a solution") + 1;
                assert_eq!(
                    session.position(&removed, by).expect("position").index,
                    again as u64
                );
                assert_eq!(walk(&mut session, &mut removed, by), base, "{name} {by:?}");
                *tally.entry("add and remove".to_string()).or_default() += 1;
            }
        }
    }
    println!("{tally:?}");
}

/// A step moves the order on screen, so a preview from before it is out of
/// date: Add commits its list from where the step left the order, exactly
/// as a commit of the list does, never the preview's stale order.
#[test]
fn a_step_puts_an_earlier_preview_out_of_date() {
    let mut moved = 0;
    for &(_, relative) in FIXTURES {
        let mut stale = open(relative);
        let mut fresh = open(relative);
        let pairs = stale.open_pairs();
        for pair in pairs {
            let candidate = against_shown(&stale, pair);
            let Ok(Preview::Fits(fit)) = stale.preview(candidate, &unlimited()) else {
                continue;
            };
            let previewed = fit.order();
            let mut counts = [
                stale.solutions().expect("count"),
                fresh.solutions().expect("count"),
            ];
            let mut stepped = Vec::new();
            for (session, solutions) in [&mut stale, &mut fresh].into_iter().zip(&mut counts) {
                stepped.push(
                    session
                        .step(solutions, BY[0], StepDirection::Next, &unlimited())
                        .expect("step"),
                );
            }
            if !matches!(stepped[0], Stepped::Moved(_)) {
                continue;
            }
            let adopted = stale.commit_preview(fit, &unlimited()).expect("add");
            let committed = fresh.commit(vec![candidate], &unlimited()).expect("commit");
            assert_eq!(adopted, committed);
            assert_eq!(stale.shown_order(), fresh.shown_order());
            assert_fits(&stale, "after a stale preview");
            if stale.shown_order() != previewed {
                moved += 1;
            }
            break;
        }
    }
    assert!(moved > 0, "no step moved a preview's order");
}

#[test]
fn a_count_is_refused_once_the_constraints_change() {
    let mut session = open(FIXTURES[0].1);
    let mut solutions = session.solutions().expect("count");
    let pair = session.open_pairs()[0];
    let c = with_shown(&session, pair);
    session.commit(vec![c], &unlimited()).expect("add");
    assert_eq!(
        solutions.advance(&session, &unlimited()),
        Err(SessionRefusal::StaleSolutions)
    );
    assert_eq!(
        session.position(&solutions, BY[0]).map(|p| p.index),
        Err(SessionRefusal::StaleSolutions)
    );
    let other = open(FIXTURES[0].1);
    let mut fresh = other.solutions().expect("count");
    assert_eq!(
        fresh.advance(&session, &unlimited()),
        Err(SessionRefusal::StaleSolutions)
    );
    assert_eq!(
        session.step(&mut fresh, BY[0], StepDirection::Next, &unlimited()),
        Err(SessionRefusal::StaleSolutions)
    );
}

/// Decision D7: a count that can't finish still steps, through what it
/// counted, never twice to one solution, and says its index isn't final.
#[test]
fn a_capped_count_still_steps() {
    for &(name, relative) in FIXTURES {
        let mut whole_session = open(relative);
        let mut whole = whole_session.solutions().expect("count");
        let every: BTreeSet<Vec<u32>> = walk(&mut whole_session, &mut whole, BY[0])
            .into_iter()
            .collect();
        let mut session = open(relative);
        let caps = SolutionCaps {
            orders_per_component: 2,
            ..SolutionCaps::default()
        };
        let mut solutions = session.solutions_with(caps).expect("count");
        let count = solutions.advance(&session, &unlimited()).expect("advance");
        assert!(count.done);
        while let Stepped::Moved(moved) = session
            .step(&mut solutions, BY[0], StepDirection::Previous, &unlimited())
            .expect("step back")
        {
            assert_eq!(moved.position.total, count.front);
        }
        let mut seen = BTreeSet::from([key(&session, BY[0])]);
        loop {
            match session
                .step(&mut solutions, BY[0], StepDirection::Next, &unlimited())
                .expect("step")
            {
                Stepped::Moved(moved) => {
                    assert_eq!(moved.position.total, count.front);
                    assert!(seen.insert(key(&session, BY[0])), "{name}: visited twice");
                }
                Stepped::End => break,
                Stepped::TimedOut(out) => panic!("{out:?}"),
            }
        }
        assert!(seen.is_subset(&every), "{name}");
        // Every picture counted is reached (and the one first on screen,
        // which the capped count may not have reached itself).
        assert!(seen.len() as u64 >= count.front.n, "{name}: {count:?}");
        assert!(count.front.n <= every.len() as u64, "{name}: {count:?}");
        println!(
            "{name}: capped at 2 orders a component, {} of {} pictures ({:?})",
            seen.len(),
            every.len(),
            count.front
        );
    }
}

/// Stepping while the count is still running (a node of counting per step):
/// each step goes to a later picture in the fixed order, so none is visited
/// twice, and every picture the walk reaches is one that fits.
#[test]
fn a_step_before_the_count_is_done_still_moves_forward() {
    let tiny = Limits {
        max_nodes: Some(1),
        ..Limits::default()
    };
    for &(name, relative) in FIXTURES {
        let mut whole_session = open(relative);
        let mut whole = whole_session.solutions().expect("count");
        let order: Vec<Vec<u32>> = walk(&mut whole_session, &mut whole, BY[0]);
        let mut session = open(relative);
        let mut solutions = session.solutions().expect("count");
        let mut at = order
            .iter()
            .position(|k| *k == key(&session, BY[0]))
            .expect("a picture");
        let mut calls = 0;
        loop {
            calls += 1;
            assert!(calls < 10_000);
            match session
                .step(&mut solutions, BY[0], StepDirection::Next, &tiny)
                .expect("step")
            {
                Stepped::Moved(_) => {
                    let now = order
                        .iter()
                        .position(|k| *k == key(&session, BY[0]))
                        .expect("a picture that fits");
                    assert!(now > at, "{name}: stepped back from {at} to {now}");
                    at = now;
                }
                // Final once the count is done.
                Stepped::End if solutions.is_done() => break,
                Stepped::End | Stepped::TimedOut(_) => {}
            }
        }
        // Once the count is done, the last step reaches the last picture.
        assert_eq!(at, order.len() - 1, "{name}");
    }
}

/// Decision D7 without the count (row E9): a step on a cursor that has
/// counted nothing searches for the solution the count would list next, so
/// it lands exactly where a step on a finished count does, the same layer
/// order included, at the same place, from every solution and both ways.
#[test]
fn a_step_before_any_count_lands_where_the_count_would() {
    let mut tally: BTreeMap<String, usize> = BTreeMap::new();
    for &(name, relative) in FIXTURES {
        for by in BY {
            let mut counted = open(relative);
            let mut uncounted = open(relative);
            let mut solutions = counted.solutions().expect("count");
            solutions.advance(&counted, &unlimited()).expect("advance");
            for direction in [
                StepDirection::Previous,
                StepDirection::Next,
                StepDirection::Previous,
            ] {
                loop {
                    let mut fresh = uncounted.solutions().expect("a cursor");
                    let stepped = uncounted
                        .step(&mut fresh, by, direction, &unlimited())
                        .expect("a step with no count");
                    let expected = counted
                        .step(&mut solutions, by, direction, &unlimited())
                        .expect("a counted step");
                    assert_eq!(
                        uncounted.shown_order(),
                        counted.shown_order(),
                        "{name} {by:?} {direction:?}"
                    );
                    match (stepped, expected) {
                        (Stepped::Moved(a), Stepped::Moved(b)) => {
                            assert_eq!(a, b, "{name} {by:?}");
                            assert_fits(&uncounted, "a step with no count");
                            *tally.entry(format!("{name} {by:?}")).or_default() += 1;
                        }
                        (Stepped::End, Stepped::End) => break,
                        other => panic!("{name} {by:?} {direction:?}: {other:?}"),
                    }
                }
            }
        }
    }
    println!("{tally:?}");
}

/// Row E9's local measurement on iguana-c0 (850 faces, 65,851 open pairs,
/// so the dialog starts no count), in release, behind an env var:
///
/// ```sh
/// LAYER_ORDER_IGUANA=1 cargo test -p oristudio-fold --features kernel --release \
///   --test steer_solutions the_iguana_steps -- --nocapture
/// ```
///
/// On a cursor no slice ever advances, as the dialog's on this figure, each
/// step is asked with the dialog's limits (3 s, 200,000 nodes) and, while it
/// ends unmoved, again with Keep trying's (×4, then ×16). Prints how long
/// each took and where it landed.
#[test]
fn the_iguana_steps_without_its_count() {
    if std::env::var("LAYER_ORDER_IGUANA").is_err() {
        println!("SKIPPED: the_iguana_steps_without_its_count\n  LAYER_ORDER_IGUANA is not set.");
        return;
    }
    fn now_ms() -> f64 {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        START
            .get_or_init(std::time::Instant::now)
            .elapsed()
            .as_secs_f64()
            * 1e3
    }
    let limits = |factor: f64| Limits {
        max_nodes: Some((200_000.0 * factor) as u64),
        fast_nodes: 128,
        deadline: Some(Deadline {
            now_ms,
            at_ms: now_ms() + 3_000.0 * factor,
        }),
    };
    let t = std::time::Instant::now();
    let mut session = open("tests/fixtures/precrease/iguana-c0.fold");
    println!(
        "iguana-c0: {} open pairs, opened in {:.0} ms",
        session.open_pairs().len(),
        t.elapsed().as_secs_f64() * 1e3
    );
    let mut solutions = session.solutions().expect("a cursor");
    let front = StepBy::Picture(ViewSide::Front);
    let back = StepBy::Picture(ViewSide::Back);
    let plan = [
        (front, StepDirection::Next),
        (front, StepDirection::Previous),
        (back, StepDirection::Next),
        (back, StepDirection::Previous),
        (StepBy::LayerOrder, StepDirection::Next),
        (StepBy::LayerOrder, StepDirection::Next),
        (StepBy::LayerOrder, StepDirection::Next),
        (StepBy::LayerOrder, StepDirection::Previous),
        (StepBy::LayerOrder, StepDirection::Previous),
        (StepBy::LayerOrder, StepDirection::Previous),
        (StepBy::LayerOrder, StepDirection::Previous),
    ];
    for (by, direction) in plan {
        for factor in [1.0, 4.0, 16.0] {
            let t = std::time::Instant::now();
            let stepped = session
                .step(&mut solutions, by, direction, &limits(factor))
                .expect("step");
            let ms = t.elapsed().as_secs_f64() * 1e3;
            let landed = match &stepped {
                Stepped::Moved(moved) => format!(
                    "moved to {} ({} of {}{})",
                    moved.position.index,
                    moved.position.index,
                    moved.position.total.n,
                    if moved.position.total.exact { "" } else { "+" }
                ),
                Stepped::End => "end".to_string(),
                Stepped::TimedOut(out) => format!("timed out {out:?}"),
            };
            println!("{by:?} {direction:?} at ×{factor}: {landed} in {ms:.0} ms");
            if !matches!(stepped, Stepped::End) {
                break;
            }
        }
    }
}

// Gate 4: explain's set is a smallest one.

/// Every layer order of the creases alone, through the X-ray stepper,
/// which the unit tests hold to brute force: an oracle for "fits" that is
/// not the check `explain` asks.
fn every_order(relative: &str) -> Vec<LayerOrder> {
    let mut session = open(relative);
    let mut solutions = session.solutions().expect("count");
    let limits = unlimited();
    while let Stepped::Moved(_) = session
        .step(
            &mut solutions,
            StepBy::LayerOrder,
            StepDirection::Previous,
            &limits,
        )
        .expect("step")
    {}
    let mut orders = vec![session.shown_order()];
    while let Stepped::Moved(_) = session
        .step(
            &mut solutions,
            StepBy::LayerOrder,
            StepDirection::Next,
            &limits,
        )
        .expect("step")
    {
        orders.push(session.shown_order());
    }
    orders
}

fn fits(session: &ConstraintSession, orders: &[LayerOrder], list: &[Constraint]) -> bool {
    orders
        .iter()
        .any(|order| list.iter().all(|c| satisfies(session, order, c)))
}

/// `clash` names a set of `list` that can't fit, each member necessary.
fn assert_smallest(
    session: &ConstraintSession,
    orders: &[LayerOrder],
    list: &[Constraint],
    clash: &[usize],
    context: &str,
) {
    let set: Vec<Constraint> = clash.iter().map(|&i| list[i]).collect();
    assert!(!fits(session, orders, &set), "{context}: {set:?} fits");
    for drop in 0..set.len() {
        let mut without = set.clone();
        without.remove(drop);
        assert!(
            fits(session, orders, &without),
            "{context}: {:?} is not needed in {set:?}",
            set[drop]
        );
    }
}

#[test]
fn explain_names_a_smallest_clashing_set() {
    let mut rng = Rng::new(0xe6_c1a5);
    let mut sizes: BTreeMap<String, usize> = BTreeMap::new();
    for &(name, relative) in FIXTURES {
        let orders = every_order(relative);
        for trial in 0..10 {
            let mut session = open(relative);
            // A few constraints that fit, as the user adds them.
            for _ in 0..trial % 5 {
                let open = session.open_pairs();
                if open.is_empty() {
                    break;
                }
                let pair = open[rng.below(open.len())];
                let c = if rng.chance(0.5) {
                    with_shown(&session, pair)
                } else {
                    against_shown(&session, pair)
                };
                let mut list = session.constraints().to_vec();
                list.push(c);
                let _ = session.commit(list, &unlimited()).expect("commit");
            }
            let committed = session.constraints().to_vec();
            let pairs: Vec<FacePair> = session.shown_order().pairs().map(|(p, _)| p).collect();
            for pair in pairs {
                let candidate = against_shown(&session, pair);
                let preview = match session.preview(candidate, &unlimited()) {
                    Ok(preview) => preview,
                    Err(SessionRefusal::BadConstraint { .. }) => continue,
                    Err(e) => panic!("{e}"),
                };
                let mut list = committed.clone();
                list.push(candidate);
                let explained = session.explain(candidate, &unlimited()).expect("explain");
                match (preview, explained) {
                    (Preview::Fits(_), Explanation::Fits) => {
                        assert!(fits(&session, &orders, &list));
                    }
                    (Preview::CantFit(cant), Explanation::Clash(clash)) => {
                        let context = format!("{name}: {candidate:?} after {committed:?}");
                        assert!(clash.minimal, "{context}");
                        assert!(clash.constraints.contains(&committed.len()), "{context}");
                        assert_smallest(&session, &orders, &list, &clash.constraints, &context);
                        // Within the set the check named, and it names the
                        // faces of its constraints.
                        assert!(
                            clash
                                .constraints
                                .iter()
                                .all(|i| cant.constraints.contains(i)),
                            "{context}"
                        );
                        let faces: BTreeSet<_> = clash
                            .constraints
                            .iter()
                            .flat_map(|&i| [list[i].subject, list[i].object])
                            .collect();
                        assert_eq!(clash.faces, faces.into_iter().collect::<Vec<_>>());
                        let shrunk = if clash.constraints.len() < cant.constraints.len() {
                            " (shrunk)"
                        } else {
                            ""
                        };
                        *sizes
                            .entry(format!(
                                "{} of {}{shrunk}",
                                clash.constraints.len(),
                                list.len()
                            ))
                            .or_default() += 1;
                    }
                    other => panic!("{name}: {other:?}"),
                }
            }
        }
    }
    println!("{sizes:?}");
    assert!(sizes.keys().any(|k| !k.starts_with("1 ")), "{sizes:?}");
}

/// A restored record's clashing constraints, none committed (D10): the
/// smallest set within the list, indices into it.
#[test]
fn explain_list_finds_a_smallest_set_in_any_list() {
    let mut rng = Rng::new(0x1157);
    let mut found = 0;
    for &(name, relative) in FIXTURES {
        let orders = every_order(relative);
        let session = open(relative);
        let pairs: Vec<FacePair> = session.open_pairs();
        for _ in 0..40 {
            let list: Vec<Constraint> = (0..2 + rng.below(5))
                .map(|_| {
                    let pair = pairs[rng.below(pairs.len())];
                    if rng.chance(0.5) {
                        with_shown(&session, pair)
                    } else {
                        against_shown(&session, pair)
                    }
                })
                .collect();
            match session.explain_list(&list, &unlimited()).expect("explain") {
                Explanation::Fits => assert!(fits(&session, &orders, &list)),
                Explanation::Clash(clash) => {
                    assert!(clash.minimal);
                    assert_smallest(&session, &orders, &list, &clash.constraints, name);
                    found += 1;
                }
                Explanation::TimedOut(out) => panic!("{out:?}"),
            }
        }
    }
    assert!(found > 0);
}

fn late() -> f64 {
    1.0
}

/// Out of time, `explain` never names a set that fits: it says it timed
/// out, or gives a set that clashes, flagged when not shown smallest.
#[test]
fn explain_out_of_time_never_names_a_set_that_fits() {
    let past = Limits {
        deadline: Some(Deadline {
            now_ms: late,
            at_ms: 0.0,
        }),
        ..Limits::default()
    };
    let mut answers: BTreeMap<&str, usize> = BTreeMap::new();
    for &(_, relative) in FIXTURES {
        let orders = every_order(relative);
        let mut session = open(relative);
        let pair = session.open_pairs()[0];
        let c = with_shown(&session, pair);
        session.commit(vec![c], &unlimited()).expect("add");
        let pairs: Vec<FacePair> = session.shown_order().pairs().map(|(p, _)| p).collect();
        for pair in pairs {
            let candidate = against_shown(&session, pair);
            let mut list = session.constraints().to_vec();
            list.push(candidate);
            match session.explain(candidate, &past) {
                Ok(Explanation::TimedOut(_)) => *answers.entry("timed out").or_default() += 1,
                Ok(Explanation::Clash(clash)) => {
                    let set: Vec<Constraint> = clash.constraints.iter().map(|&i| list[i]).collect();
                    assert!(!fits(&session, &orders, &set));
                    *answers
                        .entry(if clash.minimal {
                            "minimal"
                        } else {
                            "not minimal"
                        })
                        .or_default() += 1;
                }
                Ok(Explanation::Fits) => panic!("a past deadline can't prove a fit"),
                Err(SessionRefusal::BadConstraint { .. }) => {}
                Err(e) => panic!("{e}"),
            }
        }
    }
    println!("{answers:?}");
    assert!(answers.contains_key("timed out"));
}
