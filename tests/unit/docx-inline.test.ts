import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { rootContext, sampleDocument } from "../helpers/format-fixtures.ts";
import type { InlineMarks, IrBlock, IrInline } from "../../src/types/ir.ts";

const MARK_NAMES = ["bold", "italic", "strike", "subscript", "superscript"] as const;

const allCombinations = (): readonly InlineMarks[] => {
  const combinations: InlineMarks[] = [];
  for (let mask = 0; mask < 2 ** MARK_NAMES.length; mask += 1) {
    combinations.push({
      bold: (mask & 1) !== 0,
      italic: (mask & 2) !== 0,
      strike: (mask & 4) !== 0,
      subscript: (mask & 8) !== 0,
      superscript: (mask & 16) !== 0,
      code: false,
    });
  }
  return combinations;
};

const paragraphOf = (children: readonly IrInline[]): IrBlock => ({
  kind: "paragraph",
  context: rootContext,
  align: null,
  children,
});

const renderToXml = async (blocks: readonly IrBlock[]): Promise<string> => {
  const result = await docxBackend.convert({
    document: sampleDocument({ blocks }),
    theme: defaultTheme,
    strict: false,
  });
  const archive = await readDocxArchive(Buffer.from(result.body));
  return entryOf(archive, "word/document.xml");
};

const runsOf = (documentXml: string): readonly string[] =>
  [...documentXml.matchAll(/<w:r>(.*?)<\/w:r>/g)].map((match) => match[1] ?? "");

describe("every combination of inline marks", () => {
  const combinations = allCombinations();

  it("produces one run per combination", async () => {
    const blocks = combinations.map((marks, index) =>
      paragraphOf([{ kind: "text", value: `run${String(index)}`, marks }]),
    );
    const runs = runsOf(await renderToXml(blocks));
    expect(runs).toHaveLength(combinations.length);
  });

  it("sets each mark independently", async () => {
    const blocks = combinations.map((marks, index) =>
      paragraphOf([{ kind: "text", value: `run${String(index)}`, marks }]),
    );
    const runs = runsOf(await renderToXml(blocks));

    combinations.forEach((marks, index) => {
      const run = runs[index] ?? "";
      expect(run.includes("<w:b/>"), `bold at ${String(index)}`).toBe(marks.bold);
      expect(run.includes("<w:i/>"), `italic at ${String(index)}`).toBe(marks.italic);
      expect(run.includes("<w:strike/>"), `strike at ${String(index)}`).toBe(marks.strike);
      expect(
        run.includes('<w:vertAlign w:val="subscript"/>'),
        `subscript at ${String(index)}`,
      ).toBe(marks.subscript);
      expect(
        run.includes('<w:vertAlign w:val="superscript"/>'),
        `superscript at ${String(index)}`,
      ).toBe(marks.superscript);
    });
  });
});

describe("inline kinds", () => {
  const noMarks: InlineMarks = {
    bold: false,
    italic: false,
    strike: false,
    subscript: false,
    superscript: false,
    code: false,
  };

  it("applies the code character style to inline code", async () => {
    const xml = await renderToXml([
      paragraphOf([{ kind: "inlineCode", value: "value", marks: { ...noMarks, code: true } }]),
    ]);
    expect(xml).toContain('w:val="Md2CodeChar"');
  });

  it("renders a hard line break", async () => {
    const xml = await renderToXml([
      paragraphOf([
        { kind: "text", value: "one", marks: noMarks },
        { kind: "lineBreak", hard: true },
        { kind: "text", value: "two", marks: noMarks },
      ]),
    ]);
    expect(xml).toContain("<w:br/>");
  });

  it("keeps leading and trailing spaces of a run", async () => {
    const xml = await renderToXml([
      paragraphOf([{ kind: "text", value: "  padded  ", marks: noMarks }]),
    ]);
    expect(xml).toContain('xml:space="preserve">  padded  <');
  });

  it("warns instead of failing on an inline kind it cannot render yet", async () => {
    const result = await docxBackend.convert({
      document: sampleDocument({
        blocks: [paragraphOf([{ kind: "footnoteReference", id: 1 }])],
      }),
      theme: defaultTheme,
      strict: false,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(["INLINE_NOT_RENDERED"]);
  });
});

describe("inline kinds the backend cannot render yet", () => {
  const noMarks: InlineMarks = {
    bold: false,
    italic: false,
    strike: false,
    subscript: false,
    superscript: false,
    code: false,
  };

  const warningsFor = async (inline: IrInline): Promise<readonly string[]> => {
    const result = await docxBackend.convert({
      document: sampleDocument({ blocks: [paragraphOf([inline])] }),
      theme: defaultTheme,
      strict: false,
    });
    return result.warnings.map((warning) => warning.code);
  };

  it("warns on inline mathematics", async () => {
    expect(await warningsFor({ kind: "mathInline", source: "x^2", mathml: null })).toEqual([
      "INLINE_NOT_RENDERED",
    ]);
  });

  it("renders the children of a link that carries marks", async () => {
    const xml = await renderToXml([
      paragraphOf([
        {
          kind: "link",
          url: "https://example.com",
          internal: false,
          title: "A title",
          children: [{ kind: "text", value: "bold link", marks: { ...noMarks, bold: true } }],
        },
      ]),
    ]);
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("w:hyperlink");
  });
});

describe("blocks the backend cannot render yet", () => {
  const blockKinds: readonly IrBlock[] = [
    { kind: "pageBreak", context: rootContext },
    { kind: "tableOfContents", context: rootContext },
    { kind: "mathBlock", context: rootContext, source: "x^2", mathml: null },
    { kind: "callout", context: rootContext, variant: "info", title: null, blocks: [] },
    {
      kind: "sectionStart",
      context: rootContext,
      section: { orientation: "landscape", columnCount: null },
    },
  ];

  it("warns once per block and renders nothing for it", async () => {
    const result = await docxBackend.convert({
      document: sampleDocument({ blocks: blockKinds }),
      theme: defaultTheme,
      strict: false,
    });
    expect(result.warnings).toHaveLength(blockKinds.length);
    expect(new Set(result.warnings.map((warning) => warning.code))).toEqual(
      new Set(["BLOCK_NOT_RENDERED"]),
    );
  });

  it("names the block kind in the warning detail", async () => {
    const result = await docxBackend.convert({
      document: sampleDocument({
        blocks: [blockKinds[0] ?? { kind: "pageBreak", context: rootContext }],
      }),
      theme: defaultTheme,
      strict: false,
    });
    expect(result.warnings[0]?.detail).toMatchObject({ kind: "pageBreak" });
  });
});
