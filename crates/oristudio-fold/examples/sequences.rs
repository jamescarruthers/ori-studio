//! Native timings on real sequences (plan Phase 2), against D14's tiers:
//! what a step costs on the classic sequences and on Beloch's fixtures, where
//! `perf` measures random stacks.
//!
//! ```sh
//! cargo run -p oristudio-fold --release --example sequences
//! ```
//!
//! The states:
//!
//! - every state of the classic sequences (`tests/fixtures/classics/`), with
//!   the sequence's own next fold or precrease;
//! - the final frame of each Beloch fixture (`tests/fixtures/beloch/`, the
//!   oracle tests' copy) that replays: the file's crease pattern through
//!   Import CP (plan D16), the frame's own `faceOrders` as the stored order
//!   with each face named by its paper centroid. A valley fold along each of
//!   the state's crease lines, from either side, stands in for the next step:
//!   refolds, unfolds and folds along existing creases.
//!
//! Per state, the scene and the landmarks (tier 2: once per state, cached).
//! Per fold, its cross-section and depth choices (tier 2: once per line, side
//! and direction, which while a free line is dragged is once per pointer
//! move, so held to tier 1's 4 ms), and the fold itself through the
//! incremental gate (tier 3: 50 ms at 256 faces in wasm). Each time is the
//! median of [`REPEATS`] runs.

#[path = "../tests/paths/mod.rs"]
mod paths;

use std::hint::black_box;
use std::path::PathBuf;
use std::time::Instant;

use oristudio_fold::{
    CompletionLimits, CreaseKind, CreasePatternInput, Direction, ImportKind, ImportSegment,
    ImportSpace, ImportTarget, ImportedPattern, Letter, PlainFold, Side, StartSide, State,
    WitnessOrder,
};
use oristudio_geometry::{Line, convex};
use paths::{Op, classics};
use serde_json::Value;

type Point = [f64; 2];

const REPEATS: usize = 15;

fn median_ms<T>(mut run: impl FnMut() -> T) -> f64 {
    let mut times: Vec<f64> = (0..REPEATS)
        .map(|_| {
            let t = Instant::now();
            black_box(run());
            t.elapsed().as_secs_f64() * 1e3
        })
        .collect();
    times.sort_by(f64::total_cmp);
    times[times.len() / 2]
}

/// Timings over a group of states.
#[derive(Default)]
struct Row {
    states: usize,
    faces: usize,
    pairs: usize,
    scene: Vec<f64>,
    landmarks: Vec<f64>,
    section: Vec<f64>,
    depth: Vec<f64>,
    fold: Vec<f64>,
    landed: usize,
}

impl Row {
    fn state(&mut self, state: &State) {
        self.states += 1;
        self.faces = self.faces.max(state.faces().len());
        self.pairs = self.pairs.max(state.order().len());
        self.scene.push(median_ms(|| state.scene()));
        self.landmarks.push(median_ms(|| state.landmarks(&[])));
    }

    /// A fold or precrease of `state`, with its cross-section and, at the
    /// section's first flap, its depth choices.
    fn fold(&mut self, state: &State, op: &PlainFold, precrease: bool) {
        let section = state.cross_section(&op.line, op.side);
        self.section
            .push(median_ms(|| state.cross_section(&op.line, op.side)));
        if let Some(flap) = section.ok().and_then(|s| s.flaps.first().cloned()) {
            self.depth
                .push(median_ms(|| state.depth_choices(op, flap.witness)));
        }
        let landed = if precrease {
            state.precrease(op).is_ok()
        } else {
            state.fold(op).is_ok()
        };
        self.landed += usize::from(landed);
        self.fold.push(median_ms(|| {
            if precrease {
                state.precrease(op).is_ok()
            } else {
                state.fold(op).is_ok()
            }
        }));
    }

    fn print(&self, label: &str) {
        let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len().max(1) as f64;
        let max = |v: &[f64]| v.iter().copied().fold(0.0, f64::max);
        println!(
            "| {label} | {} | {} | {} | {:.3} ms | {:.3} ms | {:.3} / {:.3} ms | {:.3} / {:.3} ms | {:.3} / {:.3} ms ({} of {}) |",
            self.states,
            self.faces,
            self.pairs,
            max(&self.scene),
            max(&self.landmarks),
            mean(&self.section),
            max(&self.section),
            mean(&self.depth),
            max(&self.depth),
            mean(&self.fold),
            max(&self.fold),
            self.landed,
            self.fold.len(),
        );
    }
}

fn point(value: &Value) -> Option<Point> {
    Some([value.get(0)?.as_f64()?, value.get(1)?.as_f64()?])
}

fn points(value: &Value) -> Option<Vec<Point>> {
    value.as_array()?.iter().map(point).collect()
}

fn indices(value: &Value) -> Option<Vec<usize>> {
    value
        .as_array()?
        .iter()
        .map(|v| v.as_u64().map(|v| v as usize))
        .collect()
}

/// A table point taken back to the paper by Beloch's paper-to-table matrix
/// `[a, b, c, d, tx, ty]` (`x' = a x + b y + tx`, `y' = c x + d y + ty`).
fn to_paper(m: &[f64], p: Point) -> Point {
    let det = m[0] * m[3] - m[1] * m[2];
    let (x, y) = (p[0] - m[4], p[1] - m[5]);
    [(m[3] * x - m[1] * y) / det, (m[0] * y - m[2] * x) / det]
}

/// A Beloch fixture's final frame as a state: its crease pattern imported,
/// the frame's order replayed onto it.
fn beloch_state(document: &Value) -> Result<State, String> {
    let coords = points(&document["vertices_coords"]).ok_or("no vertices")?;
    let edges = document["edges_vertices"]
        .as_array()
        .ok_or("no edges")?
        .iter()
        .map(indices)
        .collect::<Option<Vec<_>>>()
        .ok_or("an edge is not two vertices")?;
    let assignments = document["edges_assignment"]
        .as_array()
        .ok_or("no assignments")?;
    let mut segments = Vec::with_capacity(edges.len());
    for (edge, assignment) in edges.iter().zip(assignments) {
        let kind = match assignment.as_str() {
            Some("B") => ImportKind::Border,
            Some("M") => ImportKind::Mountain,
            Some("V") => ImportKind::Valley,
            // A flat crease remembers no letter in FOLD; any will do.
            Some("F") => ImportKind::Unassigned {
                hint: Some(Letter::Valley),
            },
            Some("U") => ImportKind::Unassigned { hint: None },
            other => return Err(format!("an edge assigned {other:?}")),
        };
        let &[a, b] = edge.as_slice() else {
            return Err("an edge is not two vertices".into());
        };
        segments.push(ImportSegment {
            from: *coords.get(a).ok_or("a missing vertex")?,
            to: *coords.get(b).ok_or("a missing vertex")?,
            kind,
        });
    }
    let input = CreasePatternInput {
        space: ImportSpace::Sheet,
        segments,
    };
    let imported = ImportedPattern::new(
        &input,
        ImportTarget::Empty {
            start: StartSide::Front,
        },
    )
    .map_err(|e| e.to_string())?;

    let frame = document["file_frames"]
        .as_array()
        .and_then(|frames| frames.last())
        .ok_or("no frame")?;
    let table = points(&frame["vertices_coords"]).ok_or("no frame vertices")?;
    let rings = frame["faces_vertices"]
        .as_array()
        .ok_or("no frame faces")?
        .iter()
        .map(indices)
        .collect::<Option<Vec<_>>>()
        .ok_or("a face is not a vertex list")?;
    let matrices = frame["beloch:faces_matrix"]
        .as_array()
        .ok_or("no face matrices")?;
    let mut witnesses = Vec::with_capacity(rings.len());
    for (ring, matrix) in rings.iter().zip(matrices) {
        let m: Vec<f64> = matrix
            .as_array()
            .and_then(|m| m.iter().map(Value::as_f64).collect())
            .ok_or("a matrix is not six numbers")?;
        if m.len() != 6 {
            return Err("a matrix is not six numbers".into());
        }
        let paper: Vec<Point> = ring
            .iter()
            .map(|&v| table.get(v).map(|&p| to_paper(&m, p)))
            .collect::<Option<_>>()
            .ok_or("a face names a missing vertex")?;
        let centroid = convex::centroid(&convex::normalize(&paper)).ok_or("a face has no area")?;
        witnesses.push(imported.to_sheet(centroid));
    }
    let orders = frame["faceOrders"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .map(|t| {
            let [f, g, s] = [0, 1, 2].map(|k| t.get(k).and_then(Value::as_i64));
            Some((u32::try_from(f?).ok()?, u32::try_from(g?).ok()?, s? as i8))
        })
        .collect::<Option<Vec<_>>>()
        .ok_or("a face order is not three integers")?;
    let stored = WitnessOrder {
        faces: witnesses,
        orders,
    };
    imported
        .replay(&stored, &CompletionLimits::default())
        .map_err(|e| e.to_string())
}

/// The state's distinct crease lines, borders left out.
fn crease_lines(state: &State) -> Vec<Line> {
    let mut lines: Vec<Line> = Vec::new();
    for crease in state.creases() {
        if crease.kind == CreaseKind::Border {
            continue;
        }
        let Some(line) = state.crease_line(crease.id) else {
            continue;
        };
        let same = |l: &Line| {
            let along = (l.n[0] * line.n[0] + l.n[1] * line.n[1]).signum();
            (l.n[0] - along * line.n[0]).abs() < 1e-9
                && (l.n[1] - along * line.n[1]).abs() < 1e-9
                && (l.d - along * line.d).abs() < 1e-9
        };
        if !lines.iter().any(same) {
            lines.push(line);
        }
    }
    lines
}

fn main() {
    println!(
        "| Sequence | States | Faces | Pairs | Scene max | Landmarks max | Cross-section mean / max | Depth choices mean / max | Fold mean / max (landed of tried) |"
    );
    println!("|---|---|---|---|---|---|---|---|---|");
    for classic in classics() {
        let mut row = Row::default();
        for (state, op) in classic.path.iter().zip(&classic.ops) {
            row.state(state);
            match op {
                Op::Fold { fold } => row.fold(state, fold, false),
                Op::Precrease { fold } => row.fold(state, fold, true),
                Op::TurnOver => {}
            }
        }
        if let Some(last) = classic.path.last() {
            row.state(last);
        }
        row.print(&classic.name);
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/beloch");
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|entries| entries.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    files.retain(|p| p.extension().is_some_and(|x| x == "fold"));
    files.sort();
    let buckets = [(2, 8), (9, 16), (17, 32), (33, usize::MAX)];
    let mut rows: Vec<(Row, Vec<String>)> = buckets.iter().map(|_| Default::default()).collect();
    let mut skipped = Vec::new();
    for file in &files {
        let name = file
            .file_stem()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let replayed = std::fs::read_to_string(file)
            .map_err(|e| e.to_string())
            .and_then(|text| serde_json::from_str::<Value>(&text).map_err(|e| e.to_string()))
            .and_then(|document| beloch_state(&document));
        let state = match replayed {
            Ok(state) if state.faces().len() >= 2 => state,
            Ok(_) => continue,
            Err(e) => {
                skipped.push(format!("{name} ({e})"));
                continue;
            }
        };
        let faces = state.faces().len();
        let Some(k) = buckets
            .iter()
            .position(|&(lo, hi)| (lo..=hi).contains(&faces))
        else {
            continue;
        };
        let (row, names) = &mut rows[k];
        names.push(name);
        row.state(&state);
        for line in crease_lines(&state) {
            for side in [Side::Positive, Side::Negative] {
                row.fold(
                    &state,
                    &PlainFold::new(line, side, Direction::Valley),
                    false,
                );
            }
        }
    }
    for ((row, names), (lo, hi)) in rows.iter().zip(buckets) {
        if row.states == 0 {
            continue;
        }
        let label = match (names.as_slice(), hi) {
            ([one], _) => format!("Beloch {one}"),
            (_, usize::MAX) => format!("Beloch, {lo}+ faces"),
            _ => format!("Beloch, {lo}–{hi} faces"),
        };
        row.print(&label);
    }
    let replayed: usize = rows.iter().map(|(row, _)| row.states).sum();
    println!(
        "\nBeloch: {replayed} final frames replayed of {}; not replayed: {}",
        files.len(),
        if skipped.is_empty() {
            "none".to_string()
        } else {
            skipped.join("; ")
        }
    );
}
