mod beloch;
mod support;
mod vertex;
use oristudio_fold::{Direction, SwivelByCreases, SwivelKind, VertexChoices};
use vertex::cases;

#[test]
fn located_hinges_reproduce_the_existing_swivel_and_allow_independent_hinges() {
    let c = cases::fold_swivel_cases()
        .into_iter()
        .find(|c| c.name == "kite narrowed at c, right")
        .unwrap();
    let a = c.state.analyse_swivel_by_edge(&c.op).unwrap();
    // Use the material layers identified by the existing, public kite case.
    let v = a.vertex;
    let first = a.creases[0].to;
    let second = a.creases[2].to;
    let inverse = |p| {
        c.state
            .faces()
            .iter()
            .find_map(|f| {
                let t = c.state.isometry(f.id)?;
                let q = t.inverse().apply(p);
                let ring: Vec<_> = f
                    .ring
                    .iter()
                    .map(|v| c.state.vertices()[v.0 as usize])
                    .collect();
                oristudio_geometry::convex::contains_point(&ring, q, -1e-8).then_some(q)
            })
            .unwrap()
    };
    let fold = c
        .state
        .isometry(a.fold.as_ref().unwrap().faces[0])
        .unwrap()
        .inverse()
        .apply(v);
    for kind in [SwivelKind::Open, SwivelKind::Inside] {
        let base = SwivelByCreases {
            fold,
            first: inverse(first),
            second: inverse(second),
            direction: Direction::Valley,
            kind,
        };
        let choices = VertexChoices::default();
        let actual = c.state.analyse_swivel_by_creases(&base).unwrap();
        assert!(support::close(actual.vertex, a.vertex));
        let folds = cases::every(c.state.swivel_by_creases(&base, &choices));
        assert!(
            !folds.is_empty(),
            "{kind:?}: {:?}",
            c.state.swivel_by_creases(&base, &choices)
        );
        for folded in folds {
            support::assert_valid(&folded.state);
        }
    }
}

#[test]
fn independently_located_hinges_land_and_replay() {
    use support::*;
    let flat = oristudio_fold::State::flat(
        oristudio_fold::Sheet::square(),
        oristudio_fold::StartSide::Front,
    )
    .unwrap();
    let state = fold(&flat, &all(x_eq(0.5), [0.8, 0.5], Direction::Valley)).state;
    for kind in [SwivelKind::Open, SwivelKind::Inside] {
        let op = SwivelByCreases {
            fold: [0.5, 0.5],
            first: [0.05, 0.1],
            second: [0.1, 0.8],
            direction: Direction::Mountain,
            kind,
        };
        let a = state.analyse_swivel_by_creases(&op).unwrap();
        assert!((a.creases[0].direction[0] - a.creases[1].direction[0]).abs() > 1e-3);
        let folds = cases::every(state.swivel_by_creases(&op, &VertexChoices::default()));
        assert!(
            !folds.is_empty(),
            "{kind:?}: {:?}",
            state.swivel_by_creases(&op, &VertexChoices::default())
        );
        for folded in folds {
            assert_valid(&folded.state);
            let replay = cases::every(state.swivel_by_creases(&op, &folded.report.stored));
            assert_eq!(replay[0].state.parts(), folded.state.parts());
        }
    }
}

#[test]
fn two_lines_derive_the_same_fold_and_reject_missing_meetings() {
    use oristudio_geometry::Line;
    use support::*;
    let flat = oristudio_fold::State::flat(
        oristudio_fold::Sheet::square(),
        oristudio_fold::StartSide::Front,
    )
    .unwrap();
    let state = fold(&flat, &all(x_eq(0.5), [0.8, 0.5], Direction::Valley)).state;
    let first = Line::from_points([0.5, 0.5], [0.05, 0.1]).unwrap();
    let second = Line::from_points([0.5, 0.5], [0.1, 0.8]).unwrap();
    for kind in [SwivelKind::Open, SwivelKind::Inside] {
        let derived =
            SwivelByCreases::from_lines(&state, first, second, Direction::Mountain, kind).unwrap();
        let given = SwivelByCreases {
            fold: [0.5, 0.5],
            first: [0.05, 0.1],
            second: [0.1, 0.8],
            direction: Direction::Mountain,
            kind,
        };
        let actual = cases::every(state.swivel_by_creases(&derived, &VertexChoices::default()));
        let expected = cases::every(state.swivel_by_creases(&given, &VertexChoices::default()));
        assert!(!actual.is_empty());
        assert_eq!(actual.len(), expected.len());
        for (a, b) in actual.iter().zip(expected.iter()) {
            assert_valid(&a.state);
            assert_eq!(a.state.vertices().len(), b.state.vertices().len());
            for (x, y) in a.state.vertices().iter().zip(b.state.vertices()) {
                assert!(close(*x, *y));
            }
        }
    }
    for (a, b) in [(first, first), (x_eq(0.2), y_eq(0.2))] {
        let error =
            SwivelByCreases::from_lines(&state, a, b, Direction::Valley, SwivelKind::Inside)
                .unwrap_err();
        assert!(matches!(
            error.refusal,
            oristudio_fold::FoldRefusal::SwivelLineMeeting
        ));
    }
}

#[test]
fn two_existing_precreases_can_meet_at_a_folded_run_subdivision() {
    use oristudio_geometry::Line;
    use support::*;
    let flat = oristudio_fold::State::flat(
        oristudio_fold::Sheet::square(),
        oristudio_fold::StartSide::Front,
    )
    .unwrap();
    let mut state = fold(&flat, &all(x_eq(0.5), [0.8, 0.5], Direction::Valley)).state;
    let first = Line::from_points([0.5, 0.5], [0.05, 0.1]).unwrap();
    let second = Line::from_points([0.5, 0.5], [0.1, 0.8]).unwrap();
    for line in [first, second] {
        state = precrease(&state, &all(line, [0.1, 0.5], Direction::Valley)).state;
    }
    let op = SwivelByCreases::from_lines(
        &state,
        first,
        second,
        Direction::Mountain,
        SwivelKind::Inside,
    )
    .unwrap();
    let outcomes = cases::every(state.swivel_by_creases(&op, &VertexChoices::default()));
    assert!(
        !outcomes.is_empty(),
        "{:?}",
        state.swivel_by_creases(&op, &VertexChoices::default())
    );
    for outcome in outcomes {
        assert_valid(&outcome.state);
    }
}
