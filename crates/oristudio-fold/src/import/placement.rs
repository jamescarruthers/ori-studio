//! Finding the sheet (plan D16 steps 2–3): the border segments chained into
//! one closed loop by `oristudio_geometry::outline`, the rectangle frame it
//! chooses, the match against the sequence's sheet, and the map from the
//! input's coordinates into the unit sheet frame and back.
//!
//! # Orientation
//!
//! The crease pattern's front is the sheet's front. The outline code reads
//! Oriedita's y-down model space and maps it to the y-up unit frame keeping
//! the picture as drawn (`Frame`), so model input goes straight in; y-up
//! input is mirrored into model space first, and the frame mirrors it back.
//! Either way the map into the sheet is a rotation, translation and scale:
//! no letter changes.

use oristudio_geometry::outline::{self, RefusalReason};
use oristudio_geometry::{Frame, convex};

use super::{CreasePatternInput, ImportKind, ImportRefusal, ImportSpace, UnsupportedShape};
use crate::numerics::TOL;
use crate::sheet::{Sheet, SheetShape};

type Point = [f64; 2];

/// The input's coordinates against the sheet's.
#[derive(Debug, Clone)]
pub(super) struct Placement {
    /// The input is y-up: mirror it into the y-down model space the frame
    /// reads.
    flip_y: bool,
    frame: Frame,
    /// The pattern's height in the unit frame, before any turn.
    found_height: f64,
    /// The pattern was turned a quarter counter-clockwise to fit the
    /// sequence's rectangle.
    quarter_turn: bool,
    /// Per axis, the factor (within the tolerance of 1) that puts the
    /// pattern's sides exactly on the sheet's.
    scale: [f64; 2],
    /// The sheet's width and height.
    sides: [f64; 2],
}

/// The sheet a pattern lands on, and how.
pub(super) struct Recovered {
    pub(super) placement: Placement,
    pub(super) sheet: Sheet,
    pub(super) shape: SheetShape,
}

/// Recover the sheet from the border, and match it against `sequence`'s
/// sheet, or adopt it when there is none.
pub(super) fn recover(
    input: &CreasePatternInput,
    sequence: Option<&Sheet>,
) -> Result<Recovered, ImportRefusal> {
    let flip_y = input.space == ImportSpace::Sheet;
    let to_model = |p: Point| if flip_y { [p[0], -p[1]] } else { p };
    let segments: Vec<[f64; 4]> = input
        .segments
        .iter()
        .map(|s| {
            let ([x1, y1], [x2, y2]) = (to_model(s.from), to_model(s.to));
            [x1, y1, x2, y2]
        })
        .collect();
    let border: Vec<u32> = input
        .segments
        .iter()
        .enumerate()
        .filter(|(_, s)| s.kind == ImportKind::Border)
        .filter_map(|(i, _)| u32::try_from(i).ok())
        .collect();
    let points: Vec<Point> = border
        .iter()
        .flat_map(|&i| {
            let [x1, y1, x2, y2] = segments[i as usize];
            [[x1, y1], [x2, y2]]
        })
        .collect();
    let [x0, y0, x1, y1] = convex::bounding_box(&points);
    let scale = (x1 - x0).max(y1 - y0);
    if !(scale.is_finite() && scale > 0.0) {
        return Err(ImportRefusal::NoBorder);
    }
    let loops = outline::detect_border_loops(&segments, &border, scale).loops;
    let count = loops.len();
    let mut loops = loops.into_iter();
    let (Some(border_loop), None) = (loops.next(), loops.next()) else {
        return Err(ImportRefusal::OutlineLoops { count });
    };
    let frame = match border_loop.sheet {
        Ok(rect) => rect.frame,
        // Mirroring into model space is its own inverse.
        Err(RefusalReason::NonRectangular { vertices }) => {
            return Err(ImportRefusal::ShapeUnsupported {
                which: UnsupportedShape::Pattern {
                    corners: vertices.into_iter().map(to_model).collect(),
                },
            });
        }
        Err(reason) => {
            return Err(ImportRefusal::OutlineInvalid {
                reason: unflip(reason, flip_y),
            });
        }
    };
    let rf = frame.rf_rect();
    let found_sides = [rf.width, rf.height];
    let (sheet, shape, quarter_turn, sides) = match sequence {
        None => {
            let (sheet, shape) = if (found_sides[0] - found_sides[1]).abs() <= TOL {
                (Sheet::square(), SheetShape::Square)
            } else {
                let sheet = Sheet::rectangle(found_sides[0], found_sides[1])
                    .map_err(|_| ImportRefusal::NoBorder)?;
                (
                    sheet,
                    SheetShape::Rectangle {
                        width: found_sides[0],
                        height: found_sides[1],
                    },
                )
            };
            let sides = rectangle_sides(&sheet).unwrap_or(found_sides);
            (sheet, shape, false, sides)
        }
        Some(sheet) => {
            let Some(sides) = rectangle_sides(sheet) else {
                return Err(ImportRefusal::ShapeUnsupported {
                    which: UnsupportedShape::Sequence,
                });
            };
            let near =
                |a: [f64; 2], b: [f64; 2]| (a[0] - b[0]).abs() <= TOL && (a[1] - b[1]).abs() <= TOL;
            let quarter_turn = if near(found_sides, sides) {
                false
            } else if near([found_sides[1], found_sides[0]], sides) {
                true
            } else {
                return Err(ImportRefusal::ShapeMismatch {
                    expected: sides,
                    found: found_sides,
                });
            };
            let shape = if (sides[0] - sides[1]).abs() <= TOL {
                SheetShape::Square
            } else {
                SheetShape::Rectangle {
                    width: sides[0],
                    height: sides[1],
                }
            };
            (sheet.clone(), shape, quarter_turn, sides)
        }
    };
    let turned = if quarter_turn {
        [found_sides[1], found_sides[0]]
    } else {
        found_sides
    };
    Ok(Recovered {
        placement: Placement {
            flip_y,
            frame,
            found_height: found_sides[1],
            quarter_turn,
            scale: [sides[0] / turned[0], sides[1] / turned[1]],
            sides,
        },
        sheet,
        shape,
    })
}

impl Placement {
    pub(super) fn quarter_turn(&self) -> bool {
        self.quarter_turn
    }

    /// An input point in sheet coordinates; within the tolerance of a side,
    /// exactly on it.
    pub(super) fn to_sheet(&self, p: Point) -> Point {
        let model = if self.flip_y { [p[0], -p[1]] } else { p };
        let unit = self.frame.model_to_unit(model);
        let turned = if self.quarter_turn {
            [self.found_height - unit[1], unit[0]]
        } else {
            unit
        };
        let snap = |v: f64, side: f64| {
            if v.abs() <= TOL {
                0.0
            } else if (v - side).abs() <= TOL {
                side
            } else {
                v
            }
        };
        [
            snap(turned[0] * self.scale[0], self.sides[0]),
            snap(turned[1] * self.scale[1], self.sides[1]),
        ]
    }

    /// A sheet point in the input's coordinates.
    pub(super) fn to_input(&self, p: Point) -> Point {
        let turned = [p[0] / self.scale[0], p[1] / self.scale[1]];
        let unit = if self.quarter_turn {
            [turned[1], self.found_height - turned[0]]
        } else {
            turned
        };
        let model = self.frame.unit_to_model(unit);
        if self.flip_y {
            [model[0], -model[1]]
        } else {
            model
        }
    }
}

/// The sides of a sheet that is the axis-aligned rectangle of its bounding
/// box: four corners and the box's area. Every square and rectangle sheet
/// is; a regular polygon or another outline is not.
fn rectangle_sides(sheet: &Sheet) -> Option<[f64; 2]> {
    let outline = sheet.outline();
    let [x0, y0, x1, y1] = convex::bounding_box(outline);
    let (w, h) = (x1 - x0, y1 - y0);
    (outline.len() == 4 && (sheet.area() - w * h).abs() <= TOL).then_some([w, h])
}

/// A refusal's vertices back in y-up input coordinates.
fn unflip(reason: RefusalReason, flip_y: bool) -> RefusalReason {
    if !flip_y {
        return reason;
    }
    let flip = |v: Vec<Point>| v.into_iter().map(|p| [p[0], -p[1]]).collect();
    match reason {
        RefusalReason::NonRectangular { vertices } => RefusalReason::NonRectangular {
            vertices: flip(vertices),
        },
        RefusalReason::OpenOutline { vertices } => RefusalReason::OpenOutline {
            vertices: flip(vertices),
        },
        RefusalReason::NonSimpleOutline { vertices } => RefusalReason::NonSimpleOutline {
            vertices: flip(vertices),
        },
        RefusalReason::DegenerateOutline { vertices } => RefusalReason::DegenerateOutline {
            vertices: flip(vertices),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::ImportSegment;

    fn outline(space: ImportSpace, corners: &[Point]) -> CreasePatternInput {
        let n = corners.len();
        CreasePatternInput {
            space,
            segments: (0..n)
                .map(|i| ImportSegment {
                    from: corners[i],
                    to: corners[(i + 1) % n],
                    kind: ImportKind::Border,
                })
                .collect(),
        }
    }

    fn close(a: Point, b: Point) -> bool {
        (a[0] - b[0]).abs() < 1e-12 && (a[1] - b[1]).abs() < 1e-12
    }

    fn recovered(input: &CreasePatternInput, sequence: Option<&Sheet>) -> Recovered {
        recover(input, sequence).unwrap_or_else(|e| panic!("{e}"))
    }

    #[test]
    fn oriedita_model_space_keeps_the_picture() {
        // Oriedita's default paper, y-down: its on-screen lower left is
        // (-200, 200).
        let input = outline(
            ImportSpace::Model,
            &[
                [-200.0, -200.0],
                [200.0, -200.0],
                [200.0, 200.0],
                [-200.0, 200.0],
            ],
        );
        let r = recovered(&input, None);
        assert_eq!(r.shape, SheetShape::Square);
        assert!(close(r.placement.to_sheet([-200.0, 200.0]), [0.0, 0.0]));
        assert!(close(r.placement.to_sheet([200.0, -200.0]), [1.0, 1.0]));
        // A point to the upper left on screen is upper left on the sheet.
        assert!(close(r.placement.to_sheet([-100.0, -100.0]), [0.25, 0.75]));
        assert!(close(r.placement.to_input([0.25, 0.75]), [-100.0, -100.0]));
    }

    #[test]
    fn y_up_input_is_placed_without_a_mirror() {
        let input = outline(
            ImportSpace::Sheet,
            &[[10.0, 10.0], [12.0, 10.0], [12.0, 11.0], [10.0, 11.0]],
        );
        let r = recovered(&input, None);
        assert_eq!(
            r.shape,
            SheetShape::Rectangle {
                width: 1.0,
                height: 0.5
            }
        );
        assert!(close(r.placement.to_sheet([10.0, 10.0]), [0.0, 0.0]));
        assert!(close(r.placement.to_sheet([11.5, 10.75]), [0.75, 0.375]));
        assert!(close(r.placement.to_input([0.75, 0.375]), [11.5, 10.75]));
    }

    #[test]
    fn a_rectangle_turns_a_quarter_to_fit_the_sequence() {
        let wide = outline(
            ImportSpace::Sheet,
            &[[0.0, 0.0], [2.0, 0.0], [2.0, 1.0], [0.0, 1.0]],
        );
        let tall = Sheet::rectangle(1.0, 2.0).unwrap_or_else(|e| panic!("{e}"));
        let r = recovered(&wide, Some(&tall));
        assert!(r.placement.quarter_turn());
        // Counter-clockwise: the pattern's lower right corner goes to the
        // sheet's upper right.
        assert!(close(r.placement.to_sheet([2.0, 0.0]), [0.5, 1.0]));
        assert!(close(r.placement.to_sheet([0.0, 0.0]), [0.5, 0.0]));
        assert!(close(r.placement.to_input([0.5, 1.0]), [2.0, 0.0]));
        assert!(close(r.placement.to_input([0.1, 0.3]), [0.6, 0.8]));
        assert_eq!(r.sheet, tall);
    }

    #[test]
    fn shapes_that_do_not_fit_are_refused() {
        let square = outline(
            ImportSpace::Sheet,
            &[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
        );
        let a4 = Sheet::rectangle(1.0, 2f64.sqrt()).unwrap_or_else(|e| panic!("{e}"));
        assert!(matches!(
            recover(&square, Some(&a4)),
            Err(ImportRefusal::ShapeMismatch { .. })
        ));
        let hexagon = Sheet::regular(6).unwrap_or_else(|e| panic!("{e}"));
        assert!(matches!(
            recover(&square, Some(&hexagon)),
            Err(ImportRefusal::ShapeUnsupported {
                which: UnsupportedShape::Sequence
            })
        ));
        // A diamond sheet is a square, but not the axis-aligned one.
        let diamond = Sheet::regular(4).unwrap_or_else(|e| panic!("{e}"));
        assert!(matches!(
            recover(&square, Some(&diamond)),
            Err(ImportRefusal::ShapeUnsupported { .. })
        ));
        let kite = outline(
            ImportSpace::Sheet,
            &[[0.0, 0.0], [1.0, 0.0], [1.2, 1.0], [0.0, 1.0]],
        );
        assert!(matches!(
            recover(&kite, None),
            Err(ImportRefusal::ShapeUnsupported {
                which: UnsupportedShape::Pattern { .. }
            })
        ));
        let open = CreasePatternInput {
            space: ImportSpace::Sheet,
            segments: square.segments[..3].to_vec(),
        };
        assert!(matches!(
            recover(&open, None),
            Err(ImportRefusal::OutlineInvalid {
                reason: RefusalReason::OpenOutline { .. }
            })
        ));
        let mut two = square.clone();
        two.segments.extend(
            outline(
                ImportSpace::Sheet,
                &[[3.0, 0.0], [4.0, 0.0], [4.0, 1.0], [3.0, 1.0]],
            )
            .segments,
        );
        assert_eq!(
            recover(&two, None).map(|_| ()).err(),
            Some(ImportRefusal::OutlineLoops { count: 2 })
        );
        let none = CreasePatternInput {
            space: ImportSpace::Sheet,
            segments: Vec::new(),
        };
        assert_eq!(
            recover(&none, None).map(|_| ()).err(),
            Some(ImportRefusal::NoBorder)
        );
    }
}
