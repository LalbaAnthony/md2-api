import { Paragraph } from "docx";
import { renderInline } from "./inline.ts";
import type { IrBlock } from "../../../types/ir.ts";
import type { DocxRenderContext } from "../../../types/docx-render.ts";

export const quoteIndentFor = (context: DocxRenderContext, depth: number): number =>
  context.compiled.quote.indentLeft * Math.max(depth, 1);

export const renderQuotedParagraph = (
  block: Extract<IrBlock, { kind: "paragraph" }>,
  context: DocxRenderContext,
): Paragraph =>
  new Paragraph({
    style: context.compiled.styleIds.Quote,
    indent: {
      left: quoteIndentFor(context, block.context.indentLevel),
      right: context.compiled.quote.indentRight,
    },
    children: [...renderInline(block.children, context)],
  });
