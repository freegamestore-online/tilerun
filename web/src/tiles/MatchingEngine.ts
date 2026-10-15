import { type Pip, type Tile } from "./Tile";

export type End = "left" | "right";

/**
 * A line of tiles with an open pip value at each end. The first tile is the
 * spinner when it is a double: both ends show its single pip value.
 */
export interface Chain {
  readonly left: Pip;
  readonly right: Pip;
  readonly tiles: readonly Tile[];
}

export function startChain(tile: Tile): Chain {
  return { left: tile.a, right: tile.b, tiles: [tile] };
}

function endValue(chain: Chain, end: End): Pip {
  return end === "left" ? chain.left : chain.right;
}

/** The half of `tile` that touches an end showing `pip`, and the half left open. */
function openHalf(tile: Tile, pip: Pip): Pip {
  return tile.a === pip ? tile.b : tile.a;
}

/** Which ends of the chain this tile can be placed on. */
export function matchingEnds(chain: Chain, tile: Tile): End[] {
  const ends: End[] = [];
  if (tile.a === chain.left || tile.b === chain.left) ends.push("left");
  if (tile.a === chain.right || tile.b === chain.right) ends.push("right");
  return ends;
}

export function canPlace(chain: Chain, tile: Tile): boolean {
  return matchingEnds(chain, tile).length > 0;
}

/**
 * Places `tile` on an open end and returns the new chain. Pass `end` to choose
 * the side explicitly (e.g. on a spinner or a double). Without it, the left end
 * is used when both ends match. Throws if the tile cannot be placed there.
 */
export function place(chain: Chain, tile: Tile, end?: End): Chain {
  const legal = matchingEnds(chain, tile);
  const target = end ?? legal[0];
  if (target === undefined || !legal.includes(target)) {
    throw new Error(
      `Illegal placement of [${tile.a}, ${tile.b}]` +
        (end ? ` on the ${end} end` : ""),
    );
  }

  const newEnd = openHalf(tile, endValue(chain, target));
  if (target === "left") {
    return { left: newEnd, right: chain.right, tiles: [tile, ...chain.tiles] };
  }
  return { left: chain.left, right: newEnd, tiles: [...chain.tiles, tile] };
}

/** True when no tile in `hand` can be placed on either end of the chain. */
export function isBlocked(chain: Chain, hand: readonly Tile[]): boolean {
  return !hand.some((tile) => canPlace(chain, tile));
}
