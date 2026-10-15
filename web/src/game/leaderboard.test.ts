import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCORES_URL, submitDailyScore } from "./leaderboard";

const DATE = new Date("2026-10-16T12:00:00Z");

describe("submitDailyScore", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the score with the game id and UTC date as the period", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await submitDailyScore(14, DATE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SCORES_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      game: "tilerun",
      score: 14,
      period: "2026-10-16",
    });
  });

  it("swallows an 'Invalid game' reply without a warning", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Invalid game", { status: 400 })));
    await expect(submitDailyScore(5, DATE)).resolves.toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns, but does not throw, on other server errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    await expect(submitDailyScore(5, DATE)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("swallows network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    await expect(submitDailyScore(5, DATE)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it("does not submit a negative or non-integer score", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await submitDailyScore(-1, DATE);
    await submitDailyScore(2.5, DATE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
