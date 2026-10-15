import { useEffect, useState, type ReactNode } from "react";
import { GameAuth, GameShell, GameTopbar } from "@freegamestore/games";
import {
  drawFromBoneyard,
  getAIMove,
  getLegalMoves,
  isRoundOver,
  newRound,
  pass,
  playTile,
  roundWinner,
  scoreRound,
  type Move,
} from "./game/GameEngine";
import type { AILevel, GameMode, GameState } from "./game/GameState";
import { dailyRound, dateKey } from "./game/DailyChallenge";
import { submitDailyScore } from "./game/leaderboard";
import {
  clearSave,
  isDailyDone,
  loadGame,
  markDailyDone,
  saveGame,
  type Opponent,
} from "./game/save";
import { PipRenderer, type Tile } from "./tiles";

interface RoundResult {
  winner: number | null;
  points: number;
}

interface Game {
  state: GameState;
  scores: number[];
  result: RoundResult | null;
  /** UTC date when this is a daily round, otherwise null. */
  daily: string | null;
}

const AI_LEVELS: AILevel[] = ["easy", "normal", "hard"];
const AI_DELAY_MS = 700;
const DEFAULT_OPPONENT: Opponent = { kind: "pass", count: 2 };

const MODE_TEXT: Record<GameMode, string> = {
  draw: "Draw dominoes from the boneyard when you cannot play.",
  block: "No drawing. Pass when you cannot play.",
};

function newGame(mode: GameMode, opponent: Opponent): Game {
  const players =
    opponent.kind === "ai"
      ? [
          { name: "You", ai: null },
          { name: "AI", ai: opponent.level },
        ]
      : Array.from({ length: opponent.count }, (_, i) => ({ name: `Player ${i + 1}`, ai: null }));
  return {
    state: newRound(mode, players),
    scores: players.map(() => 0),
    result: null,
    daily: null,
  };
}

/** Marks the round over and awards points when the state has ended it. */
function settle(state: GameState, scores: readonly number[], daily: string | null): Game {
  if (!isRoundOver(state)) return { state, scores: [...scores], result: null, daily };
  const winner = roundWinner(state);
  const points = winner === null ? 0 : scoreRound(state, winner);
  const nextScores = scores.map((s, i) => (i === winner ? s + points : s));
  return { state, scores: nextScores, result: { winner, points }, daily };
}

/** Applies a new state to the current game, settling the round if it has ended. */
function advance(g: Game | null, next: GameState): Game | null {
  return g ? settle(next, g.scores, g.daily) : g;
}

function movesFor(state: GameState): Move[] {
  const player = state.players[state.turn];
  return player ? getLegalMoves(player.hand, state.board) : [];
}

function canDraw(state: GameState): boolean {
  return state.mode === "draw" && state.boneyard.length > 0 && movesFor(state).length === 0;
}

function canPass(state: GameState): boolean {
  return movesFor(state).length === 0 && (state.mode === "block" || state.boneyard.length === 0);
}

function sameTile(a: Tile, b: Tile): boolean {
  return a.a === b.a && a.b === b.b;
}

/** Restores a saved round on first render, so a reload picks up where it left off. */
function restoreSession(): { game: Game; mode: GameMode; opponent: Opponent } | null {
  const saved = loadGame();
  if (!saved) return null;
  return {
    game: { state: saved.state, scores: saved.scores, result: null, daily: saved.daily },
    mode: saved.mode,
    opponent: saved.opponent,
  };
}

export default function App() {
  const [restored] = useState(restoreSession);
  const [mode, setMode] = useState<GameMode>(restored?.mode ?? "draw");
  const [opponent, setOpponent] = useState<Opponent>(restored?.opponent ?? DEFAULT_OPPONENT);
  const [game, setGame] = useState<Game | null>(restored?.game ?? null);
  const [selected, setSelected] = useState<Tile | null>(null);

  // Applies a state change, settling the round if it has ended.
  const update = (next: GameState) => setGame((g) => advance(g, next));

  // Keeps the in-progress round in localStorage. A finished round clears the save.
  useEffect(() => {
    if (!game) return;
    if (game.result) {
      clearSave();
      return;
    }
    saveGame({
      version: 1,
      state: game.state,
      scores: game.scores,
      mode,
      opponent,
      daily: game.daily,
    });
  }, [game, mode, opponent]);

  // When a daily round ends: mark it done, and submit the score if the player won.
  useEffect(() => {
    if (!game?.result || !game.daily) return;
    markDailyDone(game.daily);
    if (game.result.winner === 0 && game.result.points > 0) {
      void submitDailyScore(game.result.points, new Date(`${game.daily}T00:00:00Z`));
    }
  }, [game?.result, game?.daily]);

  // Runs the AI's turn after a short delay.
  useEffect(() => {
    if (!game || game.result) return;
    const { state } = game;
    const ai = state.players[state.turn]?.ai;
    if (!ai) return;

    const timer = setTimeout(() => {
      const move = getAIMove(state, state.turn, ai);
      let next: GameState;
      if (move) next = playTile(state, state.turn, move.tile, move.end);
      else if (canDraw(state)) next = drawFromBoneyard(state, state.turn);
      else next = pass(state, state.turn);
      setGame((g) => advance(g, next));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game]);

  const shell = (score: number, body: ReactNode) => (
    <GameShell topbar={<GameTopbar title="Tilerun" score={score} />}>
      <GameAuth />
      <div className="flex flex-col items-center gap-4 p-4">{body}</div>
    </GameShell>
  );

  if (!game) {
    return shell(
      0,
      <Setup
        mode={mode}
        setMode={setMode}
        opponent={opponent}
        setOpponent={setOpponent}
        dailyDone={isDailyDone()}
        onStart={() => setGame(newGame(mode, opponent))}
        onDaily={() => {
          setMode("draw");
          setOpponent({ kind: "ai", level: "normal" });
          setGame(dailyRoundGame());
        }}
      />,
    );
  }

  const { state, scores, result } = game;
  const current = state.players[state.turn];
  const humanTurn = !!current && !current.ai;
  const hand = humanTurn && current ? current.hand : [];
  const moves = humanTurn ? movesFor(state) : [];
  const selectedMoves = selected ? moves.filter((m) => sameTile(m.tile, selected)) : [];

  const playMove = (move: Move) => {
    setSelected(null);
    update(playTile(state, state.turn, move.tile, move.end));
  };

  const onTileClick = (tile: Tile) => {
    const options = moves.filter((m) => sameTile(m.tile, tile));
    if (options.length === 0) return;
    if (options.length === 1 && options[0]) playMove(options[0]);
    else setSelected(tile);
  };

  const endLabel = (move: Move): string => {
    if (!move.end || !state.board) return "Open";
    const value = move.end === "left" ? state.board.left : state.board.right;
    return `${move.end === "left" ? "Left" : "Right"} end (${value})`;
  };

  const winnerName =
    result?.winner === null || result?.winner === undefined
      ? null
      : state.players[result.winner]?.name;

  return shell(
    scores[state.turn] ?? 0,
    <>
      {game.daily && <p className="text-sm font-semibold">Daily challenge · {game.daily}</p>}

      <div className="flex flex-wrap justify-center gap-3">
        {state.players.map((p, i) => (
          <div
            key={i}
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              border: `1px solid ${i === state.turn && !result ? "var(--accent)" : "var(--line)"}`,
              color: "var(--ink)",
            }}
          >
            <strong>{p.name}</strong> · {scores[i] ?? 0} pts · {p.hand.length} tiles
          </div>
        ))}
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Boneyard: {state.boneyard.length}
      </p>

      <Board state={state} />

      {result ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-lg font-semibold">
            {winnerName
              ? `${winnerName} wins the round for ${result.points} pts`
              : "The round is tied. No points awarded."}
          </p>
          <div className="flex gap-2">
            {!game.daily && (
              <Button onClick={() => setGame(newGame(mode, opponent))}>New Round</Button>
            )}
            <Button onClick={() => { setGame(null); setSelected(null); }}>Menu</Button>
          </div>
        </div>
      ) : current?.ai ? (
        <p style={{ color: "var(--muted)" }}>{current.name} is thinking…</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold">{current?.name}&rsquo;s turn</p>
          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((tile, i) => (
              <TileFace
                key={`${tile.a}-${tile.b}-${i}`}
                tile={tile}
                size={56}
                highlighted={!!selected && sameTile(selected, tile)}
                onClick={() => onTileClick(tile)}
                disabled={moves.every((m) => !sameTile(m.tile, tile))}
              />
            ))}
          </div>

          {selectedMoves.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              <span className="text-sm" style={{ color: "var(--muted)" }}>Play on:</span>
              {selectedMoves.map((m) => (
                <Button key={m.end} onClick={() => playMove(m)}>
                  {endLabel(m)}
                </Button>
              ))}
              <Button onClick={() => setSelected(null)}>Cancel</Button>
            </div>
          )}

          <div className="flex gap-2">
            {canDraw(state) && (
              <Button onClick={() => update(drawFromBoneyard(state, state.turn))}>Draw</Button>
            )}
            {canPass(state) && (
              <Button onClick={() => update(pass(state, state.turn))}>Pass</Button>
            )}
          </div>
        </div>
      )}
    </>,
  );
}

/** A fresh daily game, with the UTC date recorded so it can be saved and submitted. */
function dailyRoundGame(): Game {
  return { state: dailyRound(), scores: [0, 0], result: null, daily: dateKey() };
}

function Setup({
  mode,
  setMode,
  opponent,
  setOpponent,
  dailyDone,
  onStart,
  onDaily,
}: {
  mode: GameMode;
  setMode: (m: GameMode) => void;
  opponent: Opponent;
  setOpponent: (o: Opponent) => void;
  dailyDone: boolean;
  onStart: () => void;
  onDaily: () => void;
}) {
  return (
    <>
      <h1 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>
        Tilerun
      </h1>

      <Group label="Daily">
        <Button onClick={onDaily} disabled={dailyDone}>
          {dailyDone ? "Daily done for today" : "Daily challenge"}
        </Button>
      </Group>

      <Group label="Game">
        <Button active={mode === "draw"} onClick={() => setMode("draw")}>Draw</Button>
        <Button active={mode === "block"} onClick={() => setMode("block")}>Block</Button>
      </Group>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{MODE_TEXT[mode]}</p>

      <Group label="Opponents">
        <Button
          active={opponent.kind === "pass"}
          onClick={() => setOpponent({ kind: "pass", count: 2 })}
        >
          Pass &amp; Play
        </Button>
        <Button
          active={opponent.kind === "ai"}
          onClick={() => setOpponent({ kind: "ai", level: "normal" })}
        >
          vs AI
        </Button>
      </Group>

      {opponent.kind === "pass" ? (
        <Group label="Players">
          {[2, 3, 4].map((n) => (
            <Button
              key={n}
              active={opponent.count === n}
              onClick={() => setOpponent({ kind: "pass", count: n })}
            >
              {n}
            </Button>
          ))}
        </Group>
      ) : (
        <Group label="Difficulty">
          {AI_LEVELS.map((level) => (
            <Button
              key={level}
              active={opponent.level === level}
              onClick={() => setOpponent({ kind: "ai", level })}
            >
              {level[0]?.toUpperCase()}
              {level.slice(1)}
            </Button>
          ))}
        </Group>
      )}

      <Button onClick={onStart}>Start</Button>
    </>
  );
}

function Board({ state }: { state: GameState }) {
  if (!state.board) {
    return <p style={{ color: "var(--muted)" }}>No tiles yet. Open the game with any tile.</p>;
  }
  return (
    <div className="flex max-w-full flex-wrap justify-center gap-1">
      {state.board.tiles.map((tile, i) => (
        <TileFace key={`${tile.a}-${tile.b}-${i}`} tile={tile} size={40} />
      ))}
    </div>
  );
}

function TileFace({
  tile,
  size,
  onClick,
  disabled,
  highlighted,
}: {
  tile: Tile;
  size: number;
  onClick?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  const face = (
    <div
      className="flex flex-col gap-px rounded-md p-0.5"
      style={{
        width: size,
        background: "var(--paper)",
        border: `2px solid ${highlighted ? "var(--accent)" : "var(--line-strong)"}`,
      }}
    >
      <PipRenderer pips={tile.a} />
      <div style={{ height: 1, background: "var(--line-strong)" }} />
      <PipRenderer pips={tile.b} />
    </div>
  );
  if (!onClick) return face;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Tile ${tile.a}-${tile.b}`}
      className="disabled:opacity-40"
    >
      {face}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-sm" style={{ color: "var(--muted)" }}>{label}:</span>
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  active,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
      style={{
        border: "1px solid var(--line-strong)",
        background: active ? "var(--accent)" : "var(--paper)",
        color: active ? "var(--paper)" : "var(--ink)",
      }}
    >
      {children}
    </button>
  );
}
