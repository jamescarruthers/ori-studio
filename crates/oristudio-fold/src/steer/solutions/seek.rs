//! The stepper without the count: the next or the previous solution in the
//! count's own order, found by search from the order on screen
//! (`implementation-plans/layer-order-dialog.md` row E9; decision D7, "‹ ›
//! still steps").
//!
//! The stepper of [`super::Solutions`] steps through what its count lists.
//! Before the count has listed everything a step goes through (above the
//! size where the dialog starts no count, D7, or while it still runs), that
//! list is partial, and a step that waited for it would never move on the
//! largest figures. So until then a step searches for the solution the count
//! would list next instead, starting from the order on screen.
//!
//! - **By picture.** The count's order is lexicographic in the tops of the
//!   side's open spots, spot by spot, faces by number, a spot with no top
//!   ([`NO_TOP`]) last. The next picture after P is therefore the smallest
//!   above it: at the last spot x where some top above P's fits with P's
//!   tops before x, the smallest such top, then at each later spot the
//!   smallest top that still fits. "Fits" is the session's own check, a
//!   preview's ([`Check`]), with the tops as seeds: a face above each of the
//!   spot's other candidates (from the back, below them), on top of the
//!   committed constraints. A fit is an order and a can't-fit a proof, so
//!   every answer is exact; an order that fits also answers each later spot
//!   whose top it already shows, with no other check. The previous picture
//!   is the same in the reverse order. A spot that can show no top (its
//!   candidates in a cycle, never where they share one of the solver's
//!   cells) is asked as its tournaments with no top, once a 3-cycle of its
//!   candidates is seen to survive propagation. The step then shows, as a
//!   counted step does, the layer order closest to the one on screen within
//!   that picture.
//! - **By layer order (X-ray, D5).** The count's order is lexicographic by
//!   variable, the smaller face above first. Each component's next order in
//!   it comes from Flat-Folder's own search over the component's variables
//!   in ascending order, placed on the order on screen
//!   ([`treemaker_flatfold::Enumeration::lexical`] and
//!   [`treemaker_flatfold::Enumeration::after`]). The components combine as
//!   the count's views do: the one whose next order changes the latest pair
//!   takes it, and each other one's pairs after that one go to the smallest
//!   (stepping back, the largest) that its pairs before it allow.
//!
//! **What a step finds is kept** as long as the count is good: each
//! solution the stepper stood on, and, between two it stepped from one to
//! the other, that nothing lies between them. A step back to a solution
//! already seen asks one check (by picture) or none (X-ray), and an index
//! counts the solutions found ([`super::Position`]): "Solution 3" once two
//! found lie before it. Once every one has been found, from a first with
//! nothing before it to a last with nothing after, the total is exact.
//!
//! **Every check shares the step's limits.** One that runs out of them
//! leaves the step undecided. What was proved stays: each check's answer is
//! kept by the tops it asked about, and an X-ray search that stopped
//! resumes where it stopped, so the same step asked again with longer
//! limits ("Keep trying") goes on from there.
//!
//! Ori Studio original work, not a port.

use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};
use std::ops::Bound;

use treemaker_flatfold::{self as flatfold, Deduction, EnumerationStep, PairOrder};

use super::super::session::{
    ConstraintSession, Limits, Seed, SessionRefusal, Solved, Steer, internal_search,
};
use super::{
    FRONT, NO_TOP, OpenSpot, Position, Solutions, StepBy, StepDirection, Tally, get_bit,
    order_of_bit, set_bit, side_index, top_of,
};
use crate::complete;

/// What the session's check answered.
pub(crate) enum Fits {
    /// An order that fits, one value per variable.
    Fit(Vec<PairOrder>),
    /// A proof that none does.
    No,
    /// Neither, within the limits.
    Unknown,
}

/// A search that ran out of its limits first.
struct OutOfTime;

/// What a step asks: whether the committed constraints and `extra` leave an
/// order, and one that does, steered by the order on screen. The session's
/// own check (a preview's) answers it.
pub(crate) trait Check {
    fn fits(&self, extra: &[Seed], limits: &Limits) -> Result<Fits, SessionRefusal>;
}

impl Check for ConstraintSession {
    fn fits(&self, extra: &[Seed], limits: &Limits) -> Result<Fits, SessionRefusal> {
        Ok(
            match self.solve(self.constraints(), extra, Steer::Shown, limits)? {
                Solved::Fit(fit) => Fits::Fit(fit.into_values()),
                Solved::CantFit(_) => Fits::No,
                Solved::TimedOut(_) => Fits::Unknown,
            },
        )
    }
}

/// What a search for the next or previous solution found.
pub(crate) enum Sought {
    /// The order to show: the solution the count lists next that way.
    Found(Vec<PairOrder>),
    /// None lies that way: proved.
    End,
    /// The limits ran out first.
    Undecided,
}

/// A complete order as bits, one per variable, set where the larger face
/// lies above, most significant first: comparing two compares the orders as
/// X-ray steps through them.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Packed(Vec<u64>);

impl Packed {
    pub(crate) fn of(values: &[PairOrder]) -> Packed {
        let mut words = vec![0u64; values.len().div_ceil(64)];
        for (v, value) in values.iter().enumerate() {
            if *value == PairOrder::SecondAbove {
                set_bit(&mut words, v);
            }
        }
        Packed(words)
    }

    fn values(&self, n: usize) -> Vec<PairOrder> {
        (0..n).map(|v| order_of_bit(get_bit(&self.0, v))).collect()
    }
}

/// The solutions a stepper has stood on, for one way of stepping, by key
/// (a picture's tops, or a whole layer order), ascending.
#[derive(Debug, Clone)]
struct Found<K> {
    entries: BTreeMap<K, Entry>,
    /// Nothing lies before the smallest.
    first: bool,
    /// Nothing lies after the largest.
    last: bool,
}

impl<K> Default for Found<K> {
    fn default() -> Found<K> {
        Found {
            entries: BTreeMap::new(),
            first: false,
            last: false,
        }
    }
}

#[derive(Debug, Clone)]
struct Entry {
    /// The order last shown for it, where the key is not the order.
    order: Option<Packed>,
    /// Nothing lies between it and the next one up.
    next: bool,
}

/// What is known of the solution beside one, one way.
enum Known<K> {
    /// The very next that way, and the order last shown for it.
    Neighbour(K, Option<Packed>),
    /// None lies that way.
    End,
    Unknown,
}

impl<K: Ord + Clone> Found<K> {
    /// `key` is a solution; `order` the order shown for it now, if kept.
    fn note(&mut self, key: &K, order: Option<Packed>) {
        match self.entries.get_mut(key) {
            Some(entry) => {
                if order.is_some() {
                    entry.order = order;
                }
            }
            None => {
                self.entries
                    .insert(key.clone(), Entry { order, next: false });
            }
        }
    }

    fn known(&self, key: &K, direction: StepDirection) -> Known<K> {
        match direction {
            StepDirection::Next => {
                if self.entries.get(key).is_some_and(|e| e.next)
                    && let Some((k, e)) = self
                        .entries
                        .range((Bound::Excluded(key), Bound::Unbounded))
                        .next()
                {
                    return Known::Neighbour(k.clone(), e.order.clone());
                }
                if self.last && self.entries.keys().next_back() == Some(key) {
                    return Known::End;
                }
            }
            StepDirection::Previous => {
                if let Some((k, e)) = self.entries.range(..key).next_back()
                    && e.next
                {
                    return Known::Neighbour(k.clone(), e.order.clone());
                }
                if self.first && self.entries.keys().next() == Some(key) {
                    return Known::End;
                }
            }
        }
        Known::Unknown
    }

    /// `a` and `b`, both noted, are neighbours: nothing lies between.
    fn link(&mut self, a: &K, b: &K) {
        if let Some(entry) = self.entries.get_mut(a.min(b)) {
            entry.next = true;
        }
    }

    /// Nothing lies past `key` that way, so nothing noted may.
    fn end(&mut self, key: &K, direction: StepDirection) -> Result<(), SessionRefusal> {
        let extreme = match direction {
            StepDirection::Next => self.entries.keys().next_back(),
            StepDirection::Previous => self.entries.keys().next(),
        };
        if extreme != Some(key) {
            return Err(SessionRefusal::internal(
                "a solution was found past the one proved the end",
            ));
        }
        match direction {
            StepDirection::Next => self.last = true,
            StepDirection::Previous => self.first = true,
        }
        Ok(())
    }

    /// From 1, one more than the solutions found before `key`; how many are
    /// found, `key` among them; and whether that is every one.
    fn position(&self, key: &K) -> (u64, u64, bool) {
        let before = self.entries.range(..key).count() as u64;
        let noted = self.entries.contains_key(key);
        let n = self.entries.len() as u64 + u64::from(!noted);
        let every =
            noted && self.first && self.last && self.entries.values().rev().skip(1).all(|e| e.next);
        (before + 1, n, every)
    }
}

/// One component's next (or previous) order, kept beside the order it was
/// found from.
#[derive(Debug, Clone)]
struct Beside {
    /// The component's values it was found from, by its variables ascending.
    from: Vec<PairOrder>,
    /// The order after it, the same way; `None` for none.
    next: Option<Vec<PairOrder>>,
}

/// A lexical search of one component, standing on `at` (its values, by its
/// variables ascending) or stopped on its way from there.
#[derive(Debug, Clone)]
struct Placed {
    component: usize,
    at: Vec<PairOrder>,
    cursor: flatfold::Enumeration,
}

/// What the stepper found by searching (see the module docs), beside the
/// count it steps with.
#[derive(Debug, Clone, Default)]
pub(crate) struct Seek {
    /// Per side, the pictures stood on, by their tops.
    pictures: [Found<Vec<u32>>; 2],
    /// Per side, every check's answer, by the tops it asked of the open
    /// spots from the first: an order that fits them, or `None` when none
    /// does.
    asked: [HashMap<Vec<u32>, Option<Packed>>; 2],
    /// Per side and open spot, whether an order that fits can leave it with
    /// no top, once asked.
    no_top: [Vec<Option<bool>>; 2],
    /// The layer orders stood on.
    orders: Found<Packed>,
    /// Per direction (next, previous) and component, what came after its
    /// values on screen, once found.
    beside: [Vec<Option<Beside>>; 2],
    /// Per direction, the search of the component that moved last, or that
    /// ran out of time, kept to go on from.
    placed: [Option<Placed>; 2],
}

/// What a search beside one solution found.
enum Neighbour<K> {
    /// The key of the solution, and an order that shows it.
    Found(K, Vec<PairOrder>),
    End,
    Undecided,
}

/// Every seed of `base` and `extra`, or `None` when they ask a pair both
/// ways.
pub(crate) fn merged(base: &[Seed], extra: &[Seed]) -> Option<Vec<Seed>> {
    let mut wanted: HashMap<usize, PairOrder> = HashMap::with_capacity(base.len() + extra.len());
    let mut all = Vec::with_capacity(base.len() + extra.len());
    for &(v, value) in base.iter().chain(extra) {
        match wanted.insert(v, value) {
            Some(other) if other != value => return None,
            Some(_) => {}
            None => all.push((v, value)),
        }
    }
    Some(all)
}

impl Solutions {
    /// Whether the count has every solution stepping `by` goes through, so
    /// the stepper follows it: every look group of the side walked, or with
    /// X-ray every component's layer orders listed (to the end or a cap).
    pub(crate) fn counted(&self, by: StepBy) -> bool {
        match by {
            StepBy::Picture(side) => self.sides[side_index(side)].groups.iter().all(|g| g.walked),
            StepBy::LayerOrder => self.components.iter().all(|c| c.orders_finished),
        }
    }

    /// The tops of side `s`'s open spots for `values`, spot by spot: what
    /// the count's order compares pictures by.
    pub(crate) fn picture_key(&self, s: usize, values: &[PairOrder]) -> Vec<u32> {
        let mut wins = Vec::new();
        self.sides[s]
            .spots
            .iter()
            .map(|spot| {
                top_of(
                    spot,
                    s,
                    |pair| values[pair.variable as usize] == PairOrder::FirstAbove,
                    &mut wins,
                )
            })
            .collect()
    }

    /// The solution after (before) `values` in the count's order, by search
    /// (see the module docs), and what it proved kept.
    pub(crate) fn seek(
        &mut self,
        search: &flatfold::CompletionSession,
        check: &dyn Check,
        by: StepBy,
        values: &[PairOrder],
        direction: StepDirection,
        limits: &Limits,
    ) -> Result<Sought, SessionRefusal> {
        if values.len() != self.variables.len() {
            return Err(SessionRefusal::internal("an order of the wrong length"));
        }
        match by {
            StepBy::Picture(side) => {
                self.seek_picture(search, check, side_index(side), values, direction, limits)
            }
            StepBy::LayerOrder => self.seek_order(search, values, direction, limits),
        }
    }

    /// Where `values` lies among the solutions the stepper found: an index
    /// among them, and the total at least as many as it or the count found,
    /// exact once it found every one.
    pub(crate) fn seek_position(&self, by: StepBy, values: &[PairOrder]) -> Position {
        let count = self.count();
        let ((index, n, every), counted) = match by {
            StepBy::Picture(side) => {
                let s = side_index(side);
                let key = self.picture_key(s, values);
                let tally = if s == FRONT { count.front } else { count.back };
                (self.seek.pictures[s].position(&key), tally)
            }
            StepBy::LayerOrder => (self.seek.orders.position(&Packed::of(values)), count.orders),
        };
        let total = if every {
            Tally { n, exact: true }
        } else {
            Tally {
                n: n.max(counted.n),
                exact: false,
            }
        };
        Position { index, total }
    }

    fn seek_picture(
        &mut self,
        search: &flatfold::CompletionSession,
        check: &dyn Check,
        s: usize,
        values: &[PairOrder],
        direction: StepDirection,
        limits: &Limits,
    ) -> Result<Sought, SessionRefusal> {
        let n = values.len();
        let key = self.picture_key(s, values);
        self.seek.pictures[s].note(&key, Some(Packed::of(values)));
        let (target, standby) = match self.seek.pictures[s].known(&key, direction) {
            Known::Neighbour(target, order) => (target, order.map(|o| o.values(n))),
            Known::End => return Ok(Sought::End),
            Known::Unknown => {
                let Solutions {
                    sides, seek, seeds, ..
                } = &mut *self;
                let side = &sides[s];
                if seek.no_top[s].len() != side.spots.len() {
                    seek.no_top[s] = vec![None; side.spots.len()];
                }
                let mut tops = Tops {
                    s,
                    spots: &side.spots,
                    search,
                    seeds,
                    check,
                    limits,
                    asked: &mut seek.asked[s],
                    no_top: &mut seek.no_top[s],
                    n,
                };
                match tops.neighbour(&key, direction)? {
                    Neighbour::Found(target, order) => {
                        let found = &mut self.seek.pictures[s];
                        found.note(&target, Some(Packed::of(&order)));
                        found.link(&key, &target);
                        (target, Some(order))
                    }
                    Neighbour::End => {
                        self.seek.pictures[s].end(&key, direction)?;
                        return Ok(Sought::End);
                    }
                    Neighbour::Undecided => return Ok(Sought::Undecided),
                }
            }
        };
        // Within that picture, the layer order closest to the one on screen,
        // as a counted step finds it; the order found stands in for it.
        let mut seeds = Vec::new();
        let side = &self.sides[s];
        for (spot, &top) in side.spots.iter().zip(&target) {
            top_seeds(spot, s, top, &mut seeds);
        }
        let shown = match check.fits(&seeds, limits)? {
            Fits::Fit(order) if self.picture_key(s, &order) == target => order,
            _ => standby
                .ok_or_else(|| SessionRefusal::internal("a picture found with no order kept"))?,
        };
        self.seek.pictures[s].note(&target, Some(Packed::of(&shown)));
        Ok(Sought::Found(shown))
    }

    fn seek_order(
        &mut self,
        search: &flatfold::CompletionSession,
        values: &[PairOrder],
        direction: StepDirection,
        limits: &Limits,
    ) -> Result<Sought, SessionRefusal> {
        let n = values.len();
        let key = Packed::of(values);
        self.seek.orders.note(&key, None);
        match self.seek.orders.known(&key, direction) {
            Known::Neighbour(target, _) => return Ok(Sought::Found(target.values(n))),
            Known::End => return Ok(Sought::End),
            Known::Unknown => {}
        }
        match self.order_neighbour(search, values, direction, limits)? {
            Neighbour::Found(target, order) => {
                self.seek.orders.note(&target, None);
                self.seek.orders.link(&key, &target);
                Ok(Sought::Found(order))
            }
            Neighbour::End => {
                self.seek.orders.end(&key, direction)?;
                Ok(Sought::End)
            }
            Neighbour::Undecided => Ok(Sought::Undecided),
        }
    }

    /// The layer order after (before) `values`, by variable: the product
    /// rule over each component's own next order (see the module docs).
    fn order_neighbour(
        &mut self,
        search: &flatfold::CompletionSession,
        values: &[PairOrder],
        direction: StepDirection,
        limits: &Limits,
    ) -> Result<Neighbour<Packed>, SessionRefusal> {
        let way = usize::from(direction == StepDirection::Previous);
        let mut left = limits.max_nodes;
        for beside in &mut self.seek.beside {
            beside.resize(self.components.len(), None);
        }
        // The components by their last variable, latest first: once one
        // ends before the latest change found, none after it can change a
        // later pair.
        let mut latest: Vec<usize> = (0..self.components.len())
            .filter(|&k| !self.components[k].variables.is_empty())
            .collect();
        latest.sort_by_key(|&k| Reverse(self.components[k].variables.last().copied()));
        let mut best: Option<(u32, usize, Vec<PairOrder>)> = None;
        for k in latest {
            let last = self.components[k].variables.last().copied().unwrap_or(0);
            if best.as_ref().is_some_and(|b| last < b.0) {
                break;
            }
            let Ok(next) = self.component_beside(search, k, values, way, &mut left, limits)? else {
                return Ok(Neighbour::Undecided);
            };
            let Some(own) = next else {
                continue;
            };
            let variables = &self.components[k].variables;
            let Some(at) = variables
                .iter()
                .zip(&own)
                .find(|(v, o)| values[**v as usize] != **o)
                .map(|(v, _)| *v)
            else {
                return Err(SessionRefusal::internal(
                    "a component's next order is its order",
                ));
            };
            if best.as_ref().is_none_or(|b| at > b.0) {
                best = Some((at, k, own));
            }
        }
        let Some((at, moved, own)) = best else {
            return Ok(Neighbour::End);
        };
        let mut order = values.to_vec();
        for (&v, &o) in self.components[moved].variables.iter().zip(&own) {
            order[v as usize] = o;
        }
        let mut changed = vec![moved];
        for h in 0..self.components.len() {
            let tail = self.components[h].variables.last().is_some_and(|&l| l > at);
            if h == moved || !tail {
                continue;
            }
            let Ok(own) = self.extreme_after(search, h, &order, at, way, &mut left, limits)? else {
                return Ok(Neighbour::Undecided);
            };
            let variables = &self.components[h].variables;
            if variables
                .iter()
                .zip(&own)
                .any(|(v, o)| order[*v as usize] != *o)
            {
                for (&v, &o) in variables.iter().zip(&own) {
                    order[v as usize] = o;
                }
                changed.push(h);
            }
        }
        // What was found beside the components that changed is beside
        // their old orders. The moved one's search, if still kept, stands on
        // its new order, and goes on from there.
        for k in changed {
            for beside in &mut self.seek.beside {
                beside[k] = None;
            }
            for (w, placed) in self.seek.placed.iter_mut().enumerate() {
                let stands = w == way && placed.as_ref().is_some_and(|p| p.at == own);
                if placed.as_ref().is_some_and(|p| p.component == k) && !(k == moved && stands) {
                    *placed = None;
                }
            }
        }
        Ok(Neighbour::Found(Packed::of(&order), order))
    }

    /// Component `k`'s order after (before, `way` 1) its values in `values`,
    /// by its variables ascending: `None` when it has none that way; an
    /// error value when the limits ran out first.
    fn component_beside(
        &mut self,
        search: &flatfold::CompletionSession,
        k: usize,
        values: &[PairOrder],
        way: usize,
        left: &mut Option<u64>,
        limits: &Limits,
    ) -> Result<Result<Option<Vec<PairOrder>>, OutOfTime>, SessionRefusal> {
        let from: Vec<PairOrder> = self.components[k]
            .variables
            .iter()
            .map(|&v| values[v as usize])
            .collect();
        if let Some(beside) = &self.seek.beside[way][k]
            && beside.from == from
        {
            return Ok(Ok(beside.next.clone()));
        }
        let placed = &mut self.seek.placed[way];
        if !placed
            .as_ref()
            .is_some_and(|p| p.component == k && p.at == from)
        {
            let cursor = self
                .base
                .clone()
                .lexical(&[k], values, way == 1)
                .and_then(|cursor| cursor.after(search, values))
                .map_err(internal_search)?
                .ok_or_else(|| {
                    SessionRefusal::internal("the order on screen is none of its component's")
                })?;
            *placed = Some(Placed {
                component: k,
                at: from.clone(),
                cursor,
            });
        }
        let Some(placed) = placed.as_mut() else {
            return Err(SessionRefusal::internal("a search placed nowhere"));
        };
        let budget = complete::search_budget(*left, limits.deadline);
        let before = placed.cursor.nodes();
        let step = placed
            .cursor
            .next(search, budget)
            .map_err(internal_search)?;
        let used = placed.cursor.nodes() - before;
        if let Some(left) = left.as_mut() {
            *left = left.saturating_sub(used);
        }
        let next = match step {
            EnumerationStep::Order => {
                let own = placed
                    .cursor
                    .component_order(k)
                    .ok_or_else(|| SessionRefusal::internal("an order step with no order"))?;
                // It stands on what it just found.
                placed.at = own.clone();
                Some(own)
            }
            EnumerationStep::Exhausted => None,
            // Kept, to go on from here.
            EnumerationStep::Stopped(_) => return Ok(Err(OutOfTime)),
            EnumerationStep::Unsatisfied(_) => {
                return Err(SessionRefusal::internal(
                    "a component placed on an order has none",
                ));
            }
        };
        if next.is_none() {
            self.seek.placed[way] = None;
        }
        self.seek.beside[way][k] = Some(Beside {
            from,
            next: next.clone(),
        });
        Ok(Ok(next))
    }

    /// Component `h`'s smallest order (largest, `way` 1) that keeps its
    /// values in `order` on its variables before `at`, by its variables
    /// ascending.
    #[allow(clippy::too_many_arguments)]
    fn extreme_after(
        &self,
        search: &flatfold::CompletionSession,
        h: usize,
        order: &[PairOrder],
        at: u32,
        way: usize,
        left: &mut Option<u64>,
        limits: &Limits,
    ) -> Result<Result<Vec<PairOrder>, OutOfTime>, SessionRefusal> {
        let variables = &self.components[h].variables;
        let kept: Vec<Seed> = variables
            .iter()
            .filter(|&&v| v < at)
            .map(|&v| (v as usize, order[v as usize]))
            .collect();
        let seeds = merged(&self.seeds, &kept)
            .ok_or_else(|| SessionRefusal::internal("the order on screen opposes a constraint"))?;
        let deadline = complete::search_budget(None, limits.deadline).deadline;
        let deduced = match search.deduce(&seeds, deadline).map_err(internal_search)? {
            Deduction::Deduced(deduced) => deduced,
            Deduction::Undecided { .. } => return Ok(Err(OutOfTime)),
            other => {
                return Err(SessionRefusal::internal(format!(
                    "the order on screen does not deduce: {other:?}"
                )));
            }
        };
        let cursor = search.enumerate(&deduced).map_err(internal_search)?;
        let vary: Vec<usize> = cursor
            .components()
            .iter()
            .enumerate()
            .filter(|(_, part)| {
                part.first()
                    .is_some_and(|&v| variables.binary_search(&(v as u32)).is_ok())
            })
            .map(|(i, _)| i)
            .collect();
        let mut cursor = cursor
            .lexical(&vary, order, way == 1)
            .map_err(internal_search)?;
        let budget = complete::search_budget(*left, limits.deadline);
        let before = cursor.nodes();
        let step = cursor.next(search, budget).map_err(internal_search)?;
        let used = cursor.nodes() - before;
        if let Some(left) = left.as_mut() {
            *left = left.saturating_sub(used);
        }
        match step {
            EnumerationStep::Order => {
                let whole = cursor
                    .order()
                    .ok_or_else(|| SessionRefusal::internal("an order step with no order"))?;
                Ok(Ok(variables.iter().map(|&v| whole[v as usize]).collect()))
            }
            EnumerationStep::Stopped(_) => Ok(Err(OutOfTime)),
            EnumerationStep::Exhausted | EnumerationStep::Unsatisfied(_) => Err(
                SessionRefusal::internal("the order on screen's own part has no order"),
            ),
        }
    }
}

/// The seeds that make `top` a spot's top from side `s`: it above (from the
/// back, below) each of the spot's other candidates. None for [`NO_TOP`] or
/// a face that is no candidate.
fn top_seeds(spot: &OpenSpot, s: usize, top: u32, out: &mut Vec<Seed>) -> bool {
    let Some(t) = spot.candidates.iter().position(|&c| c == top) else {
        return false;
    };
    let t = t as u32;
    for pair in spot.pairs.iter().filter(|p| p.lo == t || p.hi == t) {
        // From the front the top lies above the rest; from the back, below.
        let lo_above = (pair.lo == t) == (s == FRONT);
        out.push((pair.variable as usize, order_of_bit(!lo_above)));
    }
    true
}

/// The seed that puts candidate `x` of a spot above candidate `y`.
fn above(spot: &OpenSpot, x: u32, y: u32) -> Option<Seed> {
    spot.pairs
        .iter()
        .find(|p| (p.lo, p.hi) == (x, y) || (p.lo, p.hi) == (y, x))
        .map(|p| (p.variable as usize, order_of_bit(p.lo != x)))
}

/// Most pairs a spot's candidates may have for its tournaments with no top
/// to be listed: six candidates.
const TOURNAMENT_PAIRS: usize = 15;
/// Most combinations of them asked at once, across spots with no top.
const TOURNAMENT_COMBINATIONS: usize = 4096;

/// One side's open spots, searched by their tops (see the module docs).
struct Tops<'a> {
    s: usize,
    spots: &'a [OpenSpot],
    search: &'a flatfold::CompletionSession,
    seeds: &'a [Seed],
    check: &'a dyn Check,
    limits: &'a Limits,
    asked: &'a mut HashMap<Vec<u32>, Option<Packed>>,
    no_top: &'a mut Vec<Option<bool>>,
    /// Variables.
    n: usize,
}

impl Tops<'_> {
    /// The picture after (before) `key`, and an order that shows it.
    fn neighbour(
        &mut self,
        key: &[u32],
        direction: StepDirection,
    ) -> Result<Neighbour<Vec<u32>>, SessionRefusal> {
        let next = direction == StepDirection::Next;
        let mut prefix: Vec<u32> = Vec::with_capacity(key.len());
        for x in (0..key.len()).rev() {
            prefix.clear();
            prefix.extend_from_slice(&key[..x]);
            let mut options = self.candidates(x);
            if next {
                options.retain(|&c| c > key[x]);
                // No top comes after every face.
                if key[x] != NO_TOP {
                    options.push(NO_TOP);
                }
            } else {
                options.retain(|&c| c < key[x]);
                options.reverse();
            }
            for top in options {
                if top == NO_TOP {
                    match self.can_show_no_top(x)? {
                        Ok(true) => {}
                        Ok(false) => continue,
                        Err(OutOfTime) => return Ok(Neighbour::Undecided),
                    }
                }
                prefix.push(top);
                match self.fits(&prefix)? {
                    Fits::Fit(order) => return self.complete(prefix, order, next),
                    Fits::No => {
                        prefix.pop();
                    }
                    Fits::Unknown => return Ok(Neighbour::Undecided),
                }
            }
        }
        Ok(Neighbour::End)
    }

    /// `prefix`, which `order` shows, completed spot by spot with the
    /// smallest top that fits (the largest, stepping back).
    fn complete(
        &mut self,
        mut prefix: Vec<u32>,
        mut order: Vec<PairOrder>,
        next: bool,
    ) -> Result<Neighbour<Vec<u32>>, SessionRefusal> {
        let mut wins = Vec::new();
        for y in prefix.len()..self.spots.len() {
            let shows = top_of(
                &self.spots[y],
                self.s,
                |pair| order[pair.variable as usize] == PairOrder::FirstAbove,
                &mut wins,
            );
            let mut options = self.candidates(y);
            if next {
                options.push(NO_TOP);
            } else {
                options.reverse();
                options.insert(0, NO_TOP);
            }
            let mut chosen = None;
            for top in options {
                if top == shows {
                    chosen = Some(top);
                    break;
                }
                if top == NO_TOP {
                    match self.can_show_no_top(y)? {
                        Ok(false) => continue,
                        Ok(true) => {}
                        Err(OutOfTime) => return Ok(Neighbour::Undecided),
                    }
                }
                prefix.push(top);
                let fits = self.fits(&prefix)?;
                prefix.pop();
                match fits {
                    Fits::Fit(other) => {
                        order = other;
                        chosen = Some(top);
                        break;
                    }
                    Fits::No => {}
                    Fits::Unknown => return Ok(Neighbour::Undecided),
                }
            }
            let Some(top) = chosen else {
                return Err(SessionRefusal::internal(
                    "an order shows a top none of its spot's",
                ));
            };
            prefix.push(top);
        }
        Ok(Neighbour::Found(prefix, order))
    }

    /// Spot `i`'s candidates by face.
    fn candidates(&self, i: usize) -> Vec<u32> {
        let mut faces = self.spots[i].candidates.clone();
        faces.sort_unstable();
        faces
    }

    /// Whether the tops `prefix`, of the open spots from the first, fit
    /// with the committed constraints, and an order that shows them.
    /// Remembered.
    fn fits(&mut self, prefix: &[u32]) -> Result<Fits, SessionRefusal> {
        if let Some(known) = self.asked.get(prefix) {
            return Ok(match known {
                Some(order) => Fits::Fit(order.values(self.n)),
                None => Fits::No,
            });
        }
        let mut seeds = Vec::new();
        let mut none = Vec::new();
        for (i, &top) in prefix.iter().enumerate() {
            if top == NO_TOP {
                none.push(i);
            } else if !top_seeds(&self.spots[i], self.s, top, &mut seeds) {
                return Err(SessionRefusal::internal("a top that is no candidate"));
            }
        }
        let answer = if none.is_empty() {
            self.check.fits(&seeds, self.limits)?
        } else {
            self.fits_with_no_top(&seeds, &none)?
        };
        match &answer {
            Fits::Fit(order) => {
                let mut wins = Vec::new();
                let shows = prefix.iter().enumerate().all(|(i, &top)| {
                    top_of(
                        &self.spots[i],
                        self.s,
                        |pair| order[pair.variable as usize] == PairOrder::FirstAbove,
                        &mut wins,
                    ) == top
                });
                if !shows {
                    return Err(SessionRefusal::internal(
                        "a check's order does not show the tops it was asked",
                    ));
                }
                self.asked.insert(prefix.to_vec(), Some(Packed::of(order)));
            }
            Fits::No => {
                self.asked.insert(prefix.to_vec(), None);
            }
            Fits::Unknown => {}
        }
        Ok(answer)
    }

    /// [`Self::fits`] where the spots `none` show no top: each combination
    /// of their tournaments with no top, asked in turn. Too many to ask is
    /// no answer.
    fn fits_with_no_top(&self, seeds: &[Seed], none: &[usize]) -> Result<Fits, SessionRefusal> {
        let Some(lists) = none
            .iter()
            .map(|&i| self.tournaments(i))
            .collect::<Option<Vec<_>>>()
        else {
            return Ok(Fits::Unknown);
        };
        let combinations = lists
            .iter()
            .try_fold(1usize, |n, list| n.checked_mul(list.len()));
        if combinations.is_none_or(|n| n > TOURNAMENT_COMBINATIONS) {
            return Ok(Fits::Unknown);
        }
        let mut digits = vec![0usize; lists.len()];
        let mut unknown = false;
        'combinations: loop {
            let mut asked = seeds.to_vec();
            for (list, &d) in lists.iter().zip(&digits) {
                asked.extend_from_slice(&list[d]);
            }
            match self.check.fits(&asked, self.limits)? {
                Fits::Fit(order) => return Ok(Fits::Fit(order)),
                Fits::No => {}
                Fits::Unknown => unknown = true,
            }
            for i in (0..digits.len()).rev() {
                digits[i] += 1;
                if digits[i] < lists[i].len() {
                    continue 'combinations;
                }
                digits[i] = 0;
            }
            break;
        }
        Ok(if unknown { Fits::Unknown } else { Fits::No })
    }

    /// Spot `i`'s tournaments that leave it no top from this side, each as
    /// seeds on its candidates' pairs; `None` past [`TOURNAMENT_PAIRS`].
    fn tournaments(&self, i: usize) -> Option<Vec<Vec<Seed>>> {
        let spot = &self.spots[i];
        let m = spot.pairs.len();
        if m > TOURNAMENT_PAIRS {
            return None;
        }
        let mut wins = Vec::new();
        let mut list = Vec::new();
        for mask in 0u32..1 << m {
            let bit = |variable: u32| {
                spot.pairs
                    .iter()
                    .position(|p| p.variable == variable)
                    .is_some_and(|b| mask & (1 << b) != 0)
            };
            if top_of(spot, self.s, |pair| bit(pair.variable), &mut wins) == NO_TOP {
                list.push(
                    spot.pairs
                        .iter()
                        .enumerate()
                        .map(|(b, p)| (p.variable as usize, order_of_bit(mask & (1 << b) == 0)))
                        .collect(),
                );
            }
        }
        Some(list)
    }

    /// Whether an order that fits can leave spot `i` with no top: only if
    /// some 3-cycle of its candidates survives propagation with the
    /// committed constraints, since a tournament with no top has one, and
    /// candidates that share a cell never do. Remembered.
    fn can_show_no_top(&mut self, i: usize) -> Result<Result<bool, OutOfTime>, SessionRefusal> {
        if let Some(known) = self.no_top[i] {
            return Ok(Ok(known));
        }
        let spot = &self.spots[i];
        let k = spot.candidates.len() as u32;
        let deadline = complete::search_budget(None, self.limits.deadline).deadline;
        let mut can = false;
        'cycles: for a in 0..k {
            for b in a + 1..k {
                for c in b + 1..k {
                    for [x, y, z] in [[a, b, c], [a, c, b]] {
                        let cycle: Option<Vec<Seed>> =
                            [above(spot, x, y), above(spot, y, z), above(spot, z, x)]
                                .into_iter()
                                .collect();
                        let Some(cycle) = cycle else {
                            return Err(SessionRefusal::internal("a spot misses a pair"));
                        };
                        let Some(seeds) = merged(self.seeds, &cycle) else {
                            continue;
                        };
                        match self
                            .search
                            .deduce(&seeds, deadline)
                            .map_err(internal_search)?
                        {
                            Deduction::Deduced(_) => {
                                can = true;
                                break 'cycles;
                            }
                            Deduction::Undecided { .. } => return Ok(Err(OutOfTime)),
                            Deduction::Forced { .. } | Deduction::Conflict(_) => {}
                        }
                    }
                }
            }
        }
        self.no_top[i] = Some(can);
        Ok(Ok(can))
    }
}
