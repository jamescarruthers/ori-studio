//! The Layer order dialog's calls on [`FoldEngine`], across the wasm
//! boundary. `apps/web/src/layer-order/engine/layerOrderWire.ts` holds these
//! shapes in full.
//!
//! ```ts
//! class FoldEngine {
//!   /** Open a constraint session on what a host folded: the CP bridge's
//!    *  source, passed through unchanged. `limits` may be undefined. */
//!   layer_open(source: OristudioCpFoldSource, limits?: LayerLimits): LayerOpenOutcome;
//!   /** The same, then a saved record (its JSON string) restored onto it. */
//!   layer_restore(source: OristudioCpFoldSource, record: string, limits?: LayerLimits):
//!     LayerRestoreOutcome;
//!   /** The pairs deduction leaves open, [lo, hi, …], ascending. */
//!   layer_open_pairs(session: number): Uint32Array;
//!   /** The committed constraints, [subject, object, sign, …]. */
//!   layer_constraints(session: number): Int32Array;
//!   /** The committed list plus one [subject, object, sign]: never commits. */
//!   layer_preview(session: number, candidate: Int32Array, limits?: LayerLimits): LayerPreviewed;
//!   /** Make the whole list the committed one (Add, remove, undo, redo, Clear all). */
//!   layer_commit(session: number, constraints: Int32Array, limits?: LayerLimits): LayerCommitted;
//!   layer_stacks(session: number, side: 'front' | 'back'): LayerStacks;
//!   /** The kernel's paper scene of the order on screen; null with no subfaces. */
//!   layer_scene(session: number, side: 'front' | 'back', model?: OristudioCpFoldedFigureModel):
//!     OristudioCpFoldedPaperScene | null;
//!   /** [upper, lower, …], for the CP bridge's `folded_figure_fold_with_order`. */
//!   layer_oriedita_relations(session: number): Uint32Array;
//!   layer_save(session: number): LayerSaveOutcome;
//!   /** Let a session go; whether it was held. */
//!   layer_close(session: number): boolean;
//!   layer_live(): number;
//! }
//! ```
//!
//! Every call that searches (open, restore, preview, commit) takes
//! `{ maxNodes?, fastNodes?, deadlineMs? }`; the deadline is `deadlineMs`
//! after the call starts, by the worker's clock, and **keep trying is the
//! same call with a larger `deadlineMs`** ([`LayerLimits`]). A call that
//! timed out changed nothing.
//!
//! Large data crosses as typed arrays, copied out of the wasm heap (so a
//! later call that grows it leaves them valid); small results are plain
//! objects. Refusals are values (`{ status: 'refused', refusal: { code, … } }`);
//! only a caller's mistake or a defect throws, as `{ code, message }`
//! ([`LayerCallError`]).
//!
//! E6 (the smallest clashing set, the solution count, X-ray stepping) adds
//! its calls beside these, over the same store.

use js_sys::{Float64Array, Int32Array, Object, Reflect, Uint8Array, Uint32Array};
use oristudio_cp::folding::FoldedFigureModel;
use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

use super::wire::{
    CantFitWire, Committing, LAYER_LIMITS_FIELDS, LayerCallError, LayerFoldSource, LayerLimits,
    LayerOpened, LayerRefusal, LayerRestored, Opening, PackedStacks, Previewed, Restoring, Saving,
    Sides, side_of,
};
use crate::{FoldEngine, js_error, parse, to_js_value};

#[wasm_bindgen]
impl FoldEngine {
    /// Open a constraint session on `source`, the CP bridge's
    /// `{ segments, starting_face_id, aux_segments, digest }` of what the
    /// host folded. `limits` may be `undefined` or `null`.
    pub fn layer_open(&mut self, source: JsValue, limits: JsValue) -> Result<JsValue, JsValue> {
        let source: LayerFoldSource = parse("source", source)?;
        let limits = limits_of(limits)?;
        match self.layers.open(&source, &limits).map_err(thrown)? {
            Opening::Opened(opened) => opened_object(&opened, "ok").map(JsValue::from),
            Opening::Refused(refusal) => refused(&refusal),
        }
    }

    /// Open a session on `source` and restore `record`, a saved record's
    /// JSON string, onto it (decision D10).
    pub fn layer_restore(
        &mut self,
        source: JsValue,
        record: &str,
        limits: JsValue,
    ) -> Result<JsValue, JsValue> {
        let source: LayerFoldSource = parse("source", source)?;
        let limits = limits_of(limits)?;
        match self
            .layers
            .restore(&source, record, &limits)
            .map_err(thrown)?
        {
            Restoring::Restored(restored) => restored_object(&restored),
            Restoring::Refused(refusal) => refused(&refusal),
        }
    }

    /// The pairs deduction leaves open, `[lo, hi, …]`.
    pub fn layer_open_pairs(&self, session: u32) -> Result<Vec<u32>, JsValue> {
        self.layers.open_pairs(session).map_err(thrown)
    }

    /// The committed constraints, `[subject, object, sign, …]`.
    pub fn layer_constraints(&self, session: u32) -> Result<Vec<i32>, JsValue> {
        self.layers.constraints(session).map_err(thrown)
    }

    /// Whether the committed constraints and `candidate`
    /// (`[subject, object, sign]`) leave an order. Never commits.
    pub fn layer_preview(
        &self,
        session: u32,
        candidate: &[i32],
        limits: JsValue,
    ) -> Result<JsValue, JsValue> {
        let limits = limits_of(limits)?;
        let previewed = self
            .layers
            .preview(session, candidate, &limits)
            .map_err(thrown)?;
        Ok(match previewed {
            Previewed::Fits(fit) => Fields::new()
                .text("verdict", "fits")?
                .set(
                    "changed",
                    spots_changed(&fit.changed.front, &fit.changed.back)?,
                )?
                .set("stacks", sides_object(&fit.stacks)?)?
                .plain("stage", &fit.stage)?
                .number("nodes", fit.nodes as f64)?
                .into(),
            Previewed::CantFit(cant) => cant_fit(&cant)?,
            Previewed::TimedOut(out) => Fields::of(&out)?.text("verdict", "timed_out")?.into(),
        })
    }

    /// Make `constraints` (`[subject, object, sign, …]`) the committed list.
    pub fn layer_commit(
        &mut self,
        session: u32,
        constraints: &[i32],
        limits: JsValue,
    ) -> Result<JsValue, JsValue> {
        let limits = limits_of(limits)?;
        let committed = self
            .layers
            .commit(session, constraints, &limits)
            .map_err(thrown)?;
        Ok(match committed {
            Committing::Committed(done) => Fields::new()
                .text("verdict", "committed")?
                .set(
                    "changed",
                    spots_changed(&done.changed.front, &done.changed.back)?,
                )?
                .set("stacks", sides_object(&done.stacks)?)?
                .set("open_pairs", Uint32Array::from(done.open_pairs.as_slice()))?
                .plain("stage", &done.stage)?
                .number("nodes", done.nodes as f64)?
                .into(),
            Committing::CantFit(cant) => cant_fit(&cant)?,
            Committing::TimedOut(out) => Fields::of(&out)?.text("verdict", "timed_out")?.into(),
        })
    }

    /// The order on screen's stacks from `side` (`"front"` or `"back"`).
    pub fn layer_stacks(&self, session: u32, side: &str) -> Result<JsValue, JsValue> {
        let side = side_of(side).map_err(thrown)?;
        Ok(stacks_object(&self.layers.stacks(session, side).map_err(thrown)?)?.into())
    }

    /// The kernel's paper scene of the order on screen from `side`, with the
    /// host's `model` (`undefined` or `null` for the kernel's default).
    pub fn layer_scene(
        &self,
        session: u32,
        side: &str,
        model: JsValue,
    ) -> Result<JsValue, JsValue> {
        let side = side_of(side).map_err(thrown)?;
        let model: FoldedFigureModel = optional("model", model)?;
        let scene = self.layers.scene(session, side, &model).map_err(thrown)?;
        match scene {
            Some(scene) => to_js_value(&scene),
            None => Ok(JsValue::NULL),
        }
    }

    /// The order on screen as Oriedita's relations, `[upper, lower, …]`.
    pub fn layer_oriedita_relations(&self, session: u32) -> Result<Vec<u32>, JsValue> {
        self.layers.oriedita_relations(session).map_err(thrown)
    }

    /// The saved record: `{ status: 'ok', json }`, or refused over budget.
    pub fn layer_save(&self, session: u32) -> Result<JsValue, JsValue> {
        match self.layers.save(session).map_err(thrown)? {
            Saving::Saved { json } => Ok(Fields::new()
                .text("status", "ok")?
                .text("json", &json)?
                .into()),
            Saving::Refused(refusal) => refused(&refusal),
        }
    }

    /// Let a session go; whether it was held.
    pub fn layer_close(&mut self, session: u32) -> bool {
        self.layers.close(session)
    }

    /// How many sessions are held.
    pub fn layer_live(&self) -> u32 {
        u32::try_from(self.layers.len()).unwrap_or(u32::MAX)
    }
}

/// A plain JS object, built field by field: serde for the small parts, typed
/// arrays copied out of the heap for the large ones.
struct Fields(Object);

impl Fields {
    fn new() -> Fields {
        Fields(Object::new())
    }

    /// `value`'s plain object, to add fields to.
    fn of(value: &impl Serialize) -> Result<Fields, JsValue> {
        to_js_value(value)?
            .dyn_into::<Object>()
            .map(Fields)
            .map_err(|_| js_error("js_value", "a result is not an object".to_string()))
    }

    fn set(self, key: &str, value: impl Into<JsValue>) -> Result<Fields, JsValue> {
        Reflect::set(&self.0, &JsValue::from_str(key), &value.into())?;
        Ok(self)
    }

    fn text(self, key: &str, value: &str) -> Result<Fields, JsValue> {
        self.set(key, JsValue::from_str(value))
    }

    /// A count, as JavaScript's number.
    fn number(self, key: &str, value: impl Into<f64>) -> Result<Fields, JsValue> {
        self.set(key, JsValue::from_f64(value.into()))
    }

    fn plain(self, key: &str, value: &impl Serialize) -> Result<Fields, JsValue> {
        let value = to_js_value(value)?;
        self.set(key, value)
    }
}

impl From<Fields> for JsValue {
    fn from(fields: Fields) -> JsValue {
        fields.0.into()
    }
}

/// `{ status, session, faces, front_up, open_pairs, spots }`.
fn opened_object(opened: &LayerOpened, status: &str) -> Result<Fields, JsValue> {
    Fields::new()
        .text("status", status)?
        .number("session", opened.session)?
        .number("faces", opened.faces)?
        .set("front_up", Uint8Array::from(opened.front_up.as_slice()))?
        .set(
            "open_pairs",
            Uint32Array::from(opened.open_pairs.as_slice()),
        )?
        .number("spots", opened.spots)
}

fn restored_object(restored: &LayerRestored) -> Result<JsValue, JsValue> {
    let faces = Fields::new()
        .set("status", Uint8Array::from(restored.faces.status.as_slice()))?
        .set("face", Int32Array::from(restored.faces.face.as_slice()))?
        .set("area", Float64Array::from(restored.faces.area.as_slice()))?;
    Ok(opened_object(&restored.opened, "ok")?
        .set(
            "constraints",
            Int32Array::from(restored.constraints.as_slice()),
        )?
        .plain("outcome", &restored.outcome)?
        .set("saved_faces", faces)?
        .plain("saved_constraints", &restored.constraint_status)?
        .set(
            "saved_order",
            Uint8Array::from(restored.order_status.as_slice()),
        )?
        .into())
}

fn refused(refusal: &LayerRefusal) -> Result<JsValue, JsValue> {
    Ok(Fields::new()
        .text("status", "refused")?
        .plain("refusal", &refusal.to_value())?
        .into())
}

fn cant_fit(cant: &CantFitWire) -> Result<JsValue, JsValue> {
    let mut proof = Fields::of(&cant.proof)?;
    if !cant.proof_faces.is_empty() {
        proof = proof.set("faces", Uint32Array::from(cant.proof_faces.as_slice()))?;
    }
    Ok(Fields::new()
        .text("verdict", "cant_fit")?
        .set("proof", proof)?
        .set("faces", Uint32Array::from(cant.faces.as_slice()))?
        .set(
            "constraints",
            Uint32Array::from(cant.constraints.as_slice()),
        )?
        .into())
}

fn stacks_object(stacks: &PackedStacks) -> Result<Fields, JsValue> {
    Fields::new()
        .set("offsets", Uint32Array::from(stacks.offsets.as_slice()))?
        .set("faces", Uint32Array::from(stacks.faces.as_slice()))
}

fn sides_object(sides: &Sides<PackedStacks>) -> Result<Fields, JsValue> {
    Fields::new()
        .set("front", stacks_object(&sides.front)?)?
        .set("back", stacks_object(&sides.back)?)
}

fn spots_changed(front: &[u32], back: &[u32]) -> Result<Fields, JsValue> {
    Fields::new()
        .set("front", Uint32Array::from(front))?
        .set("back", Uint32Array::from(back))
}

/// A call's limits, `undefined` or `null` for the defaults. A field the
/// limits have no name for is a mistake, not a default: `serde-wasm-bindgen`
/// reads only the fields a struct names, so a misspelt `deadline` would
/// otherwise leave a search with no deadline at all.
fn limits_of(value: JsValue) -> Result<LayerLimits, JsValue> {
    if value.is_undefined() || value.is_null() {
        return Ok(LayerLimits::default());
    }
    let Some(object) = value.dyn_ref::<Object>() else {
        return Err(thrown(LayerCallError::invalid("limits: not an object")));
    };
    for key in Object::keys(object).iter() {
        let key = key.as_string().unwrap_or_default();
        if !LAYER_LIMITS_FIELDS.contains(&key.as_str()) {
            return Err(thrown(LayerCallError::invalid(format!(
                "limits: unknown field {key:?}, expected one of {LAYER_LIMITS_FIELDS:?}"
            ))));
        }
    }
    parse("limits", value)
}

/// `value` parsed, or the default when it is `undefined` or `null`.
fn optional<T: DeserializeOwned + Default>(name: &str, value: JsValue) -> Result<T, JsValue> {
    if value.is_undefined() || value.is_null() {
        Ok(T::default())
    } else {
        parse(name, value)
    }
}

fn thrown(error: LayerCallError) -> JsValue {
    js_error(error.code(), error.to_string())
}
