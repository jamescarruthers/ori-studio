//! Lazy, bounded layer-order inspection shared by the Fold tools.
//! An index or a choice is transient UI state; the returned witness is what a
//! step stores.
//!
//! - **A valley or mountain** lists its orders through the solver
//!   (`oristudio_fold::fold::solved`): every order its moving paper can land
//!   in, per independent part, a part never made only of paper that stays.
//!   A pick stores a `solved` landing pinned by `choices.completion`; a fold
//!   with one order whose outer recipe lands it stores `outer`, as before.
//!   Only when the solver cannot finish — the block does not prepare, the
//!   completion runs out of nodes or time, or a part truncates — does the
//!   recipe search ([`FoldPlacementSearch`]) list what it can, never exact
//!   unless it found every counted order.
//! - **A compound fold** lists its completion's orders, per part, as its
//!   family lands them.
//!
//! A choice is one listed order per component; `index` is the same choice
//! in mixed radix, the last component fastest, which callers that walk every
//! order (a pleat's legs, Repeat) step through.
use oristudio_fold::{
    ChoiceCount, ClosurePolicy, CompletionLimits, Completions, FaceId, FoldLanding, FoldOrders,
    FoldPlacementSearch, FoldRefusal, PlainFold, State, Unlisted, WitnessOrder,
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

/// The least time the solver lists a fold's orders in, whatever the press's
/// own time: a listing is one call, finished or not, so it gets enough to
/// finish the folds of the design fixtures (`tests/solved_orders.rs`
/// times them) before the recipe search is the fallback.
const LISTING_MIN_MS: f64 = 2_000.0;

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

    /// The choice this query names in `completions`, and its index: `choice`
    /// when it names one listed order per component, else the order that
    /// keeps `prefer`'s relations, else `index` (clamped to the count).
    fn choose(&self, completions: &Completions) -> (Vec<usize>, u64) {
        let components = completions.components();
        let index_of = |choice: &[usize]| {
            components
                .iter()
                .zip(choice)
                .fold(0u64, |index, (component, pick)| {
                    index
                        .saturating_mul(component.orders.len() as u64)
                        .saturating_add(*pick as u64)
                })
        };
        if let Some(choice) = &self.choice
            && choice.len() == components.len()
            && components
                .iter()
                .zip(choice)
                .all(|(component, &pick)| pick < component.orders.len())
        {
            return (choice.clone(), index_of(choice));
        }
        let count = completions.count();
        // A changed search may list fewer choices. This only chooses a preview;
        // the UI must still accept the witness it actually sees.
        let index = self.index.min(count.orders.saturating_sub(1));
        let mut remainder = index;
        let mut indices = vec![0; components.len()];
        for (i, component) in components.iter().enumerate().rev() {
            let size = component.orders.len() as u64;
            if size > 0 {
                indices[i] = (remainder % size) as usize;
                remainder /= size;
            }
        }
        if let Some(prefer) = &self.prefer {
            let preserved: Option<Vec<usize>> = components
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
                .collect();
            if let Some(preserved) = preserved {
                let index = index_of(&preserved);
                return (preserved, index);
            }
        }
        (indices, index)
    }
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
    /// For a fold with one order: whether its outer recipe lands that order,
    /// so the step keeps storing `outer`.
    outer: Option<bool>,
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
    fn list(&mut self, parent: &State, limits: &CompletionLimits, allowed_ms: f64) {
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
                at_ms: now_ms() + allowed_ms.max(LISTING_MIN_MS),
            }),
            ..*limits
        };
        self.listing = Some(Listing {
            per_component: limits.per_component,
            max_nodes: limits.max_nodes,
            result: parent.fold_orders(&self.fold, &timed),
            outer: None,
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
        session.list(parent, &limits, allowed);
        let Some(listing) = &mut session.listing else {
            return Err(BridgeError::InvalidInput(
                "placement listing missing".into(),
            ));
        };
        match &listing.result {
            Ok(orders) => {
                let outer = *listing.outer.get_or_insert_with(|| {
                    orders.count().orders == 1 && outer_lands(parent, &fold, orders)
                });
                Ok(solved_selection(orders, query, outer))
            }
            Err(Unlisted::NoOrder(no_order)) => {
                // The outer fold's refusal names the flaps the closure would
                // add, with the fix that includes them; the listing's names
                // the faces no order fits.
                match parent.fold(&fold.clone().with_closure(ClosurePolicy::Refuse)) {
                    Err(refused) => Ok(Outcome::Refused(refused.into())),
                    Ok(_) => Ok(Outcome::Refused(no_order.clone().into())),
                }
            }
            Err(Unlisted::Unfinished(_)) => {
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

/// Whether the plain fold's outer recipe, moving only what the seed names,
/// lands the one order `orders` has.
fn outer_lands(parent: &State, fold: &PlainFold, orders: &FoldOrders) -> bool {
    let Ok(outer) = parent.fold(&fold.clone().with_closure(ClosurePolicy::Refuse)) else {
        return false;
    };
    let Ok(only) = orders.pick(&vec![0; orders.completions().components().len()]) else {
        return false;
    };
    let keys = |state: &State| {
        let mut keys = canonical_keys(state);
        keys.sort_unstable();
        keys
    };
    keys(&outer.state) == keys(&only.folded.state)
}

/// A valley's or mountain's choice among the orders the solver listed.
fn solved_selection(
    orders: &FoldOrders,
    query: &OrderQuery,
    outer: bool,
) -> Outcome<OrderSelection> {
    let completions = orders.completions();
    let (choice, index) = query.choose(completions);
    let picked = match orders.pick(&choice) {
        Ok(picked) => picked,
        Err(refusal) => return Outcome::Refused(Refusal::from(refusal)),
    };
    let (landing, completion) = if outer {
        (FoldLanding::Outer, None)
    } else {
        (FoldLanding::Solved, picked.stored)
    };
    let mut moving = orders.moving_landed();
    moving.sort_unstable();
    Outcome::Ok(OrderSelection {
        count: orders.count(),
        index,
        completion,
        relations: completions.chosen_pairs(&choice).unwrap_or_default(),
        landing: Some(landing),
        moving_varies: false,
        searching: false,
        parts: parts_of(completions, &choice, &orders.landed_faces(), &moving),
        choice: if completions.components().is_empty() {
            Vec::new()
        } else {
            choice
        },
        source: Some(OrderSource::Solved),
    })
}

/// The recipe search's candidate at `query.index`: a flat list, its count
/// exact only when it found every counted order.
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
