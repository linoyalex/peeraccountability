import { describe, expect, it } from "vitest";

import { fitWithinLongestEdge } from "./image";

describe("fitWithinLongestEdge", () => {
  it("keeps an image that already fits unchanged", () => {
    expect(fitWithinLongestEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("limits a landscape image to a 1280px longest edge", () => {
    expect(fitWithinLongestEdge(4032, 3024)).toEqual({ width: 1280, height: 960 });
  });

  it("limits a portrait image to a 1280px longest edge", () => {
    expect(fitWithinLongestEdge(3024, 4032)).toEqual({ width: 960, height: 1280 });
  });

  it("rejects invalid image dimensions", () => {
    expect(() => fitWithinLongestEdge(0, 100)).toThrow("Invalid image dimensions");
  });
});
