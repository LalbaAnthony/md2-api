import {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  SimpleField,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { assertNever } from "../../../errors.ts";
import { renderInline } from "./inline.ts";
import type { IBorderOptions, ITableBordersOptions, ParagraphChild } from "docx";
import type { IrBlock, IrTableCell, IrTableRow, TextAlign } from "../../../types/ir.ts";
import type { DocxBlockElement, DocxRenderContext } from "../../../types/docx-render.ts";

const TABLE_SEQUENCE_NAME = "Table";

const alignmentOf = (
  align: TextAlign | null,
): (typeof AlignmentType)[keyof typeof AlignmentType] => {
  if (align === null) {
    return AlignmentType.LEFT;
  }
  switch (align) {
    case "left":
      return AlignmentType.LEFT;
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    default:
      return assertNever(align, "tableAlignmentOf");
  }
};

const borderStyleOf = (style: string): (typeof BorderStyle)[keyof typeof BorderStyle] => {
  switch (style) {
    case "none":
      return BorderStyle.NONE;
    case "dashed":
      return BorderStyle.DASHED;
    case "dotted":
      return BorderStyle.DOTTED;
    default:
      return BorderStyle.SINGLE;
  }
};

const tableBorders = (context: DocxRenderContext): ITableBordersOptions => {
  const settings = context.compiled.table;
  const visible: IBorderOptions = {
    style: borderStyleOf(settings.borderStyle),
    size: settings.borderWidth,
    color: settings.borderColor,
  };
  const hidden: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: "auto" };
  if (settings.horizontalRulesOnly) {
    return {
      top: visible,
      bottom: visible,
      left: hidden,
      right: hidden,
      insideHorizontal: visible,
      insideVertical: hidden,
    };
  }
  return {
    top: visible,
    bottom: visible,
    left: visible,
    right: visible,
    insideHorizontal: visible,
    insideVertical: visible,
  };
};

const cellParagraphs = (
  cell: IrTableCell,
  context: DocxRenderContext,
  styleId: string,
): readonly Paragraph[] => {
  const paragraphs = cell.blocks
    .filter((block) => block.kind === "paragraph")
    .map(
      (block) =>
        new Paragraph({
          style: styleId,
          alignment: alignmentOf(cell.align),
          children: [...renderInline(block.children, context)],
        }),
    );
  return paragraphs.length === 0
    ? [new Paragraph({ style: styleId, alignment: alignmentOf(cell.align), children: [] })]
    : paragraphs;
};

const renderRow = (
  row: IrTableRow,
  context: DocxRenderContext,
  columnWidths: readonly number[],
  isHeader: boolean,
  stripeFill: string | null,
): TableRow =>
  new TableRow({
    tableHeader: isHeader,
    children: row.cells.map(
      (cell, index) =>
        new TableCell({
          width: { size: columnWidths[index] ?? 0, type: WidthType.DXA },
          margins: {
            top: context.compiled.table.cellPaddingY,
            bottom: context.compiled.table.cellPaddingY,
            left: context.compiled.table.cellPaddingX,
            right: context.compiled.table.cellPaddingX,
          },
          ...(isHeader
            ? {
                shading: {
                  type: ShadingType.CLEAR,
                  fill: context.compiled.table.headerBackground,
                },
              }
            : {}),
          ...(!isHeader && stripeFill !== null
            ? { shading: { type: ShadingType.CLEAR, fill: stripeFill } }
            : {}),
          children: [
            ...cellParagraphs(
              cell,
              context,
              isHeader
                ? context.compiled.styleIds.TableHeaderText
                : context.compiled.styleIds.TableCellText,
            ),
          ],
        }),
    ),
  });

export const captionParagraph = (
  context: DocxRenderContext,
  prefix: string,
  sequenceName: string,
  text: string,
  styleId: string,
): Paragraph => {
  const children: ParagraphChild[] = [
    new TextRun({ text: `${prefix} ` }),
    new SimpleField(`SEQ ${sequenceName} ${String.fromCharCode(92)}* ARABIC`),
  ];
  if (text.length > 0) {
    children.push(new TextRun({ text: `${context.compiled.caption.separator}${text}` }));
  }
  return new Paragraph({
    style: styleId,
    alignment: alignmentOf(context.compiled.caption.align),
    children,
  });
};

export const renderTable = (
  block: Extract<IrBlock, { kind: "table" }>,
  context: DocxRenderContext,
): readonly DocxBlockElement[] => {
  const settings = context.compiled.table;
  const columnWidths = [...block.columnWidths];
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const rows: TableRow[] = [];
  if (block.header !== null) {
    rows.push(renderRow(block.header, context, columnWidths, true, null));
  }
  block.rows.forEach((row, index) => {
    const stripeFill = settings.stripes && index % 2 === 1 ? settings.stripeBackground : null;
    rows.push(renderRow(row, context, columnWidths, false, stripeFill));
  });

  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths,
    borders: tableBorders(context),
    alignment: settings.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
    rows,
  });

  if (block.caption === null) {
    return [table];
  }

  const caption = captionParagraph(
    context,
    context.compiled.caption.tablePrefix,
    TABLE_SEQUENCE_NAME,
    block.caption,
    context.compiled.styleIds.TableCaption,
  );
  return context.compiled.caption.position === "above" ? [caption, table] : [table, caption];
};
