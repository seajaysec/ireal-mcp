import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveChart, listCharts, getChart, deleteChart, slugify, libraryDir } from "../src/library.js";
import type { Chart } from "../src/types.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ireal-lib-"));
  process.env.IREAL_LIBRARY = dir;
});

afterAll(() => {
  delete process.env.IREAL_LIBRARY;
  rmSync(dir, { recursive: true, force: true });
});

const chart: Chart = {
  title: "Test Tune",
  composer: "Jane Doe",
  style: "Bossa Nova",
  key: "F",
  measures: [{ chords: ["F^7"] }, { chords: ["G-7", "C7"] }, { chords: ["F^7"] }, { chords: ["F^7"] }],
};

describe("library", () => {
  it("slugifies titles", () => {
    expect(slugify("The Girl From Ipanema!")).toBe("the-girl-from-ipanema");
    expect(slugify("  ")).toBe("untitled");
  });

  it("uses the IREAL_LIBRARY override", () => {
    expect(libraryDir()).toBe(dir);
  });

  it("saves a chart as json + html and can read it back", () => {
    const { record, jsonPath, htmlPath } = saveChart(chart);
    expect(record.slug).toBe("test-tune");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(htmlPath)).toBe(true);
    expect(record.irealbUrl.startsWith("irealb://")).toBe(true);

    const got = getChart("test-tune");
    expect(got?.title).toBe("Test Tune");
    expect(got?.progression).toBe(record.progression);
  });

  it("overwrites when the slug repeats", () => {
    saveChart(chart, "fixed");
    saveChart({ ...chart, title: "Renamed" }, "fixed");
    const all = listCharts().filter((c) => c.slug === "fixed");
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Renamed");
  });

  it("lists and deletes charts", () => {
    saveChart({ ...chart, title: "Second" });
    const slugs = listCharts().map((c) => c.slug);
    expect(slugs).toContain("second");
    expect(deleteChart("second")).toBe(true);
    expect(getChart("second")).toBeNull();
    expect(deleteChart("second")).toBe(false);
  });
});
