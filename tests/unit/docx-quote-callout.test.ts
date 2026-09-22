import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { sectionPropertiesFor } from "../../src/formats/docx/render/document.ts";
import { compileThemeForDocx } from "../../src/formats/docx/compile/index.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { tintForBackground } from "../../src/theme/tokens.ts";
import { dxa } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { Theme } from "../../src/types/theme.ts";

const compiled = compileThemeForDocx(defaultTheme);

const documentXmlOf = async (markdown: string, theme: Theme = defaultTheme): Promise<string> => {
  const normalized = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: dxa(9026),
    tabWidth: 4,
    minimumColumnWidth: dxa(680),
    maxWidthRatio: 1,
    imagePolicy: strictImagePolicy(),
    tableOfContentsEnabled: false,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  const result = await docxBackend.convert({ document: normalized.document, theme, strict: false });
  const archive = await readDocxArchive(Buffer.from(result.body));
  return entryOf(archive, "word/document.xml");
};

const indentsOf = (xml: string): readonly number[] =>
  [...xml.matchAll(/<w:ind w:left="(\d+)"/g)].map((match) => Number(match[1] ?? "0"));

describe("quotes", () => {
  it("uses the quote style", async () => {
    const xml = await documentXmlOf("> Quoted.\n");
    expect(xml).toContain('w:val="Md2Quote"');
  });

  it("multiplies the indent by the nesting depth", async () => {
    const xml = await documentXmlOf("> One.\n>\n> > Two.\n>\n> > > Three.\n");
    const step = defaultTheme.quote.indentLeft;
    expect(indentsOf(xml)).toEqual([step, step * 2, step * 3]);
  });

  it("keeps the inline formatting of a quoted paragraph", async () => {
    const xml = await documentXmlOf("> A **bold** quote.\n");
    expect(xml).toContain("<w:b/>");
  });

  it("renders a list inside a quote with its numbering", async () => {
    const xml = await documentXmlOf("> Intro.\n>\n> - a\n> - b\n");
    expect(xml).toContain("Md2ListParagraph");
    expect(xml).toContain("<w:numId");
  });
});

describe("callouts", () => {
  it("wraps the callout in a single cell table", async () => {
    const xml = await documentXmlOf(":::callout{type=info}\nBody.\n:::\n");
    expect(xml.match(/<w:tbl>/g) ?? []).toHaveLength(1);
    expect(xml.match(/<w:tc>/g) ?? []).toHaveLength(1);
  });

  it("draws a left bar in the colour of the variant", async () => {
    const xml = await documentXmlOf(":::callout{type=danger}\nBody.\n:::\n");
    expect(xml).toContain(defaultTheme.color.callout.danger);
    expect(xml).toMatch(/<w:left w:val="single" w:color="9C2C2C"/);
  });

  it("tints the background with the variant colour mixed on white", async () => {
    const xml = await documentXmlOf(":::callout{type=warning}\nBody.\n:::\n");
    expect(xml).toContain(tintForBackground(defaultTheme.color.callout.warning));
  });

  it("draws no tint when the theme disables it", async () => {
    const plain: Theme = {
      ...defaultTheme,
      callout: { ...defaultTheme.callout, tintedBackground: false },
    };
    const xml = await documentXmlOf(":::callout{type=warning}\nBody.\n:::\n", plain);
    expect(xml).not.toContain(tintForBackground(defaultTheme.color.callout.warning));
  });

  it("writes the textual label of the variant, never a pictogram", async () => {
    const xml = await documentXmlOf(":::callout{type=warning}\nBody.\n:::\n");
    expect(xml).toContain(defaultTheme.callout.labels.warning);
    expect(xml).toContain("Md2CalloutTitle");
  });

  it("appends the title to the label", async () => {
    const xml = await documentXmlOf(':::callout{type=info title="Mind the gap"}\nBody.\n:::\n');
    expect(xml).toContain("Mind the gap");
  });

  it("omits the label when the theme hides it", async () => {
    const hidden: Theme = {
      ...defaultTheme,
      callout: { ...defaultTheme.callout, showLabel: false },
    };
    const xml = await documentXmlOf(":::callout{type=info}\nBody.\n:::\n", hidden);
    expect(xml).not.toContain("Md2CalloutTitle");
  });

  it("renders nested blocks inside the cell", async () => {
    const xml = await documentXmlOf(":::callout{type=note}\nText.\n\n- a\n- b\n:::\n");
    expect(xml).toContain("Md2ListParagraph");
    expect(xml.match(/<w:tbl>/g) ?? []).toHaveLength(1);
  });

  it("gives every variant a distinct colour", () => {
    const colours = Object.values(compiled.callout.variants).map((variant) => variant.color);
    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe("page breaks", () => {
  it("renders an explicit break", async () => {
    const xml = await documentXmlOf("One.\n\n::pagebreak\n\nTwo.\n");
    expect(xml).toContain('<w:br w:type="page"/>');
  });
});

describe("the table of contents field", () => {
  it("inserts a field rather than a resolved list", async () => {
    const xml = await documentXmlOf("::toc\n\n# A heading\n");
    expect(xml).toContain("TOC");
    expect(xml).toContain("w:instrText");
  });
});

describe("sections", () => {
  it("swaps the page size for a landscape section", () => {
    const properties = sectionPropertiesFor(compiled.section, {
      orientation: "landscape",
      columnCount: null,
    });
    expect(Number(properties.page?.size?.width)).toBe(defaultTheme.page.size.height);
    expect(Number(properties.page?.size?.height)).toBe(defaultTheme.page.size.width);
  });

  it("restores the page size for a portrait section", () => {
    const properties = sectionPropertiesFor(compiled.section, {
      orientation: "portrait",
      columnCount: null,
    });
    expect(Number(properties.page?.size?.width)).toBe(defaultTheme.page.size.width);
  });

  it("adds a column count", () => {
    const properties = sectionPropertiesFor(compiled.section, {
      orientation: null,
      columnCount: 3,
    });
    expect(properties.column?.count).toBe(3);
  });

  it("returns to a single column when the override clears them", () => {
    const withColumns = sectionPropertiesFor(compiled.section, {
      orientation: null,
      columnCount: 3,
    });
    expect(withColumns.column?.count).toBe(3);
    const cleared = sectionPropertiesFor(withColumns, { orientation: null, columnCount: null });
    expect(cleared.column?.count).toBe(1);
  });

  it("splits the document into sections at each marker", async () => {
    const xml = await documentXmlOf("A.\n\n:::landscape\nB.\n:::\n\nC.\n");
    expect(xml.match(/<w:sectPr>/g) ?? []).toHaveLength(3);
    expect(xml).toContain('w:orient="landscape"');
  });

  it("carries the column count into the section properties", async () => {
    const xml = await documentXmlOf("A.\n\n:::columns{count=2}\nB.\n:::\n\nC.\n");
    expect(xml).toContain('w:num="2"');
  });

  it("keeps one section when the document has no marker", async () => {
    const xml = await documentXmlOf("Only one section.\n");
    expect(xml.match(/<w:sectPr>/g) ?? []).toHaveLength(1);
  });
});
