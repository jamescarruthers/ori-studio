import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLandingPart } from './useLandingPart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Draft = Parameters<typeof useLandingPart>[0];
const draft = (page: number, pending: boolean) => ({ page, ...(pending ? { pending: {} } : {}) }) as unknown as Draft;

let root: Root;
let host: HTMLDivElement;
type Landing = ReturnType<typeof useLandingPart>;
let latest: Landing;
const keep = (api: Landing) => {
  latest = api;
};
function Probe({ value, onApi }: { value: Draft | null; onApi: (api: Landing) => void }) {
  const api = useLandingPart(value);
  useEffect(() => onApi(api));
  return null;
}
const show = (value: Draft | null) => act(() => root.render(<Probe value={value} onApi={keep} />));

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

it('holds a committed drag over its page until that page paints', () => {
  const dropped = draft(2, true);
  show(dropped);
  expect(latest.landing).toBeNull();
  show(null);
  expect(latest.landing).toBe(dropped);
  act(() => latest.painted(1));
  expect(latest.landing).toBe(dropped);
  act(() => latest.painted(2));
  expect(latest.landing).toBeNull();
});

it('holds nothing for a cancelled drag, and lets go of a page that never paints', () => {
  show(draft(0, false));
  show(null);
  expect(latest.landing).toBeNull();
  show(draft(0, true));
  show(null);
  expect(latest.landing).not.toBeNull();
  act(() => vi.advanceTimersByTime(2000));
  expect(latest.landing).toBeNull();
});

it('lets a new drag replace a part still landing', () => {
  show(draft(0, true));
  show(null);
  show(draft(1, false));
  expect(latest.landing).toBeNull();
});
