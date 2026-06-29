/**
 * MCP server exposing iReal Pro chart tools.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { buildChart } from "./build.js";
import { asciiFromMeasures, splitProgressionToMeasures } from "./render.js";
import { parseUrl } from "./url.js";
import { saveChart, listCharts, deleteChart, getChart, libraryDir } from "./library.js";
import { analyzeChart, type ChartAnalysis } from "./analyze.js";
import { primaryBaseUrl, baseUrls, serverPort } from "./net.js";
import {
  STYLES_JAZZ,
  STYLES_LATIN,
  STYLES_POP,
  CHORD_QUALITIES,
  ROOTS,
  KEYS,
  TIME_SIGNATURES,
} from "./constants.js";
import type { Chart } from "./types.js";

const measureSchema = z
  .object({
    chords: z
      .array(z.string())
      .optional()
      .describe('Chord symbols left to right, e.g. ["C^7"] or ["A-7","D7"]. Root + quality + optional /bass.'),
    section: z.enum(["A", "B", "C", "D", "V", "i"]).optional().describe("Rehearsal mark above the measure."),
    open: z.enum(["|", "[", "{"]).optional().describe("Opening barline. { starts a repeat."),
    close: z.enum(["|", "]", "}", "Z"]).optional().describe("Closing barline. } ends a repeat, Z is the final bar."),
    ending: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional().describe("Volta/ending bracket number."),
    timeSignature: z.string().optional().describe('Time-signature override for this measure, "n/d" (e.g. "3/4").'),
    staffText: z.string().optional().describe('Text under the chords, e.g. "D.C. al Coda".'),
    segno: z.boolean().optional(),
    coda: z.boolean().optional(),
    fermata: z.boolean().optional(),
    noChord: z.boolean().optional().describe("Render as a single N.C. measure."),
    repeatPrevious: z.enum(["measure", "twoMeasures"]).optional().describe("One-bar (%) or two-bar repeat symbol."),
    repeatTimes: z.number().int().optional().describe("Play count for a measure that closes a repeat (emits <Nx>)."),
  })
  .strict();

const chartShape = {
  title: z.string().describe("Song title."),
  composer: z.string().optional().describe('Composer "First Last" (reordered to "Last First" for sorting).'),
  reorderComposer: z
    .boolean()
    .optional()
    .describe('Reorder composer to "Last First" for sorting. Default true. Set false for band names (e.g. "Black Sabbath").'),
  style: z.string().optional().describe('iReal Pro style, e.g. "Medium Swing". See list_styles. Default "Medium Swing".'),
  key: z.string().optional().describe('Key signature, e.g. "Bb" or "D-" for minor. Default "C".'),
  bpm: z.number().int().optional().describe("Tempo in BPM (optional)."),
  timeSignature: z.string().optional().describe('Default time signature "n/d". Default "4/4".'),
  variant: z
    .enum(["straight", "embellished"])
    .optional()
    .describe(
      "Which reading this is. By convention chart every song twice: 'straight' (real transcription, not " +
        "dumbed down) and 'embellished' (richer qualities/substitutions, SAME harmonic rhythm — no faster " +
        "to play). Sets the slug suffix and a badge.",
    ),
  measuresPerLine: z
    .number()
    .int()
    .optional()
    .describe("Measures per line; padded so the app wraps consistently. Must divide 16. Default 4 (piano-reading sweet spot)."),
  measures: z.array(measureSchema).optional().describe("Structured measures (preferred). Mutually exclusive with `raw`."),
  raw: z
    .string()
    .optional()
    .describe("Raw iReal Pro progression string (power users). Used verbatim; mutually exclusive with `measures`."),
};

function analysisText(title: string, a: ChartAnalysis): string {
  const lines = [
    `# ${title} — analysis`,
    "",
    `Key: ${a.key} (${a.tonality}).`,
    `One scale for the whole tune: ${a.homeScale} — ${a.homeScaleNotes}`,
    `Shortcut: ${a.homePentatonic} — ${a.homePentatonicNotes}`,
    "",
    "## Jam plan",
    ...a.jamPlan.map((p) => `- ${p}`),
  ];
  if (a.cells.length) {
    lines.push("", "## Cadences & cells", ...a.cells.map((c) => `- ${c}`));
  }
  lines.push("", "## Chord-by-chord", "| Chord | Roman | Function | Scale | Notes |", "|---|---|---|---|---|");
  for (const c of a.chords) {
    const sc = c.scaleChange ? `**${c.scale}**` : c.scale;
    lines.push(`| ${c.symbol} | ${c.roman} | ${c.function} | ${sc} (${c.scaleNotes}) | ${c.note ?? ""} |`);
  }
  return lines.join("\n");
}

interface SummaryExtras {
  htmlPath?: string;
  savedSlug?: string;
  savedPaths?: { jsonPath: string; htmlPath: string };
}

function summary(title: string, r: ReturnType<typeof buildChart>, extra: SummaryExtras = {}): string {
  const lines = [
    `# ${title}`,
    "",
    "## Layout preview",
    "```",
    r.asciiPreview,
    "```",
  ];

  if (extra.savedSlug) {
    const port = serverPort();
    lines.push(
      "",
      "## Saved to library / served over HTTP",
      `- Library files: ${extra.savedPaths?.htmlPath}`,
      `- View page: ${primaryBaseUrl(port)}/chart/${extra.savedSlug}`,
      `- Direct import (tap on a device with iReal Pro): ${primaryBaseUrl(port)}/import/${extra.savedSlug}`,
      `- (Start the server with \`npm run serve\` if it isn't running. Other reachable hosts: ${baseUrls(port).join(", ")})`,
    );
  }

  lines.push(
    "",
    "## Import links",
    `- irealb:// (modern, recommended): ${r.irealbUrl}`,
    `- irealbook:// (legacy): ${r.irealbookUrl}`,
  );
  if (extra.htmlPath) lines.push(`- Extra HTML copy written to: ${extra.htmlPath}`);
  lines.push("", `## Raw progression`, "```", r.progression, "```");
  if (r.warnings.length) {
    lines.push("", "## Warnings");
    for (const w of r.warnings) lines.push(`- ${w}`);
  } else {
    lines.push("", "No warnings — layout is clean.");
  }
  return lines.join("\n");
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "ireal-mcp", version: "0.1.0" },
    {
      instructions: [
        "Create piano-friendly iReal Pro chord charts laid out at a fixed number of measures per line (default 4).",
        "Prefer structured `measures`. Use list_styles and list_chord_qualities to emit valid vocabulary.",
        "create_chart saves to the library and serves it over HTTP; it returns a tappable irealb:// link.",
        "",
        "CHART THE WHOLE SONG, not one section. Transcribe the COMPLETE form — intro, every verse/",
        "chorus, bridge, solo section, and outro — using repeats and endings to capture the full arrangement.",
        "Real songs are almost never 8 bars; expect a full form (commonly 24-32+ bars). Research the actual",
        "structure; do not ship just the A section or a representative loop. (A true one-chord vamp is the rare",
        "exception — say so explicitly.) The builder warns when a chart is under 16 bars.",
        "",
        "SONG WORKFLOW — when asked to chart a song, ALWAYS produce TWO charts in the same run:",
        "  1) variant 'straight': the REAL chords from an actual transcription (research them; do NOT invent",
        "     or dumb them down — a simple song stays simple, a complex one keeps its changes).",
        "  2) variant 'embellished': a more interesting reharmonisation that PRESERVES the harmonic rhythm.",
        "     Add colour VERTICALLY — richer chord qualities (maj7/9/13, sus, alt), slash-bass voice-leading,",
        "     tasteful substitutions — NOT horizontally. Do not increase the chord-change rate or pack extra",
        "     chords into bars: the embellished version must be no harder/faster to play than the straight one.",
        "Save both with variant set (slugs become '<song>-straight' / '<song>-embellished').",
        "Source chords via web search; do NOT rely on browser automation. State what is verified vs. a reading.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "create_chart",
    {
      title: "Create iReal Pro chart",
      description:
        "Build an iReal Pro chord chart from structured measures (or a raw progression). " +
        "Every measure is padded to a fixed cell width so iReal Pro wraps to exactly `measuresPerLine` " +
        "measures per line (default 4). By default the chart is SAVED to the on-disk library and served " +
        "by the standalone HTTP server (so it's reachable from other devices on the network). Returns a " +
        "modern irealb:// import link, a legacy irealbook:// link, the served URLs, an ASCII layout " +
        "preview, and validation warnings.",
      inputSchema: {
        ...chartShape,
        save: z
          .boolean()
          .optional()
          .describe("Save to the library and serve over HTTP. Default true. Set false for a one-off (use preview_chart for pure iteration)."),
        slug: z
          .string()
          .optional()
          .describe("URL/file slug for the saved chart (defaults to a slug of the title). Reusing a slug overwrites."),
        outputHtmlPath: z
          .string()
          .optional()
          .describe("If set, also write a standalone HTML copy to this arbitrary path."),
      },
    },
    async (args) => {
      const { outputHtmlPath, save, slug, ...chart } = args as Chart & {
        outputHtmlPath?: string;
        save?: boolean;
        slug?: string;
      };

      const extra: SummaryExtras = {};
      let result: ReturnType<typeof buildChart>;

      if (save !== false) {
        const saved = saveChart(chart, slug);
        extra.savedSlug = saved.record.slug;
        extra.savedPaths = { jsonPath: saved.jsonPath, htmlPath: saved.htmlPath };
        result = {
          irealbUrl: saved.record.irealbUrl,
          irealbookUrl: saved.record.irealbookUrl,
          html: "",
          asciiPreview: saved.record.asciiPreview,
          progression: saved.record.progression,
          warnings: saved.record.warnings,
        };
      } else {
        result = buildChart(chart);
      }

      if (outputHtmlPath) {
        extra.htmlPath = resolve(outputHtmlPath);
        const html = save !== false ? buildChart(chart).html : result.html;
        await writeFile(extra.htmlPath, html, "utf8");
      }

      return {
        content: [{ type: "text", text: summary(chart.title, result, extra) }],
      };
    },
  );

  server.registerTool(
    "preview_chart",
    {
      title: "Preview chart layout",
      description:
        "Render only the ASCII layout grid for a chart (measuresPerLine per row) without building the " +
        "import links. Fast way to check the 4-bars-per-line layout while iterating on chords.",
      inputSchema: chartShape,
    },
    async (args) => {
      const chart = args as Chart;
      let ascii: string;
      if (chart.raw && !(chart.measures && chart.measures.length)) {
        ascii = asciiFromMeasures({
          ...chart,
          measures: splitProgressionToMeasures(chart.raw),
        });
      } else {
        ascii = asciiFromMeasures(chart);
      }
      return { content: [{ type: "text", text: "```\n" + ascii + "\n```" }] };
    },
  );

  server.registerTool(
    "decode_chart",
    {
      title: "Decode an iReal Pro URL",
      description:
        "Parse an existing irealb:// or irealbook:// URL (or HTML containing one) back into its title, " +
        "composer, style, key, the raw progression, and a best-effort measure list — useful for editing " +
        "an existing chart.",
      inputSchema: {
        url: z.string().describe("An irealb:// or irealbook:// URL, or HTML/text containing one."),
      },
    },
    async ({ url }) => {
      const song = parseUrl(url);
      const measures = splitProgressionToMeasures(song.progression);
      const out = {
        variant: song.variant,
        title: song.title,
        composer: song.composer,
        style: song.style,
        key: song.key,
        bpm: song.bpm,
        progression: song.progression,
        measures,
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    },
  );

  server.registerTool(
    "list_styles",
    {
      title: "List iReal Pro styles",
      description: "List the built-in iReal Pro play-along styles, grouped by family (Jazz / Latin / Pop).",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { jazz: STYLES_JAZZ, latin: STYLES_LATIN, pop: STYLES_POP },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "list_chord_qualities",
    {
      title: "List chord vocabulary",
      description:
        "List the chord roots, qualities, time signatures, and key signatures iReal Pro understands, so " +
        "generated charts use valid symbols. Chord = root + quality + optional /bass (e.g. C-7/Bb).",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              roots: ROOTS,
              qualities: CHORD_QUALITIES,
              keys: KEYS,
              timeSignatures: Object.keys(TIME_SIGNATURES),
              notes:
                "Bass/inversions via /Note (e.g. C/E). Alternate chords in parentheses (e.g. (Db^7)). " +
                "Custom qualities allowed as *text*.",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerTool(
    "analyze_chart",
    {
      title: "Analyze a chart's harmony",
      description:
        "Harmonic analysis to help plan a solo: Roman numerals, chord function, a chord-scale recommendation " +
        "per chord (with the actual scale notes), detected ii–V(–I) cells, and a short jam plan. Pass `slug` " +
        "to analyze a saved chart, or pass `key` + `measures` to analyze inline.",
      inputSchema: {
        slug: z.string().optional().describe("Slug of a saved chart to analyze (see list_charts)."),
        ...chartShape,
      },
    },
    async (args) => {
      const { slug, ...chart } = args as Chart & { slug?: string };
      let analysis: ChartAnalysis | undefined;
      let title = chart.title;

      if (slug) {
        const rec = getChart(slug);
        if (!rec) return { content: [{ type: "text", text: `No chart with slug "${slug}".` }] };
        title = rec.title;
        analysis = rec.analysis ?? (rec.measures ? analyzeChart({ ...rec }) : undefined);
      } else {
        if (!chart.measures || !chart.measures.length) {
          return { content: [{ type: "text", text: "Provide `slug`, or `measures` + `key` to analyze." }] };
        }
        analysis = analyzeChart(chart);
      }
      if (!analysis) {
        return { content: [{ type: "text", text: "No structured measures to analyze (raw charts can't be analyzed)." }] };
      }
      return { content: [{ type: "text", text: analysisText(title, analysis) }] };
    },
  );

  server.registerTool(
    "list_charts",
    {
      title: "List saved charts",
      description: "List all charts in the on-disk library, with their slugs and served URLs.",
      inputSchema: {},
    },
    async () => {
      const port = serverPort();
      const base = primaryBaseUrl(port);
      const charts = listCharts().map((c) => ({
        slug: c.slug,
        title: c.title,
        composer: c.composer,
        style: c.style,
        key: c.key,
        savedAt: c.savedAt,
        view: `${base}/chart/${c.slug}`,
        import: `${base}/import/${c.slug}`,
      }));
      return {
        content: [
          { type: "text", text: JSON.stringify({ library: libraryDir(), index: base, charts }, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "delete_chart",
    {
      title: "Delete a saved chart",
      description: "Remove a chart from the library by slug (deletes its .json and .html).",
      inputSchema: { slug: z.string().describe("The slug of the chart to delete (see list_charts).") },
    },
    async ({ slug }) => {
      const removed = deleteChart(slug);
      return {
        content: [{ type: "text", text: removed ? `Deleted "${slug}".` : `No chart with slug "${slug}".` }],
      };
    },
  );

  server.registerTool(
    "server_info",
    {
      title: "HTTP server info",
      description:
        "Report the library directory, the configured port, and the LAN URLs where the chart server is " +
        "(or will be) reachable from other devices. Also gives the command to start the server.",
      inputSchema: {},
    },
    async () => {
      const port = serverPort();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                library: libraryDir(),
                port,
                start: "npm run serve   (or: node dist/serve.js)",
                primaryUrl: primaryBaseUrl(port),
                reachableAt: baseUrls(port),
                portOverrideEnv: "IREAL_PORT",
                libraryOverrideEnv: "IREAL_LIBRARY",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "chart_song",
    {
      title: "Chart a song (straight + embellished)",
      description:
        "Research a song's real chords and create BOTH a straight chart and an embellished chart, saved to " +
        "the library and served over HTTP.",
      argsSchema: {
        song: z.string().describe('Song to chart, e.g. "Videotape by Radiohead".'),
      },
    },
    ({ song }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Chart "${song}" for iReal Pro. Do all of this:`,
              "",
              "1. Research the actual chords AND the full form from a real transcription via web search (no",
              "   browser automation). Chart the COMPLETE song — intro, all verses/choruses, bridge, solo,",
              "   outro — via repeats/endings, NOT just one section. Note what is verified vs. your reading.",
              "2. Call create_chart TWICE:",
              "   - variant 'straight': the real chords as transcribed — do not simplify or dumb them down.",
              "   - variant 'embellished': more interesting harmony with the SAME harmonic rhythm. Add colour",
              "     vertically (maj7/9/13, sus, alt, slash-bass voice leading, tasteful subs); do NOT add chords",
              "     that make it faster/harder to play than the straight version.",
              "3. Use 4 measures per line. Set composer (reorderComposer:false for bands).",
              "4. Report both served /import links and the layout previews, and cite your sources.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}
