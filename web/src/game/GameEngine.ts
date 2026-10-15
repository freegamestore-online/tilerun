import {
  canPlace,
  FULL_SET,
  matchingEnds,
  place,
  startChain,
  type End,
  type Tile,
} from "../tiles";
import type {
  AILevel,
  Board,
  GameMode,
  GameState,
  Hand,
  Player,
} from "./GameState";

export interface Move {
  tile: Tile;
  /** Undefined only for the opening tile, which has no board end yet. */
  end?: End;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export function tilesPerHand(numPlayers: number): number {
  return numPlayers === 2 ? 7 : 5;
}

function pipTotal(hand: Hand): number {
  return hand.reduce((sum, t) => sum + t.a + t.b, 0);
}

function sameTile(x: Tile, y: Tile): boolean {
  return x.a === y.a && x.b === y.b;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Shuffles the double-six set and deals `tilesPerHand` tiles to each player. The rest is the boneyard. */
export function dealHands(
  numPlayers: number,
  perHand: number = tilesPerHand(numPlayers),
  random: () => number = Math.random,
): { hands: Tile[][]; boneyard: Tile[] } {
  if (!Number.isInteger(numPlayers) || numPlayers < MIN_PLAYERS || numPlayers > MAX_PLAYERS) {
    throw new RangeError(`Players must be ${MIN_PLAYERS}–${MAX_PLAYERS}, got ${numPlayers}`);
  }
  if (numPlayers * perHand > FULL_SET.length) {
    throw new RangeError("Not enough tiles to deal those hands");
  }
  const deck = shuffle(FULL_SET, random);
  const hands = Array.from({ length: numPlayers }, (_, i) =>
    deck.slice(i * perHand, (i + 1) * perHand),
  );
  return { hands, boneyard: deck.slice(numPlayers * perHand) };
}

/**
 * The player holding the highest double opens the round. If nobody holds a
 * double, the player holding the highest-scoring tile opens it.
 */
export function openingPlayer(hands: readonly Hand[]): number {
  let best = -1;
  let bestValue = -1;
  hands.forEach((hand, idx) => {
    for (const t of hand) {
      if (t.a !== t.b) continue;
      if (t.a > bestValue) {
        bestValue = t.a;
        best = idx;
      }
    }
  });
  if (best !== -1) return best;

  let bestSum = -1;
  hands.forEach((hand, idx) => {
    for (const t of hand) {
      if (t.a + t.b > bestSum) {
        bestSum = t.a + t.b;
        best = idx;
      }
    }
  });
  return best;
}

export function newRound(
  mode: GameMode,
  players: readonly { name: string; ai: AILevel | null }[],
  random: () => number = Math.random,
): GameState {
  const { hands, boneyard } = dealHands(players.length, tilesPerHand(players.length), random);
  return {
    mode,
    players: players.map((p, i) => ({ name: p.name, ai: p.ai, hand: hands[i] ?? [] })),
    boneyard,
    board: null,
    turn: openingPlayer(hands),
    passed: players.map(() => false),
  };
}

export function getLegalMoves(hand: Hand, board: Board): Move[] {
  if (!board) return hand.map((tile) => ({ tile }));
  return hand.flatMap((tile) => matchingEnds(board, tile).map((end) => ({ tile, end })));
}

function canPlayerMove(player: Player, board: Board): boolean {
  return getLegalMoves(player.hand, board).length > 0;
}

function nextTurn(state: GameState): number {
  return (state.turn + 1) % state.players.length;
}

function assertTurn(state: GameState, playerIdx: number): void {
  if (playerIdx !== state.turn) {
    throw new Error(`It is player ${state.turn}'s turn, not ${playerIdx}`);
  }
}

function withPlayer(state: GameState, idx: number, patch: Partial<Player>): Player[] {
  return state.players.map((p, i) => (i === idx ? { ...p, ...patch } : p));
}

/** Plays `tile` from the player's hand on `end`. Advances the turn. Throws if the move is illegal. */
export function playTile(state: GameState, playerIdx: number, tile: Tile, end?: End): GameState {
  assertTurn(state, playerIdx);
  const player = state.players[playerIdx];
  if (!player) throw new Error(`No player ${playerIdx}`);

  const inHand = player.hand.some((t) => sameTile(t, tile));
  if (!inHand) throw new Error(`Tile [${tile.a}, ${tile.b}] is not in player ${playerIdx}'s hand`);

  if (state.board && (!end || !matchingEnds(state.board, tile).includes(end))) {
    throw new Error(`Illegal placement of [${tile.a}, ${tile.b}]` + (end ? ` on the ${end} end` : ""));
  }

  const board = state.board ? place(state.board, tile, end) : startChain(tile);
  const hand = player.hand.filter((t) => !sameTile(t, tile));
  return {
    ...state,
    players: withPlayer(state, playerIdx, { hand }),
    board,
    turn: nextTurn(state),
    passed: state.passed.map(() => false),
  };
}

/**
 * Draw game only. The player draws from the boneyard until they hold a legal
 * move or the boneyard runs out. The turn stays with them.
 */
export function drawFromBoneyard(state: GameState, playerIdx: number): GameState {
  assertTurn(state, playerIdx);
  if (state.mode !== "draw") throw new Error("Drawing is only allowed in a draw game");

  const player = state.players[playerIdx];
  if (!player) throw new Error(`No player ${playerIdx}`);
  if (canPlayerMove(player, state.board)) {
    throw new Error("Player already has a legal move");
  }

  const boneyard = [...state.boneyard];
  const hand = [...player.hand];
  while (boneyard.length > 0) {
    const drawn = boneyard.pop() as Tile;
    hand.push(drawn);
    if (getLegalMoves(hand, state.board).length > 0) break;
  }
  return {
    ...state,
    boneyard,
    players: withPlayer(state, playerIdx, { hand }),
  };
}

/**
 * Passes the turn. Only allowed when the player has no legal move, and in a
 * draw game only once the boneyard is empty.
 */
export function pass(state: GameState, playerIdx: number): GameState {
  assertTurn(state, playerIdx);
  const player = state.players[playerIdx];
  if (!player) throw new Error(`No player ${playerIdx}`);
  if (canPlayerMove(player, state.board)) {
    throw new Error("Cannot pass while a legal move exists");
  }
  if (state.mode === "draw" && state.boneyard.length > 0) {
    throw new Error("Must draw from the boneyard before passing");
  }

  const passed = state.passed.map((p, i) => (i === playerIdx ? true : p));
  return { ...state, passed, turn: nextTurn(state) };
}

/** Nobody can play, and in a draw game nobody can draw either. */
function isBlocked(state: GameState): boolean {
  if (!state.board) return false;
  const nobodyCanPlay = state.players.every((p) => !canPlayerMove(p, state.board));
  if (!nobodyCanPlay) return false;
  return state.mode === "block" || state.boneyard.length === 0;
}

/**
 * The round ends when a player empties their hand, when every player has passed
 * in a row, or when the board is blocked with no legal move for anyone.
 */
export function isRoundOver(state: GameState): boolean {
  if (state.players.some((p) => p.hand.length === 0)) return true;
  if (state.passed.length > 0 && state.passed.every(Boolean)) return true;
  return isBlocked(state);
}

/**
 * The player who went out, or in a blocked round the one with the lowest pip
 * total. Returns null when the blocked round is tied for lowest.
 */
export function roundWinner(state: GameState): number | null {
  const out = state.players.findIndex((p) => p.hand.length === 0);
  if (out !== -1) return out;

  const totals = state.players.map((p) => pipTotal(p.hand));
  const lowest = Math.min(...totals);
  const leaders = totals.flatMap((t, i) => (t === lowest ? [i] : []));
  return leaders.length === 1 ? (leaders[0] ?? null) : null;
}

/** Points for the winner: the total pips left in all opponents' hands. */
export function scoreRound(state: GameState, winnerIdx: number): number {
  return state.players.reduce(
    (sum, p, i) => (i === winnerIdx ? sum : sum + pipTotal(p.hand)),
    0,
  );
}

function boardAfter(board: Board, move: Move): Board {
  if (!board) return startChain(move.tile);
  return place(board, move.tile, move.end);
}

/** Picks the AI's move for the given difficulty, or null when it has no legal move. */
export function getAIMove(
  state: GameState,
  playerIdx: number,
  level: AILevel,
  random: () => number = Math.random,
): Move | null {
  const player = state.players[playerIdx];
  if (!player) return null;
  const moves = getLegalMoves(player.hand, state.board);
  if (moves.length === 0) return null;

  if (level === "easy") {
    return moves[Math.floor(random() * moves.length)] ?? null;
  }

  if (level === "normal") {
    // Maximise the number of its own tiles that stay playable after the move.
    return bestBy(moves, (move) => {
      const board = boardAfter(state.board, move);
      return player.hand.filter((t) => !sameTile(t, move.tile) && (!board || canPlace(board, t))).length;
    });
  }

  // Hard: minimise the pips in opponents' hands they can play on the next turn,
  // then dump the highest-pip tile.
  return bestBy(
    moves,
    (move) => {
      const board = boardAfter(state.board, move);
      const oppPlayable = state.players.reduce((sum, p, i) => {
        if (i === playerIdx) return sum;
        return sum + p.hand.filter((t) => board && canPlace(board, t)).reduce((s, t) => s + t.a + t.b, 0);
      }, 0);
      return -oppPlayable * 100 + move.tile.a + move.tile.b;
    },
  );
}

/** The move with the highest score. Ties go to the earliest move. */
function bestBy(moves: readonly Move[], score: (m: Move) => number): Move {
  let best = moves[0] as Move;
  let bestScore = score(best);
  for (const move of moves.slice(1)) {
    const s = score(move);
    if (s > bestScore) {
      best = move;
      bestScore = s;
    }
  }
  return best;
}
