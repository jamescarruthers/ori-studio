//! A dense table over pairs of a view's face positions, for the loops that
//! visit every pair of every cell (Σ ply² lookups: tens of millions on a
//! 300-face state with stacks 200 deep, where ordered-map lookups cost
//! hundreds of milliseconds).

use crate::order::LayerOrder;
use crate::view::FoldedView;

pub(crate) struct PairTable<T> {
    n: usize,
    entries: Vec<T>,
}

impl<T: Copy + Default> PairTable<T> {
    pub(crate) fn new(n: usize) -> PairTable<T> {
        PairTable {
            n,
            entries: vec![T::default(); n * n],
        }
    }

    pub(crate) fn get(&self, i: usize, j: usize) -> T {
        self.entries[i * self.n + j]
    }

    pub(crate) fn set(&mut self, i: usize, j: usize, value: T) {
        self.entries[i * self.n + j] = value;
    }
}

impl PairTable<i8> {
    /// The order on the view's faces: `1` where row lies above column, `-1`
    /// below, `0` when absent or undetermined.
    pub(crate) fn of_order(view: &FoldedView, order: &LayerOrder) -> PairTable<i8> {
        let mut table = PairTable::new(view.faces().len());
        for (pair, lo_above) in order.pairs() {
            let (Some(lo), Some(hi), Some(lo_above)) =
                (view.index_of(pair.lo()), view.index_of(pair.hi()), lo_above)
            else {
                continue;
            };
            let v = if lo_above { 1 } else { -1 };
            table.set(lo, hi, v);
            table.set(hi, lo, -v);
        }
        table
    }
}
