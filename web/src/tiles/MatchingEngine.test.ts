import { describe, expect, it } from "vitest";
import {
  canPlace,
  isBlocked,
  matchingEnds,
  place,
  startChain,
  type Chain,
} from "./MatchingEngine";
import { createTile, FULL_SET } from "./Tile";

describe("startChain", () => {
  it("opens both ends with the tile's halves", () => {
    const chain = startChain(createTile(2, 5));
    expect(chain.left).toBe(2);
    expect(chain.right).toBe(5);
    expect(chain.tiles).toHaveLength(1);
  });

  it("spinner: a double as the first tile sets both ends to its pip value", () => {
    const chain = startChain(createTile(4, 4));
    expect(chain.left).toBe(4);
    expect(chain.right).toBe(4);
  });
});

describe("basic placement", () => {
  it("accepts a tile matching the left end and extends it", () => {
    const chain = startChain(createTile(2, 5));
    expect(canPlace(chain, createTile(2, 6))).toBe(true);

    const next = place(chain, createTile(2, 6));
    expect(next.left).toBe(6);
    expect(next.right).toBe(5);
    expect(next.tiles).toHaveLength(2);
  });

  it("accepts a tile matching the right end and extends it", () => {
    const chain = startChain(createTile(2, 5));
    const next = place(chain, createTile(5, 1));
    expect(next.left).toBe(2);
    expect(next.right).toBe(1);
  });

  it("orients a tile whose matching half is listed second", () => {
    const chain = startChain(createTile(2, 5));
    const next = place(chain, createTile(6, 2));
    expect(next.left).toBe(6);
  });

  it("rejects a tile that matches neither end", () => {
    const chain = startChain(createTile(2, 5));
    expect(canPlace(chain, createTile(1, 3))).toBe(false);
    expect(() => place(chain, createTile(1, 3))).toThrow(/Illegal placement/);
  });

  it("rejects an explicit end the tile does not match", () => {
    const chain = startChain(createTile(2, 5));
    expect(() => place(chain, createTile(5, 1), "left")).toThrow(
      /Illegal placement/,
    );
  });

  it("does not mutate the original chain", () => {
    const chain = startChain(createTile(2, 5));
    place(chain, createTile(2, 6));
    expect(chain.left).toBe(2);
    expect(chain.tiles).toHaveLength(1);
  });
});

describe("spinner placement", () => {
  it("a tile matching the spinner's pip can go on either side", () => {
    const spinner = startChain(createTile(4, 4));
    expect(matchingEnds(spinner, createTile(4, 1))).toEqual(["left", "right"]);

    const onLeft = place(spinner, createTile(4, 1), "left");
    expect(onLeft.left).toBe(1);
    expect(onLeft.right).toBe(4);

    const onRight = place(spinner, createTile(4, 1), "right");
    expect(onRight.left).toBe(4);
    expect(onRight.right).toBe(1);
  });

  it("defaults to the left end when both ends match", () => {
    const spinner = startChain(createTile(4, 4));
    const next = place(spinner, createTile(4, 1));
    expect(next.left).toBe(1);
    expect(next.right).toBe(4);
  });
});

describe("doubles orientation", () => {
  it("a double [3,3] can be placed on an end showing 3, and keeps that end at 3", () => {
    const chain = startChain(createTile(3, 6));
    expect(canPlace(chain, createTile(3, 3))).toBe(true);

    const next = place(chain, createTile(3, 3), "left");
    expect(next.left).toBe(3);
    expect(next.right).toBe(6);
  });

  it("a double can be placed on either end that shows its pip", () => {
    const chain: Chain = { left: 3, right: 3, tiles: [createTile(3, 3)] };
    expect(matchingEnds(chain, createTile(3, 3))).toEqual(["left", "right"]);
    expect(place(chain, createTile(3, 3), "right").right).toBe(3);
    expect(place(chain, createTile(3, 3), "left").left).toBe(3);
  });

  it("a double does not match an end showing a different pip", () => {
    const chain = startChain(createTile(3, 6));
    expect(canPlace(chain, createTile(5, 5))).toBe(false);
  });
});

describe("blocked board", () => {
  it("is blocked when no tile in hand matches either end", () => {
    const board = startChain(createTile(6, 6));
    const hand = [createTile(1, 2), createTile(3, 4)];
    expect(isBlocked(board, hand)).toBe(true);
    for (const tile of hand) {
      expect(() => place(board, tile)).toThrow(/Illegal placement/);
    }
  });

  it("is not blocked when at least one tile in hand matches", () => {
    const board = startChain(createTile(6, 6));
    const hand = [createTile(1, 2), createTile(6, 3)];
    expect(isBlocked(board, hand)).toBe(false);
  });

  it("is blocked with an empty hand", () => {
    expect(isBlocked(startChain(createTile(0, 1)), [])).toBe(true);
  });

  it("is not blocked when a tile fits the board's open end", () => {
    const board = startChain(createTile(2, 5));
    expect(isBlocked(board, FULL_SET)).toBe(false);
  });
});
