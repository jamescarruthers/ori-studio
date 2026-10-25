import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { OristudioCpFoldedFigureEntry } from '../../engine/oristudioCpTypes';
import { DEFAULT_PAPER_STYLE, applyCreaseStyle } from '../../lib/paper/paperStyle';
import { PAPER_STYLE_POLICIES } from '../../lib/paper/paperStyleResolve';
import type { PropertyField, PropertySheet, StepperField } from '../../lib/propertyDescriptors';
import { FIGURE } from '../canvasObjects/canvasObjectKinds.fixtures';
import { DEFAULT_FOLDED_3D_CAMERA, type FoldedFigureCamera } from './folded3dCamera';
import { buildFoldedFigureProperties, type FoldedFigurePropertyDeps } from './foldedFigureProperties';

// Identity `t`, with its interpolations: the readout's number and total.
const t = ((_key: string, fallback: string | object, options?: Record<string, unknown>) =>
  typeof fallback === 'string'
    ? fallback.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(options?.[name] ?? ''))
    : '') as unknown as TFunction;

const MODEL = {
  state: 'Front0',
  front_color: { red: 255, green: 255, blue: 50 },
  back_color: { red: 233, green: 233, blue: 233 },
  line_color: { red: 0, green: 0, blue: 0 },
  display_shadows: false,
  anti_alias: true,
} as unknown as NonNullable<OristudioCpFoldedFigureEntry['snapshot']>['model'];

const FLAT: OristudioCpFoldedFigureEntry = {
  ...FIGURE,
  title: 'Folded model 1',
  status: 'ready',
  handle: 3,
  snapshot: {
    model: MODEL,
    find_another_overlap_valid: true,
    discovered_fold_cases: 3,
    current_fold_case: 2,
  } as OristudioCpFoldedFigureEntry['snapshot'],
  placement: { offset: { x: 0, y: 0 }, scale: 1.5, rotation: Math.PI / 2 },
};

const SPATIAL: OristudioCpFoldedFigureEntry = {
  ...FIGURE,
  id: 'figure-3d',
  title: 'Folded model 2',
  status: 'ready',
  handle: 4,
  snapshot: null,
  folded3d: {
    model: MODEL,
    verdict: { verdict: 'folded' },
    current_fold_case: 1,
    discovered_fold_cases: 1,
  } as unknown as OristudioCpFoldedFigureEntry['folded3d'],
  camera: { yaw: Math.PI / 2, pitch: -0.5, zoom: 2, orient: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
};

function deps(
  overrides: Partial<FoldedFigurePropertyDeps> = {},
  camera: FoldedFigureCamera = SPATIAL.camera as FoldedFigureCamera
): FoldedFigurePropertyDeps {
  return {
    t,
    stale: false,
    held: false,
    begin: vi.fn(() => true),
    end: vi.fn(),
    commitModel: vi.fn(),
    style: DEFAULT_PAPER_STYLE,
    inherited: DEFAULT_PAPER_STYLE,
    overrides: undefined,
    writeOverride: vi.fn(),
    commitOverrides: vi.fn(),
    setDisplayStyle: vi.fn(),
    setCamera: vi.fn(),
    liveCamera: { read: () => camera, subscribe: () => () => {} },
    setPlacement: vi.fn(),
    foldAnother: vi.fn(),
    foldPrevious: vi.fn(),
    exportFigure: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function stepper(sheet: PropertySheet): StepperField {
  const found = field(sheet, 'layerOrder');
  if (found.kind !== 'stepper') throw new Error('stepper');
  return found;
}

function sheetFor(figure: OristudioCpFoldedFigureEntry, d = deps()): PropertySheet {
  return buildFoldedFigureProperties({ kind: 'folded-figure', id: figure.id, figure }, d);
}

function field(sheet: PropertySheet, id: string): PropertyField {
  const found = sheet.sections.flatMap((section) => section.fields).find((f) => f.id === id);
  if (!found) throw new Error(`no field ${id}`);
  return found;
}

const visibleIds = (sheet: PropertySheet) =>
  sheet.sections.flatMap((s) => s.fields.filter((f) => f.support !== 'not-applicable').map((f) => f.id));

describe('buildFoldedFigureProperties', () => {
  it('titles the sheet with the figure, and a state under it only when it has one', () => {
    const sheet = sheetFor(FLAT);
    expect(sheet).toMatchObject({
      kind: 'folded-figure',
      targetId: FLAT.id,
      title: 'Folded model 1',
      icon: 'folded-figure',
    });
    // Which solution it shows is the Layer order row's to say (D11).
    expect(sheet.subtitle).toBeUndefined();
    expect(sheetFor(FLAT, deps({ stale: true })).subtitle).toBe('Stale');
  });

  it('lays a flat figure out as the Step pane: Render as, Pose, Appearance, Placement', () => {
    const sheet = sheetFor(FLAT);
    expect(sheet.sections.map((s) => s.id)).toEqual(['render', 'pose', 'appearance', 'placement']);
    // Render as heads the pane untitled, over a control across it.
    expect(sheet.sections[0]?.title).toBeUndefined();
    expect(field(sheet, 'displayStyle')).toMatchObject({ kind: 'segmented', layout: 'stacked' });
    expect(sheet.sections[1]).toMatchObject({ title: 'Pose', spaced: true });
    expect(visibleIds(sheet)).toEqual([
      'displayStyle',
      'rotation',
      'side',
      'layerOrder',
      'frontColor',
      'backColor',
      'lineColor',
      'shadows',
      'auxVisible',
      'auxColor',
      'auxWidth',
      'erode',
      'scale',
    ]);
    for (const f of sheet.sections.flatMap((s) => s.fields)) {
      expect(f.support, f.id).toBe('supported');
    }
  });

  it('puts the toolbar’s Export…, Duplicate and Delete in the header, calling what the toolbar calls', () => {
    const d = deps();
    const sheet = sheetFor(FLAT, d);
    expect(sheet.actions?.map(({ id, label, icon, disabled }) => ({ id, label, icon, disabled }))).toEqual([
      { id: 'export', label: 'Export…', icon: 'export', disabled: true },
      { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', disabled: false },
      { id: 'delete', label: 'Delete', icon: 'delete', disabled: false },
    ]);
    for (const action of sheet.actions ?? []) action.run();
    expect(d.exportFigure).toHaveBeenCalledWith(FLAT);
    expect(d.duplicate).toHaveBeenCalledWith(FLAT);
    expect(d.remove).toHaveBeenCalledWith(FLAT);
  });

  it('steps a flat figure through its layer orders with ‹ and ›, read out as the Diagram reads them', () => {
    const d = deps();
    const layerOrder = stepper(sheetFor(FLAT, d));
    expect(layerOrder).toMatchObject({ label: 'Layer order', support: 'supported', value: '2 of 3+' });
    expect(layerOrder.note).toBeUndefined();
    expect(layerOrder.previous).toMatchObject({ label: 'Previous solution', disabled: false });
    expect(layerOrder.next).toMatchObject({ label: 'Another solution', disabled: false });
    layerOrder.previous.run();
    expect(d.foldPrevious).toHaveBeenCalledWith(FLAT);
    layerOrder.next.run();
    expect(d.foldAnother).toHaveBeenCalledWith(FLAT);

    // The first can go no further back, and says so.
    const first = { ...FLAT, snapshot: { ...FLAT.snapshot!, current_fold_case: 1 } };
    expect(stepper(sheetFor(first)).previous).toMatchObject({
      disabled: true,
      hint: 'This is its first solution',
    });
  });

  it('keeps what the search found past a step back, for the handle it found it on', () => {
    // Back on the first after a restart, which forgot the five found before.
    const restarted = {
      ...FLAT,
      snapshot: {
        ...FLAT.snapshot!,
        discovered_fold_cases: 1,
        current_fold_case: 1,
        find_another_overlap_valid: true,
      },
    };
    expect(stepper(sheetFor({ ...restarted, solutionFrontier: { handle: 3, cases: 5, complete: true } })).value).toBe(
      '1 of 5'
    );
    // Refolded since, on another handle: what was found then says nothing now.
    expect(stepper(sheetFor({ ...restarted, solutionFrontier: { handle: 9, cases: 5, complete: true } })).value).toBe(
      '1 of 1+'
    );
  });

  it('says why a figure whose fold found no layer order has none to step through', () => {
    const none = {
      ...FLAT,
      displayStyle: 'Transparent3',
      snapshot: {
        ...FLAT.snapshot!,
        discovered_fold_cases: 0,
        current_fold_case: 0,
        find_another_overlap_valid: false,
      },
    } as OristudioCpFoldedFigureEntry;
    const sheet = sheetFor(none);
    expect(stepper(sheet)).toMatchObject({
      support: 'unsupported',
      reason: 'Layer order couldn’t be determined for this figure.',
      note: 'Layer order couldn’t be determined for this figure.',
      value: 'None',
    });
    // Drawn see-through, and Render as says so.
    expect(field(sheet, 'displayStyle').value).toBe('Transparent3');
  });

  it('pins every style field its surface policy applies, on both kinds', () => {
    // The Properties sheet shows exactly the policy's `applies` (§5 of the
    // paper style plan): what the user can pin and what the renderer honours
    // are one list. The kernel model's colours reach it through the same pins.
    for (const [figure, surface] of [
      [FLAT, 'folded-flat'],
      [SPATIAL, 'folded-3d'],
    ] as const) {
      const written = new Set<string>();
      const d = deps({
        writeOverride: vi.fn((f: string) => written.add(f)),
        commitOverrides: vi.fn((edits: readonly { field: string }[]) =>
          edits.forEach((edit) => written.add(edit.field))
        ),
      });
      for (const f of sheetFor(figure, d).sections.flatMap((s) => s.fields)) {
        if (f.undoLabel !== 'Change paper style') continue;
        if (f.kind === 'color') f.update('#123456');
        else if (f.kind === 'toggle') f.commit(false);
        else if (f.kind === 'number') f.commit(1);
      }
      expect([...written].sort(), surface).toEqual([...PAPER_STYLE_POLICIES[surface].applies].sort());
    }
  });

  it('disables side with its reason on a 3D figure, offers its light, and adds the camera', () => {
    const sheet = sheetFor(SPATIAL);
    expect(sheet.sections.map((s) => s.id)).toEqual(['render', 'pose', 'camera', 'appearance', 'placement']);
    // Its pose is its camera: its turn on the page stays with where it sits.
    expect(sheet.sections.find((s) => s.id === 'pose')?.fields.map((f) => f.id)).toEqual(['side', 'layerOrder']);
    expect(sheet.sections.find((s) => s.id === 'placement')?.fields.map((f) => f.id)).toEqual(['scale', 'rotation']);
    // Shown disabled, with the Style menu's own hint: a control that vanished
    // between figure kinds would read as a bug.
    expect(field(sheet, 'side')).toMatchObject({
      support: 'unsupported',
      reason: 'Turn a 3D model with Other side',
    });
    expect(visibleIds(sheet)).toContain('side');
    // Re-pinned for D7: the shadow is the flat figure's own option and is not
    // offered on a 3D figure at all (it used to be offered disabled); the 3D
    // figure has the paper style's light instead, as its policy applies it.
    expect(visibleIds(sheet)).not.toContain('shadows');
    expect(visibleIds(sheet)).toContain('lighting');
    // Not the fold pens: both folded figures draw every fold as an edge
    // (D6, Phase 9), so neither offers the simulator's fold controls.
    for (const id of ['foldsAsEdges', 'creaseStyle', 'mountainColor', 'valleyColor']) {
      expect(visibleIds(sheet)).not.toContain(id);
      expect(visibleIds(sheetFor(FLAT))).not.toContain(id);
    }
    expect(field(sheet, 'lighting')).toMatchObject({ support: 'supported', value: true });
    expect(field(sheet, 'frontColor').support).toBe('supported');
    expect(visibleIds(sheetFor(FLAT))).not.toContain('lighting');
  });

  it('steps an unconstrained 3D figure on as its toolbar does, and holds ‹, which has nowhere to go in 3D', () => {
    const d = deps();
    const several = {
      ...SPATIAL,
      folded3d: { ...SPATIAL.folded3d!, find_another_overlap_valid: true, discovered_fold_cases: 2, current_fold_case: 2 },
    } as OristudioCpFoldedFigureEntry;
    const layerOrder = stepper(sheetFor(several, d));
    expect(layerOrder).toMatchObject({ support: 'supported', value: '2 of 2+' });
    expect(layerOrder.previous).toMatchObject({
      disabled: true,
      hint: 'Stepping back works on flat figures',
    });
    expect(layerOrder.next.disabled).toBe(false);
    layerOrder.next.run();
    expect(d.foldAnother).toHaveBeenCalledWith(several);
    // One solution: the toolbar's Another solution is held too, and says why here.
    expect(stepper(sheetFor(SPATIAL)).next).toMatchObject({
      disabled: true,
      hint: 'This figure has one solution',
    });
  });

  it('disables every appearance field with the Refold reason on a figure that is not ready', () => {
    const sheet = sheetFor(FIGURE);
    const held = sheet.sections.filter((s) => ['render', 'pose', 'appearance'].includes(s.id));
    for (const f of held.flatMap((s) => s.fields)) {
      // A flat figure's turn is where it sits on the page, and stays editable.
      if (f.support === 'not-applicable' || f.id === 'rotation') continue;
      expect(f.support, f.id).toBe('unsupported');
      expect(f.reason, f.id).toBe('Refold to change how this figure looks');
    }
    // Placement is where the figure sits, and moving a reopened figure is fine.
    expect(field(sheet, 'scale').support).toBe('supported');
    expect(field(sheet, 'rotation').support).toBe('supported');
    // Still folding: nothing to read out yet.
    expect(stepper(sheet).value).toBe('');
    expect(sheet.subtitle).toBe('Folding…');
  });

  it('routes the discrete appearance fields through one-entry setters', () => {
    const d = deps();
    const sheet = sheetFor(FLAT, d);
    const style = field(sheet, 'displayStyle');
    if (style.kind !== 'segmented') throw new Error('segmented');
    // The kind's choices in the Style menu's order and words.
    expect(style.options.map((o) => o.label)).toEqual(['Paper', 'Wireframe', 'X-ray']);
    style.commit('Wire2');
    expect(d.setDisplayStyle).toHaveBeenCalledWith('Wire2');

    const side = field(sheet, 'side');
    if (side.kind !== 'segmented') throw new Error('segmented');
    expect(side.value).toBe('Front0');
    expect(side.options.map((o) => o.label)).toEqual(['Front', 'Back']);
    side.commit('Back1');
    expect(d.commitModel).toHaveBeenCalledWith({ state: 'Back1' });

    const shadows = field(sheet, 'shadows');
    if (shadows.kind !== 'toggle') throw new Error('toggle');
    shadows.commit(true);
    expect(d.commitModel).toHaveBeenCalledWith({ display_shadows: true });
  });

  it('moves no control off what it called: each moved row dispatches as it did, under the same label', () => {
    // What each did before the pane took the Step pane's layout, from the
    // catalog as it stood (Render as a select in Appearance, Side in
    // Appearance, Rotation in Placement): the same field id, the same undo
    // label, the same call with the same arguments.
    const BEFORE: Record<string, { undoLabel: string; drive: (f: PropertyField) => void; call: [string, unknown[]] }> = {
      displayStyle: {
        undoLabel: 'Change folded display style',
        drive: (f) => f.kind === 'segmented' && f.commit('Transparent3'),
        call: ['setDisplayStyle', ['Transparent3']],
      },
      side: {
        undoLabel: 'Change folded model',
        drive: (f) => f.kind === 'segmented' && f.commit('Back1'),
        call: ['commitModel', [{ state: 'Back1' }]],
      },
      rotation: {
        undoLabel: 'Rotate folded form',
        drive: (f) => f.kind === 'number' && f.commit(180),
        call: ['setPlacement', [{ rotation: Math.PI }, 'Rotate folded form']],
      },
    };
    for (const figure of [FLAT, SPATIAL]) {
      for (const [id, expected] of Object.entries(BEFORE)) {
        const d = deps();
        const found = field(sheetFor(figure, d), id);
        expect(found.undoLabel, id).toBe(expected.undoLabel);
        expected.drive(found);
        const [name, args] = expected.call;
        // Side is held on a 3D figure (its reason above); the call is the flat figure's.
        if (id === 'side' && figure === SPATIAL) continue;
        expect(d[name as keyof FoldedFigurePropertyDeps], `${figure.id} ${id}`).toHaveBeenCalledWith(...args);
      }
    }
  });

  it('marks neither side current for a figure in an overlay state', () => {
    const overlay = {
      ...FLAT,
      snapshot: { ...FLAT.snapshot, model: { ...MODEL, state: 'Both2' } },
    } as OristudioCpFoldedFigureEntry;
    const side = field(sheetFor(overlay), 'side');
    expect(side.kind === 'segmented' && side.value).toBeNull();
  });

  it('runs a colour pick as begin once, pins per move, end once', () => {
    // Re-pinned for the paper style (Phase 1): a colour row edits the figure's
    // own pin on that style field, not the kernel model; the model follows
    // through the mirror.
    const d = deps();
    const front = field(sheetFor(FLAT, d), 'frontColor');
    if (front.kind !== 'color') throw new Error('color');
    expect(front.value).toBe('#ffff32');
    expect(front.held).toBe(false);
    expect(front.begin()).toBe(true);
    expect(d.begin).toHaveBeenCalledWith('frontColor');
    front.update('#ff0000');
    expect(d.writeOverride).toHaveBeenCalledWith('paper.front', '#ff0000');
    front.end();
    expect(d.end).toHaveBeenCalledWith('Change paper style');
    expect(d.commitModel).not.toHaveBeenCalled();
  });

  it('shows the effective style, and pins the edge pen whole for the line colour', () => {
    const d = deps({
      style: {
        ...DEFAULT_PAPER_STYLE,
        paper: { front: '#112233', back: '#445566' },
        edges: { ...DEFAULT_PAPER_STYLE.edges, width: 2, color: '#778899' },
      },
    });
    const sheet = sheetFor(FLAT, d);
    expect(['frontColor', 'backColor', 'lineColor'].map((id) => field(sheet, id).value)).toEqual([
      '#112233',
      '#445566',
      '#778899',
    ]);
    const line = field(sheet, 'lineColor');
    if (line.kind !== 'color') throw new Error('color');
    line.update('#000000');
    expect(d.writeOverride).toHaveBeenCalledWith('edges', {
      ...DEFAULT_PAPER_STYLE.edges,
      width: 2,
      color: '#000000',
    });
  });

  it('pins the edge pen alone with a new line ink, on either figure', () => {
    // Re-pinned for Phase 9: the 3D figure used to draw M/V in the fold pens,
    // so under a mono style its line colour carried onto them. Both folded
    // figures now draw every fold as an edge and read no fold pen, so the
    // line colour is the edge pen and nothing else — under any crease style.
    const mono = applyCreaseStyle(DEFAULT_PAPER_STYLE, 'mono-dashed');
    for (const figure of [SPATIAL, FLAT]) {
      const d = deps({ style: mono });
      const line = field(sheetFor(figure, d), 'lineColor');
      if (line.kind !== 'color') throw new Error('color');
      line.update('#333333');
      expect(d.writeOverride).toHaveBeenCalledTimes(1);
      expect(d.writeOverride).toHaveBeenCalledWith('edges', { ...mono.edges, color: '#333333' });
    }
  });

  it('offers reset only while the row is pinned, and a reset clears the pin as one entry', () => {
    const d = deps({
      overrides: { 'paper.front': '#ff0000', light: { ...DEFAULT_PAPER_STYLE.light, enabled: false } },
    });
    const sheet = sheetFor(SPATIAL, d);
    expect(field(sheet, 'frontColor').reset).toBeDefined();
    expect(field(sheet, 'backColor').reset).toBeUndefined();
    expect(field(sheet, 'lineColor').reset).toBeUndefined();
    field(sheet, 'frontColor').reset?.();
    expect(d.commitOverrides).toHaveBeenCalledWith([{ field: 'paper.front', value: undefined }]);
    field(sheet, 'lighting').reset?.();
    expect(d.commitOverrides).toHaveBeenLastCalledWith([{ field: 'light', value: undefined }]);
  });

  it('toggles the 3D figure’s light as a pin', () => {
    const d = deps();
    const light = field(sheetFor(SPATIAL, d), 'lighting');
    if (light.kind !== 'toggle') throw new Error('toggle');
    light.commit(false);
    expect(d.commitOverrides).toHaveBeenCalledWith([
      { field: 'light', value: { ...DEFAULT_PAPER_STYLE.light, enabled: false } },
    ]);
  });

  it('names the display style’s value as what each paper toggle inherits, not the pin’s', () => {
    const display = {
      ...DEFAULT_PAPER_STYLE,
      auxCreases: { ...DEFAULT_PAPER_STYLE.auxCreases, visible: false },
    };
    const sheet = sheetFor(
      SPATIAL,
      deps({
        style: { ...display, light: { ...display.light, enabled: false } },
        inherited: display,
        overrides: { light: { ...display.light, enabled: false } },
      })
    );
    const inheritedOf = (id: string) => {
      const found = field(sheet, id);
      if (found.kind !== 'toggle') throw new Error('toggle');
      return found.inherited;
    };
    expect(field(sheet, 'lighting').value).toBe(false);
    expect(inheritedOf('lighting')).toBe(true);
    expect(inheritedOf('auxVisible')).toBe(false);
  });

  it('reports the layer as held on every colour row', () => {
    const sheet = sheetFor(FLAT, deps({ held: true }));
    for (const id of ['frontColor', 'backColor', 'lineColor']) {
      const f = field(sheet, id);
      expect(f.kind === 'color' && f.held).toBe(true);
    }
  });

  it('edits the camera in degrees over the live camera, keeping orient', () => {
    const d = deps();
    const sheet = sheetFor(SPATIAL, d);
    const yaw = field(sheet, 'yaw');
    if (yaw.kind !== 'number') throw new Error('number');
    expect(yaw.value).toBe(90);
    expect(yaw.live?.read()).toBe(90);
    expect(yaw.suffix).toBe('°');
    yaw.commit(180);
    expect(d.setCamera).toHaveBeenCalledWith({
      yaw: Math.PI,
      pitch: -0.5,
      zoom: 2,
      orient: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });

    const pitch = field(sheet, 'pitch');
    if (pitch.kind !== 'number') throw new Error('number');
    expect(pitch.value).toBeCloseTo(-28.65, 1);
  });

  it('resets one camera axis to the fold view and leaves the rest', () => {
    const d = deps();
    const yaw = field(sheetFor(SPATIAL, d), 'yaw');
    yaw.reset?.();
    expect(d.setCamera).toHaveBeenCalledWith({
      yaw: DEFAULT_FOLDED_3D_CAMERA.yaw,
      pitch: -0.5,
      zoom: 2,
      orient: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
  });

  it('clamps zoom to the simulator range', () => {
    const d = deps();
    const zoom = field(sheetFor(SPATIAL, d), 'zoom');
    if (zoom.kind !== 'number') throw new Error('number');
    expect(zoom).toMatchObject({ min: 0.45, max: 4, step: 0.05, value: 2 });
    expect(zoom.normalize?.(9)).toBe(4);
    zoom.commit(0.1);
    expect(d.setCamera).toHaveBeenCalledWith(expect.objectContaining({ zoom: 0.45 }));
    zoom.reset?.();
    expect(d.setCamera).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 1 }));
  });

  it('reads the camera live while a drag turns the figure', () => {
    let camera: FoldedFigureCamera = { yaw: 0, pitch: 0, zoom: 1 };
    const listeners = new Set<() => void>();
    const d = deps(
      {
        liveCamera: {
          read: () => camera,
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      },
      camera
    );
    const yaw = field(sheetFor(SPATIAL, d), 'yaw');
    if (yaw.kind !== 'number') throw new Error('number');
    camera = { yaw: Math.PI / 4, pitch: 0, zoom: 1 };
    expect(yaw.live?.read()).toBe(45);
    // A commit mid-drag writes over the live frame, not the stored camera.
    yaw.commit(10);
    expect(d.setCamera).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0, zoom: 1 }));
  });

  it('edits placement in the canvas gesture’s own terms', () => {
    const d = deps();
    const sheet = sheetFor(FLAT, d);
    const scale = field(sheet, 'scale');
    if (scale.kind !== 'number') throw new Error('number');
    expect(scale.value).toBe(1.5);
    scale.commit(0);
    expect(d.setPlacement).toHaveBeenCalledWith({ scale: 0.05 }, 'Resize folded form');

    const rotation = field(sheet, 'rotation');
    if (rotation.kind !== 'number') throw new Error('number');
    expect(rotation.value).toBe(90);
    rotation.commit(-45);
    const [patch, label] = (d.setPlacement as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [
      { rotation: number },
      string,
    ];
    expect(patch.rotation).toBeCloseTo(-Math.PI / 4);
    expect(label).toBe('Rotate folded form');
  });
});
