import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { clampListLevel } from "../../src/formats/docx/render/list.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { dxa } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import type { ConversionResult } from "../../src/types/format.ts";

const convert = async (markdown: string): Promise<ConversionResult> => {
  const normalized = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: dxa(9026),
    tabWidth: 4,
    minimumColumnWidth: dxa(680),
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  return docxBackend.convert({
    document: normalized.document,
    theme: defaultTheme,
    strict: false,
  });
};

const documentXmlOf = async (markdown: string): Promise<string> => {
  const result = await convert(markdown);
  const archive = await readDocxArchive(Buffer.from(result.body));
  return entryOf(archive, "word/document.xml");
};

const numberingIdsOf = (xml: string): readonly string[] =>
  [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((match) => match[1] ?? "");

const levelsOf = (xml: string): readonly string[] =>
  [...xml.matchAll(/<w:ilvl w:val="(\d+)"\/>/g)].map((match) => match[1] ?? "");

const paragraphStylesOf = (xml: string): readonly string[] =>
  [...xml.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)].map((match) => match[1] ?? "");

describe("independent numbering per list", () => {
  it("gives two consecutive ordered lists two numbering identifiers", async () => {
    const xml = await documentXmlOf("1. a\n2. b\n\nBetween.\n\n1. c\n2. d\n");
    const ids = numberingIdsOf(xml);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
  });

  it("gives three consecutive lists three numbering identifiers", async () => {
    const xml = await documentXmlOf("1. a\n\ntext\n\n1. b\n\ntext\n\n1. c\n");
    expect(new Set(numberingIdsOf(xml)).size).toBe(3);
  });

  it("keeps one numbering identifier across the levels of one list", async () => {
    const xml = await documentXmlOf("1. a\n   1. b\n      1. c\n");
    expect(new Set(numberingIdsOf(xml)).size).toBe(1);
    expect(levelsOf(xml)).toEqual(["0", "1", "2"]);
  });
});

describe("nesting", () => {
  it("renders nine levels without clipping or warning", async () => {
    const markdown = Array.from(
      { length: 9 },
      (_unused, level) => `${"  ".repeat(level)}- level ${String(level + 1)}`,
    ).join("\n");
    const result = await convert(markdown);
    const archive = await readDocxArchive(Buffer.from(result.body));
    expect(levelsOf(entryOf(archive, "word/document.xml"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("clips a tenth level and warns", async () => {
    const markdown = Array.from(
      { length: 10 },
      (_unused, level) => `${"  ".repeat(level)}- level ${String(level + 1)}`,
    ).join("\n");
    const result = await convert(markdown);
    const archive = await readDocxArchive(Buffer.from(result.body));
    expect(levelsOf(entryOf(archive, "word/document.xml")).at(-1)).toBe("8");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["BLOCK_NOT_RENDERED"]);
    expect(result.warnings[0]?.detail).toMatchObject({ requestedLevel: 9, renderedLevel: 8 });
  });

  it("clamps a level to the last one the format supports", () => {
    expect(clampListLevel(0)).toBe(0);
    expect(clampListLevel(8)).toBe(8);
    expect(clampListLevel(9)).toBe(8);
    expect(clampListLevel(40)).toBe(8);
  });
});

describe("multi block items", () => {
  it("numbers the first paragraph only and indents the rest", async () => {
    const xml = await documentXmlOf("- first\n\n  second\n\n  third\n");
    expect(numberingIdsOf(xml)).toHaveLength(1);
    expect(paragraphStylesOf(xml)).toEqual([
      "Md2ListParagraph",
      "Md2ListParagraph",
      "Md2ListParagraph",
    ]);
    expect(xml).toContain("<w:ind w:left=");
  });

  it("numbers each item of a list of single paragraph items", async () => {
    const xml = await documentXmlOf("- one\n- two\n- three\n");
    expect(numberingIdsOf(xml)).toHaveLength(3);
  });
});

describe("loose and tight lists", () => {
  it("suppresses spacing between the items of a tight list", async () => {
    const xml = await documentXmlOf("- a\n- b\n");
    expect(xml.match(/<w:contextualSpacing\/>/g) ?? []).toHaveLength(2);
  });

  it("keeps spacing between the items of a loose list", async () => {
    const xml = await documentXmlOf("- a\n\n- b\n");
    expect(xml).toContain('<w:contextualSpacing w:val="false"/>');
  });
});

describe("task lists", () => {
  it("uses no numbering and prefixes the glyph", async () => {
    const xml = await documentXmlOf("- [x] done\n- [ ] open\n");
    expect(numberingIdsOf(xml)).toHaveLength(0);
    expect(paragraphStylesOf(xml)).toEqual(["Md2TaskItem", "Md2TaskItem"]);
    expect(xml).toContain("[x]");
    expect(xml).toContain("[ ]");
  });

  it("separates the glyph from the text with a non breaking space", async () => {
    const xml = await documentXmlOf("- [x] done\n");
    expect(xml).toContain(`[x]${String.fromCharCode(0xa0)}`);
  });

  it("indents a nested task without numbering", async () => {
    const xml = await documentXmlOf("- [ ] parent\n  - [x] child\n");
    expect(numberingIdsOf(xml)).toHaveLength(0);
    expect(xml).toContain("<w:ind w:left=");
  });

  it("mixes an ordinary item and a task in one list", async () => {
    const xml = await documentXmlOf("- ordinary\n- [ ] task\n");
    expect(paragraphStylesOf(xml)).toEqual(["Md2ListParagraph", "Md2TaskItem"]);
    expect(numberingIdsOf(xml)).toHaveLength(1);
  });
});

describe("list content", () => {
  it("keeps inline marks inside an item", async () => {
    const xml = await documentXmlOf("- an **important** item\n");
    expect(xml).toContain("<w:b/>");
  });

  it("keeps a link inside an item", async () => {
    const xml = await documentXmlOf("- see [the site](https://example.com)\n");
    expect(xml).toContain("w:hyperlink");
  });

  it("renders an empty item as a numbered empty paragraph", async () => {
    const xml = await documentXmlOf("- \n- second\n");
    expect(numberingIdsOf(xml).length).toBeGreaterThanOrEqual(1);
  });
});
