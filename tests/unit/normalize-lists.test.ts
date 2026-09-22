import { describe, expect, it } from "vitest";
import { isAppError } from "../../src/errors.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { DocumentIr, IrBlock, ListFrame } from "../../src/types/ir.ts";

const normalize = async (markdown: string, maxNestingDepth = 100): Promise<DocumentIr> => {
  const result = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth,
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
  return result.document;
};

const listItems = (document: DocumentIr): readonly Extract<IrBlock, { kind: "listItem" }>[] =>
  document.blocks.filter((block) => block.kind === "listItem");

const frames = (document: DocumentIr): readonly ListFrame[] =>
  listItems(document).map((item) => item.frame);

const firstParagraphText = (item: Extract<IrBlock, { kind: "listItem" }>): string => {
  const first = item.blocks[0];
  if (first === undefined || first.kind !== "paragraph") {
    return "";
  }
  return first.children.map((child) => (child.kind === "text" ? child.value : "")).join("");
};

describe("numbering instances", () => {
  it("gives consecutive root lists distinct instances", async () => {
    const document = await normalize("1. a\n2. b\n\nBetween.\n\n1. c\n2. d\n");
    expect(frames(document).map((frame) => frame.instance)).toEqual([1, 1, 2, 2]);
  });

  it("gives three consecutive lists three instances", async () => {
    const document = await normalize("- a\n\ntext\n\n- b\n\ntext\n\n- c\n");
    expect(frames(document).map((frame) => frame.instance)).toEqual([1, 2, 3]);
  });

  it("shares the instance of the root list with every descendant", async () => {
    const document = await normalize("1. a\n   1. b\n      1. c\n2. d\n");
    expect(frames(document).map((frame) => frame.instance)).toEqual([1, 1, 1, 1]);
  });

  it("counts a list that follows a nested one as a new instance", async () => {
    const document = await normalize("- a\n  - b\n\nBetween.\n\n- c\n");
    expect(frames(document).map((frame) => frame.instance)).toEqual([1, 1, 2]);
  });
});

describe("nesting levels", () => {
  it("numbers levels from zero", async () => {
    const document = await normalize("- a\n  - b\n    - c\n");
    expect(frames(document).map((frame) => frame.level)).toEqual([0, 1, 2]);
  });

  it("carries nine levels without clipping", async () => {
    const markdown = Array.from({ length: 9 }, (_unused, level) => {
      const indent = "  ".repeat(level);
      return `${indent}- level ${String(level + 1)}`;
    }).join("\n");
    const document = await normalize(markdown);
    expect(frames(document).map((frame) => frame.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("records the nesting in the block context", async () => {
    const document = await normalize("- a\n  - b\n");
    const items = listItems(document);
    expect(items[0]?.context.indentLevel).toBe(1);
    expect(items[1]?.context.indentLevel).toBe(2);
    expect(items[1]?.context.listPath).toHaveLength(2);
  });

  it("refuses nesting beyond the configured limit", async () => {
    const markdown = Array.from({ length: 6 }, (_unused, level) => {
      return `${"  ".repeat(level)}- level ${String(level + 1)}`;
    }).join("\n");
    await expect(normalize(markdown, 3)).rejects.toSatisfy(
      (thrown: unknown) => isAppError(thrown) && thrown.code === "NESTING_TOO_DEEP",
    );
  });
});

describe("ordered and unordered lists", () => {
  it("marks ordered lists and keeps their start", async () => {
    const document = await normalize("5. five\n6. six\n");
    expect(frames(document).map((frame) => frame.ordered)).toEqual([true, true]);
    expect(frames(document).map((frame) => frame.start)).toEqual([5, 5]);
  });

  it("marks unordered lists", async () => {
    const document = await normalize("- a\n- b\n");
    expect(frames(document).every((frame) => !frame.ordered)).toBe(true);
    expect(frames(document).map((frame) => frame.start)).toEqual([1, 1]);
  });

  it("mixes ordered and unordered across levels", async () => {
    const document = await normalize("1. parent\n   - child\n     1. grandchild\n");
    expect(frames(document).map((frame) => frame.ordered)).toEqual([true, false, true]);
  });
});

describe("loose and tight lists", () => {
  it("marks a tight list as not spread", async () => {
    const document = await normalize("- a\n- b\n");
    expect(frames(document).every((frame) => !frame.spread)).toBe(true);
  });

  it("marks a loose list as spread", async () => {
    const document = await normalize("- a\n\n- b\n");
    expect(frames(document).every((frame) => frame.spread)).toBe(true);
  });
});

describe("multi block items", () => {
  it("keeps every paragraph of an item inside that item", async () => {
    const document = await normalize("- first\n\n  second\n\n  third\n");
    const items = listItems(document);
    expect(items).toHaveLength(1);
    expect(items[0]?.blocks).toHaveLength(3);
    expect(items[0]?.blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });

  it("keeps a nested list out of the item blocks", async () => {
    const document = await normalize("- parent\n  - child\n");
    const items = listItems(document);
    expect(items[0]?.blocks).toHaveLength(1);
    expect(items).toHaveLength(2);
  });

  it("keeps the document order of items and their content", async () => {
    const document = await normalize("- one\n  - one a\n- two\n");
    expect(listItems(document).map(firstParagraphText)).toEqual(["one", "one a", "two"]);
  });
});

describe("task lists", () => {
  it("records the checked state", async () => {
    const document = await normalize("- [x] done\n- [ ] open\n");
    expect(listItems(document).map((item) => item.checked)).toEqual([true, false]);
  });

  it("leaves an ordinary item unchecked as null", async () => {
    const document = await normalize("- ordinary\n");
    expect(listItems(document).map((item) => item.checked)).toEqual([null]);
  });

  it("mixes tasks and ordinary items in one list", async () => {
    const document = await normalize("- ordinary\n- [ ] task\n");
    expect(listItems(document).map((item) => item.checked)).toEqual([null, false]);
  });
});
