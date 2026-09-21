import { describe, expect, it } from "vitest";
import {
  assertMarkdownWithinLimit,
  markdownByteLength,
  parseMarkdown,
} from "../../src/pipeline/parse.ts";
import { isAppError } from "../../src/errors.ts";

const kinds = (markdown: string): readonly string[] =>
  parseMarkdown(markdown).children.map((child) => child.type);

describe("parsing", () => {
  it("produces raw mdast without transformation", () => {
    expect(kinds("# Title\n\nText\n")).toEqual(["heading", "paragraph"]);
  });

  it("keeps the front matter node", () => {
    expect(kinds("---\ntitle: X\n---\n\nText\n")).toEqual(["yaml", "paragraph"]);
  });

  it("keeps link definitions in the tree", () => {
    expect(kinds("[a]: https://example.com\n\nText\n")).toEqual(["definition", "paragraph"]);
  });

  it("parses gfm tables, task lists and strikethrough", () => {
    expect(kinds("| a | b |\n| - | - |\n| 1 | 2 |\n")).toEqual(["table"]);
    expect(kinds("- [x] done\n")).toEqual(["list"]);
  });

  it("parses directives", () => {
    expect(kinds(":::callout{type=info}\nBody\n:::\n")).toEqual(["containerDirective"]);
    expect(kinds("::pagebreak\n")).toEqual(["leafDirective"]);
  });

  it("parses math", () => {
    expect(kinds("$$\nx^2\n$$\n")).toEqual(["math"]);
  });

  it("treats an unmatched link reference as literal text", () => {
    const tree = parseMarkdown("See [the site][missing].\n");
    const paragraph = tree.children[0];
    expect(paragraph?.type).toBe("paragraph");
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children.map((child) => child.type)).toEqual(["text"]);
    }
  });

  it("emits a link reference when the definition exists", () => {
    const tree = parseMarkdown("See [the site][ref].\n\n[ref]: https://example.com\n");
    const paragraph = tree.children[0];
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children.map((child) => child.type)).toEqual([
        "text",
        "linkReference",
        "text",
      ]);
    }
  });
});

describe("input limit", () => {
  it("measures bytes, not characters", () => {
    expect(markdownByteLength("abc")).toBe(3);
    expect(markdownByteLength(String.fromCodePoint(0x00e9))).toBe(2);
  });

  it("accepts a payload at the limit", () => {
    expect(() => {
      assertMarkdownWithinLimit("abc", 3);
    }).not.toThrow();
  });

  it("rejects a payload above the limit", () => {
    try {
      assertMarkdownWithinLimit("abcd", 3);
      expect.unreachable("Expected a payload error.");
    } catch (thrown) {
      expect(isAppError(thrown)).toBe(true);
      if (isAppError(thrown)) {
        expect(thrown.code).toBe("PAYLOAD_TOO_LARGE");
        expect(thrown.details).toEqual({ byteLength: 4, maximumBytes: 3 });
      }
    }
  });
});
