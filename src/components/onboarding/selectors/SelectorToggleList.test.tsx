// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SelectorToggleList,
  __selectorToggleListInternals,
} from "./SelectorToggleList";

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
});

describe("__selectorToggleListInternals.nextSelection", () => {
  const { nextSelection } = __selectorToggleListInternals;

  it("multi mode toggles membership", () => {
    expect(nextSelection(["a"], "b", "multi")).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "a", "multi")).toEqual(["b"]);
  });

  it("single mode replaces the current selection and clears on re-tap", () => {
    expect(nextSelection(["a"], "b", "single")).toEqual(["b"]);
    expect(nextSelection(["a"], "a", "single")).toEqual([]);
  });
});

describe("<SelectorToggleList />", () => {
  const items = [
    { id: "photo", label: "Photo", description: "Photography" },
    { id: "video", label: "Video", description: "Videography" },
    { id: "hybrid", label: "Hybrid", description: "Photo + motion" },
  ];

  it("renders one row per item and reflects selected state via aria-checked", () => {
    render(
      <SelectorToggleList
        items={items}
        value={["video"]}
        onChange={() => {}}
        mode="multi"
        stagger={false}
      />,
    );
    const rows = screen.getAllByRole("checkbox");
    expect(rows).toHaveLength(3);
    const byId = Object.fromEntries(
      rows.map((r) => [r.getAttribute("data-selector-choice-id"), r]),
    );
    expect(byId.photo?.getAttribute("aria-checked")).toBe("false");
    expect(byId.video?.getAttribute("aria-checked")).toBe("true");
    expect(byId.hybrid?.getAttribute("aria-checked")).toBe("false");
  });

  it("multi-mode click toggles the item via onChange", () => {
    const onChange = vi.fn();
    render(
      <SelectorToggleList
        items={items}
        value={["photo"]}
        onChange={onChange}
        mode="multi"
        stagger={false}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /video/i }));
    expect(onChange).toHaveBeenCalledWith(["photo", "video"]);
  });

  it("ArrowDown / ArrowUp moves focus and wraps", () => {
    render(
      <SelectorToggleList
        items={items}
        value={[]}
        onChange={() => {}}
        mode="multi"
        stagger={false}
      />,
    );
    const [photo, video, hybrid] = screen.getAllByRole("checkbox");
    act(() => {
      photo.focus();
    });
    expect(document.activeElement).toBe(photo);

    fireEvent.keyDown(photo, { key: "ArrowDown" });
    expect(document.activeElement).toBe(video);

    fireEvent.keyDown(video, { key: "ArrowDown" });
    expect(document.activeElement).toBe(hybrid);

    fireEvent.keyDown(hybrid, { key: "ArrowDown" });
    expect(document.activeElement).toBe(photo);

    fireEvent.keyDown(photo, { key: "End" });
    expect(document.activeElement).toBe(hybrid);

    fireEvent.keyDown(hybrid, { key: "Home" });
    expect(document.activeElement).toBe(photo);
  });
});
