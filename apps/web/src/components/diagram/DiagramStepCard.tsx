import { useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Compass,
  ImagePlus,
  Link2,
  Lock,
  PenLine,
  PenTool,
  Rotate3d,
  RotateCcwSquare,
  RotateCw,
  ScanSearch,
  Upload,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { TurnBetween } from '../../lib/steps/turn';
import { turnGlyphSvg } from '../../diagram/annotate/turnGlyph';
import {
  isLockedStep,
  isLockedTurn,
  type DiagramAsset,
  type DiagramStep,
  type DiagramStyle,
  type DiagramTurn,
} from '../../diagram/document/diagramDocument';
import { linkedSourceOf, needsPose, type DiagramLinkStatus } from '../../diagram/capture/linkStatus';
import { stepPictureSource, type StepPictureSource } from '../../diagram/pictures/paintDiagramStep';
import { useStepPictureUrl } from '../../diagram/pictures/useStepPictureUrl';
import { Button } from '../ui/Button';
import {
  StepCard,
  StepCardBadge,
  StepCardDeleteVerb,
  StepCardPlaceholder,
  StepCardVerb,
} from '../ui/steps/StepCard';
import { TurnCard } from '../ui/steps/TurnCard';
import { PatternThumbnail } from '../ui/PatternThumbnail';
import styles from './DiagramStepCard.module.css';
import { capturedStyleChange } from '../../diagram/pictures/lighting';

/**
 * One step in the Steps grid: its number and kind, its picture, and its
 * instruction, on the shared step card (`ui/steps/StepCard`).
 *
 * An empty card's Upload… and Link…, a capture's Stop, and the Adjust pose
 * and Annotate buttons over a picture are a pointer's shortcuts, hidden from
 * assistive technology and out of the tab order: the same verbs are in the
 * card's menu and the Step pane, where a keyboard and a screen reader reach
 * them. The card names itself from its number, kind, how
 * its link stands and its instruction, so a shortcut's label is not read as
 * part of it.
 *
 * A linked step — to a pattern, or to a sheet's card pulled from References —
 * shows its pattern's thumbnail beside its kind, and says over its picture
 * when the pattern has changed or gone.
 *
 * Every card a diagram can change has a Delete over its well's corner, beside
 * Adjust pose and Annotate (D24), and an empty one offers to be a turn instead
 * of a step: Turn over and Rotate, beside the ways to give it a picture.
 */
export function DiagramStepCard({
  step,
  assets,
  style,
  number,
  selected,
  tabStop,
  dropTarget,
  readOnly,
  onSelect,
  onOpen,
  onUpload,
  link,
  textCut,
  enlargedFrom,
  capture,
  patternOpen,
  onLink,
  onStop,
  onFromReferences,
  onOpenIn,
  onGoToEdit,
  onMakeTurn,
  onDelete,
}: {
  step: DiagramStep;
  assets: Readonly<Record<string, DiagramAsset>>;
  /** The pens a captured picture is painted in. */
  style: DiagramStyle;
  /** 1-based, as the page will print it. */
  number: number;
  selected: boolean;
  /** Whether this card is the grid's tab stop. */
  tabStop: boolean;
  /** A picture dragged over the grid would land on this card. */
  dropTarget: boolean;
  readOnly: boolean;
  onSelect: (stepId: string) => void;
  /** Open this step in detail. */
  onOpen: (stepId: string) => void;
  /** Pick a picture for this step. Called from the click itself. */
  onUpload: (stepId: string) => void;
  /** How the step's link stands; null for a step that is not linked. */
  link: DiagramLinkStatus | null;
  /** The pages cut the step's instruction with "…". */
  textCut: boolean;
  /**
   * An enlarged step (Revision 2): the number of the step its area is on,
   * or null once the area is gone; undefined for a step that is not enlarged.
   */
  enlargedFrom?: number | null;
  /** The step's capture while one runs, and whether its fold can be stopped. */
  capture: { stoppable: boolean } | null;
  /** A crease pattern is open to link an empty step to. */
  patternOpen: boolean;
  /** Choose a pattern for this step. */
  onLink: (stepId: string) => void;
  onStop: (stepId: string) => void;
  /** Fill this step from the References browser. */
  onFromReferences: (stepId: string) => void;
  /** Open this step in Pose or Annotate, from the buttons over its picture. */
  onOpenIn: (stepId: string, mode: 'pose' | 'annotate') => void;
  /** Go to Edit: an empty step's way to a pattern when none is open. */
  onGoToEdit: () => void;
  /** Make this empty step a turn in its place (D24). */
  onMakeTurn: (stepId: string, kind: 'turn-over' | 'rotate') => void;
  /** Delete this step, asking first when it holds work. */
  onDelete: (stepId: string) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const own = useRef<HTMLDivElement | null>(null);
  const locked = isLockedStep(step);
  const text = step.text.trim();
  const picture = stepPictureSource(step, assets);
  const url = useStepPictureUrl(own, step, assets, style);
  const linked = linkedSourceOf(step);
  const sent = linked?.kind === 'references-step';
  const restyled = capturedStyleChange(step, style);
  const chip = capture
    ? t('panels:diagram.card.capturing', 'Capturing…')
    : link === 'stale'
      ? // A step sent from References is never refreshed: its sheet changed, that is all.
        sent
        ? t('panels:diagram.card.patternChanged', 'Pattern changed')
        : needsPose(step)
          ? // Folded part way in the simulator: only Pose captures it again (D19).
            t('panels:diagram.card.stalePoseAgain', 'Out of date · Pose again')
          : t('panels:diagram.card.stale', 'Out of date')
      : link === 'missing'
        ? t('panels:diagram.card.missing', 'Pattern missing')
        : restyled === 'light'
          ? t('panels:diagram.card.lightingChanged', 'Lighting changed')
          : restyled === 'style'
            ? t('panels:diagram.card.styleChanged', 'Style changed')
            : textCut
            ? t('panels:diagram.card.textCut', 'Text doesn’t fit')
            : null;
  // A press must not take focus from the card's keys.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <StepCard
      ref={own}
      id={step.id}
      selected={selected}
      tabStop={tabStop}
      dropTarget={dropTarget}
      labelledBy={`${labelId}-number ${labelId}-kind${chip ? ` ${labelId}-chip` : ''}${enlargedFrom !== undefined ? ` ${labelId}-enlarged` : ''} ${labelId}-text`}
      title={t('panels:diagram.card.number', 'Step {{number}}', { number })}
      titleId={`${labelId}-number`}
      kind={
        <>
          {enlargedFrom !== undefined && !locked && (
            // Enlarged, and from which step's area (Revision 2): cards never draw across cards, so a chip, not
            // the arrow — in the header, beside the kind, where it covers none of the picture.
            <span className={styles.enlarged} data-enlarged-chip="">
              <ScanSearch size={11} aria-hidden="true" />
              <span id={`${labelId}-enlarged`}>
                {enlargedFrom === null
                  ? t('panels:diagram.card.enlarged', 'Enlarged')
                  : t('panels:diagram.card.enlargedFrom', 'Enlarged · {{number}}', { number: enlargedFrom })}
              </span>
            </span>
          )}
          {linked && (
            <span className={styles.pattern}>
              <PatternThumbnail thumbnail={linked.thumbnail} />
            </span>
          )}
          <StepCardBadge id={`${labelId}-kind`}>
            {locked ? t('panels:diagram.card.badgeNewer', 'Newer') : stepKindLabel(step, picture, t)}
          </StepCardBadge>
        </>
      }
      paper={picture !== null && !locked}
      verbs={
        !readOnly && (
          <>
            {!locked && (picture !== null || linked !== null) && (
              <StepCardVerb
                label={t('panels:diagram.actions.adjustPose', 'Adjust Pose')}
                onPress={() => onOpenIn(step.id, 'pose')}
              >
                <Rotate3d size={14} />
              </StepCardVerb>
            )}
            {!locked && picture !== null && (
              <StepCardVerb
                label={t('panels:diagram.actions.annotate', 'Annotate')}
                onPress={() => onOpenIn(step.id, 'annotate')}
              >
                <PenLine size={14} />
              </StepCardVerb>
            )}
            <StepCardDeleteVerb
              label={t('panels:diagram.actions.delete', 'Delete Step')}
              onDelete={() => onDelete(step.id)}
            />
          </>
        )
      }
      overlay={
        chip && (
          <span className={styles.chip} data-tone={capture ? 'progress' : 'warning'}>
            <span id={`${labelId}-chip`}>{chip}</span>
            {capture?.stoppable && (
              <button
                type="button"
                className={styles.stop}
                tabIndex={-1}
                aria-hidden="true"
                onMouseDown={keepFocus}
                onClick={(event) => {
                  event.stopPropagation();
                  onStop(step.id);
                }}
              >
                {t('panels:diagram.card.stop', 'Stop')}
              </button>
            )}
          </span>
        )
      }
      instruction={text === '' ? t('panels:diagram.card.noInstruction', 'No instruction') : text}
      instructionId={`${labelId}-text`}
      instructionEmpty={text === ''}
      onSelect={onSelect}
      onOpen={onOpen}
    >
      {locked ? (
        <StepCardPlaceholder>
          <Lock size={18} aria-hidden="true" />
          {t('panels:diagram.card.locked', 'Made with a newer Ori Studio')}
        </StepCardPlaceholder>
      ) : picture ? (
        url && <img className={styles.picture} src={url} alt="" draggable={false} decoding="async" />
      ) : linked ? (
        <StepCardPlaceholder>{t('panels:diagram.card.notCaptured', 'Not captured yet')}</StepCardPlaceholder>
      ) : (
        <StepCardPlaceholder>
          <ImagePlus size={18} aria-hidden="true" />
          {t('panels:diagram.card.noPicture', 'No picture yet')}
          {!readOnly && (
            <span className={styles.shortcuts}>
              <Button
                size="sm"
                variant="secondary"
                tabIndex={-1}
                aria-hidden="true"
                onMouseDown={keepFocus}
                onClick={() => onUpload(step.id)}
              >
                <Upload size={13} aria-hidden="true" />
                {t('panels:diagram.card.upload', 'Upload…')}
              </Button>
              {patternOpen && (
                <Button
                  size="sm"
                  variant="secondary"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    // The picker selects the step itself.
                    event.stopPropagation();
                    onLink(step.id);
                  }}
                >
                  <Link2 size={13} aria-hidden="true" />
                  {t('panels:diagram.card.link', 'Link…')}
                </Button>
              )}
              {!patternOpen && (
                <Button
                  size="sm"
                  variant="ghost"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    onGoToEdit();
                  }}
                >
                  <PenTool size={13} aria-hidden="true" />
                  {t('panels:diagram.card.goToEdit', 'Go to Edit')}
                </Button>
              )}
              {patternOpen && (
                <Button
                  size="sm"
                  variant="secondary"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    // It selects the step itself.
                    event.stopPropagation();
                    onFromReferences(step.id);
                  }}
                >
                  <Compass size={13} aria-hidden="true" />
                  {t('panels:diagram.card.fromReferences', 'References…')}
                </Button>
              )}
            </span>
          )}
          {!readOnly && (
            // Or no picture at all: the model turned over or round between two steps (D24).
            <span className={styles.turnWays}>
              <span className={styles.or}>{t('panels:diagram.card.orTurn', 'or a turn')}</span>
              <span className={styles.shortcuts}>
                <Button
                  size="sm"
                  variant="ghost"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMakeTurn(step.id, 'turn-over');
                  }}
                >
                  <RotateCcwSquare size={13} aria-hidden="true" />
                  {t('panels:diagram.card.turnOver', 'Turn over')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  tabIndex={-1}
                  aria-hidden="true"
                  onMouseDown={keepFocus}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMakeTurn(step.id, 'rotate');
                  }}
                >
                  <RotateCw size={13} aria-hidden="true" />
                  {t('panels:diagram.card.rotate', 'Rotate')}
                </Button>
              </span>
            </span>
          )}
        </StepCardPlaceholder>
      )}
    </StepCard>
  );
}

/**
 * A turn between two steps, in the Diagram's Steps grid (D24): the shared turn
 * card, its glyph drawn in the diagram's pens, as a page prints it.
 */
export function DiagramTurnCard({
  turn,
  between,
  style,
  selected,
  tabStop,
  dropTarget,
  readOnly,
  onSelect,
  onDelete,
}: {
  turn: DiagramTurn;
  /** The numbers of the steps either side; null at an end. */
  between: TurnBetween;
  /** The pens the glyph is drawn in, as a page draws it. */
  style: DiagramStyle;
  selected: boolean;
  tabStop: boolean;
  /** A picture dragged over the grid would land here: a new step after the turn. */
  dropTarget: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const locked = isLockedTurn(turn);
  const glyph = useMemo(() => {
    const svg = locked ? null : turnGlyphSvg(turn, style);
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  }, [turn, style, locked]);
  return (
    <TurnCard
      turn={turn}
      between={between}
      glyph={glyph}
      selected={selected}
      tabStop={tabStop}
      dropTarget={dropTarget}
      onSelect={onSelect}
      onDelete={readOnly ? undefined : onDelete}
    />
  );
}

/**
 * What the step is, for its badge: where a linked step comes from and how it
 * is shown, or what an upload is.
 */
function stepKindLabel(step: DiagramStep, picture: StepPictureSource | null, t: TFunction): string {
  if (step.source?.kind === 'references-step') return t('panels:diagram.card.badgeReferences', 'References');
  if (step.source?.kind === 'cp') {
    switch (step.source.render.mode) {
      case 'crease-pattern':
        return t('panels:diagram.card.badgeCreasePattern', 'Crease pattern');
      case 'folded-flat':
        return t('panels:diagram.card.badgeFolded', 'Folded');
      case 'folded-3d':
        return t('panels:diagram.card.badgeFolded3d', 'Folded · 3D');
      case 'simulated':
        return t('panels:diagram.card.badgeSimulated', 'Simulated · {{percent}}%', {
          percent: Math.round(step.source.render.foldPercent),
        });
    }
  }
  if (picture?.kind === 'asset') {
    return picture.asset.kind === 'svg'
      ? t('panels:diagram.card.badgeSvg', 'SVG')
      : t('panels:diagram.card.badgeImage', 'Image');
  }
  return t('panels:diagram.card.badgeEmpty', 'Empty');
}
