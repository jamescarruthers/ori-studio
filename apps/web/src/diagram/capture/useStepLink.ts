import { useCallback, useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { isLockedStep, type DiagramShowAs, type DiagramStep } from '../document/diagramDocument';
import type { DiagramLinkStatus } from './linkStatus';
import { linkDiagramStep, pickerShowAs } from './stepCaptureActions';
import {
  linkedSheet,
  useDiagramPatternSheets,
  type DiagramPatternSheet,
  type DiagramPatternSheets,
} from './useDiagramPatternSheets';
import { useDiagramLinkStatuses } from './useLinkStatus';

const NO_STEPS: readonly DiagramStep[] = [];

export interface DiagramStepLink {
  /** How the step's link stands; null for a step that is not linked. */
  link: DiagramLinkStatus | null;
  patternOpen: boolean;
  /** The step's capture while one runs, and its Stop when its fold can be stopped. */
  capture: { stop: (() => void) | null } | null;
  /**
   * The pattern picker, while the step's pattern is being chosen — always, for
   * an empty step; null otherwise.
   */
  picker: {
    sheets: DiagramPatternSheets;
    selectedId: number | null;
    busy: boolean;
    /** How the step will show the pattern it links to (D19). */
    showAs: DiagramShowAs;
    setShowAs: (way: DiagramShowAs) => void;
    pick: (sheet: DiagramPatternSheet) => void;
    /** Null for an empty step's, which stays: there is nothing to go back to. */
    cancel: (() => void) | null;
  } | null;
}

/**
 * A step's link to the crease pattern, bound to the store, for the Step pane's
 * Picture section: how it stands, its capture with a Stop, the pattern picker
 * while its pattern is being chosen. An empty step's pattern is always being
 * chosen: its picker stands open, with no Link Pattern… to press first.
 */
export function useDiagramStepLink(step: DiagramStep | null): DiagramStepLink {
  const stepId = step?.id ?? null;
  const statuses = useDiagramLinkStatuses(step ? [step] : NO_STEPS);
  const link = (stepId !== null ? statuses.get(stepId) : undefined) ?? null;
  const patternOpen = useWorkspaceStore((state) => state.oristudioCpDocument !== null);
  const runId = useWorkspaceStore((state) =>
    stepId !== null && Object.hasOwn(state.diagramCaptures, stepId)
      ? (state.diagramCaptures[stepId]?.runId ?? null)
      : undefined
  );
  const stoppable = useWorkspaceStore(
    (state) => runId != null && state.oristudioCpFoldRuns[runId]?.cancellable === true
  );
  const capturing = runId !== undefined;
  const readOnly = useWorkspaceStore((state) => state.diagramReadOnly);
  const empty = step !== null && step.source === null && step.picture === null;
  // A link made from an empty step's picker keeps it, busy, until the capture
  // ends — not only until the picture lands, a moment before, while Relink
  // Pattern… still waits for it: the focus goes back to that verb as it closes.
  const [linking, setLinking] = useState<string | null>(null);
  if (empty && capturing && linking !== stepId) setLinking(stepId);
  if (!capturing && linking !== null) setLinking(null);
  const standing =
    step !== null && !readOnly && !isLockedStep(step) && (empty || (capturing && linking === stepId));
  const opened = useWorkspaceStore((state) => stepId !== null && state.diagramPatternPicker === stepId);
  const pickerOpen = opened || standing;
  const sheets = useDiagramPatternSheets(pickerOpen);

  // The way the picker links in: the step's own, or the nearest linked step's
  // before it, or the session's last (`pickerShowAs`), until the reader picks
  // another — and again from those each time it opens, so a way picked for
  // one link is forgotten when the picker closes, whatever closed it (a link,
  // Cancel, another step selected).
  const [chosen, setChosen] = useState<{ stepId: string; way: DiagramShowAs } | null>(null);
  if (!pickerOpen && chosen !== null) setChosen(null);
  const offered = useWorkspaceStore((state) => pickerShowAs(state.diagram, step));
  const showAs = chosen && chosen.stepId === stepId && pickerOpen ? chosen.way : offered;
  const setShowAs = useCallback(
    (way: DiagramShowAs) => {
      if (stepId !== null) setChosen({ stepId, way });
    },
    [stepId]
  );

  const stop = useCallback(() => {
    if (stepId !== null) useWorkspaceStore.getState().stopDiagramCapture(stepId);
  }, [stepId]);
  const pick = useCallback(
    (sheet: DiagramPatternSheet) => {
      if (stepId !== null) void linkDiagramStep(stepId, sheet.sheet, showAs);
    },
    [stepId, showAs]
  );
  const cancel = useCallback(() => {
    useWorkspaceStore.getState().closeDiagramPatternPicker();
  }, []);

  const cpDocument =useWorkspaceStore((state) => state.oristudioCpDocument?.document ?? null);
  const selectedId = useMemo(
    () =>
      step && sheets.status === 'ready'
        ? (linkedSheet(step, sheets.sheets, cpDocument, sheets.index)?.sheet.id ?? null)
        : null,
    [step, sheets, cpDocument]
  );
  return {
    link,
    patternOpen,
    capture: capturing ? { stop: stoppable ? stop : null } : null,
    picker: pickerOpen
      ? { sheets, selectedId, busy: capturing, showAs, setShowAs, pick, cancel: standing ? null : cancel }
      : null,
  };
}
