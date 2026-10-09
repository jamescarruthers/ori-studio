//! The vertex folds on the bridge (`ops_squash_family`), natively, through
//! JSON shaped exactly as the web app sends it: the document's squash,
//! petal, rabbit-ear and swivel ops resolve their sheet anchors in the
//! parent; a stored step replays, or is refused by code (`choice_needed`,
//! `choice_broken` and the engine's own); a choice of orders is held, picked
//! and stored as the document's `completion`, which replays to the state it
//! was picked as; and the analysis names what a tool previews.

#![cfg(not(target_arch = "wasm32"))]

use oristudio_fold::State;
use oristudio_fold_wasm::bridge::Bridge;
use oristudio_fold_wasm::ops_squash_family::{Pending, analysis};
use oristudio_fold_wasm::wire::{BridgeError, Choices, Op, Outcome, Paper};
use serde::Serialize;
use serde_json::{Value, json};

type Point = [f64; 2];

fn op(value: Value) -> Op {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("op {value}: {e}"))
}

fn choices(value: Value) -> Choices {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("choices {value}: {e}"))
}

fn json_of(value: &impl Serialize) -> Value {
    serde_json::to_value(value).unwrap_or_else(|e| panic!("{e}"))
}

fn ok<T: Serialize>(outcome: Result<Outcome<T>, BridgeError>) -> Value {
    let outcome = json_of(&outcome.unwrap_or_else(|e| panic!("{e}")));
    assert_eq!(outcome["status"], "ok", "{outcome}");
    outcome
}

fn square(bridge: &mut Bridge) -> u32 {
    let paper: Paper =
        serde_json::from_value(json!({ "shape": { "kind": "square" }, "startSide": "front" }))
            .unwrap_or_else(|e| panic!("{e}"));
    match bridge.sheet(&paper) {
        Outcome::Ok(made) => made.state,
        Outcome::Refused(r) => panic!("{:?}", r.refusal),
    }
}

fn apply(bridge: &mut Bridge, state: u32, step: Value, chosen: Value) -> Value {
    json_of(
        &bridge
            .apply(state, &op(step.clone()), &choices(chosen))
            .unwrap_or_else(|e| panic!("{step}: {e}")),
    )
}

fn land(bridge: &mut Bridge, state: u32, step: Value) -> u32 {
    let applied = apply(bridge, state, step.clone(), json!({}));
    assert_eq!(applied["status"], "ok", "{step}: {applied}");
    applied["state"].as_u64().unwrap_or_default() as u32
}

/// A valley through every layer on `toward`'s side of the line through two
/// sheet points, as the document stores it.
fn valley(through: [Point; 2], toward: Point) -> Value {
    json!({
        "kind": "valley",
        "line": { "via": "free", "through": through },
        "moving": toward,
        "seed": { "scope": "all" }
    })
}

/// The sheet point the viewer sees on top at the model point `p`.
fn seen_top(state: &State, p: Point) -> Point {
    let mut stack = state.stack_at(p).unwrap_or_default();
    if state.view().flipped {
        stack.reverse();
    }
    state
        .isometry(stack[0])
        .unwrap_or_default()
        .inverse()
        .apply(p)
}

/// The diagonal route's four-layer triangle (the vertex spike's case 1b).
fn small_triangle(bridge: &mut Bridge) -> u32 {
    let sheet = square(bridge);
    let half = land(bridge, sheet, valley([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]));
    // (1, 1) lies on (0, 0) now: the line through (0, 0) and the centre.
    land(bridge, half, valley([[0.0, 0.0], [0.5, 0.5]], [0.9, 0.1]))
}

#[test]
fn a_squash_lands_and_replays_with_its_report_and_motion() {
    let mut bridge = Bridge::new();
    let tri = small_triangle(&mut bridge);
    let flap = seen_top(
        bridge.state(tri).unwrap_or_else(|e| panic!("{e}")),
        [0.1, 0.5],
    );
    let squash = json!({ "kind": "squash", "flap": flap, "direction": "valley" });

    let analysed = ok(analysis(&bridge, tri, &op(squash.clone())));
    assert_eq!(analysed["analysis"]["kind"], "squash");
    assert_eq!(analysed["analysis"]["share"], 0.0);

    let applied = apply(&mut bridge, tri, squash.clone(), json!({}));
    assert_eq!(applied["status"], "ok", "{applied}");
    assert!(applied["report"].is_null());
    let vertex = &applied["vertex"];
    assert_eq!(vertex["kind"], "squash");
    assert_eq!(vertex["created"].as_array().map(Vec::len), Some(2));
    assert_eq!(vertex["motion"]["kind"], "visual");
    assert_eq!(vertex["motion"]["legs"].as_array().map(Vec::len), Some(4));
    // Unique: nothing to store.
    assert!(vertex["stored"].as_object().is_some_and(|o| o.is_empty()));
    let child = applied["state"].as_u64().unwrap_or_default() as u32;
    // The step's summary is its diff from the parent; it has no fold line.
    let summary = ok(bridge.step_summary(child));
    assert_eq!(
        summary["summary"]["diff"]["added"].as_array().map(Vec::len),
        Some(2)
    );
    assert!(ok(bridge.step_action(child))["action"].is_null());
    // The tools' call lands the same state.
    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, tri, &op(squash), &Choices::default()));
    assert_eq!(tried["result"], "landed");
    let again = tried["state"].as_u64().unwrap_or_default() as u32;
    let parts = |h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    assert_eq!(parts(again), parts(child));
}

/// The two-layer triangle's rabbit ear with its 180° ray leaves two orders
/// (the vertex spike's case 3a): held, picked, stored as `completion`, and
/// replayed to the state picked; without it the step needs a choice, with a
/// witness off the paper it is broken.
#[test]
fn a_rabbit_ears_choice_is_held_picked_stored_and_replayed() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let tri = land(
        &mut bridge,
        sheet,
        valley([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]),
    );
    let ear = |emergent: Value| {
        json!({
            "kind": "rabbit-ear",
            "corners": [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
            "emergent": emergent,
            "seed": { "scope": "all" },
            "stayer": [0.6, 0.35],
            "direction": "valley"
        })
    };
    let analysed = ok(analysis(&bridge, tri, &op(ear(json!([1.0, 0.0])))));
    assert_eq!(analysed["analysis"]["kind"], "rabbit-ear");
    let candidates = analysed["analysis"]["candidates"].clone();
    assert_eq!(candidates.as_array().map(Vec::len), Some(3));
    let step = ear(json!([-1.0, 0.0]));

    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, tri, &op(step.clone()), &Choices::default()));
    assert_eq!(tried["result"], "choose", "{tried}");
    assert_eq!(tried["count"]["orders"], 2);
    assert_eq!(tried["components"], json!([2]));
    let handle = tried["pending"].as_u64().unwrap_or_default() as u32;
    let picked = ok(pending.pick(&mut bridge, handle, &[1]));
    let stored = picked["vertex"]["stored"].clone();
    // The document's completion: FOLD triples over witnesses.
    assert!(stored["completion"]["orders"][0].is_array(), "{stored}");
    let picked_state = picked["state"].as_u64().unwrap_or_default() as u32;
    // A pick that names no order.
    let none = json_of(
        &pending
            .pick(&mut bridge, handle, &[2])
            .unwrap_or_else(|e| panic!("{e}")),
    );
    assert_eq!(none["refusal"]["code"], "no_such_choice");
    assert!(pending.release(handle));
    assert!(!pending.release(handle));

    // Replay with the stored choice: the state picked.
    let replayed = apply(&mut bridge, tri, step.clone(), stored.clone());
    assert_eq!(replayed["status"], "ok", "{replayed}");
    let replayed_state = replayed["state"].as_u64().unwrap_or_default() as u32;
    let parts = |h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    assert_eq!(parts(replayed_state), parts(picked_state));
    // Without it: a choice the step does not store.
    let needed = apply(&mut bridge, tri, step.clone(), json!({}));
    assert_eq!(
        needed["refusal"],
        json!({ "code": "choice_needed", "choice": "completion" })
    );
    // A witness off the paper: broken.
    let mut off = stored.clone();
    off["completion"]["faces"][0] = json!([3.0, 3.0]);
    let broken = apply(&mut bridge, tri, step, off);
    assert_eq!(broken["refusal"]["code"], "choice_broken");
    assert_eq!(broken["refusal"]["broken"], "witness");
}

#[test]
fn vertex_refusals_are_codes_with_fixes() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    // One layer: no flap.
    let squash = json!({ "kind": "squash", "flap": [0.3, 0.3], "direction": "valley" });
    let refused = apply(&mut bridge, sheet, squash, json!({}));
    assert_eq!(refused["refusal"]["code"], "squash_no_flap");
    assert_eq!(refused["refusal"]["cause"], "single_layer");
    assert_eq!(refused["faces"], json!([0]));
    // No crease where the petal's H is named.
    let petal = json!({
        "kind": "petal", "crease": [0.3, 0.3], "petal": [0.2, 0.2], "direction": "valley"
    });
    let refused = apply(&mut bridge, sheet, petal, json!({}));
    assert_eq!(refused["refusal"]["code"], "crease_not_found");
    // A swivel's vertex off the paper.
    let swivel = |vertex: Point, emergent: Point| {
        json!({
            "kind": "swivel",
            "vertex": vertex,
            "toward": [[1.0, 0.6], [0.0, 0.6], [0.5, 0.0]],
            "emergent": emergent,
            "seed": { "scope": "all" },
            "stayer": [0.3, 0.9],
            "direction": "valley"
        })
    };
    let refused = apply(
        &mut bridge,
        sheet,
        swivel([1.5, 0.3], [0.0, 1.0]),
        json!({}),
    );
    assert_eq!(refused["refusal"]["code"], "point_off_paper");
    // A swivel lands as one state.
    let landed = apply(
        &mut bridge,
        sheet,
        swivel([0.5, 0.3], [0.0, 1.0]),
        json!({}),
    );
    assert_eq!(landed["vertex"]["kind"], "swivel", "{landed}");
    // The top layer's ear toward the folded edge runs into the layer
    // below: refused, offering the rays that land.
    let tri = land(
        &mut bridge,
        sheet,
        valley([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]),
    );
    let top = seen_top(
        bridge.state(tri).unwrap_or_else(|e| panic!("{e}")),
        [0.3, 0.3],
    );
    let ear = json!({
        "kind": "rabbit-ear",
        "corners": [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        "emergent": [1.0, 1.0],
        "seed": { "scope": "depth", "at": top, "layers": 1 },
        "stayer": [0.6, 0.35],
        "direction": "valley"
    });
    let refused = apply(&mut bridge, tri, ear, json!({}));
    assert_eq!(refused["refusal"]["code"], "fan_ray_blocked", "{refused}");
    let fixes = refused["fixes"].as_array().cloned().unwrap_or_default();
    assert_eq!(fixes.len(), 2);
    assert!(fixes.iter().all(|f| f["fix"] == "use_emergent"));
    // A pending choice that was never held is the caller's mistake.
    let mut pending = Pending::new();
    assert!(pending.pick(&mut bridge, 7, &[0]).is_err());
}
