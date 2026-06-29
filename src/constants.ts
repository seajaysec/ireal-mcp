/**
 * Static iReal Pro vocabulary: valid keys, styles, time signatures, and chord
 * qualities. Sourced from the official protocol document and the iReal Pro app
 * style lists (see docs/).
 */

/** Valid key signatures (major then minor, minor suffixed with `-`). */
export const KEYS = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
  "A-", "Bb-", "B-", "C-", "C#-", "D-", "Eb-", "E-", "F-", "F#-", "G-", "G#-",
] as const;

export const STYLES_JAZZ = [
  "Afro 12/8", "Ballad Double Time Feel", "Ballad Even", "Ballad Melodic",
  "Ballad Swing", "Blue Note", "Bossa Nova", "Doo Doo Cats",
  "Double Time Swing", "Even 8ths", "Even 8ths Open", "Even 16ths",
  "Guitar Trio", "Gypsy Jazz", "Latin", "Latin/Swing", "Long Notes",
  "Medium Swing", "Medium Up Swing", "Medium Up Swing 2", "New Orleans Swing",
  "Second Line", "Slow Swing", "Swing Two/Four", "Trad Jazz",
  "Up Tempo Swing", "Up Tempo Swing 2",
] as const;

export const STYLES_LATIN = [
  "Argentina: Tango", "Brazil: Bossa Acoustic", "Brazil: Bossa Electric",
  "Brazil: Samba", "Cuba: Bolero", "Cuba: Cha Cha Cha",
  "Cuba: Son Montuno 2-3", "Cuba: Son Montuno 3-2",
] as const;

export const STYLES_POP = [
  "Bluegrass", "Country", "Disco", "Funk", "Glam Funk", "House", "Reggae",
  "Rock", "Rock 12/8", "RnB", "Shuffle", "Slow Rock", "Smooth", "Soul",
  "Virtual Funk",
] as const;

export const STYLES = [...STYLES_JAZZ, ...STYLES_LATIN, ...STYLES_POP];

/** Time signatures the app understands, keyed by "numerator/denominator". */
export const TIME_SIGNATURES: Record<string, string> = {
  "2/2": "T22", "3/2": "T32",
  "2/4": "T24", "3/4": "T34", "4/4": "T44", "5/4": "T54", "6/4": "T64", "7/4": "T74",
  "5/8": "T58", "6/8": "T68", "7/8": "T78", "9/8": "T98", "12/8": "T12",
};

/**
 * All chord qualities recognised by iReal Pro (root is supplied separately).
 * From the protocol document. Used for validation / autocompletion only —
 * unknown qualities are still allowed (iReal supports custom `*...*` text).
 */
export const CHORD_QUALITIES = [
  "5", "2", "add9", "+", "o", "h", "sus",
  "^", "-", "^7", "-7", "7", "7sus", "h7", "o7",
  "^9", "^13", "6", "69", "^7#11", "^9#11", "^7#5",
  "-6", "-69", "-^7", "-^9", "-9", "-11", "-7b5", "h9", "-b6", "-#5",
  "9", "7b9", "7#9", "7#11", "7b5", "7#5", "9#11", "9b5", "9#5",
  "7b13", "7#9#5", "7#9b5", "7#9#11", "7b9#11", "7b9b5", "7b9#5", "7b9#9",
  "7b9b13", "7alt", "13", "13#11", "13b9", "13#9", "7b9sus", "7susadd3",
  "9sus", "13sus", "7b13sus", "11",
  "min13", "min^11", "min^13", "maj13#11", "maj7b5", "maj7#9",
  "min7b6", "min9b6", "maj(add4)", "min(add4)", "7(add13)",
] as const;

/** Valid chord roots (and bass notes for slash chords). */
export const ROOTS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb",
  "G", "G#", "Ab", "A", "A#", "Bb", "B",
] as const;

export const DEFAULT_STYLE = "Medium Swing";
export const DEFAULT_KEY = "C";
export const DEFAULT_TIME_SIGNATURE = "4/4";

/** iReal Pro layout limits. */
export const CELLS_PER_LINE = 16;
export const MAX_LINES = 12;
