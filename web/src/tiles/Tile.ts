export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Tile {
  readonly a: Pip;
  readonly b: Pip;
}

const MIN_PIP = 0;
const MAX_PIP = 6;

function isPip(value: number): value is Pip {
  return Number.isInteger(value) && value >= MIN_PIP && value <= MAX_PIP;
}

/** Creates an immutable domino tile. Throws if either pip count is outside 0–6. */
export function createTile(a: number, b: number): Tile {
  if (!isPip(a) || !isPip(b)) {
    throw new RangeError(`Pip counts must be integers 0–6, got [${a}, ${b}]`);
  }
  return Object.freeze({ a, b });
}

export function isDouble(tile: Tile): boolean {
  return tile.a === tile.b;
}

/** The double-six set: 28 tiles, one per unordered pair (a <= b) of pip counts 0–6. */
function buildFullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = MIN_PIP; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) {
      tiles.push(createTile(a, b));
    }
  }
  return tiles;
}

export const FULL_SET: readonly Tile[] = Object.freeze(buildFullSet());
