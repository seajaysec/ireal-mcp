/**
 * Chord-symbol parsing and validation.
 *
 * iReal Pro chord = root + optional quality + optional `/bass` inversion.
 * Validation is advisory: unknown qualities still produce output (iReal also
 * accepts free-text `*...*` qualities), but we surface a warning so callers
 * can catch typos.
 */
import { CHORD_QUALITIES, ROOTS } from "./constants.js";

const ROOT_RE = /^(C#|Db|D#|Eb|F#|Gb|G#|Ab|A#|Bb|[CDEFGAB])/;
const QUALITY_SET = new Set<string>(CHORD_QUALITIES);
const ROOT_SET = new Set<string>(ROOTS);

export interface ParsedChord {
  root: string;
  quality: string;
  bass?: string;
  /** True if the symbol parsed cleanly into a known root and quality. */
  valid: boolean;
  reason?: string;
}

/**
 * Parse a single chord symbol. Does not throw; returns `valid: false` with a
 * reason for anything unrecognised.
 */
export function parseChord(symbol: string): ParsedChord {
  const raw = symbol.trim();

  // Bass / inversion.
  let head = raw;
  let bass: string | undefined;
  const slash = raw.indexOf("/");
  if (slash !== -1) {
    head = raw.slice(0, slash);
    bass = raw.slice(slash + 1);
  }

  const rootMatch = head.match(ROOT_RE);
  if (!rootMatch) {
    return { root: "", quality: "", valid: false, reason: `no recognisable root in "${symbol}"` };
  }
  const root = rootMatch[1];
  const quality = head.slice(root.length);

  let valid = true;
  let reason: string | undefined;

  if (!ROOT_SET.has(root)) {
    valid = false;
    reason = `unusual root "${root}"`;
  }

  // Free-text qualities are wrapped in asterisks; treat as intentional.
  const isCustom = quality.startsWith("*") && quality.endsWith("*");
  if (quality !== "" && !isCustom && !QUALITY_SET.has(quality)) {
    valid = false;
    reason = `unknown quality "${quality}"`;
  }

  if (bass !== undefined && !ROOT_SET.has(bass)) {
    valid = false;
    reason = `unusual bass note "${bass}"`;
  }

  return { root, quality, bass, valid, reason };
}

/** Validate a list of chord symbols; returns one warning per problem found. */
export function validateChords(symbols: string[]): string[] {
  const warnings: string[] = [];
  for (const s of symbols) {
    const p = parseChord(s);
    if (!p.valid && p.reason) warnings.push(p.reason);
  }
  return warnings;
}
