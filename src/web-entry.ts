/**
 * Browser bundle entry point. Exposes the pure chart engine on a global so the
 * single-file web app (ireal-studio.html) can call it with no server. Nothing
 * here touches Node APIs (no fs/http/Buffer).
 */
import { buildChart } from "./build.js";
import { analyzeChart } from "./analyze.js";
import { analysisHtml, htmlDocument } from "./render.js";
import { parseTextChart } from "./textchart.js";
import { parseUrl } from "./url.js";
import {
  STYLES_JAZZ,
  STYLES_LATIN,
  STYLES_POP,
  KEYS,
  CHORD_QUALITIES,
} from "./constants.js";

(globalThis as Record<string, unknown>).iReal = {
  buildChart,
  analyzeChart,
  analysisHtml,
  htmlDocument,
  parseTextChart,
  parseUrl,
  styles: { jazz: STYLES_JAZZ, latin: STYLES_LATIN, pop: STYLES_POP },
  keys: KEYS,
  qualities: CHORD_QUALITIES,
};
