import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OristudioCpDocumentState } from '../../engine/oristudioCpTypes';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { sequenceOf, step } from '../document/foldSequence.fixtures';
import { projectCpImport } from './projectCpImport';
import { projectCpRevision } from './projectCpRevision';
import type { FoldCpJumpOp } from '../document/foldSequenceDocument';
import type { FoldImportFingerprinted } from '../engine/foldEngineIoWire';

const { exportCp } = vi.hoisted(() => ({ exportCp: vi.fn(async () => '{}') }));
vi.mock('../../store/workspaceStore/oristudioCpRuntime', () => ({ exportOristudioCpDocumentAsFold: exportCp }));
const initial = useWorkspaceStore.getState();
afterEach(() => { useWorkspaceStore.setState(initial, true); vi.clearAllMocks(); });
function source() {
  return { loadSerial: 1, document: { crease_pattern: {
    line_segments: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, color: 'Red1', selected: 0 }],
    aux_line_segments: [],
  } } } as unknown as OristudioCpDocumentState;
}
describe('project CP snapshots', () => {
  it('ignores selection and line order, but notices geometry, assignment and guide edits', () => {
    const cp = source().document;
    const revision = projectCpRevision(cp);
    const selected = structuredClone(cp);
    selected.crease_pattern.line_segments[0]!.selected = 2;
    expect(projectCpRevision(selected)).toBe(revision);
    selected.crease_pattern.line_segments[0]!.color = 'Blue2';
    expect(projectCpRevision(selected)).not.toBe(revision);
    selected.crease_pattern.line_segments[0]!.color = 'Red1';
    selected.crease_pattern.line_segments[0]!.a.x = .1;
    expect(projectCpRevision(selected)).not.toBe(revision);
    selected.crease_pattern.aux_line_segments.push(selected.crease_pattern.line_segments[0]!);
    expect(projectCpRevision(selected)).not.toBe(projectCpRevision(cp));
  });
  it('accepts an unchanged update without an undo edit, and rejects an outlived capture', async () => {
    const cp = source();
    const op: FoldCpJumpOp = { kind: 'cp-jump', origin: 'project_cp', cpJson: '{}', orderJson: '[]',
      source: { documentId: 'crease-pattern', revision: projectCpRevision(cp.document) } };
    const document = sequenceOf([step('collapse', null, op, { expect: 'fs1:1111111111111111' })]);
    useWorkspaceStore.setState({ oristudioCpDocument: cp, foldSequences: [{ document, readOnlyRaw: null }] });
    const capture = await projectCpImport('collapse');
    expect(capture?.source).toEqual({ format: 'fold', text: '{}' });
    const landed = { op, fingerprint: 'fs1:1111111111111111' } as unknown as FoldImportFingerprinted;
    expect(capture?.replace?.(landed)).toBe(true);
    expect(useWorkspaceStore.getState().foldSequences[0]!.document).toBe(document);
    useWorkspaceStore.setState({ projectLoadId: initial.projectLoadId + 1 });
    expect(capture?.replace?.(landed)).toBe(false);
  });
  it('refuses a CP that changed while its snapshot was being exported', async () => {
    const cp = source();
    useWorkspaceStore.setState({ oristudioCpDocument: cp });
    exportCp.mockImplementationOnce(async () => {
      const changed = structuredClone(cp);
      changed.document.crease_pattern.line_segments[0]!.color = 'Blue2';
      useWorkspaceStore.setState({ oristudioCpDocument: changed });
      return '{}';
    });
    expect(await projectCpImport()).toBeNull();
  });
});
