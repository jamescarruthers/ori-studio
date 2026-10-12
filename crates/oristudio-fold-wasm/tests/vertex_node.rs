//! The swivel by its edge across the wasm boundary (`wasm-pack test
//! --node`): the document's new form (`via: 'edge'`) arrives as a plain JS
//! object, its question and its landing leave as plain objects, its
//! refusals are values, and a `via` this build does not know is a thrown
//! `invalid_input` envelope. `tests/vertex.rs` covers the same natively.

#![cfg(target_arch = "wasm32")]

use serde::Serialize;
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

use oristudio_fold_wasm::FoldEngine;

fn js(value: Value) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .expect("plain object")
}

fn json_of(value: JsValue) -> Value {
    serde_wasm_bindgen::from_value(value).expect("json-compatible value")
}

/// The flat square with its diagonal precreased.
fn diagonal_square(engine: &mut FoldEngine) -> u32 {
    let made = json_of(
        engine
            .sheet(js(
                json!({ "shape": { "kind": "square" }, "startSide": "front" }),
            ))
            .expect("sheet"),
    );
    let sheet = made["state"].as_u64().expect("handle") as u32;
    let precrease = json!({
        "kind": "precrease",
        "line": { "via": "free", "through": [[0.0, 0.0], [1.0, 1.0]] },
        "direction": "valley",
        "moving": [0.0, 1.0],
        "seed": { "scope": "all" }
    });
    let landed = json_of(
        engine
            .apply(sheet, js(precrease), JsValue::UNDEFINED)
            .expect("precrease"),
    );
    landed["state"].as_u64().expect("handle") as u32
}

fn swivel(edge: [f64; 2]) -> Value {
    json!({
        "kind": "swivel",
        "via": "edge",
        "pivot": [0.8, 0.8 * (std::f64::consts::PI / 8.0).tan()],
        "edge": edge,
        "target": { "via": "crease", "at": [0.5, 0.5] },
        "seed": { "scope": "all" },
        "direction": "valley"
    })
}

#[wasm_bindgen_test]
fn a_swivel_by_its_edge_crosses_the_boundary_in_plain_objects() {
    let mut engine = FoldEngine::new();
    let parent = diagonal_square(&mut engine);
    let asked = json_of(
        engine
            .compound_analysis(parent, js(swivel([0.5, 0.0])), JsValue::UNDEFINED)
            .expect("question"),
    );
    assert_eq!(asked["status"], "ok", "{asked}");
    assert_eq!(asked["family"], "vertex");
    assert_eq!(asked["analysis"]["kind"], "swivel-by-edge");
    assert_eq!(
        asked["analysis"]["creases"]
            .as_array()
            .map(|c| c.iter().map(|c| c["letter"].clone()).collect::<Vec<_>>()),
        Some(vec![
            json!("valley"),
            json!("mountain"),
            json!("valley"),
            json!("valley")
        ])
    );
    assert_eq!(asked["emergents"], json!([true, true]));

    let applied = json_of(
        engine
            .apply(parent, js(swivel([0.5, 0.0])), JsValue::UNDEFINED)
            .expect("apply"),
    );
    assert_eq!(applied["status"], "ok", "{applied}");
    assert_eq!(applied["compound"]["kind"], "swivel");
    let tried = json_of(
        engine
            .vertex_fold(parent, js(swivel([0.5, 0.0])), JsValue::NULL)
            .expect("vertex fold"),
    );
    assert_eq!(tried["result"], "landed", "{tried}");

    // Inside the paper: no edge, a refusal value naming the point.
    let refused = json_of(
        engine
            .apply(parent, js(swivel([0.5, 0.3])), JsValue::UNDEFINED)
            .expect("refusal value"),
    );
    assert_eq!(refused["refusal"]["code"], "swivel_not_an_edge");

    // A `via` this build does not know: the caller's mistake, thrown.
    let mut sideways = swivel([0.5, 0.0]);
    sideways["via"] = json!("sideways");
    let thrown = engine
        .apply(parent, js(sideways), JsValue::UNDEFINED)
        .expect_err("an unknown via");
    assert_eq!(json_of(thrown)["code"], "invalid_input");
}
