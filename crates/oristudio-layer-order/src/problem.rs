//! The layer-order constraint problem of a folded view, in the facewise model
//! of Akitaya, Demaine & Ku, "Computing Flat-Folded States" (OSME 2024;
//! research §2.1, r1-theory §3), re-derived here from the face images:
//!
//! - **Variables:** the face pairs whose images overlap by more than [`TOL`]
//!   (separating-axis penetration).
//! - **Taco-taco:** two folded creases along one line, with all four faces on
//!   one side: the two pairs nest or stack, never interleave.
//! - **Taco-tortilla:** a folded crease through a face's interior, or along
//!   a flat crease whose face on the taco's side is that face: the face is not
//!   between the crease's two faces.
//! - **Tortilla-tortilla:** a flat crease through a face's interior: the face
//!   lies on one side of both its faces; two flat creases along one line: the
//!   two faces on each side are stacked the same way.
//! - **Transitivity** is not listed: it is derived from the cells of the
//!   [`Overlay`] (three faces sharing a cell are not cyclic), as Flat-Folder's
//!   search derives it from its own cells.
//!
//! Each constraint is stored once, as the face tuple Flat-Folder's
//! `constraints.js` uses for its type, so a search adapter passes it on as it
//! is; [`Buckets`] lists, per variable, the constraints that involve it.
//!
//! # Ambiguity
//!
//! Overlap is decided at one tolerance, but by three tests: penetration for
//! variables, carving for cells, and edge geometry for constraints. Where they
//! disagree about a pair, the state has an overlap within the tolerance band,
//! and the pair is reported as an [`Ambiguity`] rather than resolved one way.
//! A constraint that needs a non-overlapping pair is left out; a search must
//! refuse a problem with ambiguities (a cell pair that is no variable would
//! be a transitivity triple over a missing variable).

use std::collections::{BTreeMap, BTreeSet};

use oristudio_geometry::convex;
use oristudio_geometry::tol::TOL;
use serde::{Deserialize, Serialize};

use crate::order::{FacePair, LayerOrder};
use crate::overlay::Overlay;
use crate::table::PairTable;
use crate::view::{EdgeKind, FaceId, FoldedView};

/// The three constraint families listed per variable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConstraintKind {
    TacoTaco,
    TacoTortilla,
    TortillaTortilla,
}

/// One constraint, as Flat-Folder's face tuple for its type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Constraint {
    /// `[a, b, c, d]`: the folded creases a–b and c–d run along one line with
    /// all four faces on one side, so the pairs {a, b} and {c, d} nest or
    /// stack. Pairs, in Flat-Folder's order: (a, b) (c, d) (c, b) (a, d)
    /// (a, c) (b, d).
    TacoTaco([FaceId; 4]),
    /// `[a, b, c]`: c is not between the faces a and b of a folded crease.
    /// Pairs: (a, c) (c, b).
    TacoTortilla([FaceId; 3]),
    /// `[a, b, c, d]`: a lies above c iff b lies above d, for the faces a, b
    /// of a flat crease and c, d on their sides (c = d for one face the crease
    /// passes through). Pairs: (a, c) (b, d).
    TortillaTortilla([FaceId; 4]),
}

impl Constraint {
    pub fn kind(&self) -> ConstraintKind {
        match self {
            Constraint::TacoTaco(_) => ConstraintKind::TacoTaco,
            Constraint::TacoTortilla(_) => ConstraintKind::TacoTortilla,
            Constraint::TortillaTortilla(_) => ConstraintKind::TortillaTortilla,
        }
    }

    /// The face tuple.
    pub fn faces(&self) -> &[FaceId] {
        match self {
            Constraint::TacoTaco(f) | Constraint::TortillaTortilla(f) => f,
            Constraint::TacoTortilla(f) => f,
        }
    }

    /// The pairs the constraint relates, in Flat-Folder's order for its type
    /// (see each variant), each `[first, second]`.
    pub fn ordered_pairs(&self) -> Vec<[FaceId; 2]> {
        match *self {
            Constraint::TacoTaco([a, b, c, d]) => {
                vec![[a, b], [c, d], [c, b], [a, d], [a, c], [b, d]]
            }
            Constraint::TacoTortilla([a, b, c]) => vec![[a, c], [c, b]],
            Constraint::TortillaTortilla([a, b, c, d]) => vec![[a, c], [b, d]],
        }
    }

    /// Whether the order satisfies the constraint; `None` when a pair it
    /// needs is absent or undetermined.
    pub fn holds(&self, order: &LayerOrder) -> Option<bool> {
        match *self {
            Constraint::TacoTaco(faces) => {
                let mut rank = [0usize; 4];
                for i in 0..4 {
                    for j in 0..4 {
                        if i != j && order.above(faces[i], faces[j])? {
                            rank[i] += 1;
                        }
                    }
                }
                Some(taco_taco_holds(rank))
            }
            Constraint::TacoTortilla([a, b, c]) => Some(order.above(c, a)? == order.above(c, b)?),
            Constraint::TortillaTortilla([a, b, c, d]) => {
                Some(order.above(a, c)? == order.above(b, d)?)
            }
        }
    }

    /// One form per constraint: the least of the tuples that state it.
    fn canonical(self) -> Constraint {
        match self {
            Constraint::TacoTaco([a, b, c, d]) => {
                let (ab, cd) = (sorted2(a, b), sorted2(c, d));
                let [x, y] = if ab <= cd { [ab, cd] } else { [cd, ab] };
                Constraint::TacoTaco([x[0], x[1], y[0], y[1]])
            }
            Constraint::TacoTortilla([a, b, c]) => {
                let [a, b] = sorted2(a, b);
                Constraint::TacoTortilla([a, b, c])
            }
            Constraint::TortillaTortilla([a, b, c, d]) => {
                let forms = [[a, b, c, d], [b, a, d, c], [c, d, a, b], [d, c, b, a]];
                let least = forms.into_iter().min().unwrap_or([a, b, c, d]);
                Constraint::TortillaTortilla(least)
            }
        }
    }
}

/// Taco-taco from the faces' ranks (how many of the other three each lies
/// above): the four must be stacked (ranks 0..3, which for four faces is
/// exactly acyclic) with {a, b} and {c, d} not interleaved. This is
/// Flat-Folder's table of 16 valid assignments.
fn taco_taco_holds(rank: [usize; 4]) -> bool {
    let mut seen = [false; 4];
    for r in rank {
        if r > 3 || seen[r] {
            return false;
        }
        seen[r] = true;
    }
    let (lo1, hi1) = (rank[0].min(rank[1]), rank[0].max(rank[1]));
    let (lo2, hi2) = (rank[2].min(rank[3]), rank[2].max(rank[3]));
    !((lo1 < lo2 && lo2 < hi1 && hi1 < hi2) || (lo2 < lo1 && lo1 < hi2 && hi2 < hi1))
}

fn sorted2(a: FaceId, b: FaceId) -> [FaceId; 2] {
    if a <= b { [a, b] } else { [b, a] }
}

/// The constraints that involve one variable, as indices into
/// [`ConstraintProblem::constraints`], ascending.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Buckets {
    pub taco_taco: Vec<usize>,
    pub taco_tortilla: Vec<usize>,
    pub tortilla_tortilla: Vec<usize>,
}

impl Buckets {
    pub fn get(&self, kind: ConstraintKind) -> &[usize] {
        match kind {
            ConstraintKind::TacoTaco => &self.taco_taco,
            ConstraintKind::TacoTortilla => &self.taco_tortilla,
            ConstraintKind::TortillaTortilla => &self.tortilla_tortilla,
        }
    }

    fn push(&mut self, kind: ConstraintKind, constraint: usize) {
        match kind {
            ConstraintKind::TacoTaco => self.taco_taco.push(constraint),
            ConstraintKind::TacoTortilla => self.taco_tortilla.push(constraint),
            ConstraintKind::TortillaTortilla => self.tortilla_tortilla.push(constraint),
        }
    }
}

/// A pair the tolerance cannot decide (see the module docs).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct Ambiguity {
    pub pair: FacePair,
    pub cause: AmbiguityCause,
}

/// Which two tests disagree about an [`Ambiguity`]'s pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AmbiguityCause {
    /// The faces share a cell but overlap by at most [`TOL`].
    SharedCell,
    /// The faces overlap by more than [`TOL`] but share no cell.
    NoSharedCell,
    /// A folded edge joins the faces, which overlap by at most [`TOL`].
    FoldedEdge { edge: usize },
    /// The edges call for this constraint, which needs the pair, and the
    /// faces overlap by at most [`TOL`]. The constraint is left out.
    Constraint(Constraint),
}

/// Variables, constraints and cells of one view.
#[derive(Debug, Clone, PartialEq)]
pub struct ConstraintProblem {
    /// The view's faces, in its order: the positions the overlay records.
    faces: Vec<FaceId>,
    variables: Vec<FacePair>,
    variable_index: BTreeMap<FacePair, usize>,
    constraints: Vec<Constraint>,
    buckets: Vec<Buckets>,
    overlay: Overlay,
    ambiguities: Vec<Ambiguity>,
}

/// What a build reuses from the previous problem.
#[derive(Default)]
struct Kept {
    variables: BTreeSet<FacePair>,
    constraints: BTreeSet<Constraint>,
    dropped: BTreeSet<(Constraint, FacePair)>,
}

impl ConstraintProblem {
    /// Build everything from the view.
    pub fn build(view: &FoldedView) -> ConstraintProblem {
        let mut kept = Kept::default();
        let n = view.faces().len();
        for i in 0..n {
            for j in i + 1..n {
                if let Some(pair) = variable(view, i, j) {
                    kept.variables.insert(pair);
                }
            }
        }
        let edges = view.edges().len();
        for e in 0..edges {
            for h in 0..n {
                generated(edge_face(view, e, h), &mut kept);
            }
            for e2 in e + 1..edges {
                generated(edge_edge(view, e, e2), &mut kept);
            }
        }
        ConstraintProblem::assemble(view, kept)
    }

    /// The problem of `view`, a later state of this problem's view, reusing
    /// everything that involves only untouched faces.
    ///
    /// A face is untouched when its image, its orientation and every edge it
    /// shares with another untouched face are unchanged. Faces new to the view
    /// or gone from it count as touched. The result equals
    /// [`ConstraintProblem::build`] of `view`; the overlay is rebuilt in full.
    pub fn rebuild(&self, view: &FoldedView, touched: &BTreeSet<FaceId>) -> ConstraintProblem {
        let previous: BTreeSet<FaceId> = self.faces.iter().copied().collect();
        let mut touched = touched.clone();
        touched.extend(
            view.faces()
                .iter()
                .map(|f| f.id)
                .filter(|f| !previous.contains(f)),
        );
        touched.extend(self.faces.iter().filter(|&&f| view.face(f).is_none()));
        let untouched = |faces: &[FaceId]| faces.iter().all(|f| !touched.contains(f));

        let mut kept = Kept {
            variables: self
                .variables
                .iter()
                .filter(|p| untouched(&p.faces()))
                .copied()
                .collect(),
            constraints: self
                .constraints
                .iter()
                .filter(|c| untouched(c.faces()))
                .copied()
                .collect(),
            dropped: self
                .ambiguities
                .iter()
                .filter_map(|a| match a.cause {
                    AmbiguityCause::Constraint(c) if untouched(c.faces()) => Some((c, a.pair)),
                    _ => None,
                })
                .collect(),
        };

        let touched_index: BTreeSet<usize> =
            touched.iter().filter_map(|&f| view.index_of(f)).collect();
        let n = view.faces().len();
        // Each touched face against every face, each pair once.
        for &t in &touched_index {
            for j in 0..n {
                if j != t
                    && (j > t || !touched_index.contains(&j))
                    && let Some(pair) = variable(view, t.min(j), t.max(j))
                {
                    kept.variables.insert(pair);
                }
            }
        }
        // An edge of a touched face against every face, any other edge
        // against the touched faces; then the touched faces' edges against
        // every edge.
        let edges = view.edges();
        let touched_edges: BTreeSet<usize> = (0..edges.len())
            .filter(|&e| edges[e].faces.iter().any(|f| touched.contains(f)))
            .collect();
        let all_faces: Vec<usize> = (0..n).collect();
        let touched_faces: Vec<usize> = touched_index.iter().copied().collect();
        for e in 0..edges.len() {
            let faces = if touched_edges.contains(&e) {
                &all_faces
            } else {
                &touched_faces
            };
            for &h in faces {
                generated(edge_face(view, e, h), &mut kept);
            }
        }
        for &e in &touched_edges {
            for e2 in 0..edges.len() {
                if e2 != e && (e2 > e || !touched_edges.contains(&e2)) {
                    generated(edge_edge(view, e, e2), &mut kept);
                }
            }
        }
        ConstraintProblem::assemble(view, kept)
    }

    /// Index the variables and constraints, overlay the faces, and find the
    /// ambiguities.
    fn assemble(view: &FoldedView, kept: Kept) -> ConstraintProblem {
        let variables: Vec<FacePair> = kept.variables.into_iter().collect();
        let variable_index: BTreeMap<FacePair, usize> =
            variables.iter().enumerate().map(|(i, p)| (*p, i)).collect();
        let mut ambiguities: BTreeSet<Ambiguity> = kept
            .dropped
            .iter()
            .map(|&(c, pair)| Ambiguity {
                pair,
                cause: AmbiguityCause::Constraint(c),
            })
            .collect();
        // A constraint stays only if every pair it relates is a variable; the
        // generation already checked, so this re-check only guards kept ones.
        let constraints: Vec<Constraint> = kept
            .constraints
            .into_iter()
            .filter(|c| {
                c.ordered_pairs().iter().all(|&[x, y]| {
                    FacePair::new(x, y).is_some_and(|p| variable_index.contains_key(&p))
                })
            })
            .collect();
        let mut buckets = vec![Buckets::default(); variables.len()];
        for (k, c) in constraints.iter().enumerate() {
            let mut seen = BTreeSet::new();
            for [x, y] in c.ordered_pairs() {
                if let Some(&v) = FacePair::new(x, y).and_then(|p| variable_index.get(&p))
                    && seen.insert(v)
                {
                    buckets[v].push(c.kind(), k);
                }
            }
        }

        let overlay = Overlay::build(view);
        let mut is_variable = PairTable::new(view.faces().len());
        for pair in &variables {
            if let (Some(i), Some(j)) = (view.index_of(pair.lo()), view.index_of(pair.hi())) {
                is_variable.set(i, j, true);
                is_variable.set(j, i, true);
            }
        }
        let faces = view.faces();
        for &c in overlay.distinct_cells() {
            let cell = overlay.positions(c);
            for (k, &i) in cell.iter().enumerate() {
                for &j in &cell[k + 1..] {
                    if !is_variable.get(i, j)
                        && let Some(pair) = FacePair::new(faces[i].id, faces[j].id)
                    {
                        ambiguities.insert(Ambiguity {
                            pair,
                            cause: AmbiguityCause::SharedCell,
                        });
                    }
                }
            }
        }
        for pair in &variables {
            if !overlay.share_cell(pair.lo(), pair.hi()) {
                ambiguities.insert(Ambiguity {
                    pair: *pair,
                    cause: AmbiguityCause::NoSharedCell,
                });
            }
        }
        for (e, edge) in view.edges().iter().enumerate() {
            if let (EdgeKind::Folded(_), Some(pair)) =
                (edge.kind, FacePair::new(edge.faces[0], edge.faces[1]))
                && !variable_index.contains_key(&pair)
            {
                ambiguities.insert(Ambiguity {
                    pair,
                    cause: AmbiguityCause::FoldedEdge { edge: e },
                });
            }
        }

        ConstraintProblem {
            faces: view.faces().iter().map(|f| f.id).collect(),
            variables,
            variable_index,
            constraints,
            buckets,
            overlay,
            ambiguities: ambiguities.into_iter().collect(),
        }
    }

    /// Whether this is the problem of `view`'s faces, in its order (a check
    /// against another view would read the wrong cells).
    pub fn is_for(&self, view: &FoldedView) -> bool {
        self.faces.len() == view.faces().len()
            && self
                .faces
                .iter()
                .zip(view.faces())
                .all(|(id, face)| *id == face.id)
    }

    /// The overlapping pairs, ascending.
    pub fn variables(&self) -> &[FacePair] {
        &self.variables
    }

    /// A pair's position in [`ConstraintProblem::variables`].
    pub fn variable(&self, pair: FacePair) -> Option<usize> {
        self.variable_index.get(&pair).copied()
    }

    pub fn is_variable(&self, a: FaceId, b: FaceId) -> bool {
        FacePair::new(a, b).is_some_and(|p| self.variable_index.contains_key(&p))
    }

    /// Every constraint once, ascending.
    pub fn constraints(&self) -> &[Constraint] {
        &self.constraints
    }

    /// The constraints involving variable `v`.
    pub fn buckets(&self, v: usize) -> Option<&Buckets> {
        self.buckets.get(v)
    }

    pub fn overlay(&self) -> &Overlay {
        &self.overlay
    }

    /// The undecidable pairs, ascending; empty for a state the tolerance
    /// decides everywhere.
    pub fn ambiguities(&self) -> &[Ambiguity] {
        &self.ambiguities
    }
}

/// Record a generated constraint, or the pair that keeps it out. Runs after
/// every variable is known.
fn generated(constraint: Option<Constraint>, kept: &mut Kept) {
    let Some(constraint) = constraint else {
        return;
    };
    let constraint = constraint.canonical();
    let missing = constraint
        .ordered_pairs()
        .into_iter()
        .filter_map(|[x, y]| FacePair::new(x, y))
        .find(|pair| !kept.variables.contains(pair));
    match missing {
        Some(pair) => {
            kept.dropped.insert((constraint, pair));
        }
        None => {
            kept.constraints.insert(constraint);
        }
    }
}

/// The pair of faces `i < j` (view indices) if they overlap by more than
/// [`TOL`].
fn variable(view: &FoldedView, i: usize, j: usize) -> Option<FacePair> {
    if !convex::boxes_overlap(view.bounding_box(i), view.bounding_box(j), 0.0) {
        return None;
    }
    let faces = view.faces();
    if convex::penetration(&faces[i].polygon, &faces[j].polygon) <= TOL {
        return None;
    }
    FacePair::new(faces[i].id, faces[j].id)
}

/// The constraint edge `e` makes with face `h` when it passes through h's
/// interior (by more than [`TOL`], for longer than `TOL`).
fn edge_face(view: &FoldedView, e: usize, h: usize) -> Option<Constraint> {
    let edge = &view.edges()[e];
    let face = &view.faces()[h];
    let [a, b] = edge.faces;
    if face.id == a || face.id == b {
        return None;
    }
    let [p, q] = edge.segment;
    if !convex::boxes_overlap(
        &convex::bounding_box(&edge.segment),
        view.bounding_box(h),
        0.0,
    ) || convex::segment_length_inside(p, q, &face.polygon, TOL) <= TOL
    {
        return None;
    }
    Some(match edge.kind {
        EdgeKind::Folded(_) => Constraint::TacoTortilla([a, b, face.id]),
        EdgeKind::Flat => Constraint::TortillaTortilla([a, b, face.id, face.id]),
    })
}

/// The constraint two edges make when they run along one line and overlap
/// for longer than [`TOL`].
fn edge_edge(view: &FoldedView, e1: usize, e2: usize) -> Option<Constraint> {
    let edges = view.edges();
    let (s, t) = (&edges[e1], &edges[e2]);
    let (bs, bt) = (
        convex::bounding_box(&s.segment),
        convex::bounding_box(&t.segment),
    );
    if !convex::boxes_overlap(&bs, &bt, TOL) {
        return None;
    }
    // Measure along the longer segment's line.
    let len = |seg: &[[f64; 2]; 2]| (seg[1][0] - seg[0][0]).hypot(seg[1][1] - seg[0][1]);
    let (r, o, r_left, o_left) = if len(&s.segment) >= len(&t.segment) {
        (s, t, view.edge_left(e1), view.edge_left(e2))
    } else {
        (t, s, view.edge_left(e2), view.edge_left(e1))
    };
    let [p, q] = r.segment;
    let line = convex::HalfPlane::left_of(p, q)?;
    if o.segment
        .iter()
        .any(|&x| line.signed_distance(x).abs() > TOL)
    {
        return None;
    }
    let dir = [q[0] - p[0], q[1] - p[1]];
    let length = len(&r.segment);
    let along = |x: [f64; 2]| ((x[0] - p[0]) * dir[0] + (x[1] - p[1]) * dir[1]) / length;
    let (u, v) = (along(o.segment[0]), along(o.segment[1]));
    if u.max(v).min(length) - u.min(v).max(0.0) <= TOL {
        return None;
    }
    // Sides relative to the reference direction.
    let same_way = along(o.segment[1]) >= along(o.segment[0]);
    let o_left = if same_way {
        o_left
    } else {
        [!o_left[0], !o_left[1]]
    };
    let ([a, b], [c, d]) = (r.faces, o.faces);
    match (r.kind, o.kind) {
        (EdgeKind::Folded(_), EdgeKind::Folded(_)) => {
            let distinct = BTreeSet::from([a, b, c, d]).len() == 4;
            (r_left[0] == o_left[0] && distinct).then_some(Constraint::TacoTaco([a, b, c, d]))
        }
        (EdgeKind::Flat, EdgeKind::Flat) => {
            // c' shares a's side, d' shares b's.
            let (c, d) = if o_left[0] == r_left[0] {
                (c, d)
            } else {
                (d, c)
            };
            let distinct = BTreeSet::from([a, b, c, d]).len() == 4;
            distinct.then_some(Constraint::TortillaTortilla([a, b, c, d]))
        }
        (EdgeKind::Folded(_), EdgeKind::Flat) => {
            let h = if o_left[0] == r_left[0] { c } else { d };
            (h != a && h != b).then_some(Constraint::TacoTortilla([a, b, h]))
        }
        (EdgeKind::Flat, EdgeKind::Folded(_)) => {
            let h = if r_left[0] == o_left[0] { a } else { b };
            (h != c && h != d).then_some(Constraint::TacoTortilla([c, d, h]))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(id: u32) -> FaceId {
        FaceId(id)
    }

    /// Every one of the 64 assignments of a taco-taco's six pairs, valid iff
    /// it is in Flat-Folder's table (`third_party/flat-folder/src/constraints.js`,
    /// `CON.valid[0]`; '1' means the pair's first face is above its second).
    #[test]
    fn taco_taco_matches_flat_folders_table() {
        let table = [
            "111112", "111121", "111222", "112111", "121112", "121222", "122111", "122212",
            "211121", "211222", "212111", "212221", "221222", "222111", "222212", "222221",
        ];
        let constraint = Constraint::TacoTaco([f(0), f(1), f(2), f(3)]);
        let mut valid = 0;
        for bits in 0..64u32 {
            let mut order = LayerOrder::new();
            let mut key = String::new();
            for (k, [x, y]) in constraint.ordered_pairs().into_iter().enumerate() {
                let first_above = bits >> k & 1 == 1;
                key.push(if first_above { '1' } else { '2' });
                let (upper, lower) = if first_above { (x, y) } else { (y, x) };
                assert!(order.set_above(upper, lower).is_ok());
            }
            let holds = constraint.holds(&order) == Some(true);
            assert_eq!(holds, table.contains(&key.as_str()), "{key}");
            valid += usize::from(holds);
        }
        assert_eq!(valid, 16);
    }

    #[test]
    fn taco_tortilla_and_tortilla_tortilla_hold() {
        let mut order = LayerOrder::new();
        for (upper, lower) in [(2, 0), (2, 1), (0, 1)] {
            assert!(order.set_above(f(upper), f(lower)).is_ok());
        }
        // 2 above both 0 and 1: not between them.
        assert_eq!(
            Constraint::TacoTortilla([f(0), f(1), f(2)]).holds(&order),
            Some(true)
        );
        // 0 is between 2 and 1.
        assert_eq!(
            Constraint::TacoTortilla([f(2), f(1), f(0)]).holds(&order),
            Some(false)
        );
        // 1 is below both 0 and 2; 0 is between 1 and 2.
        assert_eq!(
            Constraint::TortillaTortilla([f(0), f(2), f(1), f(1)]).holds(&order),
            Some(true)
        );
        assert_eq!(
            Constraint::TortillaTortilla([f(1), f(2), f(0), f(0)]).holds(&order),
            Some(false)
        );
        assert_eq!(
            Constraint::TacoTortilla([f(0), f(1), f(7)]).holds(&order),
            None
        );
    }

    #[test]
    fn canonical_forms_identify_equivalent_tuples() {
        let tt = |a, b, c, d| Constraint::TacoTaco([f(a), f(b), f(c), f(d)]).canonical();
        assert_eq!(tt(3, 2, 1, 0), tt(0, 1, 2, 3));
        assert_eq!(
            tt(3, 2, 1, 0),
            Constraint::TacoTaco([f(0), f(1), f(2), f(3)])
        );
        assert_ne!(tt(0, 2, 1, 3), tt(0, 1, 2, 3));
        let tr = |a, b, c, d| Constraint::TortillaTortilla([f(a), f(b), f(c), f(d)]).canonical();
        assert_eq!(tr(1, 0, 3, 2), tr(0, 1, 2, 3));
        assert_eq!(tr(2, 3, 0, 1), tr(0, 1, 2, 3));
        assert_ne!(tr(0, 1, 3, 2), tr(0, 1, 2, 3));
        let tk = |a, b, c| Constraint::TacoTortilla([f(a), f(b), f(c)]).canonical();
        assert_eq!(tk(1, 0, 2), tk(0, 1, 2));
        assert_ne!(tk(0, 2, 1), tk(0, 1, 2));
    }
}
