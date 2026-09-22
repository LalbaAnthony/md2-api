import { Paragraph } from "docx";
import { assertNever } from "../../../errors.ts";
import { unsupportedBlockWarning } from "./context.ts";
import { renderHeading } from "./heading.ts";
import { renderInline } from "./inline.ts";
import { renderListItem } from "./list.ts";
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
    case "table":
    case "figure":
    case "pageBreak":
    case "tableOfContents":
    case "mathBlock":
    case "callout":
    case "sectionStart":
      context.warnings.add(unsupportedBlockWarning(block.kind));
      return [];
    default:
      return assertNever(block, "renderBlock");
  }
};

export const renderBlocks = (
  blocks: readonly IrBlock[],
  context: DocxRenderContext,
): readonly DocxBlockElement[] => blocks.flatMap((block) => renderBlock(block, context));
