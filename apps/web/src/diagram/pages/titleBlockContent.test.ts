import { describe, expect, it } from 'vitest';
import type { PageBox } from './pagePlacement';
import { PRINT_PAPER_MM } from './printPaper';
import {
  DEFAULT_PAGE_SETUP,
  removeStepPicture,
  removeSteps,
  type DiagramCpSource,
  type DiagramDocument,
  type DiagramPageSetup,
} from '../document/diagramDocument';
import type { SheetStrokeRole, SheetThumbnail } from '../../cp-workspace/sheets/sheetThumbnail';
import { readDiagram, writeDiagram } from '../document/diagramFile';
import { cpStep, referencesStep } from '../document/diagramSteps.fixtures';
import { estimateTextSetter } from './estimateTextSetter';
import {
  OTHER_PATTERN,
  emptyStep,
  lockedStep,
  patternStep,
  titleBlockDiagram,
  turnOver,
  uploadStep,
} from './titleBlock.fixtures';
import {
  autoModelStep,
  autoPatternStep,
  drawsPattern,
  missingTitleBlockParts,
  modelRoom,
  patternScene,
  resolveTitleBlock,
} from './titleBlockContent';
import { STEP_TEXT_LEADING_MM, TEXT_DESCENT_MM } from './stepType';
import { setTitleBlock, titleBlockGeometry } from './titleBlockGeometry';

/**
 * What the first page's title block shows (`implementation-plans/
 * diagram-title-block.md`, sections 4 and 5): Auto, a chosen step, or none,
 * for the model and the pattern alike.
 */

/** A linked step shown folded, on a pattern of its own. */
const folded = (id: string) => patternStep(id, OTHER_PATTERN, { mode: 'folded-flat', side: 'front', rotationDeg: 0, foldCase: 0 });

/** Each part as where it comes from and its step's id. */
function shown(document: DiagramDocument) {
  const { model, pattern } = resolveTitleBlock(document);
  return { model: [model.from, model.step?.id ?? null], pattern: [pattern.from, pattern.step?.id ?? null] };
}

describe('resolveTitleBlock', () => {
  it('finds the last step with a picture for the model, and the last linked step for the pattern, by Auto', () => {
    const pattern = folded('s2');
    const document = titleBlockDiagram([cpStep('s1'), pattern, uploadStep('s3')]);
    expect(shown(document)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's2'] });
    // Shown folded, a link still names its pattern: the lines are its stored thumbnail's.
    expect(resolveTitleBlock(document).pattern.scene).toEqual(patternScene((pattern.source as DiagramCpSource).thumbnail));
  });

  it('passes over turns, empty steps and a newer build’s steps, so a diagram ending in a turn still finds its model', () => {
    const document = titleBlockDiagram([cpStep('s1'), cpStep('s2'), lockedStep('s3'), emptyStep('s4'), turnOver('t1')]);
    expect(shown(document)).toEqual({ model: ['auto', 's2'], pattern: ['auto', 's2'] });
  });

  it('finds no pattern where no step is linked to a crease pattern: a References step’s sheet is not the model’s pattern', () => {
    const document = titleBlockDiagram([referencesStep('r1'), emptyStep('s2')]);
    expect(shown(document)).toEqual({ model: ['auto', 'r1'], pattern: ['auto', null] });
    expect(resolveTitleBlock(document).pattern.scene).toBeNull();
    expect(shown(titleBlockDiagram([]))).toEqual({ model: ['auto', null], pattern: ['auto', null] });
  });

  it('shows a chosen step, and none where none is chosen', () => {
    const steps = [cpStep('s1'), folded('s2'), cpStep('s3')];
    expect(shown(titleBlockDiagram(steps, { model: { kind: 'step', stepId: 's1' }, pattern: { kind: 'step', stepId: 's2' } }))).toEqual({
      model: ['step', 's1'],
      pattern: ['step', 's2'],
    });
    const none = titleBlockDiagram(steps, { model: { kind: 'none' }, pattern: { kind: 'none' } });
    expect(shown(none)).toEqual({ model: ['none', null], pattern: ['none', null] });
    expect(resolveTitleBlock(none).pattern.scene).toBeNull();
  });

  it('reads a chosen step that is gone, or a newer build’s now, as Auto: its id left as it is', () => {
    const chosen = titleBlockDiagram([cpStep('s1'), cpStep('s2'), cpStep('s3')], {
      model: { kind: 'step', stepId: 's1' },
      pattern: { kind: 'step', stepId: 's1' },
    });
    const removed = removeSteps(chosen, ['s1']);
    expect(removed.titleBlockContent).toEqual(chosen.titleBlockContent);
    expect(shown(removed)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's3'] });
    const newer = { ...chosen, steps: chosen.steps.map((entry) => (entry.id === 's1' ? lockedStep('s1') : entry)) };
    expect(shown(newer)).toEqual({ model: ['auto', 's3'], pattern: ['auto', 's3'] });
    // A turn has no number and no picture: never the model, though its id be chosen.
    const turned = titleBlockDiagram([cpStep('s1'), turnOver('t1')], { model: { kind: 'step', stepId: 't1' } });
    expect(shown(turned).model).toEqual(['auto', 's1']);
  });

  it('shows nothing for a chosen step that can no longer give its part, and says which step that is', () => {
    const chosen = titleBlockDiagram([cpStep('s1'), cpStep('s2'), emptyStep('s3')], {
      model: { kind: 'step', stepId: 's1' },
      pattern: { kind: 'step', stepId: 's3' },
    });
    const pictureless = removeStepPicture(chosen, 's1');
    const { model, pattern } = resolveTitleBlock(pictureless);
    expect([model.from, model.step?.id, model.step?.picture]).toEqual(['step', 's1', null]);
    expect([pattern.from, pattern.step?.id, pattern.scene]).toEqual(['step', 's3', null]);
  });

  it('shows Auto for a part only a newer build reads', () => {
    const written = JSON.parse(JSON.stringify(writeDiagram(titleBlockDiagram([cpStep('s1'), cpStep('s2')], { pattern: { kind: 'none' } }))));
    written.titleBlockContent = { ...written.titleBlockContent, model: { kind: 'own', step: { id: 'title-model' } } };
    const { document } = readDiagram(written)!;
    expect(shown(document)).toEqual({ model: ['auto', 's2'], pattern: ['none', null] });
  });

  it('names what Auto finds whatever is chosen, for the Page pane to offer', () => {
    const document = titleBlockDiagram([cpStep('s1'), folded('s2'), emptyStep('s3')], { model: { kind: 'none' }, pattern: { kind: 'step', stepId: 's1' } });
    expect(autoModelStep(document)?.id).toBe('s2');
    expect(autoPatternStep(document)?.id).toBe('s2');
  });

  it('passes over a linked step whose pattern draws nothing for Auto, and draws nothing for one chosen', () => {
    const blank = patternStep('s2', []);
    expect(shown(titleBlockDiagram([cpStep('s1'), blank])).pattern).toEqual(['auto', 's1']);
    const chosen = resolveTitleBlock(titleBlockDiagram([cpStep('s1'), blank], { pattern: { kind: 'step', stepId: 's2' } })).pattern;
    expect([chosen.from, chosen.step?.id, chosen.scene]).toEqual(['step', 's2', null]);
  });

  it('gives the pattern’s lines as the painter draws them, none where it gives none', () => {
    const pattern = folded('s2');
    const { scene } = resolveTitleBlock(titleBlockDiagram([cpStep('s1'), pattern])).pattern;
    expect(scene).toEqual(patternScene((pattern.source as DiagramCpSource).thumbnail));
    expect(resolveTitleBlock(titleBlockDiagram([cpStep('s1')], { pattern: { kind: 'none' } })).pattern.scene).toBeNull();
  });
});

describe('patternScene', () => {
  const stroke = (role: SheetStrokeRole, y: number) => ({ x1: 0, y1: y, x2: 100, y2: y, role });

  it('draws a thumbnail’s lines in the pattern’s own pens, an unassigned one as aux, and leaves its aux lines out', () => {
    const thumbnail: SheetThumbnail = {
      viewBox: '0 0 100 100',
      strokes: [stroke('aux', 10), stroke('unassigned', 20), stroke('mountain', 30), stroke('valley', 40), stroke('edge', 0)],
    };
    const scene = patternScene(thumbnail)!;
    expect(scene.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(scene.sheet).toBe(100);
    expect(scene.items.map((item) => (item.kind === 'line' ? [item.role, item.a, item.b] : item.kind))).toEqual([
      ['aux', [0, 20], [100, 20]],
      ['mountain', [0, 30], [100, 30]],
      ['valley', [0, 40], [100, 40]],
      ['edge', [0, 0], [100, 0]],
    ]);
    // No paper: the pattern sits on the page.
    expect(scene.items.some((item) => item.kind === 'face')).toBe(false);
  });

  it('is none for a thumbnail with no line to draw', () => {
    expect(patternScene({ viewBox: '0 0 100 100', strokes: [] })).toBeNull();
    expect(patternScene({ viewBox: '0 0 100 100', strokes: [stroke('aux', 50)] })).toBeNull();
    expect(patternScene({ viewBox: '0 0 0 0', strokes: [stroke('edge', 0)] })).toBeNull();
  });

  it('is drawn exactly where drawsPattern says a thumbnail draws: the one answer the pane and the page read', () => {
    const thumbnails: SheetThumbnail[] = [
      { viewBox: '0 0 100 100', strokes: [] },
      { viewBox: '0 0 100 100', strokes: [stroke('aux', 50)] },
      { viewBox: '0 0 100 100', strokes: [stroke('aux', 50), stroke('unassigned', 20)] },
      { viewBox: '0 0 0 0', strokes: [stroke('edge', 0)] },
      { viewBox: 'none', strokes: [stroke('valley', 0)] },
      { viewBox: '-5 -5 110 110', strokes: [stroke('mountain', 0)] },
    ];
    expect(thumbnails.map(drawsPattern)).toEqual([false, false, true, false, false, true]);
    expect(thumbnails.map((thumbnail) => patternScene(thumbnail) !== null)).toEqual(thumbnails.map(drawsPattern));
  });
});

describe('missingTitleBlockParts', () => {
  const geometry = titleBlockGeometry({ ...DEFAULT_PAGE_SETUP, layout: 'flow', titleBlock: { enabled: true, heightShare: 0.27 } }, 11, 8)!;
  const missing = (document: DiagramDocument, title = 'Crane') =>
    missingTitleBlockParts(setTitleBlock(geometry, { title, byline: '' }, estimateTextSetter), resolveTitleBlock(document), null).map(
      ({ room, box, missing: parts }) => [room, box, parts.map(({ part, step, number }) => [part, step?.id ?? null, number])]
    );

  it('marks nothing where every part prints', () => {
    expect(missing(titleBlockDiagram([cpStep('s1'), cpStep('s2')]))).toEqual([]);
  });

  it('marks the title where there is none, and a part no step gives in the room it would print in, naming the step by its number', () => {
    // No linked step and no picture: the pattern and the model would both stand in the pattern's square, one room.
    expect(missing(titleBlockDiagram([emptyStep('s1')]), '')).toEqual([
      ['title', geometry.title, [['title', null, null]]],
      ['square', geometry.pattern, [['pattern', null, null], ['model', null, null]]],
    ]);
    // A chosen step that can no longer give its part names it, numbered as the pages number it, turns left out.
    const chosen = titleBlockDiagram([cpStep('s1'), turnOver('t1'), uploadStep('s2')], {
      model: { kind: 'step', stepId: 's1' },
      pattern: { kind: 'step', stepId: 's2' },
    });
    expect(missing(removeStepPicture(chosen, 's1'))).toEqual([['square', geometry.pattern, [['pattern', 's2', 2], ['model', 's1', 1]]]]);
    // The model alone missing, in front of a pattern drawn: its own box.
    const pictureless = titleBlockDiagram([cpStep('s1'), cpStep('s2')], { model: { kind: 'step', stepId: 's2' } });
    expect(missing(removeStepPicture(pictureless, 's2'))).toEqual([['model', geometry.model, [['model', 's2', 2]]]]);
    // The pattern alone missing: the model stands in its square, which says why there is no pattern.
    expect(missing(titleBlockDiagram([uploadStep('s1')]))).toEqual([['square', geometry.pattern, [['pattern', null, null]]]]);
    // The pattern set to none, the model missing: the model's room is the square.
    expect(missing(titleBlockDiagram([emptyStep('s1')], { pattern: { kind: 'none' } }))).toEqual([['square', geometry.pattern, [['model', null, null]]]]);
  });

  it('keeps the square’s mark clear of a model drawn in it: the strip it leaves, else the title’s column under the byline', () => {
    const block = setTitleBlock(geometry, { title: 'Crane', byline: '' }, estimateTextSetter);
    const content = resolveTitleBlock(titleBlockDiagram([uploadStep('s1')]));
    const square = geometry.pattern;
    const near = ({ x, y, w, h }: PageBox) => [x, y, w, h].map((value) => expect.closeTo(value, 9));
    const mark = (model: PageBox | null) => missingTitleBlockParts(block, content, model).map(({ room, box: { x, y, w, h } }) => [room, [x, y, w, h]]);
    // Taller than wide, a portrait upload: the strip beside it.
    const tall = { x: square.x + square.w / 4, y: square.y, w: (3 * square.w) / 4, h: square.h };
    expect(mark(tall)).toEqual([['square', near({ ...square, w: square.w / 4 })]]);
    // Wider than tall: the strip above it.
    const wide = { x: square.x, y: square.y + square.h / 4, w: square.w, h: (3 * square.h) / 4 };
    expect(mark(wide)).toEqual([['square', near({ ...square, h: square.h / 4 })]]);
    // Filling it: in the title's column, under the byline's lines — the whole column under the title, with none.
    const { byline, block: band } = geometry;
    expect(mark(square)).toEqual([['square', near({ x: byline.x, y: byline.y, w: byline.w, h: band.y + band.h - byline.y })]]);
    const two = setTitleBlock(geometry, { title: 'Crane', byline: 'Design: traditional\nPaper: 15 cm square' }, estimateTextSetter);
    const top = two.byline!.firstBaseline + STEP_TEXT_LEADING_MM + TEXT_DESCENT_MM;
    expect(missingTitleBlockParts(two, content, square).map(({ box: { x, y, w, h } }) => [x, y, w, h])).toEqual([
      near({ x: byline.x, y: top, w: byline.w, h: band.y + band.h - top }),
    ]);
    // No model drawn: the square.
    expect(mark(null)).toEqual([['square', near(square)]]);
  });

  it('marks nothing the author set to none', () => {
    expect(missing(titleBlockDiagram([emptyStep('s1')], { model: { kind: 'none' }, pattern: { kind: 'none' } }))).toEqual([]);
  });

  it('stands the model in front of the pattern where one is drawn, and in its square where none is', () => {
    expect(modelRoom(geometry, resolveTitleBlock(titleBlockDiagram([cpStep('s1')])))).toBe(geometry.model);
    expect(modelRoom(geometry, resolveTitleBlock(titleBlockDiagram([cpStep('s1')], { pattern: { kind: 'none' } })))).toBe(geometry.pattern);
    expect(modelRoom(geometry, resolveTitleBlock(titleBlockDiagram([uploadStep('s1')])))).toBe(geometry.pattern);
  });

  it('never stands the model on the title or the byline, nor one box of the overlay on another, on any paper, share or grid', () => {
    const right = (box: PageBox) => box.x + box.w;
    const foot = (box: PageBox) => box.y + box.h;
    const overlap = (a: PageBox, b: PageBox) =>
      Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(foot(a), foot(b)) - Math.max(a.y, b.y));
    const pictureless = titleBlockDiagram([cpStep('s1'), cpStep('s2')], { model: { kind: 'step', stepId: 's2' } });
    const contents = [
      titleBlockDiagram([cpStep('s1')]),
      titleBlockDiagram([uploadStep('s1')]),
      titleBlockDiagram([emptyStep('s1')]),
      removeStepPicture(pictureless, 's2'),
      titleBlockDiagram([uploadStep('s1')], { pattern: { kind: 'none' } }),
      titleBlockDiagram([emptyStep('s1')], { pattern: { kind: 'none' } }),
      titleBlockDiagram([cpStep('s1')], { model: { kind: 'none' } }),
    ].map(resolveTitleBlock);
    const papers = Object.keys(PRINT_PAPER_MM).flatMap((size) => (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation })));
    const layouts = [{ layout: 'flow' as const }, ...[2, 3, 6].map((rows) => ({ layout: 'grid' as const, columns: 3, rows }))];
    /** A picture of `aspect` fitted to `room`, at its bottom right, as `wholePicture` draws it. */
    const standing = (room: PageBox, aspect: number): PageBox => {
      const w = Math.min(room.w, room.h * aspect);
      const h = w / aspect;
      return { x: right(room) - w, y: foot(room) - h, w, h };
    };
    let rooms = 0;
    const crowded = new Set<string>();
    for (const paper of papers) {
      for (const heightShare of [0.15, 0.27, 0.5]) {
        for (const layout of layouts) {
          const setup = { ...DEFAULT_PAGE_SETUP, ...paper, ...layout, titleBlock: { enabled: true, heightShare } } as DiagramPageSetup;
          const label = JSON.stringify({ ...paper, ...layout, heightShare });
          const shape = titleBlockGeometry(setup, 11, 8)!;
          for (const content of contents) {
            const room = modelRoom(shape, content);
            expect(overlap(room, shape.title), label).toBe(0);
            expect(overlap(room, shape.byline), label).toBe(0);
            for (const title of ['', 'Crane']) {
              // The model as drawn where it is: tall, square or wide, set to its room's bottom right.
              for (const aspect of [3 / 4, 1, 4 / 3]) {
                const drawn = content.model.step?.picture ? standing(room, aspect) : null;
                const marks = missingTitleBlockParts(setTitleBlock(shape, { title, byline: '' }, estimateTextSetter), content, drawn);
                const boxes = marks.map(({ box }) => box);
                rooms += boxes.length;
                boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => expect(overlap(a, b), label).toBe(0)));
                const square = marks.find((mark) => mark.room === 'square');
                if (drawn && square && square.box !== shape.pattern) expect(overlap(square.box, drawn), label).toBe(0);
                if (drawn && square?.box === shape.pattern) crowded.add(label);
              }
            }
          }
        }
      }
    }
    expect(rooms).toBeGreaterThan(0);
    // Only where neither the square nor the title's column has room for words does a mark stand on the model: the
    // least block there is, 18.6 mm on A5 landscape at 15%.
    expect([...crowded]).toEqual([JSON.stringify({ size: 'a5', orientation: 'landscape', layout: 'flow', heightShare: 0.15 })]);
  });
});
