import { describe, expect, it } from "vitest";
import { createMap, pointInPolygon } from "./map";

describe("map generation", () => {
  it("is deterministic and produces land separated by a water channel", () => {
    const first = createMap(0x1234abcd);
    const second = createMap(0x1234abcd);

    expect(first).toEqual(second);
    expect(first).toHaveLength(25);
    expect(first.filter((region) => region.startCandidate).length).toBeGreaterThanOrEqual(6);
    expect(first.filter((region) => region.biome === "water").length).toBeGreaterThanOrEqual(5);
    expect(first.filter((region) => region.biome === "water").every((region) => !region.startCandidate)).toBe(true);
    expect(first.every((region) => region.vertices.length >= 3)).toBe(true);
    expect(first.every((region) => region.neighbors.length >= 2)).toBe(true);
    expect(first.every((region) => pointInPolygon(region.center, region.vertices))).toBe(true);
  });

  it("changes its topology when the seed changes", () => {
    const first = createMap(101);
    const second = createMap(202);
    expect(first.map((region) => region.center)).not.toEqual(second.map((region) => region.center));
  });

  it("uses the selected preset to scale the number of territories", () => {
    expect(createMap(77, "compact")).toHaveLength(16);
    expect(createMap(77, "standard")).toHaveLength(25);
    expect(createMap(77, "frontier")).toHaveLength(36);
  });
});
