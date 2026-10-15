import type { Chain, Tile } from "../tiles";

export type { Chain, Tile };

export type Hand = readonly Tile[];
export type Boneyard = readonly Tile[];

/** The chain of played tiles. `null` before the opening tile is played. */
export type Board = Chain | null;

export type GameMode = "draw" | "block";
export type AILevel = "easy" | "normal" | "hard";

export interface Player {
  name: string;
  hand: Hand;
  /** `null` for a human player; otherwise the AI difficulty. */
  ai: AILevel | null;
}

export interface GameState {
  mode: GameMode;
  players: readonly Player[];
  boneyard: Boneyard;
  board: Board;
  /** Index of the player whose turn it is. */
  turn: number;
  /** Per player: passed on their last turn. Cleared when any tile is played. */
  passed: readonly boolean[];
}
