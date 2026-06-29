/**
 * Persistent chart library on disk.
 *
 * Each saved chart is stored as `<slug>.json` (the source of truth, used by the
 * HTTP index, import redirects and playlist links) plus `<slug>.html` (a
 * standalone snapshot file — the "local file" deliverable). The HTTP server
 * reads this directory per request so newly saved charts appear immediately.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";

import { buildChart } from "./build.js";
import { htmlDocument } from "./render.js";
import { analyzeChart, type ChartAnalysis } from "./analyze.js";
import type { Chart } from "./types.js";

/** A stored chart record (`<slug>.json`). */
export interface StoredChart {
  slug: string;
  savedAt: string;
  title: string;
  composer?: string;
  style?: string;
  key?: string;
  variant?: "straight" | "embellished";
  bpm?: number;
  measuresPerLine?: number;
  measures?: Chart["measures"];
  raw?: string;
  progression: string;
  irealbUrl: string;
  irealbookUrl: string;
  asciiPreview: string;
  warnings: string[];
  /** Harmonic analysis (present when built from structured measures). */
  analysis?: ChartAnalysis;
}

/** Resolve the library directory (`IREAL_LIBRARY` env, else ~/.ireal-mcp/charts). */
export function libraryDir(): string {
  const dir = process.env.IREAL_LIBRARY
    ? resolve(process.env.IREAL_LIBRARY)
    : join(homedir(), ".ireal-mcp", "charts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Turn a title into a filesystem- and URL-safe slug. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "untitled";
}

function jsonPathFor(slug: string): string {
  return join(libraryDir(), `${slug}.json`);
}
function htmlPathFor(slug: string): string {
  return join(libraryDir(), `${slug}.html`);
}

export interface SaveResult {
  record: StoredChart;
  jsonPath: string;
  htmlPath: string;
}

/** Build a chart and persist it to the library. Overwrites a matching slug. */
export function saveChart(chart: Chart, slug?: string): SaveResult {
  const built = buildChart(chart);
  // Default slug: title, plus the variant suffix so straight/embellished coexist.
  const base = slug ? slugify(slug) : slugify(chart.title);
  const finalSlug = !slug && chart.variant ? `${base}-${chart.variant}` : base;

  const record: StoredChart = {
    slug: finalSlug,
    savedAt: new Date().toISOString(),
    title: chart.title,
    composer: chart.composer,
    style: chart.style,
    key: chart.key,
    variant: chart.variant,
    bpm: chart.bpm,
    measuresPerLine: chart.measuresPerLine,
    measures: chart.measures,
    raw: chart.raw,
    progression: built.progression,
    irealbUrl: built.irealbUrl,
    irealbookUrl: built.irealbookUrl,
    asciiPreview: built.asciiPreview,
    warnings: built.warnings,
    analysis: chart.measures && chart.measures.length ? analyzeChart(chart) : undefined,
  };

  const jsonPath = jsonPathFor(finalSlug);
  const htmlPath = htmlPathFor(finalSlug);
  writeFileSync(jsonPath, JSON.stringify(record, null, 2), "utf8");
  writeFileSync(
    htmlPath,
    htmlDocument({
      title: chart.title,
      composer: chart.composer,
      style: chart.style,
      url: built.irealbUrl,
      asciiPreview: built.asciiPreview,
    }),
    "utf8",
  );

  return { record, jsonPath, htmlPath };
}

/** List all stored charts, newest first. */
export function listCharts(): StoredChart[] {
  const dir = libraryDir();
  const records: StoredChart[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      records.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as StoredChart);
    } catch {
      // Skip unreadable/corrupt entries.
    }
  }
  records.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return records;
}

/** Get one stored chart by slug, or null. */
export function getChart(slug: string): StoredChart | null {
  const p = jsonPathFor(slug);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as StoredChart;
  } catch {
    return null;
  }
}

/** Delete a stored chart (json + html). Returns true if anything was removed. */
export function deleteChart(slug: string): boolean {
  let removed = false;
  for (const p of [jsonPathFor(slug), htmlPathFor(slug)]) {
    if (existsSync(p)) {
      rmSync(p);
      removed = true;
    }
  }
  return removed;
}
