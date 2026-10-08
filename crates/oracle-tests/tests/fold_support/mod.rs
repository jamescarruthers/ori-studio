//! What the Fold oracles share: Fold states as FOLD files, single-pair flips,
//! the seeded Oriedita verification ([`oriedita`]) and the Flat-Folder
//! `verify` runner ([`flat_folder`]).

#![allow(dead_code)]

pub mod flat_folder;
pub mod oriedita;

use std::collections::BTreeMap;

use oristudio_fold::{CreaseKind, FaceId, Letter, State};
use oristudio_layer_order::{FacePair, LayerOrder};
use treemaker_fold::{Assignment, FoldDocument};

/// The state as a FOLD crease pattern with its layer order, view-independent:
/// sheet coordinates; `B`, `M`, `V` and `F` for border, folded and flat
/// creases; faces counter-clockwise in id order; and `faceOrders` naming faces
/// by their index in that order, as `verify` reads them.
pub fn fold_document(state: &State, order: &LayerOrder) -> Result<FoldDocument, String> {
    let vertices = state.vertices().iter().map(|p| p.to_vec()).collect();
    let edges = state
        .creases()
        .iter()
        .map(|crease| crease.vertices.map(|v| v.0 as usize))
        .collect();
    let mut document = FoldDocument::new(vertices, edges);
    document.file_creator = Some("ori-studio oracle-tests".to_string());
    document.edges_assignment = state
        .creases()
        .iter()
        .map(|crease| match crease.kind {
            CreaseKind::Border => Assignment::Boundary,
            CreaseKind::Folded(Letter::Mountain) => Assignment::Mountain,
            CreaseKind::Folded(Letter::Valley) => Assignment::Valley,
            CreaseKind::Flat(_) => Assignment::Flat,
        })
        .collect();
    document.faces_vertices = state
        .faces()
        .iter()
        .map(|face| face.ring.iter().map(|v| v.0 as usize).collect())
        .collect();
    let index: BTreeMap<FaceId, i64> = state
        .faces()
        .iter()
        .enumerate()
        .map(|(i, face)| (face.id, i as i64))
        .collect();
    let id = |face: i64| {
        u32::try_from(face)
            .ok()
            .and_then(|face| index.get(&FaceId(face)))
            .copied()
            .ok_or_else(|| format!("face {face} is not in the state"))
    };
    document.face_orders = order
        .to_fold_face_orders(state.folded_view())
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|[f, g, s]| Ok([id(f)?, id(g)?, s]))
        .collect::<Result<_, String>>()?;
    Ok(document)
}

/// Whether any crease is flat: a precrease, or a fold since undone. Oriedita
/// folds only the folding colours, so it merges faces across these.
pub fn has_flat_creases(state: &State) -> bool {
    state
        .creases()
        .iter()
        .any(|crease| matches!(crease.kind, CreaseKind::Flat(_)))
}

/// `order` with one pair the other way round; none for an undetermined pair.
pub fn flipped(order: &LayerOrder, pair: FacePair) -> Option<LayerOrder> {
    let lo_above = order.above(pair.lo(), pair.hi())?;
    let (upper, lower) = if lo_above {
        (pair.hi(), pair.lo())
    } else {
        (pair.lo(), pair.hi())
    };
    let mut flipped = order.clone();
    flipped.set_above(upper, lower).ok()?;
    Some(flipped)
}

/// A deterministic pick among `n` items for a sequence and a step: SplitMix64's
/// finaliser over both.
pub fn pick(sequence: u64, step: u32, n: usize) -> usize {
    let mut z = sequence
        .wrapping_mul(0x9e37_79b9_7f4a_7c15)
        .wrapping_add(u64::from(step));
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    ((z ^ (z >> 31)) % n.max(1) as u64) as usize
}
