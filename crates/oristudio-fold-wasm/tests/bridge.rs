//! The bridge natively, through JSON shaped exactly as the web app sends it:
//! the document's ops resolve against their parent, refusals come back as
//! codes with fixes and never a sentence, and the engine's own classic
//! sequences replay through the bridge to the outcomes its fixtures record.
//! `tests/node.rs` covers the same calls across the wasm boundary.

#![cfg(not(target_arch = "wasm32"))]

use std::path::PathBuf;

use oristudio_fold_wasm::bridge::Bridge;
use oristudio_fold_wasm::wire::{BridgeError, Choices, Op, Outcome, Paper};
use serde::Serialize;
use serde_json::{Value, json};

fn paper(value: Value) -> Paper {
    serde_json::from_value(value).unwrap_or_else(|e| panic!("paper: {e}"))
}

fn op(value: Value) -> Op {
    serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("op {value}: {e}"))
}

fn json_of(value: &impl Serialize) -> Value {
    serde_json::to_value(value).unwrap_or_else(|e| panic!("{e}"))
}

fn square(bridge: &mut Bridge) -> u32 {
    match bridge.sheet(&paper(
        json!({ "shape": { "kind": "square" }, "startSide": "front" }),
    )) {
        Outcome::Ok(made) => made.state,
        Outcome::Refused(r) => panic!("{:?}", r.refusal),
    }
}

/// Apply and expect a landing: the new handle and the whole result as JSON.
fn land(bridge: &mut Bridge, state: u32, step: Value) -> (u32, Value) {
    match bridge.apply(state, &op(step.clone()), &Choices::default()) {
        Ok(Outcome::Ok(applied)) => (applied.state, json_of(&applied)),
        Ok(Outcome::Refused(r)) => panic!("{step} refused: {}", json_of(&r)),
        Err(e) => panic!("{step}: {e}"),
    }
}

/// Apply and expect a refusal: its JSON.
fn refuse(bridge: &mut Bridge, state: u32, step: Value) -> Value {
    match bridge.apply(state, &op(step.clone()), &Choices::default()) {
        Ok(Outcome::Refused(r)) => json_of(&Outcome::<()>::Refused(r)),
        Ok(Outcome::Ok(applied)) => panic!("{step} landed: {}", json_of(&applied)),
        Err(e) => panic!("{step}: {e}"),
    }
}

/// G1's book fold, as the document stores it: x = 0.5, the right half over
/// the left.
fn book_step() -> Value {
    json!({
        "kind": "valley",
        "line": { "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] },
        "moving": [0.75, 0.5],
        "seed": { "scope": "all" }
    })
}

fn book(bridge: &mut Bridge) -> u32 {
    let sheet = square(bridge);
    land(bridge, sheet, book_step()).0
}

/// Every string in a JSON value, recursively.
fn strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(s) => out.push(s.clone()),
        Value::Array(items) => items.iter().for_each(|v| strings(v, out)),
        Value::Object(map) => map.values().for_each(|v| strings(v, out)),
        _ => {}
    }
}

#[test]
fn sheets_land_or_refuse_with_the_engines_codes() {
    let mut bridge = Bridge::new();
    let made = bridge.sheet(&paper(json!({ "shape": { "kind": "square" } })));
    let made = json_of(&made);
    assert_eq!(made["status"], "ok");
    assert_eq!(made["summary"]["faces"], 1);
    assert_eq!(made["summary"]["step"], 0);
    assert_eq!(made["summary"]["creases"]["border"], 4);
    assert_eq!(made["summary"]["view"]["flipped"], false);

    let back = json_of(&bridge.sheet(&paper(json!({
        "shape": { "kind": "rectangle", "aspect": [1.0, 0.5] },
        "startSide": "back"
    }))));
    assert_eq!(back["summary"]["view"]["flipped"], true);
    assert_eq!(back["summary"]["sheet"][2], json!([1.0, 0.5]));

    let hexagon = json_of(&bridge.sheet(&paper(json!({
        "shape": { "kind": "polygon", "points": [
            [0.5, 0.0], [1.0, 0.25], [1.0, 0.75], [0.5, 1.0], [0.0, 0.75], [0.0, 0.25]
        ] }
    }))));
    assert_eq!(hexagon["status"], "ok", "{hexagon}");

    for (shape, code) in [
        (
            json!({ "kind": "polygon", "points": [[0.0, 0.0], [1.0, 0.0], [0.5, 0.3], [0.5, 1.0]] }),
            "sheet_not_convex",
        ),
        (
            json!({ "kind": "rectangle", "aspect": [0.0, 1.0] }),
            "invalid_rectangle",
        ),
    ] {
        let refused = json_of(&bridge.sheet(&paper(json!({ "shape": shape }))));
        assert_eq!(refused["status"], "refused");
        assert_eq!(refused["refusal"]["code"], code, "{refused}");
    }
    assert_eq!(bridge.len(), 3, "only landed sheets are held");
}

#[test]
fn a_document_fold_resolves_its_anchors_in_the_parent() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let (state, applied) = land(&mut bridge, sheet, book_step());
    assert_ne!(state, sheet);
    assert_eq!(applied["state"], state);
    assert_eq!(applied["summary"]["step"], 1);
    assert_eq!(applied["summary"]["faces"], 2);
    assert_eq!(applied["summary"]["creases"]["valley"], 1);
    let report = &applied["report"];
    assert_eq!(report["moving"].as_array().map(Vec::len), Some(1));
    assert_eq!(report["created"].as_array().map(Vec::len), Some(1));
    assert_eq!(report["direction"], "valley");
    assert_eq!(report["line"], json!({ "n": [1.0, 0.0], "d": 0.5 }));

    // The second fold's free line is given by sheet points of the folded
    // form, on either layer: (0.75, 0.5) lies on the flap, whose image is
    // (0.25, 0.5), so with (0.1, 0.5) on the layer below the line is y = 0.5
    // in the model frame.
    let second = |through: Value| {
        json!({
            "kind": "valley",
            "line": { "via": "free", "through": through },
            "moving": [0.25, 0.75],
            "seed": { "scope": "all" }
        })
    };
    let (_, landed) = land(&mut bridge, state, second(json!([[0.1, 0.5], [0.75, 0.5]])));
    assert_eq!(landed["report"]["line"]["n"], json!([0.0, 1.0]));
    assert_eq!(landed["summary"]["faces"], 4);
    // (0.25, 0.5) lies under (0.75, 0.5): one point of the folded form.
    let same = refuse(
        &mut bridge,
        state,
        second(json!([[0.25, 0.5], [0.75, 0.5]])),
    );
    assert_eq!(same["refusal"]["code"], "degenerate_line");
    // The parent is still held: a replay's cache keeps both.
    assert!(bridge.summary(state).is_ok());
}

#[test]
fn refusals_are_codes_with_fixes_and_never_sentences() {
    let mut bridge = Bridge::new();
    let book = book(&mut bridge);
    // Everything on the left of x = 0.5 is both layers: nothing stays.
    let refused = refuse(
        &mut bridge,
        book,
        json!({
            "kind": "valley",
            "line": { "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] },
            "moving": [0.25, 0.5],
            "seed": { "scope": "all" }
        }),
    );
    assert_eq!(refused["status"], "refused");
    assert_eq!(refused["refusal"], json!({ "code": "nothing_stays" }));
    let fixes = refused["fixes"].as_array().cloned().unwrap_or_default();
    assert_eq!(fixes.len(), 1, "{refused}");
    assert_eq!(fixes[0]["fix"], "pick_flap");
    assert_eq!(fixes[0]["flaps"].as_array().map(Vec::len), Some(2));
    assert!(refused["faces"].is_array() && refused["vertices"].is_array());

    // Every string in a refusal is a code or an enum, none a sentence.
    let mut text = Vec::new();
    strings(&refused, &mut text);
    assert!(text.iter().all(|s| !s.contains(' ')), "{text:?}");
}

#[test]
fn analysis_reports_the_moving_set_flaps_and_closure() {
    let mut bridge = Bridge::new();
    let book = book(&mut bridge);
    let analysed = bridge
        .analyse(
            book,
            &op(json!({
                "kind": "valley",
                "line": { "via": "crease", "at": [0.5, 0.5] },
                "seed": { "scope": "flaps", "at": [[0.75, 0.5]] }
            })),
        )
        .unwrap_or_else(|e| panic!("{e}"));
    let analysed = json_of(&analysed);
    assert_eq!(analysed["status"], "ok", "{analysed}");
    let analysis = &analysed["analysis"];
    assert_eq!(analysis["flaps"].as_array().map(Vec::len), Some(2));
    assert_eq!(analysis["picked"].as_array().map(Vec::len), Some(1));
    assert_eq!(analysis["added"], json!([]));
    assert_eq!(analysis["moving"].as_array().map(Vec::len), Some(1));
    assert_eq!(bridge.len(), 2, "analysing lands nothing");

    // Turn and rotate move no paper.
    let turn = bridge.analyse(book, &op(json!({ "kind": "turn", "axis": "vertical" })));
    assert!(matches!(turn, Err(BridgeError::InvalidInput(_))));
}

#[test]
fn unfold_and_refold_fold_along_an_existing_crease() {
    let mut bridge = Bridge::new();
    let book = book(&mut bridge);
    // G10: the top layer back along the bend, picked by depth.
    let (open, unfolded) = land(
        &mut bridge,
        book,
        json!({
            "kind": "unfold",
            "crease": [0.5, 0.5],
            "direction": "valley",
            "seed": { "scope": "depth", "at": [0.25, 0.5], "layers": 1 }
        }),
    );
    assert_eq!(
        unfolded["report"]["unfolded"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(unfolded["summary"]["creases"]["flat"], 1);
    assert_eq!(unfolded["summary"]["creases"]["valley"], 0);

    // Now the crease is flat: it refolds, and no longer unfolds.
    let again = refuse(
        &mut bridge,
        open,
        json!({
            "kind": "unfold", "crease": [0.5, 0.5], "direction": "valley",
            "seed": { "scope": "depth", "at": [0.25, 0.5], "layers": 1 }
        }),
    );
    assert_eq!(again["refusal"]["code"], "crease_not_folded");
    let (_, refolded) = land(
        &mut bridge,
        open,
        json!({
            "kind": "refold", "crease": [0.5, 0.5], "direction": "valley",
            "moving": [0.75, 0.5], "seed": { "scope": "all" }
        }),
    );
    let refold = &refolded["report"]["refolded"][0];
    assert_eq!(refold["remembered"], "valley");
    assert_eq!(refold["letter"], "valley");

    // A folded crease does not refold, and a point on no crease names none.
    let folded = refuse(
        &mut bridge,
        book,
        json!({
            "kind": "refold", "crease": [0.5, 0.5], "direction": "valley",
            "moving": [0.25, 0.5], "seed": { "scope": "all" }
        }),
    );
    assert_eq!(folded["refusal"]["code"], "crease_not_flat");
    // The sheet's border is neither flat nor folded.
    for (kind, code) in [
        ("refold", "crease_not_flat"),
        ("unfold", "crease_not_folded"),
    ] {
        let border = refuse(
            &mut bridge,
            book,
            json!({
                "kind": kind, "crease": [0.25, 0.0], "direction": "valley",
                "moving": [0.25, 0.5], "seed": { "scope": "all" }
            }),
        );
        assert_eq!(border["refusal"]["code"], code);
    }
    let nowhere = refuse(
        &mut bridge,
        book,
        json!({
            "kind": "valley", "line": { "via": "crease", "at": [0.3, 0.5] },
            "moving": [0.1, 0.5], "seed": { "scope": "all" }
        }),
    );
    assert_eq!(
        nowhere["refusal"],
        json!({ "code": "crease_not_found", "point": [0.3, 0.5] })
    );
}

#[test]
fn precrease_turn_and_rotate_are_one_step_each() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let (pre, precreased) = land(
        &mut bridge,
        sheet,
        json!({
            "kind": "precrease", "direction": "valley",
            "line": { "via": "free", "through": [[0.0, 0.0], [1.0, 1.0]] },
            "moving": [0.9, 0.1], "seed": { "scope": "all" }
        }),
    );
    assert_eq!(precreased["summary"]["creases"]["flat"], 1);
    assert_eq!(precreased["summary"]["faces"], 2);
    assert_eq!(precreased["summary"]["pairs"], 0, "flat again");

    let (turned, turn) = land(
        &mut bridge,
        pre,
        json!({ "kind": "turn", "axis": "horizontal" }),
    );
    assert_eq!(turn["report"], Value::Null);
    assert_eq!(turn["summary"]["step"], 2);
    assert_eq!(turn["summary"]["view"]["flipped"], true);
    let (_, rotate) = land(
        &mut bridge,
        turned,
        json!({ "kind": "rotate", "rotate": { "amount": "quarter", "direction": "cw" } }),
    );
    assert_eq!(rotate["summary"]["step"], 3);
    let rotation = rotate["summary"]["view"]["rotation"]
        .as_f64()
        .unwrap_or(f64::NAN);
    // π (the horizontal turn) less a quarter turn.
    assert!(
        (rotation - std::f64::consts::FRAC_PI_2).abs() < 1e-12,
        "{rotation}"
    );

    let missing = bridge.apply(
        sheet,
        &op(json!({
            "kind": "precrease",
            "line": { "via": "free", "through": [[0.0, 0.0], [1.0, 1.0]] },
            "moving": [0.9, 0.1], "seed": { "scope": "all" }
        })),
        &Choices::default(),
    );
    assert!(matches!(missing, Err(BridgeError::InvalidInput(_))));
}

#[test]
fn a_model_line_takes_its_side_against_the_normal_as_given() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    // x = 0.5 written with the normal pointing left: its negative side is the
    // right half, which is what moves.
    let (_, right) = land(
        &mut bridge,
        sheet,
        json!({
            "kind": "valley",
            "line": { "via": "model", "line": { "n": [-1.0, 0.0], "d": -0.5 } },
            "side": "negative",
            "seed": { "scope": "all" }
        }),
    );
    let (_, book) = land(&mut bridge, sheet, book_step());
    assert_eq!(right["report"]["moving"], book["report"]["moving"]);
    assert_eq!(
        right["report"]["side"], "positive",
        "canonical in the report"
    );

    let both = bridge.apply(
        sheet,
        &op(json!({
            "kind": "valley",
            "line": { "via": "model", "line": { "n": [1.0, 0.0], "d": 0.5 } },
            "side": "positive", "moving": [0.75, 0.5],
            "seed": { "scope": "all" }
        })),
        &Choices::default(),
    );
    assert!(matches!(both, Err(BridgeError::InvalidInput(_))));
    let zero = bridge.apply(
        sheet,
        &op(json!({
            "kind": "valley",
            "line": { "via": "model", "line": { "n": [0.0, 0.0], "d": 0.5 } },
            "side": "positive", "seed": { "scope": "all" }
        })),
        &Choices::default(),
    );
    assert!(matches!(zero, Err(BridgeError::InvalidInput(_))));
}

#[test]
fn anchors_that_do_not_resolve_are_the_bridges_refusals() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let along = |line: Value, moving: Value| json!({ "kind": "mountain", "line": line, "moving": moving, "seed": { "scope": "all" } });
    let cases = [
        (
            along(
                json!({ "via": "free", "through": [[0.5, 0.0], [0.5, 1.5]] }),
                json!([0.75, 0.5]),
            ),
            json!({ "code": "point_off_paper", "point": [0.5, 1.5] }),
        ),
        (
            along(
                json!({ "via": "free", "through": [[0.5, 0.5], [0.5, 0.5002]] }),
                json!([0.75, 0.5]),
            ),
            json!({ "code": "degenerate_line" }),
        ),
        (
            along(
                json!({ "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] }),
                json!([0.5, 0.25]),
            ),
            json!({ "code": "moving_side_on_line", "point": [0.5, 0.25] }),
        ),
        (
            json!({
                "kind": "valley",
                "line": { "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] },
                "seed": { "scope": "all" }
            }),
            json!({ "code": "moving_side_missing" }),
        ),
        (
            json!({
                "kind": "valley",
                "line": { "via": "axiom", "axiom": 1, "inputs": [] },
                "moving": [0.75, 0.5], "seed": { "scope": "all" }
            }),
            json!({ "code": "unsupported_op", "feature": "axiom_line" }),
        ),
        (
            json!({ "kind": "cp-jump", "cpJson": "{}", "orderJson": "{}", "origin": "cp" }),
            json!({ "code": "unsupported_op", "feature": "cp_jump" }),
        ),
    ];
    for (step, expected) in cases {
        let refused = refuse(&mut bridge, sheet, step.clone());
        assert_eq!(refused["refusal"], expected, "{step}");
        assert_eq!(refused["fixes"], json!([]));
    }
    assert_eq!(bridge.len(), 1, "no refusal lands a state");
}

#[test]
fn a_choice_the_op_cannot_use_breaks_it() {
    let mut bridge = Bridge::new();
    let sheet = square(&mut bridge);
    let choices = |value: Value| -> Choices {
        serde_json::from_value(value).unwrap_or_else(|e| panic!("choices: {e}"))
    };
    let refused = bridge.apply(
        sheet,
        &op(book_step()),
        &choices(json!({ "completion": [{ "above": [0.1, 0.1], "below": [0.9, 0.1] }] })),
    );
    let refused = json_of(&refused.unwrap_or_else(|e| panic!("{e}")));
    assert_eq!(
        refused["refusal"],
        json!({ "code": "unexpected_choice", "choice": "completion" })
    );
    // An empty list is no choice.
    let landed = bridge.apply(
        sheet,
        &op(book_step()),
        &choices(json!({ "completion": [] })),
    );
    assert!(matches!(landed, Ok(Outcome::Ok(_))));
}

#[test]
fn handles_are_held_until_released() {
    let mut bridge = Bridge::new();
    let a = square(&mut bridge);
    let b = square(&mut bridge);
    assert!(a != 0 && b != 0 && a != b);
    assert!(bridge.release(a));
    assert!(!bridge.release(a));
    assert_eq!(bridge.summary(a), Err(BridgeError::UnknownState(a)));
    assert_eq!(BridgeError::UnknownState(a).code(), "unknown_state");
    let c = square(&mut bridge);
    assert!(c != a, "a released handle is never reused");
    assert!(matches!(
        bridge.apply(a, &op(book_step()), &Choices::default()),
        Err(BridgeError::UnknownState(_))
    ));
    bridge.clear();
    assert!(bridge.is_empty());
}

#[test]
fn the_fingerprint_keys_follow_the_state_not_its_numbering() {
    let mut one = Bridge::new();
    let mut two = Bridge::new();
    // Two engines, the second with handles already spent: the keys of the
    // same path agree.
    let _ = square(&mut two);
    let (a, b) = (book(&mut one), book(&mut two));
    let keys = |bridge: &Bridge, state: u32| {
        let mut keys = bridge
            .canonical_keys(state)
            .unwrap_or_else(|e| panic!("{e}"));
        keys.sort();
        keys
    };
    let book_keys = keys(&one, a);
    assert_eq!(book_keys, keys(&two, b));
    assert!(
        book_keys.iter().any(|k| k.starts_with("o:")),
        "{book_keys:?}"
    );
    assert!(book_keys.iter().any(|k| k.starts_with("v:")));

    // Four quarter turns are no turn; two turn-overs are none.
    let mut state = a;
    for _ in 0..4 {
        state = land(
            &mut one,
            state,
            json!({ "kind": "rotate", "rotate": { "amount": "quarter", "direction": "ccw" } }),
        )
        .0;
    }
    assert_eq!(keys(&one, state), book_keys);
    let turned = land(&mut one, a, json!({ "kind": "turn", "axis": "vertical" })).0;
    let turned_keys = keys(&one, turned);
    assert_ne!(turned_keys, book_keys);
    let changed: Vec<&String> = turned_keys
        .iter()
        .filter(|k| !book_keys.contains(k))
        .collect();
    assert!(
        changed.iter().all(|k| k.starts_with("v:")),
        "a turn changes the view alone: {changed:?}"
    );
    let back = land(
        &mut one,
        turned,
        json!({ "kind": "turn", "axis": "vertical" }),
    )
    .0;
    assert_eq!(keys(&one, back), book_keys);

    // The other direction is another state.
    let sheet = square(&mut one);
    let (mountain, _) = land(
        &mut one,
        sheet,
        json!({
            "kind": "mountain",
            "line": { "via": "free", "through": [[0.5, 0.0], [0.5, 1.0]] },
            "moving": [0.75, 0.5], "seed": { "scope": "all" }
        }),
    );
    assert_ne!(keys(&one, mountain), book_keys);
}

// --- The engine's classic sequences, through the bridge ------------------

/// One recorded step of `oristudio-fold`'s classics fixtures, as the engine
/// serialised it, made a document op with a model line.
fn fixture_op(step: &Value) -> Value {
    let to_op = |fold: &Value, kind: &str| {
        let seed = match fold["seed"]["seed"].as_str() {
            Some("all") => json!({ "scope": "all" }),
            Some("depth") => json!({
                "scope": "depth", "at": fold["seed"]["at"], "layers": fold["seed"]["layers"]
            }),
            Some("flaps") => json!({ "scope": "flaps", "at": fold["seed"]["at"] }),
            other => panic!("seed {other:?}"),
        };
        let mut op = json!({
            "kind": kind,
            "line": { "via": "model", "line": fold["line"] },
            "side": fold["side"],
            "seed": seed,
            "placement": fold["placement"],
            "closure": fold["closure"],
        });
        if kind == "precrease" {
            op["direction"] = fold["direction"].clone();
        }
        op
    };
    match step["op"].as_str() {
        Some("fold") => {
            let kind = step["fold"]["direction"].as_str().unwrap_or_default();
            to_op(&step["fold"], kind)
        }
        Some("precrease") => to_op(&step["fold"], "precrease"),
        Some("turn_over") => json!({ "kind": "turn", "axis": "vertical" }),
        other => panic!("op {other:?}"),
    }
}

#[test]
fn the_classics_replay_through_the_bridge() {
    let dir =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../oristudio-fold/tests/fixtures/classics");
    let mut entries: Vec<PathBuf> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("{}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .collect();
    entries.sort();
    assert!(entries.len() >= 4, "{entries:?}");
    for path in entries {
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        let fixture: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{e}"));
        let mut bridge = Bridge::new();
        let shape = match fixture["sheet"]["shape"].as_str() {
            Some("square") => json!({ "kind": "square" }),
            Some("rectangle") => json!({
                "kind": "rectangle",
                "aspect": [fixture["sheet"]["width"], fixture["sheet"]["height"]]
            }),
            other => panic!("sheet {other:?}"),
        };
        let start = fixture["start"].clone();
        let Outcome::Ok(made) = bridge.sheet(&paper(json!({ "shape": shape, "startSide": start })))
        else {
            panic!("{}: the sheet", path.display())
        };
        let mut state = made.state;
        let steps = fixture["steps"].as_array().cloned().unwrap_or_default();
        for (i, step) in steps.iter().enumerate() {
            let (next, applied) = land(&mut bridge, state, fixture_op(&step[0]));
            let expected = &step[1];
            let summary = &applied["summary"];
            let name = format!("{} step {i}", path.display());
            assert_eq!(summary["faces"], expected["faces"], "{name}");
            assert_eq!(summary["pairs"], expected["pairs"], "{name}");
            let moved = applied["report"]["moving"].as_array().map_or(0, Vec::len);
            assert_eq!(Some(moved as u64), expected["moved"].as_u64(), "{name}");
            let creases = expected["creases"].as_array().cloned().unwrap_or_default();
            let count = |kind: &str, letter: Option<&str>| {
                creases
                    .iter()
                    .filter(|c| {
                        c["kind"]["kind"] == kind && letter.is_none_or(|l| c["kind"]["letter"] == l)
                    })
                    .count() as u64
            };
            let counts = &summary["creases"];
            assert_eq!(
                counts["border"].as_u64(),
                Some(count("border", None)),
                "{name}"
            );
            assert_eq!(
                counts["mountain"].as_u64(),
                Some(count("folded", Some("mountain"))),
                "{name}"
            );
            assert_eq!(
                counts["valley"].as_u64(),
                Some(count("folded", Some("valley"))),
                "{name}"
            );
            assert_eq!(counts["flat"].as_u64(), Some(count("flat", None)), "{name}");
            assert!(bridge.release(state));
            state = next;
        }
    }
}
