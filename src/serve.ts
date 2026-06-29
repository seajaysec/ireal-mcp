#!/usr/bin/env node
/**
 * Standalone always-on HTTP server for the chart library.
 *
 * Bound to 0.0.0.0 so other devices on the LAN can reach it at a stable
 * `http://<this-machine>:<port>`. Reads the library directory per request, so
 * charts saved by the MCP tools appear immediately. No external dependencies.
 *
 * Routes:
 *   GET /                  index of all charts (+ "open all as playlist")
 *   GET /chart/<slug>      view a chart (preview + import button)
 *   GET /import/<slug>     302 redirect to the chart's irealb:// URL
 *   GET /playlist          302 redirect to an irealb:// playlist of all charts
 *   GET /healthz           "ok"
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { listCharts, getChart, libraryDir } from "./library.js";
import { indexHtml, chartPageHtml } from "./render.js";
import { buildPlaylistUrl } from "./url.js";
import { serverPort, baseUrls, primaryBaseUrl } from "./net.js";

function send(res: ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function playlistUrl(): string | null {
  const charts = listCharts();
  if (charts.length === 0) return null;
  return buildPlaylistUrl(
    charts.map((c) => ({
      title: c.title,
      composer: c.composer,
      style: c.style ?? "Medium Swing",
      key: c.key ?? "C",
      bpm: c.bpm,
      progression: c.progression,
    })),
    "ireal-mcp library",
  );
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = decodeURIComponent(url.pathname);

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method Not Allowed", "text/plain");
    return;
  }

  if (path === "/healthz") {
    send(res, 200, "ok", "text/plain");
    return;
  }

  if (path === "/") {
    const charts = listCharts();
    send(res, 200, indexHtml(charts, { playlistHref: charts.length ? "/playlist" : undefined }));
    return;
  }

  if (path === "/playlist") {
    const pl = playlistUrl();
    if (!pl) {
      send(res, 404, "No charts in the library yet.", "text/plain");
      return;
    }
    redirect(res, pl);
    return;
  }

  const importMatch = path.match(/^\/import\/(.+)$/);
  if (importMatch) {
    const rec = getChart(importMatch[1]);
    if (!rec) {
      send(res, 404, "Chart not found.", "text/plain");
      return;
    }
    redirect(res, rec.irealbUrl);
    return;
  }

  const chartMatch = path.match(/^\/chart\/(.+)$/);
  if (chartMatch) {
    const rec = getChart(chartMatch[1]);
    if (!rec) {
      send(res, 404, "Chart not found.", "text/plain");
      return;
    }
    send(res, 200, chartPageHtml(rec));
    return;
  }

  send(res, 404, "Not found.", "text/plain");
}

export function startServer(port = serverPort()): ReturnType<typeof createServer> {
  const server = createServer(handleRequest);
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`ireal-mcp HTTP server listening on port ${port}\n`);
    process.stdout.write(`Library: ${libraryDir()}\n`);
    process.stdout.write("Reachable at:\n");
    for (const u of baseUrls(port)) process.stdout.write(`  ${u}\n`);
    process.stdout.write(`\nOpen ${primaryBaseUrl(port)} on a device with iReal Pro to import charts.\n`);
  });
  return server;
}

// Run when executed directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer();
}
