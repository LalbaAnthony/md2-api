import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { dxa } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { rootContext, sampleDocument } from "../helpers/format-fixtures.ts";
import type { IrBlock, IrTableRow } from "../../src/types/ir.ts";
import type { Theme } from "../../src/types/theme.ts";

const CONTENT_WIDTH = dxa(9026);

const SIMPLE_TABLE = [
  "| Name | Quantity |",
  "| :--- | -------: |",
  "| Bolt | 12 |",
  "| Nut | 144 |",
  "",
].join("\n");

const documentXmlOf = async (markdown: string, theme: Theme = defaultTheme): Promise<string> => {
  const normalized = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: CONTENT_WIDTH,
    tabWidth: theme.code.tabWidth,
    minimumColumnWidth: theme.table.minColumnWidth,
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

const withTable = (theme: Theme, changes: Partial<Theme["table"]>): Theme => ({
  ...theme,
  table: { ...theme.table, ...changes },
});

const row = (values: readonly string[]): IrTableRow => ({
  cells: values.map((value) => ({
    blocks: [
      {
        kind: "paragraph",
        context: rootContext,
        align: null,
        children: [
          {
            kind: "text",
            value,
            marks: {
              bold: false,
              italic: false,
              strike: false,
              subscript: false,
              superscript: false,
              code: false,
            },
          },
        ],
      },
    ],
    align: null,
  })),
});

const captionedTable = (caption: string): IrBlock => ({
  kind: "table",
  context: rootContext,
  header: row(["A", "B"]),
  rows: [row(["1", "2"])],
  columnWidths: [dxa(4513), dxa(4513)],
  columnAlign: [null, null],
  caption,
  sequence: 1,
});

const xmlOfBlocks = async (blocks: readonly IrBlock[], theme: Theme = defaultTheme) => {
  const result = await docxBackend.convert({
    document: sampleDocument({ blocks }),
    theme,
    strict: false,
  });
  const archive = await readDocxArchive(Buffer.from(result.body));
  return entryOf(archive, "word/document.xml");
};

describe("table structure", () => {
  it("fixes the layout rather than letting Word autofit", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
  });

  it("declares an explicit grid whose columns sum to the usable width", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    const columns = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) =>
      Number(match[1] ?? "0"),
    );
    expect(columns).toHaveLength(2);
    expect(columns.reduce((sum, width) => sum + width, 0)).toBe(CONTENT_WIDTH);
  });

  it("renders one row per markdown row", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml.match(/<w:tr>/g) ?? []).toHaveLength(3);
  });

  it("puts a paragraph in every cell", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    const cells = xml.match(/<w:tc>/g) ?? [];
    const cellParagraphs = xml.match(/w:val="Md2Table(?:Cell|Header)Text"/g) ?? [];
    expect(cellParagraphs).toHaveLength(cells.length);
  });
});

describe("the header row", () => {
  it("is marked so Word repeats it across pages", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml.match(/<w:tblHeader\/>/g) ?? []).toHaveLength(1);
  });

  it("uses the header style and the header background", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).toContain("Md2TableHeaderText");
    expect(xml).toContain(defaultTheme.color.tableHeaderBackground);
  });
});

describe("column alignment", () => {
  it("applies the delimiter row alignment to every cell of the column", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).toContain('<w:jc w:val="right"/>');
    expect(xml).toContain('<w:jc w:val="left"/>');
  });

  it("centres a centred column", async () => {
    const xml = await documentXmlOf("| A |\n| :-: |\n| 1 |\n");
    expect(xml).toContain('<w:jc w:val="center"/>');
  });
});

describe("stripes", () => {
  it("draws none when the theme has no stripe colour", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).not.toContain(
      'w:fill="EFEFEF" w:val="clear"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Md2TableCellText"',
    );
  });

  it("shades every other body row when the theme asks for stripes", async () => {
    const striped: Theme = {
      ...withTable(defaultTheme, { stripes: true }),
      color: { ...defaultTheme.color, tableStripe: "F7F7F7" },
    };
    const xml = await documentXmlOf("| A |\n| - |\n| 1 |\n| 2 |\n| 3 |\n| 4 |\n", striped);
    expect(xml.match(/w:fill="F7F7F7"/g) ?? []).toHaveLength(2);
  });
});

describe("borders", () => {
  it("draws every border by default", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).toContain("<w:insideV");
    expect(xml).toContain(defaultTheme.color.tableBorder);
  });

  it("draws horizontal rules only when the theme asks for it", async () => {
    const xml = await documentXmlOf(
      SIMPLE_TABLE,
      withTable(defaultTheme, { horizontalRulesOnly: true }),
    );
    expect(xml).toMatch(/<w:insideV w:val="none"/);
  });
});

describe("cell content", () => {
  it("keeps the inline formatting of a cell", async () => {
    const xml = await documentXmlOf("| A |\n| - |\n| **bold** and `code` |\n");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("Md2CodeChar");
  });

  it("keeps a link inside a cell", async () => {
    const xml = await documentXmlOf("| A |\n| - |\n| [site](https://example.com) |\n");
    expect(xml).toContain("w:hyperlink");
  });

  it("renders an empty cell as an empty paragraph", async () => {
    const xml = await documentXmlOf("| A | B |\n| - | - |\n| 1 | |\n");
    expect(xml.match(/<w:tc>/g) ?? []).toHaveLength(4);
  });
});

describe("captions", () => {
  it("renders none when the table carries none", async () => {
    const xml = await documentXmlOf(SIMPLE_TABLE);
    expect(xml).not.toContain("Md2TableCaption");
  });

  it("renders a sequence field so Word renumbers it", async () => {
    const xml = await xmlOfBlocks([captionedTable("Stock on hand")]);
    expect(xml).toContain("Md2TableCaption");
    expect(xml).toContain("SEQ Table");
    expect(xml).toContain("Stock on hand");
    expect(xml).toContain(defaultTheme.caption.tablePrefix);
  });

  it("places the caption below by default", async () => {
    const xml = await xmlOfBlocks([captionedTable("Below")]);
    expect(xml.indexOf("<w:tbl>")).toBeLessThan(xml.indexOf("Md2TableCaption"));
  });

  it("places the caption above when the theme asks for it", async () => {
    const above: Theme = {
      ...defaultTheme,
      caption: { ...defaultTheme.caption, position: "above" },
    };
    const xml = await xmlOfBlocks([captionedTable("Above")], above);
    expect(xml.indexOf("Md2TableCaption")).toBeLessThan(xml.indexOf("<w:tbl>"));
  });
});

describe("a wide table", () => {
  it("keeps eight columns above the minimum width", async () => {
    const header = `| ${["a", "b", "c", "d", "e", "f", "g", "h"].join(" | ")} |`;
    const delimiter = `| ${Array.from({ length: 8 }, () => "-").join(" | ")} |`;
    const body = `| ${["one", "two", "three", "four", "five", "six", "seven", "eight"].join(" | ")} |`;
    const xml = await documentXmlOf([header, delimiter, body, ""].join("\n"));
    const columns = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) =>
      Number(match[1] ?? "0"),
    );
    expect(columns).toHaveLength(8);
    expect(columns.reduce((sum, width) => sum + width, 0)).toBe(CONTENT_WIDTH);
    for (const width of columns) {
      expect(width).toBeGreaterThanOrEqual(defaultTheme.table.minColumnWidth);
    }
  });
});
