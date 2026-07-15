import { describe, expect, it } from "vitest";
import { SeededRandom } from "./random";

describe("SeededRandom", () => {
  it("replays the same sequence", () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);
    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  it("keeps generated values inside requested bounds", () => {
    const random = new SeededRandom(77);
    for (let index = 0; index < 100; index += 1) {
      expect(random.between(-5, 8)).toBeGreaterThanOrEqual(-5);
      expect(random.int(2, 5)).toBeGreaterThanOrEqual(2);
      expect(random.int(2, 5)).toBeLessThanOrEqual(5);
    }
  });
});
