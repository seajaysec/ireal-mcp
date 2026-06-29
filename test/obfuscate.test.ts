import { describe, it, expect } from "vitest";
import { obfuscate, deobfuscate, hussle, MAGIC } from "../src/obfuscate.js";

describe("obfuscate", () => {
  // Ground-truth vector from the Data::iRealPro source comments.
  // The input is short (<50 chars) so hussle is a no-op and only the
  // substitution step + magic prefix apply.
  it("matches the canonical short example", () => {
    const plain = "[T44C   |G   |C   |G   Z";
    const expected = "1r34LbKcu7[T44CXyQ|GXyQ|CXyQ|GXyQZ";
    expect(obfuscate(plain)).toBe(expected);
  });

  it("starts payloads with the magic prefix", () => {
    expect(obfuscate("[T44C   Z").startsWith(MAGIC)).toBe(true);
  });

  it("round-trips short strings", () => {
    const plain = "[T44C   |G7  |C   |G7  Z";
    expect(deobfuscate(obfuscate(plain))).toBe(plain);
  });

  it("round-trips long strings (exercises hussle segmentation)", () => {
    const plain =
      "{*AT44D- D-/C |Bh7 Bb7 |D-/A G-7 |D-/F Eh A7 |" +
      "lD- D-/C |Bh7 Bb7 |D-/A G-7 |D-/F Eh A7 }" +
      "[*BC-7 F7 |Bb^7  |C-7 F7 |Bb^7 n |C-7 F7 |Bb^7  |B-7 E7 |A7   Z";
    expect(deobfuscate(obfuscate(plain))).toBe(plain);
  });
});

describe("obfuscate vs. real iReal Pro output (ground truth)", () => {
  // The obfuscated payload of "You're Still The One" from a genuine iReal
  // export (perl-Data-iRealPro/t/15-string.t). Long enough to exercise hussle
  // — proves our port matches the app's scrambling, not just itself.
  const realPayload =
    "1r34LbKcu7L#F/D4DLZD} AZLGZL#F/DZLAD*{\n} AZLGZL#F/\n|DLZ4Ti*{DZLAZLZSDLGZLDB*{\n] AZLALZGZLDZLAZLAZLGZLZE-LAZLGZ#F/DZALZN1] >adoC la .S.<D A2N|QyXQyX} G\n[QDLZLGZLLZGLZfA Z ";

  it("deobfuscates real iReal output to clean chords", () => {
    const plain = deobfuscate(realPayload);
    expect(plain).toContain("{*iT44D |D/F# |G |A }");
    expect(plain).toContain("<D.S. al Coda>");
    expect(plain.includes("XyQ")).toBe(false); // fully de-substituted
  });

  it("re-obfuscates back to the exact real payload (byte-for-byte)", () => {
    expect(obfuscate(deobfuscate(realPayload))).toBe(realPayload);
  });
});

describe("hussle", () => {
  it("is its own inverse", () => {
    const s = "x".repeat(37) + "abcdefghij" + "y".repeat(120) + "tail";
    expect(hussle(hussle(s))).toBe(s);
  });

  it("leaves strings of 50 chars or fewer unchanged", () => {
    const s = "a".repeat(50);
    expect(hussle(s)).toBe(s);
  });
});
