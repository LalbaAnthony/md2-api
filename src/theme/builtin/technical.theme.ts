import { dxa, eighth, millimeter, millimeterToDxa, pt } from "../../units.ts";
import { A4_HEIGHT, A4_WIDTH, CHROME_MARGIN, MARGIN_NARROW } from "../constants.ts";
import { defaultTheme } from "./default.theme.ts";
import type { HeadingSpec, Theme } from "../../types/theme.ts";

const SANS = { name: "Segoe UI", fallback: ["Open Sans", "Liberation Sans", "sans-serif"] };
const MONO = { name: "Cascadia Mono", fallback: ["Consolas", "Liberation Mono", "monospace"] };

const INK = "1B1B1B";
const MUTED = "6A737D";
const ACCENT = "0A6E5C";
const RULE = "DCE0E4";

const heading = (size: number, spaceBefore: number, outlineLevel: number): HeadingSpec => ({
  size: pt(size),
  bold: true,
  italic: false,
  color: outlineLevel < 2 ? ACCENT : INK,
  font: SANS,
  transform: "none",
  letterSpacing: pt(0),
  spaceBefore: pt(spaceBefore),
  spaceAfter: pt(4),
  lineHeight: 1.15,
  keepWithNext: true,
  keepLinesTogether: true,
  pageBreakBefore: false,
  outlineLevel,
  ruleBelow: null,
  numbered: false,
  align: "left",
});

export const technicalTheme: Theme = {
  ...defaultTheme,
  id: "technical",
  label: "Technical",
  description:
    "Dense ten point body, narrow margins, numbered code blocks with a language label, coloured callouts.",
  version: "1.0.0",

  page: {
    size: { width: A4_WIDTH, height: A4_HEIGHT },
    orientation: "portrait",
    margin: {
      top: MARGIN_NARROW,
      right: MARGIN_NARROW,
      bottom: MARGIN_NARROW,
      left: MARGIN_NARROW,
      header: CHROME_MARGIN,
      footer: CHROME_MARGIN,
      gutter: dxa(0),
    },
    columns: null,
  },

  type: {
    body: SANS,
    heading: SANS,
    mono: MONO,
    baseSize: pt(10),
    scale: 1.15,
    leading: 1.1,
    hyphenation: false,
  },

  color: {
    ...defaultTheme.color,
    text: INK,
    muted: MUTED,
    accent: ACCENT,
    link: ACCENT,
    rule: RULE,
    codeBackground: "F2F4F6",
    codeForeground: INK,
    codeBorder: "D6DBE0",
    inlineCodeBackground: "EEF1F4",
    inlineCodeForeground: "8A3324",
    tableHeaderBackground: "EDF1F3",
    tableHeaderForeground: INK,
    tableStripe: "F7F9FA",
    tableBorder: RULE,
  },

  heading: [
    heading(15, 14, 0),
    heading(13, 12, 1),
    heading(11.5, 10, 2),
    heading(10.5, 8, 3),
    heading(10, 7, 4),
    heading(10, 6, 5),
  ],

  paragraph: {
    align: "left",
    spaceBefore: pt(0),
    spaceAfter: pt(5),
    lineHeight: 1.1,
    firstLineIndent: null,
    widowControl: true,
  },

  code: {
    fontSize: pt(8.5),
    lineHeight: 1.15,
    padding: millimeterToDxa(millimeter(2)),
    showLineNumbers: true,
    lineNumberColor: MUTED,
    showLanguageLabel: true,
    wrap: false,
    tabWidth: 2,
  },

  list: {
    ...defaultTheme.list,
    indentStep: millimeterToDxa(millimeter(5)),
    hanging: millimeterToDxa(millimeter(4)),
    spaceBetweenItems: pt(1),
    spaceAfterList: pt(5),
  },

  table: {
    ...defaultTheme.table,
    cellPaddingX: millimeterToDxa(millimeter(1.5)),
    cellPaddingY: dxa(20),
    fontSize: pt(9),
    stripes: true,
    borderWidth: eighth(2),
    minColumnWidth: millimeterToDxa(millimeter(10)),
  },

  callout: {
    ...defaultTheme.callout,
    tintedBackground: true,
    showLabel: true,
    barWidth: eighth(32),
    padding: millimeterToDxa(millimeter(2.5)),
  },

  chrome: {
    header: null,
    footer: {
      enabled: true,
      slots: [{ kind: "meta", field: "title" }, { kind: "empty" }, { kind: "pageNumber" }],
      fontSize: pt(8),
      color: MUTED,
      rule: { width: eighth(2), color: RULE },
      differentFirstPage: false,
      differentOddEven: false,
    },
    titlePage: null,
  },

  tableOfContents: {
    ...defaultTheme.tableOfContents,
    enabled: false,
  },
};
