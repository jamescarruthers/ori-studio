#![cfg(not(target_arch = "wasm32"))]
//! A plain fold's orders, listed by the solver (`oristudio_fold::fold::solved`),
//! over seeded random folds and tucks (`oristudio_fold::random`):
//!
//! - every listed order lands, replays from what its step stores to the same
//!   state, and no listed part is made only of paper that stays;
//! - every state the recipe search (`FoldPlacementSearch`) lands, run to
//!   exhaustion, is a listed one;
//! - every state a tuck lands is listed by the plain fold of the flaps it
//!   moves — the tuck's own seed when it moves just those flaps, the seed
//!   naming them all when its target-bounded closure moves more — in the
//!   direction its hinges fold: a tuck's direction names its placement, so a
//!   valley tuck can land by folding mountain. A tuck whose hinges fold some
//!   each way is no plain fold's order; the recipe search refuses it too.
//!
//! States compare by their `fs1` keys (`canonical`), which name no face by
//! its number. `SOLVED_CAMPAIGN_SEEDS` runs a larger campaign than the default.

use std::collections::BTreeSet;

use oristudio_fold::random::{self, Rng};
use oristudio_fold::{
    Broken, ClosurePolicy, CompletionLimits, CompoundRefused, Direction, FoldOrders,
    FoldPlacementSearch, PlainFold, Seed, State, TuckChoices, TuckOutcome, Unfinished, Unlisted,
    WitnessOrder,
};
use oristudio_fold_wasm::canonical::canonical_keys;

type Keys = Vec<String>;

fn keys(state: &State) -> Keys {
    let mut keys = canonical_keys(state);
    keys.sort_unstable();
    keys
}

const LIMITS: CompletionLimits = CompletionLimits {
    per_component: 64,
    max_nodes: Some(200_000),
    deadline: None,
};

/// The most combinations a case lists.
const MAX_PICKS: usize = 64;

#[derive(Debug, Default)]
struct Tally {
    folds: usize,
    listed: usize,
    ambiguous: usize,
    multi_part: Vec<String>,
    picks: usize,
    unmoved_parts: Vec<String>,
    replay_mismatch: Vec<String>,
    no_order: usize,
    refused: usize,
    unfinished: usize,
    recipe_states: usize,
    recipe_missing: Vec<String>,
    recipe_found_without_listing: Vec<String>,
    tucks: usize,
    tuck_states: usize,
    tuck_widened: usize,
    tuck_reversed: usize,
    tuck_mixed: usize,
    tuck_missing: Vec<String>,
    unfinished_why: Vec<String>,
}

/// Every listed state, by keys, picking every combination (capped); each
/// checked to replay from what it stores.
fn listed(
    parent: &State,
    op: &PlainFold,
    orders: &FoldOrders,
    what: &str,
    tally: &mut Tally,
) -> BTreeSet<Keys> {
    let (choices, _) = orders.completions().picks(MAX_PICKS);
    let moving = orders.moving_landed();
    for part in orders.parts() {
        if !part.faces.iter().any(|f| moving.binary_search(f).is_ok()) {
            tally.unmoved_parts.push(what.to_string());
        }
    }
    let mut out = BTreeSet::new();
    for choice in choices {
        let Ok(picked) = orders.pick(&choice) else {
            tally
                .replay_mismatch
                .push(format!("{what}: pick {choice:?} refused"));
            continue;
        };
        tally.picks += 1;
        let landed = keys(&picked.folded.state);
        match parent.fold_solved(op, picked.stored.as_ref(), &CompletionLimits::default()) {
            Ok(replayed) if keys(&replayed.state) == landed => {}
            Ok(_) => tally
                .replay_mismatch
                .push(format!("{what}: pick {choice:?} replays elsewhere")),
            Err(e) => tally
                .replay_mismatch
                .push(format!("{what}: pick {choice:?} broken: {e}")),
        }
        out.insert(landed);
    }
    out
}

/// The recipe search run to exhaustion, its every candidate landed.
fn recipes(parent: &State, op: &PlainFold) -> Vec<Keys> {
    let mut search = FoldPlacementSearch::new(parent, op);
    for _ in 0..400 {
        if search.exhausted() {
            break;
        }
        search.advance(&CompletionLimits::default(), 128, 1024);
    }
    search.candidates().iter().map(|c| keys(&c.state)).collect()
}

fn fold_case(parent: &State, op: &PlainFold, what: &str, tally: &mut Tally) {
    tally.folds += 1;
    let found = recipes(parent, op);
    tally.recipe_states += found.len();
    match parent.fold_orders(op, &LIMITS) {
        Ok(orders) => {
            tally.listed += 1;
            if orders.count().orders > 1 {
                tally.ambiguous += 1;
            }
            if orders.parts().len() > 1 {
                tally.multi_part.push(format!(
                    "{what}: {:?}",
                    orders.parts().iter().map(|p| p.orders).collect::<Vec<_>>()
                ));
            }
            let listing = listed(parent, op, &orders, what, tally);
            for state in &found {
                if !listing.contains(state) {
                    tally.recipe_missing.push(what.to_string());
                }
            }
        }
        Err(Unlisted::NoOrder(_)) => {
            tally.no_order += 1;
            if !found.is_empty() {
                tally.recipe_found_without_listing.push(what.to_string());
            }
        }
        Err(Unlisted::Unfinished(why)) => {
            // A block the pipeline does not prepare, for a fold the outer
            // recipe refuses too, is that refusal (the bridge's rule): only
            // the rest fall back to the recipes.
            let outer = parent.fold(&op.clone().with_closure(ClosurePolicy::Refuse));
            if matches!(why, Unfinished::Prepare(_)) && outer.is_err() {
                tally.refused += 1;
                if !found.is_empty() {
                    tally.recipe_found_without_listing.push(what.to_string());
                }
            } else {
                tally.unfinished += 1;
                tally
                    .unfinished_why
                    .push(format!("{what}: {why:?} (recipes {})", found.len()));
            }
        }
    }
}

/// Every state a tuck lands, and the flaps it moved.
fn tuck_case(parent: &State, tuck: &oristudio_fold::TuckFold, what: &str, tally: &mut Tally) {
    let mut states: Vec<(Keys, Vec<oristudio_fold::FaceId>)> = Vec::new();
    match parent.tuck_fold_within(tuck, &TuckChoices::default(), &CompletionLimits::default()) {
        Ok(TuckOutcome::Landed(folded)) => {
            states.push((keys(&folded.state), folded.report.fold.moving.clone()))
        }
        Ok(TuckOutcome::ChooseOrder(choice)) => {
            let (picks, _) = choice.completions().picks(MAX_PICKS);
            for pick in picks {
                if let Ok(folded) = choice.pick(&pick) {
                    states.push((keys(&folded.state), folded.report.fold.moving.clone()));
                }
            }
        }
        Err(_) => return,
    }
    tally.tucks += 1;
    let plain = tuck.plain();
    let Ok(analysis) = parent.analyse_fold(&plain) else {
        return;
    };
    for (state, moving) in states {
        tally.tuck_states += 1;
        // The plain fold of exactly the flaps the tuck moved.
        let flaps: Vec<[f64; 2]> = analysis
            .flaps
            .iter()
            .filter(|flap| flap.faces.iter().any(|f| moving.binary_search(f).is_ok()))
            .map(|flap| flap.witness)
            .collect();
        let op = match parent.fold_orders(&plain, &LIMITS) {
            Ok(orders) if orders.moving() == moving.as_slice() => plain.clone(),
            _ => {
                tally.tuck_widened += 1;
                plain.clone().with_seed(Seed::Flaps { at: flaps })
            }
        };
        let listing = match parent.fold_orders(&op, &LIMITS) {
            Ok(orders) => listed(parent, &op, &orders, what, tally),
            Err(_) => BTreeSet::new(),
        };
        if listing.contains(&state) {
            continue;
        }
        // A tuck names its placement, not its hinge (`compound::tuck`): one
        // that lands by folding the other way is that fold's order.
        let mut other = op.clone();
        other.direction = match op.direction {
            Direction::Valley => Direction::Mountain,
            Direction::Mountain => Direction::Valley,
        };
        let reversed = match parent.fold_orders(&other, &LIMITS) {
            Ok(orders) => listed(parent, &other, &orders, what, tally),
            Err(_) => BTreeSet::new(),
        };
        if reversed.contains(&state) {
            tally.tuck_reversed += 1;
        } else if !recipes(parent, &op).contains(&state)
            && !recipes(parent, &other).contains(&state)
        {
            // Its hinges fold some one way and some the other: no valley's or
            // mountain's order, which the recipe search refuses too.
            tally.tuck_mixed += 1;
        } else {
            tally.tuck_missing.push(format!(
                "{what}: moves {moving:?}, listed {} (widened {}), reversed {}",
                listing.len(),
                op.seed != plain.seed,
                reversed.len()
            ));
        }
    }
}

fn campaign(seeds: std::ops::Range<u64>) -> Tally {
    let mut tally = Tally::default();
    for seed in seeds {
        let mut rng = Rng::new(seed);
        let Ok(parent) = random::folded_between(&mut rng, 2, 5) else {
            continue;
        };
        if parent.faces().len() > 64 {
            continue;
        }
        if let Some(op) = random::plain_fold(&parent, &mut rng) {
            fold_case(&parent, &op, &format!("seed {seed} fold"), &mut tally);
        }
        if let Some(tuck) = random::tuck_fold(&parent, &mut rng) {
            tuck_case(&parent, &tuck, &format!("seed {seed} tuck"), &mut tally);
        }
    }
    tally
}

#[test]
fn the_solver_lists_every_order_a_recipe_or_a_tuck_lands() {
    let seeds = std::env::var("SOLVED_CAMPAIGN_SEEDS")
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(150u64);
    let tally = campaign(0..seeds);
    println!("{tally:#?}");
    assert!(tally.listed > 0 && tally.ambiguous > 0, "{tally:#?}");
    assert!(tally.unmoved_parts.is_empty(), "{tally:#?}");
    assert!(tally.replay_mismatch.is_empty(), "{tally:#?}");
    assert!(tally.recipe_missing.is_empty(), "{tally:#?}");
    assert!(tally.recipe_found_without_listing.is_empty(), "{tally:#?}");
    assert!(tally.tuck_missing.is_empty(), "{tally:#?}");
}

/// Two folds of the campaign whose orders fall into two independent parts
/// (2 × 5 and 2 × 2, as the envelope's book move is 3 × 3): every
/// combination is listed, lands distinct, and replays; the recipe search
/// reaches only some of them.
#[test]
fn independent_parts_reach_every_combination() {
    for (seed, sizes) in [(1622u64, [2usize, 5]), (1843, [2, 2])] {
        let mut rng = Rng::new(seed);
        let parent = random::folded_between(&mut rng, 2, 5).unwrap_or_else(|e| panic!("{e}"));
        let op = random::plain_fold(&parent, &mut rng).unwrap_or_else(|| panic!("seed {seed}"));
        let orders = parent
            .fold_orders(&op, &LIMITS)
            .unwrap_or_else(|e| panic!("seed {seed}: {e:?}"));
        let parts: Vec<usize> = orders.parts().iter().map(|p| p.orders).collect();
        assert_eq!(parts, sizes, "seed {seed}");
        let mut tally = Tally::default();
        let listing = listed(&parent, &op, &orders, &format!("seed {seed}"), &mut tally);
        assert_eq!(
            listing.len(),
            sizes.iter().product::<usize>(),
            "seed {seed}"
        );
        assert!(
            tally.replay_mismatch.is_empty() && tally.unmoved_parts.is_empty(),
            "{tally:#?}"
        );
        let found: BTreeSet<Keys> = recipes(&parent, &op).into_iter().collect();
        assert!(found.is_subset(&listing), "seed {seed}");
        println!(
            "seed {seed}: {} combinations, the recipe search lands {}",
            listing.len(),
            found.len()
        );
        // Replay never guesses: without its pairs the step is broken, and so it
        // is with one part's pairs alone.
        let none = parent.fold_solved(&op, None, &CompletionLimits::default());
        assert!(
            matches!(none, Err(CompoundRefused::Broken(Broken::NotUnique { .. }))),
            "seed {seed}: {none:?}"
        );
        // Each part's second order: the stored pairs run part by part, so the
        // first part's alone leave the second open.
        let choice: Vec<usize> = orders
            .completions()
            .components()
            .iter()
            .map(|c| 1.min(c.orders.len() - 1))
            .collect();
        let stored = orders
            .pick(&choice)
            .unwrap_or_else(|e| panic!("{e}"))
            .stored
            .unwrap_or_else(|| panic!("seed {seed}: nothing stored"));
        let first = orders.parts()[0].component;
        let pairs: usize = orders.completions().components()[..=first]
            .iter()
            .map(|c| c.pairs.len())
            .sum();
        let partial = WitnessOrder {
            faces: stored.faces.clone(),
            orders: stored.orders[..pairs].to_vec(),
        };
        let half = parent.fold_solved(&op, Some(&partial), &CompletionLimits::default());
        assert!(
            matches!(half, Err(CompoundRefused::Broken(Broken::NotUnique { .. }))),
            "seed {seed}: {half:?}"
        );
    }
}
