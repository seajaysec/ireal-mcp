/**
 * Parse a musician-friendly text chart into structured measures.
 *
 * Format (forgiving, looks like a lead sheet):
 *   - Bars are separated by `|`. Chords in a bar are separated by spaces.
 *   - A `[Section]` header labels what follows: A/B/C/D and "Verse"/"Intro"
 *     map to iReal rehearsal marks; any other name shows as staff text.
 *   - `{ ... }` marks a repeat; add `x3` after `}` for a play-count.
 *   - `%` is an empty/repeat bar; `N.C.` (or `n`) is a no-chord bar.
 *
 * Example:
 *   [A]
 *   C-7 | F7 | Bb^7 | Eb^7
 *   A-7b5 | D7 | G-6 | G-6
 */
import type { Measure, SectionMark } from "./types.js";

const SECTION_ALIASES: Record<string, SectionMark> = {
  a: "A", b: "B", c: "C", d: "D",
  v: "V", verse: "V", i: "i", intro: "i",
};

export function parseTextChart(text: string): Measure[] {
  const measures: Measure[] = [];
  let pendingSection: SectionMark | undefined;
  let pendingStaff: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // Leading [Section] header (may be followed by bars on the same line).
    const sec = line.match(/^\[(.+?)\]\s*(.*)$/);
    if (sec) {
      const name = sec[1].trim();
      const alias = SECTION_ALIASES[name.toLowerCase()];
      if (alias) {
        pendingSection = alias;
        pendingStaff = undefined;
      } else {
        pendingSection = undefined;
        pendingStaff = name;
      }
      line = sec[2].trim();
      if (!line) continue; // header on its own line — applies to following bars
    }

    for (let bar of line.split("|")) {
      bar = bar.trim();
      if (bar === "") continue;

      const m: Measure = {};

      if (bar.startsWith("{")) {
        m.open = "{";
        bar = bar.slice(1).trim();
      }
      if (bar.includes("}")) {
        m.close = "}";
        const xm = bar.match(/x\s*(\d+)/i);
        if (xm) m.repeatTimes = Number(xm[1]);
        bar = bar.replace(/\}\s*x?\s*\d*/i, "").trim();
      }

      const tokens = bar.split(/\s+/).filter(Boolean);
      if (tokens.length === 1 && (tokens[0] === "%" || tokens[0].toLowerCase() === "x")) {
        m.repeatPrevious = "measure";
      } else if (tokens.length === 1 && /^(n|n\.c\.|nc)$/i.test(tokens[0])) {
        m.noChord = true;
      } else {
        m.chords = tokens.filter((t) => t !== "%");
      }

      if (pendingSection) {
        m.section = pendingSection;
        pendingSection = undefined;
      }
      if (pendingStaff) {
        m.staffText = pendingStaff;
        pendingStaff = undefined;
      }

      measures.push(m);
    }
  }

  return measures;
}
