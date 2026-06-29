import { describe, it, expect } from "vitest";
import {
  buildIrealbUrl,
  buildIrealbookUrl,
  parseUrl,
  formatComposer,
  formatTitle,
} from "../src/url.js";
import { buildChart } from "../src/build.js";
import type { Chart } from "../src/types.js";

describe("formatting helpers", () => {
  it("reorders composer to Last First", () => {
    expect(formatComposer("Benny Carter")).toBe("Carter Benny");
    expect(formatComposer("Monk")).toBe("Monk");
    expect(formatComposer("")).toBe("");
  });

  it("keeps the composer verbatim when reorder is off (band names)", () => {
    expect(formatComposer("Black Sabbath", false)).toBe("Black Sabbath");
    expect(formatComposer("Benny Carter", false)).toBe("Benny Carter");
  });

  it("moves a leading 'The' to the end for sorting", () => {
    expect(formatTitle("The Girl From Ipanema")).toBe("Girl From Ipanema, The");
    expect(formatTitle("Autumn Leaves")).toBe("Autumn Leaves");
  });
});

describe("URL building", () => {
  const fields = {
    title: "Test",
    composer: "Benny Carter",
    style: "Medium Swing",
    key: "C",
    progression: "[T44C   |G7  |C   |G7  Z",
  };

  it("builds a percent-encoded irealb:// URL with the magic payload", () => {
    const url = buildIrealbUrl(fields);
    expect(url.startsWith("irealb://")).toBe(true);
    // Magic prefix survives encoding (alphanumerics aren't escaped).
    expect(url).toContain("1r34LbKcu7");
    // Separators are encoded.
    expect(url).toContain("%3D");
    expect(url).toContain("%20"); // space in composer/title
  });

  it("builds a legacy irealbook:// URL with plain progression", () => {
    const url = buildIrealbookUrl(fields);
    expect(url.startsWith("irealbook://")).toBe(true);
    expect(url).toContain("%3Dn%3D"); // =n= separator before progression
  });
});

describe("round-trip via parseUrl", () => {
  const chart: Chart = {
    title: "Round Trip",
    composer: "Jane Doe",
    style: "Bossa Nova",
    key: "F",
    bpm: 140,
    measures: [
      { chords: ["F^7"] },
      { chords: ["G-7", "C7"] },
      { chords: ["A-7", "D7"] },
      { chords: ["G-7", "C7"] },
    ],
  };

  it("decodes a freshly built modern URL back to the same progression", () => {
    const built = buildChart(chart);
    const parsed = parseUrl(built.irealbUrl);
    expect(parsed.variant).toBe("irealpro");
    expect(parsed.title).toBe("Round Trip");
    expect(parsed.composer).toBe("Doe Jane");
    expect(parsed.style).toBe("Bossa Nova");
    expect(parsed.key).toBe("F");
    expect(parsed.bpm).toBe(140);
    expect(parsed.progression).toBe(built.progression);
  });

  it("decodes a legacy URL too", () => {
    const built = buildChart(chart);
    const parsed = parseUrl(built.irealbookUrl);
    expect(parsed.variant).toBe("irealbook");
    expect(parsed.progression).toBe(built.progression);
  });

  it("extracts a URL embedded in an HTML href", () => {
    const built = buildChart(chart);
    const html = `<a href="${built.irealbUrl}">Round Trip</a>`;
    const parsed = parseUrl(html);
    expect(parsed.title).toBe("Round Trip");
  });
});
