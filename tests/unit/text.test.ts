import { describe, expect, it } from "vitest";
import {
  containsEmoji,
  containsLongDash,
  describeForbiddenCharacters,
} from "../../src/lib/text.ts";

const codePoint = (...points: readonly number[]): string => String.fromCodePoint(...points);

describe("emoji detection", () => {
  it("detects a pictographic emoji", () => {
    expect(containsEmoji(codePoint(0x1f680))).toBe(true);
  });

  it("detects a variation selector presentation emoji", () => {
    expect(containsEmoji(`warning ${codePoint(0x26a0, 0xfe0f)}`)).toBe(true);
  });

  it("detects a regional indicator pair", () => {
    expect(containsEmoji(codePoint(0x1f1eb, 0x1f1f7))).toBe(true);
  });

  it("accepts plain text", () => {
    expect(containsEmoji("Warning")).toBe(false);
    expect(containsEmoji("A4 210 by 297")).toBe(false);
  });

  it("accepts typographic glyphs that are not emoji", () => {
    expect(containsEmoji(codePoint(0x2022))).toBe(false);
    expect(containsEmoji(codePoint(0x00a9))).toBe(false);
    expect(containsEmoji(codePoint(0x2122))).toBe(false);
    expect(containsEmoji(codePoint(0x2713))).toBe(false);
  });
});

describe("long dash detection", () => {
  it("detects an en dash and an em dash", () => {
    expect(containsLongDash(`1${codePoint(0x2013)}2`)).toBe(true);
    expect(containsLongDash(`a ${codePoint(0x2014)} b`)).toBe(true);
  });

  it("accepts a hyphen", () => {
    expect(containsLongDash("a - b")).toBe(false);
  });
});

describe("explanations", () => {
  it("names the offending character class", () => {
    expect(describeForbiddenCharacters(codePoint(0x1f680))).toContain("Emoji");
    expect(describeForbiddenCharacters(codePoint(0x2013))).toContain("U+2013");
    expect(describeForbiddenCharacters(codePoint(0x2014))).toContain("U+2014");
  });

  it("returns null for acceptable text", () => {
    expect(describeForbiddenCharacters("Figure 1. Sales by region")).toBeNull();
  });
});
