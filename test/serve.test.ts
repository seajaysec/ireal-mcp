import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";

import { handleRequest } from "../src/serve.js";
import { saveChart } from "../src/library.js";
import { buildPlaylistUrl } from "../src/url.js";
import type { Chart } from "../src/types.js";

let dir: string;
let server: Server;
let base: string;

const chart: Chart = {
  title: "Served Tune",
  composer: "A B",
  style: "Medium Swing",
  key: "C",
  measures: [{ chords: ["C^7"] }, { chords: ["A-7", "D7"] }, { chords: ["G^7"] }, { chords: ["C^7"] }],
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ireal-serve-"));
  process.env.IREAL_LIBRARY = dir;
  saveChart(chart); // slug "served-tune"

  server = createServer(handleRequest);
  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  delete process.env.IREAL_LIBRARY;
  await new Promise<void>((res) => server.close(() => res()));
  rmSync(dir, { recursive: true, force: true });
});

describe("HTTP server", () => {
  it("serves the index with the chart and a playlist link", async () => {
    const r = await fetch(`${base}/`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("Served Tune");
    expect(html).toContain("/chart/served-tune");
    expect(html).toContain("/playlist");
  });

  it("serves a chart page with an import button", async () => {
    const r = await fetch(`${base}/chart/served-tune`);
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("Open in iReal Pro");
    expect(html).toContain("irealb://");
  });

  it("redirects /import/<slug> to the irealb:// URL", async () => {
    const r = await fetch(`${base}/import/served-tune`, { redirect: "manual" });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")?.startsWith("irealb://")).toBe(true);
  });

  it("redirects /playlist to an irealb:// playlist", async () => {
    const r = await fetch(`${base}/playlist`, { redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = r.headers.get("location") ?? "";
    expect(loc.startsWith("irealb://")).toBe(true);
    // Playlist separator (===) survives as percent-encoded =.
    expect(loc).toContain("%3D%3D%3D");
  });

  it("answers health checks and 404s unknown paths", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/import/missing`)).status).toBe(404);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});

describe("buildPlaylistUrl", () => {
  it("joins songs with === and appends the name", () => {
    const url = buildPlaylistUrl(
      [
        { title: "One", style: "Medium Swing", key: "C", progression: "[T44C   Z" },
        { title: "Two", style: "Medium Swing", key: "C", progression: "[T44D-7  Z" },
      ],
      "My Set",
    );
    expect(url.startsWith("irealb://")).toBe(true);
    expect(url).toContain("%3D%3D%3D"); // === separators
    expect(url).toContain("My%20Set");
  });
});
