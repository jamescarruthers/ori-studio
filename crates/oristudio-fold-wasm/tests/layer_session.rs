//! The Layer order dialog's constraint sessions across the bridge
//! (`layer_*`, `implementation-plans/layer-order-dialog.md` row E7),
//! natively: every call through `LayerSessions`, the store `FoldEngine`
//! holds, over kabuto and `solution_sample_1` as the CP kernel hands them
//! over. What the calls answer is `oristudio-fold`'s `steer` tests'
//! business; these hold what crosses: flat pairs and triples, stacks that
//! number the scene's subfaces, relations the CP kernel folds, codes for
//! every refusal and mistake, limits and deadlines, and handles.
#![cfg(not(target_arch = "wasm32"))]

use std::collections::HashMap;

use oristudio_cp::folding::{FoldOutcome, FoldedFigureModel};
use oristudio_cp::session::{
    CpSession, FoldSource, FoldWithOrderResult, relations_from_flat_pairs,
};
use oristudio_fold::FaceId;
use oristudio_fold::complete::BudgetLimit;
use oristudio_fold::steer::{
    ConstraintStatus, LayerSource, RecordFace, RecordPair, RecordRead, TimedOut, Verb, ViewSide,
    encode_record, read_record,
};
use oristudio_fold_wasm::steer::{
    CantFitKind, Committing, FACE_INTACT, LayerCallError, LayerLimits, LayerOpened, LayerRefusal,
    LayerRestored, LayerSessions, Opening, PAIR_KEPT, PackedStacks, Previewed, RestoredOutcome,
    Restoring, Saving, constraints_of,
};

fn repo(relative: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(relative)
}

/// What a host hands the dialog for a fixture folded whole.
fn source_of(relative: &str) -> FoldSource {
    let text = std::fs::read_to_string(repo(relative)).unwrap_or_else(|e| panic!("{e}"));
    let mut cp = CpSession::new();
    let document = if relative.ends_with(".fold") {
        cp.load_fold(&text, "")
    } else {
        cp.load_cp(&text, "")
    }
    .unwrap_or_else(|e| panic!("{relative}: {e:?}"));
    let lines = cp
        .document_summary(document)
        .expect("summary")
        .line_segments;
    cp.fold_source_of_selection(document, &(1..=lines).collect::<Vec<_>>(), 1)
        .expect("the sheet's source")
}

fn kabuto() -> FoldSource {
    source_of("tests/fixtures/flat-folder/kabuto.fold")
}

fn defaults() -> LayerLimits {
    LayerLimits::default()
}

/// No nodes at all: anything that needs a search runs out.
fn tiny() -> LayerLimits {
    LayerLimits {
        max_nodes: Some(0),
        fast_nodes: Some(0),
        deadline_ms: None,
    }
}

/// A deadline already passed when the call starts.
fn passed() -> LayerLimits {
    LayerLimits {
        deadline_ms: Some(0.0),
        ..LayerLimits::default()
    }
}

/// The same call, with time: keep trying.
fn later() -> LayerLimits {
    LayerLimits {
        deadline_ms: Some(60_000.0),
        ..LayerLimits::default()
    }
}

fn open(layers: &mut LayerSessions, source: &FoldSource) -> LayerOpened {
    match layers.open(source, &defaults()) {
        Ok(Opening::Opened(opened)) => opened,
        other => panic!("{other:?}"),
    }
}

fn pairs(flat: &[u32]) -> Vec<(u32, u32)> {
    assert_eq!(flat.len() % 2, 0, "pairs are flat [a, b, …]");
    flat.chunks_exact(2).map(|p| (p[0], p[1])).collect()
}

/// The sign a sentence gets, by the rule the wire documents: `1` exactly
/// when "the subject is nearer a viewer of the front" equals the object's
/// `front_up`.
fn sentence(
    subject: u32,
    in_front_of: bool,
    object: u32,
    from_front: bool,
    front_up: &[u8],
) -> [i32; 3] {
    let subject_above = in_front_of == from_front;
    let object_front_up = front_up[object as usize] == 1;
    let sign = if subject_above == object_front_up {
        1
    } else {
        -1
    };
    [subject as i32, object as i32, sign]
}

/// The upper face of every pair the order on screen relates.
fn uppers(relations: &[u32]) -> HashMap<(u32, u32), u32> {
    pairs(relations)
        .into_iter()
        .map(|(upper, lower)| ((upper.min(lower), upper.max(lower)), upper))
        .collect()
}

/// The constraint the order on screen breaks on `pair`: its other order.
fn against_shown(
    layers: &LayerSessions,
    session: u32,
    (a, b): (u32, u32),
    front_up: &[u8],
) -> [i32; 3] {
    let shown = uppers(&layers.oriedita_relations(session).expect("relations"));
    let upper = shown[&(a.min(b), a.max(b))];
    let lower = if upper == a { b } else { a };
    sentence(lower, true, upper, true, front_up)
}

/// Everything a host can read of a session.
#[derive(Debug, PartialEq)]
struct Observed {
    open_pairs: Vec<u32>,
    constraints: Vec<i32>,
    front: PackedStacks,
    back: PackedStacks,
    relations: Vec<u32>,
    record: Saving,
}

fn observed(layers: &LayerSessions, session: u32) -> Observed {
    Observed {
        open_pairs: layers.open_pairs(session).expect("open pairs"),
        constraints: layers.constraints(session).expect("constraints"),
        front: layers.stacks(session, ViewSide::Front).expect("front"),
        back: layers.stacks(session, ViewSide::Back).expect("back"),
        relations: layers.oriedita_relations(session).expect("relations"),
        record: layers.save(session).expect("save"),
    }
}

fn spot(stacks: &PackedStacks, i: usize) -> &[u32] {
    &stacks.faces[stacks.offsets[i] as usize..stacks.offsets[i + 1] as usize]
}

/// The back's stacks are the front's, each reversed.
fn assert_turned_over(front: &PackedStacks, back: &PackedStacks, spots: u32) {
    assert_eq!(front.offsets.len(), spots as usize + 1);
    assert_eq!(front.offsets, back.offsets);
    for i in 0..spots as usize {
        let mut reversed = spot(front, i).to_vec();
        reversed.reverse();
        assert_eq!(spot(back, i), reversed.as_slice(), "spot {i}");
    }
}

/// The CP kernel folds `relations` on `source` into a figure it solved: what
/// Apply does with them.
fn folds_with(source: &FoldSource, relations: &[u32]) {
    let relations = relations_from_flat_pairs(relations).expect("flat pairs");
    let folded = CpSession::new()
        .folded_figure_fold_with_order(source, &relations, FoldedFigureModel::default())
        .expect("a fold");
    match folded {
        FoldWithOrderResult::Folded { snapshot, .. } => {
            assert_eq!(snapshot.outcome, FoldOutcome::Solved);
        }
        FoldWithOrderResult::Refused { refusal } => panic!("{refusal:?}"),
    }
}

fn saved_json(layers: &LayerSessions, session: u32) -> String {
    match layers.save(session) {
        Ok(Saving::Saved { json }) => json,
        other => panic!("{other:?}"),
    }
}

fn restored(layers: &mut LayerSessions, source: &FoldSource, json: &str) -> LayerRestored {
    match layers.restore(source, json, &defaults()) {
        Ok(Restoring::Restored(restored)) => *restored,
        other => panic!("{other:?}"),
    }
}

// ---------------------------------------------------------------------------

#[test]
fn an_open_session_reports_its_faces_open_pairs_and_spots() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    assert_eq!(opened.session, 1);
    assert_eq!(opened.faces, 18);
    assert_eq!(opened.front_up.len(), 18);
    assert!(opened.front_up.iter().all(|&b| b <= 1));
    assert!(opened.spots > 0);
    // Kabuto's creases leave 36 of its 117 overlapping pairs open, each
    // smaller face first, ascending.
    let open = pairs(&opened.open_pairs);
    assert_eq!(open.len(), 36);
    assert!(open.iter().all(|&(a, b)| a < b && b < 18));
    assert!(open.windows(2).all(|w| w[0] < w[1]));
    assert_eq!(
        layers.open_pairs(opened.session),
        Ok(opened.open_pairs.clone())
    );
    assert_eq!(layers.constraints(opened.session), Ok(Vec::new()));
    assert_eq!(layers.len(), 1);

    // The sign rule the wire documents is the engine's own.
    let view = LayerSource::from_oriedita(&source).expect("source");
    let view = view.view();
    for (a, b) in open {
        for in_front_of in [true, false] {
            for from_front in [true, false] {
                let verb = if in_front_of {
                    Verb::InFrontOf
                } else {
                    Verb::Behind
                };
                let side = if from_front {
                    ViewSide::Front
                } else {
                    ViewSide::Back
                };
                let engine =
                    oristudio_fold::steer::Constraint::seen(FaceId(a), verb, FaceId(b), side, view)
                        .expect("faces");
                let wire = sentence(a, in_front_of, b, from_front, &opened.front_up);
                assert_eq!(constraints_of(&wire), Ok(vec![engine]));
            }
        }
    }
}

#[test]
fn stacks_number_the_scene_s_subfaces_and_relations_fold_in_the_kernel() {
    for relative in [
        "tests/fixtures/flat-folder/kabuto.fold",
        "tests/fixtures/oriedita/solution_sample_1.cp",
    ] {
        let source = source_of(relative);
        let mut layers = LayerSessions::new();
        let opened = open(&mut layers, &source);
        let session = opened.session;
        let front = layers.stacks(session, ViewSide::Front).expect("front");
        let back = layers.stacks(session, ViewSide::Back).expect("back");
        assert_turned_over(&front, &back, opened.spots);
        for (side, stacks) in [(ViewSide::Front, &front), (ViewSide::Back, &back)] {
            let scene = layers
                .scene(session, side, &FoldedFigureModel::default())
                .expect("scene")
                .expect("subfaces");
            assert_eq!(scene.flipped, side == ViewSide::Back, "{relative}");
            assert_eq!(scene.subfaces.len(), opened.spots as usize, "{relative}");
            for (i, subface) in scene.subfaces.iter().enumerate() {
                let drawn: Vec<u32> = subface
                    .faces_top_to_bottom
                    .iter()
                    .map(|&f| f as u32)
                    .collect();
                assert_eq!(
                    spot(stacks, i),
                    drawn.as_slice(),
                    "{relative} {side:?} spot {i}"
                );
            }
        }
        // The order on screen, folded by the CP kernel as Apply folds it.
        let relations = layers.oriedita_relations(session).expect("relations");
        assert!(!relations.is_empty());
        folds_with(&source, &relations);
    }
}

#[test]
fn a_preview_fits_and_never_commits_and_a_commit_lands_on_it() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    let session = opened.session;
    let before = observed(&layers, session);
    let mut fits = 0;
    for pair in pairs(&opened.open_pairs) {
        let candidate = against_shown(&layers, session, pair, &opened.front_up);
        match layers.preview(session, &candidate, &defaults()) {
            Ok(Previewed::Fits(fit)) => {
                fits += 1;
                assert_turned_over(&fit.stacks.front, &fit.stacks.back, opened.spots);
                // The other order of an open pair changes some spot.
                assert!(!fit.changed.front.is_empty() || !fit.changed.back.is_empty());
                assert!(fit.changed.front.iter().all(|&s| s < opened.spots));
            }
            Ok(Previewed::CantFit(_)) => {}
            other => panic!("{pair:?}: {other:?}"),
        }
        assert_eq!(observed(&layers, session), before, "{pair:?}");
    }
    println!(
        "{} previews of an open pair's other order: {fits} fit, none committed",
        opened.open_pairs.len() / 2
    );
    assert!(fits > 10, "{fits}");

    // Add: the commit lands on exactly the order its preview showed.
    let pair = pairs(&opened.open_pairs)[0];
    let candidate = against_shown(&layers, session, pair, &opened.front_up);
    let Ok(Previewed::Fits(fit)) = layers.preview(session, &candidate, &defaults()) else {
        panic!("the first open pair's other order fits");
    };
    let Ok(Committing::Committed(done)) = layers.commit(session, &candidate, &defaults()) else {
        panic!("the previewed list fits");
    };
    assert_eq!(done.changed, fit.changed);
    assert_eq!(done.stacks.front, fit.stacks.front);
    assert_eq!(done.stacks.back, fit.stacks.back);
    assert_eq!(layers.constraints(session), Ok(candidate.to_vec()));
    assert_eq!(layers.open_pairs(session), Ok(done.open_pairs.clone()));
    assert!(done.open_pairs.len() < opened.open_pairs.len());
    assert_eq!(
        layers.stacks(session, ViewSide::Front),
        Ok(done.stacks.front.clone())
    );
    folds_with(
        &source,
        &layers.oriedita_relations(session).expect("relations"),
    );

    // Remove: the order on screen stays, nothing flashes.
    let shown = layers.stacks(session, ViewSide::Front).expect("front");
    let Ok(Committing::Committed(removed)) = layers.commit(session, &[], &defaults()) else {
        panic!("an empty list fits");
    };
    assert!(removed.changed.front.is_empty() && removed.changed.back.is_empty());
    assert_eq!(removed.stacks.front, shown);
    assert_eq!(removed.open_pairs, opened.open_pairs);
}

#[test]
fn a_constraint_that_cannot_fit_is_a_no_and_changes_nothing() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    let session = opened.session;
    let before = observed(&layers, session);

    // Against what the creases force: a pair that overlaps and is not open,
    // asked both ways, fits one way and is a no the other.
    let open = pairs(&opened.open_pairs);
    let layer_source = LayerSource::from_oriedita(&source).expect("source");
    let forced = layer_source
        .problem()
        .variables()
        .iter()
        .map(|p| (p.lo().0, p.hi().0))
        .find(|p| !open.contains(p))
        .expect("kabuto forces pairs");
    let mut proofs = Vec::new();
    for in_front_of in [true, false] {
        let candidate = sentence(forced.0, in_front_of, forced.1, true, &opened.front_up);
        match layers.preview(session, &candidate, &defaults()) {
            Ok(Previewed::Fits(fit)) => assert_eq!(fit.nodes, 0),
            Ok(Previewed::CantFit(cant)) => {
                // The candidate is the last of the list checked.
                assert_eq!(cant.constraints, vec![0]);
                assert!(!cant.faces.is_empty());
                assert!(cant.proof_faces.is_empty());
                proofs.push(cant.proof);
                let committing = layers.commit(session, &candidate, &defaults());
                assert!(
                    matches!(committing, Ok(Committing::CantFit(_))),
                    "{committing:?}"
                );
            }
            other => panic!("{other:?}"),
        }
    }
    assert_eq!(proofs, vec![CantFitKind::Forced]);

    // Two constraints that order one pair both ways.
    let (a, b) = open[0];
    let both: Vec<i32> = [
        sentence(a, true, b, true, &opened.front_up),
        sentence(a, false, b, true, &opened.front_up),
    ]
    .concat();
    match layers.commit(session, &both, &defaults()) {
        Ok(Committing::CantFit(cant)) => {
            assert_eq!(cant.proof, CantFitKind::Opposed);
            assert_eq!(cant.constraints, vec![0, 1]);
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(observed(&layers, session), before);
}

#[test]
fn out_of_nodes_or_time_is_a_timeout_and_keep_trying_is_the_same_call_later() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    let session = opened.session;
    let before = observed(&layers, session);
    let mut by_nodes = 0;
    let mut by_deadline = 0;
    for pair in pairs(&opened.open_pairs) {
        let candidate = against_shown(&layers, session, pair, &opened.front_up);
        let answered =
            |previewed: &Previewed| matches!(previewed, Previewed::Fits(_) | Previewed::CantFit(_));
        for (limits, limit, count) in [
            (tiny(), BudgetLimit::Nodes, &mut by_nodes),
            (passed(), BudgetLimit::Deadline, &mut by_deadline),
        ] {
            match layers
                .preview(session, &candidate, &limits)
                .expect("preview")
            {
                Previewed::TimedOut(out) => {
                    assert_eq!(out.limit, limit, "{pair:?}");
                    *count += 1;
                    // Keep trying: the same call, with more.
                    let again = layers
                        .preview(session, &candidate, &later())
                        .expect("preview");
                    assert!(answered(&again), "{pair:?}: {again:?}");
                    // A commit that runs out commits nothing.
                    let committing = layers.commit(session, &candidate, &limits).expect("commit");
                    assert!(matches!(committing, Committing::TimedOut(TimedOut { .. })));
                    assert_eq!(observed(&layers, session), before, "{pair:?}");
                }
                other => assert!(answered(&other), "{pair:?}: {other:?}"),
            }
        }
    }
    println!(
        "{} open pairs' other orders: {by_nodes} ran out of nodes, {by_deadline} out of time, \
         each answered when tried again",
        opened.open_pairs.len() / 2
    );
    assert!(by_nodes > 5, "{by_nodes}");
    assert!(by_deadline > 5, "{by_deadline}");

    // The open itself, out of nodes, then again with them.
    match layers.open(&source, &tiny()) {
        Ok(Opening::Refused(refusal)) => {
            assert_eq!(refusal.code(), "session_timed_out");
            assert_eq!(refusal.to_value()["limit"], "nodes");
        }
        other => panic!("{other:?}"),
    }
    match layers.open(&source, &passed()) {
        Ok(Opening::Refused(refusal)) => {
            assert_eq!(refusal.code(), "session_timed_out");
            assert_eq!(refusal.to_value()["limit"], "deadline");
        }
        other => panic!("{other:?}"),
    }
    assert!(matches!(
        layers.open(&source, &later()),
        Ok(Opening::Opened(_))
    ));
}

#[test]
fn a_refused_open_holds_nothing_and_says_why_by_code() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    // The creases trace other faces than the digest names.
    let drifted = FoldSource {
        digest: "0000000000000000".to_string(),
        ..source.clone()
    };
    match layers.open(&drifted, &defaults()) {
        Ok(Opening::Refused(refusal)) => {
            assert_eq!(refusal.code(), "source_digest_mismatch");
            let body = refusal.to_value();
            assert_eq!(body["expected"], "0000000000000000");
            assert_eq!(body["actual"], source.digest.as_str());
        }
        other => panic!("{other:?}"),
    }
    // A restore of the same is refused alike.
    let json = encode_record(&Default::default()).expect("an empty record");
    match layers.restore(&drifted, &json, &defaults()) {
        Ok(Restoring::Refused(refusal)) => assert_eq!(refusal.code(), "source_digest_mismatch"),
        other => panic!("{other:?}"),
    }
    // Nothing folded.
    let empty = FoldSource {
        segments: Vec::new(),
        aux_segments: Vec::new(),
        ..source
    };
    match layers.open(&empty, &defaults()) {
        Ok(Opening::Refused(refusal)) => {
            assert!(refusal.code().starts_with("source_"), "{refusal:?}");
            assert!(refusal.to_value().get("message").is_none());
        }
        other => panic!("{other:?}"),
    }
    assert!(layers.is_empty());
}

#[test]
fn a_saved_session_restores_to_the_same_constraints_and_order() {
    for relative in [
        "tests/fixtures/flat-folder/kabuto.fold",
        "tests/fixtures/oriedita/solution_sample_1.cp",
    ] {
        let source = source_of(relative);
        let mut layers = LayerSessions::new();
        let opened = open(&mut layers, &source);
        let session = opened.session;
        // Two constraints: an open pair's other order, then another open
        // pair the way it is shown.
        let first = against_shown(
            &layers,
            session,
            pairs(&opened.open_pairs)[0],
            &opened.front_up,
        );
        let Ok(Committing::Committed(done)) = layers.commit(session, &first, &defaults()) else {
            panic!("{relative}: it fits");
        };
        let next = pairs(&done.open_pairs)[0];
        let shown = uppers(&layers.oriedita_relations(session).expect("relations"));
        let upper = shown[&next];
        let lower = if upper == next.0 { next.1 } else { next.0 };
        let list = [first, sentence(upper, true, lower, true, &opened.front_up)].concat();
        let Ok(Committing::Committed(_)) = layers.commit(session, &list, &defaults()) else {
            panic!("{relative}: it fits");
        };
        let json = saved_json(&layers, session);
        let back = restored(&mut layers, &source, &json);
        assert_ne!(back.opened.session, session);
        assert_eq!(back.outcome, RestoredOutcome::Applied, "{relative}");
        assert_eq!(back.constraints, list, "{relative}");
        assert!(back.faces.status.iter().all(|&s| s == FACE_INTACT));
        assert!(back.faces.face.iter().all(|&f| f >= 0));
        assert!(
            back.constraint_status
                .iter()
                .all(|s| *s == ConstraintStatus::Intact)
        );
        assert!(back.order_status.iter().all(|&s| s == PAIR_KEPT));
        let restored_session = back.opened.session;
        assert_eq!(
            back.opened.open_pairs,
            layers.open_pairs(session).expect("open")
        );
        assert_eq!(
            observed(&layers, restored_session),
            observed(&layers, session),
            "{relative}"
        );
        assert_eq!(saved_json(&layers, restored_session), json);
    }
}

/// A saved constraint against a pair the creases force, beside one that
/// fits (as a crease edit that turned a letter would leave it): the rows say
/// which, and none is applied.
#[test]
fn a_restore_whose_constraints_clash_commits_none_and_marks_the_clash() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    let session = opened.session;
    let open = pairs(&opened.open_pairs);
    let fine = sentence(open[0].0, false, open[0].1, true, &opened.front_up);
    let Ok(Committing::Committed(_)) = layers.commit(session, &fine, &defaults()) else {
        panic!("an open pair takes either order");
    };
    let RecordRead::Read { mut record, .. } = read_record(&saved_json(&layers, session)) else {
        panic!("the record reads");
    };
    // The forced pair the other way, added by hand: no session commits it.
    let layer_source = LayerSource::from_oriedita(&source).expect("source");
    let shown = uppers(&layers.oriedita_relations(session).expect("relations"));
    let (upper, lower) = layer_source
        .problem()
        .variables()
        .iter()
        .map(|p| (p.lo().0, p.hi().0))
        .find(|p| !open.contains(p) && *p != open[0])
        .map(|p| {
            let upper = shown[&p];
            (upper, if upper == p.0 { p.1 } else { p.0 })
        })
        .expect("kabuto forces pairs");
    let mut listed = |face: u32| -> u32 {
        let at = layer_source.paper_point(FaceId(face)).expect("a point");
        if let Some(i) = record.faces.iter().position(|f| f.at == at) {
            return i as u32;
        }
        record.faces.push(RecordFace {
            at,
            area: layer_source.paper_area(FaceId(face)).expect("an area"),
        });
        (record.faces.len() - 1) as u32
    };
    let (f, g) = (listed(lower), listed(upper));
    let against = constraints_of(&sentence(lower, true, upper, true, &opened.front_up))
        .expect("a constraint")[0];
    record.constraints.push(RecordPair {
        f,
        g,
        sign: against.sign,
    });
    let json = encode_record(&record).expect("encode");

    let back = restored(&mut layers, &source, &json);
    assert_eq!(
        back.outcome,
        RestoredOutcome::Clash {
            constraints: vec![1]
        }
    );
    assert_eq!(
        back.constraint_status,
        vec![ConstraintStatus::Intact, ConstraintStatus::Clashing]
    );
    assert!(back.constraints.is_empty(), "none committed");
    assert_eq!(layers.constraints(back.opened.session), Ok(Vec::new()));
    // The saved order is still the one shown, where the creases allow it.
    assert!(back.order_status.iter().all(|&s| s == PAIR_KEPT));
    // The session is held, for the dialog to open on the rows.
    assert_eq!(layers.len(), 2);
}

#[test]
fn a_record_that_does_not_read_is_refused_by_code() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    for (json, code) in [
        ("not json", "record_damaged"),
        (
            r#"{"v":1,"faces":"x","constraints":[],"order":[]}"#,
            "record_damaged",
        ),
        (r#"{"v":2}"#, "record_newer"),
    ] {
        match layers.restore(&source, json, &defaults()) {
            Ok(Restoring::Refused(refusal)) => assert_eq!(refusal.code(), code, "{json}"),
            other => panic!("{json}: {other:?}"),
        }
    }
    match layers.restore(&source, "not json", &defaults()) {
        Ok(Restoring::Refused(LayerRefusal::RecordDamaged { damage })) => {
            assert_eq!(damage.word(), "not-json");
        }
        other => panic!("{other:?}"),
    }
    // A record whose restore runs out of nodes: its open does.
    let json = encode_record(&Default::default()).expect("an empty record");
    match layers.restore(&source, &json, &tiny()) {
        Ok(Restoring::Refused(refusal)) => assert_eq!(refusal.code(), "session_timed_out"),
        other => panic!("{other:?}"),
    }
    assert!(layers.is_empty());
}

#[test]
fn a_closed_session_is_gone_and_its_handle_is_never_reused() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let first = open(&mut layers, &source).session;
    let second = open(&mut layers, &source).session;
    assert_eq!((first, second), (1, 2));
    assert!(layers.close(first));
    assert!(!layers.close(first));
    assert_eq!(layers.len(), 1);
    let gone = |error: LayerCallError| assert_eq!(error.code(), "unknown_layer_session");
    gone(layers.open_pairs(first).expect_err("closed"));
    gone(layers.constraints(first).expect_err("closed"));
    gone(
        layers
            .preview(first, &[0, 1, 1], &defaults())
            .expect_err("closed"),
    );
    gone(layers.commit(first, &[], &defaults()).expect_err("closed"));
    gone(layers.stacks(first, ViewSide::Front).expect_err("closed"));
    gone(
        layers
            .scene(first, ViewSide::Back, &FoldedFigureModel::default())
            .expect_err("closed"),
    );
    gone(layers.oriedita_relations(first).expect_err("closed"));
    gone(layers.save(first).expect_err("closed"));
    // The other session is untouched, and a new one takes a new handle.
    assert!(layers.open_pairs(second).is_ok());
    assert_eq!(open(&mut layers, &source).session, 3);
    layers.clear();
    assert!(layers.is_empty());
}

#[test]
fn a_caller_s_mistakes_are_thrown_by_code() {
    let source = kabuto();
    let mut layers = LayerSessions::new();
    let opened = open(&mut layers, &source);
    let session = opened.session;
    let (a, b) = pairs(&opened.open_pairs)[0];
    let code = |result: Result<Previewed, LayerCallError>| result.map(|_| ()).map_err(|e| e.code());
    // Not one triple, a sign that is not ±1, a negative face.
    assert_eq!(
        code(layers.preview(session, &[a as i32, b as i32], &defaults())),
        Err("invalid_input")
    );
    assert_eq!(
        code(layers.preview(session, &[a as i32, b as i32, 0], &defaults())),
        Err("invalid_input")
    );
    assert_eq!(
        code(layers.preview(session, &[-1, b as i32, 1], &defaults())),
        Err("invalid_input")
    );
    // A constraint that is no question: the dialog offers only open pairs.
    assert_eq!(
        code(layers.preview(session, &[a as i32, a as i32, 1], &defaults())),
        Err("session_bad_constraint")
    );
    assert_eq!(
        code(layers.preview(session, &[a as i32, 99, 1], &defaults())),
        Err("session_bad_constraint")
    );
    assert_eq!(
        layers
            .commit(session, &[a as i32, a as i32, 1], &defaults())
            .map(|_| ())
            .map_err(|e| e.code()),
        Err("session_bad_constraint")
    );
    // A deadline that is no duration.
    let negative = LayerLimits {
        deadline_ms: Some(-1.0),
        ..LayerLimits::default()
    };
    assert_eq!(
        code(layers.preview(session, &[a as i32, b as i32, 1], &negative)),
        Err("invalid_input")
    );
    assert_eq!(
        layers
            .open(&source, &negative)
            .map(|_| ())
            .map_err(|e| e.code()),
        Err("invalid_input")
    );
    // Nothing changed.
    assert_eq!(layers.constraints(session), Ok(Vec::new()));
    assert_eq!(
        oristudio_fold_wasm::steer::side_of("up").map_err(|e| e.code()),
        Err("invalid_input")
    );
}
