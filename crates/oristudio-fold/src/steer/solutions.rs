//! Solutions: how many distinct pictures the committed constraints leave,
//! how many layer orders, and a stepper through them in a fixed order
//! (`implementation-plans/layer-order-dialog.md` row E6; spec §6.6;
//! decisions D5 and D7; engine research §1.5).
//!
//! # What is counted
//!
//! A **solution** is what a viewer can tell apart: from one side, the face
//! on top at every spot ([`super::Stacks::top`]). Layer orders that differ
//! only in hidden layers are one solution. [`Solutions`] counts, from both
//! sides at once, the distinct pictures every fitting order makes, and the
//! fitting orders themselves (the tooltip's "24 layer orders fit").
//!
//! It never lists the product of every order. What the creases and the
//! committed constraints force splits the open pairs into independent
//! **components** (Flat-Folder's own split, `treemaker_flatfold`'s
//! [`Enumeration`]), each with its own orders, and a fitting order is any
//! one order of each. A spot's top is decided by the order among its
//! **candidates** (the faces that nothing forces under another face of the
//! spot: in a fitting order the top is the candidate above all the others,
//! since the others each lie under one of them), so a spot's top reads only
//! the pairs among its candidates. Components that share an open spot's
//! candidate pairs form a **look group** (union–find); groups read disjoint
//! pairs, so the pictures are the product of each group's distinct
//! pictures (the product rule). Per group, each member component's orders
//! are projected onto the pairs the group reads, one per distinct
//! projection; the product of its members' projections is walked; and each
//! combination's tops are one key, counted once.
//!
//! A component's projections come from a search that assigns the pairs a
//! picture reads first and completes each assignment of them once
//! (`Enumeration::projected`), never listing the orders that differ only in
//! hidden layers: on a deep stack those can be nearly all of them (the
//! iguana's one open component has more orders than a count lists in
//! minutes, and 13 open spots). The layer orders are counted after every
//! picture, by listing each component's orders (`Enumeration::varying`).
//!
//! When every spot's faces share one of the solver's cells (transitivity
//! holds on the spot, as on every design census 1 measured), the pairs among
//! a spot's candidates are all open and tied by transitivity, so they lie
//! in one component, and a group is one component; the walk is then just
//! that component's projections. The general walk is kept for a spot whose
//! faces do not share a cell, where a combination can also leave no
//! candidate above all the others ([`NO_TOP`]).
//!
//! # Slices
//!
//! [`Solutions::advance`] works under a [`Limits`]: search nodes (one per
//! node of a component's search, one per combination walked) and a
//! deadline. A call its limits stop resumes where it stopped on the next,
//! so a background worker counts in short slices between the session's
//! other calls, and the result after any slicing equals a one-shot count:
//! the enumeration is deterministic and resumes exactly, and every cap is a
//! count, never a time. Every component's pictures are counted before any
//! layer order, smallest component first, and a group as soon as its
//! members are (a group of one component as its projections are found), so
//! the pictures are exact as soon as they can be and an early "at least N"
//! already multiplies what is known. A count that stops at a cap
//! ([`SolutionCaps`]) reads "at least": every key found is a picture some
//! fitting order makes, so a lower bound never exceeds the true count.
//!
//! # The stepper
//!
//! Solutions are stepped in **lexicographic order of their pictures**: the
//! top faces of the open spots, spot by spot in the paper scene's subface
//! order, faces by number. That order is the pictures', not the
//! constraints': adding a constraint only removes pictures, so the rest
//! keep their order, and removing it brings back exactly the same sequence
//! and the same index for the same picture ("3 of 12", never the solution
//! on screen first). The index of a picture is how many pictures of the
//! product lie before it; the next and the previous are found group by
//! group, with no list of pictures. With X-ray on (decision D5) the stepper
//! goes through every layer order the same way, by the pairs' order
//! (lexicographic by variable, the smaller face above first), each
//! component a group.
//!
//! Before the count is done, the stepper steps through what is counted so
//! far (decision D7: ‹ › still steps, with no total): a group whose walk is
//! not finished keeps the picture on screen, and an index is final only
//! once the total is exact ([`Position`]).
//!
//! A step to another picture finds the layer order closest to the one on
//! screen within it by the session's own check, steered by the order on
//! screen, with the new picture's tops as seeds; should that check run out
//! of time, the first order counted for that picture stands in. A step
//! with X-ray on lands on exactly the next layer order.
//!
//! Ori Studio original work, not a port.

use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use oristudio_layer_order::{FacePair, LayerOrder};
use serde::Serialize;
use treemaker_flatfold::{self as flatfold, Deduction, Enumeration, EnumerationStep, PairOrder};

use super::session::{
    Constraint, ConstraintSession, Limits, Seed, SessionRefusal, Solved, Steer, TimedOut,
    internal_search, upper_lower,
};
use super::stacks::{ChangedSpots, Spots, ViewSide};
use crate::complete::{self, ChoiceCount};
use crate::pattern::FaceId;

/// The top of an open spot whose candidates leave none above (from the
/// front) or below (from the back) all the others: never for an order
/// transitive on the spot (see the module docs).
pub const NO_TOP: u32 = u32::MAX;

const FRONT: usize = 0;
const BACK: usize = 1;
const NO_COMPONENT: u32 = u32::MAX;
/// In a view's sorted keys: the view's own target, not a counted key.
const TARGET: u32 = u32::MAX;

fn side_index(side: ViewSide) -> usize {
    match side {
        ViewSide::Front => FRONT,
        ViewSide::Back => BACK,
    }
}

/// How far a count goes before it reads "at least". Every cap is a count,
/// so a count is the same however it is sliced.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SolutionCaps {
    /// Orders listed per component, by each of its two searches: one order
    /// per distinct assignment of what its pictures read, then every layer
    /// order.
    pub orders_per_component: u64,
    /// Combinations of its members' projections a look group walks.
    pub combinations_per_group: u64,
    /// Bits of whole component orders kept, across components, for the
    /// order a step falls back on and for X-ray stepping. A component past
    /// it is still counted; X-ray then steps through the orders kept.
    pub stored_bits: u64,
}

impl SolutionCaps {
    pub const DEFAULT_ORDERS_PER_COMPONENT: u64 = 100_000;
    pub const DEFAULT_COMBINATIONS_PER_GROUP: u64 = 1_000_000;
    /// 16 MiB.
    pub const DEFAULT_STORED_BITS: u64 = 1 << 27;
}

impl Default for SolutionCaps {
    fn default() -> SolutionCaps {
        SolutionCaps {
            orders_per_component: Self::DEFAULT_ORDERS_PER_COMPONENT,
            combinations_per_group: Self::DEFAULT_COMBINATIONS_PER_GROUP,
            stored_bits: Self::DEFAULT_STORED_BITS,
        }
    }
}

/// A count: exact, or a lower bound ("at least `n`").
///
/// Serialized for JavaScript as [`ChoiceCount`] is: past
/// [`ChoiceCount::MAX_SENT`] it is sent as that bound, inexact.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tally {
    /// Saturating at `u64::MAX`.
    pub n: u64,
    pub exact: bool,
}

impl Serialize for Tally {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut out = serializer.serialize_struct("Tally", 2)?;
        out.serialize_field("n", &self.n.min(ChoiceCount::MAX_SENT))?;
        out.serialize_field("exact", &(self.exact && self.n <= ChoiceCount::MAX_SENT))?;
        out.end()
    }
}

/// What [`Solutions::advance`] has counted so far.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SolutionCount {
    /// Distinct pictures from the front ("N solutions").
    pub front: Tally,
    /// Distinct pictures from the back.
    pub back: Tally,
    /// Layer orders that fit ("24 layer orders fit").
    pub orders: Tally,
    /// Nothing is left to count: every tally is final, exact or "at least"
    /// at a cap.
    pub done: bool,
}

/// How a count splits its problem ([`Solutions::shape`]); per side, front
/// then back.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct CountShape {
    /// Independent components of the open pairs.
    pub components: usize,
    /// The most pairs in one component.
    pub largest_component: usize,
    /// Spots whose top the forced pairs leave to choose.
    pub open_spots: [usize; 2],
    pub groups: [usize; 2],
    /// Look groups of more than one component (see the module docs).
    pub joined_groups: [usize; 2],
}

/// What the stepper steps through.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(tag = "by", content = "side", rename_all = "snake_case")]
pub enum StepBy {
    /// Distinct pictures from a side: X-ray off.
    Picture(ViewSide),
    /// Every layer order: X-ray on (decision D5).
    LayerOrder,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StepDirection {
    Next,
    Previous,
}

/// Where an order lies in the stepper's fixed order.
///
/// Serialized for JavaScript as [`Tally`] is: an index past
/// [`ChoiceCount::MAX_SENT`] is sent as that bound. With X-ray on, the index
/// of a layer order can be past it (census 2 met three designs whose orders
/// pass 2⁵³), and `serde-wasm-bindgen` refuses a larger `u64`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Position {
    /// From 1. Final only when `total` is exact; before that it counts
    /// among the solutions found so far, and can move as more are found.
    pub index: u64,
    /// The pictures from the side, or with X-ray the layer orders.
    pub total: Tally,
}

impl Serialize for Position {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut out = serializer.serialize_struct("Position", 2)?;
        out.serialize_field("index", &self.index.min(ChoiceCount::MAX_SENT))?;
        out.serialize_field("total", &self.total)?;
        out.end()
    }
}

/// A step that moved the order on screen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Moved {
    /// The spots whose top face changed, per side.
    pub changed: ChangedSpots,
    pub position: Position,
}

/// What [`ConstraintSession::step`] did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Stepped {
    Moved(Moved),
    /// No solution lies that way among those found: the one on screen is
    /// the first (previous) or the last (next). Final once the count is
    /// done ([`Solutions::is_done`]).
    End,
    /// The check that finds the closest order within the next solution ran
    /// out of its limits, and no counted order of that solution was kept to
    /// fall back on. Nothing changed.
    TimedOut(TimedOut),
}

/// One pair among an open spot's candidates.
#[derive(Debug, Clone)]
struct SpotPair {
    /// The pair's smaller and larger face, as indices into the spot's
    /// candidates.
    lo: u32,
    hi: u32,
    variable: u32,
    component: u32,
    /// Its group's member (an index into the group's members) and its bit
    /// in that member's projection.
    member: u32,
    bit: u32,
}

/// A spot whose top, from one side, the forced pairs leave to choose.
#[derive(Debug, Clone)]
struct OpenSpot {
    candidates: Vec<u32>,
    pairs: Vec<SpotPair>,
}

/// The face on top of `spot` from side `s` when `lo_above(pair)` says
/// whether each candidate pair's smaller face lies above: from the front
/// the candidate above all the others, from the back the one below them.
fn top_of(
    spot: &OpenSpot,
    s: usize,
    lo_above: impl Fn(&SpotPair) -> bool,
    wins: &mut Vec<u32>,
) -> u32 {
    let n = spot.candidates.len();
    wins.clear();
    wins.resize(n, 0);
    for pair in &spot.pairs {
        let winner = if lo_above(pair) { pair.lo } else { pair.hi };
        wins[winner as usize] += 1;
    }
    let wanted = if s == FRONT { n as u32 - 1 } else { 0 };
    // A face above all the others is unique, and so is one below them.
    wins.iter()
        .position(|&w| w == wanted)
        .map_or(NO_TOP, |c| spot.candidates[c])
}

/// A look group: components whose open spots share candidate pairs.
#[derive(Debug, Clone, Default)]
struct Group {
    /// Components, ascending.
    members: Vec<u32>,
    /// Its open spots, indices into the side's, ascending.
    spots: Vec<u32>,
    /// Its distinct keys (each spot's top), `spots.len()` per key, in the
    /// order found.
    keys: Vec<u32>,
    index: HashMap<Vec<u32>, u32>,
    /// Per key, the members' projections that first gave it.
    reps: Vec<Vec<u32>>,
    /// Once walked: the keys in lexicographic order.
    sorted: Vec<u32>,
    combinations: u64,
    /// A group of one component is keyed as its projections are found, and
    /// stops at its cap there.
    capped: bool,
    walked: bool,
    /// Walked to the end over members counted to the end.
    complete: bool,
}

impl Group {
    /// The key combination `at` gives, counted once.
    fn insert(&mut self, key: Vec<u32>, at: &[u32]) {
        if !self.index.contains_key(&key) {
            self.index.insert(key.clone(), self.reps.len() as u32);
            self.keys.extend_from_slice(&key);
            self.reps.push(at.to_vec());
        }
        self.combinations += 1;
    }

    /// Every combination walked, or a cap reached: sort the keys.
    fn close(&mut self, capped: bool, members_complete: bool) {
        self.walked = true;
        self.complete = !capped && members_complete;
        let width = self.spots.len();
        let keys = &self.keys;
        let mut sorted: Vec<u32> = (0..self.reps.len() as u32).collect();
        sorted.sort_by(|&a, &b| {
            keys[a as usize * width..(a as usize + 1) * width]
                .cmp(&keys[b as usize * width..(b as usize + 1) * width])
        });
        self.sorted = sorted;
    }
}

/// The key (each of its spots' top) of `group`'s combination `at`, one
/// projection per member.
fn key_at(
    spots: &[OpenSpot],
    group: &Group,
    components: &[Component],
    s: usize,
    at: &[u32],
    wins: &mut Vec<u32>,
) -> Vec<u32> {
    group
        .spots
        .iter()
        .map(|&i| {
            top_of(
                &spots[i as usize],
                s,
                |pair| {
                    let m = pair.member as usize;
                    let member = &components[group.members[m] as usize].projections[s];
                    !get_bit(member.get(at[m] as usize), pair.bit as usize)
                },
                wins,
            )
        })
        .collect()
}

#[derive(Debug, Clone, Default)]
struct Side {
    /// Ascending by spot.
    spots: Vec<OpenSpot>,
    groups: Vec<Group>,
}

/// A component's orders projected onto the pairs one side's spots read.
#[derive(Debug, Clone, Default)]
struct Projections {
    /// Places in the component's variables, ascending.
    relevant: Vec<u32>,
    words: usize,
    /// Distinct projections, `words` each, in the order found.
    list: Vec<u64>,
    index: HashMap<Vec<u64>, u32>,
    /// Per projection, the kept order that first gave it.
    representative: Vec<Option<u32>>,
}

impl Projections {
    fn len(&self) -> usize {
        self.representative.len()
    }

    fn get(&self, i: usize) -> &[u64] {
        &self.list[i * self.words..(i + 1) * self.words]
    }
}

#[derive(Debug, Clone)]
struct Component {
    /// Its variables, ascending: a place is an index into these.
    variables: Vec<u32>,
    /// Per variable in the search's order, its place.
    place: Vec<u32>,
    words: usize,
    /// The variables a picture reads from either side, in the search's
    /// order: what the pictures' search assigns first.
    read: Vec<usize>,
    /// Orders the pictures' search found: one per distinct assignment of
    /// `read`.
    pictures: u64,
    pictures_finished: bool,
    pictures_complete: bool,
    /// The orders of the pictures' search that gave a projection first,
    /// `words` each: what a step falls back on.
    reps: Vec<u64>,
    /// Orders listed by the full enumeration.
    orders: u64,
    orders_finished: bool,
    orders_complete: bool,
    /// Whole orders kept, `words` each (a bit per place, set where the
    /// larger face lies above), in the order found: X-ray's.
    kept: Vec<u64>,
    kept_count: u32,
    /// Once finished: the kept orders in lexicographic order.
    sorted: Vec<u32>,
    projections: [Projections; 2],
}

impl Component {
    fn kept(&self, i: usize) -> &[u64] {
        &self.kept[i * self.words..(i + 1) * self.words]
    }

    fn rep(&self, i: usize) -> &[u64] {
        &self.reps[i * self.words..(i + 1) * self.words]
    }

    /// An order of it as bits, from its values in the search's order.
    fn bits_of(&self, values: &[PairOrder]) -> Vec<u64> {
        let mut bits = vec![0u64; self.words];
        for (i, value) in values.iter().enumerate() {
            if *value == PairOrder::SecondAbove {
                set_bit(&mut bits, self.place[i] as usize);
            }
        }
        bits
    }
}

fn words_for(bits: usize) -> usize {
    bits.div_ceil(64)
}

/// Bit `p`, most significant first, so that comparing words compares
/// places in order.
fn set_bit(words: &mut [u64], p: usize) {
    words[p / 64] |= 1 << (63 - p % 64);
}

fn get_bit(words: &[u64], p: usize) -> bool {
    words[p / 64] & (1 << (63 - p % 64)) != 0
}

fn order_of_bit(set: bool) -> PairOrder {
    if set {
        PairOrder::SecondAbove
    } else {
        PairOrder::FirstAbove
    }
}

/// A layer order's value as a key: 1 where the smaller face lies above, 2
/// where the larger does.
fn value_key(order: PairOrder) -> u32 {
    match order {
        PairOrder::FirstAbove => 1,
        PairOrder::SecondAbove => 2,
    }
}

/// Which face of every pair the forced pairs put above: `n²` bits.
struct ForcedTable {
    n: usize,
    bits: Vec<u64>,
}

impl ForcedTable {
    fn of(n: usize, variables: &[FacePair], forced: &[Option<PairOrder>]) -> ForcedTable {
        let mut bits = vec![0u64; (n * n).div_ceil(64)];
        for (pair, value) in variables.iter().zip(forced) {
            if let Some(value) = value {
                let (upper, lower) = upper_lower(*pair, *value);
                let i = upper.0 as usize * n + lower.0 as usize;
                if let Some(word) = bits.get_mut(i / 64) {
                    *word |= 1 << (i % 64);
                }
            }
        }
        ForcedTable { n, bits }
    }

    /// Whether `f` is forced above `g`.
    fn above(&self, f: u32, g: u32) -> bool {
        let i = f as usize * self.n + g as usize;
        self.bits
            .get(i / 64)
            .is_some_and(|w| w & (1 << (i % 64)) != 0)
    }
}

/// Half of `limits`' nodes, and a deadline halfway to its own.
fn halved(limits: &Limits) -> Limits {
    Limits {
        max_nodes: limits.max_nodes.map(|n| n.div_ceil(2)),
        deadline: limits.deadline.map(|d| {
            let now = (d.now_ms)();
            complete::Deadline {
                at_ms: now + (d.at_ms - now).max(0.0) / 2.0,
                ..d
            }
        }),
        ..*limits
    }
}

/// A union–find over components.
fn find(parent: &mut [u32], mut x: u32) -> u32 {
    while parent[x as usize] != x {
        let up = parent[parent[x as usize] as usize];
        parent[x as usize] = up;
        x = up;
    }
    x
}

/// A product of counts, each exact or not, saturating.
fn product(factors: impl Iterator<Item = (u64, bool)>) -> Tally {
    let mut n: u128 = 1;
    let mut exact = true;
    let mut fits = true;
    for (factor, factor_exact) in factors {
        exact &= factor_exact;
        match n.checked_mul(u128::from(factor)) {
            Some(p) if p <= u128::from(u64::MAX) => n = p,
            _ => fits = false,
        }
    }
    Tally {
        n: if fits { n as u64 } else { u64::MAX },
        exact: exact && fits,
    }
}

/// See the module docs. Started by [`ConstraintSession::solutions`] for the
/// session's committed constraints, and good only for those: a commit or a
/// restore makes it stale ([`SessionRefusal::StaleSolutions`]). A step
/// keeps it.
#[derive(Debug, Clone)]
pub struct Solutions {
    /// The session counted (its number among the process's sessions) and
    /// its committed constraints then.
    session: u64,
    constraints: Vec<Constraint>,
    /// The session's variables.
    variables: Arc<[FacePair]>,
    caps: SolutionCaps,
    /// A fitting order the components that do not vary hold.
    hold: Vec<PairOrder>,
    components: Vec<Component>,
    sides: [Side; 2],
    /// Per component, the groups `(side, group)` of several components
    /// whose last member it is.
    ending: Vec<Vec<(u8, u32)>>,
    /// Per side, per component, the group it is alone in, if any.
    alone: [Vec<u32>; 2],
    /// The closure's split, a fresh cursor cloned from it per component.
    base: Enumeration,
    cursor: Option<Enumeration>,
    /// The components in the order counted: those a picture reads first,
    /// smallest first, then those only the layer orders count.
    schedule: Vec<u32>,
    /// How many of `schedule` a picture reads.
    read_count: usize,
    /// The places in `schedule` whose pictures, and whose orders, are
    /// counted next: every picture first, so they are exact as soon as they
    /// can be, then every order.
    next_pictures: usize,
    next_orders: usize,
    /// Groups whose members are all counted, to walk next.
    queue: VecDeque<(u8, u32)>,
    /// The combination the front group's walk is at.
    digits: Option<Vec<u32>>,
    kept_bits: u64,
    nodes: u64,
    done: bool,
}

/// Where a step goes.
enum Target {
    /// Exactly this order (X-ray).
    Order(Vec<PairOrder>),
    /// This picture: its tops per group, the seeds that make them, and a
    /// counted order with them, when one was kept.
    Picture {
        side: usize,
        keys: Vec<Vec<u32>>,
        seeds: Vec<Seed>,
        fallback: Option<Vec<PairOrder>>,
    },
}

impl Solutions {
    /// Start a count of the orders `seeds` leave in `search`, whose
    /// variables are `variables`, over `spots`; `hold` is a fitting order
    /// with those seeds.
    pub(crate) fn start(
        search: &flatfold::CompletionSession,
        variables: Arc<[FacePair]>,
        spots: &Spots,
        seeds: &[Seed],
        hold: Vec<PairOrder>,
        constraints: Vec<Constraint>,
        caps: SolutionCaps,
    ) -> Result<Solutions, SessionRefusal> {
        let deduced = match search.deduce(seeds, None).map_err(internal_search)? {
            Deduction::Deduced(deduced) => deduced,
            other => {
                return Err(SessionRefusal::internal(format!(
                    "the constraints counted do not deduce: {other:?}"
                )));
            }
        };
        if hold.len() != variables.len() {
            return Err(SessionRefusal::internal("a held order of the wrong length"));
        }
        let base = search.enumerate(&deduced).map_err(internal_search)?;
        let forced = deduced.forced();
        let mut component_of = vec![NO_COMPONENT; variables.len()];
        let mut components = Vec::with_capacity(base.components().len());
        for (k, list) in base.components().iter().enumerate() {
            let mut sorted: Vec<u32> = list.iter().map(|&v| v as u32).collect();
            sorted.sort_unstable();
            let mut place = Vec::with_capacity(list.len());
            for &v in list {
                component_of[v] = k as u32;
                let p = sorted
                    .binary_search(&(v as u32))
                    .map_err(|_| SessionRefusal::internal("a component lost a variable"))?;
                place.push(p as u32);
            }
            components.push(Component {
                words: words_for(sorted.len()),
                variables: sorted,
                place,
                read: Vec::new(),
                pictures: 0,
                pictures_finished: false,
                pictures_complete: false,
                reps: Vec::new(),
                orders: 0,
                orders_finished: false,
                orders_complete: false,
                kept: Vec::new(),
                kept_count: 0,
                sorted: Vec::new(),
                projections: [Projections::default(), Projections::default()],
            });
        }
        let table = ForcedTable::of(spots.face_count(), &variables, &forced);
        let mut sides = [Side::default(), Side::default()];
        let mut ending = vec![Vec::new(); components.len()];
        let mut alone = [
            vec![u32::MAX; components.len()],
            vec![u32::MAX; components.len()],
        ];
        for (s, side) in sides.iter_mut().enumerate() {
            for i in 0..spots.len() {
                let faces = spots.spot(i);
                let candidates: Vec<u32> = faces
                    .iter()
                    .copied()
                    .filter(|&f| {
                        !faces.iter().any(|&g| {
                            g != f
                                && if s == FRONT {
                                    table.above(g, f)
                                } else {
                                    table.above(f, g)
                                }
                        })
                    })
                    .collect();
                if candidates.len() < 2 {
                    continue;
                }
                let mut pairs = Vec::new();
                for a in 0..candidates.len() {
                    for b in a + 1..candidates.len() {
                        let pair = FacePair::new(FaceId(candidates[a]), FaceId(candidates[b]))
                            .ok_or_else(|| SessionRefusal::internal("a spot lists a face twice"))?;
                        let v = variables.binary_search(&pair).map_err(|_| {
                            SessionRefusal::internal("two faces of a spot are no pair")
                        })?;
                        if forced[v].is_some() || component_of[v] == NO_COMPONENT {
                            return Err(SessionRefusal::internal(
                                "a pair of a spot's candidates is forced",
                            ));
                        }
                        let (lo, hi) = if pair.lo().0 == candidates[a] {
                            (a, b)
                        } else {
                            (b, a)
                        };
                        pairs.push(SpotPair {
                            lo: lo as u32,
                            hi: hi as u32,
                            variable: v as u32,
                            component: component_of[v],
                            member: 0,
                            bit: 0,
                        });
                    }
                }
                side.spots.push(OpenSpot { candidates, pairs });
            }
            // Look groups: components joined by a spot.
            let mut parent: Vec<u32> = (0..components.len() as u32).collect();
            let mut touched = vec![false; components.len()];
            for spot in &side.spots {
                let first = spot.pairs[0].component;
                touched[first as usize] = true;
                for pair in &spot.pairs[1..] {
                    touched[pair.component as usize] = true;
                    let (a, b) = (find(&mut parent, first), find(&mut parent, pair.component));
                    if a != b {
                        parent[a.max(b) as usize] = a.min(b);
                    }
                }
            }
            let mut group_of_root = HashMap::new();
            let mut group_of = vec![u32::MAX; components.len()];
            for k in 0..components.len() as u32 {
                if !touched[k as usize] {
                    continue;
                }
                let root = find(&mut parent, k);
                let next = side.groups.len() as u32;
                let g = *group_of_root.entry(root).or_insert(next);
                if g == next {
                    side.groups.push(Group::default());
                }
                group_of[k as usize] = g;
                side.groups[g as usize].members.push(k);
            }
            // Each component's projection reads the pairs its spots read.
            let mut relevant: Vec<Vec<u32>> = vec![Vec::new(); components.len()];
            for spot in &side.spots {
                for pair in &spot.pairs {
                    let component = &components[pair.component as usize];
                    let p = component
                        .variables
                        .binary_search(&pair.variable)
                        .map_err(|_| SessionRefusal::internal("a pair left its component"))?;
                    relevant[pair.component as usize].push(p as u32);
                }
            }
            for (k, places) in relevant.iter_mut().enumerate() {
                places.sort_unstable();
                places.dedup();
                components[k].projections[s] = Projections {
                    words: words_for(places.len()),
                    relevant: std::mem::take(places),
                    ..Projections::default()
                };
            }
            for (i, spot) in side.spots.iter_mut().enumerate() {
                let g = group_of[spot.pairs[0].component as usize];
                let group = &mut side.groups[g as usize];
                group.spots.push(i as u32);
                for pair in &mut spot.pairs {
                    let component = &components[pair.component as usize];
                    let place = component
                        .variables
                        .binary_search(&pair.variable)
                        .map_err(|_| SessionRefusal::internal("a pair left its component"))?
                        as u32;
                    pair.member = group
                        .members
                        .binary_search(&pair.component)
                        .map_err(|_| SessionRefusal::internal("a pair left its group"))?
                        as u32;
                    pair.bit = component.projections[s]
                        .relevant
                        .binary_search(&place)
                        .map_err(|_| SessionRefusal::internal("a pair left its projection"))?
                        as u32;
                }
            }
            for (g, group) in side.groups.iter().enumerate() {
                match group.members.as_slice() {
                    [one] => alone[s][*one as usize] = g as u32,
                    [.., last] => ending[*last as usize].push((s as u8, g as u32)),
                    [] => {}
                }
            }
        }
        // What the pictures' search assigns first: the pairs either side's
        // spots read, in the component's own order.
        for (component, list) in components.iter_mut().zip(base.components()) {
            let mut reads = vec![false; component.variables.len()];
            for projections in &component.projections {
                for &p in &projections.relevant {
                    reads[p as usize] = true;
                }
            }
            component.read = list
                .iter()
                .zip(&component.place)
                .filter(|(_, p)| reads[**p as usize])
                .map(|(&v, _)| v)
                .collect();
        }
        // The components a picture reads first, each in order, so a group's
        // last member to be counted is its last.
        let (mut schedule, rest): (Vec<u32>, Vec<u32>) =
            (0..components.len() as u32).partition(|&k| !components[k as usize].read.is_empty());
        let read_count = schedule.len();
        schedule.extend(rest);
        Ok(Solutions {
            // Set by the session that starts it.
            session: u64::MAX,
            variables,
            constraints,
            caps,
            hold,
            components,
            sides,
            ending,
            alone,
            base,
            cursor: None,
            schedule,
            read_count,
            next_pictures: 0,
            next_orders: 0,
            queue: VecDeque::new(),
            digits: None,
            kept_bits: 0,
            nodes: 0,
            done: false,
        })
    }

    /// Count on within `limits` (search nodes, one per node of a
    /// component's search and one per combination walked, and a deadline),
    /// and say what is counted so far. Resumes where the last call stopped;
    /// once done, it only reads.
    pub fn advance(
        &mut self,
        session: &ConstraintSession,
        limits: &Limits,
    ) -> Result<SolutionCount, SessionRefusal> {
        self.ensure_for(session)?;
        self.advance_on(session.letter_search(), limits)
    }

    pub(crate) fn advance_on(
        &mut self,
        search: &flatfold::CompletionSession,
        limits: &Limits,
    ) -> Result<SolutionCount, SessionRefusal> {
        let mut left = limits.max_nodes;
        while !self.done {
            if limits.deadline.is_some_and(|d| d.passed()) || left == Some(0) {
                break;
            }
            if let Some(&(s, g)) = self.queue.front() {
                if !self.walk(s as usize, g as usize, &mut left, limits) {
                    break;
                }
                self.queue.pop_front();
                continue;
            }
            let pictures = self.next_pictures < self.read_count;
            if !pictures && self.next_orders == self.components.len() {
                self.done = true;
                break;
            }
            if !self.count_component(search, pictures, &mut left, limits)? {
                break;
            }
        }
        Ok(self.count())
    }

    /// What is counted so far.
    pub fn count(&self) -> SolutionCount {
        let pictures = |s: usize| {
            product(
                self.sides[s]
                    .groups
                    .iter()
                    .map(|g| ((g.reps.len() as u64).max(1), g.walked && g.complete)),
            )
        };
        SolutionCount {
            front: pictures(FRONT),
            back: pictures(BACK),
            orders: product(
                self.components
                    .iter()
                    .map(|c| (c.orders.max(1), c.orders_finished && c.orders_complete)),
            ),
            done: self.done,
        }
    }

    /// Nothing is left to count.
    pub fn is_done(&self) -> bool {
        self.done
    }

    /// How the count splits the problem: what a census reports.
    pub fn shape(&self) -> CountShape {
        let per_side = |f: &dyn Fn(&Side) -> usize| [f(&self.sides[FRONT]), f(&self.sides[BACK])];
        CountShape {
            components: self.components.len(),
            largest_component: self
                .components
                .iter()
                .map(|c| c.variables.len())
                .max()
                .unwrap_or(0),
            open_spots: per_side(&|side| side.spots.len()),
            groups: per_side(&|side| side.groups.len()),
            joined_groups: per_side(&|side| {
                side.groups.iter().filter(|g| g.members.len() > 1).count()
            }),
        }
    }

    /// Search nodes and combinations spent so far.
    pub fn nodes(&self) -> u64 {
        self.nodes
    }

    /// Where `order` (every overlapping pair of the session) lies in the
    /// stepper's order: the index a dialog shows for an order a count in
    /// another worker did not find itself.
    pub fn position_of(
        &self,
        session: &ConstraintSession,
        by: StepBy,
        order: &LayerOrder,
    ) -> Result<Position, SessionRefusal> {
        self.ensure_for(session)?;
        let values = self
            .variables
            .iter()
            .map(|pair| match order.above(pair.lo(), pair.hi()) {
                Some(true) => Ok(PairOrder::FirstAbove),
                Some(false) => Ok(PairOrder::SecondAbove),
                None => Err(SessionRefusal::internal(format!(
                    "the order leaves {}–{} open",
                    pair.lo(),
                    pair.hi()
                ))),
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(self.position_values(by, &values))
    }

    pub(crate) fn ensure_for(&self, session: &ConstraintSession) -> Result<(), SessionRefusal> {
        if self.session == session.id() && self.constraints == session.constraints() {
            Ok(())
        } else {
            Err(SessionRefusal::StaleSolutions)
        }
    }

    /// Count the next component's pictures (`pictures`) or orders on, to
    /// the end or a cap (`true`), or until the limits stop it (`false`).
    ///
    /// Its pictures come from a search that assigns the pairs a picture
    /// reads first and completes each assignment of them once
    /// (`Enumeration::projected`): the orders that differ only in hidden
    /// layers, which can be most of a deep stack's, are never listed. Its
    /// layer orders, after every component's pictures, come from the whole
    /// enumeration of its orders (`Enumeration::varying`).
    fn count_component(
        &mut self,
        search: &flatfold::CompletionSession,
        pictures: bool,
        left: &mut Option<u64>,
        limits: &Limits,
    ) -> Result<bool, SessionRefusal> {
        let place = if pictures {
            self.next_pictures
        } else {
            self.next_orders
        };
        let k = self.schedule[place] as usize;
        let mut cursor = match self.cursor.take() {
            Some(cursor) => cursor,
            None if pictures => self
                .base
                .clone()
                .projected(k, &self.components[k].read, &self.hold)
                .map_err(internal_search)?,
            None => self
                .base
                .clone()
                .varying(&[k], &self.hold)
                .map_err(internal_search)?,
        };
        loop {
            let budget = complete::search_budget(*left, limits.deadline);
            let before = cursor.nodes();
            let step = cursor.next(search, budget).map_err(internal_search)?;
            let used = cursor.nodes() - before;
            self.nodes += used;
            if let Some(left) = left.as_mut() {
                *left = left.saturating_sub(used);
            }
            match step {
                EnumerationStep::Order => {
                    let component = &self.components[k];
                    let listed = if pictures {
                        component.pictures
                    } else {
                        component.orders
                    };
                    if listed >= self.caps.orders_per_component {
                        self.finish_component(k, pictures, false);
                        return Ok(true);
                    }
                    let values = cursor
                        .component_order(k)
                        .ok_or_else(|| SessionRefusal::internal("an order step with no order"))?;
                    if pictures {
                        self.record_picture(k, &values);
                    } else {
                        self.record_order(k, &values);
                    }
                }
                EnumerationStep::Exhausted => {
                    self.finish_component(k, pictures, true);
                    return Ok(true);
                }
                EnumerationStep::Stopped(_) => {
                    self.cursor = Some(cursor);
                    return Ok(false);
                }
                EnumerationStep::Unsatisfied(_) => {
                    return Err(SessionRefusal::internal(
                        "a component of a fitting order has no order",
                    ));
                }
            }
        }
    }

    /// Keep `bits` within the budget, in `store` (a component's
    /// representatives or its X-ray orders); its index there, if kept.
    fn keep(&mut self, k: usize, bits: &[u64], reps: bool) -> Option<u32> {
        let component = &mut self.components[k];
        let cost = 64 * component.words as u64;
        if self.kept_bits + cost > self.caps.stored_bits {
            return None;
        }
        self.kept_bits += cost;
        if reps {
            component.reps.extend_from_slice(bits);
            Some((component.reps.len() / component.words.max(1)) as u32 - 1)
        } else {
            component.kept.extend_from_slice(bits);
            component.kept_count += 1;
            Some(component.kept_count - 1)
        }
    }

    /// One order of component `k` from the whole enumeration, its values in
    /// the search's order: counted, and kept for X-ray.
    fn record_order(&mut self, k: usize, values: &[PairOrder]) {
        self.components[k].orders += 1;
        let bits = self.components[k].bits_of(values);
        self.keep(k, &bits, false);
    }

    /// One order of component `k` from the pictures' search, its values in
    /// the search's order: a distinct assignment of what a picture reads.
    fn record_picture(&mut self, k: usize, values: &[PairOrder]) {
        self.components[k].pictures += 1;
        let bits = self.components[k].bits_of(values);
        let keys: [Option<Vec<u64>>; 2] = [FRONT, BACK].map(|s| {
            let projections = &self.components[k].projections[s];
            if projections.relevant.is_empty() {
                return None;
            }
            let mut key = vec![0u64; projections.words];
            for (r, &p) in projections.relevant.iter().enumerate() {
                if get_bit(&bits, p as usize) {
                    set_bit(&mut key, r);
                }
            }
            (!projections.index.contains_key(&key)).then_some(key)
        });
        let rep = if keys.iter().any(Option::is_some) {
            self.keep(k, &bits, true)
        } else {
            None
        };
        let mut found = [None, None];
        for (s, key) in keys.into_iter().enumerate() {
            let Some(key) = key else {
                continue;
            };
            let projections = &mut self.components[k].projections[s];
            let i = projections.representative.len() as u32;
            projections.list.extend_from_slice(&key);
            projections.index.insert(key, i);
            projections.representative.push(rep);
            found[s] = Some(i);
        }
        // A group of this component alone is keyed as its projections are
        // found, as walking them after would key them, in the same order:
        // its count grows while the component is counted.
        for (s, found) in found.into_iter().enumerate() {
            let (Some(i), Some(&g)) = (found, self.alone[s].get(k)) else {
                continue;
            };
            let Some(group) = self.sides[s].groups.get_mut(g as usize) else {
                continue;
            };
            if group.combinations >= self.caps.combinations_per_group {
                group.capped = true;
                continue;
            }
            let mut wins = Vec::new();
            let key = key_at(
                &self.sides[s].spots,
                group,
                &self.components,
                s,
                &[i],
                &mut wins,
            );
            group.insert(key, &[i]);
            self.nodes += 1;
        }
    }

    fn finish_component(&mut self, k: usize, pictures: bool, complete: bool) {
        self.cursor = None;
        let component = &mut self.components[k];
        if !pictures {
            component.orders_finished = true;
            component.orders_complete = complete;
            let mut sorted: Vec<u32> = (0..component.kept_count).collect();
            sorted.sort_by(|&a, &b| component.kept(a as usize).cmp(component.kept(b as usize)));
            component.sorted = sorted;
            self.next_orders += 1;
            return;
        }
        component.pictures_finished = true;
        component.pictures_complete = complete;
        for s in [FRONT, BACK] {
            let none = self.components[k].projections[s].len() == 0;
            if let Some(group) = self.alone[s]
                .get(k)
                .and_then(|&g| self.sides[s].groups.get_mut(g as usize))
            {
                let capped = group.capped || none;
                group.close(capped, complete);
            }
        }
        self.next_pictures += 1;
        self.queue.extend(self.ending[k].iter().copied());
    }

    /// Walk group `g` of side `s` on, to its end or its cap (`true`), or
    /// until the limits stop it (`false`).
    fn walk(&mut self, s: usize, g: usize, left: &mut Option<u64>, limits: &Limits) -> bool {
        let Solutions {
            sides,
            components,
            caps,
            digits,
            nodes,
            ..
        } = self;
        let side = &mut sides[s];
        let group = &mut side.groups[g];
        let radix: Vec<u32> = group
            .members
            .iter()
            .map(|&m| components[m as usize].projections[s].len() as u32)
            .collect();
        let mut at = digits.take().unwrap_or_else(|| vec![0; radix.len()]);
        let mut wins = Vec::new();
        let mut since_clock = 0u32;
        // A member with no order counted (a cap of none) leaves no picture
        // counted, and not every one.
        let capped = radix.contains(&0)
            || loop {
                if group.combinations >= caps.combinations_per_group {
                    break true;
                }
                if *left == Some(0) {
                    *digits = Some(at);
                    return false;
                }
                since_clock += 1;
                if since_clock >= 256 {
                    since_clock = 0;
                    if limits.deadline.is_some_and(|d| d.passed()) {
                        *digits = Some(at);
                        return false;
                    }
                }
                let key = key_at(&side.spots, group, components, s, &at, &mut wins);
                group.insert(key, &at);
                *nodes += 1;
                if let Some(left) = left.as_mut() {
                    *left = left.saturating_sub(1);
                }
                // The next combination, the last member fastest.
                let mut i = at.len();
                let finished = loop {
                    if i == 0 {
                        break true;
                    }
                    i -= 1;
                    at[i] += 1;
                    if at[i] < radix[i] {
                        break false;
                    }
                    at[i] = 0;
                };
                if finished {
                    break false;
                }
            };
        let members_complete = group
            .members
            .iter()
            .all(|&m| components[m as usize].pictures_complete);
        group.close(capped, members_complete);
        true
    }

    /// Each group's tops of side `s` for the complete order `values`.
    fn picture_targets(&self, s: usize, values: &[PairOrder]) -> Vec<Vec<u32>> {
        let side = &self.sides[s];
        let mut wins = Vec::new();
        side.groups
            .iter()
            .map(|group| {
                group
                    .spots
                    .iter()
                    .map(|&i| {
                        top_of(
                            &side.spots[i as usize],
                            s,
                            |pair| values[pair.variable as usize] == PairOrder::FirstAbove,
                            &mut wins,
                        )
                    })
                    .collect()
            })
            .collect()
    }

    /// The stepper's groups for `by`, each holding `values`' own key, and
    /// how many positions there are.
    fn views(&self, by: StepBy, values: &[PairOrder]) -> (Vec<View<'_>>, usize) {
        match by {
            StepBy::Picture(side) => {
                let s = side_index(side);
                let targets = self.picture_targets(s, values);
                let views = self.sides[s]
                    .groups
                    .iter()
                    .zip(targets)
                    .map(|(group, target)| {
                        View::new(
                            Store::Flat { keys: &group.keys },
                            &group.sorted,
                            group.walked,
                            target,
                            group.spots.clone(),
                        )
                    })
                    .collect();
                (views, self.sides[s].spots.len())
            }
            StepBy::LayerOrder => {
                let views = self
                    .components
                    .iter()
                    .map(|component| {
                        let target = component
                            .variables
                            .iter()
                            .map(|&v| value_key(values[v as usize]))
                            .collect();
                        View::new(
                            Store::Bits {
                                words: &component.kept,
                                per: component.words,
                            },
                            &component.sorted,
                            component.orders_finished,
                            target,
                            component.variables.clone(),
                        )
                    })
                    .collect();
                (views, self.variables.len())
            }
        }
    }

    pub(crate) fn position_values(&self, by: StepBy, values: &[PairOrder]) -> Position {
        let (views, positions) = self.views(by, values);
        let before = rank(&views, positions);
        let count = self.count();
        let total = match by {
            StepBy::Picture(ViewSide::Front) => count.front,
            StepBy::Picture(ViewSide::Back) => count.back,
            StepBy::LayerOrder => count.orders,
        };
        match before.and_then(|b| u64::try_from(b + 1).ok()) {
            Some(index) => Position { index, total },
            None => Position {
                index: u64::MAX,
                total: Tally {
                    exact: false,
                    ..total
                },
            },
        }
    }

    /// Where a step from `values` goes, if anywhere.
    fn target(&self, by: StepBy, values: &[PairOrder], direction: StepDirection) -> Option<Target> {
        let (views, positions) = self.views(by, values);
        let ranks = neighbour(&views, positions, direction == StepDirection::Next)?;
        match by {
            StepBy::LayerOrder => {
                let mut order = values.to_vec();
                for ((component, view), &rank) in self.components.iter().zip(&views).zip(&ranks) {
                    let i = view.sorted[rank];
                    if i == TARGET {
                        continue;
                    }
                    let kept = component.kept(i as usize);
                    for (p, &v) in component.variables.iter().enumerate() {
                        order[v as usize] = order_of_bit(get_bit(kept, p));
                    }
                }
                Some(Target::Order(order))
            }
            StepBy::Picture(side) => {
                let s = side_index(side);
                let open = &self.sides[s];
                let mut keys = Vec::with_capacity(views.len());
                let mut seeds = Vec::new();
                let mut fallback = Some(values.to_vec());
                for ((group, view), &rank) in open.groups.iter().zip(&views).zip(&ranks) {
                    let key: Vec<u32> = (0..view.width()).map(|p| view.get(rank, p)).collect();
                    for (&i, &top) in group.spots.iter().zip(&key) {
                        let spot = &open.spots[i as usize];
                        let Some(t) = spot.candidates.iter().position(|&c| c == top) else {
                            continue;
                        };
                        let t = t as u32;
                        for pair in spot.pairs.iter().filter(|p| p.lo == t || p.hi == t) {
                            // From the front the top lies above the rest;
                            // from the back, below them.
                            let lo_above = (pair.lo == t) == (s == FRONT);
                            seeds.push((pair.variable as usize, order_of_bit(!lo_above)));
                        }
                    }
                    let i = view.sorted[rank];
                    if i != TARGET
                        && let Some(order) = fallback.as_mut()
                    {
                        let mut kept_all = true;
                        for (&m, &p) in group.members.iter().zip(&group.reps[i as usize]) {
                            let component = &self.components[m as usize];
                            match component.projections[s].representative[p as usize] {
                                Some(r) => {
                                    let rep = component.rep(r as usize);
                                    for (place, &v) in component.variables.iter().enumerate() {
                                        order[v as usize] = order_of_bit(get_bit(rep, place));
                                    }
                                }
                                None => kept_all = false,
                            }
                        }
                        if !kept_all {
                            fallback = None;
                        }
                    }
                    keys.push(key);
                }
                Some(Target::Picture {
                    side: s,
                    keys,
                    seeds,
                    fallback,
                })
            }
        }
    }

    /// Whether `values` makes the picture `keys` (where a key names a top).
    fn shows(&self, s: usize, values: &[PairOrder], keys: &[Vec<u32>]) -> bool {
        self.picture_targets(s, values)
            .iter()
            .zip(keys)
            .all(|(got, want)| got.iter().zip(want).all(|(&g, &w)| w == NO_TOP || g == w))
    }
}

impl ConstraintSession {
    /// A count of the solutions the committed constraints leave, and the
    /// stepper's order through them (see [`Solutions`]), with the default
    /// caps. Nothing is counted until [`Solutions::advance`].
    pub fn solutions(&self) -> Result<Solutions, SessionRefusal> {
        self.solutions_with(SolutionCaps::default())
    }

    /// [`Self::solutions`] with other caps.
    pub fn solutions_with(&self, caps: SolutionCaps) -> Result<Solutions, SessionRefusal> {
        let seeds = self
            .seeds_of(self.constraints())?
            .map_err(|_| SessionRefusal::internal("the committed constraints oppose"))?;
        let mut solutions = Solutions::start(
            self.letter_search(),
            self.shared_variables().clone(),
            self.spots(),
            &seeds,
            self.shown_values().to_vec(),
            self.constraints().to_vec(),
            caps,
        )?;
        solutions.session = self.id();
        Ok(solutions)
    }

    /// Where the order on screen lies in the stepper's order.
    pub fn position(&self, solutions: &Solutions, by: StepBy) -> Result<Position, SessionRefusal> {
        solutions.ensure_for(self)?;
        Ok(solutions.position_values(by, self.shown_values()))
    }

    /// Show the next or the previous solution (see [`Solutions`]): with
    /// [`StepBy::Picture`] the next picture from that side, in the layer
    /// order closest to the one on screen within it; with
    /// [`StepBy::LayerOrder`] (X-ray) the next layer order. It adds no
    /// constraint, and only the order on screen changes.
    ///
    /// Unless the count is done, it first counts on within half of `limits`
    /// (the other half is the check's), so on a figure the count finishes
    /// the step follows the final order; the dialog keeps that work off the
    /// step by advancing the count between calls. Past that it steps
    /// through what is counted, and what it counted is kept.
    pub fn step(
        &mut self,
        solutions: &mut Solutions,
        by: StepBy,
        direction: StepDirection,
        limits: &Limits,
    ) -> Result<Stepped, SessionRefusal> {
        solutions.ensure_for(self)?;
        if !solutions.is_done() {
            solutions.advance_on(self.letter_search(), &halved(limits))?;
        }
        let Some(target) = solutions.target(by, self.shown_values(), direction) else {
            return Ok(Stepped::End);
        };
        let values = match target {
            Target::Order(values) => values,
            Target::Picture {
                side,
                keys,
                seeds,
                fallback,
            } => {
                let constraints = self.constraints().to_vec();
                match self.solve(&constraints, &seeds, Steer::Shown, limits)? {
                    Solved::Fit(fit) => {
                        let values = fit.into_values();
                        if solutions.shows(side, &values, &keys) {
                            values
                        } else {
                            fallback.ok_or_else(|| {
                                SessionRefusal::internal("a step's seeds did not make its picture")
                            })?
                        }
                    }
                    Solved::TimedOut(out) => match fallback {
                        Some(values) => values,
                        None => return Ok(Stepped::TimedOut(out)),
                    },
                    Solved::CantFit(_) => {
                        return Err(SessionRefusal::internal("a counted picture can't fit"));
                    }
                }
            }
        };
        let changed = self.show_values(values);
        Ok(Stepped::Moved(Moved {
            changed,
            position: solutions.position_values(by, self.shown_values()),
        }))
    }
}

/// Where a view's keys are.
enum Store<'a> {
    /// Keys of `u32`, one after another.
    Flat { keys: &'a [u32] },
    /// Keys as bits, `per` words each: 1 for a clear bit, 2 for a set one.
    Bits { words: &'a [u64], per: usize },
}

/// One group as the stepper sees it: its keys in lexicographic order, the
/// target's own key among them (the order a step starts from, or whose
/// index is asked).
struct View<'a> {
    store: Store<'a>,
    /// Indices into the store, ascending lexicographically; [`TARGET`] for
    /// the target where the store does not hold it.
    sorted: Cow<'a, [u32]>,
    target: Vec<u32>,
    /// The global position of each of its own, ascending.
    at: Vec<u32>,
}

impl<'a> View<'a> {
    /// A finished group's keys with the target among them, or, for a group
    /// not counted to its end, the target alone: it holds the picture on
    /// screen until its count finishes.
    fn new(
        store: Store<'a>,
        sorted: &'a [u32],
        finished: bool,
        target: Vec<u32>,
        at: Vec<u32>,
    ) -> View<'a> {
        let mut view = View {
            store,
            sorted: Cow::Owned(vec![TARGET]),
            target,
            at,
        };
        if finished {
            view.sorted = match sorted.binary_search_by(|&i| view.cmp_target(i)) {
                Ok(_) => Cow::Borrowed(sorted),
                Err(place) => {
                    let mut with = sorted.to_vec();
                    with.insert(place, TARGET);
                    Cow::Owned(with)
                }
            };
        }
        view
    }

    fn width(&self) -> usize {
        self.target.len()
    }

    fn len(&self) -> usize {
        self.sorted.len()
    }

    fn stored(&self, i: u32, p: usize) -> u32 {
        let i = i as usize;
        match self.store {
            Store::Flat { keys } => keys[i * self.width() + p],
            Store::Bits { words, per } => {
                if get_bit(&words[i * per..(i + 1) * per], p) {
                    2
                } else {
                    1
                }
            }
        }
    }

    /// The key of rank `rank`, at its position `p`.
    fn get(&self, rank: usize, p: usize) -> u32 {
        match self.sorted[rank] {
            TARGET => self.target[p],
            i => self.stored(i, p),
        }
    }

    /// Stored key `i` against the target.
    fn cmp_target(&self, i: u32) -> Ordering {
        (0..self.width())
            .map(|p| self.stored(i, p).cmp(&self.target[p]))
            .find(|o| o.is_ne())
            .unwrap_or(Ordering::Equal)
    }

    /// For each prefix length `l`, the ranks whose first `l` positions are
    /// the target's: `width() + 1` ranges, none empty, since the target is
    /// among the keys.
    fn prefix_ranges(&self) -> Vec<(usize, usize)> {
        let mut out = Vec::with_capacity(self.width() + 1);
        out.push((0, self.len()));
        for p in 0..self.width() {
            let (lo, hi) = out[p];
            let t = self.target[p];
            let below = lo + partition(hi - lo, |r| self.get(lo + r, p) < t);
            let through = lo + partition(hi - lo, |r| self.get(lo + r, p) <= t);
            out.push((below, through));
        }
        out
    }
}

/// The first of `0..n` for which `before` is false, `before` holding on a
/// prefix.
fn partition(n: usize, before: impl Fn(usize) -> bool) -> usize {
    let (mut lo, mut hi) = (0, n);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if before(mid) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    lo
}

/// Per global position, the view and the place in it that owns it.
fn owners(views: &[View<'_>], positions: usize) -> Vec<Option<(u32, u32)>> {
    let mut owner = vec![None; positions];
    for (g, view) in views.iter().enumerate() {
        for (j, &x) in view.at.iter().enumerate() {
            owner[x as usize] = Some((g as u32, j as u32));
        }
    }
    owner
}

/// How many keys of the product of `views` lie lexicographically (over the
/// global positions) before the product of their targets; `None` past
/// `u128`.
///
/// A key lies before the target when, at the first position `x` where they
/// differ, its value is smaller. With `x` owned by view `g` at its place
/// `j`, those keys are: in `g`, the keys agreeing with the target on its
/// first `j` places and smaller at `j`; in every other view `h`, any key
/// agreeing with the target on the places before `x`. So the count is a sum
/// over positions of one view's count times the others' prefix counts.
fn rank(views: &[View<'_>], positions: usize) -> Option<u128> {
    let ranges: Vec<Vec<(usize, usize)>> = views.iter().map(View::prefix_ranges).collect();
    let span = |r: (usize, usize)| (r.1 - r.0) as u128;
    // The product of every view's count at its current prefix: each at
    // least 1, so dividing one out is exact.
    let mut prod: u128 = 1;
    for r in &ranges {
        prod = prod.checked_mul(span(r[0]))?;
    }
    let mut before: u128 = 0;
    for owner in owners(views, positions).into_iter().flatten() {
        let (g, j) = (owner.0 as usize, owner.1 as usize);
        let r = &ranges[g];
        let others = prod / span(r[j]);
        before += others * (r[j + 1].0 - r[j].0) as u128;
        prod = others * span(r[j + 1]);
    }
    Some(before)
}

/// The rank, per view, of the key the product's next (or previous) key
/// after the targets' takes: the latest position where some key can be
/// larger (smaller) while agreeing before it, the smallest (largest) such
/// value there, and every view's smallest (largest) key agreeing before it.
fn neighbour(views: &[View<'_>], positions: usize, next: bool) -> Option<Vec<usize>> {
    let ranges: Vec<Vec<(usize, usize)>> = views.iter().map(View::prefix_ranges).collect();
    let owner = owners(views, positions);
    for x in (0..positions).rev() {
        let Some((g, j)) = owner[x] else {
            continue;
        };
        let (g, j) = (g as usize, j as usize);
        let (lo, hi) = ranges[g][j];
        let (equal_lo, equal_hi) = ranges[g][j + 1];
        let pick = if next {
            (equal_hi < hi).then_some(equal_hi)
        } else {
            (equal_lo > lo).then(|| equal_lo - 1)
        };
        let Some(pick) = pick else {
            continue;
        };
        return Some(
            views
                .iter()
                .enumerate()
                .map(|(h, view)| {
                    if h == g {
                        return pick;
                    }
                    let l = view.at.partition_point(|&p| (p as usize) < x);
                    let (lo, hi) = ranges[h][l];
                    if next { lo } else { hi - 1 }
                })
                .collect(),
        );
    }
    None
}

#[cfg(test)]
mod tests {
    //! The count and the stepper against brute force: every order the
    //! enumeration lists, grouped by picture. Over random small problems
    //! with several components, some sharing a spot (the product rule's
    //! groups), and over the fixtures CI runs, with and without
    //! constraints.

    use std::collections::{BTreeMap, BTreeSet};

    use treemaker_flatfold::{
        CompletionProblem, CompletionSession as Search, FixedAssignment, FixedKind, SearchBudget,
        SessionStart, VariableConstraints,
    };

    use super::*;
    use crate::steer::{LayerSource, Verb};

    struct Rng(u64);

    impl Rng {
        fn below(&mut self, n: usize) -> usize {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 % n.max(1) as u64) as usize
        }
    }

    const UNLIMITED: Limits = Limits {
        max_nodes: None,
        fast_nodes: 128,
        deadline: None,
    };

    /// Every complete order `seeds` leave, as the whole product walks them.
    fn every_order(search: &Search, seeds: &[Seed]) -> Vec<Vec<PairOrder>> {
        let Ok(Deduction::Deduced(deduced)) = search.deduce(seeds, None) else {
            panic!("the seeds do not deduce");
        };
        let mut cursor = search.enumerate(&deduced).expect("enumerate");
        let mut orders = Vec::new();
        loop {
            match cursor.next(search, SearchBudget::default()) {
                Ok(EnumerationStep::Order) => orders.push(cursor.order().expect("order")),
                Ok(EnumerationStep::Exhausted) => return orders,
                other => panic!("{other:?}"),
            }
        }
    }

    /// A picture by its definition, from scratch: per spot, the candidate
    /// (no face of the spot forced over it) above (front) or below (back)
    /// every other candidate, or `NO_TOP`.
    fn picture(
        spots: &Spots,
        variables: &[FacePair],
        forced: &[Option<PairOrder>],
        order: &[PairOrder],
        s: usize,
    ) -> Vec<u32> {
        let above = |f: u32, g: u32, values: &[Option<PairOrder>]| {
            let pair = FacePair::new(FaceId(f), FaceId(g)).expect("pair");
            let v = variables.binary_search(&pair).expect("a pair");
            values[v].is_some_and(|o| upper_lower(pair, o).0 == FaceId(f))
        };
        let full: Vec<Option<PairOrder>> = order.iter().copied().map(Some).collect();
        (0..spots.len())
            .map(|i| {
                let faces = spots.spot(i);
                let over = |f: u32, g: u32, values: &[Option<PairOrder>]| {
                    if s == FRONT {
                        above(f, g, values)
                    } else {
                        above(g, f, values)
                    }
                };
                let candidates: Vec<u32> = faces
                    .iter()
                    .copied()
                    .filter(|&f| !faces.iter().any(|&g| g != f && over(g, f, forced)))
                    .collect();
                candidates
                    .iter()
                    .copied()
                    .find(|&f| candidates.iter().all(|&g| g == f || over(f, g, &full)))
                    .unwrap_or(NO_TOP)
            })
            .collect()
    }

    /// What brute force gives: distinct pictures per side, in order, and
    /// every order, sorted by its values.
    struct Brute {
        pictures: [Vec<Vec<u32>>; 2],
        orders: Vec<Vec<PairOrder>>,
        /// Per side, per order, its picture.
        of: [Vec<Vec<u32>>; 2],
    }

    fn brute(search: &Search, seeds: &[Seed], spots: &Spots, variables: &[FacePair]) -> Brute {
        let Ok(Deduction::Deduced(deduced)) = search.deduce(seeds, None) else {
            panic!("the seeds do not deduce");
        };
        let forced = deduced.forced();
        let mut orders = every_order(search, seeds);
        let of = [FRONT, BACK].map(|s| {
            orders
                .iter()
                .map(|o| picture(spots, variables, &forced, o, s))
                .collect::<Vec<_>>()
        });
        let pictures = [FRONT, BACK].map(|s| {
            of[s]
                .iter()
                .cloned()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect()
        });
        orders.sort_by_key(|o| o.iter().map(|&v| value_key(v)).collect::<Vec<_>>());
        let of = [FRONT, BACK].map(|s| {
            orders
                .iter()
                .map(|o| picture(spots, variables, &forced, o, s))
                .collect()
        });
        Brute {
            pictures,
            orders,
            of,
        }
    }

    fn exact(n: usize) -> Tally {
        Tally {
            n: n as u64,
            exact: true,
        }
    }

    /// The count, one-shot and in slices, against brute force; capped
    /// counts never above it.
    fn check_count(
        search: &Search,
        start: impl Fn(SolutionCaps) -> Solutions,
        truth: &Brute,
        rng: &mut Rng,
    ) -> Solutions {
        let mut whole = start(SolutionCaps::default());
        let count = whole.advance_on(search, &UNLIMITED).expect("count");
        assert_eq!(
            (count.front, count.back, count.orders, count.done),
            (
                exact(truth.pictures[FRONT].len()),
                exact(truth.pictures[BACK].len()),
                exact(truth.orders.len()),
                true
            )
        );
        // In slices of a node or three: every count on the way is at most
        // the truth and never exact before the end, and the end is the
        // one-shot's.
        let mut sliced = start(SolutionCaps::default());
        let slice = Limits {
            max_nodes: Some(1 + rng.below(3) as u64),
            ..UNLIMITED
        };
        let mut calls = 0;
        loop {
            calls += 1;
            let so_far = sliced.advance_on(search, &slice).expect("slice");
            for (tally, truth) in [
                (so_far.front, truth.pictures[FRONT].len()),
                (so_far.back, truth.pictures[BACK].len()),
                (so_far.orders, truth.orders.len()),
            ] {
                assert!(tally.n <= truth as u64, "{so_far:?}");
                assert!(!tally.exact || tally.n == truth as u64);
            }
            if so_far.done {
                assert_eq!(so_far, count);
                break;
            }
            assert!(calls < 1_000_000);
        }
        assert_eq!(sliced.nodes(), whole.nodes());
        // Capped: at least, never more.
        let caps = SolutionCaps {
            orders_per_component: 1 + rng.below(3) as u64,
            combinations_per_group: 1 + rng.below(4) as u64,
            stored_bits: 64 * rng.below(6) as u64,
        };
        let capped = start(caps).advance_on(search, &UNLIMITED).expect("capped");
        assert!(capped.done);
        for (tally, truth) in [
            (capped.front, truth.pictures[FRONT].len()),
            (capped.back, truth.pictures[BACK].len()),
            (capped.orders, truth.orders.len()),
        ] {
            assert!(tally.n >= 1 && tally.n <= truth as u64, "{capped:?}");
            assert!(!tally.exact || tally.n == truth as u64);
        }
        whole
    }

    /// Where a step from `values` lands when no check is made: the counted
    /// order kept for the picture, or the next layer order.
    fn stepped(
        solutions: &Solutions,
        by: StepBy,
        values: &[PairOrder],
        direction: StepDirection,
    ) -> Option<Vec<PairOrder>> {
        match solutions.target(by, values, direction)? {
            Target::Order(order) => Some(order),
            Target::Picture {
                side,
                keys,
                fallback,
                ..
            } => {
                let order = fallback.expect("every counted order is kept");
                assert!(solutions.shows(side, &order, &keys));
                Some(order)
            }
        }
    }

    /// The stepper against brute force: from any order, its index is one
    /// more than the pictures (orders) before it, and a step lands on the
    /// next (previous) one; walking next from the first visits each once.
    fn check_stepper(solutions: &Solutions, truth: &Brute, rng: &mut Rng) {
        for by in [
            StepBy::Picture(ViewSide::Front),
            StepBy::Picture(ViewSide::Back),
            StepBy::LayerOrder,
        ] {
            // Per order, what the stepper tells apart, and those keys
            // sorted: the stepper's order.
            let keys: Vec<Vec<u32>> = match by {
                StepBy::Picture(side) => truth.of[side_index(side)].clone(),
                StepBy::LayerOrder => truth
                    .orders
                    .iter()
                    .map(|o| o.iter().map(|&v| value_key(v)).collect())
                    .collect(),
            };
            let sequence: Vec<Vec<u32>> = keys
                .iter()
                .cloned()
                .collect::<BTreeSet<_>>()
                .into_iter()
                .collect();
            let key_of = |i: usize| keys[i].clone();
            let key_of_values = |values: &[PairOrder]| -> Vec<u32> {
                let i = truth
                    .orders
                    .iter()
                    .position(|o| o == values)
                    .expect("a step lands on an order that fits");
                key_of(i)
            };
            let rank_of = |key: &Vec<u32>| sequence.binary_search(key).expect("a counted key");
            for _ in 0..6 {
                let start = rng.below(truth.orders.len());
                let values = &truth.orders[start];
                let key = key_of(start);
                let at = rank_of(&key);
                let position = solutions.position_values(by, values);
                assert_eq!(position.index, at as u64 + 1);
                assert_eq!(position.total, exact(sequence.len()));
                for (direction, expected) in [
                    (StepDirection::Next, sequence.get(at + 1)),
                    (
                        StepDirection::Previous,
                        at.checked_sub(1).map(|p| &sequence[p]),
                    ),
                ] {
                    let landed = stepped(solutions, by, values, direction);
                    assert_eq!(landed.as_deref().map(key_of_values).as_ref(), expected);
                }
            }
            // From the first, next visits every one once, in order.
            let first = (0..truth.orders.len())
                .find(|&i| key_of(i) == sequence[0])
                .expect("the first");
            let mut values = truth.orders[first].clone();
            let mut visited = vec![key_of_values(&values)];
            while let Some(next) = stepped(solutions, by, &values, StepDirection::Next) {
                values = next;
                visited.push(key_of_values(&values));
                assert_eq!(
                    solutions.position_values(by, &values).index,
                    visited.len() as u64
                );
            }
            assert_eq!(visited, sequence);
        }
    }

    /// A problem of up to seven faces in up to four cells, letters fixed at
    /// random from one total order, and spots: the cells, smaller sets
    /// within them, and faces that overlap pairwise without sharing one cell
    /// (so a spot's candidates can span components).
    fn random_problem(rng: &mut Rng) -> (CompletionProblem, Vec<FacePair>, Vec<Vec<u32>>) {
        let n = 3 + rng.below(5);
        let mut cells: Vec<Vec<usize>> = Vec::new();
        for _ in 0..1 + rng.below(5) {
            let size = 2 + rng.below(3.min(n - 1));
            let mut cell: Vec<usize> = Vec::new();
            while cell.len() < size {
                let f = rng.below(n);
                if !cell.contains(&f) {
                    cell.push(f);
                }
            }
            cell.sort_unstable();
            cells.push(cell);
        }
        let mut pairs = BTreeSet::new();
        for cell in &cells {
            for (i, &a) in cell.iter().enumerate() {
                for &b in &cell[i + 1..] {
                    pairs.insert([a, b]);
                }
            }
        }
        let variables: Vec<[usize; 2]> = pairs.into_iter().collect();
        let rank: Vec<usize> = {
            let mut faces: Vec<usize> = (0..n).collect();
            for i in (1..n).rev() {
                faces.swap(i, rng.below(i + 1));
            }
            let mut rank = vec![0; n];
            for (r, &f) in faces.iter().enumerate() {
                rank[f] = r;
            }
            rank
        };
        let fixed = variables
            .iter()
            .enumerate()
            .filter(|_| rng.below(3) == 0)
            .map(|(variable, &[a, b])| FixedAssignment {
                variable,
                order: if rank[a] < rank[b] {
                    PairOrder::FirstAbove
                } else {
                    PairOrder::SecondAbove
                },
                kind: FixedKind::Seed,
            })
            .collect();
        let mut faces_cells = vec![Vec::new(); n];
        for (c, cell) in cells.iter().enumerate() {
            for &f in cell {
                faces_cells[f].push(c);
            }
        }
        let face_pairs: Vec<FacePair> = variables
            .iter()
            .map(|&[a, b]| FacePair::new(FaceId(a as u32), FaceId(b as u32)).expect("pair"))
            .collect();
        let mut spots: Vec<Vec<u32>> = Vec::new();
        for cell in &cells {
            spots.push(cell.iter().map(|&f| f as u32).collect());
            if cell.len() > 2 {
                let mut part: Vec<u32> = cell.iter().map(|&f| f as u32).collect();
                part.remove(rng.below(part.len()));
                spots.push(part);
            }
        }
        // Three faces pairwise overlapping: a spot across cells.
        for a in 0..n {
            for b in a + 1..n {
                for c in b + 1..n {
                    let is = |x: usize, y: usize| variables.binary_search(&[x, y]).is_ok();
                    let shared = cells
                        .iter()
                        .any(|cell| [a, b, c].iter().all(|f| cell.contains(f)));
                    if is(a, b) && is(b, c) && is(a, c) && !shared {
                        spots.push(vec![a as u32, b as u32, c as u32]);
                    }
                }
            }
        }
        (
            CompletionProblem {
                constraints: vec![VariableConstraints::default(); variables.len()],
                variables,
                faces_cells,
                cells_faces: cells,
                fixed,
            },
            face_pairs,
            spots,
        )
    }

    #[test]
    fn counts_and_steps_equal_brute_force_on_random_problems() {
        let mut rng = Rng(0x2545_f491_4f6c_dd1d);
        let mut tally: BTreeMap<&str, usize> = BTreeMap::new();
        let mut problems = 0;
        while problems < 300 {
            let (problem, variables, lists) = random_problem(&mut rng);
            let n = problem.faces_cells.len();
            let Ok(SessionStart::Open(search)) =
                Search::open(problem.clone(), SearchBudget::default())
            else {
                continue;
            };
            let variables: Arc<[FacePair]> = variables.into();
            let spots = Spots::from_lists(&lists, n);
            for round in 0..3 {
                // Seeds standing in for constraints: none, then a few drawn
                // from an order that fits, so they leave one.
                let all = every_order(&search, &[]);
                let seeds: Vec<Seed> = if round == 0 {
                    Vec::new()
                } else {
                    let fit = &all[rng.below(all.len())];
                    (0..1 + rng.below(2))
                        .map(|_| {
                            let v = rng.below(fit.len());
                            (v, fit[v])
                        })
                        .collect()
                };
                let truth = brute(&search, &seeds, &spots, &variables);
                let hold = truth.orders[rng.below(truth.orders.len())].clone();
                let start = |caps| {
                    Solutions::start(
                        &search,
                        variables.clone(),
                        &spots,
                        &seeds,
                        hold.clone(),
                        Vec::new(),
                        caps,
                    )
                    .expect("start")
                };
                let solutions = check_count(&search, start, &truth, &mut rng);
                check_stepper(&solutions, &truth, &mut rng);
                *tally.entry("rounds").or_default() += 1;
                let components = solutions.components.len();
                if components > 1 {
                    *tally.entry("several components").or_default() += 1;
                }
                if solutions
                    .sides
                    .iter()
                    .any(|side| side.groups.iter().any(|g| g.members.len() > 1))
                {
                    *tally.entry("a group of several components").or_default() += 1;
                }
                if truth.pictures[FRONT].iter().flatten().any(|&t| t == NO_TOP) {
                    *tally.entry("a spot with no top").or_default() += 1;
                }
                if truth.orders.len() > truth.pictures[FRONT].len() {
                    *tally.entry("hidden-layer variants").or_default() += 1;
                }
            }
            problems += 1;
        }
        println!("{tally:?}");
        for kind in [
            "several components",
            "a group of several components",
            "a spot with no top",
            "hidden-layer variants",
        ] {
            assert!(tally.get(kind).copied().unwrap_or(0) > 10, "{tally:?}");
        }
    }

    // The fixtures CI runs.

    const FIXTURES: &[(&str, &str)] = &[
        ("kabuto", "tests/fixtures/flat-folder/kabuto.fold"),
        (
            "solution_sample_1",
            "tests/fixtures/oriedita/solution_sample_1.cp",
        ),
        (
            "colorconstrainttest",
            "third_party/oriedita/oriedita-data/src/test/resources/colorconstrainttest.cp",
        ),
    ];

    fn open_fixture(relative: &str) -> ConstraintSession {
        use oristudio_cp::session::CpSession;
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join(relative);
        let text = std::fs::read_to_string(&path).expect("fixture");
        let mut cp = CpSession::new();
        let document = if relative.ends_with(".fold") {
            cp.load_fold(&text, "")
        } else {
            cp.load_cp(&text, "")
        }
        .expect("load");
        let lines: Vec<usize> = (1..=cp
            .document_summary(document)
            .expect("summary")
            .line_segments)
            .collect();
        let fold = cp
            .fold_source_of_selection(document, &lines, 1)
            .expect("source");
        let source = LayerSource::from_oriedita(&fold).expect("admitted");
        ConstraintSession::open(source, &Limits::default()).expect("open")
    }

    /// Brute force over a session: every order the committed constraints
    /// leave, each picture also read off the stacks the kernel's own rule
    /// builds, which must be the definition's.
    fn brute_session(session: &ConstraintSession) -> Brute {
        let seeds = session
            .seeds_of(session.constraints())
            .expect("constraints")
            .expect("they fit");
        let truth = brute(
            session.letter_search(),
            &seeds,
            session.spots(),
            session.variables(),
        );
        for (i, order) in truth.orders.iter().enumerate() {
            let stacks = session.spots().stacks(session.variables(), order);
            for (s, side) in [(FRONT, ViewSide::Front), (BACK, ViewSide::Back)] {
                let drawn = stacks.seen_from(side);
                for (spot, &top) in truth.of[s][i].iter().enumerate() {
                    assert_eq!(drawn.top(spot), Some(top), "spot {spot}");
                }
            }
        }
        truth
    }

    #[test]
    fn counts_and_steps_equal_brute_force_on_the_fixtures() {
        let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
        for &(name, relative) in FIXTURES {
            let mut session = open_fixture(relative);
            let mut rows = Vec::new();
            for round in 0..6 {
                if round > 0 {
                    // A constraint on an open pair, either way that fits.
                    let open = session.open_pairs();
                    if open.is_empty() {
                        break;
                    }
                    let pair = open[rng.below(open.len())];
                    let verb = if rng.below(2) == 0 {
                        Verb::InFrontOf
                    } else {
                        Verb::Behind
                    };
                    let c = Constraint::seen(
                        pair.lo(),
                        verb,
                        pair.hi(),
                        ViewSide::Front,
                        session.source().view(),
                    )
                    .expect("constraint");
                    let mut list = session.constraints().to_vec();
                    list.push(c);
                    if !matches!(
                        session.commit(list, &Limits::default()),
                        Ok(super::super::Commit::Committed(_))
                    ) {
                        continue;
                    }
                }
                let truth = brute_session(&session);
                let shown = session.shown_values().to_vec();
                let start = |caps| {
                    Solutions::start(
                        session.letter_search(),
                        session.shared_variables().clone(),
                        session.spots(),
                        &session
                            .seeds_of(session.constraints())
                            .expect("seeds")
                            .expect("fit"),
                        shown.clone(),
                        session.constraints().to_vec(),
                        caps,
                    )
                    .expect("start")
                };
                let solutions = check_count(session.letter_search(), start, &truth, &mut rng);
                check_stepper(&solutions, &truth, &mut rng);
                rows.push(format!(
                    "{} constraints: {} front / {} back pictures, {} orders",
                    session.constraints().len(),
                    truth.pictures[FRONT].len(),
                    truth.pictures[BACK].len(),
                    truth.orders.len()
                ));
            }
            println!("{name}: {}", rows.join("; "));
        }
    }

    /// An index past what JavaScript holds exactly is sent as that bound, as
    /// a tally is; under it, as it is.
    #[test]
    fn a_position_past_two_to_the_fifty_three_is_sent_as_the_bound() {
        let sent = |index: u64, n: u64| {
            serde_json::to_value(Position {
                index,
                total: Tally { n, exact: true },
            })
            .expect("serialize")
        };
        let max = ChoiceCount::MAX_SENT;
        assert_eq!(
            sent(u64::MAX, u64::MAX),
            serde_json::json!({ "index": max, "total": { "n": max, "exact": false } })
        );
        assert_eq!(sent(max + 1, max + 2)["index"], max);
        assert_eq!(
            sent(3, 12),
            serde_json::json!({ "index": 3, "total": { "n": 12, "exact": true } })
        );
    }
}
