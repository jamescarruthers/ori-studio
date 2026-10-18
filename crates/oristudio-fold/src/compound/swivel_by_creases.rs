//! A flat swivel with independently located hinges on its two layers.
//!
//! At a point V on a folded edge h, the first layer creases toward A (s),
//! and the other layer's stationary body ends at its crease toward B (b).
//! The old tip of h opens. The remaining crease c on the second layer is
//! determined by material continuity: R_s R_h R_c = R_b, hence, in signed
//! angles measured from h's tip ray, c = b - s. The three moving regions
//! therefore use exactly the existing folded-swivel compiler's motions:
//! R_s, R_s R_h and R_b. All scoring, attachment, order and validity gates
//! remain shared. The edge-to-target swivel is the special case b = 2s.
use super::CompoundRefused;
use super::folded_swivel::{FoldCompiled, FoldFan, compile, ray_run};
use super::swivel::{
    SwivelCrease, SwivelFold, SwivelKind, SwivelRay, SwivelRegion, SwivelWedge, dot, edge_run,
    internal, sub,
};
use super::vertex::{VertexChoices, VertexOutcome, angle_between, rotate, unit};
use crate::fold::Within;
use crate::numerics::{MIN_FEATURE, TOL};
use crate::{
    ActionKind, CompletionLimits, CreaseKind, Direction, FaceId, FoldActionGeometry, FoldAnalysis,
    FoldRefusal, Letter, Refused, Side, Snap, State,
};
use oristudio_geometry::{Line, convex};
use serde::{Deserialize, Serialize};
type Point = [f64; 2];

/// Three original-sheet anchors: an exact point on a folded edge, a point
/// along the first layer's crease, and one along the other layer's hinge.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SwivelByCreases {
    pub fold: Point,
    pub first: Point,
    pub second: Point,
    pub direction: Direction,
    pub kind: SwivelKind,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SwivelCreasesAnalysis {
    pub vertex: Point,
    pub creases: Vec<SwivelCrease>,
    pub layers: Vec<FaceId>,
    pub regions: Vec<SwivelRegion>,
    pub fold: SwivelFold,
}

/// A folded run may be subdivided by flat precreases at the meeting point.
/// Resolve that same material run, never a different fold through the vertex.
fn fold_support(state: &State, point: Point) -> Option<(usize, Point)> {
    let mut found: Option<(usize, Point, Line)> = None;
    for (k, crease) in state.creases().iter().enumerate() {
        if !matches!(crease.kind, CreaseKind::Folded(_)) {
            continue;
        }
        let [a, b] = crease.vertices.map(|v| state.vertices()[v.0 as usize]);
        let line = Line::from_points(a, b)?;
        let d = sub(b, a);
        let len = dot(d, d).sqrt();
        let along = dot(sub(point, a), d) / len;
        if line.distance_to_point(point) > TOL || along < -TOL || along > len + TOL {
            continue;
        }
        if let Some((_, _, prior)) = found {
            if prior.distance_to_point(a) > TOL || prior.distance_to_point(b) > TOL {
                return None;
            }
        } else {
            found = Some((k, [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0], line));
        }
    }
    found.map(|(k, p, _)| (k, p))
}

impl SwivelByCreases {
    /// Locate the meeting point from two model-frame lines. Neither line
    /// needs to exist as a crease. Only their common supporting folded edge
    /// must exist; ambiguous stacked edges are refused, never silently picked.
    pub fn from_lines(
        state: &State,
        first: Line,
        second: Line,
        direction: Direction,
        kind: SwivelKind,
    ) -> Result<Self, Refused> {
        let refused = || Refused::from(FoldRefusal::SwivelLineMeeting);
        let v = first.intersect(&second).ok_or_else(refused)?;
        let landmarks = state.landmarks(&[]);
        let candidates = landmarks.segments.iter().filter_map(|edge| {
            if edge.kind != crate::SegmentKind::Bend {
                return None;
            }
            let [a, b] = edge.at;
            let d = sub(b, a);
            let len2 = dot(d, d);
            let len = len2.sqrt();
            if len < MIN_FEATURE {
                return None;
            }
            let t = dot(sub(v, a), d) / len2;
            let q = [a[0] + t * d[0], a[1] + t * d[1]];
            if sub(v, q)[0].hypot(sub(v, q)[1]) > TOL
                || !(t * len > MIN_FEATURE && (1.0 - t) * len > MIN_FEATURE
                    || (t * len).abs() <= TOL
                    || ((1.0 - t) * len).abs() <= TOL)
                || !edge
                    .visible
                    .iter()
                    .any(|[lo, hi]| t >= *lo - TOL && t <= *hi + TOL)
            {
                return None;
            }
            Some(edge.sheet.at(t))
        });
        let mut fold: Option<Point> = None;
        for candidate in candidates {
            if let Some(p) = fold {
                if sub(candidate, p)[0].hypot(sub(candidate, p)[1]) > TOL {
                    return Err(refused());
                }
            } else {
                fold = Some(candidate);
            }
        }
        let fold = fold.ok_or_else(refused)?;
        let (k, support) = fold_support(state, fold).ok_or_else(refused)?;
        let face = *state.topology().crease_faces[k]
            .first()
            .ok_or_else(refused)?;
        let run = edge_run(state, support)?;
        let edge = Line::from_points(run.ends[0], run.ends[1]).ok_or_else(refused)?;
        let center = convex::centroid(&state.geometry().images[face]).ok_or_else(refused)?;
        let side = Side::of_point(&edge, center).ok_or_else(refused)?;
        let anchor = |line: Line| -> Result<Point, Refused> {
            let mut u = line.direction();
            if Side::of_point(&edge, [v[0] + u[0], v[1] + u[1]]) != Some(side) {
                u = [-u[0], -u[1]];
            }
            let p = [
                v[0] + u[0] * MIN_FEATURE * 1.25,
                v[1] + u[1] * MIN_FEATURE * 1.25,
            ];
            state
                .geometry()
                .images
                .iter()
                .enumerate()
                .find_map(|(f, ring)| {
                    convex::contains_point(ring, p, -TOL)
                        .then(|| state.geometry().isometries[f].inverse().apply(p))
                })
                .ok_or_else(refused)
        };
        Ok(Self {
            fold,
            first: anchor(first)?,
            second: anchor(second)?,
            direction,
            kind,
        })
    }

    fn geometry(&self, state: &State) -> Result<FoldFan, Refused> {
        let (k, support) = fold_support(state, self.fold)
            .ok_or_else(|| Refused::from(FoldRefusal::SwivelNotAFold { point: self.fold }))?;
        let faces = match state.topology().crease_faces[k][..] {
            [a, b] => [a, b],
            _ => return Err(internal("a folded edge needs two faces")),
        };
        let point = |p| {
            state
                .resolve_point(p)
                .ok_or_else(|| Refused::from(FoldRefusal::WitnessNotInFace { point: p }))
        };
        let v = point(self.fold)?;
        let first = point(self.first)?;
        let second_point = point(self.second)?;
        let run = edge_run(state, support)?;
        let fold_line = Line::from_points(run.ends[0], run.ends[1])
            .ok_or_else(|| internal("a folded edge has no line"))?;
        let wide = || {
            Refused::from(FoldRefusal::SwivelFoldWide {
                faces: faces.map(|f| state.faces()[f].id).to_vec(),
            })
        };
        let swivel = unit(sub(first, v)).ok_or_else(wide)?;
        let second = unit(sub(second_point, v)).ok_or_else(wide)?;
        if sub(first, v)[0].hypot(sub(first, v)[1]) < MIN_FEATURE
            || sub(second_point, v)[0].hypot(sub(second_point, v)[1]) < MIN_FEATURE
            || run
                .ends
                .iter()
                .any(|p| sub(*p, v)[0].hypot(sub(*p, v)[1]) < MIN_FEATURE)
        {
            return Err(wide());
        }
        // Both crease rays must enter the physical half-plane occupied by
        // the folded layers. No guessed extension through absent paper.
        let paper = convex::centroid(&state.geometry().images[faces[0]]).ok_or_else(wide)?;
        let sign = Side::of_point(&fold_line, paper).ok_or_else(wide)?;
        if [swivel, second]
            .iter()
            .any(|u| Side::of_point(&fold_line, [v[0] + u[0], v[1] + u[1]]) != Some(sign))
        {
            return Err(wide());
        }
        let h = fold_line.direction();
        for opens in [h, [-h[0], -h[1]]] {
            let a = angle_between(opens, swivel);
            let b = angle_between(opens, second);
            if a * b <= 0.0
                || a.abs() <= 1e-9
                || b.abs() <= a.abs() + 1e-9
                || b.abs() >= std::f64::consts::PI - 1e-9
            {
                continue;
            }
            let counter = rotate(opens, b - a);
            return Ok(FoldFan {
                vertex: v,
                fold_line,
                fold_run: run.ends,
                run: run.creases,
                faces,
                opens,
                stays: [-opens[0], -opens[1]],
                swivel,
                counter,
                second,
            });
        }
        Err(wide())
    }

    fn reading(&self, state: &State, fan: &FoldFan) -> Result<FoldCompiled, Refused> {
        let first = state
            .resolve_point(self.first)
            .ok_or_else(|| internal("missing first reference"))?;
        let second = state
            .resolve_point(self.second)
            .ok_or_else(|| internal("missing second reference"))?;
        let direction = state.view().model_direction(self.direction);
        let mut failure = None;
        let mut compile_failure = None;
        for layer in fan.faces {
            let other = if layer == fan.faces[0] {
                fan.faces[1]
            } else {
                fan.faces[0]
            };
            // The references choose the physical layers: each must be
            // reached by its ray. A shorter covering flap cannot take a
            // crease intended for paper extending underneath it.
            let reading = (|| {
                for (layer, u, p) in [(layer, fan.swivel, first), (other, fan.second, second)] {
                    let run = ray_run(state, layer, fan.vertex, u)?;
                    if dot(sub(p, fan.vertex), u) > dot(sub(run.end, fan.vertex), u) + TOL {
                        return Err(Refused::from(FoldRefusal::FanRayBlocked {
                            faces: vec![state.faces()[layer].id],
                        }));
                    }
                }
                let result = compile(state, fan, layer, direction, self.kind);
                if let Err(e) = &result {
                    compile_failure.get_or_insert(e.clone());
                }
                result
            })();
            match reading {
                Ok(result) => return Ok(result),
                Err(e) => {
                    failure.get_or_insert(e);
                }
            }
        }
        Err(compile_failure
            .or(failure)
            .unwrap_or_else(|| internal("a folded edge has no reading")))
    }
}

impl State {
    pub fn analyse_swivel_by_creases(
        &self,
        op: &SwivelByCreases,
    ) -> Result<SwivelCreasesAnalysis, Refused> {
        let fan = op.geometry(self)?;
        let reading = op.reading(self, &fan)?;
        let given = if op.direction == Direction::Valley {
            Letter::Valley
        } else {
            Letter::Mountain
        };
        let opposite = crate::pattern::opposite(given);
        let inside = op.kind == SwivelKind::Inside;
        let creases = [
            (SwivelRay::Meet, fan.swivel, given, false),
            (
                SwivelRay::Meet,
                fan.counter,
                if inside { given } else { opposite },
                !inside,
            ),
            (
                SwivelRay::Hinge,
                fan.second,
                if inside { opposite } else { given },
                inside,
            ),
        ]
        .into_iter()
        .zip(reading.ends)
        .map(|((ray, direction, letter, ridge), to)| SwivelCrease {
            ray,
            direction,
            from: fan.vertex,
            to,
            letter,
            ridge,
        })
        .collect();
        let end = fan
            .fold_run
            .into_iter()
            .max_by(|a, b| {
                dot(sub(*a, fan.vertex), fan.opens).total_cmp(&dot(sub(*b, fan.vertex), fan.opens))
            })
            .ok_or_else(|| internal("no fold end"))?;
        Ok(SwivelCreasesAnalysis {
            vertex: fan.vertex,
            creases,
            layers: vec![
                self.faces()[reading.edge_layer].id,
                self.faces()[reading.other_layer].id,
            ],
            regions: super::swivel_on_edge::on_fold_regions(self, &reading),
            fold: SwivelFold {
                edge: fan.fold_run,
                opens: [fan.vertex, end],
                faces: fan.ids(self),
            },
        })
    }

    pub fn swivel_by_creases(
        &self,
        op: &SwivelByCreases,
        choices: &VertexChoices,
    ) -> Result<VertexOutcome, CompoundRefused> {
        self.swivel_by_creases_within(op, choices, &CompletionLimits::default())
    }

    pub fn swivel_by_creases_within(
        &self,
        op: &SwivelByCreases,
        choices: &VertexChoices,
        limits: &CompletionLimits,
    ) -> Result<VertexOutcome, CompoundRefused> {
        let fan = op.geometry(self).map_err(CompoundRefused::Refused)?;
        let reading = op.reading(self, &fan).map_err(CompoundRefused::Refused)?;
        let layer = reading.edge_layer;
        let direction = self.view().model_direction(op.direction);
        reading.compiled.land(self, choices, limits, || {
            compile(self, &fan, layer, direction.opposite(), op.kind)
                .ok()
                .map(|c| c.compiled)
        })
    }

    pub fn swivel_by_creases_action(
        &self,
        op: &SwivelByCreases,
        landed: Option<&State>,
    ) -> Result<FoldActionGeometry, Refused> {
        let fan = op.geometry(self)?;
        let reading = op.reading(self, &fan)?;
        let regions = super::swivel_on_edge::on_fold_regions(self, &reading);
        let reach: Vec<_> = regions
            .iter()
            .filter(|r| r.wedge == SwivelWedge::Near)
            .map(|r| r.polygon.clone())
            .collect();
        let line = fan.swivel_line()?;
        let side = reach
            .iter()
            .filter_map(|r| convex::centroid(r))
            .find_map(|p| Side::of_point(&line, p))
            .ok_or_else(|| internal("a swivel has no moving side"))?;
        let mut moving: Vec<_> = reading
            .compiled
            .block_of
            .iter()
            .enumerate()
            .filter(|(_, b)| b.is_some())
            .map(|(p, _)| self.faces()[reading.compiled.scoring.old[p]].id)
            .collect();
        moving.sort_unstable();
        moving.dedup();
        self.fold_action_within(
            &FoldAnalysis {
                line,
                side,
                snap: Snap::NONE,
                direction: self.view().model_direction(op.direction),
                flaps: vec![],
                picked: vec![],
                added: vec![],
                moving,
            },
            ActionKind::Fold,
            landed,
            Within {
                ray: Some((fan.vertex, fan.swivel)),
                reach: Some(&reach),
            },
        )
    }
}
