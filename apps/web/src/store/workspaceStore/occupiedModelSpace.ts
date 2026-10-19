import { aabbInFrame, boxAabbInFrame } from '../../cp-workspace/canvasObjects/placeBesideCp';
import { foldedFigureUserAabb } from '../../cp-workspace/adapters/cpFoldedToScene';
import type { Aabb } from '../../cp-workspace/picking/lineHitIndex';
import { cpSvgToModel } from '../../lib/creasePatternViewport';
import type { WorkspaceState } from './types';

/**
 * What is already on the canvas besides creases, in crease-pattern model
 * coordinates, so something new parks clear of all of it rather than only of
 * its own kind: a simulation window, or a batch of imported sheets.
 *
 * Folded figures are placed in SVG user space -- the space their render
 * primitives land in -- so their bounds are mapped back through the same affine
 * the flat pattern uses. It is positive and axis-preserving, so an axis-aligned
 * box stays axis-aligned and the corners are enough. Hidden annotations are not
 * drawn, so they hold no space.
 */
export function occupiedModelSpace(state: WorkspaceState, frameAngle = 0): Aabb[] {
  // Measured along the frame's axes, straight from each object's own box, so an
  // object created upright under this view contributes its exact footprint
  // rather than a bounding box inflated by its rotation.
  const boxes = [
    ...state.oristudioCpInlineSimulations.map((simulation) =>
      boxAabbInFrame(simulation.box, frameAngle)
    ),
    ...state.oristudioCpAnnotations
      .filter((annotation) => !annotation.hidden)
      .map((annotation) =>
        boxAabbInFrame(
          {
            center: annotation.center,
            width: annotation.width,
            height: annotation.height,
            rotation: annotation.rotation,
          },
          frameAngle
        )
      ),
  ];
  for (const figure of state.oristudioCpFoldedFigures) {
    const userAabb = foldedFigureUserAabb(figure);
    if (!userAabb) continue;
    const min = cpSvgToModel({ x: userAabb.minX, y: userAabb.minY });
    const max = cpSvgToModel({ x: userAabb.maxX, y: userAabb.maxY });
    boxes.push(
      aabbInFrame(
        {
          minX: Math.min(min.x, max.x),
          minY: Math.min(min.y, max.y),
          maxX: Math.max(min.x, max.x),
          maxY: Math.max(min.y, max.y),
        },
        frameAngle
      )
    );
  }
  return boxes;
}
