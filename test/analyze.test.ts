import { describe, it, expect } from "vitest";
import { analyzeChart } from "../src/analyze.js";
import type { Chart } from "../src/types.js";

describe("analyzeChart — major key ii-V-I", () => {
  const chart: Chart = {
    title: "ii-V-I",
    key: "C",
    measures: [{ chords: ["D-7"] }, { chords: ["G7"] }, { chords: ["C^7"] }, { chords: ["C^7"] }],
  };
  const a = analyzeChart(chart);

  it("labels Roman numerals and functions", () => {
    const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));
    expect(byRoot["D"].roman).toBe("ii"); // 7 shown only for dominant function
    expect(byRoot["D"].function).toBe("subdominant");
    expect(byRoot["G"].roman).toBe("V7");
    expect(byRoot["G"].function).toBe("dominant");
    expect(byRoot["C"].roman).toBe("I");
    expect(byRoot["C"].function).toBe("tonic");
  });

  it("treats the diatonic chords as one home scale (no false scale changes)", () => {
    const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));
    // All of D-7, G7, C^7 are inside C major — same scale, not three different ones.
    for (const r of ["D", "G", "C"]) {
      expect(byRoot[r].scaleChange).toBe(false);
      expect(byRoot[r].scale).toBe("C major");
      expect(byRoot[r].scaleNotes).toBe("C D E F G A B");
    }
    // The mode "colour" is recorded in the note, not as a separate scale.
    expect(byRoot["D"].note).toMatch(/Dorian/);
    expect(byRoot["G"].note).toMatch(/Mixolydian/);
    expect(a.allDiatonic).toBe(true);
  });

  it("gives the pentatonic shortcut with notes", () => {
    expect(a.homePentatonic).toBe("C major pentatonic");
    expect(a.homePentatonicNotes).toBe("C D E G A");
    expect(a.jamPlan.join(" ")).toMatch(/C D E G A/);
  });

  it("detects the ii-V-I cell", () => {
    expect(a.cells.some((c) => c.startsWith("ii–V–I"))).toBe(true);
  });
});

describe("analyzeChart — minor key with borrowed chords (Paranoid)", () => {
  const chart: Chart = {
    title: "Paranoid",
    key: "E-",
    measures: [
      { chords: ["E-9"] }, { chords: ["D6"] }, { chords: ["G^7"] }, { chords: ["C^7"] },
      { chords: ["A7"] }, { chords: ["B7"] },
    ],
  };
  const a = analyzeChart(chart);
  const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));

  it("is in E minor", () => {
    expect(a.tonality).toBe("minor");
    expect(a.homeScaleNotes).toBe("E F# G A B C D");
  });

  it("numbers the diatonic minor chords", () => {
    expect(byRoot["E"].roman).toBe("i");
    expect(byRoot["D"].roman).toBe("VII");
    expect(byRoot["G"].roman).toBe("III");
    expect(byRoot["C"].roman).toBe("VI");
  });

  it("flags A major (IV) and B7 (V) as real scale changes", () => {
    expect(byRoot["A"].roman).toBe("IV7"); // A7 — dominant on IV (Dorian/secondary colour)
    expect(byRoot["A"].scaleChange).toBe(true); // A Mixolydian has C#, outside E minor
    expect(byRoot["A"].scale).toBe("A Mixolydian");
    expect(byRoot["B"].roman).toBe("V7");
    expect(byRoot["B"].scaleChange).toBe(true); // B Phrygian dominant has D#, outside E minor
  });

  it("recommends Phrygian dominant for the V7 resolving to minor i", () => {
    expect(byRoot["B"].scale).toBe("B Phrygian dominant");
  });

  it("calls bVII the subtonic, not a dominant", () => {
    expect(byRoot["D"].function).toBe("subtonic");
  });

  it("does not mislabel i → IV7 (E-9 A7) as a ii–V", () => {
    expect(a.cells.some((c) => c.includes("ii–V") && c.includes("A7"))).toBe(false);
  });

  it("produces a jam plan that mentions the home scale and the borrowed chords", () => {
    expect(a.jamPlan.length).toBeGreaterThanOrEqual(3);
    expect(a.jamPlan.join(" ")).toMatch(/E minor/);
    expect(a.jamPlan.join(" ")).toMatch(/A7|B7/);
  });
});

describe("analyzeChart — diatonic chords are one scale, not many", () => {
  it("a fully diatonic tune reports one scale and no scale changes", () => {
    // Videotape-style: A I, E V, C#m iii are all A major.
    const a = analyzeChart({ title: "x", key: "A", measures: [{ chords: ["A"] }, { chords: ["E"] }, { chords: ["C#-"] }] });
    const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));
    expect(a.allDiatonic).toBe(true);
    for (const r of ["A", "E", "C#"]) {
      expect(byRoot[r].scaleChange).toBe(false);
      expect(byRoot[r].scale).toBe("A major");
    }
    // The E (V) leans on a Mixolydian colour — recorded, but no out-of-key A#.
    expect(byRoot["E"].note).toMatch(/Mixolydian/);
    expect(byRoot["E"].scaleNotes).toBe("A B C# D E F# G#");
  });

  it("bIII and bVII in a minor key stay in the home scale", () => {
    const a = analyzeChart({ title: "x", key: "E-", measures: [{ chords: ["G"] }, { chords: ["D"] }] });
    const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));
    expect(byRoot["G"].scaleChange).toBe(false);
    expect(byRoot["G"].note).toMatch(/Ionian/); // III colour
    expect(byRoot["D"].note).toMatch(/Mixolydian/); // VII colour
  });
});

describe("analyzeChart — audit regressions", () => {
  it("spells a flat-key pentatonic with flats (G minor → Bb, not A#)", () => {
    const a = analyzeChart({ title: "x", key: "G-", measures: [{ chords: ["G-"] }, { chords: ["Eb"] }] });
    expect(a.homePentatonicNotes).toBe("G Bb C D F");
    expect(a.homeScaleNotes).toBe("G A Bb C D Eb F");
  });

  it("treats power chords as scale-neutral (home scale, contextual numeral)", () => {
    const a = analyzeChart({ title: "x", key: "E-", measures: [{ chords: ["E5"] }, { chords: ["D5"] }, { chords: ["C5"] }] });
    const byRoot = Object.fromEntries(a.chords.map((c) => [c.root, c]));
    expect(byRoot["E"].roman).toBe("i"); // tonic, lowercase by context
    expect(byRoot["D"].roman).toBe("VII");
    for (const r of ["E", "D", "C"]) {
      expect(byRoot[r].scaleChange).toBe(false); // no fake "D Aeolian" change
      expect(byRoot[r].scale).toBe("E minor");
      expect(byRoot[r].function).not.toMatch(/out of key|borrowed/);
    }
  });

  it("does not tag a diatonic 7sus as out of key", () => {
    const a = analyzeChart({ title: "x", key: "A", measures: [{ chords: ["A"] }, { chords: ["E7sus"] }] });
    const e = a.chords.find((c) => c.root === "E")!;
    expect(e.scaleChange).toBe(false);
    expect(e.function).toBe("dominant"); // not "dominant (out of key)"
  });

  it("Autumn Leaves: detects ii-V-I (major) and ii-V-i (minor), D7 is the one scale change", () => {
    const a = analyzeChart({
      title: "Autumn Leaves", key: "G-",
      measures: [
        { chords: ["C-7"] }, { chords: ["F7"] }, { chords: ["Bb^7"] }, { chords: ["Eb^7"] },
        { chords: ["A-7b5"] }, { chords: ["D7"] }, { chords: ["G-"] },
      ],
    });
    expect(a.cells.some((c) => c.startsWith("ii–V–I") && c.includes("Bb^7"))).toBe(true);
    expect(a.cells.some((c) => c.startsWith("ii–V–i") && c.includes("G-"))).toBe(true);
    const changes = a.chords.filter((c) => c.scaleChange).map((c) => c.symbol);
    expect(changes).toEqual(["D7"]); // only the V7 (D Phrygian dominant) leaves G minor
  });
});

describe("analyzeChart — altered dominant is a real scale change even when diatonic by root", () => {
  it("G7alt in C uses the altered scale (a true scale change)", () => {
    const a = analyzeChart({ title: "x", key: "C", measures: [{ chords: ["G7alt"] }, { chords: ["C^7"] }] });
    const g = a.chords.find((c) => c.root === "G")!;
    expect(g.scale).toBe("G Altered");
    expect(g.scaleChange).toBe(true); // Altered leaves C major
  });

  it("uses Lydian dominant for 7#11", () => {
    const a = analyzeChart({ title: "x", key: "C", measures: [{ chords: ["F7#11"] }] });
    const f = a.chords.find((c) => c.root === "F")!;
    expect(f.scale).toBe("F Lydian dominant");
    expect(f.scaleChange).toBe(true);
  });
});
