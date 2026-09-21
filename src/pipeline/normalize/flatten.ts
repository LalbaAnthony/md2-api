import { toString as mdastToString } from "mdast-util-to-string";
import { unsupportedNodeError } from "../../errors.ts";
import { anchorKey, resolveInternalAnchor } from "./anchors.ts";
import { warning } from "./warnings.ts";
import type { Heading, Paragraph, PhrasingContent, RootContent } from "mdast";
import type { BlockContext, InlineMarks, IrBlock, IrInline } from "../../types/ir.ts";
import type { FlattenInput, FlattenOutput } from "../../types/pipeline.ts";

const NO_MARKS: InlineMarks = {
  bold: false,
  italic: false,
  strike: false,
  subscript: false,
  superscript: false,
  code: false,
};

export const ROOT_CONTEXT: BlockContext = {
  indentLevel: 0,
  listPath: [],
  insideQuote: false,
  insideCallout: null,
  insideTableCell: false,
  insideFootnote: false,
};

const HEADING_DEPTHS: readonly (1 | 2 | 3 | 4 | 5 | 6)[] = [1, 2, 3, 4, 5, 6];

const headingLevel = (depth: number): 1 | 2 | 3 | 4 | 5 | 6 =>
  HEADING_DEPTHS[Math.min(Math.max(depth, 1), 6) - 1] ?? 1;

const withMark = (marks: InlineMarks, changes: Partial<InlineMarks>): InlineMarks => ({
  ...marks,
  ...changes,
});

const countWords = (value: string): number =>
  value.split(/\s+/u).filter((word) => word.length > 0).length;

export const flattenDocument = (input: FlattenInput): FlattenOutput => {
  const blocks: IrBlock[] = [];
  let headingCount = 0;
  let wordCount = 0;

  const reportUnsupported = (nodeType: string, detail: Record<string, string> = {}): void => {
    if (input.strict) {
      throw unsupportedNodeError(nodeType, detail);
    }
    input.sink.add(
      warning("UNSUPPORTED_NODE", `The markdown node '${nodeType}' was skipped.`, {
        nodeType,
        ...detail,
      }),
    );
  };

  const flattenInline = (
    nodes: readonly PhrasingContent[],
    marks: InlineMarks,
    collected: IrInline[],
  ): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          collected.push({ kind: "text", value: node.value, marks });
          break;
        case "strong":
          flattenInline(node.children, withMark(marks, { bold: true }), collected);
          break;
        case "emphasis":
          flattenInline(node.children, withMark(marks, { italic: true }), collected);
          break;
        case "delete":
          flattenInline(node.children, withMark(marks, { strike: true }), collected);
          break;
        case "inlineCode":
          collected.push({
            kind: "inlineCode",
            value: node.value,
            marks: withMark(marks, { code: true }),
          });
          break;
        case "break":
          collected.push({ kind: "lineBreak", hard: true });
          break;
        case "link": {
          const anchor = resolveInternalAnchor(input.anchors, node.url);
          const children: IrInline[] = [];
          flattenInline(node.children, marks, children);
          collected.push({
            kind: "link",
            url: anchor === null ? node.url : `#${anchor}`,
            internal: anchor !== null,
            title: node.title ?? null,
            children,
          });
          if (anchor === null && node.url.startsWith("#")) {
            input.sink.add(
              warning("ANCHOR_NOT_FOUND", "An internal link points to an unknown anchor.", {
                url: node.url,
              }),
            );
          }
          break;
        }
        default:
          reportUnsupported(node.type);
          break;
      }
    }
  };

  const inlineOf = (nodes: readonly PhrasingContent[]): readonly IrInline[] => {
    const collected: IrInline[] = [];
    flattenInline(nodes, NO_MARKS, collected);
    return collected;
  };

  const pushParagraph = (node: Paragraph, context: BlockContext): void => {
    const children = inlineOf(node.children);
    if (children.length === 0) {
      return;
    }
    wordCount += countWords(mdastToString(node));
    blocks.push({ kind: "paragraph", context, children, align: null });
  };

  const pushHeading = (node: Heading, context: BlockContext): void => {
    const plainText = mdastToString(node).trim();
    headingCount += 1;
    wordCount += countWords(plainText);
    blocks.push({
      kind: "heading",
      context,
      level: headingLevel(node.depth),
      anchor: input.anchors.byHeading.get(anchorKey(node)) ?? "",
      children: inlineOf(node.children),
      plainText,
    });
  };

  const walk = (nodes: readonly RootContent[], context: BlockContext): void => {
    for (const node of nodes) {
      switch (node.type) {
        case "paragraph":
          pushParagraph(node, context);
          break;
        case "heading":
          pushHeading(node, context);
          break;
        case "thematicBreak":
          blocks.push({ kind: "thematicBreak", context });
          break;
        case "yaml":
        case "definition":
          break;
        case "html":
          reportUnsupported("html");
          break;
        default:
          reportUnsupported(node.type);
          break;
      }
    }
  };

  walk(input.tree.children, ROOT_CONTEXT);

  return { blocks, headingCount, wordCount };
};
