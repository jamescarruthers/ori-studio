import { describe, expect, it } from 'vitest';
import { createDiagram } from '../../diagram/document/diagramDocument';
import { DIAGRAM_SCOPED_KEYS, discardDiagramState } from './diagramState';
import {
  discardProjectDocuments,
  hasProjectDocument,
  projectDocumentDataBytes,
  projectDocumentFileValues,
  projectDocumentLanding,
  projectDocumentsChangedSince,
  readProjectDocuments,
} from './projectDocuments';
import type { WorkspaceState } from './types';

/** The store as far as the registry reads it: the diagram's scoped state, nothing else. */
const store = (patch: Partial<WorkspaceState> = {}) => ({ ...discardDiagramState(), ...patch }) as WorkspaceState;

describe('the project-document registry', () => {
  it('discards every key scoped to the diagram, with a fresh load id', () => {
    const before = store();
    const discarded = discardProjectDocuments();
    for (const key of DIAGRAM_SCOPED_KEYS) {
      if (key === 'diagramLoadId') continue;
      expect(discarded[key], key).toEqual(before[key]);
    }
    expect(discarded.diagramLoadId).not.toBe(before.diagramLoadId);
  });

  it('finds nothing in a project without a diagram, and writes none', () => {
    expect(hasProjectDocument(store())).toBe(false);
    expect(projectDocumentLanding(store())).toBeNull();
    expect(projectDocumentFileValues(store())).toEqual({ diagram: null });
    expect(projectDocumentDataBytes(store())).toBe(0);
  });

  it('finds a diagram, lands on it, and writes back a read-only one as it came', () => {
    const diagram = createDiagram();
    const raw = { formatVersion: 99, id: diagram.id };
    const state = store({ diagram, diagramReadOnly: true, diagramRaw: raw });

    expect(hasProjectDocument(state)).toBe(true);
    expect(projectDocumentLanding(state)).toBe('diagram');
    expect(projectDocumentFileValues(state)).toEqual({ diagram: raw });
  });

  it('tells a save whether the diagram changed while it was writing', () => {
    const written = store({ diagram: createDiagram() });
    // Anything else may change; an edit replaces the diagram, and that is what counts.
    expect(projectDocumentsChangedSince(written, { ...written, dirty: true })).toBe(false);
    expect(projectDocumentsChangedSince(written, { ...written, diagram: createDiagram() })).toBe(true);
    expect(projectDocumentsChangedSince(written, { ...written, diagram: null })).toBe(true);
  });

  it('reads what a file carries, and installs it on demand', () => {
    const none = readProjectDocuments({ diagram: null } as never);
    expect(none.present).toBe(false);

    const installed: unknown[] = [];
    const get = () => ({ installDiagram: (read: unknown) => installed.push(read) }) as unknown as WorkspaceState;
    const some = readProjectDocuments({ diagram: { id: 'diagram-1', steps: [] } } as never);
    expect(some.present).toBe(true);
    expect(installed).toEqual([]);
    some.install(get);
    expect(installed).toEqual([expect.objectContaining({ readOnly: false, document: expect.objectContaining({ id: 'diagram-1' }) })]);
  });
});
