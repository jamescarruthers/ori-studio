import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnnotationAction } from '../../diagram/annotate/annotationActions';
import { annotationLabel, lineTypeLabel } from '../../diagram/annotate/annotateTools';
import { DIAGRAM_LINE_TYPES, lineTypeOf, type DiagramLineType } from '../../diagram/annotate/lineTypes';
import { annotationInkColor } from '../../diagram/annotate/annotationPrimitives';
import {
  carriesColor,
  carriesText,
  carriesTextStyle,
  CLOSE_UP_SCALE,
  CLOSE_UP_SCALE_STEP,
  closeUpScale,
  closeUpScaleWithin,
  DEFAULT_PLEAT_KINKS,
  isSolidArrow,
  LABEL_MAX_LENGTH,
  PLEAT_KINKS,
  pleatKinks,
} from '../../diagram/annotate/annotationModel';
import { layerNames } from '../../diagram/annotate/layerNames';
import { useFieldFocusRequest } from '../../diagram/annotate/useFieldFocusRequest';
import { useStepAnnotations } from '../../diagram/annotate/useStepAnnotations';
import { DEFAULT_DIAGRAM_STYLE, stepNumber, type DiagramStep, type KnownDiagramAnnotation } from '../../diagram/document/diagramDocument';
import { TURN_ROTATION_PRESETS, withTurnDirection, withTurnPreset } from '../../lib/steps/turn';
import { turnAmountOptions } from '../../lib/steps/turnWords';
import { marksTouchingWindow, viewOfStep } from '../../diagram/zoom/stepView';
import { useAreaSubtitle } from '../../diagram/zoom/useZoomControls';
import { areaStatus } from '../../diagram/zoom/areaStatus';
import { frameSubtitle } from '../../diagram/zoom/zoomActions';
import { ZOOM_FRAME_ID, zoomShapeOf } from '../../diagram/zoom/zoomModel';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { shortcutLabelForAction } from '../../keyboard/shortcuts';
import { useShortcutResolution } from '../../store/shortcutStore';
import { FieldRow, NumberRow, SegmentedRow, TextAreaRow } from '../ui/fieldRows';
import { Notice } from '../ui/Notice';
import { SegmentedControl } from '../ui/SegmentedControl';
import { DiagramAnnotationGlyph, EnlargeGlyph, SolidArrowGlyph } from './DiagramAnnotateToolGlyph';
import { DiagramAnnotationIconVerb, DiagramAnnotationToolbar } from './DiagramAnnotationToolbar';
import { DiagramBehindControls } from './DiagramBehindControls';
import { DiagramCardMarksNotice } from './DiagramCardMarksNotice';
import { DiagramColorSelect } from './DiagramColorSelect';
import { DiagramDivisionsControls } from './DiagramDivisionsControls';
import { DiagramInspectorHeader } from './DiagramInspectorHeader';
import { DiagramLayerList, DiagramLayerRow, DiagramLayersHeader } from './DiagramLayerList';
import { DiagramLayersSplit } from './DiagramLayersSplit';
import { DiagramLineTypeMark } from './DiagramLineTypeMark';
import { DiagramPathNodeControls } from './DiagramPathNodeControls';
import { DiagramTextStyleRows } from './DiagramTextStyleRows';
import { DiagramAngleMarkControls } from './DiagramAngleMarkControls';
import { DiagramTicksRow } from './DiagramTicksRow';
import { DiagramWhiteArrowControls } from './DiagramWhiteArrowControls';
import { DiagramStarControls } from './DiagramStarControls';
import { DiagramRotationRow } from './DiagramRotationRow';
import { boxedMarkOf } from '../../diagram/annotate/transformGrips';
import { DiagramZoomControls } from './DiagramZoomControls';
import { DiagramXRayControls } from './DiagramXRayControls';
import styles from './DiagramLayers.module.css';

/**
 * The Layers pane's body (Zach, 2026-10-05; redesign, 2026-10-18): what is
 * drawn on the step open in Annotate and the selected one's inspector, in two
 * regions (`DiagramLayersSplit`).
 *
 * Over the list, the step and how many marks it holds; on a References step
 * whose card's marks are still part of its picture, which the list cannot
 * show, Annotate's notice that says so, with Make Editable (17e); and a notice
 * when some were made by a newer Ori Studio, which the list leaves out. The
 * list, one line a mark in the order they were drawn, a kind drawn twice
 * numbered (`layerNames`); a press selects one as a press on the canvas does.
 * An enlarged step's frame is its first row (Revision 2); a mark lying wholly
 * outside its window, which it keeps but sizes nothing by — and far off it, no
 * longer draws — is greyed; an enlarge area's row says which steps were
 * enlarged from it.
 *
 * Under the separator, the selection's inspector: the frame's controls
 * (`DiagramZoomControls`), or a mark's (`SelectedAnnotation`). The Snap switch
 * and the notice that the picture changed stay in the Step pane, with the
 * step (`DiagramStepAnnotations`).
 */
export function DiagramLayers({ step }: { step: DiagramStep }) {
  const { t } = useTranslation();
  const annotations = useStepAnnotations(step);
  const { known, selected, editable } = annotations;
  const selectedId = useWorkspaceStore((state) => state.diagramSelectedAnnotationId);
  const number = useWorkspaceStore((state) => (state.diagram ? stepNumber(state.diagram, step.id) : null));
  const view = useMemo(() => viewOfStep(step), [step]);
  const frame = view.zoom;
  // The marks an enlarged step keeps but is not sized by: wholly outside its window (Zach, 2026-10-07).
  const outside = useMemo(() => {
    if (!view.window) return null;
    const touching = new Set(marksTouchingWindow(view.window, step.annotations).map((mark) => mark.id));
    return new Set(step.annotations.filter((mark) => !touching.has(mark.id)).map((mark) => mark.id));
  }, [view.window, step.annotations]);
  const names = useMemo(
    () =>
      layerNames(
        known,
        (index) => {
          const annotation = known[index]!;
          return carriesText(annotation.kind) && annotation.text
            ? { name: annotation.text, generic: false }
            : { name: annotationLabel(t, annotation), generic: true };
        },
        (name, count) => t('panels:diagram.layers.numbered', '{{name}} {{number}}', { name, number: count })
      ),
    [known, t]
  );
  const frameSelected = frame !== null && selectedId === ZOOM_FRAME_ID;
  const stepName = t('panels:diagram.pages.step', 'Step {{number}}', { number: number ?? '' });
  const instruction = step.text.trim();
  const place = instruction
    ? t('panels:diagram.layers.markPlace', '{{step}} · {{text}}', { step: stepName, text: instruction })
    : stepName;

  const header = (
    <DiagramLayersHeader
      title={stepName}
      count={t('panels:diagram.layers.markCount', {
        count: known.length + (frame ? 1 : 0),
        defaultValue_one: '{{count}} mark',
        defaultValue_other: '{{count}} marks',
      })}
    />
  );
  const list = (
    <>
      {annotations.cardMarks && (
        <div className={styles.notice}>
          <DiagramCardMarksNotice
            cardMarks={annotations.cardMarks}
            disabled={!editable}
            onMakeEditable={() => annotations.makeMarksEditable('layers_notice')}
          />
        </div>
      )}
      {annotations.unknownCount > 0 && (
        <div className={styles.notice}>
          <Notice>
            {t(
              'panels:diagram.annotations.newer',
              'Some of this step’s annotations were made with a newer Ori Studio. They are kept, but not shown here.'
            )}
          </Notice>
        </div>
      )}
      <DiagramLayerList
        label={t('panels:diagram.layers.list', 'Layers')}
        empty={known.length === 0 && !frame ? t('panels:diagram.annotations.empty', 'Nothing drawn yet.') : null}
      >
        {frame && (
          <li>
            <FrameRow step={step} shape={frame.zoom.shape} selected={frameSelected} onSelect={annotations.select} />
          </li>
        )}
        {known.map((annotation) => (
          <li key={annotation.id}>
            <AnnotationRow
              annotation={annotation}
              name={names.get(annotation.id) ?? annotationLabel(t, annotation)}
              selected={annotation.id === selected?.id}
              outside={outside?.has(annotation.id) ?? false}
              onSelect={annotations.select}
              onRemove={editable ? annotations.remove : null}
            />
          </li>
        ))}
      </DiagramLayerList>
    </>
  );
  const inspector = frameSelected ? (
    <>
      <DiagramInspectorHeader title={t('panels:diagram.annotations.enlargedFrame', 'Enlarged frame')} detail={place} />
      <DiagramZoomControls step={step} target={FRAME_TARGET} />
    </>
  ) : selected ? (
    <SelectedAnnotation
      step={step}
      annotation={selected}
      name={names.get(selected.id) ?? annotationLabel(t, selected)}
      place={place}
      editable={editable}
      annotations={annotations}
    />
  ) : null;
  return <DiagramLayersSplit header={header} list={list} inspector={inspector} />;
}

const FRAME_TARGET = { kind: 'frame' } as const;

/**
 * An enlarged step's frame, as the first row of its list (Revision 2, Z10):
 * "Enlarged frame", and after it where it came from. Pressed, it selects the
 * frame, as a click on its boundary on the canvas does.
 */
function FrameRow({
  step,
  shape,
  selected,
  onSelect,
}: {
  step: DiagramStep;
  shape: 'circle' | 'rounded';
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const diagram = useWorkspaceStore((state) => state.diagram);
  // In the Step pane's words: the area changed, or was deleted (review fix 4).
  const area = useMemo(() => (diagram ? areaStatus(diagram, step.id) : null), [diagram, step.id]);
  return (
    <DiagramLayerRow
      glyph={<EnlargeGlyph shape={shape} />}
      name={t('panels:diagram.annotations.enlargedFrame', 'Enlarged frame')}
      note={frameSubtitle(t, area)}
      pressed={selected}
      onPress={() => onSelect(selected ? null : ZOOM_FRAME_ID)}
      data={FRAME_ROW}
    />
  );
}

const FRAME_ROW = { 'data-zoom-frame-row': '' } as const;

/**
 * A mark's row: its glyph, its name, and after it — for an enlarge area —
 * which steps were enlarged from it; greyed, saying why on hover, when it
 * lies wholly outside an enlarged step's frame; and at its end its own
 * Delete. Pressed again, it lets the mark go.
 */
function AnnotationRow({
  annotation,
  name,
  selected,
  outside,
  onSelect,
  onRemove,
}: {
  annotation: KnownDiagramAnnotation;
  name: string;
  selected: boolean;
  outside: boolean;
  onSelect: (id: string | null) => void;
  /** Its own Delete; null where the step's marks cannot change. */
  onRemove: ((id: string) => void) | null;
}) {
  const { t } = useTranslation();
  const subtitle = useAreaSubtitle(annotation.kind === 'zoom' ? annotation : null);
  return (
    <DiagramLayerRow
      glyph={
        isSolidArrow(annotation) ? (
          <SolidArrowGlyph />
        ) : annotation.kind === 'zoom' ? (
          <EnlargeGlyph shape={zoomShapeOf(annotation)} />
        ) : (
          <DiagramAnnotationGlyph kind={annotation.kind} color={annotation.color} fill={annotation.fill} />
        )
      }
      name={name}
      note={subtitle || null}
      dimmed={outside}
      title={outside ? t('panels:diagram.annotations.outsideFrame', 'Outside the enlarged frame') : undefined}
      remove={
        onRemove
          ? {
              label: t('panels:diagram.layers.deleteMark', 'Delete {{name}}', { name }),
              onRemove: () => onRemove(annotation.id),
            }
          : undefined
      }
      pressed={selected}
      onPress={() => onSelect(selected ? null : annotation.id)}
      data={outside ? OUTSIDE_ROW : undefined}
    />
  );
}

const OUTSIDE_ROW = { 'data-outside-frame': '' } as const;

/**
 * The selected annotation's inspector: its name over its step, its verbs
 * (`DiagramAnnotationToolbar`), Edit Path's node verbs, its own controls by
 * its kind, and its place in the folds.
 */
function SelectedAnnotation({
  step,
  annotation,
  name,
  place,
  editable,
  annotations,
}: {
  step: DiagramStep;
  annotation: KnownDiagramAnnotation;
  /** Its name in the list: numbered among marks of its kind. */
  name: string;
  /** Its step, and the step's instruction. */
  place: string;
  editable: boolean;
  annotations: ReturnType<typeof useStepAnnotations>;
}) {
  const { t } = useTranslation();
  const resolution = useShortcutResolution();
  const { id } = annotation;
  // A label or a callout just put down on the canvas asks for its text (D8).
  const field = useFieldFocusRequest<HTMLTextAreaElement>(id, 'text');

  const keyed = ({ label, shortcutId }: Pick<AnnotationAction, 'label' | 'shortcutId'>) => {
    const key = shortcutId ? shortcutLabelForAction(shortcutId, resolution) : undefined;
    return key ? `${label} (${key})` : label;
  };
  const nodeActions = annotations.actions.filter((action) => action.group === 'node');
  // Delete beside the mark's name, so a mark with no other verb takes no line for them (Zach, 2026-10-18).
  const remove = annotations.actions.find((action) => action.id === 'delete');
  // A star's turn, and its Rotation row: a mark with a transform box (Revision 3).
  const boxed = boxedMarkOf(annotation);
  const lineType = lineTypeOf(annotation.kind);
  const typeName = t('panels:diagram.annotations.lineType', 'Type');
  const colorName = t('panels:diagram.annotations.color', 'Color');
  const style = useWorkspaceStore((state) => state.diagram?.style ?? DEFAULT_DIAGRAM_STYLE);

  return (
    <>
      <DiagramInspectorHeader
        title={name}
        detail={place}
        action={remove ? <DiagramAnnotationIconVerb action={remove} keyed={keyed} /> : null}
      />
      <DiagramAnnotationToolbar
        label={name}
        actions={annotations.actions.filter((action) => action.group !== 'node' && action.id !== 'delete')}
        keyed={keyed}
      />
      {nodeActions.length > 0 && (
        <DiagramPathNodeControls
          actions={nodeActions}
          node={annotations.node}
          count={annotations.nodeCount}
          keyed={keyed}
        />
      )}
      {carriesText(annotation.kind) && (
        <TextAreaRow
          // One field per label or callout: a draft never carries over to the next one.
          key={id}
          label={t('panels:diagram.annotations.text', 'Text')}
          value={annotation.text ?? ''}
          rows={1}
          singleLine
          maxLength={LABEL_MAX_LENGTH}
          disabled={!editable}
          fieldRef={field}
          onEscape={annotations.finishText}
          onCommit={(text, session) => annotations.setText(id, text, session)}
        />
      )}
      {annotation.kind === 'rotate' && annotation.rotate && (
        <>
          <SegmentedRow
            label={t('panels:diagram.annotations.turn', 'Turn')}
            value={annotation.rotate.amount}
            disabled={!editable}
            options={turnAmountOptions(annotation.rotate, t)}
            onChange={(amount) => {
              // An exact angle's segment is the glyph as it is: only a preset changes it.
              const preset = TURN_ROTATION_PRESETS.find((each) => each === amount);
              if (preset) annotations.setRotation(id, withTurnPreset(annotation.rotate!, preset));
            }}
          />
          <SegmentedRow
            label={t('panels:diagram.annotations.direction', 'Direction')}
            value={annotation.rotate.direction}
            disabled={!editable}
            options={[
              { id: 'cw', label: t('panels:diagram.annotations.clockwise', 'Clockwise') },
              { id: 'ccw', label: t('panels:diagram.annotations.counterclockwise', 'Counterclockwise') },
            ]}
            onChange={(direction) =>
              annotations.setRotation(id, withTurnDirection(annotation.rotate!, direction === 'ccw' ? 'ccw' : 'cw'))
            }
          />
        </>
      )}
      {lineType !== null && (
        <FieldRow label={typeName} kind="segmented" disabled={!editable}>
          <SegmentedControl<DiagramLineType>
            size="sm"
            iconsOnly
            aria-label={typeName}
            value={lineType}
            disabled={!editable}
            options={DIAGRAM_LINE_TYPES.map((type) => ({
              value: type,
              label: lineTypeLabel(t, type),
              tooltip: lineTypeLabel(t, type),
              icon: <DiagramLineTypeMark type={type} />,
            }))}
            onChange={(type) => annotations.setLineType(id, type)}
          />
        </FieldRow>
      )}
      {carriesColor(annotation.kind) && (
        // A solid line's colour (17a), or a label's (17b): the rail's select, on the mark.
        <FieldRow label={colorName} kind="select" disabled={!editable}>
          <DiagramColorSelect
            // One per mark: a pick still under way when another is selected ends with the select, its picker closing with its input, rather than going on to recolour the next one in the same undo step.
            key={id}
            variant="row"
            label={colorName}
            value={annotation.color ?? null}
            ink={annotationInkColor(style)}
            disabled={!editable}
            onChange={(color, pick) => annotations.setColor(id, color, pick)}
          />
        </FieldRow>
      )}
      {carriesTextStyle(annotation.kind) && (
        // A label's Bold, Halo and Size (17b), under its colour.
        <DiagramTextStyleRows annotation={annotation} editable={editable} onChange={(option) => annotations.setTextStyle(id, option)} />
      )}
      {annotation.kind === 'angle-mark' && (
        <>
          <DiagramAngleMarkControls
            annotation={annotation}
            editable={editable}
            onVisible={(visible) => annotations.setAngleVisible(id, visible)}
            onRadius={(radius) => annotations.setAngleRadius(id, radius)}
          />
          <DiagramTicksRow value={annotation.ticks} disabled={!editable || !!annotation.hidden} onChange={(ticks) => annotations.setTicks(id, ticks)} />
        </>
      )}
      {annotation.kind === 'divisions' && (
        <DiagramDivisionsControls
          // One set of fields per mark, so an uncommitted draft never carries to the next selection.
          key={id}
          step={step}
          annotation={annotation}
          editable={editable}
          onParts={(parts) => annotations.setParts(id, parts)}
          onOffset={(offset) => annotations.setDivisionsOffset(id, offset)}
          onTicks={(ticks) => annotations.setTicks(id, ticks)}
          onNumbered={(numbered) => annotations.setNumbered(id, numbered)}
          onShortDividers={(short) => annotations.setShortDividers(id, short)}
        />
      )}
      {annotation.kind === 'pleat-arrow' && (
        <NumberRow
          label={t('panels:diagram.annotations.kinks', 'Kinks')}
          value={annotation.kinks ?? DEFAULT_PLEAT_KINKS}
          min={1}
          max={PLEAT_KINKS.length}
          disabled={!editable}
          normalize={pleatKinks}
          onCommit={(kinks) => annotations.setKinks(id, pleatKinks(kinks))}
        />
      )}
      {annotation.kind === 'close-up' && (
        <NumberRow
          label={t('panels:diagram.annotations.scale', 'Scale')}
          value={closeUpScale(annotation)}
          min={CLOSE_UP_SCALE.min}
          max={CLOSE_UP_SCALE.max}
          step={CLOSE_UP_SCALE_STEP}
          suffix="×"
          disabled={!editable}
          normalize={closeUpScaleWithin}
          onCommit={(scale) => annotations.setCloseUpScale(id, scale)}
        />
      )}
      {annotation.kind === 'white-arrow' && (
        <DiagramWhiteArrowControls
          annotation={annotation}
          editable={editable}
          onChange={(look) => annotations.setWhiteArrowLook(id, look)}
        />
      )}
      {annotation.kind === 'zoom' && <DiagramZoomControls step={step} target={{ kind: 'area', area: annotation }} />}
      {annotation.kind === 'x-ray' && (
        // One set of rows per X-ray, so a draft stays with its selection.
        <DiagramXRayControls key={id} step={step} annotation={annotation} />
      )}
      {annotation.kind === 'star' && (
        <DiagramStarControls annotation={annotation} editable={editable} onFill={(fill) => annotations.setStarFill(id, fill)} />
      )}
      {boxed && (
        <DiagramRotationRow degrees={boxed.degrees} editable={editable} onCommit={(degrees) => annotations.setMarkAngle(id, degrees)} />
      )}
      <DiagramBehindControls
        annotation={annotation}
        editable={editable}
        knowsFlaps={annotations.knowsFlaps}
        onEnd={(end, behind) => annotations.setBehind(id, end, behind)}
        onLayers={(layers) => annotations.setBehindLayers(id, layers)}
      />
      {annotation.kind === 'turn-over' && (
        <SegmentedRow
          label={t('panels:diagram.annotations.axis', 'Turns')}
          value={annotation.axis ?? 'vertical'}
          disabled={!editable}
          options={[
            { id: 'vertical', label: t('panels:diagram.annotations.sideToSide', 'Side to Side') },
            { id: 'horizontal', label: t('panels:diagram.annotations.topToBottom', 'Top to Bottom') },
          ]}
          onChange={(axis) => annotations.setAxis(id, axis as 'vertical' | 'horizontal')}
        />
      )}
    </>
  );
}
