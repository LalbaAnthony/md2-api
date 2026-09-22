import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { lineNumberWidth } from "../../src/formats/docx/render/code.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { dxa } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import type { Theme } from "../../src/types/theme.ts";

const TAB = String.fromCharCode(9);

const documentXmlOf = async (markdown: string, theme: Theme = defaultTheme): Promise<string> => {
  const normalized = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: dxa(9026),
    tabWidth: theme.code.tabWidth,
    minimumColumnWidth: theme.table.minColumnWidth,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  const result = await docxBackend.convert({
    document: normalized.document,
    theme,
    strict: false,
  });
  const archive = await readDocxArchive(Buffer.from(result.body));
  return entryOf(archive, "word/document.xml");
};

const withCode = (theme: Theme, changes: Partial<Theme["code"]>): Theme => ({
  ...theme,
  code: { ...theme.code, ...changes },
});

describe("the wrapping structure", () => {
  it("wraps the block in a single cell table", async () => {
    const xml = await documentXmlOf("```\nplain\n```\n");
    expect(xml.match(/<w:tbl>/g) ?? []).toHaveLength(1);
    expect(xml.match(/<w:tr>/g) ?? []).toHaveLength(1);
    expect(xml.match(/<w:tc>/g) ?? []).toHaveLength(1);
  });

  it("carries the background on the cell, not on the paragraphs", async () => {
    const xml = await documentXmlOf("```\nplain\nmore\n```\n");
    const cellShading = xml.match(/<w:shd[^>]*w:fill="F5F5F5"[^>]*\/>/g) ?? [];
    expect(cellShading).toHaveLength(1);
  });

  it("fixes the table layout and the column width", async () => {
    const xml = await documentXmlOf("```\nplain\n```\n");
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('w:w="9026"');
  });

  it("uses no visible border when the theme declares none", async () => {
    const xml = await documentXmlOf("```\nplain\n```\n", {
      ...defaultTheme,
      color: { ...defaultTheme.color, codeBorder: null },
    });
    expect(xml).not.toContain('<w:top w:val="single"');
  });

  it("draws a border when the theme declares one", async () => {
    const xml = await documentXmlOf("```\nplain\n```\n");
    expect(xml).toContain('w:color="E0E0E0"');
  });
});

describe("page breaks inside a long block", () => {
  const longBlock = [
    "```ts",
    ...Array.from({ length: 200 }, (_u, i) => `const v${String(i)} = ${String(i)};`),
    "```",
    "",
  ].join("\n");

  it("keeps one paragraph per line so the block can break across pages", async () => {
    const xml = await documentXmlOf(longBlock);
    const paragraphs = xml.match(/<w:pStyle w:val="Md2CodeLine"\/>/g) ?? [];
    expect(paragraphs).toHaveLength(200);
  });

  it("never forbids the row from splitting", async () => {
    const xml = await documentXmlOf(longBlock);
    expect(xml).not.toContain("<w:cantSplit/>");
    expect(xml).not.toContain('<w:cantSplit w:val="true"/>');
  });

  it("keeps a single continuous background for the whole block", async () => {
    const xml = await documentXmlOf(longBlock);
    expect(xml.match(/<w:shd[^>]*w:fill="F5F5F5"[^>]*\/>/g) ?? []).toHaveLength(1);
    expect(xml.match(/<w:tbl>/g) ?? []).toHaveLength(1);
  });
});

describe("syntax colours", () => {
  it("applies the colour of the theme for each scope", async () => {
    const xml = await documentXmlOf('```ts\nconst a = "x"; // note\n```\n');
    expect(xml).toContain(defaultTheme.syntax.keyword.foreground);
    expect(xml).toContain(defaultTheme.syntax.string.foreground);
    expect(xml).toContain(defaultTheme.syntax.comment.foreground);
  });

  it("follows a change of theme colour", async () => {
    const themed: Theme = {
      ...defaultTheme,
      syntax: {
        ...defaultTheme.syntax,
        keyword: { foreground: "AA0011", bold: true, italic: false },
      },
    };
    const xml = await documentXmlOf("```ts\nconst a = 1;\n```\n", themed);
    expect(xml).toContain("AA0011");
  });

  it("renders an unknown language as plain text in the plain colour", async () => {
    const xml = await documentXmlOf("```notalanguage\nsome text\n```\n");
    expect(xml).toContain(defaultTheme.syntax.plain.foreground);
  });

  it("uses the monospace font of the theme", async () => {
    const xml = await documentXmlOf("```ts\nconst a = 1;\n```\n");
    expect(xml).toContain(defaultTheme.type.mono.name);
  });
});

describe("line numbers", () => {
  it("shows none by default", async () => {
    const xml = await documentXmlOf("```ts\nconst a = 1;\n```\n");
    expect(xml).not.toContain("Md2LineNumber");
  });

  it("prefixes each line when the theme asks for them", async () => {
    const xml = await documentXmlOf(
      "```ts\nconst a = 1;\nconst b = 2;\n```\n",
      withCode(defaultTheme, { showLineNumbers: true }),
    );
    expect(xml.match(/w:val="Md2LineNumber"/g) ?? []).toHaveLength(2);
  });

  it("pads the numbers to a fixed width", () => {
    expect(lineNumberWidth(1)).toBe(2);
    expect(lineNumberWidth(9)).toBe(2);
    expect(lineNumberWidth(99)).toBe(2);
    expect(lineNumberWidth(100)).toBe(3);
    expect(lineNumberWidth(1000)).toBe(4);
  });

  it("separates the number from the code with a non breaking space", async () => {
    const xml = await documentXmlOf(
      "```ts\nconst a = 1;\n```\n",
      withCode(defaultTheme, { showLineNumbers: true }),
    );
    expect(xml).toContain(String.fromCharCode(0xa0));
  });
});

describe("the language label", () => {
  it("is absent by default", async () => {
    const xml = await documentXmlOf("```ts\nconst a = 1;\n```\n");
    expect(xml).not.toContain("Md2LanguageLabel");
  });

  it("heads the cell when the theme asks for it", async () => {
    const xml = await documentXmlOf(
      "```typescript\nconst a = 1;\n```\n",
      withCode(defaultTheme, { showLanguageLabel: true }),
    );
    expect(xml).toContain("Md2LanguageLabel");
    expect(xml).toContain("typescript");
    expect(xml.indexOf("Md2CodeCaption")).toBeLessThan(xml.indexOf("Md2CodeLine"));
  });

  it("is absent for a block without a language", async () => {
    const xml = await documentXmlOf(
      "```\nplain\n```\n",
      withCode(defaultTheme, { showLanguageLabel: true }),
    );
    expect(xml).not.toContain("Md2LanguageLabel");
  });
});

describe("whitespace", () => {
  it("preserves leading indentation", async () => {
    const xml = await documentXmlOf("```\n    four spaces\n```\n");
    expect(xml).toContain('xml:space="preserve">    four spaces<');
  });

  it("writes expanded tabs, never a tab character", async () => {
    const xml = await documentXmlOf(`\`\`\`\n${TAB}indented\n\`\`\`\n`);
    expect(xml).toContain('xml:space="preserve">    indented<');
    expect(xml).not.toContain(TAB);
  });

  it("renders an empty block without failing", async () => {
    const xml = await documentXmlOf("```\n```\n");
    expect(xml).toContain("Md2CodeLine");
  });
});

describe("code in a list", () => {
  it("renders the block inside the item", async () => {
    const xml = await documentXmlOf('1. step\n\n   ```json\n   { "a": 1 }\n   ```\n');
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Md2ListParagraph");
  });
});
