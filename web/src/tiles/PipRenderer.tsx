import type { CSSProperties } from "react";
import type { Pip } from "./Tile";

/** A pip position on a 3×3 grid, as [row, column], both 0–2. */
export type PipPosition = readonly [row: number, col: number];

const TL: PipPosition = [0, 0];
const TR: PipPosition = [0, 2];
const ML: PipPosition = [1, 0];
const MR: PipPosition = [1, 2];
const C: PipPosition = [1, 1];
const BL: PipPosition = [2, 0];
const BR: PipPosition = [2, 2];

/** Canonical domino pip layout: the standard dot pattern for each count. */
export const PIP_LAYOUT: Readonly<Record<Pip, readonly PipPosition[]>> = {
  0: [],
  1: [C],
  2: [TL, BR],
  3: [TL, C, BR],
  4: [TL, TR, BL, BR],
  5: [TL, TR, C, BL, BR],
  6: [TL, TR, ML, MR, BL, BR],
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(3, 1fr)",
  aspectRatio: "1",
  width: "100%",
  padding: "12%",
  boxSizing: "border-box",
};

const DOT_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  aspectRatio: "1",
  borderRadius: "50%",
  background: "var(--pip)",
  justifySelf: "center",
  alignSelf: "center",
};

export function PipRenderer({ pips }: { pips: Pip }) {
  const dots = PIP_LAYOUT[pips];
  return (
    <div role="img" aria-label={`${pips} pips`} style={GRID_STYLE}>
      {dots.map(([row, col]) => (
        <span
          key={`${row}-${col}`}
          data-pip
          style={{ ...DOT_STYLE, gridRow: row + 1, gridColumn: col + 1 }}
        />
      ))}
    </div>
  );
}
