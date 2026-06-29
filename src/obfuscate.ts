/**
 * Obfuscation for the modern `irealb://` URL scheme.
 *
 * The current iReal Pro app stores the chord progression in a lightly
 * scrambled form: a fixed magic prefix, three literal substitutions, and a
 * symmetric "hussle" that shuffles bytes within 50-character segments.
 *
 * This is a direct port of the algorithm in Data::iRealPro (Perl). It is
 * symmetric: `deobfuscate(obfuscate(x)) === x`.
 */

const MAGIC = "1r34LbKcu7";

/**
 * Symmetric byte-shuffle applied to each leading 50-character segment.
 * Segments shorter than 50 characters (i.e. the trailing remainder) are
 * left untouched. Running hussle twice restores the original string.
 */
export function hussle(input: string): string {
  let string = input;
  let result = "";

  while (string.length > 50) {
    const segment = string.slice(0, 50);
    string = string.slice(50);

    // (Matches the Perl guard, though in practice unreachable: the remainder
    // is consumed by the final `result + string` return below.)
    if (string.length < 2) {
      result += segment;
      continue;
    }

    result +=
      reverse(segment.slice(45, 50)) +
      segment.slice(5, 10) +
      reverse(segment.slice(26, 40)) +
      segment.slice(24, 26) +
      reverse(segment.slice(10, 24)) +
      segment.slice(40, 45) +
      reverse(segment.slice(0, 5));
  }

  return result + string;
}

function reverse(s: string): string {
  return s.split("").reverse().join("");
}

/**
 * Encode a plain chord-progression string into the obfuscated payload that
 * the `irealb://` scheme expects (magic prefix + substitutions + hussle).
 */
export function obfuscate(plain: string): string {
  let t = plain;
  t = t.replaceAll("   ", "XyQ"); // three spaces
  t = t.replaceAll(" |", "LZ");
  t = t.replaceAll("| x", "Kcl");
  t = hussle(t);
  return MAGIC + t;
}

/**
 * Reverse of {@link obfuscate}: recover the plain chord-progression string
 * from an obfuscated `irealb://` payload.
 */
export function deobfuscate(payload: string): string {
  let t = payload;
  if (t.startsWith(MAGIC)) {
    t = t.slice(MAGIC.length);
  }
  t = hussle(t);
  t = t.replaceAll("XyQ", "   ");
  t = t.replaceAll("LZ", " |");
  t = t.replaceAll("Kcl", "| x");
  return t;
}

export { MAGIC };
