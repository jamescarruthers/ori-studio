//! One sheet at a time: `analyze_sheet` frames, splits, merges and probes a
//! sheet the caller found — its outline and the lines it holds — as
//! `analyze` does for each component it finds itself.

mod common;

use oristudio_precrease::fixture_io::load_path;
use oristudio_precrease::{
    Component, PrecreaseError, RefusalReason, SheetAnalysis, Warning, analyze, analyze_sheet,
    outline_component,
};

struct Cp {
    segments: Vec<f64>,
    colors: Vec<i32>,
}

impl Cp {
    fn new() -> Self {
        Self {
            segments: Vec::new(),
            colors: Vec::new(),
        }
    }

    fn seg(&mut self, color: i32, a: [f64; 2], b: [f64; 2]) -> u32 {
        self.segments.extend_from_slice(&[a[0], a[1], b[0], b[1]]);
        self.colors.push(color);
        self.colors.len() as u32 - 1
    }

    fn polygon_border(&mut self, corners: &[[f64; 2]]) {
        for i in 0..corners.len() {
            self.seg(0, corners[i], corners[(i + 1) % corners.len()]);
        }
    }

    /// The lines `ids` as `analyze_sheet` takes them: coordinates, colours and
    /// each one's number here.
    fn subset(&self, ids: &[u32]) -> (Vec<f64>, Vec<i32>, Vec<u32>) {
        let mut segments = Vec::with_capacity(ids.len() * 4);
        let mut colors = Vec::with_capacity(ids.len());
        for &id in ids {
            let at = id as usize * 4;
            segments.extend_from_slice(&self.segments[at..at + 4]);
            colors.push(self.colors[id as usize]);
        }
        (segments, colors, ids.to_vec())
    }

    fn sheet(&self, outline: &[[f64; 2]], ids: &[u32]) -> SheetAnalysis {
        let (segments, colors, indices) = self.subset(ids);
        analyze_sheet(7, outline, &segments, &colors, &indices).expect("one sheet")
    }
}

const SQUARE: [[f64; 2]; 4] = [[0.0, 0.0], [400.0, 0.0], [400.0, 400.0], [0.0, 400.0]];

/// Every line of a component `analyze` found, in the document's numbering.
fn lines_of(component: &Component) -> Vec<u32> {
    let mut ids: Vec<u32> = component
        .border_segment_indices
        .iter()
        .chain(&component.segment_indices)
        .chain(&component.aux_segment_indices)
        .copied()
        .collect();
    ids.sort_unstable();
    ids
}

/// `analyze`'s components, each rebuilt by `analyze_sheet` from its outline and
/// its own lines, must come out the same.
fn assert_same_per_sheet(name: &str, segments: &[f64], colors: &[i32]) {
    let whole = analyze(segments, colors, Some(common::ORIEDITA_PAPER)).expect("analysis");
    let cp = Cp {
        segments: segments.to_vec(),
        colors: colors.to_vec(),
    };
    let mut framed = 0;
    for component in whole
        .components
        .iter()
        .filter(|c| c.frame.is_some() && !c.is_fallback)
    {
        framed += 1;
        let (subset, subset_colors, indices) = cp.subset(&lines_of(component));
        let alone = analyze_sheet(
            component.id,
            &component.outline,
            &subset,
            &subset_colors,
            &indices,
        )
        .expect("one sheet");
        let mut rebuilt = alone.components.into_iter().next().expect("the sheet");
        // The order `analyze` met the border segments in, which no caller reads.
        let mut border = component.border_segment_indices.clone();
        border.sort_unstable();
        rebuilt.border_segment_indices.sort_unstable();
        assert_eq!(
            rebuilt.border_segment_indices, border,
            "{name} #{}",
            component.id
        );
        rebuilt.border_segment_indices = component.border_segment_indices.clone();
        assert_eq!(&rebuilt, component, "{name} #{}", component.id);
        assert!(
            alone.unassigned_segments.is_empty(),
            "{name} #{}",
            component.id
        );
    }
    assert!(framed > 0, "{name}: no framed sheet to compare");
}

#[test]
fn every_fixture_sheet_comes_out_the_same_one_at_a_time() {
    let dir = common::fixture_dir();
    let mut checked = 0;
    for entry in std::fs::read_dir(&dir).expect("fixtures") {
        let path = entry.expect("fixture").path();
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(extension, "fold" | "cp") {
            continue;
        }
        let cp = load_path(&path, None).unwrap_or_else(|e| panic!("{e}"));
        assert_same_per_sheet(&path.display().to_string(), &cp.segments, &cp.colors);
        checked += 1;
    }
    assert!(checked >= 10, "only {checked} fixtures");
}

#[test]
fn the_iguana_canvas_comes_out_the_same_one_sheet_at_a_time() {
    // 31 sheets, 16 of them turned 45°.
    let cp = load_path(
        &common::repo_root().join("tests/fixtures/simulation/iguana_24.osf"),
        Some(1),
    )
    .unwrap_or_else(|e| panic!("{e}"));
    assert_same_per_sheet("iguana_24", &cp.segments, &cp.colors);
}

#[test]
fn a_border_wall_inside_the_sheet_neither_splits_nor_refuses_it() {
    // The top and bottom sides split where the wall meets them.
    let mut cp = Cp::new();
    cp.polygon_border(&[
        [0.0, 0.0],
        [200.0, 0.0],
        [400.0, 0.0],
        [400.0, 400.0],
        [200.0, 400.0],
        [0.0, 400.0],
    ]);
    let wall = cp.seg(0, [200.0, 0.0], [200.0, 400.0]);
    let fold = cp.seg(1, [0.0, 200.0], [400.0, 200.0]);
    // `analyze` chains the wall into the border and refuses the whole sheet.
    let whole = analyze(&cp.segments, &cp.colors, None).expect("analysis");
    assert!(
        whole
            .components
            .iter()
            .all(|c| matches!(c.refused, Some(RefusalReason::NonSimpleOutline { .. }))),
        "{:?}",
        whole.components
    );

    let alone = cp.sheet(&SQUARE, &[0, 1, 2, 3, 4, 5, wall, fold]);
    let sheet = &alone.components[0];
    assert_eq!(sheet.id, 7);
    assert!(sheet.frame.is_some() && sheet.refused.is_none());
    assert_eq!(sheet.border_segment_indices, vec![0, 1, 2, 3, 4, 5, wall]);
    assert_eq!(sheet.segment_indices, vec![fold]);
    assert_eq!(sheet.merged_lines.len(), 1);
    assert!(sheet.exactness.is_some());
    assert!(alone.warnings.is_empty(), "{:?}", alone.warnings);
}

#[test]
fn a_crease_that_leaves_the_paper_is_unassigned() {
    let mut cp = Cp::new();
    cp.polygon_border(&SQUARE);
    let inside = cp.seg(1, [0.0, 0.0], [400.0, 400.0]);
    // Its midpoint is on the paper, so a sheet index places it here.
    let leaving = cp.seg(2, [300.0, 200.0], [500.0, 200.0]);
    let guide_off = cp.seg(3, [300.0, 100.0], [500.0, 100.0]);
    let alone = cp.sheet(&SQUARE, &[0, 1, 2, 3, inside, leaving, guide_off]);
    let sheet = &alone.components[0];
    assert_eq!(sheet.segment_indices, vec![inside]);
    assert!(sheet.aux_segment_indices.is_empty());
    assert_eq!(alone.unassigned_segments, vec![leaving]);
    assert_eq!(
        alone.warnings,
        vec![Warning::UnassignedSegments { count: 1 }]
    );
}

#[test]
fn a_side_split_by_a_vertex_is_still_one_side() {
    let mut cp = Cp::new();
    cp.polygon_border(&SQUARE);
    let fold = cp.seg(1, [0.0, 0.0], [400.0, 400.0]);
    let split = [
        [0.0, 0.0],
        [150.0, 0.0],
        [400.0, 0.0],
        [400.0, 400.0],
        [0.0, 400.0],
    ];
    let alone = cp.sheet(&split, &[0, 1, 2, 3, fold]);
    let sheet = &alone.components[0];
    let frame = sheet.frame.expect("a rectangle");
    assert_eq!(frame.width, 400.0);
    assert_eq!(frame.height, 400.0);
    // The outline is kept as given: it is what the sheet is matched by.
    assert_eq!(sheet.outline, split.to_vec());
}

#[test]
fn a_refused_outline_keeps_its_creases() {
    let l_shape = [
        [0.0, 0.0],
        [400.0, 0.0],
        [400.0, 200.0],
        [200.0, 200.0],
        [200.0, 400.0],
        [0.0, 400.0],
    ];
    let mut cp = Cp::new();
    cp.polygon_border(&l_shape);
    let fold = cp.seg(1, [0.0, 0.0], [200.0, 200.0]);
    let guide = cp.seg(3, [0.0, 100.0], [100.0, 100.0]);
    let alone = cp.sheet(&l_shape, &[0, 1, 2, 3, 4, 5, fold, guide]);
    let sheet = &alone.components[0];
    assert!(sheet.frame.is_none() && sheet.exactness.is_none());
    assert!(matches!(
        sheet.refused,
        Some(RefusalReason::NonRectangular { .. })
    ));
    assert_eq!(sheet.segment_indices, vec![fold]);
    // Aux lines are only ever drawn in a frame.
    assert!(sheet.aux_segment_indices.is_empty());
    assert!(alone.unassigned_segments.is_empty());
}

#[test]
fn an_outline_alone_is_framed_or_refused() {
    let square = outline_component(3, &SQUARE);
    assert_eq!(square.id, 3);
    assert!(square.frame.is_some() && square.rf_rect.is_some() && square.affines.is_some());
    assert!(square.segment_indices.is_empty() && square.merged_lines.is_empty());
    assert!(square.exactness.is_none());

    let triangle = outline_component(4, &[[0.0, 0.0], [400.0, 0.0], [0.0, 400.0]]);
    assert!(triangle.frame.is_none());
    assert!(matches!(
        triangle.refused,
        Some(RefusalReason::NonRectangular { .. })
    ));
}

#[test]
fn indices_must_match_the_segments() {
    let error = analyze_sheet(0, &SQUARE, &[0.0, 0.0, 1.0, 1.0], &[1], &[]).expect_err("refused");
    assert_eq!(
        error,
        PrecreaseError::IndexCountMismatch {
            segments: 1,
            indices: 0
        }
    );
}
