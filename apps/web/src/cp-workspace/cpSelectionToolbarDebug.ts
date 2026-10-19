import { useWorkspaceStore } from '../store/workspaceStore/store';
import { ensureCpSheetIndex } from './sheets/cpSheetIndex';
import { explainSelectedSheet } from './sheets/selectedSheet';
import { cpOverlayViewStore } from './cpOverlayViewStore';

/**
 * Last render state published by the toolbar. A correct match still renders
 * nothing if the component never mounts (the panel gates it) or if the floating
 * anchor cannot be computed, so matching alone does not explain visibility.
 * `renders === 0` means the component never mounted at all.
 */
export const toolbarRenderProbe = {
  renders: 0,
  hasMatch: false,
  hasContainer: false,
  hasBox: false,
  hasAnchorRect: false,
  hasSheetIndex: false,
};

/**
 * Dev-only console hook: `await __cpToolbarDebug()`.
 *
 * The selection toolbar renders nothing whenever the selection does not resolve
 * to exactly one sheet, and every distinct rejection reason looks the same from
 * the outside. This reports which precondition failed and how far each sheet
 * the selection touches was from being selected whole.
 */
declare global {
  var __cpToolbarDebug: (() => Promise<unknown>) | undefined;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  globalThis.__cpToolbarDebug = async () => {
    const state = useWorkspaceStore.getState();
    const document = state.oristudioCpDocument?.document ?? null;
    const started = performance.now();
    const index = await ensureCpSheetIndex(document);
    const elapsedMs = Math.round(performance.now() - started);
    const diagnosis = explainSelectedSheet(index, state.oristudioCpSelection.lines);
    const report = {
      ...diagnosis,
      sheetIndexMs: elapsedMs,
      render: { ...toolbarRenderProbe },
      foldArtifactRevision: state.foldArtifactRevision,
      overlayViews: cpOverlayViewStore.get() !== null,
      toolbarInDom: typeof globalThis.document !== 'undefined'
        ? globalThis.document.querySelector('.cp-selection-toolbar') !== null
        : false,
    };

    // The closest sheet is the actionable one; the rest are noise in a document
    // with many sheets, so surface it separately from the full report.
    const closest = diagnosis.touched[0];
    console.log('[cp-toolbar]', report.reason, closest ? { closest } : '', report);
    return report;
  };
}

export {};
