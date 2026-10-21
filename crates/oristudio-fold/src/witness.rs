//! Stored choices keyed by sheet points (plan D6: choices are results, never
//! indices or digests).
//!
//! A step that ends at a completion stores what was chosen, each face named
//! by an interior sheet point, its *witness*: Import CP stores the full order
//! (`orderJson`, plan D16), a compound fold the pairs its completion left
//! free. Face ids are numbering, which changes whenever an earlier step or
//! the engine does; a sheet point survives replay because later faces are
//! subsets of earlier ones (research §10).
//!
//! Each pair is stored as FOLD's `faceOrders` triple, not as "above": which
//! side of a face another lies on does not depend on which face is the root.
//! A root of the other orientation sees the model from behind, inverting
//! every "above" and every orientation together, so the triple reads the same
//! (the layer-order crate's FOLD rule).
//!
//! On replay every witness must land inside exactly one face, and no two in
//! the same face; otherwise the step is *broken* ([`Broken`]), and so is its
//! subtree.

use oristudio_geometry::convex;
use oristudio_layer_order::LayerOrder;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::complete::{ChoiceCount, CompletionRefusal};
use crate::pattern::FaceId;
use crate::refusal::FoldRefusal;
use crate::state::State;

type Point = [f64; 2];

/// Pairs of a layer order with every face named by a witness.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WitnessOrder {
    /// One interior sheet point per face named, in the order the pairs
    /// first name them.
    pub faces: Vec<Point>,
    /// FOLD `faceOrders` over `faces`: `(f, g, s)` with `s = 1` when f lies
    /// on the side g's front faces, `-1` when it lies on g's back side.
    pub orders: Vec<(u32, u32, i8)>,
    /// Per witness, whether its face showed its front when the choice was
    /// made: what replay checks a pair's two faces still turn alike by
    /// ([`BrokenWitness::Turned`]). Absent in choices stored before it, and
    /// in Import CP's whole order, whose faces no earlier step can turn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub up: Option<Vec<bool>>,
}

/// Why a stored choice's witnesses no longer name faces.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(rename_all = "snake_case", tag = "cause")]
pub enum BrokenWitness {
    #[error("witness {witness} at {point:?} lies in no face")]
    NoFace { witness: usize, point: Point },
    #[error("witnesses {witnesses:?} lie in one face")]
    SharedFace { witnesses: [usize; 2] },
    #[error("order {order} names witness {index}, but there are {count}")]
    UnknownWitness {
        order: usize,
        index: u32,
        count: usize,
    },
    #[error("order {order} orders a face against itself")]
    SelfPair { order: usize },
    #[error("order {order} has the sign {sign}, not 1 or -1")]
    InvalidSign { order: usize, sign: i8 },
    /// One face of a stored pair now faces the other way from the other,
    /// relative to when the choice was made: an earlier step changed which
    /// way it turns. The pair's sign names a side of a face, so it would now
    /// name the other stacking; the step breaks rather than flip it.
    #[error("order {order}'s witnesses {witnesses:?} no longer turn as they did")]
    Turned { order: usize, witnesses: [u32; 2] },
    /// The stored orientations do not number one per witness.
    #[error("{count} stored orientations for {witnesses} witnesses")]
    Orientations { count: usize, witnesses: usize },
}

/// Why a stored choice no longer resolves (plan D6): its node is broken.
#[derive(Debug, Clone, PartialEq, Serialize, Error)]
#[serde(rename_all = "snake_case", tag = "broken")]
pub enum Broken {
    #[error("{witness}")]
    Witness { witness: BrokenWitness },
    /// The stored pairs conflict with the constraints or with what else is
    /// fixed, or name faces that no longer overlap.
    #[error("{refusal}")]
    Completion { refusal: CompletionRefusal },
    /// The stored pairs no longer decide the order.
    #[error("the stored choice leaves {} order(s), not one", orders.orders)]
    NotUnique { orders: ChoiceCount },
    /// The one order it resolves to does not pass the gate.
    #[error("{refusal}")]
    Gate { refusal: FoldRefusal },
    /// A stored reverse-fold opening (`openings[opening]`) no longer names
    /// one of a flap's openings, or names a flap another one already does.
    #[error("stored opening {opening} names no opening of the tip")]
    Opening { opening: usize },
    /// A closed sink's stored pocket no longer names exactly one of the
    /// point's pockets.
    #[error("the stored pocket names no one pocket of the point")]
    Pocket,
}

impl WitnessOrder {
    /// The pairs `[upper, lower]` (upper above lower in the model frame),
    /// each face named by `witness`, with `front_up` the faces'
    /// orientations; `None` when a face has no witness or orientation.
    pub fn new(
        pairs: &[[FaceId; 2]],
        witness: impl Fn(FaceId) -> Option<Point>,
        front_up: impl Fn(FaceId) -> Option<bool>,
    ) -> Option<WitnessOrder> {
        let mut named: Vec<FaceId> = Vec::new();
        let mut faces = Vec::new();
        let mut up = Vec::new();
        let mut index = |face: FaceId| -> Option<u32> {
            if let Some(i) = named.iter().position(|&f| f == face) {
                return u32::try_from(i).ok();
            }
            faces.push(witness(face)?);
            up.push(front_up(face)?);
            named.push(face);
            u32::try_from(named.len() - 1).ok()
        };
        let mut orders = Vec::with_capacity(pairs.len());
        for &[upper, lower] in pairs {
            // Upper lies on lower's front side iff lower shows its front.
            let sign = if front_up(lower)? { 1 } else { -1 };
            orders.push((index(upper)?, index(lower)?, sign));
        }
        Some(WitnessOrder {
            faces,
            orders,
            up: Some(up),
        })
    }

    /// Every determined pair of `order`, in pair order.
    pub fn of_order(
        order: &LayerOrder,
        witness: impl Fn(FaceId) -> Option<Point>,
        front_up: impl Fn(FaceId) -> Option<bool>,
    ) -> Option<WitnessOrder> {
        let pairs: Vec<[FaceId; 2]> = order
            .pairs()
            .filter_map(|(pair, lo_above)| {
                lo_above.map(|a| {
                    if a {
                        [pair.lo(), pair.hi()]
                    } else {
                        [pair.hi(), pair.lo()]
                    }
                })
            })
            .collect();
        WitnessOrder::new(&pairs, witness, front_up)
    }

    /// The state's whole order: what Import CP stores. Without orientations:
    /// an import's faces are its own crease pattern's, which no earlier step
    /// can turn, and its stored text stays what it was.
    pub fn of_state(state: &State) -> Option<WitnessOrder> {
        WitnessOrder::of_order(
            state.order(),
            |f| state.face_witness(f),
            |f| state.front_up(f),
        )
        .map(|order| WitnessOrder { up: None, ..order })
    }

    /// The pairs `[upper, lower]`, each witness mapped to the face `face_at`
    /// finds for it, with `front_up` that face's orientation now.
    ///
    /// With stored orientations, every pair's two faces must have turned
    /// alike since: both as they were, or both the other way (a root of the
    /// other orientation turns every face, and a part of the model turned
    /// over as one keeps its pairs). One turned without the other would make
    /// the sign name the other stacking, so that is broken
    /// ([`BrokenWitness::Turned`]), never read as the other order.
    pub fn resolve(
        &self,
        face_at: impl Fn(Point) -> Option<FaceId>,
        front_up: impl Fn(FaceId) -> Option<bool>,
    ) -> Result<Vec<[FaceId; 2]>, BrokenWitness> {
        let mut faces: Vec<(FaceId, bool)> = Vec::with_capacity(self.faces.len());
        for (witness, &point) in self.faces.iter().enumerate() {
            let face = point
                .iter()
                .all(|c| c.is_finite())
                .then(|| face_at(point))
                .flatten()
                .and_then(|f| Some((f, front_up(f)?)))
                .ok_or(BrokenWitness::NoFace { witness, point })?;
            if let Some(other) = faces.iter().position(|&(f, _)| f == face.0) {
                return Err(BrokenWitness::SharedFace {
                    witnesses: [other, witness],
                });
            }
            faces.push(face);
        }
        // Per witness, whether it turned since the choice was made.
        let turned: Option<Vec<bool>> = match &self.up {
            Some(up) if up.len() != faces.len() => {
                return Err(BrokenWitness::Orientations {
                    count: up.len(),
                    witnesses: faces.len(),
                });
            }
            Some(up) => Some(
                faces
                    .iter()
                    .zip(up)
                    .map(|(&(_, now), &was)| now != was)
                    .collect(),
            ),
            None => None,
        };
        self.orders
            .iter()
            .enumerate()
            .map(|(order, &(f, g, sign))| {
                if let Some(turned) = &turned
                    && let (Some(a), Some(b)) = (turned.get(f as usize), turned.get(g as usize))
                    && a != b
                {
                    return Err(BrokenWitness::Turned {
                        order,
                        witnesses: [f, g],
                    });
                }
                let face = |index: u32| {
                    faces
                        .get(index as usize)
                        .copied()
                        .ok_or(BrokenWitness::UnknownWitness {
                            order,
                            index,
                            count: faces.len(),
                        })
                };
                if f == g {
                    return Err(BrokenWitness::SelfPair { order });
                }
                if sign != 1 && sign != -1 {
                    return Err(BrokenWitness::InvalidSign { order, sign });
                }
                let ((f, _), (g, g_up)) = (face(f)?, face(g)?);
                Ok(if (sign == 1) == g_up { [f, g] } else { [g, f] })
            })
            .collect()
    }
}

impl State {
    /// An interior sheet point of the face, its centroid: what a stored
    /// choice names it by (plan D6). A face wider than three times the
    /// tolerance contains it by more than the tolerance, so
    /// [`State::face_at`] finds the face again.
    pub fn face_witness(&self, id: FaceId) -> Option<Point> {
        let ring: Vec<Point> = self
            .face(id)?
            .ring
            .iter()
            .map(|v| self.vertices()[v.index()])
            .collect();
        convex::centroid(&ring)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn f(id: u32) -> FaceId {
        FaceId(id)
    }

    /// Faces 0..4 as the unit squares [i, i + 1] × [0, 1].
    fn strip(p: Point) -> Option<FaceId> {
        let i = p[0].floor();
        let inside = |v: f64| v - v.floor() > 1e-6 && v.ceil() - v > 1e-6;
        (inside(p[0]) && inside(p[1]) && (0.0..4.0).contains(&i) && (0.0..1.0).contains(&p[1]))
            .then(|| f(i as u32))
    }

    fn witness(face: FaceId) -> Option<Point> {
        Some([f64::from(face.0) + 0.5, 0.5])
    }

    /// Even faces show their front.
    fn even_up(face: FaceId) -> Option<bool> {
        Some(face.0.is_multiple_of(2))
    }

    #[test]
    fn pairs_round_trip_through_their_witnesses() {
        let pairs = [[f(2), f(1)], [f(1), f(3)], [f(3), f(2)]];
        let stored = WitnessOrder::new(&pairs, witness, even_up).unwrap_or_else(|| unreachable!());
        assert_eq!(stored.faces, vec![[2.5, 0.5], [1.5, 0.5], [3.5, 0.5]]);
        // 2 above the back-up 1 lies on 1's back side; 3 above the front-up 2
        // on 2's front side.
        assert_eq!(stored.orders, vec![(0, 1, -1), (1, 2, -1), (2, 0, 1)]);
        assert_eq!(stored.resolve(strip, even_up), Ok(pairs.to_vec()));
        // Through JSON, as a document stores it: FOLD's triples.
        let json = serde_json::to_string(&stored).unwrap_or_default();
        assert!(
            json.contains("\"orders\":[[0,1,-1],[1,2,-1],[2,0,1]]"),
            "{json}"
        );
        let back: WitnessOrder = serde_json::from_str(&json).unwrap_or_else(|e| panic!("{e}"));
        assert_eq!(back, stored);
        // A face with no witness or no orientation cannot be stored.
        assert_eq!(WitnessOrder::new(&pairs, |_| None, even_up), None);
        assert_eq!(WitnessOrder::new(&pairs, witness, |_| None), None);
    }

    #[test]
    fn a_root_of_the_other_orientation_reads_the_order_turned_over() {
        // Seen from behind, every face's orientation and every "above"
        // inverts; the stored triples then give the inverted pairs.
        let pairs = [[f(0), f(1)], [f(2), f(1)]];
        let stored = WitnessOrder::new(&pairs, witness, even_up).unwrap_or_else(|| unreachable!());
        let odd_up = |face: FaceId| even_up(face).map(|up| !up);
        assert_eq!(
            stored.resolve(strip, odd_up),
            Ok(vec![[f(1), f(0)], [f(1), f(2)]])
        );
    }

    #[test]
    fn one_face_of_a_pair_turned_alone_breaks_rather_than_flips_the_pair() {
        let pairs = [[f(0), f(1)], [f(2), f(1)]];
        let stored = WitnessOrder::new(&pairs, witness, even_up).unwrap_or_else(|| unreachable!());
        assert_eq!(stored.up, Some(vec![true, false, true]));
        // Face 1 now shows its front, faces 0 and 2 as they did: either sign
        // would now name the other stacking.
        let one_turned = |face: FaceId| Some(face.0 != 3);
        assert_eq!(
            stored.resolve(strip, one_turned),
            Err(BrokenWitness::Turned {
                order: 0,
                witnesses: [0, 1]
            })
        );
        // A choice stored before orientations were reads as it always did.
        let older = WitnessOrder {
            up: None,
            ..stored.clone()
        };
        assert_eq!(
            older.resolve(strip, one_turned),
            Ok(vec![[f(1), f(0)], [f(1), f(2)]])
        );
        // Orientations that do not match the witnesses break.
        let short = WitnessOrder {
            up: Some(vec![true]),
            ..stored
        };
        assert_eq!(
            short.resolve(strip, even_up),
            Err(BrokenWitness::Orientations {
                count: 1,
                witnesses: 3
            })
        );
    }

    #[test]
    fn an_order_is_stored_by_its_determined_pairs() {
        let mut order = LayerOrder::new();
        assert!(order.set_above(f(1), f(0)).is_ok());
        assert!(order.set_undetermined(f(1), f(2)).is_ok());
        let stored =
            WitnessOrder::of_order(&order, witness, even_up).unwrap_or_else(|| unreachable!());
        assert_eq!(stored.resolve(strip, even_up), Ok(vec![[f(1), f(0)]]));
    }

    #[test]
    fn witnesses_that_name_no_face_or_one_face_twice_break() {
        let stored = |faces: Vec<Point>, orders: Vec<(u32, u32, i8)>| WitnessOrder {
            faces,
            orders,
            up: None,
        };
        let resolve = |s: WitnessOrder| s.resolve(strip, even_up);
        assert_eq!(
            resolve(stored(vec![[0.5, 0.5], [1.0, 0.5]], vec![(0, 1, 1)])),
            Err(BrokenWitness::NoFace {
                witness: 1,
                point: [1.0, 0.5]
            })
        );
        assert!(matches!(
            resolve(stored(vec![[f64::NAN, 0.5]], vec![])),
            Err(BrokenWitness::NoFace { witness: 0, .. })
        ));
        assert_eq!(
            resolve(stored(vec![[0.5, 0.5], [0.25, 0.75]], vec![(0, 1, 1)])),
            Err(BrokenWitness::SharedFace { witnesses: [0, 1] })
        );
        assert_eq!(
            resolve(stored(vec![[0.5, 0.5]], vec![(0, 4, 1)])),
            Err(BrokenWitness::UnknownWitness {
                order: 0,
                index: 4,
                count: 1
            })
        );
        assert_eq!(
            resolve(stored(vec![[0.5, 0.5]], vec![(0, 0, 1)])),
            Err(BrokenWitness::SelfPair { order: 0 })
        );
        assert_eq!(
            resolve(stored(vec![[0.5, 0.5], [1.5, 0.5]], vec![(0, 1, 0)])),
            Err(BrokenWitness::InvalidSign { order: 0, sign: 0 })
        );
    }
}
