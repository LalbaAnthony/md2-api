import { describe, expect, it } from "vitest";
import {
  expandTabs,
  isKnownLanguage,
  scopeForTextMateScope,
} from "../../src/pipeline/normalize/code.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import type { DocumentIr, IrBlock, SyntaxScope } from "../../src/types/ir.ts";
import type { NormalizeResult } from "../../src/types/pipeline.ts";

const TAB = String.fromCharCode(9);

const normalize = async (markdown: string, tabWidth = 4): Promise<NormalizeResult> =>
  normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: dxa(9026),
    tabWidth,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });

const codeBlocks = (document: DocumentIr): readonly Extract<IrBlock, { kind: "code" }>[] =>
  document.blocks.filter((block) => block.kind === "code");

const scopesOf = (block: Extract<IrBlock, { kind: "code" }>): readonly SyntaxScope[] =>
  block.lines.flatMap((line) =>
    line.tokens.filter((token) => token.text.trim().length > 0).map((token) => token.scope),
  );

const firstCodeBlock = (document: DocumentIr): Extract<IrBlock, { kind: "code" }> => {
  const block = codeBlocks(document)[0];
  if (block === undefined) {
    throw new Error("The document carries no code block.");
  }
  return block;
};

const textOf = (block: Extract<IrBlock, { kind: "code" }>): string =>
  block.lines.map((line) => line.tokens.map((token) => token.text).join("")).join("\n");

describe("expanding tabs", () => {
  it("expands a leading tab to the next tab stop", () => {
    expect(expandTabs(`${TAB}x`, 4)).toBe("    x");
  });

  it("expands to the next stop, not by a fixed width", () => {
    expect(expandTabs(`ab${TAB}x`, 4)).toBe("ab  x");
    expect(expandTabs(`abc${TAB}x`, 4)).toBe("abc x");
    expect(expandTabs(`abcd${TAB}x`, 4)).toBe("abcd    x");
  });

  it("honours the configured width", () => {
    expect(expandTabs(`${TAB}x`, 2)).toBe("  x");
    expect(expandTabs(`${TAB}x`, 8)).toBe("        x");
  });

  it("expands several tabs in a row", () => {
    expect(expandTabs(`${TAB}${TAB}x`, 4)).toBe("        x");
  });

  it("leaves a line without tabs untouched", () => {
    expect(expandTabs("    already spaces", 4)).toBe("    already spaces");
  });
});

describe("mapping TextMate scopes", () => {
  const cases: readonly (readonly [string, SyntaxScope])[] = [
    ["comment.line.double-slash.ts", "comment"],
    ["constant.numeric.decimal.ts", "number"],
    ["constant.language.boolean.true.ts", "constant"],
    ["string.quoted.double.ts", "string"],
    ["keyword.operator.assignment.ts", "operator"],
    ["keyword.control.flow.ts", "keyword"],
    ["storage.type.ts", "keyword"],
    ["storage.type.class.ts", "type"],
    ["entity.name.function.ts", "function"],
    ["entity.name.type.class.ts", "type"],
    ["entity.name.tag.html", "tag"],
    ["entity.other.attribute-name.html", "attribute"],
    ["variable.other.readwrite.ts", "variable"],
    ["punctuation.terminator.statement.ts", "punctuation"],
  ];

  it.each(cases)("maps %s", (scopeName, expected) => {
    expect(scopeForTextMateScope(scopeName)).toBe(expected);
  });

  it("returns null for a scope it does not know", () => {
    expect(scopeForTextMateScope("source.ts")).toBeNull();
    expect(scopeForTextMateScope("meta.var.expr.ts")).toBeNull();
  });
});

describe("known languages", () => {
  it("recognises a bundled language", () => {
    expect(isKnownLanguage("typescript")).toBe(true);
    expect(isKnownLanguage("python")).toBe(true);
  });

  it("recognises an alias", () => {
    expect(isKnownLanguage("ts")).toBe(true);
    expect(isKnownLanguage("js")).toBe(true);
  });

  it("rejects an unknown language", () => {
    expect(isKnownLanguage("notalanguage")).toBe(false);
    expect(isKnownLanguage("")).toBe(false);
  });
});

describe("tokenising a code block", () => {
  it("assigns semantic scopes, never colours", async () => {
    const result = await normalize('```ts\nconst a = "x"; // note\n```\n');
    const block = firstCodeBlock(result.document);
    expect(JSON.stringify(block)).not.toContain("#");
    const scopes = new Set(scopesOf(block));
    expect(scopes.has("keyword")).toBe(true);
    expect(scopes.has("string")).toBe(true);
    expect(scopes.has("comment")).toBe(true);
  });

  it("numbers the lines from one", async () => {
    const result = await normalize("```ts\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n");
    const block = codeBlocks(result.document)[0];
    expect(block?.lines.map((line) => line.number)).toEqual([1, 2, 3]);
  });

  it("records the language", async () => {
    const result = await normalize("```python\nx = 1\n```\n");
    expect(codeBlocks(result.document)[0]?.language).toBe("python");
  });

  it("records no language for a bare block", async () => {
    const result = await normalize("```\nplain\n```\n");
    expect(codeBlocks(result.document)[0]?.language).toBeNull();
  });

  it("counts the code blocks in the statistics", async () => {
    const result = await normalize("```ts\nconst a = 1;\n```\n\n```ts\nconst b = 2;\n```\n");
    expect(result.document.stats.codeBlocks).toBe(2);
  });
});

describe("unknown languages", () => {
  it("falls back to plain text and warns", async () => {
    const result = await normalize("```notalanguage\nsome text\n```\n");
    expect(scopesOf(firstCodeBlock(result.document))).toEqual(["plain"]);
    expect(result.warnings.map((entry) => entry.code)).toEqual(["CODE_LANGUAGE_UNKNOWN"]);
  });

  it("never warns for a block without a language", async () => {
    const result = await normalize("```\nsome text\n```\n");
    expect(result.warnings).toEqual([]);
  });
});

describe("whitespace", () => {
  it("expands tabs inside the tokens", async () => {
    const result = await normalize(`\`\`\`\n${TAB}indented\n\`\`\`\n`);
    expect(textOf(firstCodeBlock(result.document))).toBe("    indented");
  });

  it("expands tabs with the width of the theme", async () => {
    const result = await normalize(`\`\`\`\n${TAB}indented\n\`\`\`\n`, 2);
    expect(textOf(firstCodeBlock(result.document))).toBe("  indented");
  });

  it("preserves leading spaces", async () => {
    const result = await normalize("```\n    four spaces\n```\n");
    expect(textOf(firstCodeBlock(result.document))).toBe("    four spaces");
  });

  it("keeps an empty line as an empty line", async () => {
    const result = await normalize("```ts\nconst a = 1;\n\nconst b = 2;\n```\n");
    const block = codeBlocks(result.document)[0];
    expect(block?.lines).toHaveLength(3);
    expect(block?.lines[1]?.tokens.map((token) => token.text).join("")).toBe("");
  });
});

describe("code inside other constructions", () => {
  it("tokenises a block nested in a list item", async () => {
    const result = await normalize('1. step\n\n   ```json\n   { "a": 1 }\n   ```\n');
    const items = result.document.blocks.filter((block) => block.kind === "listItem");
    const nested = items[0]?.blocks.filter((block) => block.kind === "code") ?? [];
    expect(nested).toHaveLength(1);
    expect(nested[0]?.language).toBe("json");
  });
});
