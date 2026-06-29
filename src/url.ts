/**
 * Build and parse iReal Pro URLs.
 *
 * Modern scheme (`irealb://`) — 10 `=`-separated fields per song:
 *   title = composer = a2 = style = key = actualKey = OBFUSCATED = actualStyle = tempo = repeats
 *
 * Legacy scheme (`irealbook://`) — 6 fields, progression in plain text:
 *   title = composer = style = key = n = progression
 *
 * Songs in a playlist are joined with `===` (modern) and the body is
 * percent-encoded for safe use in hrefs / browsers.
 */
import { obfuscate, deobfuscate } from "./obfuscate.js";

// Isomorphic UTF-8 helpers (work in Node and the browser — no Buffer).
const utf8Encode = (s: string): Uint8Array => new TextEncoder().encode(s);
const utf8Decode = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Percent-encode like Data::iRealPro: leave letters, digits and - _ . * / ' unescaped. */
export function esc(s: string): string {
  let out = "";
  const bytes = utf8Encode(s);
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    if (/[-_.A-Za-z0-9*/']/.test(c)) {
      out += c;
    } else {
      out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/**
 * Reorder a "First Last" composer string to "Last First" for app sorting.
 * Set `reorder` false to keep the name verbatim — correct for band names
 * (e.g. "Black Sabbath" should not become "Sabbath Black").
 */
export function formatComposer(composer: string | undefined, reorder = true): string {
  const c = (composer ?? "").trim();
  if (!c || !reorder) return c;
  const parts = c.split(/\s+/);
  if (parts.length < 2) return c;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return `${last} ${rest}`;
}

/** Apply the "The X" -> "X, The" sorting convention to a title. */
export function formatTitle(title: string): string {
  const t = title.trim();
  if (/^the\s+/i.test(t)) {
    return `${t.replace(/^the\s+/i, "")}, The`;
  }
  return t;
}

export interface UrlFields {
  title: string;
  composer?: string;
  style: string;
  key: string;
  bpm?: number;
  progression: string;
  /** Reorder composer to "Last First" for sorting. Default true; false for bands. */
  reorderComposer?: boolean;
}

/** The 10-field body for one song in the modern scheme (no URI escaping). */
function irealbSongBody(f: UrlFields): string {
  return [
    formatTitle(f.title),
    formatComposer(f.composer, f.reorderComposer ?? true),
    "", // a2 (unused)
    f.style,
    f.key,
    "", // actualKey (no transposition)
    obfuscate(f.progression),
    "", // actualStyle
    String(f.bpm ?? 0),
    "0", // repeats
  ].join("=");
}

/** Build a modern `irealb://` URL (percent-encoded). */
export function buildIrealbUrl(f: UrlFields): string {
  return "irealb://" + esc(irealbSongBody(f));
}

/**
 * Build a modern `irealb://` playlist URL containing several songs.
 * Songs are joined with `===` and the playlist name is appended.
 */
export function buildPlaylistUrl(songs: UrlFields[], name: string): string {
  const body = songs.map(irealbSongBody).join("===") + "===" + name;
  return "irealb://" + esc(body);
}

/** Build a legacy `irealbook://` URL (percent-encoded). */
export function buildIrealbookUrl(f: UrlFields): string {
  const body = [
    formatTitle(f.title),
    formatComposer(f.composer, f.reorderComposer ?? true),
    f.style,
    f.key,
    "n",
    f.progression,
  ].join("=");
  return "irealbook://" + esc(body);
}

export interface ParsedSong {
  variant: "irealpro" | "irealbook";
  title: string;
  composer: string;
  style: string;
  key: string;
  bpm?: number;
  progression: string;
}

/** Parse a single song out of an iReal Pro URL (first song if a playlist). */
export function parseUrl(input: string): ParsedSong {
  let data = input.replace(/[\r\n]+/g, "").trim();

  // Pull out the scheme portion if embedded in HTML / text.
  const m = data.match(/irealb(?:ook)?:\/\/.*/);
  if (!m) throw new Error("No irealb:// or irealbook:// URL found in input.");
  data = m[0];
  data = data.replace(/["'].*$/, ""); // drop a trailing quote from href context

  let variant: "irealpro" | "irealbook";
  if (data.startsWith("irealbook://")) {
    variant = "irealbook";
    data = data.slice("irealbook://".length);
  } else {
    variant = "irealpro";
    data = data.slice("irealb://".length);
  }

  data = percentDecode(data);

  // Playlist: songs joined by ===, optional trailing playlist name.
  const firstSong = data.split("===")[0];

  if (variant === "irealpro") {
    const parts = firstSong.split("=");
    if (parts.length < 7) throw new Error("Malformed irealb:// song (expected 10 fields).");
    return {
      variant,
      title: parts[0],
      composer: parts[1],
      style: parts[3],
      key: parts[4],
      bpm: parts[8] ? Number(parts[8]) || undefined : undefined,
      progression: deobfuscate(parts[6]),
    };
  } else {
    // Legacy: 6 fields per song.
    const parts = firstSong.split("=");
    if (parts.length < 6) throw new Error("Malformed irealbook:// song (expected 6 fields).");
    return {
      variant,
      title: parts[0],
      composer: parts[1],
      style: parts[2],
      key: parts[3],
      progression: parts[5],
    };
  }
}

function percentDecode(s: string): string {
  // Decode %XX as UTF-8 bytes; leave other characters as-is.
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "%" && /[0-9a-fA-F]{2}/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = s.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        for (const b of utf8Encode(s[i])) bytes.push(b);
      }
    }
  }
  return utf8Decode(new Uint8Array(bytes));
}
