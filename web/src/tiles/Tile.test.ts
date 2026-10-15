import { describe, expect, it } from "vitest";
import { createTile, FULL_SET, isDouble, type Pip } from "./Tile";

describe("createTile", () => {
  it("stores both pip counts", () => {
    const tile = createTile(2, 5);
    expect(tile.a).toBe(2);
    expect(tile.b).toBe(5);
  });

  it("rejects pip counts outside 0–6 or non-integers", () => {
    expect(() => createTile(-1, 0)).toThrow(RangeError);
    expect(() => createTile(0, 7)).toThrow(RangeError);
    expect(() => createTile(1.5, 2)).toThrow(RangeError);
  });

  it("returns a frozen object that cannot be mutated", () => {
    const tile = createTile(1, 4);
    expect(Object.isFrozen(tile)).toBe(true);
    expect(() => {
      (tile as { a: number }).a = 3;
    }).toThrow(TypeError);
  });
});

describe("FULL_SET", () => {
  it("contains exactly 28 tiles", () => {
    expect(FULL_SET).toHaveLength(28);
  });

  it("contains each unordered pair exactly once, with a <= b", () => {
    const keys = FULL_SET.map((t) => `${t.a}-${t.b}`);
    expect(new Set(keys).size).toBe(28);
    for (const tile of FULL_SET) {
      expect(tile.a).toBeLessThanOrEqual(tile.b);
    }
  });

  it("has exactly 7 doubles", () => {
    expect(FULL_SET.filter(isDouble)).toHaveLength(7);
  });

  it("uses only pip values 0–6", () => {
    const valid = new Set<Pip>([0, 1, 2, 3, 4, 5, 6]);
    for (const tile of FULL_SET) {
      expect(valid.has(tile.a)).toBe(true);
      expect(valid.has(tile.b)).toBe(true);
    }
  });

  it("is frozen, and its tiles are frozen", () => {
    expect(Object.isFrozen(FULL_SET)).toBe(true);
    for (const tile of FULL_SET) {
      expect(Object.isFrozen(tile)).toBe(true);
    }
  });
});
