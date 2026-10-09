//! The bridge across the wasm boundary (`wasm-pack test --node`): inputs
//! arrive as plain JS objects in the document's shapes, results leave as
//! plain objects (never `Map`s), refusals are values and a caller's mistakes
//! are thrown `{ code, message }` envelopes. `tests/bridge.rs` covers the
//! engine behind it natively.

#![cfg(target_arch = "wasm32")]

use serde::Serialize;
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

use oristudio_fold_wasm::{FoldEngine, fold_engine_version};

/// A JSON value as the plain JS object the app sends.
fn js(value: Value) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .expect("plain object")
}

/// A returned JS value as JSON. Integer-valued numbers come back as
/// integers, so numbers are compared through `as_f64`.
fn json_of(value: JsValue) -> Value {
    serde_wasm_bindgen::from_value(value).expect("json-compatible value")
}

fn book_step() -> Value {
    json!({
        "kind": "valley",
        "line": { "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] },
        "moving": [0.75, 0.5],
        "seed": { "scope": "all" }
    })
}

fn square(engine: &mut FoldEngine) -> u32 {
    let made = json_of(
        engine
            .sheet(js(
                json!({ "shape": { "kind": "square" }, "startSide": "front" }),
            ))
            .expect("sheet"),
    );
    assert_eq!(made["status"], "ok", "{made}");
    made["state"].as_u64().expect("handle") as u32
}

#[wasm_bindgen_test]
fn the_engine_version_is_the_crates() {
    assert_eq!(fold_engine_version(), oristudio_fold::FOLD_ENGINE_VERSION);
}

#[wasm_bindgen_test]
fn a_step_lands_a_new_handle_with_its_report_and_summary() {
    let mut engine = FoldEngine::new();
    let sheet = square(&mut engine);
    let applied = json_of(
        engine
            .apply(sheet, js(book_step()), JsValue::UNDEFINED)
            .expect("apply"),
    );
    assert_eq!(applied["status"], "ok", "{applied}");
    let state = applied["state"].as_u64().expect("handle") as u32;
    assert_ne!(state, sheet);
    assert_eq!(applied["summary"]["creases"]["valley"].as_f64(), Some(1.0));
    assert_eq!(
        applied["report"]["created"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(applied["report"]["direction"], "valley");
    assert_eq!(engine.live(), 2);

    // `null` choices are none, like `undefined`.
    let turned = json_of(
        engine
            .apply(
                state,
                js(json!({ "kind": "turn", "axis": "vertical" })),
                JsValue::NULL,
            )
            .expect("turn"),
    );
    assert_eq!(turned["report"], Value::Null);
    assert_eq!(turned["summary"]["view"]["flipped"], true);

    let summary = json_of(engine.summary(state).expect("summary"));
    assert_eq!(summary["faces"].as_f64(), Some(2.0));
    let keys = engine.canonical_keys(state).expect("keys");
    assert!(keys.iter().any(|k| k.starts_with("o:")), "{keys:?}");

    assert_eq!(engine.release(&[sheet, sheet, state]), 2);
    assert_eq!(engine.live(), 1);
    engine.clear();
    assert_eq!(engine.live(), 0);
}

#[wasm_bindgen_test]
fn analysis_and_refusals_are_values() {
    let mut engine = FoldEngine::new();
    let sheet = square(&mut engine);
    let applied = json_of(
        engine
            .apply(sheet, js(book_step()), JsValue::UNDEFINED)
            .expect("apply"),
    );
    let book = applied["state"].as_u64().expect("handle") as u32;

    let analysed = json_of(
        engine
            .analyse(
                book,
                js(json!({
                    "kind": "valley",
                    "line": { "via": "crease", "at": [0.5, 0.5] },
                    "seed": { "scope": "flaps", "at": [[0.75, 0.5]] }
                })),
            )
            .expect("analyse"),
    );
    assert_eq!(analysed["status"], "ok", "{analysed}");
    assert_eq!(
        analysed["analysis"]["flaps"].as_array().map(Vec::len),
        Some(2)
    );

    let mut everything = book_step();
    everything["moving"] = json!([0.25, 0.5]);
    let refused = json_of(
        engine
            .apply(book, js(everything), JsValue::UNDEFINED)
            .expect("a refusal is a value"),
    );
    assert_eq!(refused["status"], "refused");
    assert_eq!(refused["refusal"], json!({ "code": "nothing_stays" }));
    assert_eq!(refused["fixes"][0]["fix"], "pick_flap");

    let jump = json_of(
        engine
            .apply(
                book,
                js(json!({ "kind": "cp-jump", "cpJson": "{}", "orderJson": "{}", "origin": "cp" })),
                JsValue::UNDEFINED,
            )
            .expect("a refusal is a value"),
    );
    assert_eq!(
        jump["refusal"],
        json!({ "code": "unsupported_op", "feature": "cp_jump" })
    );
    let choice = json_of(
        engine
            .apply(
                book,
                js(book_step()),
                js(json!({ "root": { "n": [1.0, 0.0], "d": 0.5 } })),
            )
            .expect("a refusal is a value"),
    );
    assert_eq!(choice["refusal"]["code"], "unexpected_choice");
    assert_eq!(engine.live(), 2, "no refusal lands a state");
}

#[wasm_bindgen_test]
fn a_callers_mistakes_are_thrown_envelopes() {
    let mut engine = FoldEngine::new();
    let sheet = square(&mut engine);
    let code = |error: JsValue| json_of(error)["code"].clone();

    let missing_line = engine
        .apply(
            sheet,
            js(json!({ "kind": "valley", "seed": { "scope": "all" } })),
            JsValue::UNDEFINED,
        )
        .expect_err("no line");
    assert_eq!(code(missing_line), "invalid_input");
    let unknown = engine
        .apply(sheet + 7, js(book_step()), JsValue::UNDEFINED)
        .expect_err("no such state");
    assert_eq!(code(unknown), "unknown_state");
    assert_eq!(
        code(engine.summary(0).expect_err("never a handle")),
        "unknown_state"
    );
    let bad_paper = engine
        .sheet(js(json!({ "shape": { "kind": "circle" } })))
        .expect_err("no such shape");
    assert_eq!(code(bad_paper), "invalid_input");
    let turn = engine
        .analyse(sheet, js(json!({ "kind": "turn", "axis": "vertical" })))
        .expect_err("nothing to analyse");
    assert_eq!(code(turn), "invalid_input");
    let error = json_of(
        engine
            .apply(sheet, js(book_step()), js(json!("not choices")))
            .expect_err("choices must be an object"),
    );
    assert_eq!(error["code"], "invalid_input");
    assert!(
        error["message"]
            .as_str()
            .is_some_and(|m| m.starts_with("choices"))
    );
}
