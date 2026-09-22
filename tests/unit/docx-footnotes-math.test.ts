import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { dxa } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { DocxArchive } from "../helpers/docx-archive.ts";
import type { ConversionWarning } from "../../src/types/format.ts";

const convert = async (
  markdown: string,
): Promise<{ archive: DocxArchive; warnings: readonly ConversionWarning[] }> => {
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
  const result = await docxBackend.convert({
    document: normalized.document,
    theme: defaultTheme,
    strict: false,
  });
  return { archive: await readDocxArchive(Buffer.from(result.body)), warnings: result.warnings };
};

describe("footnotes in the document", () => {
  it("writes a footnotes part", async () => {
    const { archive } = await convert("Body[^a].\n\n[^a]: A note.\n");
    expect([...archive.entries.keys()]).toContain("word/footnotes.xml");
  });

  it("carries the text of the note in that part", async () => {
    const { archive } = await convert("Body[^a].\n\n[^a]: The note text.\n");
    expect(entryOf(archive, "word/footnotes.xml")).toContain("The note text.");
  });

  it("references the note from the body", async () => {
    const { archive } = await convert("Body[^a].\n\n[^a]: A note.\n");
    expect(entryOf(archive, "word/document.xml")).toContain("w:footnoteReference");
  });

  it("numbers the notes in order of first reference", async () => {
    const markdown = ["First[^b] then[^a].", "", "[^a]: Note A.", "[^b]: Note B.", ""].join("\n");
    const { archive } = await convert(markdown);
    const document = entryOf(archive, "word/document.xml");
    const ids = [...document.matchAll(/<w:footnoteReference w:id="(\d+)"\/>/g)].map(
      (match) => match[1],
    );
    expect(ids).toEqual(["1", "2"]);
    const footnotes = entryOf(archive, "word/footnotes.xml");
    expect(footnotes.indexOf("Note B.")).toBeLessThan(footnotes.indexOf("Note A."));
  });

  it("keeps every block of a multi block note", async () => {
    const markdown = [
      "Body[^a].",
      "",
      "[^a]: First paragraph.",
      "",
      "    Second paragraph.",
      "",
    ].join("\n");
    const { archive } = await convert(markdown);
    const footnotes = entryOf(archive, "word/footnotes.xml");
    expect(footnotes).toContain("First paragraph.");
    expect(footnotes).toContain("Second paragraph.");
  });

  it("writes no content footnote for a document without notes", async () => {
    const { archive } = await convert("Just a paragraph.");
    const footnotes = archive.entries.get("word/footnotes.xml") ?? "";
    expect(footnotes).not.toMatch(/<w:footnote w:id="[1-9]/);
    expect(entryOf(archive, "word/document.xml")).not.toContain("w:footnoteReference");
  });
});

describe("mathematics in the document", () => {
  it("renders an inline formula as its source and warns", async () => {
    const { archive, warnings } = await convert("Text $E = mc^2$ text.\n");
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("E = mc^2");
    expect(xml).toContain("Md2MathInline");
    expect(warnings.map((warning) => warning.code)).toContain("MATH_RENDERED_AS_SOURCE");
  });

  it("renders a display formula as a centred paragraph", async () => {
    const { archive } = await convert("$$\nx^2 + y^2\n$$\n");
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("x^2 + y^2");
    expect(xml).toContain('<w:jc w:val="center"/>');
  });

  it("never writes OMML, because the capability declares source", async () => {
    const { archive } = await convert("Text $E = mc^2$ text.\n");
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).not.toContain("m:oMath");
    expect(docxBackend.descriptor.capabilities.math).toBe("source");
  });

  it("declares the fallback in the caveats of the format", () => {
    expect(docxBackend.descriptor.caveats.join(" ")).toContain("Mathematics");
  });
});
