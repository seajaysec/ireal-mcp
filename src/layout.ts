/**
 * Layout engine: turn a structured {@link Chart} into an iReal Pro progression
 * string with a fixed number of measures per line.
 *
 * iReal Pro lays the chart out as a grid of 16 cells per line. A chord or a
 * space occupies one cell; barlines, time signatures, rehearsal marks, endings
 * and staff text are free. The app wraps to a new line after 16 cells.
 *
 * The trick to a stable "4 measures per line" reading layout is therefore to
 * pad EVERY measure to exactly `16 / measuresPerLine` cells. With 4 measures
 * per line that is 4 cells per measure — and the app wraps deterministically.
 */
import { CELLS_PER_LINE, TIME_SIGNATURES, DEFAULT_TIME_SIGNATURE } from "./constants.js";
import type { Chart, Measure } from "./types.js";

export const VALID_MEASURES_PER_LINE = [1, 2, 4, 8, 16];

export interface LayoutResult {
  progression: string;
  warnings: string[];
  /** Number of laid-out lines (for the 12-line limit check). */
  lineCount: number;
  cellsPerMeasure: number;
}

/**
 * Distribute a measure's chords across `cells` cells.
 * Every measure must occupy exactly `cells` cells so iReal Pro wraps to a fixed
 * number of bars per line (16 cells / line; 4 cells -> 4 bars/line). Following
 * docs/irealstudio/pyrealpro.py, we distribute the chords across `cells` slots
 * (chord or empty) and join them with COMMAS. A single-chord bar is "C, , ,"
 * (chord + 3 empty cells) — exactly 4 cells, and crucially it never produces 3
 * consecutive spaces, which would obfuscate to the token "XyQ" glued onto the
 * chord ("FXyQ") and be rejected by iReal. (Space-padding "C   " does both
 * wrong: it imports-broken AND, at one space, collapses to 2 cells -> 8/line.)
 *
 * - Empty measure -> `cells` empty cells.
 * - n <= cells: distributed evenly into `cells` comma-joined slots.
 * - n > cells: more chords than the bar holds -> pack with commas at small size
 *   (`s...l`); flagged by the caller (the fixed-bars-per-line guarantee breaks).
 */
export function renderCells(
  chords: string[],
  cells: number,
): { text: string; overflow: boolean } {
  const real = chords.map((c) => c.trim()).filter((c) => c.length > 0);

  if (real.length === 0) {
    return { text: Array(cells).fill(" ").join(","), overflow: false };
  }

  if (real.length > cells) {
    return { text: "s" + real.join(",") + "l", overflow: true };
  }

  // Distribute chords into exactly `cells` slots (pyrealpro-style).
  let slots: string[];
  if (real.length === cells) {
    slots = real.slice();
  } else if (cells % real.length === 0) {
    const pad = cells / real.length; // cells per chord
    slots = [];
    for (const ch of real) {
      slots.push(ch);
      for (let k = 1; k < pad; k++) slots.push(" ");
    }
  } else {
    // Uneven (e.g. 3 chords in 4 cells): chords first, pad the rest with cells.
    slots = real.slice();
    while (slots.length < cells) slots.push(" ");
  }

  return { text: slots.join(","), overflow: false };
}

function timeSigToken(ts: string): string | null {
  return TIME_SIGNATURES[ts] ?? null;
}

/** Render the chord/symbol body of a single measure (no barlines). */
function renderMeasureBody(
  m: Measure,
  cells: number,
): { text: string; overflow: boolean } {
  if (m.noChord) {
    return renderCells(["n"], cells);
  }
  if (m.repeatPrevious === "measure") {
    return renderCells(["x"], cells);
  }
  if (m.repeatPrevious === "twoMeasures") {
    return renderCells(["r"], cells);
  }
  return renderCells(m.chords ?? [], cells);
}

/**
 * Build the full progression string from a structured chart.
 */
export function buildProgression(chart: Chart): LayoutResult {
  const warnings: string[] = [];
  const measuresPerLine = chart.measuresPerLine ?? 4;

  if (!VALID_MEASURES_PER_LINE.includes(measuresPerLine)) {
    warnings.push(
      `measuresPerLine=${measuresPerLine} does not divide 16; layout may not wrap cleanly. ` +
        `Use one of ${VALID_MEASURES_PER_LINE.join(", ")} (4 recommended).`,
    );
  }
  const cellsPerMeasure = Math.max(1, Math.floor(CELLS_PER_LINE / measuresPerLine));

  const measures = chart.measures ?? [];
  if (measures.length === 0) {
    warnings.push("Chart has no measures.");
  }

  const defaultTs = chart.timeSignature ?? DEFAULT_TIME_SIGNATURE;
  if (!timeSigToken(defaultTs)) {
    warnings.push(`Unsupported time signature "${defaultTs}"; falling back to 4/4.`);
  }

  // Resolve barlines per measure, applying section-start defaults.
  const opens: string[] = [];
  const closes: string[] = [];
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    let open = m.open ?? "";
    let close = m.close ?? "|";

    if (i === 0 && open === "") open = "["; // chart must start with a barline
    if (i === measures.length - 1 && m.close === undefined) close = "Z";

    // A section start mid-chart gets a double-bar open + previous double-bar close.
    if (i > 0 && m.section && m.open === undefined && open === "") {
      open = "[";
      if (measures[i - 1].close === undefined && closes[i - 1] === "|") {
        closes[i - 1] = "]";
      }
    }
    opens.push(open);
    closes.push(close);
  }

  let currentTs = defaultTs;
  let progression = "";

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    let seg = "";

    if (m.section) seg += "*" + m.section;
    seg += opens[i];

    // Time signature: always on the first measure; afterwards on change.
    const ts = m.timeSignature ?? (i === 0 ? defaultTs : currentTs);
    if (i === 0 || (m.timeSignature && m.timeSignature !== currentTs)) {
      const tok = timeSigToken(ts) ?? timeSigToken("4/4")!;
      seg += tok;
      currentTs = ts;
    }

    if (m.ending !== undefined) seg += "N" + m.ending;
    if (m.staffText) seg += "<" + m.staffText.replaceAll("<", "(").replaceAll(">", ")") + ">";
    if (m.segno) seg += "S";
    if (m.fermata) seg += "f";

    const body = renderMeasureBody(m, cellsPerMeasure);
    if (body.overflow) {
      warnings.push(
        `Measure ${i + 1} has more chords than the ${cellsPerMeasure}-cell budget; ` +
          `packed at small size — this line may not hold ${measuresPerLine} measures.`,
      );
    }
    seg += body.text;

    if (m.coda) seg += "Q";

    // Repeat-count staff text for the measure that closes a repeat.
    if (m.repeatTimes && m.repeatTimes !== 2 && closes[i] === "}") {
      seg += `<${m.repeatTimes}x>`;
    }

    seg += closes[i];
    progression += seg;
  }

  // Safety net: never let 3+ consecutive spaces survive (they obfuscate to the
  // "XyQ" token glued onto the preceding chord, which iReal rejects). We never
  // intentionally emit markup runs, so collapsing to a single space is safe.
  progression = progression.replace(/ {3,}/g, " ");

  const lineCount = Math.ceil(measures.length / measuresPerLine);
  return { progression, warnings, lineCount, cellsPerMeasure };
}
