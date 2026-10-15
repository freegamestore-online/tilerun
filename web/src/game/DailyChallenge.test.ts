import { describe, expect, it } from "vitest";
import { dailyRound, dateKey, getDailySeed, seededRandom } from "./DailyChallenge";

describe("getDailySeed", () => {
  it("encodes the UTC date as YYYYMMDD", () => {
    expect(getDailySeed(new Date("2026-10-16T12:00:00Z"))).toBe(20261016);
  });

  it("is the same for every time of day on the same UTC date", () => {
    expect(getDailySeed(new Date("2026-10-16T00:00:01Z"))).toBe(
      getDailySeed(new Date("2026-10-16T23:59:59Z")),
    );
  });
});

describe("dateKey", () => {
  it("uses the UTC date, not local time", () => {
    expect(dateKey(new Date("2026-10-16T23:30:00Z"))).toBe("2026-10-16");
    expect(dateKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const a = seededRandom(20261016);
    const b = seededRandom(20261016);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("returns values in [0, 1)", () => {
    const rnd = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const v = rnd();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("dailyRound", () => {
  const today = new Date("2026-10-16T09:00:00Z");

  it("deals the same hands to every player for a given UTC date", () => {
    const first = dailyRound(today);
    const second = dailyRound(new Date("2026-10-16T21:45:00Z"));
    expect(second.players).toEqual(first.players);
    expect(second.boneyard).toEqual(first.boneyard);
    expect(second.turn).toBe(first.turn);
  });

  it("deals a different shuffle on a different UTC date", () => {
    const monday = dailyRound(new Date("2026-10-16T09:00:00Z"));
    const tuesday = dailyRound(new Date("2026-10-17T09:00:00Z"));
    expect(tuesday.players).not.toEqual(monday.players);
  });

  it("is a two-player draw round against the AI, with 7 tiles each", () => {
    const state = dailyRound(today);
    expect(state.mode).toBe("draw");
    expect(state.players.map((p) => p.hand.length)).toEqual([7, 7]);
    expect(state.players[1]?.ai).toBe("normal");
    expect(state.players[0]?.ai).toBeNull();
    expect(state.boneyard).toHaveLength(14);
    expect(state.board).toBeNull();
  });
});
