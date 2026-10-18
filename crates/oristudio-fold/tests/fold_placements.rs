mod support;

use oristudio_fold::{
    CompletionLimits, Direction, FoldLanding, FoldPlacementSearch, Seed, Sheet, StartSide, State,
};
use support::*;

fn complete(search: &mut FoldPlacementSearch) {
    for _ in 0..100 {
        search.advance(&CompletionLimits::default(), 128, 1024);
        if search.count().exact {
            return;
        }
    }
    panic!("small placement search did not finish");
}

#[test]
fn separate_flaps_offer_outer_and_inserted_landings() {
    for direction in [Direction::Valley, Direction::Mountain] {
        let sheet = State::flat(Sheet::square(), StartSide::Front).unwrap();
        let parent = fold(&sheet, &all(y_eq(0.35), [0.5, 0.1], direction)).state;
        let op = all(y_eq(0.8), [0.5, 0.9], direction);
        let mut search = FoldPlacementSearch::new(&parent, &op);
        complete(&mut search);
        assert_eq!(search.count().orders, 2);
        assert_eq!(search.candidates()[0].landing, FoldLanding::Outer);
        assert!(matches!(
            search.candidates()[1].landing,
            FoldLanding::Against { .. }
        ));
        for candidate in search.candidates() {
            assert_valid(&candidate.state);
        }
        assert_eq!(search.candidates()[0].moving, search.candidates()[1].moving);
        assert_ne!(
            search.candidates()[0].state.order(),
            search.candidates()[1].state.order()
        );
    }
}

#[test]
fn selecting_one_flap_offers_only_landings_of_that_flap() {
    let sheet = State::flat(Sheet::square(), StartSide::Front).unwrap();
    let book = fold(&sheet, &all(x_eq(0.5), [0.75, 0.5], Direction::Valley)).state;
    let op = all(
        through([0., 0.3], [0.3, 0.]),
        [0.02, 0.02],
        Direction::Valley,
    )
    .with_seed(Seed::Flaps {
        at: vec![[0.05, 0.05]],
    });
    let mut search = FoldPlacementSearch::new(&book, &op);
    complete(&mut search);
    assert_eq!(search.count().orders, 1);
    let only = &search.candidates()[0];
    assert!(matches!(only.landing, FoldLanding::Against { .. }));
    assert_eq!(only.moving, vec![book.face_at([0.05, 0.05]).unwrap()]);
    assert_valid(&only.state);

    // Carrying the other flap remains possible when it is also selected.
    let mut both = FoldPlacementSearch::new(&book, &op.with_seed(Seed::All));
    complete(&mut both);
    assert!(
        both.candidates()
            .iter()
            .any(|c| c.landing == FoldLanding::Outer)
    );
    assert!(both.candidates().iter().all(|c| c.moving.len() == 2));
}

#[test]
fn a_limited_search_does_not_claim_its_outer_result_is_unique() {
    let sheet = State::flat(Sheet::square(), StartSide::Front).unwrap();
    let parent = fold(&sheet, &all(y_eq(0.35), [0.5, 0.1], Direction::Valley)).state;
    let mut search =
        FoldPlacementSearch::new(&parent, &all(y_eq(0.8), [0.5, 0.9], Direction::Valley));
    assert_eq!(search.count().orders, 1);
    assert!(!search.count().exact);
    complete(&mut search);
    assert!(search.count().exact);
}

/// Exhaust the old public Tuck surface over *all* faces, independently of the
/// pool pruning, retaining only results whose new/refolded hinge letters match
/// the requested direction and selected flaps. Legacy Tuck also admits
/// opposite-direction folds and adds unselected flaps to reach some targets.
fn assert_legacy_union(parent: &State, op: &oristudio_fold::PlainFold) {
    use oristudio_fold::{CreaseKind, Letter, TuckChoices, TuckFold, TuckFolded, TuckOutcome};
    let mut search = FoldPlacementSearch::new(parent, op);
    complete(&mut search);
    let mut expected = Vec::new();
    let analysis = parent.analyse_fold(op).unwrap();
    let mut selected: Vec<_> = analysis
        .picked
        .iter()
        .flat_map(|&i| analysis.flaps[i].faces.iter().copied())
        .collect();
    selected.sort();
    selected.dedup();
    if let Ok(outer) = parent.fold(op)
        && outer.report.analysis.moving == selected
    {
        expected.push((outer.report.analysis.moving, outer.state));
    }
    let witnesses: Vec<_> = parent
        .faces()
        .iter()
        .map(|f| parent.face_witness(f.id).unwrap())
        .collect();
    assert!(witnesses.len() < 12);
    let mut keep = |folded: TuckFolded| {
        if folded.report.fold.moving != selected {
            return;
        }
        // Check front-relative crease letters independently of the production
        // admission check, which uses moving/stationary face-pair relations.
        let hinges = folded
            .report
            .fold
            .created
            .iter()
            .copied()
            .chain(folded.report.fold.refolded.iter().map(|r| r.edge));
        for id in hinges {
            let crease = folded.state.creases().iter().find(|c| c.id == id).unwrap();
            let face = folded
                .state
                .faces()
                .iter()
                .find(|f| crease.vertices.iter().all(|v| f.ring.contains(v)))
                .unwrap();
            let front = parent
                .front_up(face.id)
                .or_else(|| face.parent.and_then(|id| parent.front_up(id)))
                .unwrap();
            let valley = parent.view().model_direction(op.direction) == Direction::Valley;
            let expected = if front == valley {
                Letter::Valley
            } else {
                Letter::Mountain
            };
            if crease.kind != CreaseKind::Folded(expected) {
                return;
            }
        }
        expected.push((folded.report.fold.moving, folded.state));
    };
    for mask in 1..(1usize << witnesses.len()) {
        let targets: Vec<_> = witnesses
            .iter()
            .enumerate()
            .filter(|(i, _)| mask & (1 << i) != 0)
            .map(|(_, p)| *p)
            .collect();
        let tuck = TuckFold {
            line: op.line,
            side: op.side,
            direction: op.direction,
            seed: op.seed.clone(),
            target: targets[0],
            additional_targets: targets[1..].to_vec(),
        };
        match parent.tuck_fold(&tuck, &TuckChoices::default()) {
            Ok(TuckOutcome::Landed(folded)) => keep(*folded),
            Ok(TuckOutcome::ChooseOrder(choice)) => {
                assert!(choice.count().exact);
                for mut ordinal in 0..choice.count().orders {
                    let mut indices = vec![0; choice.completions().components().len()];
                    for (i, component) in choice.completions().components().iter().enumerate().rev()
                    {
                        indices[i] = (ordinal % component.orders.len() as u64) as usize;
                        ordinal /= component.orders.len() as u64;
                    }
                    keep(choice.pick(&indices).unwrap());
                }
            }
            Err(_) => {}
        }
    }
    for (moving, state) in &expected {
        assert!(
            search
                .candidates()
                .iter()
                .any(|candidate| candidate.moving == *moving
                    && candidate.state.parts() == state.parts()),
            "legacy result missing: {op:?}"
        );
    }
    for (i, candidate) in search.candidates().iter().enumerate() {
        assert_eq!(candidate.moving, selected);
        assert_valid(&candidate.state);
        assert!(
            expected
                .iter()
                .any(|(moving, state)| *moving == candidate.moving
                    && state.parts() == candidate.state.parts())
        );
        assert!(
            !search.candidates()[..i]
                .iter()
                .any(|other| other.moving == candidate.moving
                    && other.state.parts() == candidate.state.parts())
        );
    }
}

#[test]
fn exhaustively_preserves_directional_insertions_across_scopes_directions_and_views() {
    for start in [StartSide::Front, StartSide::Back] {
        let sheet = State::flat(Sheet::square(), start).unwrap();
        let book = fold(&sheet, &all(x_eq(0.5), [0.75, 0.5], Direction::Valley)).state;
        let separate = fold(&sheet, &all(y_eq(0.35), [0.5, 0.1], Direction::Valley)).state;
        for parent in [&book, &book.turn_over(), &book.rotate(0.7)] {
            for direction in [Direction::Valley, Direction::Mountain] {
                let op = all(through([0., 0.3], [0.3, 0.]), [0.02, 0.02], direction);
                for seed in [
                    Seed::All,
                    Seed::Flaps {
                        at: vec![[0.05, 0.05]],
                    },
                    Seed::Depth {
                        at: [0.05, 0.05],
                        layers: 1,
                    },
                    Seed::Depth {
                        at: [0.05, 0.05],
                        layers: 2,
                    },
                ] {
                    assert_legacy_union(parent, &op.clone().with_seed(seed));
                }
            }
        }
        assert_legacy_union(&separate, &all(y_eq(0.8), [0.5, 0.9], Direction::Valley));
        let creased = precrease(
            &book,
            &all(
                through([0., 0.3], [0.3, 0.]),
                [0.02, 0.02],
                Direction::Valley,
            ),
        )
        .state;
        assert_legacy_union(
            &creased,
            &all(
                through([0., 0.3], [0.3, 0.]),
                [0.02, 0.02],
                Direction::Valley,
            ),
        );
    }
}

#[test]
fn canceled_budget_keeps_candidates_and_resumes_without_reordering() {
    let sheet = State::flat(Sheet::square(), StartSide::Front).unwrap();
    let parent = fold(&sheet, &all(y_eq(0.35), [0.5, 0.1], Direction::Valley)).state;
    let mut search =
        FoldPlacementSearch::new(&parent, &all(y_eq(0.8), [0.5, 0.9], Direction::Valley));
    let first = search.candidates()[0].state.parts().clone();
    search.advance(
        &CompletionLimits {
            max_nodes: Some(0),
            ..CompletionLimits::default()
        },
        128,
        1024,
    );
    assert!(!search.count().exact);
    assert_eq!(search.count().orders, 1);
    complete(&mut search);
    assert_eq!(search.candidates()[0].state.parts(), &first);
    assert_eq!(search.count().orders, 2);
}

#[test]
fn a_corner_fold_on_a_precreased_sheet_has_only_its_requested_direction() {
    for start in [StartSide::Front, StartSide::Back] {
        let mut grid = State::flat(Sheet::square(), start).unwrap();
        for c in [0.5, 0.75, 0.25] {
            for line in [x_eq(c), y_eq(c)] {
                grid = precrease(&grid, &all(line, [0.9, 0.9], Direction::Valley)).state;
            }
        }
        for parent in [&grid, &grid.turn_over(), &grid.rotate(0.7)] {
            for direction in [Direction::Valley, Direction::Mountain] {
                let op = all(through([0., 0.5], [0.5, 1.]), [0., 1.], direction);
                for seed in [
                    Seed::All,
                    Seed::Flaps {
                        at: vec![[0.1, 0.9]],
                    },
                    Seed::Depth {
                        at: [0.1, 0.9],
                        layers: 1,
                    },
                ] {
                    let op = op.clone().with_seed(seed);
                    let precreased = precrease(parent, &op).state;
                    // Both scoring a new attachment and refolding an existing
                    // one must preserve direction across the grid's faces.
                    for parent in [parent, &precreased] {
                        let mut search = FoldPlacementSearch::new(parent, &op);
                        complete(&mut search);
                        assert_eq!(
                            search.count().orders,
                            1,
                            "{start:?} {:?} {op:?}",
                            parent.view()
                        );
                        assert_eq!(search.candidates()[0].landing, FoldLanding::Outer);
                        assert_eq!(
                            search.candidates()[0].state.parts(),
                            fold(parent, &op).state.parts()
                        );
                    }
                }
            }
        }
    }
}
