//! A state's parts before its layer order is known (plan D4: … derive → gate
//! → carry → seed → complete → letters → validate).
//!
//! [`Unordered::new`] takes what an operation is about to land (crease
//! pattern, faces, root, view) and derives and checks everything the order
//! does not decide: the structure, convex faces covering the sheet, the
//! isometries from the root, the hinges, the folded image and its constraint
//! problem. What is left is the order: fix what is known ([`FixedPair`]),
//! [`Unordered::complete`] the rest, pick one, and [`Unordered::state`]
//! builds the state through [`State::make`], deriving the letters the order
//! decides. [`Unordered::replay`] does the same for a stored choice
//! (plan D6).
//!
//! Import CP starts here with each crease's letter known or unknown
//! ([`crate::import`]); a compound fold will start here with the pairs its
//! blocks carry.
//!
//! The checks are the gate's steps 1–5 (`state::gate`) on parts with no
//! order yet. The gate builds the same folded view; this one differs only in
//! entering a crease whose letter is unknown without one.

use std::collections::BTreeSet;

use oristudio_geometry::convex;
use oristudio_layer_order::{
    ConstraintProblem, Edge, EdgeKind, Face as ViewFace, FoldedView, LayerOrder, LayerOrderError,
    Letter, derived_letter,
};

use crate::complete::{CompletionLimits, CompletionRefusal, Completions, FixedKind, FixedPair};
use crate::isometry::Isometry;
use crate::numerics::TOL;
use crate::pattern::{CreaseKind, EdgeId, FaceId};
use crate::refusal::FoldRefusal;
use crate::state::{Geometry, State, StateParts, Topology};
use crate::witness::{Broken, WitnessOrder};

type Point = [f64; 2];

/// Parts whose order is still to be decided, checked up to it.
#[derive(Debug, Clone)]
pub struct Unordered {
    /// Faces and creases in id order; the order is empty.
    parts: StateParts,
    /// The folded creases whose letter the order decides.
    unknown: BTreeSet<EdgeId>,
    geometry: Geometry,
    view: FoldedView,
    problem: ConstraintProblem,
    /// Per folded-view edge, its crease's position.
    edge_creases: Vec<usize>,
}

impl Unordered {
    /// Derive and check `parts`, whose order is ignored. The creases in
    /// `unknown` are folded with a letter still to be decided: their stored
    /// letters are placeholders. Ids that are not folded creases have no
    /// letter to decide and are ignored.
    pub fn new(
        mut parts: StateParts,
        unknown: impl IntoIterator<Item = EdgeId>,
    ) -> Result<Unordered, FoldRefusal> {
        parts.faces.sort_by_key(|f| f.id);
        parts.creases.sort_by_key(|c| c.id);
        parts.order = LayerOrder::new();
        for pair in parts.faces.windows(2) {
            if pair[0].id == pair[1].id {
                return Err(FoldRefusal::DuplicateId {
                    what: "face",
                    id: pair[0].id.0,
                });
            }
        }
        for pair in parts.creases.windows(2) {
            if pair[0].id == pair[1].id {
                return Err(FoldRefusal::DuplicateId {
                    what: "crease",
                    id: pair[0].id.0,
                });
            }
        }
        let root = parts
            .faces
            .binary_search_by_key(&parts.root, |f| f.id)
            .map_err(|_| FoldRefusal::UnknownRoot { face: parts.root })?;
        let topology = Topology::build(&parts)?;
        let mut area = 0.0;
        for (f, face) in parts.faces.iter().enumerate() {
            let ring = sheet_polygon(&parts, f);
            if !convex::is_convex(&ring, TOL) {
                return Err(FoldRefusal::NonConvexFace { face: face.id });
            }
            area += convex::signed_area(&ring);
        }
        let sheet_area = parts.sheet.area();
        if (area - sheet_area).abs() > TOL {
            return Err(FoldRefusal::AreaMismatch {
                faces_area: area,
                sheet_area,
            });
        }
        let unknown: BTreeSet<EdgeId> = unknown
            .into_iter()
            .filter(|id| {
                parts
                    .creases
                    .binary_search_by_key(id, |c| c.id)
                    .is_ok_and(|k| parts.creases[k].kind.is_folded())
            })
            .collect();

        let geometry = Geometry::derive(&parts, &topology, root, TOL)?;

        let mut edges = Vec::new();
        let mut edge_creases = Vec::new();
        for (k, crease) in parts.creases.iter().enumerate() {
            if crease.kind == CreaseKind::Border {
                continue;
            }
            let [f, g] = [topology.crease_faces[k][0], topology.crease_faces[k][1]];
            let folded = crease.kind.is_folded();
            let (f_up, g_up) = (
                geometry.isometries[f].front_up(),
                geometry.isometries[g].front_up(),
            );
            if folded == (f_up == g_up) {
                return Err(FoldRefusal::HingeOrientation {
                    edge: crease.id,
                    faces: [parts.faces[f].id, parts.faces[g].id],
                    kind: if folded { "folded" } else { "flat" },
                });
            }
            let t = &geometry.isometries[f];
            edges.push(Edge {
                faces: [parts.faces[f].id, parts.faces[g].id],
                segment: crease.vertices.map(|v| t.apply(parts.vertices[v.index()])),
                kind: match crease.kind {
                    CreaseKind::Folded(_) if unknown.contains(&crease.id) => EdgeKind::Folded(None),
                    CreaseKind::Folded(letter) => EdgeKind::Folded(Some(letter)),
                    _ => EdgeKind::Flat,
                },
            });
            edge_creases.push(k);
        }
        let faces = parts
            .faces
            .iter()
            .zip(&geometry.images)
            .zip(&geometry.isometries)
            .map(|((face, image), t)| ViewFace {
                id: face.id,
                polygon: image.clone(),
                front_up: t.front_up(),
            })
            .collect();
        let view = FoldedView::new(faces, edges)
            .map_err(|e| folded_image(&e, &parts, &topology, &edge_creases))?;
        let problem = ConstraintProblem::build(&view);
        Ok(Unordered {
            parts,
            unknown,
            geometry,
            view,
            problem,
            edge_creases,
        })
    }

    /// The parts, faces and creases in id order, with no order.
    pub fn parts(&self) -> &StateParts {
        &self.parts
    }

    /// The folded creases whose letter the order decides.
    pub fn unknown_letters(&self) -> &BTreeSet<EdgeId> {
        &self.unknown
    }

    /// The folded image as the layer order sees it; a crease whose letter is
    /// unknown is folded without one.
    pub fn view(&self) -> &FoldedView {
        &self.view
    }

    /// The layer-order constraint problem, with its overlay into cells.
    pub fn problem(&self) -> &ConstraintProblem {
        &self.problem
    }

    /// The face's isometry, sheet to model frame.
    pub fn isometry(&self, id: FaceId) -> Option<Isometry> {
        self.position(id).map(|f| self.geometry.isometries[f])
    }

    /// The face whose sheet polygon contains `p` by more than the tolerance;
    /// none off the sheet or on a crease.
    pub fn face_at(&self, p: Point) -> Option<FaceId> {
        let mut hits = (0..self.parts.faces.len())
            .filter(|&f| convex::contains_point(&sheet_polygon(&self.parts, f), p, TOL));
        let first = hits.next()?;
        hits.next().is_none().then_some(self.parts.faces[first].id)
    }

    /// An interior sheet point of the face, the same one
    /// [`State::face_witness`] gives the state this lands: what a stored
    /// choice names it by.
    pub fn face_witness(&self, id: FaceId) -> Option<Point> {
        self.position(id)
            .and_then(|f| convex::centroid(&sheet_polygon(&self.parts, f)))
    }

    /// Pairs `[upper, lower]` of these faces with each face named by its
    /// witness: what a step stores for a completion pick
    /// ([`Completions::chosen_pairs`]).
    pub fn witness_order(&self, pairs: &[[FaceId; 2]]) -> Option<WitnessOrder> {
        WitnessOrder::new(
            pairs,
            |f| self.face_witness(f),
            |f| self.isometry(f).map(|t| t.front_up()),
        )
    }

    /// The orders the known letters fix, as seeds: a valley's front-up face
    /// lies below the other, a mountain's above (research §3.1).
    pub fn letter_seeds(&self) -> Vec<FixedPair> {
        self.view
            .edges()
            .iter()
            .filter_map(|edge| {
                let EdgeKind::Folded(Some(letter)) = edge.kind else {
                    return None;
                };
                let [f, g] = edge.faces;
                let (up, other) = if self.view.front_up(f)? {
                    (f, g)
                } else {
                    (g, f)
                };
                let (upper, lower) = match letter {
                    Letter::Valley => (other, up),
                    Letter::Mountain => (up, other),
                };
                Some(FixedPair {
                    upper,
                    lower,
                    kind: FixedKind::Seed,
                })
            })
            .collect()
    }

    /// Every order `fixed` and the constraints allow.
    pub fn complete(
        &self,
        fixed: &[FixedPair],
        limits: &CompletionLimits,
    ) -> Result<Completions, CompletionRefusal> {
        crate::complete::complete(&self.view, &self.problem, fixed, limits)
    }

    /// The state with this order: each unknown letter derived from it, then
    /// [`State::make`], which checks everything again.
    pub fn state(&self, order: LayerOrder) -> Result<State, FoldRefusal> {
        let mut parts = self.parts.clone();
        for (e, &k) in self.edge_creases.iter().enumerate() {
            if self.unknown.contains(&parts.creases[k].id)
                && let Some(letter) = derived_letter(&self.view, &order, e)
            {
                parts.creases[k].kind = CreaseKind::Folded(letter);
            }
        }
        parts.order = order;
        State::make(parts)
    }

    /// Replay a stored choice (plan D6): resolve its witnesses to faces, fix
    /// its pairs as seeds beside `fixed`, and complete. Exactly one order
    /// resolves it; a witness that lands in no face or shares one, a
    /// conflict, or more than one order means it is broken.
    pub fn replay(
        &self,
        stored: &WitnessOrder,
        fixed: &[FixedPair],
        limits: &CompletionLimits,
    ) -> Result<State, Broken> {
        let pairs = stored
            .resolve(
                |p| self.face_at(p),
                |f| self.isometry(f).map(|t| t.front_up()),
            )
            .map_err(|witness| Broken::Witness { witness })?;
        let mut all = fixed.to_vec();
        all.extend(pairs.into_iter().map(|[upper, lower]| FixedPair {
            upper,
            lower,
            kind: FixedKind::Seed,
        }));
        let completions = self
            .complete(&all, limits)
            .map_err(|refusal| Broken::Completion { refusal })?;
        if !completions.is_unique() {
            return Err(Broken::NotUnique {
                orders: completions.count(),
            });
        }
        let order = completions
            .order(&vec![0; completions.components().len()])
            .ok_or(Broken::NotUnique {
                orders: completions.count(),
            })?;
        self.state(order)
            .map_err(|refusal| Broken::Gate { refusal })
    }

    fn position(&self, id: FaceId) -> Option<usize> {
        self.parts.faces.binary_search_by_key(&id, |f| f.id).ok()
    }
}

/// Face `f`'s sheet polygon.
fn sheet_polygon(parts: &StateParts, f: usize) -> Vec<Point> {
    parts.faces[f]
        .ring
        .iter()
        .map(|v| parts.vertices[v.index()])
        .collect()
}

/// A malformed folded image, with the faces it involves. `edge_creases` maps
/// the folded view's edges to crease positions.
fn folded_image(
    error: &LayerOrderError,
    parts: &StateParts,
    topology: &Topology,
    edge_creases: &[usize],
) -> FoldRefusal {
    let faces = match error {
        LayerOrderError::DuplicateFace(f)
        | LayerOrderError::NonConvexFace(f)
        | LayerOrderError::DegenerateFace(f)
        | LayerOrderError::SameFace(f)
        | LayerOrderError::FaceNotInView(f) => vec![*f],
        LayerOrderError::InvalidPolygon { face, .. }
        | LayerOrderError::UnknownEdgeFace { face, .. }
        | LayerOrderError::SelfEdge { face, .. }
        | LayerOrderError::EdgeOffFace { face, .. } => vec![*face],
        LayerOrderError::ContradictoryOrder { pair } => pair.faces().to_vec(),
        LayerOrderError::EdgeKindMismatch { edge, .. }
        | LayerOrderError::DegenerateEdge { edge, .. } => edge_creases
            .get(*edge)
            .map(|&k| {
                topology.crease_faces[k]
                    .iter()
                    .map(|&f| parts.faces[f].id)
                    .collect()
            })
            .unwrap_or_default(),
        LayerOrderError::InvalidFaceOrder { .. } | LayerOrderError::ProblemMismatch => Vec::new(),
    };
    FoldRefusal::FoldedImage {
        message: error.to_string(),
        faces,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern::{Crease, Face, VertexId};
    use crate::sheet::Sheet;
    use crate::view::View;

    /// The square with one crease along x = 0.5, of `kind`.
    fn book(kind: CreaseKind) -> StateParts {
        let vertices = vec![
            [0.0, 0.0],
            [0.5, 0.0],
            [1.0, 0.0],
            [1.0, 1.0],
            [0.5, 1.0],
            [0.0, 1.0],
        ];
        let crease = |id: u32, a: u32, b: u32, kind| Crease {
            id: EdgeId(id),
            vertices: [VertexId(a), VertexId(b)],
            kind,
            made_at: 0,
        };
        let creases = vec![
            crease(0, 0, 1, CreaseKind::Border),
            crease(1, 1, 2, CreaseKind::Border),
            crease(2, 2, 3, CreaseKind::Border),
            crease(3, 3, 4, CreaseKind::Border),
            crease(4, 4, 5, CreaseKind::Border),
            crease(5, 5, 0, CreaseKind::Border),
            crease(6, 1, 4, kind),
        ];
        let face = |id: u32, ring: &[u32]| Face {
            id: FaceId(id),
            ring: ring.iter().map(|&v| VertexId(v)).collect(),
            parent: None,
            born: 1,
        };
        StateParts {
            sheet: Sheet::square(),
            vertices,
            creases,
            faces: vec![face(0, &[0, 1, 4, 5]), face(1, &[1, 2, 3, 4])],
            root: FaceId(0),
            root_isometry: Isometry::IDENTITY,
            order: LayerOrder::new(),
            view: View::default(),
            step: 1,
        }
    }

    fn unordered(kind: CreaseKind, unknown: &[u32]) -> Unordered {
        Unordered::new(book(kind), unknown.iter().map(|&e| EdgeId(e)))
            .unwrap_or_else(|e| panic!("{e}"))
    }

    #[test]
    fn a_valley_fixes_the_moving_half_on_top() {
        let u = unordered(CreaseKind::Folded(Letter::Valley), &[]);
        assert!(u.unknown_letters().is_empty());
        assert_eq!(
            u.letter_seeds(),
            vec![FixedPair {
                upper: FaceId(1),
                lower: FaceId(0),
                kind: FixedKind::Seed,
            }]
        );
        let completions = u
            .complete(&u.letter_seeds(), &CompletionLimits::default())
            .unwrap_or_else(|e| panic!("{e}"));
        assert!(completions.is_unique());
        let state = u
            .state(completions.order(&[]).unwrap_or_default())
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(state.above(FaceId(1), FaceId(0)), Some(true));
        assert_eq!(u.isometry(FaceId(0)), Some(Isometry::IDENTITY));
        assert_eq!(u.face_at([0.25, 0.5]), Some(FaceId(0)));
        assert_eq!(u.face_at([0.5, 0.5]), None);
        assert_eq!(u.face_witness(FaceId(1)), Some([0.75, 0.5]));
        assert_eq!(state.face_witness(FaceId(1)), u.face_witness(FaceId(1)));
    }

    #[test]
    fn an_unknown_letter_comes_from_the_order() {
        let u = unordered(CreaseKind::Folded(Letter::Valley), &[6]);
        assert!(u.letter_seeds().is_empty());
        let completions = u
            .complete(&[], &CompletionLimits::default())
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(completions.count().orders, 2);
        let mut letters = Vec::new();
        for pick in 0..2 {
            let order = completions.order(&[pick]).unwrap_or_default();
            let state = u.state(order).unwrap_or_else(|e| panic!("{e}"));
            letters.push(state.crease(EdgeId(6)).map(|c| c.kind));
        }
        letters.sort();
        assert_eq!(
            letters,
            vec![
                Some(CreaseKind::Folded(Letter::Mountain)),
                Some(CreaseKind::Folded(Letter::Valley))
            ]
        );
        // A flat crease or a border has no letter to decide.
        assert!(
            unordered(CreaseKind::Flat(Letter::Valley), &[6, 0])
                .unknown_letters()
                .is_empty()
        );
    }

    #[test]
    fn a_stored_choice_replays_or_breaks() {
        let u = unordered(CreaseKind::Folded(Letter::Valley), &[6]);
        // The front-up left half above the right: the right half lies on
        // the left's front side, so the left lies on the right's back side.
        let stored = WitnessOrder {
            faces: vec![[0.25, 0.5], [0.75, 0.5]],
            orders: vec![(0, 1, -1)],
        };
        let limits = CompletionLimits::default();
        let state = u
            .replay(&stored, &[], &limits)
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(state.above(FaceId(0), FaceId(1)), Some(true));
        assert_eq!(
            state.crease(EdgeId(6)).map(|c| c.kind),
            Some(CreaseKind::Folded(Letter::Mountain))
        );
        assert_eq!(WitnessOrder::of_state(&state), Some(stored.clone()));
        // Rooted on the right half instead, the model is seen from behind:
        // the same triple puts the right half on top, and it is the same
        // mountain.
        let mut parts = book(CreaseKind::Folded(Letter::Valley));
        parts.root = FaceId(1);
        let other = Unordered::new(parts, [EdgeId(6)]).unwrap_or_else(|e| panic!("{e}"));
        let behind = other
            .replay(&stored, &[], &limits)
            .unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(behind.above(FaceId(1), FaceId(0)), Some(true));
        assert_eq!(
            behind.crease(EdgeId(6)).map(|c| c.kind),
            Some(CreaseKind::Folded(Letter::Mountain))
        );
        // Nothing stored leaves two orders.
        let empty = WitnessOrder {
            faces: Vec::new(),
            orders: Vec::new(),
        };
        assert!(matches!(
            u.replay(&empty, &[], &limits),
            Err(Broken::NotUnique { .. })
        ));
        // A witness on the crease names no face.
        let on_crease = WitnessOrder {
            faces: vec![[0.5, 0.5], [0.75, 0.5]],
            orders: vec![(0, 1, -1)],
        };
        assert!(matches!(
            u.replay(&on_crease, &[], &limits),
            Err(Broken::Witness { .. })
        ));
        // A stored order against the letter conflicts.
        let lettered = unordered(CreaseKind::Folded(Letter::Valley), &[]);
        assert!(matches!(
            lettered.replay(&stored, &lettered.letter_seeds(), &limits),
            Err(Broken::Completion {
                refusal: CompletionRefusal::FixedContradictory { .. }
            })
        ));
    }

    #[test]
    fn malformed_parts_are_refused_before_the_order() {
        // A precreased sheet is fine; an unknown root or a missing face is
        // not.
        let mut parts = book(CreaseKind::Flat(Letter::Valley));
        assert!(Unordered::new(parts.clone(), []).is_ok());
        parts.root = FaceId(9);
        assert_eq!(
            Unordered::new(parts, []).map(|_| ()),
            Err(FoldRefusal::UnknownRoot { face: FaceId(9) })
        );
        let mut missing = book(CreaseKind::Folded(Letter::Valley));
        missing.faces.pop();
        assert!(matches!(
            Unordered::new(missing, []),
            Err(FoldRefusal::CreaseFaceCount { .. })
        ));
    }
}
