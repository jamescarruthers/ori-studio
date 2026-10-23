//! The flat fold's case sequence, pinned so that a seeded fold can be held to it.
//!
//! The Layer order dialog shows a chosen layer order by seeding Oriedita's own
//! search with it (`implementation-plans/layer-order-dialog.md`, row E1). The
//! promise that makes that safe is that **with no seeds nothing changes**: every
//! flat figure reaches the same solutions in the same order as before, press for
//! press of "Another solution".
//!
//! "Before" is a recording, not a second code path. The committed golden,
//! `tests/fixtures/oristudio-cp/flat-fold-case-sequences.json`, was written by
//! the unseeded entry before the seeded core existed, so a seeded session with
//! no seeds is compared against what the shipped fold did, not against itself.
//!
//! Regenerate it only after an intentional change to the flat search:
//!
//! ```sh
//! ORISTUDIO_UPDATE_GOLDEN=1 cargo test -p oristudio-cp --test folding_seeded
//! ```

use std::path::{Path, PathBuf};

use oristudio_cp::folding::{
    EstimationOrder, FoldingEstimate, FoldingEstimateSession, fold_another,
};
use oristudio_cp::geometry::{LineColor, LineSegment, Point};
use oristudio_cp::io::fold::import_fold_document;
use oristudio_cp::io::{cp, ori};
use serde::{Deserialize, Serialize};

/// Presses of "Another solution" after the first fold, at most. Enough to walk
/// every committed fixture to its end and through the wrap back to the first
/// solution.
const MAX_PRESSES: usize = 48;

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures")
}

fn golden_path() -> PathBuf {
    fixture_root().join("oristudio-cp/flat-fold-case-sequences.json")
}

fn segment(ax: f64, ay: f64, bx: f64, by: f64, color: LineColor) -> LineSegment {
    LineSegment::with_color(Point::new(ax, ay), Point::new(bx, by), color)
}

fn square_with(diagonals: &[(f64, f64, f64, f64, LineColor)]) -> Vec<LineSegment> {
    let mut segments = vec![
        segment(0.0, 0.0, 1.0, 0.0, LineColor::Black0),
        segment(1.0, 0.0, 1.0, 1.0, LineColor::Black0),
        segment(1.0, 1.0, 0.0, 1.0, LineColor::Black0),
        segment(0.0, 1.0, 0.0, 0.0, LineColor::Black0),
    ];
    segments.extend(
        diagonals
            .iter()
            .map(|&(ax, ay, bx, by, color)| segment(ax, ay, bx, by, color)),
    );
    segments
}

/// The folding colours of a file, as Edit hands them to the fold.
fn folding_lines(segments: Vec<LineSegment>) -> Vec<LineSegment> {
    segments
        .into_iter()
        .filter(|segment| segment.color.is_folding_line())
        .collect()
}

fn fold_file(relative: &str) -> Vec<LineSegment> {
    let path = fixture_root().join(relative);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let document: treemaker_fold::FoldDocument = serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("parse {}: {error}", path.display()));
    let model = import_fold_document(&document)
        .unwrap_or_else(|error| panic!("import {}: {error:?}", path.display()));
    folding_lines(model.line_segments)
}

fn ori_file(relative: &str) -> Vec<LineSegment> {
    let path = fixture_root().join(relative);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let document = ori::import_ori_json(&text)
        .unwrap_or_else(|error| panic!("import {}: {error:?}", path.display()));
    folding_lines(document.crease_pattern.line_segments)
}

fn cp_file(relative: &str) -> Vec<LineSegment> {
    let path = fixture_root().join(relative);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let model =
        cp::import_cp_str(&text).unwrap_or_else(|error| panic!("import {}: {error:?}", path.display()));
    folding_lines(model.line_segments)
}

/// Every flat fixture the kernel's fold tests draw from, plus the Flat-Folder
/// and Fold-sample crease patterns: single solutions, many solutions, a hole,
/// and two layer-order contradictions.
fn flat_fixtures() -> Vec<(&'static str, Vec<LineSegment>)> {
    vec![
        (
            "square_with_diagonal",
            square_with(&[(0.0, 0.0, 1.0, 1.0, LineColor::Red1)]),
        ),
        (
            "two_square_strip",
            vec![
                segment(0.0, 0.0, 10.0, 0.0, LineColor::Black0),
                segment(10.0, 0.0, 20.0, 0.0, LineColor::Black0),
                segment(20.0, 0.0, 20.0, 10.0, LineColor::Black0),
                segment(20.0, 10.0, 10.0, 10.0, LineColor::Black0),
                segment(10.0, 10.0, 0.0, 10.0, LineColor::Black0),
                segment(0.0, 10.0, 0.0, 0.0, LineColor::Black0),
                segment(10.0, 0.0, 10.0, 10.0, LineColor::Red1),
            ],
        ),
        (
            "quartered_square",
            square_with(&[
                (0.5, 0.5, 0.0, 0.0, LineColor::Red1),
                (0.5, 0.5, 1.0, 0.0, LineColor::Blue2),
                (0.5, 0.5, 1.0, 1.0, LineColor::Red1),
                (0.5, 0.5, 0.0, 1.0, LineColor::Blue2),
            ]),
        ),
        ("solution_sample_1", cp_file("oriedita/solution_sample_1.cp")),
        (
            "failing_global_flat_fold",
            ori_file("oriedita/failing_global_flat_fold.ori"),
        ),
        ("holed_sheet_spiral", ori_file("oriedita/holed_sheet_spiral.ori")),
        (
            "holed_frame_collinear",
            ori_file("oriedita/holed_frame_collinear.ori"),
        ),
        ("kabuto", fold_file("flat-folder/kabuto.fold")),
        ("bad_twist", fold_file("flat-folder/bad_twist.fold")),
        ("r069-s07", fold_file("flat-folder/r069-s07.fold")),
        ("r271-s03", fold_file("flat-folder/r271-s03.fold")),
        ("pleat-in-eighths", fold_file("fold-samples/pleat-in-eighths.fold")),
        ("preliminary-base", fold_file("fold-samples/preliminary-base.fold")),
        ("waterbomb-base", fold_file("fold-samples/waterbomb-base.fold")),
    ]
}

/// What the figure shows after one press: its case, the enumeration's state,
/// and the layer order it found, as a count and a digest of its relations.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Case {
    press: usize,
    case: usize,
    discovered: usize,
    another: bool,
    outcome: String,
    step: String,
    contradiction: Option<[usize; 2]>,
    relations: usize,
    digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Sequence {
    fixture: String,
    cases: Vec<Case>,
}

/// FNV-1a over the found order's relations, in the order the search reports
/// them (sorted by upper face, then lower).
fn hierarchy_digest(estimate: &FoldingEstimate) -> (usize, String) {
    let Some(overlap) = estimate.overlap.as_ref().filter(|overlap| overlap.found) else {
        return (0, "none".to_string());
    };
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for relation in &overlap.hierarchy.relations {
        for value in [relation.upper_face as u64, relation.lower_face as u64] {
            for byte in value.to_le_bytes() {
                hash ^= u64::from(byte);
                hash = hash.wrapping_mul(0x0100_0000_01b3);
            }
        }
    }
    (overlap.hierarchy.relations.len(), format!("{hash:016x}"))
}

fn case_of(press: usize, estimate: &FoldingEstimate) -> Case {
    let (relations, digest) = hierarchy_digest(estimate);
    Case {
        press,
        case: estimate.current_fold_case,
        discovered: estimate.discovered_fold_cases,
        another: estimate.find_another_overlap_valid,
        outcome: format!("{:?}", estimate.outcome),
        step: format!("{:?}", estimate.estimation_step),
        contradiction: estimate
            .contradiction
            .map(|contradiction| [contradiction.upper_face, contradiction.lower_face]),
        relations,
        digest,
    }
}

/// The figure's first fold (`Order5`), then "Another solution" until the
/// enumeration ends, and one press more: the wrap back to the first solution,
/// or the no-op of a figure with one.
fn case_sequence(mut session: FoldingEstimateSession) -> Vec<Case> {
    let first = session
        .folding_estimated(EstimationOrder::Order5)
        .expect("the first fold concludes");
    let mut cases = vec![case_of(0, &first)];
    let mut another = first.find_another_overlap_valid;
    for press in 1..=MAX_PRESSES {
        let estimate = fold_another(&mut session).expect("another solution");
        cases.push(case_of(press, &estimate));
        if !another {
            break;
        }
        another = estimate.find_another_overlap_valid;
    }
    cases
}

fn sequences(session_for: impl Fn(&[LineSegment]) -> FoldingEstimateSession) -> Vec<Sequence> {
    flat_fixtures()
        .into_iter()
        .map(|(name, segments)| Sequence {
            fixture: name.to_string(),
            cases: case_sequence(session_for(&segments)),
        })
        .collect()
}

fn committed_golden() -> Vec<Sequence> {
    let path = golden_path();
    let text = std::fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "missing golden {}: {error}. Regenerate with ORISTUDIO_UPDATE_GOLDEN=1.",
            path.display()
        )
    });
    serde_json::from_str(&text).expect("parse the golden")
}

fn assert_sequences_match(label: &str, actual: &[Sequence], expected: &[Sequence]) {
    assert_eq!(
        actual.iter().map(|s| &s.fixture).collect::<Vec<_>>(),
        expected.iter().map(|s| &s.fixture).collect::<Vec<_>>(),
        "{label}: the fixture list changed; regenerate the golden"
    );
    for (actual, expected) in actual.iter().zip(expected) {
        assert_eq!(
            actual.cases, expected.cases,
            "{label}: {} left the shipped case sequence",
            actual.fixture
        );
    }
}

/// The unseeded entry still walks every fixture exactly as it did when the
/// golden was written.
#[test]
fn the_unseeded_fold_keeps_the_committed_case_sequence() {
    let actual = sequences(|segments| FoldingEstimateSession::new(segments, 1));

    if std::env::var_os("ORISTUDIO_UPDATE_GOLDEN").is_some() {
        let path = golden_path();
        let text = format!(
            "{}\n",
            serde_json::to_string_pretty(&actual).expect("serialise the golden")
        );
        std::fs::write(&path, text).expect("write the golden");
        return;
    }

    assert_sequences_match("unseeded", &actual, &committed_golden());
}
