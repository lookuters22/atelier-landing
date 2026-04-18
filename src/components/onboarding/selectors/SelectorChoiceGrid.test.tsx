// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SelectorChoiceGrid,
  __selectorChoiceGridInternals,
} from "./SelectorChoiceGrid";

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

describe("__selectorChoiceGridInternals.nextSelection", () => {
  const { nextSelection } = __selectorChoiceGridInternals;

  it("multi mode toggles membership", () => {
    expect(nextSelection(["a"], "b", "multi")).toEqual(["a", "b"]);
    expect(nextSelection(["a", "b"], "a", "multi")).toEqual(["b"]);
    expect(nextSelection([], "a", "multi")).toEqual(["a"]);
  });

  it("single mode replaces the current selection", () => {
    expect(nextSelection(["a"], "b", "single")).toEqual(["b"]);
    expect(nextSelection([], "a", "single")).toEqual(["a"]);
  });

  it("single mode tapping the same id clears it", () => {
    expect(nextSelection(["a"], "a", "single")).toEqual([]);
  });
});

describe("<SelectorChoiceGrid />", () => {
  const items = [
    { id: "photo", label: "Photo" },
    { id: "video", label: "Video" },
    { id: "hybrid", label: "Hybrid" },
  ];

  it("renders one card per item with the right a11y roles (multi)", () => {
    render(
      <SelectorChoiceGrid
        items={items}
        value={[]}
        onChange={() => {}}
        mode="multi"
        stagger={false}
      />,
    );
    const cards = screen.getAllByRole("checkbox");
    expect(cards).toHaveLength(3);
    cards.forEach((c) => expect(c.getAttribute("aria-checked")).toBe("false"));
  });

  it("uses radio roles in single mode and marks selected card", () => {
    render(
      <SelectorChoiceGrid
        items={items}
        value={["photo"]}
        onChange={() => {}}
        mode="single"
        stagger={false}
      />,
    );
    const cards = screen.getAllByRole("radio");
    expect(cards).toHaveLength(3);
    const photo = cards.find(
      (c) => c.getAttribute("data-selector-choice-id") === "photo",
    );
    expect(photo).toBeTruthy();
    expect(photo?.getAttribute("aria-checked")).toBe("true");
  });

  it("multi-mode click toggles the item via onChange", () => {
    const onChange = vi.fn();
    render(
      <SelectorChoiceGrid
        items={items}
        value={["photo"]}
        onChange={onChange}
        mode="multi"
        stagger={false}
      />,
    );
    const video = screen.getByRole("checkbox", { name: /video/i });
    fireEvent.click(video);
    expect(onChange).toHaveBeenCalledWith(["photo", "video"]);

    const photo = screen.getByRole("checkbox", { name: /photo/i });
    fireEvent.click(photo);
    // Second call: removes the currently-selected "photo" from the original value.
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("single-mode click replaces the selection", () => {
    const onChange = vi.fn();
    render(
      <SelectorChoiceGrid
        items={items}
        value={["photo"]}
        onChange={onChange}
        mode="single"
        stagger={false}
      />,
    );
    const video = screen.getByRole("radio", { name: /video/i });
    fireEvent.click(video);
    expect(onChange).toHaveBeenCalledWith(["video"]);
  });

  it("ArrowRight / ArrowLeft moves focus and wraps around", () => {
    render(
      <SelectorChoiceGrid
        items={items}
        value={[]}
        onChange={() => {}}
        mode="multi"
        stagger={false}
      />,
    );
    const [photoCard, videoCard, hybridCard] = screen.getAllByRole("checkbox");
    act(() => {
      photoCard.focus();
    });
    expect(document.activeElement).toBe(photoCard);

    fireEvent.keyDown(photoCard, { key: "ArrowRight" });
    expect(document.activeElement).toBe(videoCard);

    fireEvent.keyDown(videoCard, { key: "ArrowRight" });
    expect(document.activeElement).toBe(hybridCard);

    fireEvent.keyDown(hybridCard, { key: "ArrowRight" });
    // Wraps back to the first card.
    expect(document.activeElement).toBe(photoCard);

    fireEvent.keyDown(photoCard, { key: "End" });
    expect(document.activeElement).toBe(hybridCard);

    fireEvent.keyDown(hybridCard, { key: "Home" });
    expect(document.activeElement).toBe(photoCard);
  });
});
