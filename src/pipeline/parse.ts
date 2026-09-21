import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { payloadTooLargeError } from "../errors.ts";
import type { Root } from "mdast";

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkDirective);

export const markdownByteLength = (markdown: string): number => Buffer.byteLength(markdown, "utf8");

export const assertMarkdownWithinLimit = (markdown: string, maximumBytes: number): void => {
  const byteLength = markdownByteLength(markdown);
  if (byteLength > maximumBytes) {
    throw payloadTooLargeError("The markdown payload exceeds the configured limit.", {
      byteLength,
      maximumBytes,
    });
  }
};

export const parseMarkdown = (markdown: string): Root => processor.parse(markdown);
