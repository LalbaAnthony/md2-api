import { PageBreak, Paragraph, TableOfContents, TextRun } from "docx";
import { assertNever } from "../../../errors.ts";
import { mathFallbackWarning } from "./context.ts";
import { renderCode } from "./code.ts";
import { renderHeading } from "./heading.ts";
import { renderFigure } from "./image.ts";
import { renderInline } from "./inline.ts";
import { renderCallout } from "./callout.ts";
import { renderListItem } from "./list.ts";
import { renderQuotedParagraph } from "./quote.ts";
import { renderTable } from "./table.ts";
import type { AlignmentType } from "docx";
import type { IrBlock, TextAlign } from "../../../types/ir.ts";
import type { DocxBlockElement, DocxRenderContext } from "../../../types/docx-render.ts";

const ALIGNMENT_BY_TEXT_ALIGN: Readonly<
  Record<TextAlign, (typeof AlignmentType)[keyof typeof AlignmentType]>
> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "both",
};

export const renderBlock = (
  block: IrBlock,
  context: DocxRenderContext,
): readonly DocxBlockElement[] => {
  switch (block.kind) {
    case "paragraph": {
      if (block.context.insideQuote) {
        return [renderQuotedParagraph(block, context)];
      }
      const children = renderInline(block.children, context);
      return [
        new Paragraph({
          style: context.compiled.styleIds.Normal,
          widowControl: context.compiled.paragraphBehaviour.widowControl,
          ...(block.align === null ? {} : { alignment: ALIGNMENT_BY_TEXT_ALIGN[block.align] }),
          children: [...children],
        }),
      ];
    }
    case "heading":
      return [renderHeading(block, context)];
    case "thematicBreak":
      return [new Paragraph({ style: context.compiled.styleIds.HorizontalRule, children: [] })];
    case "listItem":
      return renderListItem(block, context, renderBlock);
    case "code":
      return [renderCode(block, context)];
    case "table":
      return renderTable(block, context);
    case "figure":
      return renderFigure(block, context);
    case "mathBlock":
      context.warnings.add(mathFallbackWarning(block.kind));
      return [
        new Paragraph({
          style: context.compiled.styleIds.Normal,
          alignment: "center",
          children: [
            new TextRun({ text: block.source, style: context.compiled.styleIds.MathInline }),
          ],
        }),
      ];
    case "callout":
      return [renderCallout(block, context, renderBlocks)];
    case "pageBreak":
      return [
        new Paragraph({
          style: context.compiled.styleIds.Normal,
          children: [new PageBreak()],
        }),
      ];
    case "tableOfContents":
      return [
        new TableOfContents(context.compiled.tableOfContents.title, {
          hyperlink: context.compiled.tableOfContents.hyperlinks,
          headingStyleRange: `1-${String(context.compiled.tableOfContents.depth)}`,
        }),
      ];
    case "sectionStart":
      return [];
    default:
      return assertNever(block, "renderBlock");
  }
};

export const renderBlocks = (
  blocks: readonly IrBlock[],
  context: DocxRenderContext,
): readonly DocxBlockElement[] => blocks.flatMap((block) => renderBlock(block, context));
