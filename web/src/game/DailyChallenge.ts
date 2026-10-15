import { newRound } from "./GameEngine";
import type { GameState } from "./GameState";

/** UTC date as YYYY-MM-DD. Used as the leaderboard period and the daily key. */
export function dateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** UTC date as a number, YYYYMMDD. Same date, same seed, on every device. */
export function getDailySeed(date: Date = new Date()): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return year * 10000 + month * 100 + day;
}

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's round: the player against one normal AI, dealt from the UTC date seed. */
export function dailyRound(date: Date = new Date()): GameState {
  return newRound(
    "draw",
    [
      { name: "You", ai: null },
      { name: "AI", ai: "normal" },
    ],
    seededRandom(getDailySeed(date)),
  );
}
