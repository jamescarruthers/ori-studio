/**
 * The sheet as the document stores it and as the Paper tab offers it (plan
 * D7), one into the other.
 *
 * The document keeps what replays (`foldSequenceDocument`): a rectangle by its
 * aspect at longer side 1, a polygon by its points. The tab keeps what a
 * person picks (`fold/paperShape`): a rectangle by width and height, a polygon
 * by its side count. A document's polygon is always the regular one its side
 * count makes (`regularPolygonShape`), so the count is all the tab needs of
 * it, and all the tab gives back.
 *
 * Pure: no React, no store.
 */
import {
  rectangleShape as documentRectangle,
  regularPolygonShape,
  type FoldPaperShape as FoldDocumentShape,
} from '../document/foldSequenceDocument';
import { rectangleShape, regularSides, type FoldPaperShape } from '../paperShape';

/** The tab's shape for the document's. */
export function paneShapeOf(shape: FoldDocumentShape): FoldPaperShape {
  switch (shape.kind) {
    case 'square':
      return { shape: 'square' };
    case 'rectangle':
      return { shape: 'rectangle', width: shape.aspect[0], height: shape.aspect[1] };
    case 'polygon':
      return { shape: 'regular', sides: shape.points.length };
  }
}

/**
 * The document's shape for the tab's, or null for one the engine does not
 * fold: proportions under the minimum feature, or a side count outside 3 to 8.
 * A rectangle whose sides agree is the square.
 */
export function documentShapeOf(shape: FoldPaperShape): FoldDocumentShape | null {
  switch (shape.shape) {
    case 'square':
      return { kind: 'square' };
    case 'rectangle': {
      const normalized = rectangleShape(shape.width, shape.height);
      if (!normalized) return null;
      return normalized.shape === 'rectangle' ? documentRectangle(normalized.width, normalized.height) : { kind: 'square' };
    }
    case 'regular': {
      const sides = regularSides(shape.sides);
      return sides === null ? null : regularPolygonShape(sides);
    }
  }
}
