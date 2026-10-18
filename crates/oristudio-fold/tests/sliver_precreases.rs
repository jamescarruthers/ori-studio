mod support;

use oristudio_fold::{Direction, Sheet, StartSide, State};
use support::*;

fn strip(direction: Direction, marks: &[f64]) -> State {
    let mut state = State::flat(Sheet::rectangle(1., 0.5).unwrap(), StartSide::Front).unwrap();
    for &x in marks {
        state = precrease(&state, &all(x_eq(x), [0.95, 0.25], direction)).state;
    }
    fold(&state, &all(x_eq(0.3), [0.1, 0.25], direction)).state
}

#[test]
fn flat_subdivisions_do_not_turn_a_broad_overlap_into_a_sliver() {
    for direction in [Direction::Valley, Direction::Mountain] {
        for marks in [vec![], vec![0.1999], vec![0.8001], vec![0.1999, 0.8001]] {
            let state = strip(direction, &marks);
            // Left flap covers [0.3, 0.6], right flap lands on [0.4, 0.7].
            // Flat subdivisions at 0.4001 / 0.5999 are not paper boundaries.
            let result = fold(&state, &all(x_eq(0.7), [0.95, 0.25], direction));
            assert_valid(&result.state);
        }
    }
}

#[test]
fn a_real_boundary_sliver_still_fails_with_flat_subdivisions() {
    for direction in [Direction::Valley, Direction::Mountain] {
        for marks in [vec![], vec![0.15], vec![0.9], vec![0.15, 0.9]] {
            let state = strip(direction, &marks);
            let refusal = refused(&state, &all(x_eq(0.79995), [0.95, 0.25], direction));
            assert_eq!(refusal.refusal.code(), "sliver");
        }
    }
}

#[test]
fn insertion_uses_the_same_panel_guard() {
    use oristudio_fold::{Seed, TuckChoices, TuckFold, TuckOutcome};
    for direction in [Direction::Valley, Direction::Mountain] {
        for marks in [vec![], vec![0.1999], vec![0.8001], vec![0.1999, 0.8001]] {
            let state = strip(direction, &marks);
            let line = x_eq(0.7);
            let op = TuckFold {
                line,
                side: side(&line, [0.95, 0.25]),
                direction,
                seed: Seed::All,
                target: [0.1, 0.25],
                additional_targets: vec![],
            };
            let result = state.tuck_fold(&op, &TuckChoices::default()).unwrap();
            let TuckOutcome::Landed(result) = result else {
                panic!("simple strip should have one insertion order");
            };
            assert_valid(&result.state);
            let TuckOutcome::Landed(replayed) =
                state.tuck_fold(&op, &result.report.stored).unwrap()
            else {
                panic!("saved insertion should replay directly");
            };
            assert_eq!(result.state.parts(), replayed.state.parts());
        }
    }
}

#[test]
fn insertion_still_refuses_a_genuine_boundary_sliver() {
    use oristudio_fold::{CompoundRefused, FoldRefusal, Seed, TuckChoices, TuckFold};
    for direction in [Direction::Valley, Direction::Mountain] {
        let state = strip(direction, &[0.15, 0.9]);
        let line = x_eq(0.79995);
        let op = TuckFold {
            line,
            side: side(&line, [0.95, 0.25]),
            direction,
            seed: Seed::All,
            target: [0.1, 0.25],
            additional_targets: vec![],
        };
        let CompoundRefused::Refused(refused) =
            state.tuck_fold(&op, &TuckChoices::default()).unwrap_err()
        else {
            panic!("new insertion has no broken saved choice");
        };
        assert!(
            matches!(refused.refusal, FoldRefusal::Sliver { .. }),
            "{refused:?}"
        );
    }
}
