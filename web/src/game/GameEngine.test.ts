import { describe, expect, it } from "vitest";
import { createTile, FULL_SET, startChain, type Tile } from "../tiles";
import {
  dealHands,
  drawFromBoneyard,
  getAIMove,
  getLegalMoves,
  isRoundOver,
  pass,
  playTile,
  roundWinner,
  scoreRound,
} from "./GameEngine";
import type { GameMode, GameState } from "./GameState";

const t = (a: number, b: number): Tile => createTile(a, b);

function makeState({
  hands,
  board = null,
  boneyard = [],
  mode = "draw",
  turn = 0,
}: {
  hands: Tile[][];
  board?: GameState["board"];
  boneyard?: Tile[];
  mode?: GameMode;
  turn?: number;
}): GameState {
  return {
    mode,
    players: hands.map((hand, i) => ({ name: `P${i}`, hand, ai: null })),
    boneyard,
    board,
    turn,
    passed: hands.map(() => false),
  };
}

// Board with both ends showing 3. None of the hands below holds a 3.
const BLOCKED_BOARD = startChain(t(3, 3));
const BLOCKED_HANDS = [[t(1, 2)], [t(6, 6)], [t(0, 1)]];

describe("dealHands", () => {
  it("deals 7 tiles each for 2 players, leaving 14 in the boneyard", () => {
    const { hands, boneyard } = dealHands(2);
    expect(hands.map((h) => h.length)).toEqual([7, 7]);
    expect(boneyard).toHaveLength(14);
  });

  it("deals 5 tiles each for 3–4 players", () => {
    expect(dealHands(3).hands.map((h) => h.length)).toEqual([5, 5, 5]);
    const four = dealHands(4);
    expect(four.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(four.boneyard).toHaveLength(8);
  });

  it("uses every tile of the double-six set exactly once", () => {
    const { hands, boneyard } = dealHands(4);
    const all = [...hands.flat(), ...boneyard];
    expect(all).toHaveLength(FULL_SET.length);
    expect(new Set(all.map((x) => `${x.a}-${x.b}`)).size).toBe(28);
  });

  it("rejects player counts outside 2–4", () => {
    expect(() => dealHands(1)).toThrow(RangeError);
    expect(() => dealHands(5)).toThrow(RangeError);
  });
});

describe("getLegalMoves", () => {
  it("at the start of a round, every tile is playable as an opener", () => {
    const hand = [t(1, 1), t(2, 5), t(6, 0)];
    expect(getLegalMoves(hand, null)).toEqual(hand.map((tile) => ({ tile })));
  });

  it("mid-game, returns only tiles that match an open end, with that end", () => {
    const board = startChain(t(2, 5));
    const hand = [t(2, 3), t(5, 6), t(1, 1)];
    expect(getLegalMoves(hand, board)).toEqual([
      { tile: t(2, 3), end: "left" },
      { tile: t(5, 6), end: "right" },
    ]);
  });

  it("offers both ends for a double that matches both", () => {
    const board = startChain(t(4, 4));
    expect(getLegalMoves([t(4, 4)], board)).toEqual([
      { tile: t(4, 4), end: "left" },
      { tile: t(4, 4), end: "right" },
    ]);
  });

  it("is empty on a blocked board", () => {
    expect(getLegalMoves(BLOCKED_HANDS[0] ?? [], BLOCKED_BOARD)).toEqual([]);
  });
});

describe("playTile", () => {
  it("removes the tile from the hand, extends the board and advances the turn", () => {
    const state = makeState({ hands: [[t(2, 3), t(1, 1)], [t(0, 0)]], board: startChain(t(2, 5)) });
    const next = playTile(state, 0, t(2, 3), "left");
    expect(next.players[0]?.hand).toEqual([t(1, 1)]);
    expect(next.board?.left).toBe(3);
    expect(next.turn).toBe(1);
  });

  it("rejects a tile played out of turn", () => {
    const state = makeState({ hands: [[t(2, 3)], [t(2, 4)]], board: startChain(t(2, 5)) });
    expect(() => playTile(state, 1, t(2, 4), "left")).toThrow(/turn/);
  });

  it("rejects an illegal placement", () => {
    const state = makeState({ hands: [[t(1, 3)]], board: startChain(t(2, 5)) });
    expect(() => playTile(state, 0, t(1, 3), "left")).toThrow(/Illegal/);
  });

  it("ends the round when a player plays their last tile", () => {
    const state = makeState({ hands: [[t(2, 3)], [t(0, 0)]], board: startChain(t(2, 5)) });
    expect(isRoundOver(playTile(state, 0, t(2, 3), "left"))).toBe(true);
  });
});

describe("drawFromBoneyard", () => {
  it("draws until the player holds a legal move, keeping the turn", () => {
    const state = makeState({
      hands: [[t(1, 1)], [t(0, 0)]],
      board: startChain(t(2, 5)),
      boneyard: [t(6, 6), t(2, 3)],
    });
    const next = drawFromBoneyard(state, 0);
    expect(next.players[0]?.hand).toEqual([t(1, 1), t(2, 3)]);
    expect(next.boneyard).toEqual([t(6, 6)]);
    expect(next.turn).toBe(0);
  });

  it("is not allowed in a block game", () => {
    const state = makeState({
      hands: [[t(1, 1)], [t(0, 0)]],
      board: startChain(t(2, 5)),
      boneyard: [t(2, 3)],
      mode: "block",
    });
    expect(() => drawFromBoneyard(state, 0)).toThrow(/draw game/);
  });
});

describe("pass", () => {
  it("is not allowed while a legal move exists", () => {
    const state = makeState({ hands: [[t(2, 3)], [t(0, 0)]], board: startChain(t(2, 5)), mode: "block" });
    expect(() => pass(state, 0)).toThrow(/legal move/);
  });

  it("marks the player as passed and advances the turn", () => {
    const state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, mode: "block" });
    const next = pass(state, 0);
    expect(next.passed).toEqual([true, false, false]);
    expect(next.turn).toBe(1);
  });
});

describe("isRoundOver", () => {
  it("is true when a hand is empty", () => {
    const state = makeState({ hands: [[], [t(1, 2)]], board: startChain(t(2, 5)) });
    expect(isRoundOver(state)).toBe(true);
  });

  it("is false at the start of a normal round", () => {
    const state = makeState({ hands: [[t(2, 3)], [t(0, 0)]], board: startChain(t(2, 5)) });
    expect(isRoundOver(state)).toBe(false);
  });

  it("is true when every player has passed in a row", () => {
    let state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, mode: "block" });
    for (let i = 0; i < 3; i++) state = pass(state, state.turn);
    expect(isRoundOver(state)).toBe(true);
  });

  it("is true for a blocked draw game with an empty boneyard", () => {
    const state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, boneyard: [] });
    expect(isRoundOver(state)).toBe(true);
  });

  it("is false for a blocked draw game while the boneyard still has tiles", () => {
    const state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, boneyard: [t(4, 5)] });
    expect(isRoundOver(state)).toBe(false);
  });
});

describe("scoring", () => {
  it("scores a blocked draw game: lowest hand wins the opponents' pips", () => {
    const state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, boneyard: [] });
    expect(isRoundOver(state)).toBe(true);
    // Totals: P0 = 3, P1 = 12, P2 = 1. P2 has the lowest hand.
    expect(roundWinner(state)).toBe(2);
    expect(scoreRound(state, 2)).toBe(3 + 12);
  });

  it("scores a blocked block game the same way", () => {
    const state = makeState({ hands: BLOCKED_HANDS, board: BLOCKED_BOARD, mode: "block" });
    expect(isRoundOver(state)).toBe(true);
    expect(roundWinner(state)).toBe(2);
    expect(scoreRound(state, 2)).toBe(15);
  });

  it("returns no winner for a blocked round tied on the lowest total", () => {
    // Totals: P0 = 2, P1 = 2, P2 = 12. P0 and P1 are tied for lowest.
    const hands = [[t(1, 1)], [t(0, 2)], [t(6, 6)]];
    const state = makeState({ hands, board: BLOCKED_BOARD, mode: "block" });
    expect(roundWinner(state)).toBeNull();
  });

  it("scores a player who went out with all opponents' pips", () => {
    const state = makeState({ hands: [[], [t(6, 6)], [t(5, 5)]], board: startChain(t(2, 5)) });
    expect(roundWinner(state)).toBe(0);
    expect(scoreRound(state, 0)).toBe(12 + 10);
  });
});

describe("getAIMove", () => {
  // Board ends 2 and 5. The AI holds [2,4], [2,6] and [5,3].
  // Opponent holds [3,3] and [6,6].
  const board = startChain(t(2, 5));
  const aiHand = [t(2, 4), t(2, 6), t(5, 3)];
  const oppHands = [[t(3, 3), t(6, 6)]];
  const state = makeState({ hands: [aiHand, ...oppHands], board });

  it("easy picks a random legal move", () => {
    const legal = getLegalMoves(aiHand, board);
    expect(getAIMove(state, 0, "easy", () => 0)).toEqual(legal[0]);
    expect(getAIMove(state, 0, "easy", () => 0.999)).toEqual(legal[legal.length - 1]);
    for (const r of [0.1, 0.5, 0.9]) {
      expect(legal).toContainEqual(getAIMove(state, 0, "easy", () => r));
    }
  });

  it("normal picks a valid move that keeps the most of its own tiles playable", () => {
    const move = getAIMove(state, 0, "normal");
    expect(move).not.toBeNull();
    expect(getLegalMoves(aiHand, board)).toContainEqual(move);
    // [5,3] on the right leaves both [2,4] and [2,6] playable, which is the most.
    expect(move).toEqual({ tile: t(5, 3), end: "right" });
  });

  it("hard minimises the pips in opponents' hands that they can play next", () => {
    // [2,4] on the left leaves ends 4 and 5. Neither opponent tile fits.
    expect(getAIMove(state, 0, "hard")).toEqual({ tile: t(2, 4), end: "left" });
  });

  it("returns null when the AI has no legal move", () => {
    const blocked = makeState({ hands: [[t(1, 2)], [t(6, 6)]], board: BLOCKED_BOARD });
    expect(getAIMove(blocked, 0, "hard")).toBeNull();
  });
});
