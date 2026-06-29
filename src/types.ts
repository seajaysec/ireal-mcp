/**
 * Domain types for an iReal Pro chart.
 *
 * A chart is described structurally (title/key/style + a list of measures);
 * the layout engine converts it to the iReal Pro progression string, padding
 * each measure to a fixed cell width so the app wraps to a fixed number of
 * measures per line.
 */

/** Section / rehearsal marks placed at the start of a measure. */
export type SectionMark = "A" | "B" | "C" | "D" | "V" | "i";

/** Opening barlines. */
export type OpenBarline = "|" | "[" | "{";

/** Closing barlines. */
export type CloseBarline = "|" | "]" | "}" | "Z";

/** A single measure of the chart. */
export interface Measure {
  /**
   * Chord symbols in this measure, left to right (e.g. ["C^7"] or ["A-7","D7"]).
   * Empty array = an empty measure (rendered as blank cells, or as a repeat /
   * no-chord symbol via the flags below).
   */
  chords?: string[];

  /** Rehearsal mark shown above the start of the measure (*A, *B, ...). */
  section?: SectionMark;

  /** Override the opening barline (defaults are chosen automatically). */
  open?: OpenBarline;

  /** Override the closing barline (defaults are chosen automatically). */
  close?: CloseBarline;

  /** Volta / ending bracket number (1, 2, 3, or 0 for an unnumbered ending). */
  ending?: 0 | 1 | 2 | 3;

  /** Time signature for this measure, "n/d" (e.g. "3/4"). First measure only by default. */
  timeSignature?: string;

  /** Staff text shown under the chords (e.g. "D.C. al Coda", "Solo"). */
  staffText?: string;

  /** Place a segno (S) on this measure. */
  segno?: boolean;

  /** Place a coda (Q) on this measure. */
  coda?: boolean;

  /** Place a fermata (f) before the first chord. */
  fermata?: boolean;

  /** Render as a single "no chord" (N.C.) measure. */
  noChord?: boolean;

  /** Repeat-previous symbol: one-measure (%) or two-measure repeat. */
  repeatPrevious?: "measure" | "twoMeasures";

  /**
   * For a measure inside a repeat section, the number of times to play it
   * (emits a `<Nx>` staff text). Only meaningful on a measure that closes a
   * repeat (}).
   */
  repeatTimes?: number;
}

/** A complete chart. */
export interface Chart {
  title: string;
  /** Composer, written "First Last"; reordered to "Last First" for the app. */
  composer?: string;
  /** Reorder composer to "Last First" for sorting. Default true; set false for band names. */
  reorderComposer?: boolean;
  /**
   * Which version of a song this chart is. By convention every song is charted
   * twice: a "straight" reading (the real chords from a transcription, not
   * simplified) and an "embellished" reading (richer chord qualities / colour,
   * preserving the harmonic rhythm so it's no harder to play). Sets the slug
   * suffix and a badge on the served pages.
   */
  variant?: "straight" | "embellished";
  style?: string;
  key?: string;
  /** Beats per minute (optional; 0 = unset). */
  bpm?: number;
  /** Default time signature, "n/d". Defaults to 4/4. */
  timeSignature?: string;
  /**
   * Measures per line. The layout engine pads every measure to 16/measuresPerLine
   * cells so the app wraps consistently. Must divide 16 (1, 2, 4, 8, or 16).
   * Defaults to 4 — the piano-reading sweet spot.
   */
  measuresPerLine?: number;
  /** Structured measures. Mutually exclusive with `raw`. */
  measures?: Measure[];
  /**
   * A raw iReal Pro progression string (the part after the 6th `=`), for power
   * users. When present, it is used verbatim (no re-layout). Mutually exclusive
   * with `measures`.
   */
  raw?: string;
}

/** Result of building a chart. */
export interface BuildResult {
  /** Modern obfuscated scheme; opens in the current iReal Pro app. */
  irealbUrl: string;
  /** Legacy human-readable scheme; also opens the app. */
  irealbookUrl: string;
  /** Standalone HTML document with the clickable link. */
  html: string;
  /** Plain-text preview of the chart laid out at measuresPerLine per line. */
  asciiPreview: string;
  /** The raw (unobfuscated) progression string. */
  progression: string;
  /** Non-fatal issues (unknown style, too many lines, dense measures, ...). */
  warnings: string[];
}
