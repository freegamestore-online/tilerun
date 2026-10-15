import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PIP_LAYOUT, PipRenderer } from "./PipRenderer";
import type { Pip } from "./Tile";

const COUNTS: Pip[] = [0, 1, 2, 3, 4, 5, 6];

describe("PipRenderer", () => {
  it.each(COUNTS)("renders %i pip dots", (pips) => {
    const { container } = render(<PipRenderer pips={pips} />);
    expect(container.querySelectorAll("[data-pip]")).toHaveLength(pips);
  });

  it.each(COUNTS)("labels the face with its count (%i)", (pips) => {
    render(<PipRenderer pips={pips} />);
    expect(screen.getByRole("img", { name: `${pips} pips` })).toBeInTheDocument();
  });

  it.each(COUNTS)("places %i dots on distinct cells of the 3×3 grid", (pips) => {
    const positions = PIP_LAYOUT[pips].map(([r, c]) => `${r},${c}`);
    expect(new Set(positions).size).toBe(pips);
    for (const [r, c] of PIP_LAYOUT[pips]) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(2);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(2);
    }
  });

  it("uses the canonical pattern for the 3 face (diagonal)", () => {
    expect(PIP_LAYOUT[3]).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });

  it("uses the canonical pattern for the 6 face (two columns of three)", () => {
    const cols = PIP_LAYOUT[6].map(([, c]) => c);
    expect(cols.filter((c) => c === 0)).toHaveLength(3);
    expect(cols.filter((c) => c === 2)).toHaveLength(3);
    expect(cols.filter((c) => c === 1)).toHaveLength(0);
  });
});
