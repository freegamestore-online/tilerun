import type { AILevel, GameMode, GameState } from "./GameState";
import { dateKey } from "./DailyChallenge";

export type Opponent = { kind: "pass"; count: number } | { kind: "ai"; level: AILevel };

/** An in-progress round, enough to pick up again after a reload. */
export interface SavedGame {
  version: 1;
  state: GameState;
  scores: number[];
  mode: GameMode;
  opponent: Opponent;
  /** UTC date for a daily round, otherwise null. */
  daily: string | null;
}

export const SAVE_KEY = "tilerun_save";
const DAILY_DONE_PREFIX = "tilerun_daily_done_";

function clearStorage(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode, blocked). Nothing to clean up.
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isTileList(x: unknown): boolean {
  return (
    Array.isArray(x) &&
    x.every((t) => isRecord(t) && Number.isInteger(t.a) && Number.isInteger(t.b))
  );
}

function isOpponent(x: unknown): x is Opponent {
  if (!isRecord(x)) return false;
  if (x.kind === "pass") return Number.isInteger(x.count);
  return x.kind === "ai" && (x.level === "easy" || x.level === "normal" || x.level === "hard");
}

function isGameState(x: unknown): x is GameState {
  if (!isRecord(x)) return false;
  if (x.mode !== "draw" && x.mode !== "block") return false;
  if (!Array.isArray(x.players) || x.players.length < 2 || x.players.length > 4) return false;
  if (!x.players.every((p) => isRecord(p) && typeof p.name === "string" && isTileList(p.hand))) {
    return false;
  }
  if (!isTileList(x.boneyard)) return false;
  if (x.board !== null) {
    if (!isRecord(x.board)) return false;
    if (!Number.isInteger(x.board.left) || !Number.isInteger(x.board.right)) return false;
    if (!isTileList(x.board.tiles)) return false;
  }
  if (!Number.isInteger(x.turn) || (x.turn as number) < 0 || (x.turn as number) >= x.players.length) {
    return false;
  }
  return Array.isArray(x.passed) && x.passed.length === x.players.length;
}

function isSavedGame(x: unknown): x is SavedGame {
  if (!isRecord(x) || x.version !== 1) return false;
  if (!isGameState(x.state)) return false;
  if (!Array.isArray(x.scores) || x.scores.length !== x.state.players.length) return false;
  if (x.mode !== "draw" && x.mode !== "block") return false;
  if (!isOpponent(x.opponent)) return false;
  return x.daily === null || typeof x.daily === "string";
}

/** Writes an in-progress round. Storage errors are ignored: the game still runs without a save. */
export function saveGame(saved: SavedGame, storage: Storage = localStorage): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    // Quota or blocked storage. The round simply won't survive a reload.
  }
}

/**
 * Returns the saved round, or null. A corrupt save is discarded. A daily save
 * from an earlier UTC date is discarded too.
 */
export function loadGame(storage: Storage = localStorage, today: string = dateKey()): SavedGame | null {
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearStorage(storage, SAVE_KEY);
    return null;
  }
  if (!isSavedGame(parsed)) {
    clearStorage(storage, SAVE_KEY);
    return null;
  }
  if (parsed.daily !== null && parsed.daily !== today) {
    clearStorage(storage, SAVE_KEY);
    return null;
  }
  return parsed;
}

export function clearSave(storage: Storage = localStorage): void {
  clearStorage(storage, SAVE_KEY);
}

/** Whether today's daily round has already been finished on this device. */
export function isDailyDone(date: string = dateKey(), storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(`${DAILY_DONE_PREFIX}${date}`) === "1";
  } catch {
    return false;
  }
}

export function markDailyDone(date: string = dateKey(), storage: Storage = localStorage): void {
  try {
    storage.setItem(`${DAILY_DONE_PREFIX}${date}`, "1");
  } catch {
    // Without storage the daily can be replayed. That's acceptable.
  }
}
