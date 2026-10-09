//! The petal fold through the compound pipeline (plan Phase 11; research
//! §5.3), on the vertex spike's case 2: two petal folds on the preliminary
//! base are Beloch's bird base, each the only state, with its eight hinge
//! changes; and a petal fold whose creases are not precreased is refused,
//! naming the paper they would cross.

mod beloch;
mod support;
mod vertex;

use oristudio_fold::{
    CompoundRefused, FoldRefusal, PetalCrease, PetalFold, Seed, State, VertexChoices,
};
use vertex::cases::{self, PetalMarks};
use vertex::{check, folded_segments, frame_segments, symmetries_between};

fn refusal(state: &State, op: &PetalFold) -> FoldRefusal {
    match state.petal_fold(op, &VertexChoices::default()) {
        Err(CompoundRefused::Refused(refused)) => refused.refusal,
        Err(CompoundRefused::Broken(broken)) => panic!("broken {broken}"),
        Ok(_) => panic!("{op:?} landed"),
    }
}

/// Spike case 2: on the preliminary base (two squashes), the kite creases
/// and H precreased, a petal fold front and back is the bird base. Its
/// folded creases are Beloch's `bird-base-petal.fold` when folded in mirror
/// image, as the base is (the spike's route matches it under x ↦ 1 − x;
/// Beloch's frame folds no precreases, so the faces differ and the creases
/// compare); each petal fold is the only state, with research §5.3's eight
/// hinge changes and six blocks with what stays; and the bird base is the
/// only order its crease pattern and letters allow.
#[test]
fn two_petal_folds_make_belochs_bird_base() {
    let doc = beloch::document("bird-base-petal.fold");
    let frame = beloch::final_frame(&doc).unwrap_or_else(|e| panic!("{e}"));
    for mirror in [true, false] {
        let route = cases::bird_base(mirror);
        for (parent, folded) in &route.steps {
            check(parent, folded);
            let fold = &folded.report.fold;
            // H in the top layer and the four kite segments in the top two
            // fold again; the closed edges below H's ends unfold.
            assert!(fold.created.is_empty());
            assert_eq!((fold.refolded.len(), fold.unfolded.len()), (6, 2));
            assert_eq!(fold.blocks.len(), 5);
            assert_eq!(folded.report.vertices.len(), 2);
        }
        let bird = route.last();
        assert_eq!(bird.faces().len(), 24);
        let symmetries = symmetries_between(&folded_segments(bird), &frame_segments(&frame));
        let want = if mirror { "id" } else { "flip x" };
        assert!(
            symmetries.contains(&want),
            "mirror {mirror}: {symmetries:?}"
        );
        assert!(vertex::only_order_of_its_pattern(bird));
    }
}

/// The creases a petal fold folds must be there: without H precreased, the
/// top layer below it is one piece H crosses; without the kite creases, the
/// top layer has none to fold. Each refusal names the faces.
#[test]
fn a_petal_fold_needs_its_creases_precreased() {
    let marks: PetalMarks = cases::petal_marks(false);
    let base = cases::preliminary(false).last().clone();
    // Kites, no H.
    let kites = cases::kites(&base, &marks);
    let refused = refusal(&kites, &cases::petal_op(&kites, &marks));
    let FoldRefusal::PetalNotPrecreased { faces, missing } = &refused else {
        panic!("{refused:?}");
    };
    assert_eq!(*missing, PetalCrease::Line);
    assert!(!faces.is_empty());
    assert_eq!(refused.faces(), *faces);
    // H, no kites.
    let h = cases::precrease(&base, marks.ends[0], marks.ends[1], marks.t, Seed::All);
    assert!(matches!(
        refusal(&h, &cases::petal_op(&h, &marks)),
        FoldRefusal::PetalNotPrecreased {
            missing: PetalCrease::Kite,
            ..
        }
    ));
    // Through JSON, by code.
    let json = serde_json::to_value(&refused).unwrap_or_default();
    assert_eq!(json["code"], "petal_not_precreased");
    assert_eq!(json["missing"], "line");
}

/// The analysis names H's ends on the closed edges, the open corner the
/// kite creases meet at, and the two layers below H.
#[test]
fn the_analysis_finds_the_ends_the_corner_and_the_layers() {
    let route = cases::bird_base(false);
    let (front, _) = &route.steps[0];
    let marks = cases::petal_marks(false);
    let analysis = front
        .analyse_petal(&cases::petal_op(front, &marks))
        .unwrap_or_else(|e| panic!("{e}"));
    let close = |a: [f64; 2], b: [f64; 2]| (a[0] - b[0]).hypot(a[1] - b[1]) < 1e-9;
    assert!(
        analysis
            .ends
            .iter()
            .all(|&e| marks.ends.iter().any(|&m| close(e, m))),
        "{analysis:?}"
    );
    assert!(close(analysis.corner, marks.open));
    assert_eq!(analysis.top.len(), 4);
    assert_eq!(analysis.second.len(), 4);
}
