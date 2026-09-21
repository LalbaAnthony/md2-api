import { AlignmentType, UnderlineType } from "docx";
import { pointToDxa, pointToEighth, pointToHalfPoint } from "../../../units.ts";
import type {
  ICharacterStyleOptions,
  IParagraphStyleOptions,
  IParagraphStylePropertiesOptions,
  IStylesOptions,
} from "docx";
import type { HeadingSpec, Theme } from "../../../types/theme.ts";
import type { TextAlign } from "../../../types/ir.ts";
import type {
  DocxCharacterStyleKey,
  DocxParagraphStyleKey,
  DocxStyleKey,
} from "../../../types/docx-theme.ts";

const LINE_HEIGHT_UNIT = 240;
const HORIZONTAL_RULE_SIZE = 6;

const PARAGRAPH_STYLE_KEYS: readonly DocxParagraphStyleKey[] = [
  "Normal",
  "Heading1",
  "Heading2",
  "Heading3",
  "Heading4",
  "Heading5",
  "Heading6",
  "Title",
  "Subtitle",
  "Quote",
  "QuoteAttribution",
  "CodeBlock",
  "CodeLine",
  "CodeCaption",
  "ListParagraph",
  "TaskItem",
  "Caption",
  "FigureCaption",
  "TableCaption",
  "TableCellText",
  "TableHeaderText",
  "FootnoteText",
  "Callout",
  "CalloutTitle",
  "TocHeading",
  "Toc1",
  "Toc2",
  "Toc3",
  "Toc4",
  "Toc5",
  "Toc6",
  "HeaderText",
  "FooterText",
  "HorizontalRule",
];

const CHARACTER_STYLE_KEYS: readonly DocxCharacterStyleKey[] = [
  "CodeChar",
  "Hyperlink",
  "InternalLink",
  "FootnoteRef",
  "Strong",
  "Emphasis",
  "Strike",
  "LineNumber",
  "LanguageLabel",
  "MathInline",
];

export const allStyleKeys: readonly DocxStyleKey[] = [
  ...PARAGRAPH_STYLE_KEYS,
  ...CHARACTER_STYLE_KEYS,
];

export const buildStyleIds = (prefix: string): Readonly<Record<DocxStyleKey, string>> => ({
  Normal: `${prefix}Normal`,
  Heading1: `${prefix}Heading1`,
  Heading2: `${prefix}Heading2`,
  Heading3: `${prefix}Heading3`,
  Heading4: `${prefix}Heading4`,
  Heading5: `${prefix}Heading5`,
  Heading6: `${prefix}Heading6`,
  Title: `${prefix}Title`,
  Subtitle: `${prefix}Subtitle`,
  Quote: `${prefix}Quote`,
  QuoteAttribution: `${prefix}QuoteAttribution`,
  CodeBlock: `${prefix}CodeBlock`,
  CodeLine: `${prefix}CodeLine`,
  CodeCaption: `${prefix}CodeCaption`,
  ListParagraph: `${prefix}ListParagraph`,
  TaskItem: `${prefix}TaskItem`,
  Caption: `${prefix}Caption`,
  FigureCaption: `${prefix}FigureCaption`,
  TableCaption: `${prefix}TableCaption`,
  TableCellText: `${prefix}TableCellText`,
  TableHeaderText: `${prefix}TableHeaderText`,
  FootnoteText: `${prefix}FootnoteText`,
  Callout: `${prefix}Callout`,
  CalloutTitle: `${prefix}CalloutTitle`,
  TocHeading: `${prefix}TocHeading`,
  Toc1: `${prefix}Toc1`,
  Toc2: `${prefix}Toc2`,
  Toc3: `${prefix}Toc3`,
  Toc4: `${prefix}Toc4`,
  Toc5: `${prefix}Toc5`,
  Toc6: `${prefix}Toc6`,
  HeaderText: `${prefix}HeaderText`,
  FooterText: `${prefix}FooterText`,
  HorizontalRule: `${prefix}HorizontalRule`,
  CodeChar: `${prefix}CodeChar`,
  Hyperlink: `${prefix}Hyperlink`,
  InternalLink: `${prefix}InternalLink`,
  FootnoteRef: `${prefix}FootnoteRef`,
  Strong: `${prefix}Strong`,
  Emphasis: `${prefix}Emphasis`,
  Strike: `${prefix}Strike`,
  LineNumber: `${prefix}LineNumber`,
  LanguageLabel: `${prefix}LanguageLabel`,
  MathInline: `${prefix}MathInline`,
});

const alignmentOf = (align: TextAlign): (typeof AlignmentType)[keyof typeof AlignmentType] => {
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    case "left":
      return AlignmentType.LEFT;
  }
};

const fontName = (stack: { readonly name: string }): string => stack.name;

const spacingOf = (
  lineHeight: number,
  spaceBefore: number,
  spaceAfter: number,
): IParagraphStylePropertiesOptions => ({
  spacing: {
    line: Math.round(lineHeight * LINE_HEIGHT_UNIT),
    before: spaceBefore,
    after: spaceAfter,
  },
});

const tocStyle = (
  id: string,
  name: string,
  normalId: string,
  indentLeft: number,
): IParagraphStyleOptions => ({
  id,
  name,
  basedOn: normalId,
  next: normalId,
  paragraph: {
    indent: { left: indentLeft },
    spacing: { before: 0, after: 20 },
  },
});

const headingStyle = (
  key: DocxParagraphStyleKey,
  styleIds: Readonly<Record<DocxStyleKey, string>>,
  spec: HeadingSpec,
  theme: Theme,
): IParagraphStyleOptions => ({
  id: styleIds[key],
  name: key,
  basedOn: styleIds.Normal,
  next: styleIds.Normal,
  quickFormat: true,
  run: {
    size: pointToHalfPoint(spec.size),
    bold: spec.bold,
    italics: spec.italic,
    color: spec.color,
    font: fontName(spec.font ?? theme.type.heading),
    ...(spec.transform === "smallcaps" ? { smallCaps: true } : {}),
    ...(spec.transform === "uppercase" ? { allCaps: true } : {}),
    ...(spec.letterSpacing === 0 ? {} : { characterSpacing: pointToDxa(spec.letterSpacing) }),
  },
  paragraph: {
    ...spacingOf(spec.lineHeight, pointToDxa(spec.spaceBefore), pointToDxa(spec.spaceAfter)),
    alignment: alignmentOf(spec.align),
    keepNext: spec.keepWithNext,
    keepLines: spec.keepLinesTogether,
    outlineLevel: spec.outlineLevel,
    ...(spec.ruleBelow === null
      ? {}
      : {
          border: {
            bottom: {
              style: "single",
              size: spec.ruleBelow.width,
              color: spec.ruleBelow.color,
              space: Math.round(spec.ruleBelow.space),
            },
          },
        }),
  },
});

export const compileStyles = (
  theme: Theme,
  styleIds: Readonly<Record<DocxStyleKey, string>>,
): IStylesOptions => {
  const bodySize = pointToHalfPoint(theme.type.baseSize);
  const bodyFont = fontName(theme.type.body);
  const monoFont = fontName(theme.type.mono);

  const paragraphStyles: IParagraphStyleOptions[] = [
    {
      id: styleIds.Normal,
      name: "Normal",
      quickFormat: true,
      run: { size: bodySize, font: bodyFont, color: theme.color.text },
      paragraph: {
        ...spacingOf(
          theme.paragraph.lineHeight,
          pointToDxa(theme.paragraph.spaceBefore),
          pointToDxa(theme.paragraph.spaceAfter),
        ),
        alignment: alignmentOf(theme.paragraph.align),
        ...(theme.paragraph.firstLineIndent === null
          ? {}
          : { indent: { firstLine: theme.paragraph.firstLineIndent } }),
      },
    },
    headingStyle("Heading1", styleIds, theme.heading[0], theme),
    headingStyle("Heading2", styleIds, theme.heading[1], theme),
    headingStyle("Heading3", styleIds, theme.heading[2], theme),
    headingStyle("Heading4", styleIds, theme.heading[3], theme),
    headingStyle("Heading5", styleIds, theme.heading[4], theme),
    headingStyle("Heading6", styleIds, theme.heading[5], theme),
    {
      id: styleIds.Title,
      name: "Title",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      run: {
        size: pointToHalfPoint(theme.chrome.titlePage?.titleSize ?? theme.heading[0].size),
        bold: true,
        font: fontName(theme.type.heading),
        color: theme.color.text,
      },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } },
    },
    {
      id: styleIds.Subtitle,
      name: "Subtitle",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      run: {
        size: pointToHalfPoint(theme.chrome.titlePage?.subtitleSize ?? theme.heading[1].size),
        color: theme.color.muted,
        font: fontName(theme.type.heading),
      },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 240 } },
    },
    {
      id: styleIds.Quote,
      name: "Quote",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      run: {
        italics: theme.quote.italic,
        size: pointToHalfPoint(theme.quote.fontSize),
        color: theme.color.quoteForeground,
      },
      paragraph: {
        indent: { left: theme.quote.indentLeft, right: theme.quote.indentRight },
        spacing: {
          before: pointToDxa(theme.quote.spaceBefore),
          after: pointToDxa(theme.quote.spaceAfter),
        },
        border: {
          left: {
            style: "single",
            size: theme.quote.barWidth,
            color: theme.quote.barColor,
            space: 8,
          },
        },
      },
    },
    {
      id: styleIds.QuoteAttribution,
      name: "QuoteAttribution",
      basedOn: styleIds.Quote,
      next: styleIds.Normal,
      run: { italics: true, color: theme.color.muted },
    },
    {
      id: styleIds.CodeBlock,
      name: "CodeBlock",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      run: { font: monoFont, size: pointToHalfPoint(theme.code.fontSize) },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
    {
      id: styleIds.CodeLine,
      name: "CodeLine",
      basedOn: styleIds.CodeBlock,
      next: styleIds.CodeLine,
      run: { font: monoFont, size: pointToHalfPoint(theme.code.fontSize) },
      paragraph: {
        ...spacingOf(theme.code.lineHeight, 0, 0),
        contextualSpacing: true,
      },
    },
    {
      id: styleIds.CodeCaption,
      name: "CodeCaption",
      basedOn: styleIds.Normal,
      next: styleIds.CodeLine,
      run: {
        font: monoFont,
        size: pointToHalfPoint(theme.caption.fontSize),
        color: theme.color.muted,
      },
      paragraph: { spacing: { before: 0, after: 40 } },
    },
    {
      id: styleIds.ListParagraph,
      name: "ListParagraph",
      basedOn: styleIds.Normal,
      next: styleIds.ListParagraph,
      paragraph: {
        spacing: {
          before: 0,
          after: pointToDxa(theme.list.spaceBetweenItems),
        },
        contextualSpacing: true,
      },
    },
    {
      id: styleIds.TaskItem,
      name: "TaskItem",
      basedOn: styleIds.ListParagraph,
      next: styleIds.TaskItem,
    },
    {
      id: styleIds.Caption,
      name: "Caption",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      run: {
        size: pointToHalfPoint(theme.caption.fontSize),
        italics: theme.caption.italic,
        color: theme.caption.color,
      },
      paragraph: {
        alignment: alignmentOf(theme.caption.align),
        spacing: { before: 60, after: 120 },
      },
    },
    {
      id: styleIds.FigureCaption,
      name: "FigureCaption",
      basedOn: styleIds.Caption,
      next: styleIds.Normal,
    },
    {
      id: styleIds.TableCaption,
      name: "TableCaption",
      basedOn: styleIds.Caption,
      next: styleIds.Normal,
    },
    {
      id: styleIds.TableCellText,
      name: "TableCellText",
      basedOn: styleIds.Normal,
      next: styleIds.TableCellText,
      run: { size: pointToHalfPoint(theme.table.fontSize) },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
    {
      id: styleIds.TableHeaderText,
      name: "TableHeaderText",
      basedOn: styleIds.TableCellText,
      next: styleIds.TableCellText,
      run: {
        bold: theme.table.headerBold,
        color: theme.color.tableHeaderForeground,
        size: pointToHalfPoint(theme.table.fontSize),
      },
    },
    {
      id: styleIds.FootnoteText,
      name: "FootnoteText",
      basedOn: styleIds.Normal,
      next: styleIds.FootnoteText,
      run: { size: pointToHalfPoint(theme.footnote.fontSize) },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
    {
      id: styleIds.Callout,
      name: "Callout",
      basedOn: styleIds.Normal,
      next: styleIds.Callout,
      paragraph: { spacing: { before: 0, after: 80 } },
    },
    {
      id: styleIds.CalloutTitle,
      name: "CalloutTitle",
      basedOn: styleIds.Callout,
      next: styleIds.Callout,
      run: { bold: theme.callout.titleBold },
    },
    {
      id: styleIds.TocHeading,
      name: "TocHeading",
      basedOn: styleIds.Heading1,
      next: styleIds.Normal,
    },
    tocStyle(styleIds.Toc1, "Toc1", styleIds.Normal, theme.list.indentStep * 0),
    tocStyle(styleIds.Toc2, "Toc2", styleIds.Normal, theme.list.indentStep * 1),
    tocStyle(styleIds.Toc3, "Toc3", styleIds.Normal, theme.list.indentStep * 2),
    tocStyle(styleIds.Toc4, "Toc4", styleIds.Normal, theme.list.indentStep * 3),
    tocStyle(styleIds.Toc5, "Toc5", styleIds.Normal, theme.list.indentStep * 4),
    tocStyle(styleIds.Toc6, "Toc6", styleIds.Normal, theme.list.indentStep * 5),
    {
      id: styleIds.HeaderText,
      name: "HeaderText",
      basedOn: styleIds.Normal,
      next: styleIds.HeaderText,
      run: {
        size: pointToHalfPoint(theme.chrome.header?.fontSize ?? theme.caption.fontSize),
        color: theme.chrome.header?.color ?? theme.color.muted,
      },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
    {
      id: styleIds.FooterText,
      name: "FooterText",
      basedOn: styleIds.Normal,
      next: styleIds.FooterText,
      run: {
        size: pointToHalfPoint(theme.chrome.footer?.fontSize ?? theme.caption.fontSize),
        color: theme.chrome.footer?.color ?? theme.color.muted,
      },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
    {
      id: styleIds.HorizontalRule,
      name: "HorizontalRule",
      basedOn: styleIds.Normal,
      next: styleIds.Normal,
      paragraph: {
        spacing: { before: 120, after: 120 },
        border: {
          bottom: {
            style: "single",
            size: pointToEighth(theme.type.baseSize) / HORIZONTAL_RULE_SIZE,
            color: theme.color.rule,
            space: 1,
          },
        },
      },
    },
  ];

  const characterStyles: ICharacterStyleOptions[] = [
    {
      id: styleIds.CodeChar,
      name: "CodeChar",
      run: {
        font: monoFont,
        size: pointToHalfPoint(theme.code.fontSize),
        color: theme.color.inlineCodeForeground,
        shading: { type: "clear", fill: theme.color.inlineCodeBackground },
      },
    },
    {
      id: styleIds.Hyperlink,
      name: "Hyperlink",
      run: { color: theme.color.link, underline: { type: UnderlineType.SINGLE } },
    },
    {
      id: styleIds.InternalLink,
      name: "InternalLink",
      run: { color: theme.color.link },
    },
    {
      id: styleIds.FootnoteRef,
      name: "FootnoteRef",
      run: { superScript: true, color: theme.color.accent },
    },
    { id: styleIds.Strong, name: "Strong", run: { bold: true } },
    { id: styleIds.Emphasis, name: "Emphasis", run: { italics: true } },
    { id: styleIds.Strike, name: "Strike", run: { strike: true } },
    {
      id: styleIds.LineNumber,
      name: "LineNumber",
      run: { font: monoFont, color: theme.code.lineNumberColor },
    },
    {
      id: styleIds.LanguageLabel,
      name: "LanguageLabel",
      run: { font: monoFont, color: theme.color.muted, allCaps: true },
    },
    {
      id: styleIds.MathInline,
      name: "MathInline",
      run: { font: monoFont, color: theme.color.text },
    },
  ];

  return {
    default: {
      document: {
        run: { size: bodySize, font: bodyFont, color: theme.color.text },
        paragraph: spacingOf(theme.type.leading, 0, 0),
      },
    },
    paragraphStyles,
    characterStyles,
  };
};
