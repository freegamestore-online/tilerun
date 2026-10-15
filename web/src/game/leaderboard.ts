import { dateKey } from "./DailyChallenge";

export const GAME_ID = "tilerun";

// Same endpoint the @freegamestore/games SDK posts to.
export const SCORES_URL = "https://leaderboard.freegamestore.online/v1/api/scores";

/**
 * Submits the daily round's winning score for the given UTC date. Never throws.
 * An "Invalid game" reply is ignored silently. Other failures are logged as a warning.
 */
export async function submitDailyScore(points: number, date: Date = new Date()): Promise<void> {
  if (!Number.isInteger(points) || points < 0) return;

  try {
    const res = await fetch(SCORES_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: GAME_ID, score: points, period: dateKey(date) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (!detail.includes("Invalid game")) {
        console.warn(`leaderboard submit failed (${res.status}): ${detail.slice(0, 200)}`);
      }
    }
  } catch (err) {
    console.warn("leaderboard submit failed:", err);
  }
}
