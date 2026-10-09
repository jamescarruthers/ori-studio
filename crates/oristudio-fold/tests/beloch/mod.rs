//! Beloch's fixtures (`tests/fixtures/beloch/` at the repository root, the
//! oracle tests' copy) as Fold states: a file's final frame through Import CP
//! (plan D16), the frame's own `faceOrders` as the stored order. The
//! `beloch_replay` test checks every fixture this way, and the `sequences`
//! example times the states.
//!
//! The crease pattern is the final frame's own, not the file's root. A
//! frame's vertices sit on the table, and each face's `beloch:faces_matrix`
//! maps the paper onto it, so its inverse takes the frame's vertices, edges
//! and faces back to the paper. The root is not the final state's pattern:
//! Beloch 0.3.0-dev wrote a precreased crease there with its letter, `V`,
//! where the frame has it flat, `F`; and a root can carry a crease no frame
//! has (a construction line marking a point), which splits faces the frame
//! keeps whole, so the centroid of a frame face can fall on it.

#![allow(dead_code)]

use std::path::PathBuf;

use oristudio_fold::{
    Broken, CompletionLimits, CreasePatternInput, ImportKind, ImportRefusal, ImportSegment,
    ImportSpace, ImportTarget, ImportedPattern, Letter, StartSide, State, WitnessOrder,
};
use oristudio_geometry::convex;
use serde_json::Value;

type Point = [f64; 2];

/// A Beloch matrix `[a, b, c, d, tx, ty]`: `x' = a x + b y + tx`,
/// `y' = c x + d y + ty`, paper to table.
pub type Matrix = [f64; 6];

/// A fixture file: its name and its JSON.
pub struct Fixture {
    pub name: String,
    pub document: Value,
}

/// Every `.fold` fixture, by name.
pub fn fixtures() -> Vec<Fixture> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/beloch");
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "fold"))
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|path| {
            let name = path
                .file_stem()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let text = std::fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            let document =
                serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            Fixture { name, document }
        })
        .collect()
}

/// A face of the final frame, on the paper.
pub struct FrameFace {
    /// Its ring on the paper, as the frame winds it.
    pub paper: Vec<Point>,
    /// Paper to table.
    pub matrix: Matrix,
}

/// A file's final frame, taken back to the paper.
pub struct FinalFrame {
    /// The frame's own crease pattern on the paper: its edges with its
    /// letters.
    pub input: CreasePatternInput,
    pub faces: Vec<FrameFace>,
    /// FOLD `faceOrders` over `faces`.
    pub orders: Vec<(u32, u32, i8)>,
}

/// Why a fixture's final frame does not replay.
#[derive(Debug)]
pub enum Refusal {
    /// Import CP refused the frame's crease pattern.
    Import(ImportRefusal),
    /// The frame's order, stored by witnesses, does not replay onto it.
    Broken(Broken),
}

impl Refusal {
    pub fn code(&self) -> String {
        match self {
            Refusal::Import(r) => r.code().to_string(),
            Refusal::Broken(b) => serde_json::to_value(b)
                .ok()
                .and_then(|v| v.get("broken").and_then(Value::as_str).map(str::to_owned))
                .unwrap_or_else(|| "broken".to_string()),
        }
    }
}

impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Refusal::Import(r) => write!(f, "{r}"),
            Refusal::Broken(b) => write!(f, "{b}"),
        }
    }
}

/// A frame replayed: the imported pattern, the state, and each frame face's
/// witness in sheet coordinates.
pub struct Replayed {
    pub imported: ImportedPattern,
    pub state: State,
    pub witnesses: Vec<Point>,
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

/// A table point taken back to the paper by a paper-to-table matrix.
pub fn to_paper(m: &Matrix, p: Point) -> Point {
    let det = m[0] * m[3] - m[1] * m[2];
    let (x, y) = (p[0] - m[4], p[1] - m[5]);
    [(m[3] * x - m[1] * y) / det, (m[0] * y - m[2] * x) / det]
}

/// A paper point on the table.
pub fn to_table(m: &Matrix, p: Point) -> Point {
    [
        m[0] * p[0] + m[1] * p[1] + m[4],
        m[2] * p[0] + m[3] * p[1] + m[5],
    ]
}

/// What a FOLD assignment is to Import CP. A flat crease remembers no letter
/// in FOLD; any will do. A join edge (`J`) is no crease: it only divides
/// faces, so it is a guide.
fn kind(assignment: &str) -> Result<ImportKind, String> {
    Ok(match assignment {
        "B" => ImportKind::Border,
        "M" => ImportKind::Mountain,
        "V" => ImportKind::Valley,
        "F" => ImportKind::Unassigned {
            hint: Some(Letter::Valley),
        },
        "U" => ImportKind::Unassigned { hint: None },
        "J" => ImportKind::Aux,
        other => return Err(format!("an edge assigned {other:?}")),
    })
}

/// The file's final frame on the paper (see the module docs).
pub fn final_frame(document: &Value) -> Result<FinalFrame, String> {
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
        .ok_or("no face matrices")?
        .iter()
        .map(|m| {
            let m: Vec<f64> = m
                .as_array()?
                .iter()
                .map(Value::as_f64)
                .collect::<Option<_>>()?;
            <[f64; 6]>::try_from(m).ok()
        })
        .collect::<Option<Vec<Matrix>>>()
        .ok_or("a matrix is not six numbers")?;
    if matrices.len() != rings.len() {
        return Err("a face has no matrix".into());
    }

    // Each vertex on the paper, through the first face that has it.
    let mut paper: Vec<Option<Point>> = vec![None; table.len()];
    let mut faces = Vec::with_capacity(rings.len());
    for (ring, matrix) in rings.iter().zip(&matrices) {
        let mut polygon = Vec::with_capacity(ring.len());
        for &v in ring {
            let p = to_paper(
                matrix,
                *table.get(v).ok_or("a face names a missing vertex")?,
            );
            paper[v].get_or_insert(p);
            polygon.push(p);
        }
        faces.push(FrameFace {
            paper: polygon,
            matrix: *matrix,
        });
    }

    let edges = frame["edges_vertices"]
        .as_array()
        .ok_or("no frame edges")?
        .iter()
        .map(indices)
        .collect::<Option<Vec<_>>>()
        .ok_or("an edge is not two vertices")?;
    let assignments = frame["edges_assignment"]
        .as_array()
        .ok_or("no frame assignments")?;
    if assignments.len() != edges.len() {
        return Err("an edge has no assignment".into());
    }
    let mut segments = Vec::with_capacity(edges.len());
    for (edge, assignment) in edges.iter().zip(assignments) {
        let &[a, b] = edge.as_slice() else {
            return Err("an edge is not two vertices".into());
        };
        let end = |v: usize| -> Result<Point, String> {
            paper
                .get(v)
                .copied()
                .flatten()
                .ok_or_else(|| format!("vertex {v} is on no face"))
        };
        segments.push(ImportSegment {
            from: end(a)?,
            to: end(b)?,
            kind: kind(assignment.as_str().ok_or("an assignment is not a string")?)?,
        });
    }

    let orders = frame["faceOrders"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .map(|t| {
            let [f, g, s] = [0, 1, 2].map(|k| t.get(k).and_then(Value::as_i64));
            Some((
                u32::try_from(f?).ok()?,
                u32::try_from(g?).ok()?,
                i8::try_from(s?).ok()?,
            ))
        })
        .collect::<Option<Vec<_>>>()
        .ok_or("a face order is not three integers")?;

    Ok(FinalFrame {
        input: CreasePatternInput {
            space: ImportSpace::Sheet,
            segments,
        },
        faces,
        orders,
    })
}

/// The frame through Import CP, its order stored by its faces' paper
/// centroids and replayed (plan D6, D16).
pub fn replay(frame: &FinalFrame) -> Result<Replayed, Refusal> {
    let imported = ImportedPattern::new(
        &frame.input,
        ImportTarget::Empty {
            start: StartSide::Front,
        },
    )
    .map_err(Refusal::Import)?;
    let witnesses: Vec<Point> = frame
        .faces
        .iter()
        .map(|face| {
            let centroid =
                convex::centroid(&convex::normalize(&face.paper)).unwrap_or([f64::NAN, f64::NAN]);
            imported.to_sheet(centroid)
        })
        .collect();
    let stored = WitnessOrder {
        faces: witnesses.clone(),
        orders: frame.orders.clone(),
    };
    let state = imported
        .replay(&stored, &CompletionLimits::default())
        .map_err(Refusal::Broken)?;
    Ok(Replayed {
        imported,
        state,
        witnesses,
    })
}

/// A fixture's final frame as a state, or why it has none.
pub fn final_state(document: &Value) -> Result<State, String> {
    let frame = final_frame(document)?;
    replay(&frame)
        .map(|r| r.state)
        .map_err(|refusal| refusal.to_string())
}
