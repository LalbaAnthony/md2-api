import { describe, expect, it } from "vitest";
import { resolveLinkReferences } from "../../src/pipeline/normalize/links.ts";
import { createWarningSink } from "../../src/pipeline/normalize/warnings.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import type { Root } from "mdast";

const orphanTree = (): Root => ({
  type: "root",
  children: [
    {
      type: "paragraph",
      children: [
        { type: "text", value: "See " },
        {
          type: "linkReference",
          identifier: "ghost",
          label: "ghost",
          referenceType: "full",
          children: [{ type: "text", value: "the site" }],
        },
      ],
    },
    {
      type: "paragraph",
      children: [
        {
          type: "imageReference",
          identifier: "ghost-image",
          label: "ghost-image",
          referenceType: "full",
          alt: "missing picture",
        },
      ],
    },
  ],
});

describe("resolving definitions", () => {
  it("rewrites a reference into a link and removes the definition", () => {
    const tree = parseMarkdown('[a][ref]\n\n[ref]: https://example.com "Title"\n');
    resolveLinkReferences(tree, createWarningSink());
    expect(tree.children).toHaveLength(1);
    const paragraph = tree.children[0];
    if (paragraph?.type === "paragraph") {
      const link = paragraph.children[0];
      expect(link).toMatchObject({
        type: "link",
        url: "https://example.com",
        title: "Title",
      });
    }
  });

  it("rewrites an image reference into an image", () => {
    const tree = parseMarkdown("![alt][pic]\n\n[pic]: https://example.com/a.png\n");
    resolveLinkReferences(tree, createWarningSink());
    const paragraph = tree.children[0];
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children[0]).toMatchObject({
        type: "image",
        url: "https://example.com/a.png",
        alt: "alt",
      });
    }
  });

  it("matches a definition whatever its case", () => {
    const tree = parseMarkdown("[a][REF]\n\n[ref]: https://example.com\n");
    resolveLinkReferences(tree, createWarningSink());
    const paragraph = tree.children[0];
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children[0]).toMatchObject({ type: "link" });
    }
  });

  it("resolves a reference nested inside another link", () => {
    const tree = parseMarkdown("> [a][ref]\n\n[ref]: https://example.com\n");
    resolveLinkReferences(tree, createWarningSink());
    const quote = tree.children[0];
    expect(quote?.type).toBe("blockquote");
  });
});

describe("orphan references", () => {
  it("falls back to literal text and warns", () => {
    const tree = orphanTree();
    const sink = createWarningSink();
    resolveLinkReferences(tree, sink);
    const paragraph = tree.children[0];
    if (paragraph?.type === "paragraph") {
      expect(paragraph.children[1]).toEqual({ type: "text", value: "[the site]" });
    }
    const image = tree.children[1];
    if (image?.type === "paragraph") {
      expect(image.children[0]).toEqual({ type: "text", value: "![missing picture]" });
    }
    expect(sink.list().map((entry) => entry.code)).toEqual([
      "LINK_DEFINITION_MISSING",
      "LINK_DEFINITION_MISSING",
    ]);
  });
});
