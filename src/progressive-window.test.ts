import { describe, expect, it } from "vitest";
import { scrollAnchorDelta, shiftMessageWindow } from "./progressive-window";

describe("progressive message window", () => {
  it("keeps a bounded window when moving down", () => {
    expect(shiftMessageWindow({ start: 0, end: 300 }, 900, "after", 100, 300)).toEqual({ start: 100, end: 400 });
  });
  it("keeps a bounded window when moving up", () => {
    expect(shiftMessageWindow({ start: 300, end: 600 }, 900, "before", 100, 300)).toEqual({ start: 200, end: 500 });
  });
  it("returns the exact offset correction after removing DOM above the anchor", () => {
    expect(scrollAnchorDelta(86, -914)).toBe(-1000);
  });
});
