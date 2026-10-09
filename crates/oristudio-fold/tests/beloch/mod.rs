//! Beloch's FOLD fixtures (`tests/fixtures/beloch/`, MIT, Christopher Mühl;
//! reference only, plan "Settled with the owner"), read for comparison:
//! a file's crease pattern as Import CP takes it, a frame's faces with their
//! paper-to-table matrices and its `faceOrders`, and a numbering-free match
//! of a frame against a state.
//!
//! Shared by the tests and `examples/sequences.rs` (through `#[path]`).

#![allow(dead_code)]

use std::path::PathBuf;

use oristudio_fold::{
    CompletionLimits, CreasePatternInput, ImportKind, ImportSegment, ImportSpace, ImportTarget,
    ImportedPattern, Isometry, Letter, StartSide, State, WitnessOrder,
};
use oristudio_geometry::convex;
use serde_json::Value;

type Point = [f64; 2];

/// The fixtures' directory.
pub fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/beloch")
}

/// A fixture file, parsed.
pub fn document(name: &str) -> Value {
    let path = dir().join(name);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name}: {e}"))
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

/// A file's crease pattern (its top-level, final one) as Import CP takes it:
/// FOLD `F` is a flat crease, which remembers no letter there, so any will
/// do.
pub fn pattern(document: &Value) -> Result<CreasePatternInput, String> {
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
    Ok(CreasePatternInput {
        space: ImportSpace::Sheet,
        segments,
    })
}

/// One face of a frame: its polygon in paper coordinates and its
/// paper-to-table matrix as an isometry.
pub struct FrameFace {
    pub paper: Vec<Point>,
    pub matrix: Isometry,
}

/// A frame: its faces and its `faceOrders` over them.
pub struct Frame {
    pub faces: Vec<FrameFace>,
    pub orders: Vec<(u32, u32, i8)>,
}

impl Frame {
    /// The frame's faces' paper centroids: their witnesses.
    pub fn witnesses(&self) -> Vec<Point> {
        self.faces
            .iter()
            .filter_map(|f| convex::centroid(&convex::normalize(&f.paper)))
            .collect()
    }

    /// Its order with each face named by its paper centroid.
    pub fn stored_order(&self) -> WitnessOrder {
        WitnessOrder {
            faces: self.witnesses(),
            orders: self.orders.clone(),
        }
    }
}

/// Frame `k` of a file; the last for `None`.
pub fn frame(document: &Value, k: Option<usize>) -> Result<Frame, String> {
    let frames = document["file_frames"].as_array().ok_or("no frames")?;
    let frame = match k {
        Some(k) => frames.get(k),
        None => frames.last(),
    }
    .ok_or("no such frame")?;
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
    let mut faces = Vec::with_capacity(rings.len());
    for (ring, matrix) in rings.iter().zip(matrices) {
        let m: Vec<f64> = matrix
            .as_array()
            .and_then(|m| m.iter().map(Value::as_f64).collect())
            .ok_or("a matrix is not six numbers")?;
        let &[a, b, c, d, tx, ty] = m.as_slice() else {
            return Err("a matrix is not six numbers".into());
        };
        // Beloch's `[a, b, c, d, tx, ty]`: x' = a x + b y + tx,
        // y' = c x + d y + ty.
        let matrix = Isometry([a, b, tx, c, d, ty]);
        let back = matrix.inverse();
        let paper = ring
            .iter()
            .map(|&v| table.get(v).map(|&p| back.apply(p)))
            .collect::<Option<Vec<_>>>()
            .ok_or("a face names a missing vertex")?;
        faces.push(FrameFace { paper, matrix });
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
    Ok(Frame { faces, orders })
}

/// A file's final frame as a state: its crease pattern imported into an
/// empty sequence, the frame's own order replayed onto it.
pub fn final_state(document: &Value) -> Result<State, String> {
    let imported = ImportedPattern::new(
        &pattern(document)?,
        ImportTarget::Empty {
            start: StartSide::Front,
        },
    )
    .map_err(|e| e.to_string())?;
    let frame = frame(document, None)?;
    let stored = WitnessOrder {
        faces: frame
            .witnesses()
            .into_iter()
            .map(|p| imported.to_sheet(p))
            .collect(),
        orders: frame.orders.clone(),
    };
    imported
        .replay(&stored, &CompletionLimits::default())
        .map_err(|e| e.to_string())
}

/// Whether `state` is the frame's flat folded state, numbering-free: every
/// frame face's paper centroid lies in its own face of the state; the
/// state's face isometries are the frame's matrices after one isometry
/// (`table = Φ ∘ model`, the same for every face); and the frame's
/// `faceOrders`, read through the witnesses, are exactly the state's order.
/// Returns Φ.
pub fn matches(state: &State, frame: &Frame) -> Result<Isometry, String> {
    if state.faces().len() != frame.faces.len() {
        return Err(format!(
            "{} faces, the frame has {}",
            state.faces().len(),
            frame.faces.len()
        ));
    }
    let witnesses = frame.witnesses();
    let mut faces = Vec::with_capacity(witnesses.len());
    for (i, &w) in witnesses.iter().enumerate() {
        let face = state
            .face_at(w)
            .ok_or_else(|| format!("frame face {i}'s centroid {w:?} is in no face"))?;
        if faces.contains(&face) {
            return Err(format!("frame face {i} shares face {face}"));
        }
        faces.push(face);
    }
    let mut phi: Option<Isometry> = None;
    for (i, (face, frame_face)) in faces.iter().zip(&frame.faces).enumerate() {
        let t = state
            .isometry(*face)
            .ok_or_else(|| format!("no isometry for {face}"))?;
        let this = frame_face.matrix.after(&t.inverse());
        match phi {
            None => phi = Some(this),
            Some(p) if p.0.iter().zip(&this.0).all(|(a, b)| (a - b).abs() < 1e-9) => {}
            Some(p) => {
                return Err(format!(
                    "frame face {i} ({face}) sits elsewhere: {:?} against {:?}",
                    this.0, p.0
                ));
            }
        }
    }
    let pairs = frame
        .stored_order()
        .resolve(|p| state.face_at(p), |f| state.front_up(f))
        .map_err(|e| e.to_string())?;
    for [upper, lower] in &pairs {
        if state.above(*upper, *lower) != Some(true) {
            return Err(format!(
                "the frame puts {upper} above {lower}; the state has {:?}",
                state.above(*upper, *lower)
            ));
        }
    }
    if pairs.len() != state.order().len() {
        return Err(format!(
            "the frame orders {} pairs, the state {}",
            pairs.len(),
            state.order().len()
        ));
    }
    phi.ok_or_else(|| "no faces".to_string())
}
