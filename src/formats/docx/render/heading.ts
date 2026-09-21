import { Bookmark, Paragraph } from "docx";
import { renderInline } from "./inline.ts";
import type { IrBlock } from "../../../types/ir.ts";
import type { DocxRenderContext } from "../../../types/docx-render.ts";
import type { DocxParagraphStyleKey } from "../../../types/docx-theme.ts";

const HEADING_STYLE_KEYS: readonly DocxParagraphStyleKey[] = [
  "Heading1",
  "Heading2",
  "Heading3",
  "Heading4",
  "Heading5",
  "Heading6",
];

export const headingStyleKey = (level: 1 | 2 | 3 | 4 | 5 | 6): DocxParagraphStyleKey =>
  HEADING_STYLE_KEYS[level - 1] ?? "Heading1";

export const renderHeading = (
  block: Extract<IrBlock, { kind: "heading" }>,
  context: DocxRenderContext,
): Paragraph => {
  const children = renderInline(block.children, context);
  const styleKey = headingStyleKey(block.level);
  const pageBreakBefore =
    context.compiled.paragraphBehaviour.headingPageBreakBefore[block.level - 1] ?? false;

  return new Paragraph({
    style: context.compiled.styleIds[styleKey],
    pageBreakBefore,
    children:
      block.anchor.length === 0
        ? [...children]
        : [new Bookmark({ id: block.anchor, children: [...children] })],
    ...(context.compiled.headingsAreNumbered
      ? {
          numbering: {
            reference: context.compiled.numberingReferences.headings,
            level: block.level - 1,
          },
        }
      : {}),
  });
};
