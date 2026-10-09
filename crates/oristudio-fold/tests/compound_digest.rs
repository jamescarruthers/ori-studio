//! Digests of the compound folds' seeded campaigns: every operation and its
//! outcome — the landed parts to the bit and the report, each order a choice
//! offers, or the refusal with its fixes — hashed in order. A change meant to
//! leave the engine's answers alone (a faster completion, a cheaper refusal)
//! prints the same digests as the build before it:
//!
//! ```sh
//! cargo test -p oristudio-fold --release --test compound_digest -- --ignored --nocapture
//! ```

mod compound;
mod support;

use std::hash::{DefaultHasher, Hash, Hasher};

use oristudio_fold::{ReverseFold, ReverseKind, ReverseOutcome, State};

/// Every reverse fold of the spike's campaign (seeds 1–3, 1,500 states each)
/// that the engine's own campaign folds — each admissible opening of the
/// first flap, four at most — of both kinds, with the kinds that land.
#[test]
#[ignore = "prints a digest to compare between builds; run with --release --ignored"]
fn reverse_campaign_digest() {
    let mut hasher = DefaultHasher::new();
    let mut ops = 0;
    for seed in 1..=3 {
        for i in 0..1500 {
            let Some((state, op)) = compound::reverse_case(seed, i) else {
                continue;
            };
            let Ok(analysis) = state.analyse_reverse(&op) else {
                continue;
            };
            if analysis.flaps.iter().skip(1).any(|f| f.openings.len() > 1) {
                continue;
            }
            for k in 0..analysis.flaps[0].openings.len().min(4) {
                let Some(choices) = compound::first_flap_opened(&analysis, k) else {
                    continue;
                };
                format!("{:?}", state.reverse_kinds(&op, &choices)).hash(&mut hasher);
                for kind in [ReverseKind::Inside, ReverseKind::Outside] {
                    let op = ReverseFold { kind, ..op.clone() };
                    hash_reverse(&state, &op, &state.reverse_fold(&op, &choices), &mut hasher);
                    ops += 1;
                }
            }
        }
    }
    eprintln!("{ops} reverse folds, digest {:016x}", hasher.finish());
}

fn hash_reverse(
    state: &State,
    op: &ReverseFold,
    outcome: &Result<ReverseOutcome, oristudio_fold::CompoundRefused>,
    hasher: &mut DefaultHasher,
) {
    format!("{op:?} {}", state.faces().len()).hash(hasher);
    match outcome {
        Ok(ReverseOutcome::Landed(folded)) => {
            format!("{:?} {:?}", folded.state.parts(), folded.report).hash(hasher);
        }
        Ok(ReverseOutcome::ChooseOrder(choice)) => {
            format!("{:?}", choice.count()).hash(hasher);
            let sizes: Vec<usize> = choice
                .completions()
                .components()
                .iter()
                .map(|c| c.orders.len())
                .collect();
            for pick in compound::picks(&sizes) {
                match choice.pick(&pick) {
                    Ok(folded) => format!("{:?} {:?}", folded.state.parts(), folded.report),
                    Err(refusal) => format!("{refusal:?}"),
                }
                .hash(hasher);
            }
        }
        Ok(ReverseOutcome::ChooseOpening(analysis)) => format!("{analysis:?}").hash(hasher),
        Err(refused) => format!("{refused:?}").hash(hasher),
    }
}
