import { dxa, eighth, millimeter, millimeterToDxa, pt } from "../../units.ts";
import { A4_HEIGHT, A4_WIDTH, CHROME_MARGIN, MARGIN_NORMAL } from "../constants.ts";
import { defaultTheme } from "./default.theme.ts";
import type { HeadingSpec, Theme } from "../../types/theme.ts";

const HEADING_FONT = { name: "Calibri", fallback: ["Carlito", "Liberation Sans", "sans-serif"] };

const INK = "1F2933";
const ACCENT = "1B4F72";
const MUTED = "5F6B7A";
const RULE = "C8D2DC";

const heading = (
  size: number,
  spaceBefore: number,
  spaceAfter: number,
  outlineLevel: number,
  withRule: boolean,
): HeadingSpec => ({
  size: pt(size),
  bold: true,
  italic: false,
  color: ACCENT,
  font: HEADING_FONT,
  transform: outlineLevel === 0 ? "uppercase" : "none",
  letterSpacing: outlineLevel === 0 ? pt(0.4) : pt(0),
  spaceBefore: pt(spaceBefore),
  spaceAfter: pt(spaceAfter),
  lineHeight: 1.2,
  keepWithNext: true,
  keepLinesTogether: true,
  pageBreakBefore: outlineLevel === 0,
  outlineLevel,
  ruleBelow: withRule ? { width: eighth(6), color: RULE, space: pt(3) } : null,
  numbered: false,
  align: "left",
});

export const corporateTheme: Theme = {
  ...defaultTheme,
  id: "corporate",
  label: "Corporate",
  description:
    "Title page, running header and footer, accented headings with a rule, striped tables.",
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
    ...defaultTheme.type,
    heading: HEADING_FONT,
    baseSize: pt(11),
    leading: 1.2,
  },

  color: {
    ...defaultTheme.color,
    text: INK,
    muted: MUTED,
    accent: ACCENT,
    link: ACCENT,
    rule: RULE,
    tableHeaderBackground: ACCENT,
    tableHeaderForeground: "FFFFFF",
    tableStripe: "EEF3F8",
    tableBorder: RULE,
  },

  heading: [
    heading(20, 0, 10, 0, true),
    heading(15, 16, 6, 1, true),
    heading(12.5, 12, 5, 2, false),
    heading(11.5, 10, 4, 3, false),
    heading(11, 9, 4, 4, false),
    heading(10.5, 8, 4, 5, false),
  ],

  table: {
    ...defaultTheme.table,
    stripes: true,
    headerBold: true,
    repeatHeaderRow: true,
  },

  tableOfContents: {
    enabled: true,
    title: "Contents",
    depth: 3,
    hyperlinks: true,
    showPageNumbers: true,
    tabLeader: "dot",
    pageBreakAfter: true,
  },

  chrome: {
    header: {
      enabled: true,
      slots: [{ kind: "meta", field: "title" }, { kind: "empty" }, { kind: "chapter" }],
      fontSize: pt(9),
      color: MUTED,
      rule: { width: eighth(4), color: RULE },
      differentFirstPage: true,
      differentOddEven: false,
    },
    footer: {
      enabled: true,
      slots: [{ kind: "meta", field: "date" }, { kind: "empty" }, { kind: "pageNumber" }],
      fontSize: pt(9),
      color: MUTED,
      rule: null,
      differentFirstPage: true,
      differentOddEven: false,
    },
    titlePage: {
      enabled: true,
      verticalAlign: "center",
      titleSize: pt(30),
      subtitleSize: pt(16),
      showAuthor: true,
      showDate: true,
      dateFormat: "yyyy-MM-dd",
      pageBreakAfter: true,
      logo: null,
    },
  },

  quote: {
    ...defaultTheme.quote,
    barColor: ACCENT,
    indentLeft: millimeterToDxa(millimeter(10)),
  },

  caption: {
    ...defaultTheme.caption,
    color: MUTED,
  },
};
