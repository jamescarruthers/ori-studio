//! What every landed vertex fold is checked for (plan D4, D15; research
//! §5.3): the full gate from scratch, a motion whose every leg places every
//! moving face, starting at the parent and ending at the landed state
//! exactly, and its crease pattern against Beloch's, up to the square's
//! symmetries.

#![allow(dead_code)]

pub mod cases;

use std::collections::{BTreeMap, BTreeSet};

use oristudio_fold::{
    CompletionLimits, CreaseKind, CreasePatternInput, FaceId, ImportKind, ImportTarget,
    ImportedPattern, Letter, StartSide, State, VertexFolded,
};

use crate::beloch;
use crate::support::{Point, assert_valid};

/// The motion's legs (plan D15): every leg places every moving face; the
/// first starts each where the parent had it, the last ends each where it
/// lands, and each leg starts where the one before ended.
pub fn assert_motion(parent: &State, folded: &VertexFolded) {
    let motion = &folded.report.motion;
    let landed = &folded.state;
    let moving: BTreeSet<FaceId> = folded
        .report
        .fold
        .blocks
        .iter()
        .flatten()
        .copied()
        .collect();
    assert!(!motion.legs.is_empty(), "no legs");
    for leg in &motion.legs {
        let named: BTreeSet<FaceId> = leg.groups.iter().flat_map(|g| g.faces.clone()).collect();
        assert_eq!(named, moving, "a leg leaves faces out");
    }
    let close = |a: [f64; 3], b: [f64; 3]| a.iter().zip(&b).all(|(x, y)| (x - y).abs() < 1e-9);
    for &face in &moving {
        let t = landed.isometry(face).unwrap_or_default();
        let lineage = landed
            .face(face)
            .and_then(|f| f.parent)
            .filter(|p| parent.face(*p).is_some())
            .unwrap_or(face);
        let before = parent.isometry(lineage).unwrap_or_default();
        let ring = landed
            .face(face)
            .map(|f| f.ring.clone())
            .unwrap_or_default();
        for v in ring {
            let sheet = landed.vertices()[v.0 as usize];
            let q = t.apply(sheet);
            let p = before.apply(sheet);
            let at = |leg: usize, end: bool| {
                let group = motion.legs[leg]
                    .groups
                    .iter()
                    .find(|g| g.faces.contains(&face))
                    .unwrap_or_else(|| unreachable!());
                group.place(q, if end { group.to } else { group.from })
            };
            assert!(
                close(at(0, false), [p[0], p[1], 0.0]),
                "face {face} starts at {:?}, not {p:?}",
                at(0, false)
            );
            let last = motion.legs.len() - 1;
            assert!(
                close(at(last, true), [q[0], q[1], 0.0]),
                "face {face} ends off"
            );
            for leg in 0..last {
                assert!(
                    close(at(leg, true), at(leg + 1, false)),
                    "face {face} jumps between legs {leg} and {}",
                    leg + 1
                );
            }
        }
    }
}

/// Every check on one landed vertex fold.
pub fn check(parent: &State, folded: &VertexFolded) {
    assert_valid(&folded.state);
    assert_motion(parent, folded);
    for &edge in &folded.report.fold.created {
        assert!(
            folded
                .state
                .crease(edge)
                .is_some_and(|c| c.kind.is_folded()),
            "new crease {edge} is not folded"
        );
    }
}

/// Whether the state is the only order its own crease pattern and letters
/// allow, through Import CP (plan D16): the state a step lands is then the
/// crease pattern's, whatever route folded it.
pub fn only_order_of_its_pattern(state: &State) -> bool {
    let Ok(pattern) = ImportedPattern::new(
        &CreasePatternInput::of_state(state),
        ImportTarget::Empty {
            start: StartSide::Front,
        },
    ) else {
        return false;
    };
    pattern
        .complete(&CompletionLimits::default())
        .is_ok_and(|c| c.is_unique())
}

/// A crease segment with its letter, ends rounded for comparison.
pub type Segment = (Letter, [i64; 2], [i64; 2]);

fn key(p: Point) -> [i64; 2] {
    [(p[0] * 1e6).round() as i64, (p[1] * 1e6).round() as i64]
}

/// Folded segments merged along their lines: maximal runs of one letter.
fn merged(segments: Vec<(Letter, Point, Point)>) -> BTreeSet<Segment> {
    let mut segments = segments;
    loop {
        let mut joined = None;
        'search: for i in 0..segments.len() {
            for j in i + 1..segments.len() {
                let (l1, a, b) = segments[i];
                let (l2, c, d) = segments[j];
                if l1 != l2 {
                    continue;
                }
                for (x, y, z, w) in [(a, b, c, d), (a, b, d, c), (b, a, c, d), (b, a, d, c)] {
                    // x–y and z–w meet at y = z, in line.
                    if key(y) != key(z) {
                        continue;
                    }
                    let u = [y[0] - x[0], y[1] - x[1]];
                    let v = [w[0] - z[0], w[1] - z[1]];
                    let cross = (u[0] * v[1] - u[1] * v[0]) / (u[0].hypot(u[1]) * v[0].hypot(v[1]));
                    if cross.abs() < 1e-9 && u[0] * v[0] + u[1] * v[1] > 0.0 {
                        joined = Some((i, j, (l1, x, w)));
                        break 'search;
                    }
                }
            }
        }
        let Some((i, j, segment)) = joined else {
            break;
        };
        segments[i] = segment;
        segments.remove(j);
    }
    segments
        .into_iter()
        .map(|(l, a, b)| {
            let (a, b) = (key(a), key(b));
            if a <= b { (l, a, b) } else { (l, b, a) }
        })
        .collect()
}

/// A state's folded creases on the sheet, merged.
pub fn folded_segments(state: &State) -> BTreeSet<Segment> {
    merged(
        state
            .creases()
            .iter()
            .filter_map(|c| {
                let CreaseKind::Folded(letter) = c.kind else {
                    return None;
                };
                let [a, b] = c.vertices.map(|v| state.vertices()[v.0 as usize]);
                Some((letter, a, b))
            })
            .collect(),
    )
}

/// A Beloch frame's folded creases on the paper, merged.
pub fn frame_segments(frame: &beloch::Frame) -> BTreeSet<Segment> {
    merged(
        frame
            .input
            .segments
            .iter()
            .filter_map(|s| match s.kind {
                ImportKind::Mountain => Some((Letter::Mountain, s.from, s.to)),
                ImportKind::Valley => Some((Letter::Valley, s.from, s.to)),
                _ => None,
            })
            .collect(),
    )
}

/// The square's eight symmetries, by name.
pub const SYMMETRIES: [&str; 8] = [
    "id",
    "flip x",
    "flip y",
    "half turn",
    "transpose",
    "quarter turn",
    "three quarters",
    "antitranspose",
];

fn symmetry(k: usize, p: [i64; 2]) -> [i64; 2] {
    let one = 1_000_000;
    let [x, y] = p;
    match k {
        0 => [x, y],
        1 => [one - x, y],
        2 => [x, one - y],
        3 => [one - x, one - y],
        4 => [y, x],
        5 => [one - y, x],
        6 => [y, one - x],
        _ => [one - y, one - x],
    }
}

/// The symmetries of the square that take `ours` onto `theirs`, letters
/// kept.
pub fn symmetries_between(
    ours: &BTreeSet<Segment>,
    theirs: &BTreeSet<Segment>,
) -> Vec<&'static str> {
    (0..8)
        .filter(|&k| {
            let moved: BTreeSet<Segment> = ours
                .iter()
                .map(|&(l, a, b)| {
                    let (a, b) = (symmetry(k, a), symmetry(k, b));
                    if a <= b { (l, a, b) } else { (l, b, a) }
                })
                .collect();
            moved == *theirs
        })
        .map(|k| SYMMETRIES[k])
        .collect()
}

/// The state's letters of its folded creases through each vertex the
/// segments meet at: (mountains, valleys).
pub fn letters_at(state: &State, at: Point) -> (usize, usize) {
    let mut counts = BTreeMap::new();
    for c in state.creases() {
        let CreaseKind::Folded(letter) = c.kind else {
            continue;
        };
        if c.vertices
            .iter()
            .any(|v| key(state.vertices()[v.0 as usize]) == key(at))
        {
            *counts.entry(letter).or_insert(0) += 1;
        }
    }
    (
        counts.get(&Letter::Mountain).copied().unwrap_or(0),
        counts.get(&Letter::Valley).copied().unwrap_or(0),
    )
}
