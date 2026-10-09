//! A real sequence through the reverse fold (plan Phase 9's fixtures;
//! research §5.2: "still untested: a real sequence beyond the preliminary
//! base"): the traditional crane by Ida's route (`tests/ida`), checked
//! against what Beloch commits for it.
//!
//! Every frame is matched exactly — the same faces, the same isometries
//! after one rigid map, the same layer order — numbering-free
//! (`beloch::matches`): `bird-base-petal.fold` step by step, and the finished
//! 60-face `crane.fold`. Every reverse fold on the way passes the compound
//! checks (`tests/compound`): the full gate, the letter rules, a plain
//! fold's geometry, the motion's endpoints. The neck, tail and head are also
//! folded on the bird base imported from `bird-base-petal.fold`'s crease
//! pattern through Import CP — the route a sequence takes while squash and
//! petal folds do not exist — and land on the same crane.

mod beloch;
mod compound;
mod ida;
mod support;

use ida::{A, B, C, D, Op, SQRT2, Sequence};
use oristudio_fold::{Isometry, Sheet, StartSide, State};
use support::assert_valid;

/// The checks every step passes.
fn check_steps(sequence: &Sequence) {
    for step in &sequence.steps {
        assert_valid(&step.state);
        if let (Op::Reverse(op, _), Some(folded)) = (&step.op, &step.reverse) {
            compound::check(&step.parent, op, folded);
            assert!(
                compound::assert_plain_fold_geometry(&step.parent, op, folded),
                "{}: the plain fold of the tip moves more",
                step.name
            );
        }
    }
}

/// The bird base from the square, each step matched against
/// `bird-base-petal.fold`'s frame.
fn bird_base() -> Sequence {
    let doc = beloch::document("bird-base-petal.fold");
    let square = State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut sequence = Sequence::new(square, Isometry::IDENTITY);
    sequence.bird_base();
    for (k, step) in sequence.steps.iter().enumerate() {
        let frame = beloch::frame(&doc, Some(k + 1)).unwrap_or_else(|e| panic!("{e}"));
        let phi = beloch::matches(&step.state, &frame)
            .unwrap_or_else(|e| panic!("{} against frame {}: {e}", step.name, k + 1));
        assert!(
            phi.0
                .iter()
                .zip(&Isometry::IDENTITY.0)
                .all(|(a, b)| (a - b).abs() < 1e-9),
            "{}: the model frame is the table's",
            step.name
        );
    }
    check_steps(&sequence);
    sequence
}

/// The neck, tail and head from the sequence's bird base, matched against
/// `crane.fold`.
fn crane(sequence: &mut Sequence) -> State {
    let from = sequence.steps.len();
    let start = sequence.state().clone();
    sequence.neck_and_tail();
    assert_eq!(sequence.state().faces().len(), 52);
    let doc = beloch::document("crane.fold");
    let pattern = beloch::pattern(&doc).unwrap_or_else(|e| panic!("{e}"));
    let head = ida::new_crease_line(sequence.state(), &pattern);
    sequence.head(head);
    let tail = Sequence {
        start,
        steps: sequence.steps.split_off(from),
        to_model: sequence.to_model,
    };
    check_steps(&tail);
    let crane = tail.state().clone();
    let frame = beloch::frame(&doc, None).unwrap_or_else(|e| panic!("{e}"));
    beloch::matches(&crane, &frame).unwrap_or_else(|e| panic!("the crane: {e}"));
    crane
}

#[test]
fn the_bird_base_by_reverse_folds_is_belochs_frame_by_frame() {
    let bird = bird_base();
    let state = bird.state();
    assert_eq!(state.faces().len(), 16);
    // The legs b and d at (1, 1), the petals' points a and c past the
    // centre.
    for (corner, want) in [
        (B, [1.0, 1.0]),
        (D, [1.0, 1.0]),
        (A, [1.0 - SQRT2 / 2.0; 2]),
        (C, [1.0 - SQRT2 / 2.0; 2]),
    ] {
        let at = ida::vertex_image(state, corner);
        assert!(
            (at[0] - want[0]).abs() < 1e-12 && (at[1] - want[1]).abs() < 1e-12,
            "{corner:?} at {at:?}"
        );
    }
    // Six inside reverses, each unique: no step asked for an order.
    let reverses = bird.steps.iter().filter(|s| s.reverse.is_some()).count();
    assert_eq!(reverses, 6);
}

/// From the square: 16 steps, 60 faces, Beloch's crane.
#[test]
fn the_crane_from_the_square_is_belochs_crane() {
    let mut sequence = bird_base();
    let crane = crane(&mut sequence);
    assert_eq!(crane.faces().len(), 60);
}

/// The neck, tail and head on the bird base imported from Beloch's crease
/// pattern (Import CP, its frame's order replayed by witnesses): the same
/// crane.
#[test]
fn the_crane_neck_reverses_on_an_imported_bird_base() {
    let doc = beloch::document("bird-base-petal.fold");
    let imported = beloch::final_state(&doc).unwrap_or_else(|e| panic!("{e}"));
    let frame = beloch::frame(&doc, None).unwrap_or_else(|e| panic!("{e}"));
    let phi = beloch::matches(&imported, &frame).unwrap_or_else(|e| panic!("{e}"));
    let mut sequence = Sequence::new(imported, phi.inverse());
    let crane = crane(&mut sequence);
    assert_eq!(crane.faces().len(), 60);
}
