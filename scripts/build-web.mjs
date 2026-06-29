#!/usr/bin/env node
/**
 * Bundle the chart engine into the single self-contained web app.
 * Reads web/template.html, inlines the esbuild-bundled engine where the
 * `/*__ENGINE__*\/` marker is, and writes dist-web/ireal-studio.html.
 *
 *   node scripts/build-web.mjs
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const result = await build({
  entryPoints: [join(root, "src", "web-entry.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2019",
  minify: true,
  write: false,
});

const engineJs = result.outputFiles[0].text;

const template = readFileSync(join(root, "web", "template.html"), "utf8");
const html = template.replace("/*__ENGINE__*/", () => engineJs);

const outDir = join(root, "dist-web");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "ireal-studio.html");
writeFileSync(outPath, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log(`Wrote ${outPath} (${kb} KB, self-contained — open it in any browser, offline).`);
