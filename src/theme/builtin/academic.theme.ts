import { dxa, eighth, millimeter, millimeterToDxa, pt } from "../../units.ts";
import { A4_HEIGHT, A4_WIDTH, CHROME_MARGIN, MARGIN_WIDE } from "../constants.ts";
import { defaultTheme } from "./default.theme.ts";
import type { HeadingSpec, Theme } from "../../types/theme.ts";

const SERIF = { name: "Cambria", fallback: ["Caladea", "Liberation Serif", "serif"] };
const MONO = { name: "Consolas", fallback: ["Liberation Mono", "DejaVu Sans Mono", "monospace"] };

const INK = "111111";
const MUTED = "555555";
const RULE = "AAAAAA";

const heading = (size: number, spaceBefore: number, outlineLevel: number): HeadingSpec => ({
  size: pt(size),
  bold: true,
  italic: false,
  color: INK,
  font: SERIF,
  transform: "none",
  letterSpacing: pt(0),
  spaceBefore: pt(spaceBefore),
  spaceAfter: pt(6),
  lineHeight: 1.3,
  keepWithNext: true,
  keepLinesTogether: true,
  pageBreakBefore: false,
  outlineLevel,
  ruleBelow: null,
  numbered: true,
  align: "left",
});

export const academicTheme: Theme = {
  ...defaultTheme,
  id: "academic",
  label: "Academic",
  description:
    "Serif body at twelve points, double leading, justified text, numbered headings and footnotes.",
  version: "1.0.0",

  page: {
    size: { width: A4_WIDTH, height: A4_HEIGHT },
    orientation: "portrait",
    margin: {
      top: MARGIN_WIDE,
      right: MARGIN_WIDE,
      bottom: MARGIN_WIDE,
      left: MARGIN_WIDE,
      header: CHROME_MARGIN,
      footer: CHROME_MARGIN,
      gutter: dxa(0),
    },
    columns: null,
  },

  type: {
    body: SERIF,
    heading: SERIF,
    mono: MONO,
    baseSize: pt(12),
    scale: 1.15,
    leading: 2,
    hyphenation: true,
  },

  color: {
    ...defaultTheme.color,
    text: INK,
    muted: MUTED,
    accent: "3B3B6D",
    link: "3B3B6D",
    rule: RULE,
    tableStripe: null,
    tableHeaderBackground: "FFFFFF",
    tableBorder: RULE,
  },

  heading: [
    heading(16, 18, 0),
    heading(14, 14, 1),
    heading(12.5, 12, 2),
    heading(12, 10, 3),
    heading(12, 9, 4),
    heading(12, 8, 5),
  ],

  paragraph: {
    align: "justify",
    spaceBefore: pt(0),
    spaceAfter: pt(0),
    lineHeight: 2,
    firstLineIndent: millimeterToDxa(millimeter(8)),
    widowControl: true,
  },

  quote: {
    ...defaultTheme.quote,
    italic: true,
    fontSize: pt(11),
    indentLeft: millimeterToDxa(millimeter(12)),
    indentRight: millimeterToDxa(millimeter(12)),
    barWidth: eighth(0),
    barColor: RULE,
  },

  table: {
    ...defaultTheme.table,
    horizontalRulesOnly: true,
    stripes: false,
    fontSize: pt(11),
    align: "center",
  },

  footnote: {
    fontSize: pt(10),
    separatorWidth: eighth(4),
    numberFormat: "decimal",
  },

  tableOfContents: {
    enabled: true,
    title: "Table of contents",
    depth: 3,
    hyperlinks: true,
    showPageNumbers: true,
    tabLeader: "dot",
    pageBreakAfter: true,
  },

  chrome: {
    header: null,
    footer: {
      enabled: true,
      slots: [{ kind: "empty" }, { kind: "pageNumber" }, { kind: "empty" }],
      fontSize: pt(10),
      color: MUTED,
      rule: null,
      differentFirstPage: false,
      differentOddEven: false,
    },
    titlePage: null,
  },

  caption: {
    ...defaultTheme.caption,
    fontSize: pt(10),
    italic: true,
    color: MUTED,
  },
};
