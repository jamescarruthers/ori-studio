//! The vertex folds on the bridge (`ops_squash_family`), natively, through
//! JSON shaped exactly as the web app sends it: the document's squash,
//! petal, rabbit-ear and swivel ops resolve their sheet anchors in the
//! parent; a stored step replays, or is refused by code (`choice_needed`,
//! `choice_broken` and the engine's own); a choice of orders is held, picked
//! and stored as the document's `completion`, which replays to the state it
//! was picked as; every landing reports as the step's `compound`, family
//! `vertex`; and the compound question names what a tool previews.

#![cfg(not(target_arch = "wasm32"))]

use oristudio_fold::random::{self, Rng};
use oristudio_fold::{PlainFold, Seed, Sheet, StartSide, State};
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
    seen(state, p, true)
}

/// The sheet point of the layer at the model point `p`, the one the viewer
/// sees on top or the one at the bottom.
fn seen(state: &State, p: Point, top: bool) -> Point {
    let mut stack = state.stack_at(p).unwrap_or_default();
    if state.view().flipped == top {
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

/// The square valley-folded along b d: the two-layer triangle a b d.
fn two_layer_triangle(bridge: &mut Bridge) -> u32 {
    let sheet = square(bridge);
    land(bridge, sheet, valley([[1.0, 0.0], [0.0, 1.0]], [1.0, 1.0]))
}

/// The states `random::folded_between` draws, built through the bridge
/// with the same draws: each drawn plain fold landed by the engine is sent
/// as a valley or mountain along its model line (as `crimp_tuck.rs` builds
/// them; each test file here is a crate of its own).
fn drawn(bridge: &mut Bridge, rng: &mut Rng, least: usize, most: usize) -> (State, u32) {
    assert!(!rng.chance(0.2), "a rectangle; this test draws squares");
    let mut state =
        State::flat(Sheet::square(), StartSide::Front).unwrap_or_else(|e| panic!("{e}"));
    let mut handle = square(bridge);
    let want = least + rng.below(most - least + 1);
    let mut landed = 0;
    for _ in 0..10 {
        if landed >= want {
            break;
        }
        let Some(fold) = random::plain_fold(&state, rng) else {
            continue;
        };
        if let Ok(folded) = state.fold(&fold) {
            state = folded.state;
            handle = land(bridge, handle, plain_step(&fold));
            landed += 1;
        }
    }
    (state, handle)
}

fn plain_step(fold: &PlainFold) -> Value {
    json!({
        "kind": match fold.direction {
            oristudio_fold::Direction::Valley => "valley",
            oristudio_fold::Direction::Mountain => "mountain",
        },
        "line": { "via": "model", "line": json_of(&fold.line) },
        "side": json_of(&fold.side),
        "seed": match &fold.seed {
            Seed::All => json!({ "scope": "all" }),
            Seed::Depth { at, layers } => json!({ "scope": "depth", "at": at, "layers": layers }),
            Seed::Flaps { at } => json!({ "scope": "flaps", "at": at }),
        },
    })
}

/// The two-layer triangle's rabbit ear through both layers, its fourth
/// crease toward `emergent`, the paper inside it across from its right
/// angle staying.
fn ear(emergent: Value) -> Value {
    json!({
        "kind": "rabbit-ear",
        "corners": [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]],
        "emergent": emergent,
        "seed": { "scope": "all" },
        "stayer": [0.6, 0.35],
        "direction": "valley"
    })
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
    // The step's summary is its diff from the parent.
    let summary = ok(bridge.step_summary(child));
    assert_eq!(
        summary["summary"]["diff"]["added"].as_array().map(Vec::len),
        Some(2)
    );
    // Its picture: the lower crease with its arrow and the push onto the
    // spine, the one the tool previewed, the landed cover at the head.
    let pictured = ok(bridge.step_action(child))["action"].clone();
    let previewed =
        ok(bridge.action(tri, &op(squash.clone()), &Choices::default()))["action"].clone();
    assert_eq!(pictured["kind"], "fold", "{pictured}");
    assert_eq!(pictured["direction"], "valley");
    assert!(
        pictured["line"].is_array() && pictured["push"].is_object(),
        "{pictured}"
    );
    assert!(
        pictured["grip"].is_object() && pictured["pleat"].is_null(),
        "{pictured}"
    );
    assert!(previewed["grip"]["hidden_image"].is_null(), "{previewed}");
    for key in ["line", "spans", "moving", "push"] {
        assert_eq!(pictured[key], previewed[key], "{key}");
    }
    // Every other plain fold's question is still the caller's mistake.
    assert!(matches!(
        bridge.analyse(tri, &op(squash.clone()), &Choices::default()),
        Err(BridgeError::InvalidInput(_))
    ));
    // The tools' call lands the same state, held and reported alike.
    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, tri, &op(squash), &Choices::default()));
    assert_eq!(tried["result"], "landed");
    assert_eq!(tried["compound"], applied["compound"]);
    let again = tried["state"].as_u64().unwrap_or_default() as u32;
    let parts = |h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    assert_eq!(parts(again), parts(child));
    assert_eq!(ok(bridge.step_action(again))["action"], pictured);
    // Its summary and its picture are drawn on its parent, which must still
    // be held.
    assert!(bridge.release(tri));
    assert!(matches!(
        bridge.step_summary(child),
        Err(BridgeError::ParentReleased { .. })
    ));
    assert!(matches!(
        bridge.step_action(child),
        Err(BridgeError::ParentReleased { .. })
    ));
}

/// The two-layer triangle's rabbit ear with its 180° ray (the vertex
/// spike's case 3a) lands one ear — its fourth crease the ridge, so the
/// question lists no orders — and a step stored before kept a `ridge`, and
/// sometimes an order: neither is read, and the step lands the same ear.
#[test]
fn a_rabbit_ear_lands_one_ear_whatever_an_older_step_stored() {
    let mut bridge = Bridge::new();
    let tri = two_layer_triangle(&mut bridge);
    let asked = analysis(&bridge, tri, ear(json!([1.0, 0.0])));
    assert_eq!(asked["analysis"]["kind"], "rabbit-ear");
    assert_eq!(
        asked["analysis"]["candidates"].as_array().map(Vec::len),
        Some(3)
    );
    // Candidates at 180°, 270° and 45°: the 45° ray splits the paper that
    // stays; the other two land.
    assert_eq!(asked["emergents"], json!([true, true, false]), "{asked}");
    assert!(asked.get("ridges").is_none(), "{asked}");
    let step = ear(json!([-1.0, 0.0]));
    let asked = analysis(&bridge, tri, step.clone());
    assert!(asked["orders"].is_null(), "{asked}");

    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, tri, &op(step.clone()), &Choices::default()));
    assert_eq!(tried["result"], "landed", "{tried}");
    assert!(
        tried["compound"]["stored"]
            .as_object()
            .is_some_and(|o| o.is_empty())
    );
    let landed = tried["state"].as_u64().unwrap_or_default() as u32;
    // Pictured as a fan's crease from its center, with its arrow.
    let pictured = ok(bridge.step_action(landed))["action"].clone();
    assert!(
        pictured["line"].is_array() && pictured["grip"].is_object(),
        "{pictured}"
    );
    assert!(pictured["push"].is_null(), "{pictured}");
    let parts = |bridge: &Bridge, h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    let ear_parts = parts(&bridge, landed);

    // An older step: its ridge on a corner's crease, which the folder could
    // pick before.
    let mut older = step.clone();
    older["ridge"] = json!([0.6, -0.3]);
    let replayed = land(&mut bridge, tri, older.clone());
    assert_eq!(parts(&bridge, replayed), ear_parts);
    // And an order over two faces that overlap, stored either way round.
    let state = bridge
        .state(landed)
        .unwrap_or_else(|e| panic!("{e}"))
        .clone();
    let (pair, _) = state
        .order()
        .pairs()
        .next()
        .unwrap_or_else(|| panic!("no pairs"));
    let witness = |f| {
        let ring = &state.face(f).unwrap_or_else(|| unreachable!()).ring;
        let n = ring.len() as f64;
        ring.iter().fold([0.0, 0.0], |c, v| {
            let p = state.vertices()[v.0 as usize];
            [c[0] + p[0] / n, c[1] + p[1] / n]
        })
    };
    let [f, g] = pair.faces();
    for s in [1, -1] {
        let stored = json!({
            "completion": { "faces": [witness(f), witness(g)], "orders": [[0, 1, s]] }
        });
        let replayed = apply(&mut bridge, tri, older.clone(), stored);
        assert_eq!(replayed["status"], "ok", "{replayed}");
        let handle = replayed["state"].as_u64().unwrap_or_default() as u32;
        assert_eq!(parts(&bridge, handle), ear_parts);
    }
}

/// A swivel through every layer of a four-layer stack (seed 6717's drawn
/// state; the vertex campaign's rare fan fold whose fourth crease rising
/// still leaves its layers' order open) leaves six orders: held, picked,
/// stored as `completion`, and replayed to the state picked; the question
/// lists them; without one the step needs a choice, with a witness off the
/// paper it is broken.
#[test]
fn a_swivels_choice_is_held_picked_stored_and_replayed() {
    let mut bridge = Bridge::new();
    let mut rng = Rng::new(6717);
    let (state, stack) = drawn(&mut bridge, &mut rng, 2, 6);
    let vertex = [0.4436590394786357, 0.7632986397979732];
    let toward = [
        [0.4753910246047879, 0.7240438743894912],
        [0.40464276139972694, 0.7953234041560532],
        [0.4843887832532005, 0.7931137946588755],
    ];
    let step = json!({
        "kind": "swivel",
        "vertex": seen_top(&state, vertex),
        "toward": toward.map(|p| seen_top(&state, p)),
        "emergent": [0.6707501901150905, 0.7416833437934075],
        "seed": { "scope": "all" },
        "stayer": seen(&state, [0.45737502364320937, 0.7697157086191782], false),
        "direction": "mountain"
    });

    let mut pending = Pending::new();
    let tried = ok(pending.try_fold(&mut bridge, stack, &op(step.clone()), &Choices::default()));
    assert_eq!(tried["result"], "choose", "{tried}");
    assert_eq!(tried["count"]["orders"], 6);
    assert_eq!(tried["components"], json!([6]));
    let handle = tried["pending"].as_u64().unwrap_or_default() as u32;
    let picked = ok(pending.pick(&mut bridge, handle, &[1]));
    assert_eq!(picked["compound"]["family"], "vertex");
    assert_eq!(picked["compound"]["kind"], "swivel");
    let stored = picked["compound"]["stored"].clone();
    // The document's completion: FOLD triples over witnesses.
    assert!(stored["completion"]["orders"][0].is_array(), "{stored}");
    let picked_state = picked["state"].as_u64().unwrap_or_default() as u32;
    // A pick that names no order.
    let none = json_of(
        &pending
            .pick(&mut bridge, handle, &[6])
            .unwrap_or_else(|e| panic!("{e}")),
    );
    assert_eq!(none["refusal"]["code"], "no_such_choice");
    assert!(pending.release(handle));
    assert!(!pending.release(handle));

    // The question lists the orders, each the completion it replays to.
    let asked = analysis(&bridge, stack, step.clone());
    assert_eq!(
        asked["orders"]["count"],
        json!({ "orders": 6, "exact": true })
    );
    let orders = asked["orders"]["orders"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(!orders.is_empty() && orders.len() <= 6);
    let parts = |bridge: &Bridge, h: u32| bridge.state(h).map(|s| s.parts().clone()).ok();
    let mut by_order = Vec::new();
    for completion in &orders {
        let landed = land_with(
            &mut bridge,
            stack,
            &step,
            json!({ "completion": completion }),
        );
        by_order.push(parts(&bridge, landed));
    }
    by_order.dedup();
    assert_eq!(by_order.len(), orders.len());

    // Replay with the stored choice: the state picked.
    let replayed = land_with(&mut bridge, stack, &step, stored.clone());
    assert_eq!(parts(&bridge, replayed), parts(&bridge, picked_state));
    // Without it: a choice the step does not store.
    let needed = apply(&mut bridge, stack, step.clone(), json!({}));
    assert_eq!(
        needed["refusal"],
        json!({ "code": "choice_needed", "choice": "completion" })
    );
    // A witness off the paper: broken.
    let mut off = stored.clone();
    off["completion"]["faces"][0] = json!([3.0, 3.0]);
    let broken = apply(&mut bridge, stack, step, off);
    assert_eq!(broken["refusal"]["code"], "choice_broken");
    assert_eq!(broken["refusal"]["broken"], "witness");
}

fn land_with(bridge: &mut Bridge, state: u32, step: &Value, chosen: Value) -> u32 {
    let applied = apply(bridge, state, step.clone(), chosen);
    assert_eq!(applied["status"], "ok", "{applied}");
    applied["state"].as_u64().unwrap_or_default() as u32
}

/// A squash with one order has none to list; a flap the analysis refuses
/// is refused by the question, with the engine's code.
#[test]
fn the_question_of_a_squash() {
    let mut bridge = Bridge::new();
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
    assert_eq!(squash["emergents"], json!([]));
    // Seen from below, the layers over the flap cover it.
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
    // Its fourth crease straight up splits the paper that stays: refused,
    // offering the two that land, each as one state.
    let refused = apply(
        &mut bridge,
        sheet,
        swivel([0.5, 0.3], [0.0, 1.0]),
        json!({}),
    );
    assert_eq!(
        refused["refusal"]["code"], "fan_fourth_beside_stayer",
        "{refused}"
    );
    let fixes = refused["fixes"].as_array().cloned().unwrap_or_default();
    assert_eq!(fixes.len(), 2);
    for fix in &fixes {
        assert_eq!(fix["fix"], "use_emergent");
        let direction: Point =
            serde_json::from_value(fix["direction"].clone()).unwrap_or_else(|e| panic!("{e}"));
        let landed = apply(&mut bridge, sheet, swivel([0.5, 0.3], direction), json!({}));
        assert_eq!(landed["compound"]["kind"], "swivel", "{landed}");
    }
    // The top layer's ear toward the folded edge runs into the layer
    // below: refused, offering the rays that land.
    let tri = two_layer_triangle(&mut bridge);
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
    let refused = apply(&mut bridge, tri, ear.clone(), json!({}));
    assert_eq!(refused["refusal"]["code"], "fan_ray_blocked", "{refused}");
    let fixes = refused["fixes"].as_array().cloned().unwrap_or_default();
    assert_eq!(fixes.len(), 2);
    assert!(fixes.iter().all(|f| f["fix"] == "use_emergent"));
    // The question says the same of every candidate: the two the fixes
    // offer land, the one asked for does not, and it lists no orders.
    let asked = analysis(&bridge, tri, ear);
    let candidates = asked["analysis"]["candidates"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let emergents = asked["emergents"].as_array().cloned().unwrap_or_default();
    assert_eq!(emergents.len(), candidates.len());
    let landing: Vec<&Value> = candidates
        .iter()
        .zip(&emergents)
        .filter(|(_, lands)| **lands == true)
        .map(|(candidate, _)| candidate)
        .collect();
    let offered: Vec<&Value> = fixes.iter().map(|f| &f["direction"]).collect();
    assert_eq!(landing, offered);
    let asked_for = asked["analysis"]["emergent"].as_u64().unwrap_or(9) as usize;
    assert_eq!(emergents[asked_for], false);
    assert!(asked["orders"].is_null());
    // A pending choice that was never held is the caller's mistake.
    let mut pending = Pending::new();
    assert!(pending.pick(&mut bridge, 7, &[0]).is_err());
}
