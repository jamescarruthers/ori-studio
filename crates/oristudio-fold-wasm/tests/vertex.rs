//! The vertex folds on the bridge (`ops_squash_family`), natively, through
//! JSON shaped exactly as the web app sends it: the document's squash,
//! petal, rabbit-ear and swivel ops resolve their sheet anchors in the
//! parent; a stored step replays, or is refused by code (`choice_needed`,
//! `choice_broken` and the engine's own); a choice of orders is held, picked
//! and stored as the document's `completion`, which replays to the state it
//! was picked as; every landing reports as the step's `compound`, family
//! `vertex`; and the compound question names what a tool previews.

#![cfg(not(target_arch = "wasm32"))]

use oristudio_fold::State;
use oristudio_fold_wasm::bridge::Bridge;
use oristudio_fold_wasm::ops_squash_family::Pending;
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

/// The compound question of a vertex op: its family's answer.
fn analysis(bridge: &Bridge, state: u32, step: Value) -> Value {
    let asked = ok(bridge.compound_analysis(state, &op(step), &Choices::default()));
    assert_eq!(asked["family"], "vertex", "{asked}");
    asked
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

    let analysed = analysis(&bridge, tri, squash.clone());
    assert_eq!(analysed["analysis"]["kind"], "squash");
    assert_eq!(analysed["analysis"]["share"], 0.0);

    let applied = apply(&mut bridge, tri, squash.clone(), json!({}));
    assert_eq!(applied["status"], "ok", "{applied}");
    assert!(applied["report"].is_null());
    let vertex = &applied["compound"];
    assert_eq!(vertex["family"], "vertex");
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
    // The tools' call lands the same state, held and reported alike.
    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, tri, &op(squash), &Choices::default()));
    assert_eq!(tried["result"], "landed");
    assert_eq!(tried["compound"], applied["compound"]);
    let again = tried["state"].as_u64().unwrap_or_default() as u32;
    let parts = |h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    assert_eq!(parts(again), parts(child));
    // Its summary is the diff from its parent, which must still be held;
    // its picture, none, needs no parent.
    assert!(bridge.release(tri));
    assert!(matches!(
        bridge.step_summary(child),
        Err(BridgeError::ParentReleased { .. })
    ));
    assert!(ok(bridge.step_action(child))["action"].is_null());
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
    let analysed = analysis(&bridge, tri, ear(json!([1.0, 0.0])));
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
    assert_eq!(picked["compound"]["family"], "vertex");
    let stored = picked["compound"]["stored"].clone();
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

/// What a tool chooses among comes with the compound question, as a reverse
/// fold's does: the orders a vertex fold leaves, each the `completion` that
/// picks it, and a rabbit ear's two ridge options — the far wedge's rays,
/// each landing with one order — so the ear the tools preview is decided by
/// its ridge, not by a bare order.
#[test]
fn the_question_lists_a_rabbit_ears_orders_and_ridges() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let tri = land(
        &mut bridge,
        sheet,
        valley([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]),
    );
    let ear = json!({
        "kind": "rabbit-ear",
        "corners": [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        "emergent": [-1.0, 0.0],
        "seed": { "scope": "all" },
        "stayer": [0.6, 0.35],
        "direction": "valley"
    });
    let asked = analysis(&bridge, tri, ear.clone());
    // Without its ridge: the two orders the ridge decides.
    assert_eq!(
        asked["orders"]["count"],
        json!({ "orders": 2, "exact": true })
    );
    let orders = asked["orders"]["orders"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert_eq!(orders.len(), 2);
    assert_eq!(asked["orders"]["more"], false);
    // Each listed order is a completion the step replays to.
    let mut by_order = Vec::new();
    for completion in &orders {
        let landed = apply(
            &mut bridge,
            tri,
            ear.clone(),
            json!({ "completion": completion }),
        );
        assert_eq!(landed["status"], "ok", "{landed}");
        by_order.push(landed["state"].as_u64().unwrap_or_default() as u32);
    }
    // The two ridge options: rays of the far wedge, each landing alone.
    let ridges = asked["ridges"].as_array().cloned().unwrap_or_default();
    assert_eq!(ridges.len(), 2, "{asked}");
    let parts = |bridge: &Bridge, h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    let mut by_ridge = Vec::new();
    for ridge in &ridges {
        assert_eq!(ridge["lands"], true, "{ridge}");
        assert!(ridge["orders"].is_null(), "{ridge}");
        let mut ridged = ear.clone();
        ridged["ridge"] = ridge["direction"].clone();
        let landed = apply(&mut bridge, tri, ridged.clone(), json!({}));
        assert_eq!(landed["status"], "ok", "{landed}");
        by_ridge.push(parts(
            &bridge,
            landed["state"].as_u64().unwrap_or_default() as u32,
        ));
        // Asked with its ridge, it has no order and no ridge left to choose.
        let decided = analysis(&bridge, tri, ridged);
        assert!(decided["orders"].is_null(), "{decided}");
        assert_eq!(decided["ridges"], json!([]));
    }
    // The ridges are the two orders, one each.
    assert_ne!(by_ridge[0], by_ridge[1]);
    let picked: Vec<_> = by_order.iter().map(|&h| parts(&bridge, h)).collect();
    assert!(by_ridge.iter().all(|state| picked.contains(state)));
    // A ridge names its ray: a corner's, or the emergent one's.
    assert!(
        ridges
            .iter()
            .all(|r| r["given"].is_null() || r["given"].as_u64().is_some_and(|k| k < 3))
    );

    // A squash with one order has none to list, and no ridges.
    let small = small_triangle(&mut bridge);
    let flap = seen_top(
        bridge.state(small).unwrap_or_else(|e| panic!("{e}")),
        [0.1, 0.5],
    );
    let squash = analysis(
        &bridge,
        small,
        json!({ "kind": "squash", "flap": flap, "direction": "valley" }),
    );
    assert!(squash["orders"].is_null());
    assert_eq!(squash["ridges"], json!([]));
    // A flap the analysis refuses — seen from below, the layers over it
    // cover it — is refused by the question, with the engine's code.
    let covered = json_of(
        &bridge
            .compound_analysis(
                small,
                &op(json!({ "kind": "squash", "flap": flap, "direction": "mountain" })),
                &Choices::default(),
            )
            .unwrap_or_else(|e| panic!("{e}")),
    );
    assert_eq!(
        covered["refusal"]["code"], "squash_flap_covered",
        "{covered}"
    );
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
    assert_eq!(landed["compound"]["kind"], "swivel", "{landed}");
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
