//! Which line segments are selected, read and written as a whole.
//!
//! An Ori Studio addition, not a port. Oriedita keeps its selection on the
//! segments (`LineSegment.selected`) and records an undo step for a selection
//! the way it records any other, by saving the whole document
//! (`MouseHandlerCreaseSelect` calls `d.record()`). The editor keeps that undo
//! step, but records it as the selection alone: on a canvas of half a million
//! creases the document is over a hundred megabytes and the selection a few
//! kilobytes. These are the two halves of that — what a selection command
//! changed, and putting a recorded selection back.

use crate::OperationId;
use crate::model::CreasePatternModel;
use serde::{Deserialize, Serialize};

/// The commands that change which line segments are selected and nothing else:
/// the box, polygon, line and lasso selects and their unselects. Line-click
/// selection is not here; it never reaches the kernel.
pub const SELECTION_OPERATIONS: [OperationId; 8] = [
    OperationId::CreaseSelect,
    OperationId::CreaseUnselect,
    OperationId::SelectPolygon,
    OperationId::UnselectPolygon,
    OperationId::SelectLineIntersecting,
    OperationId::UnselectLineIntersecting,
    OperationId::SelectLasso,
    OperationId::UnselectLasso,
];

/// Whether `operation` changes the selected flags and nothing else.
pub fn is_selection_operation(operation: OperationId) -> bool {
    SELECTION_OPERATIONS.contains(&operation)
}

/// The line segments whose `selected` flag is set: 1-based ids in ascending
/// order, each with its flag's value. Oriedita only ever writes 2, but a file
/// can carry any value, and it is kept as read.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectedLines {
    pub ids: Vec<u32>,
    pub values: Vec<i32>,
}

/// Why a [`SelectedLines`] could not be put on a document. Nothing is changed
/// when it is refused.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SelectedLinesError {
    #[error("{ids} selected line ids but {values} values")]
    LengthMismatch { ids: usize, values: usize },
    #[error("line {id} does not exist; the document has {count} lines")]
    NoSuchLine { id: u32, count: usize },
}

impl SelectedLines {
    /// The selected lines of `model`.
    pub fn of(model: &CreasePatternModel) -> Self {
        let mut lines = Self::default();
        for (index, segment) in model.line_segments.iter().enumerate() {
            if segment.selected != 0 {
                // A document cannot hold u32::MAX segments; saturating keeps the
                // conversion total rather than panicking on a case that cannot occur.
                lines.ids.push(u32::try_from(index + 1).unwrap_or(u32::MAX));
                lines.values.push(segment.selected);
            }
        }
        lines
    }

    /// Make these the selected lines of `model`, exactly: each line named takes
    /// its value and every other is unselected. Returns the selected lines it
    /// replaced, which put back the same way undo what this did.
    pub fn apply(&self, model: &mut CreasePatternModel) -> Result<Self, SelectedLinesError> {
        if self.ids.len() != self.values.len() {
            return Err(SelectedLinesError::LengthMismatch {
                ids: self.ids.len(),
                values: self.values.len(),
            });
        }
        let count = model.line_segments.len();
        if let Some(&id) = self.ids.iter().find(|&&id| id == 0 || id as usize > count) {
            return Err(SelectedLinesError::NoSuchLine { id, count });
        }
        let replaced = Self::of(model);
        for &id in &replaced.ids {
            if let Some(segment) = model.line_segments.get_mut(id as usize - 1) {
                segment.selected = 0;
            }
        }
        for (&id, &value) in self.ids.iter().zip(&self.values) {
            if let Some(segment) = model.line_segments.get_mut(id as usize - 1) {
                segment.selected = value;
            }
        }
        Ok(replaced)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{LineColor, LineSegment, Point};
    use crate::{CreasePatternCommand, CreasePatternCommandPayload, execute_command};

    fn model_with(lines: usize) -> CreasePatternModel {
        let mut model = CreasePatternModel::default();
        for index in 0..lines {
            let y = index as f64;
            model.line_segments.push(LineSegment::with_color(
                Point::new(0.0, y),
                Point::new(1.0, y),
                LineColor::Red1,
            ));
        }
        model
    }

    fn flags(model: &CreasePatternModel) -> Vec<i32> {
        model
            .line_segments
            .iter()
            .map(|line| line.selected)
            .collect()
    }

    #[test]
    fn reads_the_flagged_lines_with_their_values() {
        let mut model = model_with(4);
        model.line_segments[1].selected = 2;
        model.line_segments[3].selected = 1;
        assert_eq!(
            SelectedLines::of(&model),
            SelectedLines {
                ids: vec![2, 4],
                values: vec![2, 1],
            }
        );
    }

    #[test]
    fn apply_sets_exactly_these_and_returns_what_it_replaced() {
        let mut model = model_with(4);
        model.line_segments[0].selected = 2;
        model.line_segments[2].selected = 1;
        let wanted = SelectedLines {
            ids: vec![2, 3],
            values: vec![2, 2],
        };
        let replaced = wanted.apply(&mut model).expect("valid selection");
        assert_eq!(flags(&model), vec![0, 2, 2, 0]);
        assert_eq!(
            replaced,
            SelectedLines {
                ids: vec![1, 3],
                values: vec![2, 1],
            }
        );
        // Putting the replaced selection back is the undo, value for value.
        replaced.apply(&mut model).expect("valid selection");
        assert_eq!(flags(&model), vec![2, 0, 1, 0]);
    }

    #[test]
    fn apply_refuses_a_bad_selection_without_changing_anything() {
        let mut model = model_with(2);
        model.line_segments[0].selected = 2;
        let mismatch = SelectedLines {
            ids: vec![1, 2],
            values: vec![2],
        };
        assert_eq!(
            mismatch.apply(&mut model),
            Err(SelectedLinesError::LengthMismatch { ids: 2, values: 1 })
        );
        for id in [0, 3] {
            let missing = SelectedLines {
                ids: vec![2, id],
                values: vec![2, 2],
            };
            assert_eq!(
                missing.apply(&mut model),
                Err(SelectedLinesError::NoSuchLine { id, count: 2 })
            );
        }
        assert_eq!(flags(&model), vec![2, 0]);
    }

    /// The promise the editor's selection-only undo entry rests on: each of
    /// these commands leaves everything but the selected flags as it found it.
    #[test]
    fn selection_operations_change_nothing_but_the_selected_flags() {
        for operation in SELECTION_OPERATIONS {
            let mut document = crate::CreasePatternDocument {
                crease_pattern: model_with(5),
                ..Default::default()
            };
            let selects = matches!(
                operation,
                OperationId::CreaseSelect
                    | OperationId::SelectPolygon
                    | OperationId::SelectLineIntersecting
                    | OperationId::SelectLasso
            );
            // Something to unselect, for the unselect commands.
            if !selects {
                for line in &mut document.crease_pattern.line_segments {
                    line.selected = 2;
                }
            }
            let before = document.clone();
            // A box (two corners) over lines 2 and 3, or a line across 1 to 3.
            let points = if matches!(
                operation,
                OperationId::SelectLineIntersecting | OperationId::UnselectLineIntersecting
            ) {
                vec![Point::new(0.5, -0.5), Point::new(0.5, 2.5)]
            } else {
                vec![Point::new(-0.5, 0.5), Point::new(1.5, 2.5)]
            };
            let payload = CreasePatternCommandPayload {
                points,
                ..Default::default()
            };
            execute_command(
                &mut document,
                CreasePatternCommand::new(operation).with_payload(payload),
            )
            .unwrap_or_else(|error| panic!("{operation:?}: {error}"));
            assert_ne!(
                flags(&document.crease_pattern),
                flags(&before.crease_pattern),
                "{operation:?} should have changed the selection"
            );
            let mut unflagged = document.clone();
            let mut unflagged_before = before.clone();
            for model in [
                &mut unflagged.crease_pattern,
                &mut unflagged_before.crease_pattern,
            ] {
                for line in &mut model.line_segments {
                    line.selected = 0;
                }
            }
            assert_eq!(unflagged, unflagged_before, "{operation:?}");
        }
    }
}
