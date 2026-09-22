import {
  BorderStyle,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ITableBordersOptions } from "docx";
import type { IrBlock } from "../../../types/ir.ts";
import type { DocxBlockElement, DocxRenderContext } from "../../../types/docx-render.ts";

const calloutBorders = (color: string, barWidth: number): ITableBordersOptions => ({
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.SINGLE, size: barWidth, color },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
});

export const renderCallout = (
  block: Extract<IrBlock, { kind: "callout" }>,
  context: DocxRenderContext,
  renderNested: (
    blocks: readonly IrBlock[],
    context: DocxRenderContext,
  ) => readonly DocxBlockElement[],
): Table => {
  const settings = context.compiled.callout;
  const variant = settings.variants[block.variant];

  const children: DocxBlockElement[] = [];
  if (settings.showLabel) {
    const label = block.title === null ? variant.label : `${variant.label}: ${block.title}`;
    children.push(
      new Paragraph({
        style: context.compiled.styleIds.CalloutTitle,
        children: [new TextRun({ text: label, color: variant.color })],
      }),
    );
  }
  children.push(...renderNested(block.blocks, context));
  if (children.length === 0) {
    children.push(new Paragraph({ style: context.compiled.styleIds.Callout, children: [] }));
  }

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: context.compiled.contentWidth, type: WidthType.DXA },
    columnWidths: [context.compiled.contentWidth],
    borders: calloutBorders(variant.color, settings.barWidth),
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: context.compiled.contentWidth, type: WidthType.DXA },
            ...(settings.tintedBackground
              ? { shading: { type: ShadingType.CLEAR, fill: variant.tint } }
              : {}),
            margins: {
              top: settings.padding,
              bottom: settings.padding,
              left: settings.padding,
              right: settings.padding,
            },
            children,
          }),
        ],
      }),
    ],
  });
};
