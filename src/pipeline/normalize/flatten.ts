import { toString as mdastToString } from "mdast-util-to-string";
import { directiveError, unsupportedNodeError, validationError } from "../../errors.ts";
import { anchorKey, resolveInternalAnchor } from "./anchors.ts";
import { warning } from "./warnings.ts";
import type {
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Blockquote,
  Table,
  TableCell,
} from "mdast";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";
import type {
  BlockContext,
  CalloutKind,
  InlineMarks,
  IrBlock,
  IrInline,
  IrTableCell,
  IrTableRow,
  ListFrame,
  SectionOverride,
  TextAlign,
} from "../../types/ir.ts";
import type { DirectiveIssue, FlattenInput, FlattenOutput } from "../../types/pipeline.ts";
import { computeColumnWidths, measureColumn } from "./tables.ts";
import {
  CALLOUT_DIRECTIVE_NAME,
  COLUMNS_DIRECTIVE_NAME,
  FIGURE_DIRECTIVE_NAME,
  KNOWN_CONTAINER_DIRECTIVES,
  KNOWN_LEAF_DIRECTIVES,
  LANDSCAPE_DIRECTIVE_NAME,
  PAGEBREAK_DIRECTIVE_NAME,
  TOC_DIRECTIVE_NAME,
  parseBareDirective,
  isFigureDirective,
  parseCalloutDirective,
  parseColumnsDirective,
  parseFigureDirective,
} from "./directives.ts";

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

const isList = (node: RootContent): node is List => node.type === "list";

const emptyCell = (): TableCell => ({ type: "tableCell", children: [] });

export const flattenDocument = (input: FlattenInput): FlattenOutput => {
  const blocks: IrBlock[] = [];
  let headingCount = 0;
  let wordCount = 0;
  let listInstance = 0;
  let codeBlockCount = 0;
  let tableCount = 0;
  let imageCount = 0;
  let figureCount = 0;

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

  const refuseDirective = (name: string, issues: readonly DirectiveIssue[]): void => {
    if (input.strict) {
      throw directiveError(`The ${name} directive carries invalid attributes.`, {
        directive: name,
        issues: issues.map((issue) => ({ path: [...issue.path], message: issue.message })),
      });
    }
    input.sink.add(
      warning("DIRECTIVE_INVALID", `The ${name} directive was degraded.`, {
        directive: name,
        issues: issues.map((issue) => ({ path: [...issue.path], message: issue.message })),
      }),
    );
  };

  const assertWithinNestingLimit = (depth: number): void => {
    if (depth > input.maxNestingDepth) {
      throw validationError("The document nests blocks beyond the configured limit.", {
        depth,
        maximumDepth: input.maxNestingDepth,
      });
    }
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
        case "image": {
          const asset = input.images.get(node);
          if (asset === undefined) {
            collected.push({ kind: "text", value: node.alt ?? "", marks });
            break;
          }
          imageCount += 1;
          collected.push({ kind: "image", asset, alternativeText: node.alt ?? "" });
          break;
        }
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

  const pushParagraph = (node: Paragraph, context: BlockContext, target: IrBlock[]): void => {
    const children = inlineOf(node.children);
    if (children.length === 0) {
      return;
    }
    wordCount += countWords(mdastToString(node));
    target.push({ kind: "paragraph", context, children, align: null });
  };

  const pushHeading = (node: Heading, context: BlockContext, target: IrBlock[]): void => {
    const plainText = mdastToString(node).trim();
    headingCount += 1;
    wordCount += countWords(plainText);
    target.push({
      kind: "heading",
      context,
      level: headingLevel(node.depth),
      anchor: input.anchors.byHeading.get(anchorKey(node)) ?? "",
      children: inlineOf(node.children),
      plainText,
    });
  };

  const pushFigure = (node: LeafDirective, context: BlockContext, target: IrBlock[]): void => {
    const outcome = parseFigureDirective(node);
    if (!outcome.ok) {
      refuseDirective(FIGURE_DIRECTIVE_NAME, outcome.issues);
      return;
    }
    const directive = outcome.value;
    const asset = input.images.get(node);
    if (asset === undefined) {
      if (directive.alternativeText.length > 0) {
        target.push({
          kind: "paragraph",
          context,
          align: null,
          children: [{ kind: "text", value: directive.alternativeText, marks: NO_MARKS }],
        });
      }
      return;
    }
    imageCount += 1;
    figureCount += 1;
    target.push({
      kind: "figure",
      context,
      asset,
      caption: directive.caption,
      sequence: figureCount,
      widthRatio: directive.widthRatio,
    });
  };

  const pushCode = (node: Code, context: BlockContext, target: IrBlock[]): void => {
    codeBlockCount += 1;
    target.push({
      kind: "code",
      context,
      language:
        node.lang === null || node.lang === undefined || node.lang.length === 0 ? null : node.lang,
      lines: input.codeTokens.get(node) ?? [],
      caption: null,
    });
  };

  const cellText = (cell: TableCell): string => mdastToString(cell);

  const cellOf = (cell: TableCell, context: BlockContext, align: TextAlign | null): IrTableCell => {
    const cellContext: BlockContext = { ...context, insideTableCell: true };
    return {
      blocks: [
        { kind: "paragraph", context: cellContext, children: inlineOf(cell.children), align },
      ],
      align,
    };
  };

  const pushTable = (node: Table, context: BlockContext, target: IrBlock[]): void => {
    tableCount += 1;
    const alignments: readonly (TextAlign | null)[] = (node.align ?? []).map(
      (entry) => entry ?? null,
    );
    const columnCount = node.children.reduce(
      (widest, row) => Math.max(widest, row.children.length),
      0,
    );
    const columnAlign = Array.from(
      { length: columnCount },
      (_unused, index) => alignments[index] ?? null,
    );

    const measures = Array.from({ length: columnCount }, (_unused, index) =>
      measureColumn(node.children.map((row) => cellText(row.children[index] ?? emptyCell()))),
    );

    const rowsOf = (rows: readonly Table["children"][number][]): readonly IrTableRow[] =>
      rows.map((row) => ({
        cells: Array.from({ length: columnCount }, (_unused, index) =>
          cellOf(row.children[index] ?? emptyCell(), context, columnAlign[index] ?? null),
        ),
      }));

    const [headerRow, ...bodyRows] = node.children;

    target.push({
      kind: "table",
      context,
      header: headerRow === undefined ? null : (rowsOf([headerRow])[0] ?? null),
      rows: rowsOf(bodyRows),
      columnWidths: computeColumnWidths(measures, input.contentWidth, input.minimumColumnWidth),
      columnAlign,
      caption: null,
      sequence: tableCount,
    });
  };

  const pushQuote = (node: Blockquote, context: BlockContext, target: IrBlock[]): void => {
    const quoteContext: BlockContext = {
      ...context,
      insideQuote: true,
      indentLevel: context.indentLevel + 1,
    };
    assertWithinNestingLimit(quoteContext.indentLevel);
    walk(node.children, quoteContext, target);
  };

  const pushCallout = (
    node: ContainerDirective,
    context: BlockContext,
    target: IrBlock[],
  ): void => {
    const outcome = parseCalloutDirective(node);
    if (!outcome.ok) {
      refuseDirective(CALLOUT_DIRECTIVE_NAME, outcome.issues);
      walk(node.children, context, target);
      return;
    }
    const directive = outcome.value;
    const variant: CalloutKind = directive.variant;
    const calloutContext: BlockContext = { ...context, insideCallout: variant };
    assertWithinNestingLimit(context.indentLevel + 1);
    const blocks: IrBlock[] = [];
    walk(node.children, calloutContext, blocks);
    target.push({
      kind: "callout",
      context,
      variant,
      title: directive.title,
      blocks,
    });
  };

  const pushSectioned = (
    node: ContainerDirective,
    context: BlockContext,
    target: IrBlock[],
    section: SectionOverride,
  ): void => {
    target.push({ kind: "sectionStart", context, section });
    walk(node.children, context, target);
    target.push({
      kind: "sectionStart",
      context,
      section: { orientation: null, columnCount: null },
    });
  };

  const pushListItem = (
    item: ListItem,
    frame: ListFrame,
    parentContext: BlockContext,
    target: IrBlock[],
  ): void => {
    const itemContext: BlockContext = {
      ...parentContext,
      indentLevel: frame.level + 1,
      listPath: [...parentContext.listPath, frame],
    };
    const ownBlocks: IrBlock[] = [];
    walk(
      item.children.filter((child) => !isList(child)),
      itemContext,
      ownBlocks,
    );
    target.push({
      kind: "listItem",
      context: itemContext,
      frame,
      checked: item.checked ?? null,
      blocks: ownBlocks,
    });
    for (const child of item.children) {
      if (isList(child)) {
        pushList(child, itemContext, target, frame.level + 1, frame.instance);
      }
    }
  };

  const pushList = (
    list: List,
    parentContext: BlockContext,
    target: IrBlock[],
    level: number,
    instance: number,
  ): void => {
    assertWithinNestingLimit(level + 1);
    const ordered = list.ordered === true;
    const start = list.start ?? 1;
    const spread = list.spread === true;
    for (const item of list.children) {
      pushListItem(item, { ordered, level, instance, start, spread }, parentContext, target);
    }
  };

  const pushLeafDirective = (
    node: LeafDirective,
    context: BlockContext,
    target: IrBlock[],
  ): void => {
    if (!KNOWN_LEAF_DIRECTIVES.has(node.name)) {
      reportUnsupported(`directive:${node.name}`);
      return;
    }
    if (isFigureDirective(node)) {
      pushFigure(node, context, target);
      return;
    }
    const name =
      node.name === PAGEBREAK_DIRECTIVE_NAME ? PAGEBREAK_DIRECTIVE_NAME : TOC_DIRECTIVE_NAME;
    const outcome = parseBareDirective(node);
    if (!outcome.ok) {
      refuseDirective(name, outcome.issues);
      return;
    }
    target.push(
      name === PAGEBREAK_DIRECTIVE_NAME
        ? { kind: "pageBreak", context }
        : { kind: "tableOfContents", context },
    );
  };

  const pushContainerDirective = (
    node: ContainerDirective,
    context: BlockContext,
    target: IrBlock[],
  ): void => {
    if (!KNOWN_CONTAINER_DIRECTIVES.has(node.name)) {
      reportUnsupported(`directive:${node.name}`);
      walk(node.children, context, target);
      return;
    }
    if (node.name === CALLOUT_DIRECTIVE_NAME) {
      pushCallout(node, context, target);
      return;
    }
    if (node.name === LANDSCAPE_DIRECTIVE_NAME) {
      const bare = parseBareDirective(node);
      if (!bare.ok) {
        refuseDirective(LANDSCAPE_DIRECTIVE_NAME, bare.issues);
        walk(node.children, context, target);
        return;
      }
      pushSectioned(node, context, target, { orientation: "landscape", columnCount: null });
      return;
    }
    const columns = parseColumnsDirective(node);
    if (!columns.ok) {
      refuseDirective(COLUMNS_DIRECTIVE_NAME, columns.issues);
      walk(node.children, context, target);
      return;
    }
    pushSectioned(node, context, target, { orientation: null, columnCount: columns.value.count });
  };

  function walk(nodes: readonly RootContent[], context: BlockContext, target: IrBlock[]): void {
    for (const node of nodes) {
      switch (node.type) {
        case "paragraph":
          pushParagraph(node, context, target);
          break;
        case "heading":
          pushHeading(node, context, target);
          break;
        case "thematicBreak":
          target.push({ kind: "thematicBreak", context });
          break;
        case "list":
          listInstance += 1;
          pushList(node, context, target, 0, listInstance);
          break;
        case "code":
          pushCode(node, context, target);
          break;
        case "table":
          pushTable(node, context, target);
          break;
        case "blockquote":
          pushQuote(node, context, target);
          break;
        case "leafDirective":
          pushLeafDirective(node, context, target);
          break;
        case "containerDirective":
          pushContainerDirective(node, context, target);
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
  }

  walk(input.tree.children, ROOT_CONTEXT, blocks);

  return { blocks, headingCount, wordCount, codeBlockCount, tableCount, imageCount };
};
