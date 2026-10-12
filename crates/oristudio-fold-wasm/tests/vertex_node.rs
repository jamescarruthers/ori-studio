//! The petal fold across the wasm boundary (`wasm-pack test --node`): its H
//! named by the two ends, as the document stores it, arrives as a plain
//! object; the compound question answers what the fold creases; the fold
//! lands through the tools' call and replays through `apply` to the same
//! state. `tests/vertex.rs` covers it natively.
//!
//! The sheet points are named on the same route folded by the engine in
//! process, as the tools name them from the scene.

#![cfg(target_arch = "wasm32")]

use oristudio_fold::{
    Direction, PlainFold, Sheet, Side, Squash, StartSide, State, VertexChoices, VertexOutcome,
};
use oristudio_geometry::Line;
use serde::Serialize;
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use wasm_bindgen_test::*;

use oristudio_fold_wasm::FoldEngine;

type Point = [f64; 2];

fn js(value: Value) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .expect("plain object")
}

fn json_of(value: JsValue) -> Value {
    serde_wasm_bindgen::from_value(value).expect("json-compatible value")
}

/// The sheet point under the model point `p` on the layer the viewer sees on
/// top at `near`.
fn on_top(state: &State, p: Point, near: Point) -> Point {
    let mut stack = state.stack_at(near).expect("a stack");
    if state.view().flipped {
        stack.reverse();
    }
    state
        .isometry(stack[0])
        .expect("an isometry")
        .inverse()
        .apply(p)
}

fn valley(state: &State, p: Point, q: Point, toward: Point) -> State {
    let line = Line::from_points(p, q).expect("a line");
    let side = Side::of_point(&line, toward).expect("a side");
    state
        .fold(&PlainFold::new(line, side, Direction::Valley))
        .expect("a fold")
        .state
}

fn squash(state: &State, flap: Point) -> State {
    let op = Squash {
        flap,
        target: None,
        direction: Direction::Valley,
    };
    match state
        .squash(&op, &VertexChoices::default())
        .expect("a squash")
    {
        VertexOutcome::Landed(folded) => folded.state,
        VertexOutcome::ChooseOrder(_) => panic!("a choice of orders"),
    }
}

/// The preliminary base by the diagonal route (the vertex spike's case 1b),
/// folded in process, and the steps that fold it as the document stores
/// them.
fn preliminary() -> (State, Vec<Value>) {
    let flat = State::flat(Sheet::square(), StartSide::Front).expect("a sheet");
    let half = valley(&flat, [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]);
    let tri = valley(&half, [0.0, 0.0], [0.5, 0.5], [0.9, 0.1]);
    let first = on_top(&tri, [0.1, 0.5], [0.1, 0.5]);
    let one = squash(&tri, first);
    let turned = one.turn_over();
    let second = on_top(&turned, [0.1, 0.7], [0.1, 0.7]);
    let base = squash(&turned, second);
    let free = |through: [Point; 2], moving: Point| {
        json!({
            "kind": "valley",
            "line": { "via": "free", "through": through },
            "moving": moving,
            "seed": { "scope": "all" }
        })
    };
    let steps = vec![
        free([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]),
        free([[0.0, 0.0], [0.5, 0.5]], [0.9, 0.1]),
        json!({ "kind": "squash", "flap": first, "direction": "valley" }),
        json!({ "kind": "turn", "axis": "vertical" }),
        json!({ "kind": "squash", "flap": second, "direction": "valley" }),
    ];
    (base, steps)
}

#[wasm_bindgen_test]
fn a_petal_fold_by_its_ends_crosses_the_boundary_and_replays() {
    let (base, steps) = preliminary();
    let mut engine = FoldEngine::new();
    let made = json_of(
        engine
            .sheet(js(
                json!({ "shape": { "kind": "square" }, "startSide": "front" }),
            ))
            .expect("sheet"),
    );
    let mut state = made["state"].as_u64().expect("handle") as u32;
    for step in steps {
        let applied = json_of(
            engine
                .apply(state, js(step.clone()), JsValue::UNDEFINED)
                .expect("apply"),
        );
        assert_eq!(applied["status"], "ok", "{step}: {applied}");
        state = applied["state"].as_u64().expect("handle") as u32;
    }
    let t22 = (std::f64::consts::PI / 8.0).tan() * 0.5;
    let petal = json!({
        "kind": "petal",
        "ends": [
            on_top(&base, [t22, 0.5], [0.2, 0.45]),
            on_top(&base, [0.5, t22], [0.45, 0.2]),
        ],
        "petal": on_top(&base, [0.26, 0.2], [0.26, 0.2]),
        "direction": "valley"
    });

    let asked = json_of(
        engine
            .compound_analysis(state, js(petal.clone()), JsValue::NULL)
            .expect("the question"),
    );
    assert_eq!(asked["status"], "ok", "{asked}");
    assert_eq!(asked["family"], "vertex");
    assert_eq!(asked["analysis"]["kind"], "petal");
    assert_eq!(asked["analysis"]["scores_line"], true);
    assert_eq!(asked["analysis"]["scores_kites"], json!([true, true]));

    let tried = json_of(
        engine
            .vertex_fold(state, js(petal.clone()), JsValue::UNDEFINED)
            .expect("vertex_fold"),
    );
    assert_eq!(tried["status"], "ok", "{tried}");
    assert_eq!(tried["result"], "landed");
    assert_eq!(tried["compound"]["kind"], "petal");
    assert_eq!(
        tried["compound"]["created"].as_array().map(Vec::len),
        Some(6)
    );
    let folded = tried["state"].as_u64().expect("handle") as u32;

    let replayed = json_of(
        engine
            .apply(state, js(petal), JsValue::UNDEFINED)
            .expect("apply"),
    );
    assert_eq!(replayed["status"], "ok", "{replayed}");
    let again = replayed["state"].as_u64().expect("handle") as u32;
    let keys = |engine: &FoldEngine, h: u32| {
        let mut keys = engine.canonical_keys(h).expect("keys");
        keys.sort();
        keys
    };
    assert_eq!(keys(&engine, again), keys(&engine, folded));
}
