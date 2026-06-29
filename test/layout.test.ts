import { describe, it, expect } from "vitest";
import { renderCells, buildProgression } from "../src/layout.js";
import { buildChart } from "../src/build.js";
import { obfuscate, deobfuscate } from "../src/obfuscate.js";
import type { Chart } from "../src/types.js";

/** Cells = comma-separated slots within a measure body. */
function cellCount(measureBody: string): number {
  return measureBody.split(",").length;
}

describe("renderCells (comma-joined cells — exactly N per measure, never 3 spaces)", () => {
  it("renders a single chord as 4 comma-joined cells", () => {
    const { text, overflow } = renderCells(["C^7"], 4);
    expect(text).toBe("C^7, , , ");
    expect(overflow).toBe(false);
    expect(cellCount(text)).toBe(4);
    expect(/ {3,}/.test(text)).toBe(false);
  });

  it("spreads two chords across 4 cells (beats 1 and 3)", () => {
    expect(renderCells(["A-7", "D7"], 4).text).toBe("A-7, ,D7, ");
  });

  it("fills all four cells for four chords", () => {
    expect(renderCells(["C", "D", "E", "F"], 4).text).toBe("C,D,E,F");
  });

  it("handles three chords (first three cells filled)", () => {
    expect(renderCells(["C", "D", "E"], 4).text).toBe("C,D,E, ");
  });

  it("renders an empty measure as 4 empty cells", () => {
    expect(renderCells([], 4).text).toBe(" , , , ");
  });

  it("packs overflow at small size and flags it", () => {
    const { text, overflow } = renderCells(["C", "D", "E", "F", "G"], 4);
    expect(overflow).toBe(true);
    expect(text).toBe("sC,D,E,F,Gl");
  });

  it("always fills exactly `cells` cells and never 3+ spaces", () => {
    for (const cells of [4, 8]) {
      for (const n of [1, 2, 4]) {
        const chords = Array.from({ length: n }, (_, i) => "C" + i);
        const { text } = renderCells(chords, cells);
        expect(cellCount(text)).toBe(cells);
        expect(/ {3,}/.test(text)).toBe(false);
      }
    }
  });
});

describe("buildProgression", () => {
  const blues: Chart = {
    title: "Test Blues",
    key: "C",
    measures: [
      { chords: ["C7"] },
      { chords: ["F7"] },
      { chords: ["C7"] },
      { chords: ["C7"] },
    ],
  };

  it("opens with a barline + time signature and closes with Z", () => {
    const { progression } = buildProgression(blues);
    expect(progression.startsWith("[T44")).toBe(true);
    expect(progression.endsWith("Z")).toBe(true);
  });

  it("makes every measure exactly 4 cells (the 4-bars-per-line requirement)", () => {
    const { progression, cellsPerMeasure } = buildProgression(blues);
    expect(cellsPerMeasure).toBe(4);
    const measures = progression
      .replace(/^\[T44/, "")
      .replace(/Z$/, "")
      .split("|")
      .filter((m) => m.length > 0);
    for (const m of measures) {
      expect(cellCount(m)).toBe(4); // C7, , , -> 4 cells
    }
  });

  it("never produces 3+ spaces, so it never obfuscates to a glued XyQ chord", () => {
    const { progression } = buildProgression(blues);
    expect(/ {3,}/.test(progression)).toBe(false);
    const payload = obfuscate(progression);
    expect(payload.includes("XyQ")).toBe(false);
    expect(deobfuscate(payload)).toBe(progression); // still round-trips
  });

  it("renders single-chord bars as comma cells (C7, , ,) not space padding", () => {
    const { progression } = buildProgression(blues);
    expect(progression).toContain("C7, , , ");
    expect(progression).not.toContain("C7   "); // never 3 spaces
  });

  it("warns when a chart is suspiciously short (likely a fragment)", () => {
    const short = buildChart({ title: "frag", key: "C", measures: [{ chords: ["C"] }, { chords: ["G"] }] });
    expect(short.warnings.some((w) => /Only 2 bars/.test(w))).toBe(true);
    const full = buildChart({
      title: "full", key: "C",
      measures: Array.from({ length: 24 }, () => ({ chords: ["C"] })),
    });
    expect(full.warnings.some((w) => /most songs are a full form/.test(w))).toBe(false);
  });

  it("places section marks and repeat barlines", () => {
    const chart: Chart = {
      title: "Sectioned",
      measures: [
        { chords: ["C"], section: "A", open: "{" },
        { chords: ["G"], close: "}" },
        { chords: ["F"], section: "B" },
        { chords: ["C"] },
      ],
    };
    const { progression } = buildProgression(chart);
    expect(progression).toContain("*A");
    expect(progression).toContain("{");
    expect(progression).toContain("}");
    expect(progression).toContain("*B");
  });

  it("computes 4-per-line line counts", () => {
    const chart: Chart = {
      title: "Long",
      measures: Array.from({ length: 32 }, () => ({ chords: ["C"] })),
    };
    const { lineCount } = buildProgression(chart);
    expect(lineCount).toBe(8);
  });
});
