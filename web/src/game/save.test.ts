import { beforeEach, describe, expect, it } from "vitest";
import { dailyRound } from "./DailyChallenge";
import { getLegalMoves, playTile } from "./GameEngine";
import {
  clearSave,
  isDailyDone,
  loadGame,
  markDailyDone,
  SAVE_KEY,
  saveGame,
  type SavedGame,
} from "./save";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as unknown as Storage;
}

const TODAY = "2026-10-16";

function savedRound(daily: string | null = null): SavedGame {
  return {
    version: 1,
    state: dailyRound(new Date(`${TODAY}T10:00:00Z`)),
    scores: [0, 0],
    mode: "draw",
    opponent: { kind: "ai", level: "normal" },
    daily,
  };
}

describe("save and resume", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("restores exactly what was saved", () => {
    const saved = savedRound();
    saveGame(saved, storage);
    expect(loadGame(storage, TODAY)).toEqual(saved);
  });

  it("resumes mid-round: a move played before the reload carries over", () => {
    const start = savedRound();
    const mover = start.state.players[start.state.turn];
    const move = mover ? getLegalMoves(mover.hand, start.state.board)[0] : undefined;
    expect(move).toBeDefined();

    const played = playTile(start.state, start.state.turn, move!.tile, move!.end);
    saveGame({ ...start, state: played }, storage);

    const resumed = loadGame(storage, TODAY);
    expect(resumed?.state).toEqual(played);
    expect(resumed?.state.board?.tiles).toHaveLength(1);
    // The resumed game is still playable: the next player can move.
    const next = resumed!.state.players[resumed!.state.turn];
    expect(getLegalMoves(next!.hand, resumed!.state.board).length).toBeGreaterThan(0);
  });

  it("returns null when nothing is saved", () => {
    expect(loadGame(storage, TODAY)).toBeNull();
  });

  it("discards a corrupt save", () => {
    storage.setItem(SAVE_KEY, "{not json");
    expect(loadGame(storage, TODAY)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it("discards a save with the wrong shape or version", () => {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...savedRound(), version: 2 }));
    expect(loadGame(storage, TODAY)).toBeNull();

    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: { mode: "draw" } }));
    expect(loadGame(storage, TODAY)).toBeNull();
  });

  it("keeps a daily save from today", () => {
    saveGame(savedRound(TODAY), storage);
    expect(loadGame(storage, TODAY)?.daily).toBe(TODAY);
  });

  it("discards a daily save from an earlier UTC date", () => {
    saveGame(savedRound("2026-10-15"), storage);
    expect(loadGame(storage, TODAY)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it("clearSave removes the save", () => {
    saveGame(savedRound(), storage);
    clearSave(storage);
    expect(loadGame(storage, TODAY)).toBeNull();
  });
});

describe("daily completion", () => {
  it("records that today's daily is done", () => {
    const storage = fakeStorage();
    expect(isDailyDone(TODAY, storage)).toBe(false);
    markDailyDone(TODAY, storage);
    expect(isDailyDone(TODAY, storage)).toBe(true);
    expect(isDailyDone("2026-10-17", storage)).toBe(false);
  });
});
