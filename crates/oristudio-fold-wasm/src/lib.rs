//! `wasm-bindgen` wrapper around `oristudio-fold`, the Fold workspace's engine
//! (plan D1, Phase 4a).
//!
//! Coarse calls over states held by handle ([`bridge`]): one call per step, the
//! state never crosses the boundary, and every sheet anchor a stored step names
//! is resolved here ([`resolve`]). Inputs are the Fold document's own shapes;
//! outputs are the engine's serde types, `json_compatible` (plain objects and
//! arrays, no `Map`s), in a `status` envelope ([`wire`]). A refusal is a value,
//! `{ status: 'refused', refusal: { code, … }, fixes, faces, vertices }`, with
//! stable codes and never a sentence; only a caller's mistake (malformed
//! input, a handle this engine does not hold) throws, as the `{ code, message }`
//! envelope every bridge uses.
//!
//! ```ts
//! // `apps/web/src/fold/engine/foldEngineWire.ts` holds these shapes in full.
//! export function fold_engine_version(): number;   // FOLD_ENGINE_VERSION
//! export class FoldEngine {
//!   constructor();
//!   free(): void;
//!   /** The flat sheet: `{ status: 'ok', state, summary }` or a refusal. */
//!   sheet(paper: FoldPaper): Outcome<{ state: number; summary: Summary }>;
//!   /** What a fold along a line would move, without folding (D14 tier 2). */
//!   analyse(state: number, op: FoldOp): Outcome<{ analysis: FoldAnalysis }>;
//!   /** One step: a new handle, the fold's report (null for a turn or rotate)
//!    *  and a summary. `choices` may be undefined. The parent stays held. */
//!   apply(state: number, op: FoldOp, choices?: FoldChoices):
//!     Outcome<{ state: number; report: FoldReport | null; summary: Summary }>;
//!   summary(state: number): Summary;
//!   /** The keys of the state's `fs1` fingerprint, in no order. */
//!   canonical_keys(state: number): string[];
//!   /** Let states go; how many were held. */
//!   release(states: Uint32Array): number;
//!   clear(): void;
//!   /** How many states are held. */
//!   live(): number;
//! }
//! ```
//!
//! Later waves add their calls to [`FoldEngine`] the same way — the scene and
//! the cross-section as queries on a handle, axiom lines and Import CP as op
//! kinds the [`wire::Op`] enum already names and refuses as `unsupported_op`.
//!
//! Without `oristudio-fold`'s `kernel` feature for now (it is being built in
//! parallel): see `Cargo.toml` and the size budget in `README.md`.

pub mod bridge;
pub mod canonical;
pub mod resolve;
pub mod wire;

use std::sync::Once;

use oristudio_fold::FOLD_ENGINE_VERSION;
use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;

use crate::bridge::Bridge;
use crate::wire::{BridgeError, Choices, Op, Paper};

static PANIC_HOOK: Once = Once::new();

#[derive(Serialize)]
struct JsErrorEnvelope {
    code: &'static str,
    message: String,
}

/// The engine's behaviour version (`FOLD_ENGINE_VERSION`), stored beside
/// every cached state.
#[wasm_bindgen]
pub fn fold_engine_version() -> u32 {
    FOLD_ENGINE_VERSION
}

/// Every landed state a worker holds, by handle. See the TypeScript sketch at
/// the top of this file.
#[wasm_bindgen]
pub struct FoldEngine {
    inner: Bridge,
}

impl Default for FoldEngine {
    fn default() -> FoldEngine {
        FoldEngine::new()
    }
}

#[wasm_bindgen]
impl FoldEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> FoldEngine {
        PANIC_HOOK.call_once(console_error_panic_hook::set_once);
        FoldEngine {
            inner: Bridge::new(),
        }
    }

    /// The flat sheet a sequence starts from.
    pub fn sheet(&mut self, paper: JsValue) -> Result<JsValue, JsValue> {
        let paper: Paper = parse("paper", paper)?;
        to_js_value(&self.inner.sheet(&paper))
    }

    /// What a fold along a line would move, without folding.
    pub fn analyse(&self, state: u32, op: JsValue) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        to_js_value(&self.inner.analyse(state, &op).map_err(bridge_error)?)
    }

    /// One step from `state`; `choices` may be `undefined` or `null`.
    pub fn apply(&mut self, state: u32, op: JsValue, choices: JsValue) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        let choices: Choices = if choices.is_undefined() || choices.is_null() {
            Choices::default()
        } else {
            parse("choices", choices)?
        };
        to_js_value(
            &self
                .inner
                .apply(state, &op, &choices)
                .map_err(bridge_error)?,
        )
    }

    pub fn summary(&self, state: u32) -> Result<JsValue, JsValue> {
        to_js_value(&self.inner.summary(state).map_err(bridge_error)?)
    }

    /// The keys of the state's `fs1` fingerprint, in no order.
    pub fn canonical_keys(&self, state: u32) -> Result<Vec<String>, JsValue> {
        self.inner.canonical_keys(state).map_err(bridge_error)
    }

    /// Let states go; how many were held.
    pub fn release(&mut self, states: &[u32]) -> u32 {
        let released = states.iter().filter(|&&s| self.inner.release(s)).count();
        u32::try_from(released).unwrap_or(u32::MAX)
    }

    /// Let every state go.
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    /// How many states are held.
    pub fn live(&self) -> u32 {
        u32::try_from(self.inner.len()).unwrap_or(u32::MAX)
    }
}

fn parse<T: DeserializeOwned>(name: &str, value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value)
        .map_err(|error| js_error("invalid_input", format!("{name}: {error}")))
}

fn bridge_error(error: BridgeError) -> JsValue {
    js_error(error.code(), error.to_string())
}

fn to_js_value(value: &impl Serialize) -> Result<JsValue, JsValue> {
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    value
        .serialize(&serializer)
        .map_err(|error| js_error("js_value", error.to_string()))
}

fn js_error(code: &'static str, message: String) -> JsValue {
    let fallback = message.clone();
    to_js_value(&JsErrorEnvelope { code, message })
        .unwrap_or_else(|_| JsValue::from_str(fallback.as_str()))
}
