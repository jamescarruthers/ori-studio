import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The session as the canvas reads it, without the worker: the flat sheet on
 * screen, nothing landed yet, every verb a spy. The canvas's wiring is the
 * subject — which surfaces mount and what each is handed — not the engine.
 */
const session = vi.hoisted(() => {
  const node = {
    status: "pending" as const,
    path: null,
    state: null,
    fingerprint: null,
    summary: null,
    report: null,
    refusal: null,
  };
  const surface = {
    cursor: node,
    cursorId: null,
    readOnly: false,
    pending: { status: "idle" as const },
    analysis: { status: "idle" as const },
    error: null,
    analyse: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    preview: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    commitStep: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    cancel: () => undefined,
    withState: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    withNode: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    withCursor: () =>
      Promise.resolve({ status: "unavailable", reason: "no-state" }),
    retry: () => undefined,
  };
  const snapshot = {
    readOnly: false,
    cursor: null,
    sequence: null,
    sheet: node,
    nodes: new Map(),
    activePath: [],
  };
  return { node, surface, snapshot };
});

vi.mock("../../../fold/session/useFoldSession", () => ({
  useFoldSession: () => session.surface,
  useFoldSessionState: (selector: (snapshot: unknown) => unknown) =>
    selector(session.snapshot),
  useFoldCursor: () => session.node,
  useFoldNode: () => null,
  useFoldNodeQuery: () => null,
}));

import { foldTools } from "../../../fold/tools/foldToolState";
import { byRole } from "../../../test/roleQueries";
import { TooltipProvider } from "../../ui/Tooltip";
import { FoldCanvas } from "./FoldCanvas";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <TooltipProvider delayDuration={0}>
        <FoldCanvas sendToEdit={<button type="button">Send to Edit</button>} />
      </TooltipProvider>,
    ),
  );
  return host;
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  foldTools().selectTool("valley");
  foldTools().selectLineMode("axiom-2");
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

describe("the Fold canvas", () => {
  it("mounts both panes, the rail and the toolbar with its display switches and the Send to Edit slot", () => {
    const canvas = mount();
    expect(canvas.querySelector('[data-fold-pane="folded"]')).not.toBeNull();
    expect(
      canvas.querySelector('[data-fold-pane="crease-pattern"]'),
    ).not.toBeNull();
    expect(byRole(canvas, "complementary", "Fold tools")).toBeTruthy();
    // Both display switches start on; each is a toggle of its own.
    const toggle = (label: string) =>
      canvas.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(toggle("Step creases")?.hasAttribute("data-active")).toBe(true);
    expect(toggle("Precreases")?.hasAttribute("data-active")).toBe(true);
    act(() => toggle("Precreases")?.click());
    expect(toggle("Precreases")?.hasAttribute("data-active")).toBe(false);
    expect(toggle("Step creases")?.hasAttribute("data-active")).toBe(true);
    expect(
      [...canvas.querySelectorAll("button")].some(
        (button) => button.textContent === "Send to Edit",
      ),
    ).toBe(true);
  });

  it("leads a phone’s bar with the tools and the pane switch, the display switches in its menu", async () => {
    const { PHONE_MEDIA_QUERY } = await import("../../../platform/phoneLayout");
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === PHONE_MEDIA_QUERY || query.includes("pointer: coarse"),
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    const canvas = mount();
    const bar = canvas.querySelector<HTMLElement>("[data-viewport-toolbar]");
    const names = [...(bar?.querySelectorAll("button") ?? [])].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent,
    );
    // The tools, then the pane the switch shows next; the transport; the menu.
    expect(names.slice(0, 2)).toEqual(["Tools", "Crease pattern"]);
    expect(names).not.toContain("Step creases");
    expect(names).not.toContain("Precreases");
    // One pane at a time, the folded form first; the switch shows the other.
    expect(canvas.querySelector('[data-fold-pane="crease-pattern"]')).toBeNull();
    act(() =>
      bar?.querySelector<HTMLButtonElement>('button[aria-label="Crease pattern"]')?.click(),
    );
    expect(canvas.querySelector('[data-fold-pane="crease-pattern"]')).not.toBeNull();
    expect(canvas.querySelector('[data-fold-pane="folded"]')).toBeNull();
    act(() => bar?.querySelector<HTMLButtonElement>('button[aria-label="Folded"]')?.click());
    // The tools open as a sheet, from the bar.
    const tools = bar?.querySelector<HTMLButtonElement>('button[aria-label="Tools"]');
    expect(tools?.getAttribute("aria-haspopup")).toBe("dialog");
    act(() => tools?.click());
    expect(tools?.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(tools?.getAttribute("aria-controls") ?? "")).not.toBeNull();
  });

  it("puts the step’s transport on the bar, waiting while the sheet has no step to play", () => {
    const canvas = mount();
    const transport = byRole(canvas, "group", "Step playback");
    expect(transport).toBeTruthy();
    expect(
      transport?.querySelector<HTMLButtonElement>('button[aria-label="Play step"]')
        ?.disabled,
    ).toBe(true);
  });

  it("names the step on screen and the click in hand in the folded pane’s chip", () => {
    const canvas = mount();
    const chip = canvas.querySelector(
      '[data-fold-pane="folded"] [data-viewport-status-readout]',
    );
    expect(chip?.textContent).toContain("Step 0");
    expect(chip?.textContent).toContain("Click the point to move.");
  });

  // The tool window waits for a laid-out viewport, which jsdom never has; its
  // model is foldToolWindow's tests' subject.
  it("marks the tool in hand on the rail, and a rail click picks the tool for the canvas", () => {
    const canvas = mount();
    const railButton = (label: string) =>
      canvas.querySelector<HTMLButtonElement>(
        `aside button[aria-label^="${label}"]`,
      );
    expect(railButton("Valley fold")?.hasAttribute("data-active")).toBe(true);
    act(() => railButton("Divide line")?.click());
    expect(foldTools().store.getState().tool).toBe("divide-line");
    expect(railButton("Divide line")?.hasAttribute("data-active")).toBe(true);
    expect(railButton("Valley fold")?.hasAttribute("data-active")).toBe(false);
  });
});
