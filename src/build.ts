/**
 * High-level chart builder: structured chart (or raw progression) ->
 * { irealb URL, irealbook URL, HTML, ASCII preview, warnings }.
 */
import { buildProgression } from "./layout.js";
import { buildIrealbUrl, buildIrealbookUrl } from "./url.js";
import { asciiFromMeasures, htmlDocument, splitProgressionToMeasures } from "./render.js";
import { validateChords } from "./chords.js";
import {
  STYLES,
  KEYS,
  DEFAULT_STYLE,
  DEFAULT_KEY,
  MAX_LINES,
} from "./constants.js";
import type { Chart, BuildResult } from "./types.js";

export function buildChart(chart: Chart): BuildResult {
  const warnings: string[] = [];

  if (chart.measures && chart.raw) {
    warnings.push("Both `measures` and `raw` provided; using `measures` and ignoring `raw`.");
  }

  const style = chart.style ?? DEFAULT_STYLE;
  const key = chart.key ?? DEFAULT_KEY;

  if (!STYLES.includes(style as (typeof STYLES)[number])) {
    warnings.push(
      `Style "${style}" is not a built-in iReal Pro style; it will still import but may sort oddly. ` +
        `Use list_styles to see valid options.`,
    );
  }
  if (!KEYS.includes(key as (typeof KEYS)[number])) {
    warnings.push(`Key "${key}" is not a standard iReal Pro key signature.`);
  }

  let progression: string;
  let asciiPreview: string;
  const measuresPerLine = chart.measuresPerLine ?? 4;

  if (chart.measures && chart.measures.length > 0) {
    // Validate chords.
    for (let i = 0; i < chart.measures.length; i++) {
      const chordWarnings = validateChords(chart.measures[i].chords ?? []);
      for (const w of chordWarnings) warnings.push(`Measure ${i + 1}: ${w}`);
    }

    const layout = buildProgression({ ...chart, style, key });
    progression = layout.progression;
    warnings.push(...layout.warnings);
    // Completeness nudge: most songs are a full form, not one section.
    if (chart.measures.length < 16) {
      warnings.push(
        `Only ${chart.measures.length} bars — most songs are a full form (commonly 24–32+ bars). ` +
          `If you charted just one section, add the rest (intro, verses, bridge, solo, outro). ` +
          `Ignore if this is a deliberate loop/vamp.`,
      );
    }
    if (layout.lineCount > MAX_LINES) {
      warnings.push(
        `Chart needs ${layout.lineCount} lines but iReal Pro shows at most ${MAX_LINES}; ` +
          `content beyond line ${MAX_LINES} may be hidden.`,
      );
    }
    asciiPreview = asciiFromMeasures({ ...chart, style, key });
  } else if (chart.raw) {
    progression = chart.raw;
    const measures = splitProgressionToMeasures(chart.raw);
    asciiPreview = asciiFromMeasures({
      title: chart.title,
      composer: chart.composer,
      style,
      key,
      measuresPerLine,
      measures,
    });
  } else {
    throw new Error("Provide either `measures` (structured) or `raw` (a progression string).");
  }

  const fields = {
    title: chart.title,
    composer: chart.composer,
    reorderComposer: chart.reorderComposer,
    style,
    key,
    bpm: chart.bpm,
    progression,
  };

  const irealbUrl = buildIrealbUrl(fields);
  const irealbookUrl = buildIrealbookUrl(fields);
  const html = htmlDocument({
    title: chart.title,
    composer: chart.composer,
    style,
    url: irealbUrl,
    asciiPreview,
  });

  return { irealbUrl, irealbookUrl, html, asciiPreview, progression, warnings };
}
