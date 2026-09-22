import { describe, expect, it } from "vitest";
import { latexToMathml } from "../../src/pipeline/normalize/math.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import { createWarningSink } from "../../src/pipeline/normalize/warnings.ts";
import { flattenDocument } from "../../src/pipeline/normalize/flatten.ts";
import type { Root } from "mdast";
import type { DocumentIr, IrBlock, IrInline } from "../../src/types/ir.ts";
import type { NormalizeResult } from "../../src/types/pipeline.ts";

const BACKSLASH = String.fromCharCode(92);

const normalize = async (markdown: string, strict = false): Promise<NormalizeResult> =>
  normalizeDocument(parseMarkdown(markdown), {
    strict,
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

const inlinesOf = (document: DocumentIr): readonly IrInline[] =>
  document.blocks.flatMap((block) => (block.kind === "paragraph" ? block.children : []));

const referenceIds = (document: DocumentIr): readonly number[] =>
  inlinesOf(document)
    .filter((inline) => inline.kind === "footnoteReference")
    .map((inline) => inline.id);

const kindsOf = (blocks: readonly IrBlock[]): readonly string[] =>
  blocks.map((block) => block.kind);

const orphanReferenceTree = (): Root => ({
  type: "root",
  children: [
    {
      type: "paragraph",
      children: [{ type: "footnoteReference", identifier: "ghost", label: "ghost" }],
    },
  ],
});

describe("footnote numbering", () => {
  it("numbers in order of first reference, not of definition", async () => {
    const markdown = [
      "First[^b] then[^a].",
      "",
      "[^a]: Definition of a.",
      "[^b]: Definition of b.",
      "",
    ].join("\n");
    const result = await normalize(markdown);
    expect(referenceIds(result.document)).toEqual([1, 2]);
    expect([...result.document.footnotes.keys()]).toEqual([1, 2]);
  });

  it("reuses the same number for a repeated reference", async () => {
    const markdown = ["One[^a] two[^b] three[^a].", "", "[^a]: A.", "[^b]: B.", ""].join("\n");
    const result = await normalize(markdown);
    expect(referenceIds(result.document)).toEqual([1, 2, 1]);
    expect(result.document.footnotes.size).toBe(2);
  });

  it("removes the definitions from the flow", async () => {
    const result = await normalize("Body[^a].\n\n[^a]: A note.\n");
    expect(kindsOf(result.document.blocks)).toEqual(["paragraph"]);
  });

  it("matches a definition whatever its case", async () => {
    const result = await normalize("Body[^Ref].\n\n[^ref]: A note.\n");
    expect(referenceIds(result.document)).toEqual([1]);
  });
});

describe("footnote content", () => {
  it("keeps several blocks in one note", async () => {
    const markdown = [
      "Body[^a].",
      "",
      "[^a]: First paragraph.",
      "",
      "    Second paragraph.",
      "",
      "    - An item",
      "",
    ].join("\n");
    const result = await normalize(markdown);
    const note = result.document.footnotes.get(1) ?? [];
    expect(kindsOf(note)).toEqual(["paragraph", "paragraph", "listItem"]);
  });

  it("marks the blocks of a note as being inside a footnote", async () => {
    const result = await normalize("Body[^a].\n\n[^a]: A note.\n");
    const note = result.document.footnotes.get(1) ?? [];
    expect(note[0]?.context.insideFootnote).toBe(true);
  });

  it("keeps the inline formatting of a note", async () => {
    const result = await normalize("Body[^a].\n\n[^a]: A **bold** note.\n");
    const note = result.document.footnotes.get(1) ?? [];
    const first = note[0];
    if (first?.kind === "paragraph") {
      expect(first.children.some((child) => child.kind === "text" && child.marks.bold)).toBe(true);
    }
  });
});

describe("footnotes that do not resolve", () => {
  it("warns about a definition that is never referenced", async () => {
    const result = await normalize("Body.\n\n[^unused]: Never referenced.\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["FOOTNOTE_UNUSED"]);
    expect(result.document.footnotes.size).toBe(0);
  });

  it("keeps an unmatched reference as literal text, as GFM requires", async () => {
    const result = await normalize("Body[^missing].\n");
    expect(result.warnings).toEqual([]);
    const text = inlinesOf(result.document)
      .filter((inline) => inline.kind === "text")
      .map((inline) => inline.value)
      .join("");
    expect(text).toContain("[^missing]");
  });

  it("warns when a reference reaches the flattener without a definition", () => {
    const sink = createWarningSink();
    const output = flattenDocument({
      tree: orphanReferenceTree(),
      anchors: { bySlug: new Map(), byHeading: new Map() },
      sink,
      strict: false,
      maxNestingDepth: 100,
      codeTokens: new Map(),
      images: new Map(),
      math: new Map(),
      footnotes: { numberByIdentifier: new Map(), ordered: [] },
      contentWidth: dxa(9026),
      minimumColumnWidth: dxa(680),
    });
    expect(sink.list().map((entry) => entry.code)).toEqual(["FOOTNOTE_MISSING"]);
    const paragraph = output.blocks[0];
    if (paragraph?.kind === "paragraph") {
      expect(paragraph.children[0]).toMatchObject({ kind: "text", value: "[^ghost]" });
    }
  });

  it("refuses such a reference in strict mode", () => {
    expect(() =>
      flattenDocument({
        tree: orphanReferenceTree(),
        anchors: { bySlug: new Map(), byHeading: new Map() },
        sink: createWarningSink(),
        strict: true,
        maxNestingDepth: 100,
        codeTokens: new Map(),
        images: new Map(),
        math: new Map(),
        footnotes: { numberByIdentifier: new Map(), ordered: [] },
        contentWidth: dxa(9026),
        minimumColumnWidth: dxa(680),
      }),
    ).toThrow();
  });
});

describe("converting LaTeX to MathML", () => {
  it("converts an inline formula", () => {
    const mathml = latexToMathml("E = mc^2", false);
    expect(mathml).not.toBeNull();
    expect(mathml ?? "").toContain("<math");
    expect(mathml ?? "").toContain("</math>");
  });

  it("marks a display formula as such", () => {
    expect(latexToMathml("x^2", true) ?? "").toContain('display="block"');
  });

  it("does not mark an inline formula as display", () => {
    expect(latexToMathml("x^2", false) ?? "").not.toContain('display="block"');
  });

  it("converts common constructions", () => {
    for (const source of [
      `${BACKSLASH}frac{a}{b}`,
      `${BACKSLASH}sqrt{2}`,
      `${BACKSLASH}sum_{i=1}^{n} i`,
      `${BACKSLASH}int_0^1 x dx`,
      `${BACKSLASH}alpha + ${BACKSLASH}beta`,
    ]) {
      expect(latexToMathml(source, false), source).not.toBeNull();
    }
  });

  it("returns null for a formula it cannot parse", () => {
    expect(latexToMathml(`${BACKSLASH}frac{`, false)).toBeNull();
    expect(latexToMathml(`${BACKSLASH}nosuchcommand`, false)).toBeNull();
  });
});

describe("mathematics in a document", () => {
  it("carries the source and the MathML of an inline formula", async () => {
    const result = await normalize("Text $E = mc^2$ text.\n");
    const math = inlinesOf(result.document).find((inline) => inline.kind === "mathInline");
    expect(math?.source).toBe("E = mc^2");
    expect(math?.mathml).not.toBeNull();
  });

  it("carries the source and the MathML of a display formula", async () => {
    const result = await normalize("$$\nx^2 + y^2\n$$\n");
    const block = result.document.blocks[0];
    expect(block?.kind).toBe("mathBlock");
    if (block?.kind === "mathBlock") {
      expect(block.source).toBe("x^2 + y^2");
      expect(block.mathml).not.toBeNull();
    }
  });

  it("keeps the source and warns when the conversion fails", async () => {
    const result = await normalize(`Text $${BACKSLASH}frac{$ text.\n`);
    expect(result.warnings.map((entry) => entry.code)).toEqual(["MATH_NOT_CONVERTED"]);
    const math = inlinesOf(result.document).find((inline) => inline.kind === "mathInline");
    expect(math?.mathml).toBeNull();
    expect(math?.source).toBe(`${BACKSLASH}frac{`);
  });

  it("carries MathML and never OMML in the intermediate representation", async () => {
    const result = await normalize("$$\nx^2\n$$\n");
    const serialised = JSON.stringify(result.document.blocks);
    expect(serialised).toContain("Math/MathML");
    expect(serialised).not.toContain("m:oMath");
  });
});
