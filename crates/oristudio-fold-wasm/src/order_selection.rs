//! Lazy, bounded layer-order inspection shared by the Fold tools.
//! An index or a choice is transient UI state; the returned witness is what a
//! step stores.
//!
//! - **A valley or mountain** lists its orders through the solver
//!   (`oristudio_fold::fold::solved`): every order its moving paper can land
//!   in, per independent part, a part never made only of paper that stays.
//!   A pick stores a `solved` landing pinned by `choices.completion`; a pick
//!   that is the outer recipe's landing stores `outer`, however many orders
//!   there are, since it replays where an earlier step shifts. A fold none of
//!   whose orders lands is refused as the outer recipe refuses it. Only when
//!   the solver cannot finish — the completion runs out of nodes or its
//!   [`LISTING_MS`], a part truncates, or the block does not prepare for a
//!   fold the outer recipe lands — does the recipe search
//!   ([`FoldPlacementSearch`]) list what it can, exact once it has nothing
//!   left to try.
//! - **A compound fold** lists its completion's orders, per part, as its
//!   family lands them.
//!
//! A choice is one listed order per component; `index` is the same choice
//! in mixed radix, the last component fastest, which callers that walk every
//! order (a pleat's legs, Repeat) step through.
use oristudio_fold::{
    ChoiceCount, ClosurePolicy, CompletionLimits, Completions, FaceId, FoldLanding, FoldOrders,
    FoldPlacementSearch, FoldRefusal, PlainFold, State, Unfinished, Unlisted, WitnessOrder,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::bridge::{Bridge, settle};
use crate::canonical::canonical_keys;
use crate::resolve::{Resolved, resolve};
use crate::wire::{BridgeError, Choices, Op, Outcome, Refusal};
use crate::{FoldEngine, bridge_error, parse, parse_choices, to_js_value};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderQuery {
    #[serde(default)]
    pub index: u64,
    /// One listed order per component, beside `index`: the per-part
    /// chooser's pick. Beats `index` and `prefer` when it names one.
    #[serde(default)]
    pub choice: Option<Vec<usize>>,
    #[serde(default)]
    pub batch: u64,
    /// Actual local relations to preserve when a larger search changes indices.
    #[serde(default)]
    pub prefer: Option<Vec<[FaceId; 2]>>,
    #[serde(default)]
    pub per_component: Option<usize>,
    #[serde(default)]
    pub max_nodes: Option<u64>,
    /// A plain fold's placement search: how long one `batch` may search in
    /// all, in calls of at most [`PLACEMENT_SLICE_MS`] each, asked again
    /// while the answer says it is `searching`, so a caller can stop between
    /// them. Zero reads what is found. Absent, a batch is one call's search.
    #[serde(default)]
    pub search_ms: Option<f64>,
}

/// The longest a single placement call searches.
pub const PLACEMENT_SLICE_MS: f64 = 150.0;

/// The longest one batch of a placement search may search in all.
const PLACEMENT_BATCH_MAX_MS: f64 = 60_000.0;

/// The longest the solver lists a fold's orders in, whatever the press's own
/// time: a listing is one call, which Stop cannot interrupt, so it is capped.
/// The slowest first answer across the corpora took 37 ms. A listing that
/// needs longer falls back to the recipe search, which runs in slices.
const LISTING_MS: f64 = 2_000.0;

impl OrderQuery {
    pub fn limits(&self) -> CompletionLimits {
        CompletionLimits {
            per_component: self.per_component.unwrap_or(1000).clamp(1, 64_000),
            max_nodes: Some(self.max_nodes.unwrap_or(200_000).clamp(1, 12_800_000)),
            deadline: None,
        }
    }

    /// How long this batch may search in all, and what a call that searched
    /// for `elapsed` costs it: at least a millisecond, so a call that cannot
    /// advance still spends it; without `search_ms`, all of it.
    fn search_time(&self) -> (f64, impl Fn(f64) -> f64) {
        let asked = self
            .search_ms
            .filter(|ms| ms.is_finite())
            .map(|ms| ms.clamp(0.0, PLACEMENT_BATCH_MAX_MS));
        let allowed = asked.unwrap_or(PLACEMENT_SLICE_MS);
        let cost = move |elapsed: f64| match asked {
            Some(_) => elapsed.max(1.0),
            None => allowed,
        };
        (allowed, cost)
    }

    /// The choice this query names in `completions`, and its index.
    fn choose(&self, completions: &Completions) -> (Vec<usize>, u64) {
        let sizes: Vec<usize> = completions
            .components()
            .iter()
            .map(|c| c.orders.len())
            .collect();
        self.choose_in(&sizes, |prefer| keeping(completions, prefer))
    }

    /// The choice this query names among choices of `sizes` (one listed
    /// order per position), and its index: `choice` when it names one, else
    /// the one `preserved` finds keeping `prefer`'s relations, else `index`
    /// (clamped to the count), the last position stepping fastest.
    fn choose_in(
        &self,
        sizes: &[usize],
        preserved: impl FnOnce(&[[FaceId; 2]]) -> Option<Vec<usize>>,
    ) -> (Vec<usize>, u64) {
        let index_of = |choice: &[usize]| {
            sizes.iter().zip(choice).fold(0u64, |index, (&size, pick)| {
                index
                    .saturating_mul(size as u64)
                    .saturating_add(*pick as u64)
            })
        };
        if let Some(choice) = &self.choice
            && choice.len() == sizes.len()
            && sizes.iter().zip(choice).all(|(&size, &pick)| pick < size)
        {
            return (choice.clone(), index_of(choice));
        }
        let count = sizes
            .iter()
            .fold(1u64, |n, &size| n.saturating_mul(size as u64));
        // A changed search may list fewer choices. This only chooses a preview;
        // the UI must still accept the witness it actually sees.
        let index = self.index.min(count.saturating_sub(1));
        let mut remainder = index;
        let mut indices = vec![0; sizes.len()];
        for (i, &size) in sizes.iter().enumerate().rev() {
            let size = size as u64;
            if size > 0 {
                indices[i] = (remainder % size) as usize;
                remainder /= size;
            }
        }
        if let Some(prefer) = &self.prefer
            && let Some(preserved) = preserved(prefer)
        {
            let index = index_of(&preserved);
            return (preserved, index);
        }
        (indices, index)
    }
}

/// The choice of `completions` whose every pair is one of `prefer`'s.
fn keeping(completions: &Completions, prefer: &[[FaceId; 2]]) -> Option<Vec<usize>> {
    completions
        .components()
        .iter()
        .map(|component| {
            component.orders.iter().position(|order| {
                component.pairs.iter().zip(order).all(|(pair, above)| {
                    let expected = if *above {
                        [pair.lo(), pair.hi()]
                    } else {
                        [pair.hi(), pair.lo()]
                    };
                    prefer.contains(&expected)
                })
            })
        })
        .collect()
}

/// How the orders a selection names were listed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderSource {
    /// The solver listed every order: a valley's or mountain's own listing,
    /// or a compound fold's completion.
    Solved,
    /// The recipe search's fallback, for a fold the solver could not list.
    Recipes,
}

/// One part a choice picks in: a component of the completion with more than
/// one order.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PartSelection {
    /// Its component, the index `choice` gives its pick at.
    pub component: usize,
    /// The orders it lists.
    pub orders: usize,
    /// More exist than are listed.
    pub truncated: bool,
    /// The order this selection picks in it.
    pub pick: usize,
    /// Its faces, as positions in the landed state's faces: the scene's face
    /// indices, which its subfaces' stacks name.
    pub faces: Vec<usize>,
    /// Whether any of its faces moves. Always, for a listed part: a part
    /// made only of paper that stays is pinned to the parent's order.
    pub moves: bool,
}

#[derive(Debug, Serialize)]
pub struct OrderSelection {
    pub count: ChoiceCount,
    pub index: u64,
    pub completion: Option<WitnessOrder>,
    pub relations: Vec<[FaceId; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub landing: Option<FoldLanding>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub moving_varies: bool,
    /// A placement search with time left in this batch: ask again, with the
    /// same query, to search further.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub searching: bool,
    /// The pick in every component; empty for a unique fold.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub choice: Vec<usize>,
    /// The parts the folder chooses in, in component order.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<PartSelection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<OrderSource>,
}

/// One order of a compound fold, landed for its preview: what the step
/// stores, the landed state's faces (by position) and the ones that moved.
pub struct Picked {
    pub stored: Option<WitnessOrder>,
    pub faces: Vec<FaceId>,
    pub moving: Vec<FaceId>,
}

impl Picked {
    pub fn new(
        stored: Option<WitnessOrder>,
        state: &State,
        report: &oristudio_fold::CompoundReport,
    ) -> Self {
        let mut moving: Vec<FaceId> = report.blocks.iter().flatten().copied().collect();
        moving.sort_unstable();
        Self {
            stored,
            faces: state.faces().iter().map(|f| f.id).collect(),
            moving,
        }
    }
}

/// The parts of `completions` a choice picks in: every component with more
/// than one order, its faces numbered by position in `faces` (ascending ids).
fn parts_of(
    completions: &Completions,
    choice: &[usize],
    faces: &[FaceId],
    moving: &[FaceId],
) -> Vec<PartSelection> {
    completions
        .components()
        .iter()
        .enumerate()
        .filter(|(_, c)| c.orders.len() > 1 || c.truncated)
        .map(|(k, c)| {
            let mut ids: Vec<FaceId> = c.pairs.iter().flat_map(|p| p.faces()).collect();
            ids.sort_unstable();
            ids.dedup();
            PartSelection {
                component: k,
                orders: c.orders.len(),
                truncated: c.truncated,
                pick: choice.get(k).copied().unwrap_or(0),
                moves: ids.iter().any(|id| moving.binary_search(id).is_ok()),
                faces: ids
                    .iter()
                    .filter_map(|id| faces.binary_search(id).ok())
                    .collect(),
            }
        })
        .collect()
}

impl OrderSelection {
    pub fn unique(completion: Option<WitnessOrder>) -> Self {
        Self {
            count: ChoiceCount {
                orders: 1,
                exact: true,
            },
            index: 0,
            completion,
            relations: Vec::new(),
            landing: None,
            moving_varies: false,
            searching: false,
            choice: Vec::new(),
            parts: Vec::new(),
            source: None,
        }
    }

    /// A compound fold's choice among its completion's orders.
    pub fn pick(
        completions: &Completions,
        query: &OrderQuery,
        pick: impl FnOnce(&[usize]) -> Result<Picked, FoldRefusal>,
    ) -> Result<Self, Refusal> {
        let count = completions.count();
        let (choice, index) = query.choose(completions);
        let relations = completions.chosen_pairs(&choice).unwrap_or_default();
        let picked = pick(&choice).map_err(Refusal::from)?;
        Ok(Self {
            count,
            index,
            completion: picked.stored,
            relations,
            landing: None,
            moving_varies: false,
            searching: false,
            parts: parts_of(completions, &choice, &picked.faces, &picked.moving),
            choice,
            source: Some(OrderSource::Solved),
        })
    }
}

/// A batch of a placement search: its number and its limits.
type BatchKey = (u64, usize, Option<u64>);

/// A valley's or mountain's listing, at the limits it ran with.
#[derive(Debug)]
struct Listing {
    per_component: usize,
    max_nodes: Option<u64>,
    result: Result<FoldOrders, Unlisted>,
    /// The outer recipe's landing, by its `fs1` keys; none when it refuses.
    /// A pick that is that landing stores `outer`, which replays where an
    /// earlier step shifts and the pick's stored pairs would not.
    outer: Option<Option<Vec<String>>>,
    /// For a listing that did not finish: the outer recipe's refusal, none
    /// when it lands.
    outer_refusal: Option<Option<oristudio_fold::Refused>>,
}

#[derive(Debug)]
pub(crate) struct PlacementSession {
    pub parent: u32,
    fold: PlainFold,
    /// The batch searched last, and how long it has searched so far, across
    /// calls.
    batch: Option<(BatchKey, f64)>,
    listing: Option<Listing>,
    /// The recipe search, made only when the listing does not finish.
    search: Option<FoldPlacementSearch>,
}

impl PlacementSession {
    /// List the fold's orders at `limits` unless they are listed, or a
    /// listing at limits as large did not finish.
    fn list(&mut self, parent: &State, limits: &CompletionLimits) {
        let larger = |listing: &Listing| {
            limits.per_component > listing.per_component || limits.max_nodes > listing.max_nodes
        };
        let again = match &self.listing {
            None => true,
            Some(listing) => {
                matches!(listing.result, Err(Unlisted::Unfinished(_))) && larger(listing)
            }
        };
        if !again {
            return;
        }
        let now_ms = crate::ops_crimp_tuck::clock::now_ms;
        let timed = CompletionLimits {
            deadline: Some(oristudio_fold::complete::Deadline {
                now_ms,
                at_ms: now_ms() + LISTING_MS,
            }),
            ..*limits
        };
        self.listing = Some(Listing {
            per_component: limits.per_component,
            max_nodes: limits.max_nodes,
            result: parent.fold_orders(&self.fold, &timed),
            outer: None,
            outer_refusal: None,
        });
    }
}

impl Bridge {
    fn placement_selection(
        &mut self,
        state: u32,
        op: &Op,
        choices: &Choices,
        query: &OrderQuery,
    ) -> Result<Outcome<OrderSelection>, BridgeError> {
        // The session is this parent's and this fold's; it is put back
        // whatever the answer.
        let mut slot = self.placements.take();
        let answer = match self.state(state) {
            Ok(parent) => placement_answer(parent, state, &mut slot, op, choices, query),
            Err(error) => Err(error),
        };
        self.placements = slot;
        answer
    }

    pub fn order_selection(
        &mut self,
        state: u32,
        op: &Op,
        choices: &Choices,
        query: &OrderQuery,
    ) -> Result<Outcome<OrderSelection>, BridgeError> {
        if matches!(op, Op::Valley(_) | Op::Mountain(_)) {
            return self.placement_selection(state, op, choices, query);
        }
        self.placements = None;
        let parent = self.state(state)?;
        // Only the order is being explored; roots, openings and pockets remain fixed.
        let mut choices = choices.clone();
        choices.completion = None;
        match settle(resolve(parent, op, &choices))? {
            Ok(Resolved::Compound(compound)) => Ok(compound.order_selection(parent, query).into()),
            Ok(_) => Err(BridgeError::InvalidInput(
                "order_selection needs a compound fold".into(),
            )),
            Err(refused) => Ok(Outcome::Refused(refused)),
        }
    }
}

/// A valley's or mountain's orders from `parent` (the held state `state`),
/// through the session in `slot`, made afresh for another parent or fold.
fn placement_answer(
    parent: &State,
    state: u32,
    slot: &mut Option<PlacementSession>,
    op: &Op,
    choices: &Choices,
    query: &OrderQuery,
) -> Result<Outcome<OrderSelection>, BridgeError> {
    let mut outer = op.clone();
    if let Op::Valley(a) | Op::Mountain(a) = &mut outer {
        a.landing = FoldLanding::Outer;
    }
    let mut choices = choices.clone();
    choices.completion = None;
    let resolved = match settle(resolve(parent, &outer, &choices))? {
        Ok(value) => value,
        Err(refused) => return Ok(Outcome::Refused(refused)),
    };
    let fold = match resolved.plain(parent) {
        Some(Ok(fold)) => fold,
        Some(Err(refused)) => return Ok(Outcome::Refused(refused.into())),
        None => {
            return Err(BridgeError::InvalidInput(
                "placement needs a plain fold".into(),
            ));
        }
    };
    if !slot
        .as_ref()
        .is_some_and(|s| s.parent == state && s.fold == fold)
    {
        *slot = Some(PlacementSession {
            parent: state,
            fold: fold.clone(),
            batch: None,
            listing: None,
            search: None,
        });
    }
    let Some(session) = slot else {
        return Err(BridgeError::InvalidInput(
            "placement session missing".into(),
        ));
    };
    {
        let limits = query.limits();
        let (allowed, cost) = query.search_time();
        session.list(parent, &limits);
        let Some(listing) = &mut session.listing else {
            return Err(BridgeError::InvalidInput(
                "placement listing missing".into(),
            ));
        };
        // A selection with no order, or no block to list, is refused as the
        // outer recipe refuses it: that refusal names the flaps the closure
        // would add, with the fix that includes them, or the line's own
        // fault. Only a fold the outer recipe lands falls back.
        let mut refused_outer = || {
            listing
                .outer_refusal
                .get_or_insert_with(|| {
                    parent
                        .fold(&fold.clone().with_closure(ClosurePolicy::Refuse))
                        .err()
                })
                .clone()
        };
        let fallback = match &listing.result {
            Ok(_) => false,
            Err(Unlisted::Unfinished(Unfinished::Budget(_) | Unfinished::Truncated)) => true,
            Err(Unlisted::NoOrder(_) | Unlisted::Unfinished(Unfinished::Prepare(_))) => {
                match refused_outer() {
                    Some(refused) => return Ok(Outcome::Refused(refused.into())),
                    None => true,
                }
            }
        };
        match &listing.result {
            Ok(orders) if !fallback => {
                let outer = listing.outer.get_or_insert_with(|| {
                    parent
                        .fold(&fold.clone().with_closure(ClosurePolicy::Refuse))
                        .ok()
                        .map(|outer| sorted_keys(&outer.state))
                });
                Ok(solved_selection(orders, query, outer.as_deref()))
            }
            _ => {
                let search = session
                    .search
                    .get_or_insert_with(|| FoldPlacementSearch::new(parent, &fold));
                let key: BatchKey = (query.batch, limits.per_component, limits.max_nodes);
                // A new batch starts its time afresh; asking again with the
                // same query searches on until the batch's time is spent.
                let mut spent = match session.batch {
                    Some((searched, spent)) if searched == key => spent,
                    _ => 0.0,
                };
                if spent < allowed && !search.exhausted() {
                    let now_ms = crate::ops_crimp_tuck::clock::now_ms;
                    let start = now_ms();
                    let timed = CompletionLimits {
                        deadline: Some(oristudio_fold::complete::Deadline {
                            now_ms,
                            at_ms: start + (allowed - spent).min(PLACEMENT_SLICE_MS),
                        }),
                        ..limits
                    };
                    search.advance(&timed, 128, 1024);
                    spent += cost(now_ms() - start);
                }
                session.batch = Some((key, spent));
                Ok(recipe_selection(search, query, spent < allowed))
            }
        }
    }
}

fn sorted_keys(state: &State) -> Vec<String> {
    let mut keys = canonical_keys(state);
    keys.sort_unstable();
    keys
}

/// A valley's or mountain's choice among the orders the solver listed. A
/// pick that is the outer recipe's landing (`outer`, its keys) stores
/// `outer`, however many orders there are; any other stores `solved`.
fn solved_selection(
    orders: &FoldOrders,
    query: &OrderQuery,
    outer: Option<&[String]>,
) -> Outcome<OrderSelection> {
    let sizes = orders.choice_sizes();
    let (choice, index) = query.choose_in(&sizes, |prefer| orders.choice_keeping(prefer));
    let picked = match orders.pick(&choice) {
        Ok(picked) => picked,
        Err(refusal) => return Outcome::Refused(Refusal::from(refusal)),
    };
    let (landing, completion) =
        if outer.is_some_and(|keys| keys == sorted_keys(&picked.folded.state)) {
            (FoldLanding::Outer, None)
        } else {
            (FoldLanding::Solved, picked.stored)
        };
    let mut moving = orders.moving_landed();
    moving.sort_unstable();
    let faces = orders.landed_faces();
    let parts = orders
        .parts()
        .into_iter()
        .map(|part| PartSelection {
            pick: choice.get(part.component).copied().unwrap_or(0),
            moves: part.faces.iter().any(|id| moving.binary_search(id).is_ok()),
            faces: part
                .faces
                .iter()
                .filter_map(|id| faces.binary_search(id).ok())
                .collect(),
            component: part.component,
            orders: part.orders,
            truncated: part.truncated,
        })
        .collect();
    Outcome::Ok(OrderSelection {
        count: orders.count(),
        index,
        completion,
        relations: orders.relations(&choice),
        landing: Some(landing),
        moving_varies: false,
        searching: false,
        parts,
        choice: if sizes.is_empty() { Vec::new() } else { choice },
        source: Some(OrderSource::Solved),
    })
}

/// The recipe search's candidate at `query.index`: a flat list, its count
/// exact once the search has nothing left to try.
fn recipe_selection(
    search: &FoldPlacementSearch,
    query: &OrderQuery,
    time_left: bool,
) -> Outcome<OrderSelection> {
    let count = search.count();
    let exhausted = search.exhausted();
    if exhausted
        && count.orders == 0
        && let Some(refused) = search.refusal()
    {
        return Outcome::Refused(refused.clone().into());
    }
    let index = query.index.min(count.orders.saturating_sub(1));
    let candidate = search.candidates().get(index as usize);
    let moving_varies = search
        .candidates()
        .first()
        .is_some_and(|first| search.candidates().iter().any(|c| c.moving != first.moving));
    Outcome::Ok(OrderSelection {
        count,
        index,
        relations: Vec::new(),
        moving_varies,
        searching: !exhausted && time_left,
        landing: candidate.map(|c| c.landing.clone()),
        completion: candidate.and_then(|c| c.completion.clone()),
        choice: Vec::new(),
        parts: Vec::new(),
        source: Some(OrderSource::Recipes),
    })
}

#[wasm_bindgen]
impl FoldEngine {
    /// Release only this parent's authoring search; saved states are unaffected.
    pub fn release_order_search(&mut self, state: u32) {
        if self
            .inner
            .placements
            .as_ref()
            .is_some_and(|search| search.parent == state)
        {
            self.inner.placements = None;
        }
    }

    pub fn order_selection(
        &mut self,
        state: u32,
        op: JsValue,
        choices: JsValue,
        query: JsValue,
    ) -> Result<JsValue, JsValue> {
        let op: Op = parse("op", op)?;
        let choices = parse_choices(choices)?;
        let query: OrderQuery = parse("query", query)?;
        to_js_value(
            &self
                .inner
                .order_selection(state, &op, &choices, &query)
                .map_err(bridge_error)?,
        )
    }
}
