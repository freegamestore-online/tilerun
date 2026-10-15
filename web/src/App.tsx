import { useCallback, useEffect, useState, type ReactNode } from "react";
import { GameAuth, GameShell, GameTopbar, useGameSounds } from "@freegamestore/games";
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
import { Celebration } from "./feel/Celebration";
import { PipRenderer, type Tile } from "./tiles";

interface RoundResult {
  winner: number | null;
  points: number;
}

interface Game {
  /** Identifies one round, so its win celebration plays once. */
  id: string;
  state: GameState;
  scores: number[];
  result: RoundResult | null;
  /** UTC date when this is a daily round, otherwise null. */
  daily: string | null;
}

type Cue = "place" | "draw" | "pass";
type Sounds = ReturnType<typeof useGameSounds>;

/** Plays the sound for a state change. A round that ends on an AI or a blocked board is a loss cue. */
function playCue(sounds: Sounds, next: GameState, cue: Cue): void {
  if (isRoundOver(next)) {
    if (roundWinner(next) !== 0) sounds.playGameOver();
  } else if (cue === "place") {
    sounds.playDrop();
  } else {
    sounds.playTick();
  }
}

const AI_LEVELS: AILevel[] = ["easy", "normal", "hard"];
const AI_DELAY_MS = 700;
const DEFAULT_OPPONENT: Opponent = { kind: "pass", count: 2 };

const MODE_TEXT: Record<GameMode, string> = {
  draw: "Draw dominoes from the boneyard when you cannot play.",
  block: "No drawing. Pass when you cannot play.",
};

function nextGameId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newGame(mode: GameMode, opponent: Opponent): Game {
  const players =
    opponent.kind === "ai"
      ? [
          { name: "You", ai: null },
          { name: "AI", ai: opponent.level },
        ]
      : Array.from({ length: opponent.count }, (_, i) => ({ name: `Player ${i + 1}`, ai: null }));
  return {
    id: nextGameId(),
    state: newRound(mode, players),
    scores: players.map(() => 0),
    result: null,
    daily: null,
  };
}

/** Marks the round over and awards points when the state has ended it. */
function settle(g: Game, state: GameState): Game {
  if (!isRoundOver(state)) return { ...g, state, result: null };
  const winner = roundWinner(state);
  const points = winner === null ? 0 : scoreRound(state, winner);
  const scores = g.scores.map((s, i) => (i === winner ? s + points : s));
  return { ...g, state, scores, result: { winner, points } };
}

/** Applies a new state to the current game, settling the round if it has ended. */
function advance(g: Game | null, next: GameState): Game | null {
  return g ? settle(g, next) : g;
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
    game: {
      id: nextGameId(),
      state: saved.state,
      scores: saved.scores,
      result: null,
      daily: saved.daily,
    },
    mode: saved.mode,
    opponent: saved.opponent,
  };
}

/** A fresh daily game, with the UTC date recorded so it can be saved and submitted. */
function dailyRoundGame(): Game {
  return {
    id: nextGameId(),
    state: dailyRound(),
    scores: [0, 0],
    result: null,
    daily: dateKey(),
  };
}

export default function App() {
  return (
    <GameShell topbar={<GameTopbar title="Tilerun" />}>
      <GameAuth />
      <Tilerun />
    </GameShell>
  );
}

/** The game itself. It sits inside GameShell so the sound hook sees the platform mute setting. */
function Tilerun() {
  const [restored] = useState(restoreSession);
  const [mode, setMode] = useState<GameMode>(restored?.mode ?? "draw");
  const [opponent, setOpponent] = useState<Opponent>(restored?.opponent ?? DEFAULT_OPPONENT);
  const [game, setGame] = useState<Game | null>(restored?.game ?? null);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [celebrated, setCelebrated] = useState<string | null>(null);
  const sounds = useGameSounds();

  const onCelebrationDone = useCallback((id: string) => setCelebrated(id), []);

  const update = (next: GameState, cue: Cue) => {
    playCue(sounds, next, cue);
    setGame((g) => advance(g, next));
  };

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
      let cue: Cue;
      if (move) {
        next = playTile(state, state.turn, move.tile, move.end);
        cue = "place";
      } else if (canDraw(state)) {
        next = drawFromBoneyard(state, state.turn);
        cue = "draw";
      } else {
        next = pass(state, state.turn);
        cue = "pass";
      }
      playCue(sounds, next, cue);
      setGame((g) => advance(g, next));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game, sounds]);

  if (!game) {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
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
        />
      </div>
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
    update(playTile(state, state.turn, move.tile, move.end), "place");
  };

  const onTileClick = (tile: Tile) => {
    const options = moves.filter((m) => sameTile(m.tile, tile));
    if (options.length === 0) return;
    if (options.length === 1 && options[0]) {
      playMove(options[0]);
    } else {
      sounds.playTick();
      setSelected(tile);
    }
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

  const humanWon = result?.winner === 0;
  const firstName = state.players[0]?.name ?? "You";
  const winLabel = firstName === "You" ? "You win the round!" : `${firstName} wins the round!`;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {game.daily && <p className="text-sm font-semibold">Daily challenge · {game.daily}</p>}

      <div className="flex flex-wrap justify-center gap-3">
        {state.players.map((p, i) => (
          <div
            key={i}
            className={`player-card${i === state.turn && !result ? " is-turn" : ""}`}
          >
            <strong>{p.name}</strong> · {scores[i] ?? 0} pts · {p.hand.length} tiles
          </div>
        ))}
      </div>

      <p className="muted-text">Boneyard: {state.boneyard.length}</p>

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
        <p className="muted-text">{current.name} is thinking…</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="font-semibold">{current?.name}&rsquo;s turn</p>
          <div className="flex flex-wrap justify-center gap-2">
            {hand.map((tile, i) => (
              <button
                key={`${tile.a}-${tile.b}-${i}`}
                type="button"
                className="tile-button"
                onClick={() => onTileClick(tile)}
                disabled={moves.every((m) => !sameTile(m.tile, tile))}
                aria-label={`Tile ${tile.a}-${tile.b}`}
              >
                <TileFace
                  tile={tile}
                  size="lg"
                  selected={!!selected && sameTile(selected, tile)}
                />
              </button>
            ))}
          </div>

          {selectedMoves.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2">
              <span className="muted-text">Play on:</span>
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
              <Button onClick={() => update(drawFromBoneyard(state, state.turn), "draw")}>Draw</Button>
            )}
            {canPass(state) && (
              <Button onClick={() => update(pass(state, state.turn), "pass")}>Pass</Button>
            )}
          </div>
        </div>
      )}

      {humanWon && celebrated !== game.id && (
        <Celebration id={game.id} label={winLabel} onDone={onCelebrationDone} />
      )}
    </div>
  );
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
      <p className="muted-text">{MODE_TEXT[mode]}</p>

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
  const tiles = state.board?.tiles ?? [];
  const last = tiles.length - 1;
  return (
    <div className="table flex min-h-20 flex-wrap items-center justify-center gap-1">
      {tiles.length === 0 && (
        <p className="muted-text">No tiles yet. Open the game with any tile.</p>
      )}
      {tiles.map((tile, i) => (
        <TileFace key={`${tile.a}-${tile.b}-${i}`} tile={tile} size="sm" glow={i === last} />
      ))}
    </div>
  );
}

function TileFace({
  tile,
  size,
  glow,
  selected,
}: {
  tile: Tile;
  size: "sm" | "lg";
  glow?: boolean;
  selected?: boolean;
}) {
  const classes = [
    "tile-face",
    size === "lg" ? "tile-lg" : "tile-sm",
    selected ? "is-selected" : "",
    glow ? "tile-placed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <PipRenderer pips={tile.a} />
      <div className="tile-divider" />
      <PipRenderer pips={tile.b} />
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="muted-text">{label}:</span>
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
      className={`btn${active ? " btn-active" : ""}`}
    >
      {children}
    </button>
  );
}
