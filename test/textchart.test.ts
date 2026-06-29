import { describe, it, expect } from "vitest";
import { parseTextChart } from "../src/textchart.js";
import { buildChart } from "../src/build.js";

describe("parseTextChart", () => {
  it("parses sections and bars", () => {
    const m = parseTextChart("[A]\nC-7 | F7 | Bb^7 | Eb^7\nA-7b5 | D7 | G-6 | G-6");
    expect(m.length).toBe(8);
    expect(m[0].section).toBe("A");
    expect(m[0].chords).toEqual(["C-7"]);
    expect(m[1].chords).toEqual(["F7"]);
  });

  it("maps named sections to staff text, letters to marks", () => {
    const m = parseTextChart("[Verse]\nC | G\n[Chorus]\nA- | F");
    expect(m[0].section).toBe("V"); // Verse -> V
    const chorus = m[2];
    expect(chorus.section).toBeUndefined();
    expect(chorus.staffText).toBe("Chorus");
  });

  it("handles multiple chords per bar", () => {
    const m = parseTextChart("C-7 F7 | Bb^7");
    expect(m[0].chords).toEqual(["C-7", "F7"]);
  });

  it("parses repeats with play counts", () => {
    const m = parseTextChart("{ A- | Ab } x4");
    expect(m[0].open).toBe("{");
    expect(m[1].close).toBe("}");
    expect(m[1].repeatTimes).toBe(4);
  });

  it("handles N.C. and % bars", () => {
    const m = parseTextChart("C | n | % | G");
    expect(m[1].noChord).toBe(true);
    expect(m[2].repeatPrevious).toBe("measure");
  });

  it("feeds cleanly into buildChart (import-safe, 4 cells/measure)", () => {
    const measures = parseTextChart("[A]\nC-7 | F7 | Bb^7 | Eb^7");
    const r = buildChart({ title: "t", key: "C-", measures });
    expect(r.irealbUrl.startsWith("irealb://")).toBe(true);
    expect(/ {3,}/.test(r.progression)).toBe(false);
  });
});
