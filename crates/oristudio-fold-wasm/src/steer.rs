//! The Layer order dialog's engine across the bridge
//! (`implementation-plans/layer-order-dialog.md`, row E7; approach 5): the
//! constraint sessions of `oristudio_fold::steer`, held by handle
//! ([`LayerSessions`]) on the same `FoldEngine` the Fold workspace uses, so
//! the dialog needs no wasm of its own.
//!
//! The dialog runs these in workers of its own (U6), never in the Fold
//! workspace's: a call cannot be interrupted, so its Stop and Cancel
//! terminate the worker, and every session goes with it. Nothing in the
//! Fold workspace calls them, and none of Fold's own calls changes.
//!
//! - [`sessions`]: the store and every call, in plain Rust.
//! - [`wire`]: what crosses, and the codes refusals and errors carry.
//! - [`bindings`]: the `layer_*` calls on `FoldEngine`, with typed arrays.
//!
//! **The two engine paths share these calls** (approach 5): the dialog's
//! worker opens a session on the order its host shows
//! (`layer_open_showing`) or restores the host's record, and keeps it while
//! the user builds constraints, adding each by the preview it saw
//! (`layer_commit_preview`); a host's short-lived engine (H2,
//! `resolveLayerOrder`) restores a record, retries it on the same session
//! when it ran out of time (`layer_restore_record`), reads
//! `layer_oriedita_relations` and is terminated.
//!
//! **E6 adds** the smallest clashing set (`explain`), the solution count and
//! X-ray stepping as calls of their own beside these, over the same store.

pub mod bindings;
pub mod sessions;
pub mod wire;

pub use sessions::LayerSessions;
pub use wire::{
    CantFitKind, CantFitWire, CarriedRow, CommitDone, Committing, FACE_AMBIGUOUS, FACE_GONE,
    FACE_INTACT, LayerCallError, LayerFoldSource, LayerLimits, LayerOpened, LayerRefusal,
    LayerRestored, OpenedOnWire, Opening, PAIR_KEPT, PAIR_MOVED, PAIR_UNRESOLVED, PackedStacks,
    PreviewFits, Previewed, RestoredOutcome, Restoring, SavedFace, SavedFaces, Saving, Sides,
    candidate_of, constraints_of, flat_pairs, relations_of, side_of, triples_of,
};
