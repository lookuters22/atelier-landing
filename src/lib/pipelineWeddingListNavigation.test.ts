import { describe, expect, it, vi } from "vitest";
import {
  adjacentWeddingIdInOrderedList,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "./pipelineWeddingListNavigation";

const ids = ["a", "b", "c"];

describe("adjacentWeddingIdInOrderedList", () => {
  it("returns null for empty list", () => {
    expect(adjacentWeddingIdInOrderedList([], "a", 1)).toBeNull();
  });

  it("cycles when current is in list", () => {
    expect(adjacentWeddingIdInOrderedList(ids, "a", 1)).toBe("b");
    expect(adjacentWeddingIdInOrderedList(ids, "c", 1)).toBe("a");
    expect(adjacentWeddingIdInOrderedList(ids, "a", -1)).toBe("c");
  });

  it("jumps to ends when current missing", () => {
    expect(adjacentWeddingIdInOrderedList(ids, null, 1)).toBe("a");
    expect(adjacentWeddingIdInOrderedList(ids, null, -1)).toBe("c");
    expect(adjacentWeddingIdInOrderedList(ids, "x", 1)).toBe("a");
  });
});

describe("pipelineWeddingAltVerticalDelta", () => {
  it("maps Alt+Up/Down without other modifiers", () => {
    expect(
      pipelineWeddingAltVerticalDelta({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: "ArrowUp",
      }),
    ).toBe(-1);
    expect(
      pipelineWeddingAltVerticalDelta({
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        key: "ArrowDown",
      }),
    ).toBe(1);
    expect(
      pipelineWeddingAltVerticalDelta({
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        key: "ArrowUp",
      }),
    ).toBeNull();
  });
});

describe("weddingQueuePosition", () => {
  it("returns 1-based index when id is in list", () => {
    expect(weddingQueuePosition(["a", "b", "c"], "b")).toEqual({ current: 2, total: 3 });
  });

  it("returns null when id missing or not in list", () => {
    expect(weddingQueuePosition(["a"], null)).toBeNull();
    expect(weddingQueuePosition(["a", "b"], "x")).toBeNull();
  });
});

describe("scrollPipelineWeddingRowIntoView", () => {
  it("uses nearest + smooth for minimal jank", () => {
    const scrollIntoView = vi.fn();
    scrollPipelineWeddingRowIntoView({ scrollIntoView } as unknown as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  });

  it("does not scroll when row is already fully visible inside the container", () => {
    const scrollIntoView = vi.fn();
    const el = {
      scrollIntoView,
      getBoundingClientRect: () => ({ top: 60, bottom: 90, left: 0, right: 100 }),
    };
    const root = {
      getBoundingClientRect: () => ({ top: 50, bottom: 300, left: 0, right: 100 }),
    };
    scrollPipelineWeddingRowIntoView(el as unknown as HTMLElement, root as unknown as HTMLElement);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
