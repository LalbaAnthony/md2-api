import { dxa, eighth, millimeter, millimeterToDxa, pt } from "../../units.ts";
import { A4_HEIGHT, A4_WIDTH, CHROME_MARGIN, MARGIN_NORMAL } from "../constants.ts";
import type { HeadingSpec, Theme } from "../../types/theme.ts";

const BODY_FONT = { name: "Calibri", fallback: ["Carlito", "Liberation Sans", "sans-serif"] };
const HEADING_FONT = { name: "Calibri", fallback: ["Carlito", "Liberation Sans", "sans-serif"] };
const MONO_FONT = {
  name: "Consolas",
  fallback: ["Liberation Mono", "DejaVu Sans Mono", "monospace"],
};

const INK = "1A1A1A";
const MUTED = "6B6B6B";
const ACCENT = "2F5D8C";
const RULE = "D5D5D5";

const heading = (
  size: number,
  spaceBefore: number,
  spaceAfter: number,
  outlineLevel: number,
): HeadingSpec => ({
  size: pt(size),
  bold: true,
  italic: false,
  color: INK,
  font: HEADING_FONT,
  transform: "none",
  letterSpacing: pt(0),
  spaceBefore: pt(spaceBefore),
  spaceAfter: pt(spaceAfter),
  lineHeight: 1.2,
  keepWithNext: true,
  keepLinesTogether: true,
  pageBreakBefore: false,
  outlineLevel,
  ruleBelow: null,
  numbered: false,
  align: "left",
});

export const defaultTheme: Theme = {
  id: "default",
  label: "Default",
  description: "Sober A4 layout, 11 pt sans serif body, no title page and no table of contents.",
  version: "1.0.0",

  page: {
    size: { width: A4_WIDTH, height: A4_HEIGHT },
    orientation: "portrait",
    margin: {
      top: MARGIN_NORMAL,
      right: MARGIN_NORMAL,
      bottom: MARGIN_NORMAL,
      left: MARGIN_NORMAL,
      header: CHROME_MARGIN,
      footer: CHROME_MARGIN,
      gutter: dxa(0),
    },
    columns: null,
  },

  type: {
    body: BODY_FONT,
    heading: HEADING_FONT,
    mono: MONO_FONT,
    baseSize: pt(11),
    scale: 1.2,
    leading: 1.15,
    hyphenation: false,
  },

  color: {
    text: INK,
    muted: MUTED,
    accent: ACCENT,
    link: ACCENT,
    linkVisited: "6B4E8C",
    rule: RULE,
    codeBackground: "F5F5F5",
    codeForeground: "1A1A1A",
    codeBorder: "E0E0E0",
    inlineCodeBackground: "F0F0F0",
    inlineCodeForeground: "9C2C2C",
    quoteBar: "C8C8C8",
    quoteForeground: "4A4A4A",
    quoteBackground: null,
    tableHeaderBackground: "EFEFEF",
    tableHeaderForeground: "1A1A1A",
    tableStripe: null,
    tableBorder: "CFCFCF",
    callout: {
      info: "2F5D8C",
      warning: "9A6A00",
      danger: "9C2C2C",
      success: "2E6B3E",
      note: "5A5A5A",
    },
  },

  heading: [
    heading(20, 18, 8, 0),
    heading(16, 14, 6, 1),
    heading(13, 12, 5, 2),
    heading(11.5, 10, 4, 3),
    heading(11, 9, 4, 4),
    heading(10.5, 8, 4, 5),
  ],

  paragraph: {
    align: "left",
    spaceBefore: pt(0),
    spaceAfter: pt(8),
    lineHeight: 1.15,
    firstLineIndent: null,
    widowControl: true,
  },

  quote: {
    indentLeft: millimeterToDxa(millimeter(8)),
    indentRight: dxa(0),
    barWidth: eighth(24),
    barColor: "C8C8C8",
    italic: false,
    fontSize: pt(11),
    spaceBefore: pt(8),
    spaceAfter: pt(8),
    padding: millimeterToDxa(millimeter(3)),
  },

  code: {
    fontSize: pt(9.5),
    lineHeight: 1.25,
    padding: millimeterToDxa(millimeter(3)),
    showLineNumbers: false,
    lineNumberColor: MUTED,
    showLanguageLabel: false,
    wrap: false,
    tabWidth: 4,
  },

  list: {
    bulletGlyphs: ["-", "-", "-"],
    orderedFormats: ["decimal", "lowerLetter", "lowerRoman"],
    orderedSuffix: ".",
    indentStep: millimeterToDxa(millimeter(7)),
    hanging: millimeterToDxa(millimeter(5)),
    spaceBetweenItems: pt(2),
    spaceAfterList: pt(8),
    taskGlyphs: { checked: "[x]", unchecked: "[ ]" },
  },

  table: {
    headerBold: true,
    repeatHeaderRow: true,
    cellPaddingX: millimeterToDxa(millimeter(2)),
    cellPaddingY: millimeterToDxa(millimeter(1)),
    borderWidth: eighth(4),
    borderStyle: "single",
    horizontalRulesOnly: false,
    stripes: false,
    fontSize: pt(10),
    align: "left",
    minColumnWidth: millimeterToDxa(millimeter(12)),
  },

  figure: {
    align: "center",
    maxWidthRatio: 1,
    spaceBefore: pt(8),
    spaceAfter: pt(8),
    border: null,
  },

  caption: {
    position: "below",
    figurePrefix: "Figure",
    tablePrefix: "Table",
    separator: ". ",
    fontSize: pt(9),
    italic: true,
    color: MUTED,
    align: "center",
  },

  callout: {
    padding: millimeterToDxa(millimeter(3)),
    barWidth: eighth(24),
    showLabel: true,
    labels: {
      info: "Note",
      warning: "Warning",
      danger: "Caution",
      success: "Success",
      note: "Remark",
    },
    titleBold: true,
    tintedBackground: true,
  },

  footnote: {
    fontSize: pt(9),
    separatorWidth: eighth(4),
    numberFormat: "decimal",
  },

  tableOfContents: {
    enabled: false,
    title: "Contents",
    depth: 3,
    hyperlinks: true,
    showPageNumbers: true,
    tabLeader: "dot",
    pageBreakAfter: true,
  },

  chrome: {
    header: null,
    footer: null,
    titlePage: null,
  },

  syntax: {
    keyword: { foreground: "8250DF", bold: false, italic: false },
    string: { foreground: "0A7B34", bold: false, italic: false },
    number: { foreground: "0550AE", bold: false, italic: false },
    comment: { foreground: "6E7781", bold: false, italic: true },
    function: { foreground: "8250DF", bold: false, italic: false },
    type: { foreground: "953800", bold: false, italic: false },
    variable: { foreground: "1A1A1A", bold: false, italic: false },
    operator: { foreground: "0550AE", bold: false, italic: false },
    punctuation: { foreground: "57606A", bold: false, italic: false },
    constant: { foreground: "0550AE", bold: false, italic: false },
    tag: { foreground: "116329", bold: false, italic: false },
    attribute: { foreground: "0550AE", bold: false, italic: false },
    plain: { foreground: "1A1A1A", bold: false, italic: false },
  },

  formats: {},
};
