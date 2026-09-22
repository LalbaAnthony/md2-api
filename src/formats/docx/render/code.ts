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
import { pointToHalfPoint } from "../../../units.ts";
import type { ITableBordersOptions, ParagraphChild } from "docx";
import type { IrBlock, IrCodeLine } from "../../../types/ir.ts";
import type { DocxRenderContext } from "../../../types/docx-render.ts";

const NON_BREAKING_SPACE = String.fromCharCode(0xa0);
const LINE_NUMBER_MINIMUM_WIDTH = 2;

const invisibleBorders: ITableBordersOptions = {
  top: { style: BorderStyle.NONE, size: 0, color: "auto" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
  left: { style: BorderStyle.NONE, size: 0, color: "auto" },
  right: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
};

const visibleBorders = (color: string, size: number): ITableBordersOptions => ({
  top: { style: BorderStyle.SINGLE, size, color },
  bottom: { style: BorderStyle.SINGLE, size, color },
  left: { style: BorderStyle.SINGLE, size, color },
  right: { style: BorderStyle.SINGLE, size, color },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
});

export const lineNumberWidth = (lineCount: number): number =>
  Math.max(String(lineCount).length, LINE_NUMBER_MINIMUM_WIDTH);

const lineNumberRun = (context: DocxRenderContext, line: number, width: number): TextRun =>
  new TextRun({
    text: `${String(line).padStart(width, NON_BREAKING_SPACE)}${NON_BREAKING_SPACE}`,
    style: context.compiled.styleIds.LineNumber,
  });

const tokenRuns = (context: DocxRenderContext, line: IrCodeLine): readonly TextRun[] =>
  line.tokens
    .filter((token) => token.text.length > 0)
    .map((token) => {
      const run = context.compiled.syntax[token.scope];
      return new TextRun({
        text: token.text,
        font: context.compiled.fonts.mono,
        color: run.color,
        bold: run.bold,
        italics: run.italics,
      });
    });

const codeLineParagraph = (
  context: DocxRenderContext,
  line: IrCodeLine,
  numberWidth: number | null,
): Paragraph => {
  const children: ParagraphChild[] = [];
  if (numberWidth !== null) {
    children.push(lineNumberRun(context, line.number, numberWidth));
  }
  children.push(...tokenRuns(context, line));
  return new Paragraph({
    style: context.compiled.styleIds.CodeLine,
    children,
  });
};

const languageLabelParagraph = (context: DocxRenderContext, language: string): Paragraph =>
  new Paragraph({
    style: context.compiled.styleIds.CodeCaption,
    children: [
      new TextRun({
        text: language,
        style: context.compiled.styleIds.LanguageLabel,
        size: pointToHalfPoint(context.compiled.code.fontSize),
      }),
    ],
  });

export const renderCode = (
  block: Extract<IrBlock, { kind: "code" }>,
  context: DocxRenderContext,
): Table => {
  const settings = context.compiled.code;
  const numberWidth = settings.showLineNumbers ? lineNumberWidth(block.lines.length) : null;

  const paragraphs: Paragraph[] = [];
  if (settings.showLanguageLabel && block.language !== null) {
    paragraphs.push(languageLabelParagraph(context, block.language));
  }
  for (const line of block.lines) {
    paragraphs.push(codeLineParagraph(context, line, numberWidth));
  }
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ style: context.compiled.styleIds.CodeLine, children: [] }));
  }

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: context.compiled.contentWidth, type: WidthType.DXA },
    columnWidths: [context.compiled.contentWidth],
    borders:
      settings.border === null
        ? invisibleBorders
        : visibleBorders(settings.border, settings.borderWidth),
    rows: [
      new TableRow({
        cantSplit: false,
        children: [
          new TableCell({
            width: { size: context.compiled.contentWidth, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: settings.background },
            margins: {
              top: settings.padding,
              bottom: settings.padding,
              left: settings.padding,
              right: settings.padding,
            },
            children: paragraphs,
          }),
        ],
      }),
    ],
  });
};
