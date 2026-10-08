//! Landing the fold (plan D3 steps 4–8, research §4.2 steps 5–9): split the
//! moving faces, change the hinges, re-derive the isometries, carry and place
//! the order, derive the letters, and pass the gate.
//!
//! - **Split.** Each crossed crease gets exactly one new vertex, at its sheet
//!   parameter, so the two faces it bounds cannot disagree about where it is.
//!   Each split ring has exactly two transitions; anything else is refused.
//! - **Hinges on ℓ** between a moving and a stationary face toggle: flat to
//!   folded is a refold (the remembered letter is reported beside the new
//!   one), folded to flat an unfold (the letter is remembered). Any other
//!   boundary between moving and stationary faces would contradict rule (i),
//!   and is refused.
//! - **Isometries** are derived from a stationary root that keeps its
//!   isometry, then checked against the prediction: R_ℓ ∘ T_old for moving
//!   faces, T_old for the rest.
//! - **Order.** Pairs of untouched faces stay as they are. Children of an old
//!   pair in the same class keep its order if stationary and reverse it if
//!   moving (U is one block, so this is a block carry, never a carry because
//!   two isometries happen to agree). Each newly overlapping moving ×
//!   stationary pair takes the placement: moving on top for a valley,
//!   underneath for a mountain, or around a tuck's target. A moving ×
//!   stationary overlap thinner than the minimum feature is a sliver.
//! - **Letters**, for the new creases and the refolds, from the order: valley
//!   iff the front-up face lies below. Every other letter is checked by the
//!   gate, so a drifted letter is refused there.

use std::collections::{BTreeSet, HashMap};

use oristudio_geometry::convex::{self, HalfPlane};
use oristudio_layer_order::{FacePair, LayerOrder, Letter, Violation};

use crate::fold::closure::Analysis;
use crate::index::BoxIndex;
use crate::numerics::{MIN_FEATURE, TOL};
use crate::pattern::{Crease, CreaseKind, EdgeId, Face, FaceId, VertexId};
use crate::refusal::Refusal;
use crate::state::{Geometry, State, StateParts, Topology, ring_position};
use crate::view::Direction;

type Point = [f64; 2];

/// A refolded precrease: what it remembered and what it is now.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct Refold {
    pub edge: EdgeId,
    pub remembered: Letter,
    pub letter: Letter,
}

/// What landing changed.
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct Landed {
    /// The new state's faces that moved.
    pub(crate) moving_faces: Vec<FaceId>,
    /// The new creases (chords), in id order.
    pub(crate) created: Vec<EdgeId>,
    pub(crate) unfolded: Vec<EdgeId>,
    pub(crate) refolded: Vec<Refold>,
    /// How many faces were split.
    pub(crate) split: usize,
}

/// A new face and where it came from.
struct NewFace {
    face: Face,
    moving: bool,
    /// The old face's position.
    old: usize,
}

/// Land the analysed fold as step `step`.
pub(crate) fn land(
    state: &State,
    analysis: &Analysis,
    step: u32,
) -> Result<(State, Landed), Refusal> {
    let parts = state.parts();
    let topology = state.topology();
    let geometry = state.geometry();
    let classes = &analysis.classified.classes;
    let distances = &analysis.classified.distances;
    let nf = parts.faces.len();
    let (mut next_face, mut next_crease) = state.next_ids();
    let split: Vec<bool> = (0..nf)
        .map(|f| analysis.moving[f] && analysis.has_stationary[f])
        .collect();

    // One new vertex per crossed crease, by its sheet parameter.
    let mut vertices = parts.vertices.clone();
    let mut cut: HashMap<usize, VertexId> = HashMap::new();
    for f in (0..nf).filter(|&f| split[f]) {
        for (i, &k) in topology.face_creases[f].iter().enumerate() {
            if cut.contains_key(&k) {
                continue;
            }
            let ring = &parts.faces[f].ring;
            let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
            if classes[a.index()] * classes[b.index()] != -1 {
                continue;
            }
            let [lo, hi] = parts.creases[k].vertices;
            let (dl, dh) = (distances[lo.index()], distances[hi.index()]);
            let t = dl / (dl - dh);
            let (p, q) = (vertices[lo.index()], vertices[hi.index()]);
            let length = (q[0] - p[0]).hypot(q[1] - p[1]);
            for (end, part) in [(lo, t * length), (hi, (1.0 - t) * length)] {
                if part < MIN_FEATURE {
                    return Err(Refusal::ShortCrease {
                        vertices: [end, VertexId(vertices.len() as u32)],
                        length: part,
                    });
                }
            }
            cut.insert(k, VertexId(vertices.len() as u32));
            vertices.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
    }
    let old_vertices = parts.vertices.len();
    let class_of = |v: VertexId| -> i8 {
        if v.index() < old_vertices {
            classes[v.index()]
        } else {
            0
        }
    };

    // Rings: unsplit faces keep theirs (and their ids), split faces become
    // a moving and a stationary child.
    let mut kept: Vec<NewFace> = Vec::with_capacity(nf);
    let mut children: Vec<NewFace> = Vec::new();
    let mut chords: Vec<[VertexId; 2]> = Vec::new();
    for (f, face) in parts.faces.iter().enumerate() {
        let mut ring = Vec::with_capacity(face.ring.len() + 2);
        for (i, &v) in face.ring.iter().enumerate() {
            ring.push(v);
            if let Some(&x) = cut.get(&topology.face_creases[f][i]) {
                ring.push(x);
            }
        }
        if !split[f] {
            if ring.len() != face.ring.len() {
                return Err(Refusal::DegenerateSplit { face: face.id });
            }
            kept.push(NewFace {
                face: face.clone(),
                moving: analysis.moving[f],
                old: f,
            });
            continue;
        }
        let (moving_ring, stationary_ring) =
            split_ring(&ring, &class_of).ok_or(Refusal::DegenerateSplit { face: face.id })?;
        let chord = [moving_ring[0], stationary_ring[0]];
        if chord.iter().all(|v| v.index() < old_vertices)
            && topology.crease_between(chord[0], chord[1]).is_some()
        {
            return Err(Refusal::DegenerateSplit { face: face.id });
        }
        let [p, q] = chord.map(|v| vertices[v.index()]);
        let length = (q[0] - p[0]).hypot(q[1] - p[1]);
        if length < MIN_FEATURE {
            return Err(Refusal::ShortCrease {
                vertices: chord,
                length,
            });
        }
        for piece in [&moving_ring, &stationary_ring] {
            let polygon: Vec<Point> = piece.iter().map(|v| vertices[v.index()]).collect();
            let width = convex::width(&polygon);
            if width < MIN_FEATURE / 2.0 {
                return Err(Refusal::ThinPiece {
                    face: face.id,
                    width,
                });
            }
        }
        chords.push(chord);
        for (ring, moving) in [(moving_ring, true), (stationary_ring, false)] {
            children.push(NewFace {
                face: Face {
                    id: FaceId(next_face),
                    ring,
                    parent: Some(face.id),
                    born: step,
                },
                moving,
                old: f,
            });
            next_face += 1;
        }
    }
    // Kept faces in old (id) order, then the children: id order.
    let new_faces: Vec<NewFace> = kept.into_iter().chain(children).collect();
    let mut child_of: Vec<Vec<usize>> = vec![Vec::new(); nf];
    for (a, nfce) in new_faces.iter().enumerate() {
        child_of[nfce.old].push(a);
    }

    // Creases: split halves, then the chords, after the kept ones (id
    // order).
    let mut kept_creases = Vec::with_capacity(parts.creases.len());
    let mut new_creases = Vec::new();
    for (k, crease) in parts.creases.iter().enumerate() {
        match cut.get(&k) {
            None => kept_creases.push(crease.clone()),
            Some(&x) => {
                let [a, b] = crease.vertices;
                for vertices in [[a, x], [x, b]] {
                    new_creases.push(Crease {
                        id: EdgeId(next_crease),
                        vertices,
                        ..crease.clone()
                    });
                    next_crease += 1;
                }
            }
        }
    }
    let mut created = Vec::with_capacity(chords.len());
    for chord in &chords {
        created.push(EdgeId(next_crease));
        new_creases.push(Crease {
            id: EdgeId(next_crease),
            vertices: *chord,
            // Its letter is derived from the order below.
            kind: CreaseKind::Folded(Letter::Valley),
            made_at: step,
        });
        next_crease += 1;
    }
    let root = {
        let r = state
            .face_position(parts.root)
            .ok_or(Refusal::UnknownRoot { face: parts.root })?;
        child_of[r]
            .iter()
            .copied()
            .find(|&a| !new_faces[a].moving)
            .or_else(|| new_faces.iter().position(|n| !n.moving))
            .ok_or(Refusal::NothingStays)?
    };
    let mut next = StateParts {
        sheet: parts.sheet.clone(),
        vertices,
        creases: kept_creases.into_iter().chain(new_creases).collect(),
        faces: new_faces.iter().map(|n| n.face.clone()).collect(),
        root: new_faces[root].face.id,
        root_isometry: geometry.isometries[new_faces[root].old],
        order: LayerOrder::new(),
        view: parts.view,
        step,
    };
    let new_topology = Topology::build(&next)?;

    // Hinges: creases between a moving and a stationary face.
    let pending_from = next.creases.len() - chords.len();
    let mut unfolded = Vec::new();
    let mut refolds: Vec<(usize, Letter)> = Vec::new();
    for k in 0..next.creases.len() {
        let [f, g] = match new_topology.crease_faces[k][..] {
            [f, g] => [f, g],
            _ => continue,
        };
        if new_faces[f].moving == new_faces[g].moving || k >= pending_from {
            continue;
        }
        let crease = &mut next.creases[k];
        let on_line = crease.vertices.iter().all(|&v| class_of(v) == 0);
        match (on_line, crease.kind) {
            (true, CreaseKind::Flat(remembered)) => {
                crease.kind = CreaseKind::Folded(remembered);
                refolds.push((k, remembered));
            }
            (true, CreaseKind::Folded(letter)) => {
                crease.kind = CreaseKind::Flat(letter);
                unfolded.push(crease.id);
            }
            _ => {
                return Err(Refusal::DegenerateSplit {
                    face: new_faces[f].face.id,
                });
            }
        }
    }

    // Isometries, derived and checked against the prediction.
    let new_geometry = Geometry::derive(&next, &new_topology, root, TOL)?;
    let reflection = analysis.axis().reflection();
    for (a, nfce) in new_faces.iter().enumerate() {
        let old = geometry.isometries[nfce.old];
        let predicted = if nfce.moving {
            reflection.after(&old)
        } else {
            old
        };
        let points = nfce.face.ring.iter().map(|v| next.vertices[v.index()]);
        let residual = new_geometry.isometries[a].distance_on(&predicted, points);
        if residual > TOL || residual.is_nan() {
            return Err(Refusal::PredictionMismatch {
                face: nfce.face.id,
                residual,
            });
        }
    }

    next.order = carry_and_place(state, analysis, &new_faces, &child_of, &next, &new_geometry)?;

    // Letters of the new creases and the refolds.
    let mut refolded = Vec::with_capacity(refolds.len());
    let pending: Vec<usize> = (pending_from..next.creases.len())
        .chain(refolds.iter().map(|&(k, _)| k))
        .collect();
    for k in pending {
        let letter = derived_letter(&next, &new_topology, &new_geometry, k)?;
        next.creases[k].kind = CreaseKind::Folded(letter);
    }
    for (k, remembered) in refolds {
        if let CreaseKind::Folded(letter) = next.creases[k].kind {
            refolded.push(Refold {
                edge: next.creases[k].id,
                remembered,
                letter,
            });
        }
    }

    let moving_faces: Vec<FaceId> = new_faces
        .iter()
        .filter(|n| n.moving)
        .map(|n| n.face.id)
        .collect();
    let touched: BTreeSet<FaceId> = new_faces
        .iter()
        .filter(|n| n.moving || split[n.old])
        .map(|n| n.face.id)
        .collect();
    let landed = State::make_after(next, state, &touched)?;
    unfolded.sort_unstable();
    Ok((
        landed,
        Landed {
            moving_faces,
            created,
            unfolded,
            refolded,
            split: chords.len(),
        },
    ))
}

/// Split an augmented ring at its two transitions between the moving (+1)
/// and stationary (−1) runs, each through exactly one vertex on the line.
/// Returns the moving ring, then the stationary ring; each starts at the
/// other's last vertex, so `[moving[0], stationary[0]]` is the chord.
fn split_ring(
    ring: &[VertexId],
    class_of: &impl Fn(VertexId) -> i8,
) -> Option<(Vec<VertexId>, Vec<VertexId>)> {
    let n = ring.len();
    let nonzero: Vec<usize> = (0..n).filter(|&j| class_of(ring[j]) != 0).collect();
    let (mut enter, mut leave, mut cuts) = (None, None, 0);
    for (k, &i) in nonzero.iter().enumerate() {
        let j = nonzero[(k + 1) % nonzero.len()];
        let (ci, cj) = (class_of(ring[i]), class_of(ring[j]));
        if ci == cj {
            continue;
        }
        if (j + n - i - 1) % n != 1 {
            return None;
        }
        cuts += 1;
        let at = (i + 1) % n;
        if ci == -1 {
            enter = Some(at);
        } else {
            leave = Some(at);
        }
    }
    let (enter, leave) = (enter?, leave?);
    if cuts != 2 {
        return None;
    }
    let arc = |from: usize, to: usize| {
        let mut out = Vec::new();
        let mut j = from;
        loop {
            out.push(ring[j]);
            if j == to {
                break;
            }
            j = (j + 1) % n;
        }
        out
    };
    let moving = arc(enter, leave);
    let stationary = arc(leave, enter);
    (moving.len() >= 3 && stationary.len() >= 3).then_some((moving, stationary))
}

/// The new order: untouched pairs kept, children of old pairs carried by
/// class, moving × stationary pairs placed.
fn carry_and_place(
    state: &State,
    analysis: &Analysis,
    new_faces: &[NewFace],
    child_of: &[Vec<usize>],
    next: &StateParts,
    geometry: &Geometry,
) -> Result<LayerOrder, Refusal> {
    let faces = state.faces();
    let touched_old: Vec<bool> = (0..faces.len())
        .map(|f| analysis.moving[f] || child_of[f].len() > 1)
        .collect();
    let overlap = |a: usize, b: usize| {
        convex::boxes_overlap(&geometry.boxes[a], &geometry.boxes[b], 0.0)
            && convex::penetration(&geometry.images[a], &geometry.images[b]) > TOL
    };
    let id = |a: usize| next.faces[a].id;
    let set = |order: &mut LayerOrder, upper: usize, lower: usize| {
        order
            .set_above(id(upper), id(lower))
            .map_err(|_| Refusal::DuplicateId {
                what: "face",
                id: id(upper).0,
            })
    };

    let mut order = LayerOrder::new();
    for (pair, lo_above) in state.order().pairs() {
        let Some(lo_above) = lo_above else {
            continue;
        };
        let (Some(f), Some(g)) = (
            state.face_position(pair.lo()),
            state.face_position(pair.hi()),
        ) else {
            continue;
        };
        if !touched_old[f] && !touched_old[g] {
            let (a, b) = (child_of[f][0], child_of[g][0]);
            if lo_above {
                set(&mut order, a, b)?;
            } else {
                set(&mut order, b, a)?;
            }
            continue;
        }
        for &a in &child_of[f] {
            for &b in &child_of[g] {
                if new_faces[a].moving != new_faces[b].moving || !overlap(a, b) {
                    continue;
                }
                // A moving block turns over, so its inner order reverses.
                let a_above = lo_above != new_faces[a].moving;
                if a_above {
                    set(&mut order, a, b)?;
                } else {
                    set(&mut order, b, a)?;
                }
            }
        }
    }

    let stationary_boxes: Vec<[f64; 4]> = new_faces
        .iter()
        .zip(&geometry.boxes)
        .map(|(n, b)| {
            if n.moving {
                convex::bounding_box(&[])
            } else {
                *b
            }
        })
        .collect();
    let index = BoxIndex::new(stationary_boxes);
    let on_top = analysis.direction == Direction::Valley;
    for a in (0..new_faces.len()).filter(|&a| new_faces[a].moving) {
        for b in index.query(&geometry.boxes[a], 0.0) {
            let penetration = convex::penetration(&geometry.images[a], &geometry.images[b]);
            if penetration <= TOL {
                continue;
            }
            if penetration < MIN_FEATURE && penetration < thinner(geometry, a, b) - TOL {
                return Err(sliver(state, new_faces, next, geometry, a, b, penetration));
            }
            let moving_above = match &analysis.tuck {
                Some(tuck) => !tuck.ends_above[new_faces[b].old],
                None => on_top,
            };
            if moving_above {
                set(&mut order, a, b)?;
            } else {
                set(&mut order, b, a)?;
            }
        }
    }
    Ok(order)
}

/// The lesser width of two faces' images.
///
/// A face between μ/2 and μ wide is allowed (the thin-piece rule), and lying
/// across another face it overlaps by its own width, less than μ. That
/// overlap is the face, not a sliver between two faces, so the sliver rule
/// only refuses an overlap thinner than both faces. On the random campaign
/// this exempted 31 of 685 sliver refusals; the rest were overlaps of 1e-4 to
/// 1e-3 between faces several times wider.
fn thinner(geometry: &Geometry, a: usize, b: usize) -> f64 {
    convex::width(&geometry.images[a]).min(convex::width(&geometry.images[b]))
}

/// A sliver between the moving face at position `a` and the stationary face
/// at `b`, named in the parent state the user is looking at: the moving
/// vertex that lands deepest inside the stationary face, and that face (the
/// parent's face, should the fold have split it).
fn sliver(
    state: &State,
    new_faces: &[NewFace],
    next: &StateParts,
    geometry: &Geometry,
    a: usize,
    b: usize,
    penetration: f64,
) -> Refusal {
    let (at, _) = deepest(&geometry.images[a], &geometry.images[b]);
    let ring = &next.faces[a].ring;
    let front_up = geometry.isometries[a].front_up();
    Refusal::Sliver {
        vertex: ring[ring_position(at, ring.len(), front_up)],
        face: state.faces()[new_faces[b].old].id,
        penetration,
    }
}

/// The vertex of `p` deepest inside `q` (the least distance to `q`'s edge
/// lines), and that depth.
fn deepest(p: &[Point], q: &[Point]) -> (usize, f64) {
    let planes: Vec<HalfPlane> = (0..q.len())
        .filter_map(|i| HalfPlane::left_of(q[i], q[(i + 1) % q.len()]))
        .collect();
    let mut best = (0, f64::NEG_INFINITY);
    for (i, &x) in p.iter().enumerate() {
        let depth = planes
            .iter()
            .map(|h| h.signed_distance(x))
            .fold(f64::INFINITY, f64::min);
        if depth > best.1 {
            best = (i, depth);
        }
    }
    best
}

/// A folded crease's letter from the order: valley iff its front-up face lies
/// below the other.
fn derived_letter(
    next: &StateParts,
    topology: &Topology,
    geometry: &Geometry,
    k: usize,
) -> Result<Letter, Refusal> {
    let crease = &next.creases[k];
    let [f, g] = match topology.crease_faces[k][..] {
        [f, g] => [f, g],
        _ => {
            return Err(Refusal::CreaseFaceCount {
                edge: crease.id,
                faces: topology.crease_faces[k].len(),
            });
        }
    };
    let (f_up, g_up) = (
        geometry.isometries[f].front_up(),
        geometry.isometries[g].front_up(),
    );
    let ids = [next.faces[f].id, next.faces[g].id];
    if f_up == g_up {
        return Err(Refusal::HingeOrientation {
            edge: crease.id,
            faces: ids,
            kind: "folded",
        });
    }
    let (up, other) = if f_up {
        (ids[0], ids[1])
    } else {
        (ids[1], ids[0])
    };
    match next.order.above(other, up) {
        Some(true) => Ok(Letter::Valley),
        Some(false) => Ok(Letter::Mountain),
        None => Err(Refusal::LayerOrder {
            violations: FacePair::new(up, other)
                .map(|pair| Violation::MissingPair { pair })
                .into_iter()
                .collect(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rings_split_at_two_transitions() {
        // A square 0..3 crossed by a line through new vertices 4 (on 0–1) and
        // 5 (on 2–3): 0 and 3 stationary, 1 and 2 moving.
        let ring: Vec<VertexId> = [0, 4, 1, 2, 5, 3].map(VertexId).to_vec();
        let class = |v: VertexId| match v.0 {
            0 | 3 => -1,
            1 | 2 => 1,
            _ => 0,
        };
        let Some((m, s)) = split_ring(&ring, &class) else {
            panic!("no split");
        };
        assert_eq!(m, [4, 1, 2, 5].map(VertexId).to_vec());
        assert_eq!(s, [5, 3, 0, 4].map(VertexId).to_vec());
        // Through a vertex on the line (1) and a new one (5).
        let ring: Vec<VertexId> = [0, 1, 2, 5, 3].map(VertexId).to_vec();
        let class = |v: VertexId| match v.0 {
            0 | 3 => -1,
            2 => 1,
            _ => 0,
        };
        let Some((m, s)) = split_ring(&ring, &class) else {
            panic!("no split");
        };
        assert_eq!(m, [1, 2, 5].map(VertexId).to_vec());
        assert_eq!(s, [5, 3, 0, 1].map(VertexId).to_vec());
        // A transition with no vertex on the line is not a split.
        let ring: Vec<VertexId> = [0, 1, 2, 3].map(VertexId).to_vec();
        let class = |v: VertexId| if v.0 < 2 { 1 } else { -1 };
        assert!(split_ring(&ring, &class).is_none());
    }

    #[test]
    fn the_deepest_vertex_names_the_sliver() {
        let q = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let p = vec![[0.9999, 0.5], [2.0, 0.0], [2.0, 1.0]];
        let (i, depth) = deepest(&p, &q);
        assert_eq!(i, 0);
        assert!((depth - 1e-4).abs() < 1e-12);
    }
}
