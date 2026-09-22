import { describe, expect, it } from "vitest";
import { isAppError } from "../../src/errors.ts";
import { parseWidthRatio } from "../../src/pipeline/normalize/directives.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { IrBlock } from "../../src/types/ir.ts";
import type { NormalizeResult } from "../../src/types/pipeline.ts";

const normalize = async (markdown: string, strict = false): Promise<NormalizeResult> =>
  normalizeDocument(parseMarkdown(markdown), {
    strict,
    maxNestingDepth: 100,
    contentWidth: dxa(9026),
    tabWidth: 4,
    minimumColumnWidth: dxa(680),
    maxWidthRatio: 1,
    imagePolicy: strictImagePolicy(),
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });

const kinds = (blocks: readonly IrBlock[]): readonly string[] => blocks.map((block) => block.kind);

const expectStrictFailure = async (markdown: string, code: string): Promise<void> => {
  try {
    await normalize(markdown, true);
    expect.unreachable("Expected the document to be refused in strict mode.");
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    if (isAppError(thrown)) {
      expect(thrown.code).toBe(code);
    }
  }
};

describe("width ratios", () => {
  it("reads a percentage", () => {
    expect(parseWidthRatio("50%")).toBeCloseTo(0.5, 5);
    expect(parseWidthRatio("100%")).toBe(1);
  });

  it("reads a decimal", () => {
    expect(parseWidthRatio("0.25")).toBeCloseTo(0.25, 5);
  });

  it("defaults to the full width", () => {
    expect(parseWidthRatio(undefined)).toBe(1);
  });

  it("never exceeds the full width", () => {
    expect(parseWidthRatio("400%")).toBe(1);
  });
});

describe("callouts", () => {
  it("produces a callout per variant", async () => {
    const markdown = ["info", "warning", "danger", "success", "note"]
      .map((variant) => `:::callout{type=${variant}}\nBody.\n:::`)
      .join("\n\n");
    const result = await normalize(markdown);
    const callouts = result.document.blocks.filter((block) => block.kind === "callout");
    expect(callouts.map((block) => block.variant)).toEqual([
      "info",
      "warning",
      "danger",
      "success",
      "note",
    ]);
  });

  it("defaults to the note variant", async () => {
    const result = await normalize(":::callout\nBody.\n:::\n");
    const callout = result.document.blocks[0];
    expect(callout?.kind).toBe("callout");
    if (callout?.kind === "callout") {
      expect(callout.variant).toBe("note");
      expect(callout.title).toBeNull();
    }
  });

  it("keeps the title", async () => {
    const result = await normalize(':::callout{type=info title="Mind the gap"}\nBody.\n:::\n');
    const callout = result.document.blocks[0];
    if (callout?.kind === "callout") {
      expect(callout.title).toBe("Mind the gap");
    }
  });

  it("nests its own blocks and marks the context", async () => {
    const result = await normalize(":::callout{type=info}\nOne.\n\n- a\n- b\n:::\n");
    const callout = result.document.blocks[0];
    if (callout?.kind === "callout") {
      expect(kinds(callout.blocks)).toEqual(["paragraph", "listItem", "listItem"]);
      expect(callout.blocks[0]?.context.insideCallout).toBe("info");
    }
  });
});

describe("quotes", () => {
  it("marks quoted paragraphs and indents them", async () => {
    const result = await normalize("> Quoted.\n");
    const paragraph = result.document.blocks[0];
    expect(paragraph?.context.insideQuote).toBe(true);
    expect(paragraph?.context.indentLevel).toBe(1);
  });

  it("increases the indent with the nesting depth", async () => {
    const result = await normalize("> One.\n>\n> > Two.\n>\n> > > Three.\n");
    expect(result.document.blocks.map((block) => block.context.indentLevel)).toEqual([1, 2, 3]);
  });

  it("keeps a list inside a quote", async () => {
    const result = await normalize("> Intro.\n>\n> - a\n> - b\n");
    expect(kinds(result.document.blocks)).toEqual(["paragraph", "listItem", "listItem"]);
    expect(result.document.blocks[1]?.context.insideQuote).toBe(true);
  });
});

describe("page breaks and the table of contents", () => {
  it("produces a page break block", async () => {
    const result = await normalize("One.\n\n::pagebreak\n\nTwo.\n");
    expect(kinds(result.document.blocks)).toEqual(["paragraph", "pageBreak", "paragraph"]);
  });

  it("produces a table of contents block", async () => {
    const result = await normalize("::toc\n\nBody.\n");
    expect(kinds(result.document.blocks)).toEqual(["tableOfContents", "paragraph"]);
  });
});

describe("sectioning directives", () => {
  it("brackets a landscape section and restores the default", async () => {
    const result = await normalize("A.\n\n:::landscape\nB.\n:::\n\nC.\n");
    const sections = result.document.blocks.filter((block) => block.kind === "sectionStart");
    expect(sections.map((block) => block.section)).toEqual([
      { orientation: "landscape", columnCount: null },
      { orientation: null, columnCount: null },
    ]);
  });

  it("brackets a column section with its count", async () => {
    const result = await normalize(":::columns{count=3}\nBody.\n:::\n");
    const sections = result.document.blocks.filter((block) => block.kind === "sectionStart");
    expect(sections[0]?.section).toEqual({ orientation: null, columnCount: 3 });
  });

  it("defaults to two columns", async () => {
    const result = await normalize(":::columns\nBody.\n:::\n");
    const sections = result.document.blocks.filter((block) => block.kind === "sectionStart");
    expect(sections[0]?.section.columnCount).toBe(2);
  });
});

describe("invalid directives outside strict mode", () => {
  it("degrades an unknown callout variant and keeps the content", async () => {
    const result = await normalize(":::callout{type=unknown}\nThe body.\n:::\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
    expect(kinds(result.document.blocks)).toEqual(["paragraph"]);
  });

  it("degrades an unknown container directive and keeps the content", async () => {
    const result = await normalize(":::mystery\nThe body.\n:::\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["UNSUPPORTED_NODE"]);
    expect(kinds(result.document.blocks)).toEqual(["paragraph"]);
  });

  it("degrades an unknown leaf directive", async () => {
    const result = await normalize("::mystery\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["UNSUPPORTED_NODE"]);
    expect(result.document.blocks).toEqual([]);
  });

  it("degrades a column count outside the allowed range", async () => {
    const result = await normalize(":::columns{count=9}\nBody.\n:::\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
    expect(kinds(result.document.blocks)).toEqual(["paragraph"]);
  });

  it("degrades a page break that carries attributes", async () => {
    const result = await normalize("::pagebreak{count=2}\n");
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
    expect(result.document.blocks).toEqual([]);
  });

  it("degrades a figure without a source", async () => {
    const result = await normalize('::figure{alt="no source"}\n');
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
  });

  it("names the offending directive in the warning", async () => {
    const result = await normalize(":::callout{type=unknown}\nBody.\n:::\n");
    expect(JSON.stringify(result.warnings[0]?.detail)).toContain("callout");
  });
});

describe("invalid directives in strict mode", () => {
  it("refuses an unknown callout variant", async () => {
    await expectStrictFailure(":::callout{type=unknown}\nBody.\n:::\n", "DIRECTIVE_ERROR");
  });

  it("refuses a column count outside the allowed range", async () => {
    await expectStrictFailure(":::columns{count=9}\nBody.\n:::\n", "DIRECTIVE_ERROR");
  });

  it("refuses a page break that carries attributes", async () => {
    await expectStrictFailure("::pagebreak{count=2}\n", "DIRECTIVE_ERROR");
  });

  it("refuses a figure without a source", async () => {
    await expectStrictFailure('::figure{alt="no source"}\n', "DIRECTIVE_ERROR");
  });

  it("refuses an unknown directive", async () => {
    await expectStrictFailure(":::mystery\nBody.\n:::\n", "UNSUPPORTED_NODE");
  });

  it("accepts every valid directive", async () => {
    const markdown = [
      ':::callout{type=info title="Ok"}',
      "Body.",
      ":::",
      "",
      "::pagebreak",
      "",
      ":::landscape",
      "Wide.",
      ":::",
      "",
      ":::columns{count=2}",
      "Split.",
      ":::",
      "",
      "::toc",
      "",
    ].join("\n");
    const result = await normalize(markdown, true);
    expect(result.warnings).toEqual([]);
  });
});
