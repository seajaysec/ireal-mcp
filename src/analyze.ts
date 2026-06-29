/**
 * Harmonic analysis for a chart: Roman numerals, chord function, a chord-scale
 * recommendation per chord, detected ii–V(–I) cells, and a short "jam plan".
 *
 * The chord-scale choices follow the theory in docs/iRealProAnalysis/notes.md:
 *   - Major chords -> Lydian (Ionian for the tonic I)
 *   - Dominant 7  -> Mixolydian; altered dominants -> Altered (super-Locrian);
 *                    7#11/7b5 -> Lydian dominant; 7b9 -> half-whole diminished
 *   - Minor 7     -> Dorian (Phrygian on iii, Aeolian on vi)
 *   - m(maj7)     -> Melodic minor
 *   - m7b5 (ø)    -> Locrian (Locrian natural-2 for colour)
 *   - dim7 (°)    -> Whole-half diminished (or harmonic-minor 7th mode)
 * ii–V–I is detected by circle-of-fourths root motion (each root up a 4th).
 */
import { parseChord } from "./chords.js";
import type { Chart, Measure } from "./types.js";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, "E#": 5, Fb: 4,
  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, "B#": 0, Cb: 11,
};
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NAT_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

const MODE_STEPS: Record<string, number[]> = {
  Ionian: [0, 2, 4, 5, 7, 9, 11],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Aeolian: [0, 2, 3, 5, 7, 8, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Melodic minor": [0, 2, 3, 5, 7, 9, 11],
  "Lydian dominant": [0, 2, 4, 6, 7, 9, 10],
  "Phrygian dominant": [0, 1, 4, 5, 7, 8, 10],
  Altered: [0, 1, 3, 4, 6, 8, 10],
  "Locrian natural-2": [0, 2, 3, 5, 6, 8, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "Whole-half diminished": [0, 2, 3, 5, 6, 8, 9, 11],
  "Half-whole diminished": [0, 1, 3, 4, 6, 7, 9, 10],
  "Whole tone": [0, 2, 4, 6, 8, 10],
  "minor pentatonic": [0, 3, 5, 7, 10],
  "major pentatonic": [0, 2, 4, 7, 9],
  "minor blues": [0, 3, 5, 6, 7, 10],
};

export type Family =
  | "major" | "dominant" | "minor" | "minor-major" | "half-diminished"
  | "diminished" | "augmented" | "sus" | "power";

export interface ChordAnalysis {
  symbol: string;
  root: string;
  roman: string;
  family: Family;
  function: string;
  borrowed: boolean;
  /** True when this chord's scale leaves the home scale (a real scale change). */
  scaleChange: boolean;
  degreeIdx: number;
  scale: string;
  scaleNotes: string;
  note?: string;
}

export interface ChartAnalysis {
  key: string;
  tonality: "major" | "minor";
  /** Short label, e.g. "G minor" / "A major". */
  homeKeyLabel: string;
  homeScale: string;
  homeScaleNotes: string;
  /** Pentatonic shortcut, e.g. "G minor pentatonic". */
  homePentatonic: string;
  homePentatonicNotes: string;
  /** True when every chord is diatonic (one scale fits the whole tune). */
  allDiatonic: boolean;
  chords: ChordAnalysis[];
  cells: string[];
  jamPlan: string[];
}

function norm(pc: number): number {
  return ((pc % 12) + 12) % 12;
}

/** Parse a key like "Bb" or "E-" / "C#-" into a root name + tonality. */
export function parseKey(key: string): { root: string; minor: boolean } {
  const minor = key.endsWith("-");
  const root = (minor ? key.slice(0, -1) : key).trim() || "C";
  return { root, minor };
}

/** Spell a scale from a root using the given semitone steps. */
function spellScale(
  rootName: string,
  steps: number[],
  preferFlatOverride?: boolean,
): { names: string[]; pcs: number[] } {
  const rootPc = NOTE_PC[rootName] ?? 0;
  const preferFlat = preferFlatOverride ?? (rootName.includes("b") || ["F"].includes(rootName));

  // 7-note scales: one note per letter (proper enharmonic spelling).
  if (steps.length === 7) {
    const rootLetterIdx = LETTERS.indexOf(rootName[0]);
    const names: string[] = [];
    const pcs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const letter = LETTERS[(rootLetterIdx + i) % 7];
      const targetPc = norm(rootPc + steps[i]);
      let diff = norm(targetPc - LETTER_PC[letter]);
      if (diff > 6) diff -= 12; // -? .. + range
      const acc = diff > 0 ? "#".repeat(diff) : diff < 0 ? "b".repeat(-diff) : "";
      names.push(letter + acc);
      pcs.push(targetPc);
    }
    return { names, pcs };
  }

  // Other scales (6/8-note): chromatic spelling by key preference.
  const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const tbl = preferFlat ? FLAT : SHARP;
  const pcs = steps.map((s) => norm(rootPc + s));
  return { names: pcs.map((p) => tbl[p]), pcs };
}

function classifyFamily(quality: string): Family {
  const q = quality;
  if (q === "5") return "power";
  if (q === "+") return "augmented";
  if (/^(o|dim|o7)$/.test(q)) return "diminished";
  if (q === "h" || q === "h7" || q === "h9" || /-?7b5/.test(q)) return "half-diminished";
  // minor-major: -^7 / -^9 / min^7
  if (/^-?\^?\^?/.test(q) && /(-|min).*(\^|maj)/.test(q)) return "minor-major";
  if (q.startsWith("-") || q.startsWith("min") || /^m(?!aj)/.test(q)) return "minor";
  if (q === "" || q.startsWith("^") || q.startsWith("maj") || /^6|^69|^add9|^2$/.test(q)) return "major";
  if (q.includes("sus")) return "sus";
  // anything with a 7/9/11/13 and no minor/major marker is dominant
  if (/(7|9|11|13)/.test(q)) return "dominant";
  return "major";
}

function isAltered(quality: string): "altered" | "lydian-dom" | "b9" | "plain" {
  if (/alt/.test(quality)) return "altered";
  const hasB9 = /b9/.test(quality);
  const hasS9 = /#9/.test(quality);
  const hasS5 = /#5/.test(quality);
  const hasB13 = /b13/.test(quality);
  const hasB5 = /b5/.test(quality);
  const hasS11 = /#11/.test(quality);
  if ((hasB9 && (hasB13 || hasS5)) || (hasS9 && hasS5) || (hasB9 && hasS9)) return "altered";
  if (hasS11 || hasB5) return "lydian-dom";
  if (hasB9 || hasS9) return "b9";
  return "plain";
}

const FUNCTION_MAJOR: Record<number, string> = {
  0: "tonic", 1: "subdominant", 2: "tonic", 3: "subdominant", 4: "dominant", 5: "tonic", 6: "dominant",
};
const FUNCTION_MINOR: Record<number, string> = {
  0: "tonic", 1: "subdominant", 2: "tonic", 3: "subdominant", 4: "dominant", 5: "subdominant", 6: "subtonic",
};

const MAJOR_MODES = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
const MINOR_MODES = ["Aeolian", "Locrian", "Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian"];

/** The mode of the home key that starts on a given scale degree (clash-free for diatonic chords). */
function diatonicMode(degreeIdx: number, minorKey: boolean): string {
  return (minorKey ? MINOR_MODES : MAJOR_MODES)[degreeIdx] ?? "Ionian";
}

/** Pick a chord-scale (and its notes) for a chord. */
function chooseScale(
  family: Family,
  quality: string,
  rootName: string,
  degreeIdx: number,
  minorKey: boolean,
  borrowed: boolean,
): { scale: string; scaleName: string; notes: string; pcs: number[]; note?: string } {
  let scaleName = "Ionian";
  let note: string | undefined;

  // Dominant chords have their own (function-driven) scale logic.
  if (family === "dominant") {
    const alt = isAltered(quality);
    if (alt === "altered") { scaleName = "Altered"; note = "Altered (super-Locrian) — all the tensions, resolve down a 4th."; }
    else if (alt === "lydian-dom") { scaleName = "Lydian dominant"; note = "Lydian dominant for the #11/b5."; }
    else if (alt === "b9") { scaleName = "Half-whole diminished"; note = "Half-whole dim gives b9/#9/#11/13."; }
    else if (/sus/.test(quality)) { scaleName = "Mixolydian"; note = "Sus — Mixolydian, lay off the 3rd."; }
    else if (minorKey && degreeIdx === 4) { scaleName = "Phrygian dominant"; note = "V7 of a minor key — Phrygian dominant (harmonic-minor 5th) for the b9/b13 pull to i."; }
    else scaleName = "Mixolydian";
  } else if (family === "sus") {
    scaleName = "Mixolydian"; note = "No 3rd — Mixolydian, or pentatonic from the 5th.";
  } else if (family === "augmented") {
    scaleName = "Whole tone"; note = "Whole tone for the #5.";
  } else if (family === "power") {
    scaleName = minorKey ? "Aeolian" : "Mixolydian"; note = "No 3rd — minor pentatonic / blues sits on top.";
  } else if (!borrowed) {
    // Diatonic chord: the mode of the home key on this degree never clashes.
    scaleName = diatonicMode(degreeIdx, minorKey);
    if (family === "minor" && minorKey && degreeIdx === 0) {
      note = `Natural minor is home; ${rootName} Dorian (raised 6) brightens it for a rock/modal feel, Phrygian darkens it.`;
    } else if (family === "major" && (degreeIdx === 3 || (!minorKey && degreeIdx === 0))) {
      note = "maj7 players can brighten this with Lydian (#11) for colour.";
    }
  } else {
    // Borrowed / non-diatonic chord: choose by quality colour.
    switch (family) {
      case "major": scaleName = "Lydian"; note = "Borrowed major — Lydian is the bright default; try Mixolydian if it's acting like a ♭VII."; break;
      case "minor": scaleName = "Dorian"; note = "Borrowed minor — Dorian (Aeolian for a darker read)."; break;
      case "minor-major": scaleName = "Melodic minor"; note = "Melodic minor (the m(maj7) sound)."; break;
      case "half-diminished": scaleName = "Locrian"; note = "Locrian, or Locrian ♮2 (from melodic minor) for a less brittle 9."; break;
      case "diminished": scaleName = "Whole-half diminished"; note = "Symmetrical — also the harmonic-minor 7th mode of the chord you're resolving to."; break;
      default: scaleName = "Ionian";
    }
  }

  const { names, pcs } = spellScale(rootName, MODE_STEPS[scaleName] ?? MAJOR_STEPS);
  return { scale: `${rootName} ${scaleName}`, scaleName, notes: names.join(" "), pcs, note };
}

/** Whether a scale degree is a minor/diminished triad in the key (for casing). */
function degreeIsLowercase(degreeIdx: number, minor: boolean): boolean {
  return (minor ? [0, 1, 3, 4] : [1, 2, 5, 6]).includes(degreeIdx);
}

function romanCase(numeral: string, family: Family, lowerOverride?: boolean): string {
  const lower =
    lowerOverride !== undefined
      ? lowerOverride
      : family === "minor" || family === "minor-major" || family === "half-diminished" || family === "diminished";
  let r = lower ? numeral.toLowerCase() : numeral;
  if (family === "diminished") r += "°";
  else if (family === "half-diminished") r += "ø";
  else if (family === "augmented") r += "+";
  else if (family === "dominant") r += "7";
  return r;
}

/** Collect the chords of a chart in order (skipping non-chord measures). */
function chordSymbols(measures: Measure[]): string[] {
  const out: string[] = [];
  for (const m of measures) {
    if (m.noChord || m.repeatPrevious) continue;
    for (const c of m.chords ?? []) {
      const t = c.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export function analyzeChart(chart: Chart): ChartAnalysis {
  const { root: keyRoot, minor } = parseKey(chart.key ?? "C");
  const steps = minor ? NAT_MINOR_STEPS : MAJOR_STEPS;
  const scale = spellScale(keyRoot, steps);
  const diatonicQual = minor ? FUNCTION_MINOR : FUNCTION_MAJOR;

  const symbols = chordSymbols(chart.measures ?? []);

  // Deduplicate consecutive identical symbols for the analysis table.
  const distinct: string[] = [];
  for (const s of symbols) if (s !== distinct[distinct.length - 1]) distinct.push(s);

  const homeKeyLabel = `${keyRoot} ${minor ? "minor" : "major"}`;
  const homeScaleNotes = scale.names.join(" ");
  const homePcs = new Set(scale.pcs);

  const chords: ChordAnalysis[] = distinct.map((symbol) => {
    const p = parseChord(symbol);
    const family = classifyFamily(p.quality);
    const rootName = p.root || keyRoot;
    const rootPc = NOTE_PC[rootName] ?? 0;

    const letterIdx = scale.names.findIndex((n) => n[0] === rootName[0]);
    const degreeIdx = letterIdx >= 0 ? letterIdx : 0;
    let diff = norm(rootPc - scale.pcs[degreeIdx]);
    if (diff > 6) diff -= 12;
    const prefix = diff > 0 ? "#".repeat(diff) : diff < 0 ? "b".repeat(-diff) : "";

    const isPower = family === "power";
    // Power chords have no 3rd, so they don't force a borrow and take no quality
    // suffix; case the numeral by the key's diatonic triad at that degree.
    const roman = romanCase(prefix + ROMAN[degreeIdx], family, isPower ? degreeIsLowercase(degreeIdx, minor) : undefined);

    const borrowed = isPower ? diff !== 0 : diff !== 0 || isNonDiatonicQuality(family, degreeIdx, minor);
    const fn = diatonicQual[degreeIdx] ?? "colour";
    const cs = chooseScale(family, p.quality, rootName, degreeIdx, minor, borrowed);
    const bassNote = p.bass ? ` over ${p.bass}` : "";

    // Does this chord's scale stay inside the home scale? If so it's the SAME
    // scale (just a different starting note). Power chords are scale-neutral —
    // always just play the home scale over them.
    const withinHome = isPower || cs.pcs.every((pc) => homePcs.has(pc));
    const scaleChange = !withinHome;

    let scaleDisplay: string;
    let scaleNotes: string;
    let note: string | undefined;
    if (isPower) {
      scaleDisplay = homeKeyLabel;
      scaleNotes = homeScaleNotes;
      note = `power chord (no 3rd) — just play the home scale / pentatonic${bassNote}`;
    } else if (withinHome) {
      scaleDisplay = homeKeyLabel;
      scaleNotes = homeScaleNotes;
      note = `same scale — lean on ${rootName} (${cs.scaleName} colour)${bassNote}`;
    } else {
      scaleDisplay = cs.scale;
      scaleNotes = cs.notes;
      note = (cs.note ?? "scale change") + bassNote;
    }

    return {
      symbol,
      root: rootName,
      roman,
      family,
      // The "out of key" tag tracks an actual scale change, not a quality guess.
      function: scaleChange ? `${fn} (out of key)` : fn,
      borrowed,
      scaleChange,
      degreeIdx,
      scale: scaleDisplay,
      scaleNotes,
      note,
    };
  });

  const cells = detectCells(chords);
  const allDiatonic = chords.every((c) => !c.scaleChange);

  // Pentatonic notes are a subset of the (correctly-spelled) home scale, so
  // pick them by degree instead of re-spelling (avoids e.g. A# for G minor).
  const pentIdx = minor ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5];
  const homePentatonic = `${keyRoot} ${minor ? "minor" : "major"} pentatonic`;
  const homePentatonicNotes = pentIdx.map((i) => scale.names[i]).join(" ");
  const keyPrefersFlat = homeScaleNotes.includes("b");

  const homeScaleName = minor ? `${keyRoot} natural minor (Aeolian)` : `${keyRoot} major (Ionian)`;
  const jamPlan = buildJamPlan({
    keyRoot, minor, keyPrefersFlat, homeKeyLabel, homeScaleNotes, homePentatonic, homePentatonicNotes,
    allDiatonic, chords, cells,
  });

  return {
    key: chart.key ?? "C",
    tonality: minor ? "minor" : "major",
    homeKeyLabel,
    homeScale: homeScaleName,
    homeScaleNotes,
    homePentatonic,
    homePentatonicNotes,
    allDiatonic,
    chords,
    cells,
    jamPlan,
  };
}

function isNonDiatonicQuality(family: Family, degreeIdx: number, minor: boolean): boolean {
  // Expected diatonic triad family per degree.
  const major = ["major", "minor", "minor", "major", "dominant", "minor", "half-diminished"];
  const min = ["minor", "half-diminished", "major", "minor", "minor", "major", "dominant"];
  const expected = (minor ? min : major)[degreeIdx];
  // Treat dominant/major as compatible at V; minor/minor-major compatible.
  if (expected === family) return false;
  if (expected === "major" && family === "dominant") return false;
  if (expected === "dominant" && family === "major") return false;
  if (expected === "minor" && family === "minor-major") return false;
  return true;
}

/** Detect ii–V(–I) cells via circle-of-fourths root motion. */
function detectCells(chords: ChordAnalysis[]): string[] {
  const cells: string[] = [];
  const pc = (c: ChordAnalysis) => NOTE_PC[c.root] ?? 0;
  const up4 = (a: ChordAnalysis, b: ChordAnalysis) => norm(pc(a) + 5) === norm(pc(b));

  for (let i = 0; i < chords.length - 1; i++) {
    const a = chords[i], b = chords[i + 1];
    const aMinorish = a.family === "minor" || a.family === "half-diminished";

    // ii–V–I: minor/ø → dominant → tonic-ish, each root up a 4th. Reliable on its own.
    if (aMinorish && b.family === "dominant" && up4(a, b)) {
      const c = chords[i + 2];
      if (c && up4(b, c) && (c.family === "major" || c.family === "minor" || c.family === "minor-major")) {
        const minorTarget = c.family === "minor" || c.family === "minor-major";
        const label = minorTarget ? "ii–V–i" : "ii–V–I";
        cells.push(`${label} → ${a.symbol} ${b.symbol} ${c.symbol} (resolving to ${c.root})`);
        i += 1;
        continue;
      }
      // Bare ii–V only when the minor really is the supertonic (avoids i→IV7 false positives).
      if (a.degreeIdx === 1) {
        cells.push(`ii–V → ${a.symbol} ${b.symbol} (points at ${pcName(norm(pc(b) + 5))})`);
      }
      continue;
    }

    // Dominant resolving down a fifth.
    if (a.family === "dominant" && up4(a, b)) {
      if (b.degreeIdx === 0 && !b.borrowed) {
        cells.push(`V7 → ${a.symbol} ${b.symbol}: dominant resolution to the tonic`);
      } else if (a.borrowed) {
        const target = b.roman.replace(/[°ø+7]/g, "");
        cells.push(`Secondary dominant → ${a.symbol} → ${b.symbol} (V7/${target})`);
      }
    }
  }
  return cells;
}

function pcName(pc: number): string {
  const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return SHARP[norm(pc)];
}

function buildJamPlan(o: {
  keyRoot: string;
  minor: boolean;
  keyPrefersFlat: boolean;
  homeKeyLabel: string;
  homeScaleNotes: string;
  homePentatonic: string;
  homePentatonicNotes: string;
  allDiatonic: boolean;
  chords: ChordAnalysis[];
  cells: string[];
}): string[] {
  const plan: string[] = [];

  // 1. The one scale, with its actual notes.
  plan.push(`One scale for the whole tune: ${o.homeKeyLabel} — ${o.homeScaleNotes}.`);

  // 2. The pentatonic shortcut, with notes (and the blues note for minor).
  const bluesNote = o.minor
    ? `, ${spellScale(o.keyRoot, MODE_STEPS["minor blues"], o.keyPrefersFlat).names.join(" ")} for blues`
    : "";
  plan.push(`Five-note shortcut: ${o.homePentatonic} — ${o.homePentatonicNotes}${bluesNote}.`);

  // 3. Diatonic vs. borrowed — say plainly whether you ever change scales.
  const borrowed = o.chords.filter((c) => c.scaleChange);
  if (o.allDiatonic) {
    plan.push(
      `Every chord lives in that one scale — you don't change scales. The per-chord "colour" just says which note to lean on (the chord's root); the notes are identical.`,
    );
  } else {
    const list = borrowed
      .map((c) => `${c.symbol} (${c.roman}) → ${c.scale}: ${c.scaleNotes}`)
      .slice(0, 6)
      .join("; ");
    plan.push(`Switch scale ONLY for the chords that step outside the key: ${list}.`);
  }

  if (o.cells.length) {
    plan.push(`Cadences to target: ${o.cells.slice(0, 4).join(" · ")}.`);
  }
  plan.push(`Land on chord tones (1-3-5-7) on the downbeats, then fill the gaps with that scale.`);
  return plan;
}
