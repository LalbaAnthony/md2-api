import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  PageNumber,
  Paragraph,
  SimpleField,
  TabStopType,
  TextRun,
} from "docx";
import { assertNever } from "../../../errors.ts";
import type { ParagraphChild, TabStopDefinition } from "docx";
import type { DocumentMeta } from "../../../types/ir.ts";
import type {
  DocxChromeSlot,
  DocxChromeSpec,
  DocxCompiledTheme,
} from "../../../types/docx-theme.ts";

const TAB_RUN = new TextRun({ children: [] });
const HEADING_ONE_STYLE_NAME = "Heading 1";

const metaValue = (meta: DocumentMeta, field: DocxChromeSlot["field"]): string => {
  switch (field) {
    case "title":
      return meta.title ?? "";
    case "author":
      return meta.authors.join(", ");
    case "date":
      return meta.date ?? "";
    case "subject":
      return meta.subject ?? "";
    default:
      return "";
  }
};

export const slotChildren = (
  slot: DocxChromeSlot,
  meta: DocumentMeta,
  styleReferenceName: string,
): readonly ParagraphChild[] => {
  switch (slot.kind) {
    case "text":
      return [new TextRun({ text: slot.value })];
    case "meta":
      return [new TextRun({ text: metaValue(meta, slot.field) })];
    case "pageNumber":
      return [new TextRun({ children: [PageNumber.CURRENT] })];
    case "pageCount":
      return [new TextRun({ children: [PageNumber.TOTAL_PAGES] })];
    case "chapter":
      return [
        new SimpleField(`STYLEREF "${styleReferenceName}" ${String.fromCharCode(92)}* MERGEFORMAT`),
      ];
    case "empty":
      return [];
    default:
      return assertNever(slot, "slotChildren");
  }
};

export const chromeTabStops = (contentWidth: number): readonly TabStopDefinition[] => [
  { type: TabStopType.CENTER, position: Math.round(contentWidth / 2) },
  { type: TabStopType.RIGHT, position: contentWidth },
];

export const chromeParagraph = (
  spec: DocxChromeSpec,
  meta: DocumentMeta,
  compiled: DocxCompiledTheme,
  styleId: string,
): Paragraph => {
  const [left, centre, right] = spec.slots;
  const children: ParagraphChild[] = [
    ...slotChildren(left, meta, HEADING_ONE_STYLE_NAME),
    TAB_RUN,
    ...slotChildren(centre, meta, HEADING_ONE_STYLE_NAME),
    TAB_RUN,
    ...slotChildren(right, meta, HEADING_ONE_STYLE_NAME),
  ];

  return new Paragraph({
    style: styleId,
    tabStops: [...chromeTabStops(compiled.contentWidth)],
    alignment: AlignmentType.LEFT,
    ...(spec.rule === null
      ? {}
      : {
          border: {
            bottom: { style: BorderStyle.SINGLE, size: spec.rule.width, color: spec.rule.color },
          },
        }),
    children,
  });
};

export const buildHeader = (compiled: DocxCompiledTheme, meta: DocumentMeta): Header | null => {
  const spec = compiled.chrome.header;
  if (spec === null || !spec.enabled) {
    return null;
  }
  return new Header({
    children: [chromeParagraph(spec, meta, compiled, compiled.styleIds.HeaderText)],
  });
};

export const buildFooter = (compiled: DocxCompiledTheme, meta: DocumentMeta): Footer | null => {
  const spec = compiled.chrome.footer;
  if (spec === null || !spec.enabled) {
    return null;
  }
  return new Footer({
    children: [chromeParagraph(spec, meta, compiled, compiled.styleIds.FooterText)],
  });
};

export const buildTitlePage = (
  compiled: DocxCompiledTheme,
  meta: DocumentMeta,
): readonly Paragraph[] => {
  const spec = compiled.chrome.titlePage;
  if (spec === null) {
    return [];
  }

  const paragraphs: Paragraph[] = [];
  if (meta.title !== undefined) {
    paragraphs.push(
      new Paragraph({
        style: compiled.styleIds.Title,
        children: [new TextRun({ text: meta.title })],
      }),
    );
  }
  if (meta.subtitle !== undefined) {
    paragraphs.push(
      new Paragraph({
        style: compiled.styleIds.Subtitle,
        children: [new TextRun({ text: meta.subtitle })],
      }),
    );
  }
  if (spec.showAuthor && meta.authors.length > 0) {
    paragraphs.push(
      new Paragraph({
        style: compiled.styleIds.Subtitle,
        children: [new TextRun({ text: meta.authors.join(", ") })],
      }),
    );
  }
  if (spec.showDate && meta.date !== undefined) {
    paragraphs.push(
      new Paragraph({
        style: compiled.styleIds.Subtitle,
        children: [new TextRun({ text: meta.date })],
      }),
    );
  }
  return paragraphs;
};

export const buildTableOfContentsHeading = (compiled: DocxCompiledTheme): Paragraph =>
  new Paragraph({
    style: compiled.styleIds.TocHeading,
    children: [new TextRun({ text: compiled.tableOfContents.title })],
  });
