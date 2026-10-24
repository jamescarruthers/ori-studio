//! The kernel's layer-order entry points (`implementation-plans/layer-order-dialog.md`,
//! row E2), held to what a host sees through [`CpSession`]: the same calls the
//! wasm bridge and the desktop commands make.
//!
//! **With no order given, nothing a host saves changes.** An Edit figure's
//! `.osf` entry is its kernel snapshot and its picture, so the unseeded
//! snapshot, render and paper scene of every file fixture are held to a
//! recording, `tests/fixtures/oristudio-cp/flat-figure-bytes.json`. It was
//! written before the entry points existed, so the comparison is against the
//! shipped kernel and not against itself.
//!
//! Regenerate it only after an intentional change to what an unseeded fold
//! answers:
//!
//! ```sh
//! ORISTUDIO_UPDATE_GOLDEN=1 cargo test -p oristudio-cp --test fold_with_order
//! ```

use std::path::{Path, PathBuf};

use oristudio_cp::folding::{
    EstimationOrder, FoldOutcome, FoldedFigureModel, FoldedFigureRenderOptions, FoldedFigureState,
};
use oristudio_cp::session::CpSession;
use serde::{Deserialize, Serialize};

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures")
}

fn bytes_golden_path() -> PathBuf {
    fixture_root().join("oristudio-cp/flat-figure-bytes.json")
}

/// The file fixtures a host can open: one answer, many, a hole, and the
/// layer-order contradictions. The web app's `.osf` gate reads the same list
/// (`apps/web/src/engine/oristudioCpFoldWithOrder.wasm.test.ts`).
const FILE_FIXTURES: &[(&str, &str)] = &[
    ("solution_sample_1", "oriedita/solution_sample_1.cp"),
    (
        "failing_global_flat_fold",
        "oriedita/failing_global_flat_fold.ori",
    ),
    ("holed_sheet_spiral", "oriedita/holed_sheet_spiral.ori"),
    (
        "holed_frame_collinear",
        "oriedita/holed_frame_collinear.ori",
    ),
    ("kabuto", "flat-folder/kabuto.fold"),
    ("bad_twist", "flat-folder/bad_twist.fold"),
    ("r069-s07", "flat-folder/r069-s07.fold"),
    ("r271-s03", "flat-folder/r271-s03.fold"),
    ("pleat-in-eighths", "fold-samples/pleat-in-eighths.fold"),
    ("preliminary-base", "fold-samples/preliminary-base.fold"),
    ("waterbomb-base", "fold-samples/waterbomb-base.fold"),
];

/// Open a fixture as a host opens a file: a new document in `session`.
fn open(session: &mut CpSession, relative: &str) -> u32 {
    let path = fixture_root().join(relative);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let loaded = match path.extension().and_then(|extension| extension.to_str()) {
        Some("cp") => session.load_cp(&text, ""),
        Some("ori") => session.load_ori(&text, false),
        Some("fold") => session.load_fold(&text, ""),
        other => panic!("{}: no loader for {other:?}", path.display()),
    };
    loaded.unwrap_or_else(|error| panic!("open {}: {error:?}", path.display()))
}

/// Every line of the document, as Edit's whole-sheet fold names them: the
/// selection the kernel narrows to its folding colours.
fn every_line(session: &CpSession, document: u32) -> Vec<usize> {
    let lines = session
        .document_summary(document)
        .expect("summary")
        .line_segments;
    (1..=lines).collect()
}

fn model(state: FoldedFigureState) -> FoldedFigureModel {
    FoldedFigureModel {
        state,
        ..FoldedFigureModel::default()
    }
}

/// A JSON encoding's length and FNV-1a digest: enough to say two encodings
/// are the same bytes, without committing every figure's wireframe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Bytes {
    bytes: usize,
    fnv1a64: String,
}

fn bytes_of(value: &impl Serialize) -> Bytes {
    let text = serde_json::to_string(value).expect("serialise");
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    Bytes {
        bytes: text.len(),
        fnv1a64: format!("{hash:016x}"),
    }
}

/// What an unseeded fold of one fixture answers a host, front and back: the
/// snapshot an `.osf` saves, the picture it saves beside it, and the paper
/// scene the Diagram and the export paint from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct FigureBytes {
    fixture: String,
    outcome: String,
    snapshot: Bytes,
    render_front: Bytes,
    render_back: Bytes,
    scene_front: Bytes,
    scene_back: Bytes,
}

fn figure_bytes(name: &str, relative: &str) -> FigureBytes {
    let mut session = CpSession::new();
    let document = open(&mut session, relative);
    let lines = every_line(&session, document);
    let folded = session
        .folded_figure_fold_selected(
            document,
            &lines,
            1,
            EstimationOrder::Order5,
            model(FoldedFigureState::Front0),
        )
        .unwrap_or_else(|error| panic!("{name}: fold: {error:?}"));
    let handle = folded.handle;
    let style = folded.snapshot.display_style;
    let render = |session: &mut CpSession, state| {
        session
            .folded_figure_set_model(handle, model(state))
            .expect("set model");
        let render = session
            .folded_figure_render_snapshot(
                handle,
                Some(style),
                FoldedFigureRenderOptions::default(),
            )
            .expect("render");
        let scene = session
            .folded_figure_paper_scene(handle, Some(document))
            .expect("scene");
        (bytes_of(&render), bytes_of(&scene))
    };
    let (render_back, scene_back) = render(&mut session, FoldedFigureState::Back1);
    let (render_front, scene_front) = render(&mut session, FoldedFigureState::Front0);
    FigureBytes {
        fixture: name.to_string(),
        outcome: format!("{:?}", folded.snapshot.outcome),
        snapshot: bytes_of(&folded.snapshot),
        render_front,
        render_back,
        scene_front,
        scene_back,
    }
}

/// An unseeded fold answers a host exactly what it did before the layer-order
/// entry points existed: the snapshot, both renders and both paper scenes of
/// every file fixture are the recorded bytes.
#[test]
fn an_unseeded_fold_answers_the_recorded_bytes() {
    let actual: Vec<FigureBytes> = FILE_FIXTURES
        .iter()
        .map(|(name, relative)| figure_bytes(name, relative))
        .collect();
    assert!(
        actual
            .iter()
            .any(|figure| figure.outcome == format!("{:?}", FoldOutcome::Solved)),
        "no fixture solved, so the scenes assert nothing"
    );

    if std::env::var_os("ORISTUDIO_UPDATE_GOLDEN").is_some() {
        let text = format!(
            "{}\n",
            serde_json::to_string_pretty(&actual).expect("serialise the golden")
        );
        std::fs::write(bytes_golden_path(), text).expect("write the golden");
        return;
    }

    let text = std::fs::read_to_string(bytes_golden_path())
        .expect("the golden; regenerate with ORISTUDIO_UPDATE_GOLDEN=1");
    let expected: Vec<FigureBytes> = serde_json::from_str(&text).expect("parse the golden");
    assert_eq!(
        actual
            .iter()
            .map(|figure| &figure.fixture)
            .collect::<Vec<_>>(),
        expected
            .iter()
            .map(|figure| &figure.fixture)
            .collect::<Vec<_>>(),
        "the fixture list changed; regenerate the golden"
    );
    for (actual, expected) in actual.iter().zip(&expected) {
        assert_eq!(
            actual, expected,
            "{}: an unseeded fold changed",
            actual.fixture
        );
    }
}
