import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_MEDIA_QUERY } from '../../../platform/phoneLayout';
import { useFoldRepeatUi, type FoldRepeatOpening } from '../../../fold/repeat/foldRepeatUi';

/**
 * The Repeat bar over a stand-in for its hook: what is under test is what the
 * bar shows, and where, for one model — a refused repeat of one operation on
 * a square with two axes.
 */
const model = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));
vi.mock('../../../fold/repeat/useFoldRepeat', () => ({ useFoldRepeat: () => model.current }));

import { FoldRepeatBar } from './FoldRepeatBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const square = { faces: [{ outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }] };
const axis = (n: [number, number]) => ({ display: { n, d: 0.5 }, sheet: { n, d: 0.5 } });
const opening: FoldRepeatOpening = {
  id: 1,
  loadId: 1,
  sequenceId: 's',
  parent: 'a',
  path: 'p',
  fingerprint: 'f',
} as FoldRepeatOpening;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function stubPhone(phone: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: phone && query === PHONE_MEDIA_QUERY,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
}

function mount(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<FoldRepeatBar />));
  return host;
}

const button = (bar: HTMLElement, name: string) =>
  [...bar.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) ?? null;
/** Whether an element is shown: neither it nor a container of it is hidden. */
const shown = (element: Element | null) => !!element && !element.closest('[hidden]');

beforeEach(() => {
  model.current = {
    candidates: [{ id: 'a', key: 'a', kind: 'fold', number: 1, session: { state: {} } }],
    first: 'a',
    setFirst: () => {},
    individual: false,
    setIndividual: () => {},
    axes: [axis([1, 0]), axis([0, 1])],
    axis: 0,
    setAxis: () => {},
    baseline: square,
    base: {},
    axisMarks: [],
    busy: false,
    preparing: false,
    stopped: false,
    stop: () => false,
    error: null,
    result: {
      status: 'blocked',
      step: 0,
      code: 'witness_not_in_face',
      refusal: { code: 'witness_not_in_face' },
      op: 'valley',
    },
    choice: null,
    cycle: async () => {},
    acceptChoice: () => {},
    prepare: async () => {},
    commit: async () => {},
    close: () => {},
    backFromChoice: () => {},
    count: 1,
    canPreview: true,
  };
  useFoldRepeatUi.setState({ opening, first: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
  useFoldRepeatUi.setState({ opening: null, first: null });
});

describe('FoldRepeatBar', () => {
  it("keeps a phone's bar to the choices, the words and the action, the rest behind Options", () => {
    stubPhone(true);
    const bar = mount().querySelector('section')!;
    // Why it stopped, with Repeat's advice, never behind the disclosure.
    const status = bar.querySelector('[role="status"]');
    expect(shown(status)).toBe(true);
    expect(status?.textContent).toBe(
      'Stopped at source operation 1: The spot the mirrored fold picks is not inside a layer on the moving side. Try another axis, or fold the other side with the tools.'
    );
    expect(shown(bar.querySelector('[aria-label="First source step"]'))).toBe(true);
    expect(shown(bar.querySelector('[aria-label="Symmetry axis"]'))).toBe(true);
    expect(shown(button(bar, 'Preview repeat'))).toBe(true);
    expect(shown(button(bar, 'Cancel'))).toBe(true);
    // The axis picture is a thumbnail.
    expect(bar.querySelector('svg[data-size]')?.getAttribute('data-size')).toBe('thumb');

    const options = button(bar, 'Options')!;
    expect(options.getAttribute('aria-expanded')).toBe('false');
    const individual = bar.querySelector('[role="switch"]');
    expect(individual).not.toBeNull();
    expect(shown(individual)).toBe(false);
    expect(shown(button(bar, 'Locate axis'))).toBe(false);

    act(() => options.click());
    expect(options.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(options.getAttribute('aria-controls')!)?.hidden).toBe(false);
    expect(shown(button(bar, 'Locate axis'))).toBe(true);
    expect(shown(individual)).toBe(true);
  });

  it('shows everything at once off a phone, as before', () => {
    stubPhone(false);
    const bar = mount().querySelector('section')!;
    expect(button(bar, 'Options')).toBeNull();
    expect(shown(button(bar, 'Locate axis'))).toBe(true);
    expect(bar.textContent).toContain('Show as individual steps');
    expect(bar.querySelector('svg[data-size]')?.getAttribute('data-size')).toBe('full');
    expect(bar.querySelector('[role="status"]')?.textContent).toContain('Try another axis');
  });

  it('keeps the picture\'s place while the model before the range loads', () => {
    // A real design takes a moment to replay; the controls must not slide over when it lands.
    for (const phone of [false, true]) {
      stubPhone(phone);
      model.current = { ...model.current, baseline: null };
      const bar = mount().querySelector('section')!;
      const held = bar.querySelector('[data-size]');
      expect(held?.tagName).toBe('SPAN');
      expect(held?.getAttribute('data-size')).toBe(phone ? 'thumb' : 'full');
      expect(held?.getAttribute('aria-hidden')).toBe('true');
      act(() => root?.unmount());
      root = null;
      host?.remove();
      host = null;
    }
  });
});
