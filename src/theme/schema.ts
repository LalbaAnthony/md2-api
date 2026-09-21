import { z } from "zod";
import { jsonObjectSchema } from "../lib/json.ts";
import { describeForbiddenCharacters } from "../lib/text.ts";
import { dxa, eighth, pt } from "../units.ts";
import type { Dxa, Eighth, Pt } from "../types/units.ts";
import {
  HEX_COLOR_PATTERN,
  MAXIMUM_LIST_LEVELS,
  MINIMUM_BULLET_GLYPHS,
  THEME_ID_PATTERN,
  THEME_VERSION_PATTERN,
} from "./constants.ts";

const forbiddenCharacters = (value: string, context: z.RefinementCtx): void => {
  const explanation = describeForbiddenCharacters(value);
  if (explanation !== null) {
    context.addIssue({ code: "custom", message: explanation });
  }
};

const safeText = z.string().superRefine(forbiddenCharacters);
const safeGlyph = z.string().min(1).superRefine(forbiddenCharacters);

const hexColor = z.string().regex(HEX_COLOR_PATTERN, "Expected six hexadecimal digits, no hash.");

const pointCodec = (input: z.ZodNumber) =>
  z.codec(input, z.custom<Pt>(), {
    decode: (value) => pt(value),
    encode: (value) => value,
  });

const twipCodec = (input: z.ZodNumber) =>
  z.codec(input, z.custom<Dxa>(), {
    decode: (value) => dxa(value),
    encode: (value) => value,
  });

const point = pointCodec(z.number());
const nonNegativePoint = pointCodec(z.number().min(0));
const positivePoint = pointCodec(z.number().positive());
const twip = twipCodec(z.number().int());
const nonNegativeTwip = twipCodec(z.number().int().min(0));
const positiveTwip = twipCodec(z.number().int().positive());
const eighthOfPoint = z.codec(z.number().int().min(0), z.custom<Eighth>(), {
  decode: (value) => eighth(value),
  encode: (value) => value,
});

const textAlign = z.enum(["left", "center", "right", "justify"]);
const horizontalAlign = z.enum(["left", "center"]);

const fontStack = z
  .strictObject({
    name: safeText.min(1),
    fallback: z.array(safeText.min(1)).readonly(),
  })
  .readonly();

const ruleSpec = z
  .strictObject({
    width: eighthOfPoint,
    color: hexColor,
    space: nonNegativePoint,
  })
  .readonly();

const headingSpec = z
  .strictObject({
    size: positivePoint,
    bold: z.boolean(),
    italic: z.boolean(),
    color: hexColor,
    font: fontStack.nullable(),
    transform: z.enum(["none", "uppercase", "smallcaps"]),
    letterSpacing: point,
    spaceBefore: nonNegativePoint,
    spaceAfter: nonNegativePoint,
    lineHeight: z.number().positive(),
    keepWithNext: z.boolean(),
    keepLinesTogether: z.boolean(),
    pageBreakBefore: z.boolean(),
    outlineLevel: z.number().int().min(0).max(8),
    ruleBelow: ruleSpec.nullable(),
    numbered: z.boolean(),
    align: textAlign,
  })
  .readonly();

const chromeSlot = z
  .discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("text"), value: safeText }),
    z.strictObject({
      kind: z.literal("meta"),
      field: z.enum(["title", "author", "date", "subject"]),
    }),
    z.strictObject({ kind: z.literal("pageNumber") }),
    z.strictObject({ kind: z.literal("pageCount") }),
    z.strictObject({ kind: z.literal("chapter") }),
    z.strictObject({ kind: z.literal("empty") }),
  ])
  .readonly();

const chromeSpec = z
  .strictObject({
    enabled: z.boolean(),
    slots: z.tuple([chromeSlot, chromeSlot, chromeSlot]).readonly(),
    fontSize: positivePoint,
    color: hexColor,
    rule: z.strictObject({ width: eighthOfPoint, color: hexColor }).readonly().nullable(),
    differentFirstPage: z.boolean(),
    differentOddEven: z.boolean(),
  })
  .readonly();

const titlePageSpec = z
  .strictObject({
    enabled: z.boolean(),
    verticalAlign: z.enum(["top", "center"]),
    titleSize: positivePoint,
    subtitleSize: positivePoint,
    showAuthor: z.boolean(),
    showDate: z.boolean(),
    dateFormat: safeText,
    pageBreakAfter: z.boolean(),
    logo: z
      .strictObject({ path: safeText.min(1), width: positivePoint })
      .readonly()
      .nullable(),
  })
  .readonly();

const pageSpec = z
  .strictObject({
    size: z.strictObject({ width: positiveTwip, height: positiveTwip }).readonly(),
    orientation: z.enum(["portrait", "landscape"]),
    margin: z
      .strictObject({
        top: nonNegativeTwip,
        right: nonNegativeTwip,
        bottom: nonNegativeTwip,
        left: nonNegativeTwip,
        header: nonNegativeTwip,
        footer: nonNegativeTwip,
        gutter: nonNegativeTwip,
      })
      .readonly(),
    columns: z
      .strictObject({
        count: z.number().int().min(1).max(4),
        space: nonNegativeTwip,
        separator: z.boolean(),
      })
      .readonly()
      .nullable(),
  })
  .readonly();

const typeSpec = z
  .strictObject({
    body: fontStack,
    heading: fontStack,
    mono: fontStack,
    baseSize: positivePoint,
    scale: z.number().positive(),
    leading: z.number().positive(),
    hyphenation: z.boolean(),
  })
  .readonly();

const calloutColors = z
  .strictObject({
    info: hexColor,
    warning: hexColor,
    danger: hexColor,
    success: hexColor,
    note: hexColor,
  })
  .readonly();

const colorSpec = z
  .strictObject({
    text: hexColor,
    muted: hexColor,
    accent: hexColor,
    link: hexColor,
    linkVisited: hexColor,
    rule: hexColor,
    codeBackground: hexColor,
    codeForeground: hexColor,
    codeBorder: hexColor.nullable(),
    inlineCodeBackground: hexColor,
    inlineCodeForeground: hexColor,
    quoteBar: hexColor,
    quoteForeground: hexColor,
    quoteBackground: hexColor.nullable(),
    tableHeaderBackground: hexColor,
    tableHeaderForeground: hexColor,
    tableStripe: hexColor.nullable(),
    tableBorder: hexColor,
    callout: calloutColors,
  })
  .readonly();

const paragraphSpec = z
  .strictObject({
    align: textAlign,
    spaceBefore: nonNegativePoint,
    spaceAfter: nonNegativePoint,
    lineHeight: z.number().positive(),
    firstLineIndent: twip.nullable(),
    widowControl: z.boolean(),
  })
  .readonly();

const quoteSpec = z
  .strictObject({
    indentLeft: nonNegativeTwip,
    indentRight: nonNegativeTwip,
    barWidth: eighthOfPoint,
    barColor: hexColor,
    italic: z.boolean(),
    fontSize: positivePoint,
    spaceBefore: nonNegativePoint,
    spaceAfter: nonNegativePoint,
    padding: nonNegativeTwip,
  })
  .readonly();

const codeSpec = z
  .strictObject({
    fontSize: positivePoint,
    lineHeight: z.number().positive(),
    padding: nonNegativeTwip,
    showLineNumbers: z.boolean(),
    lineNumberColor: hexColor,
    showLanguageLabel: z.boolean(),
    wrap: z.boolean(),
    tabWidth: z.number().int().min(1).max(16),
  })
  .readonly();

const listSpec = z
  .strictObject({
    bulletGlyphs: z.array(safeGlyph).min(MINIMUM_BULLET_GLYPHS).readonly(),
    orderedFormats: z
      .array(z.enum(["decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman"]))
      .min(1)
      .max(MAXIMUM_LIST_LEVELS)
      .readonly(),
    orderedSuffix: z.union([z.literal("."), z.literal(")"), z.literal("")]),
    indentStep: positiveTwip,
    hanging: nonNegativeTwip,
    spaceBetweenItems: nonNegativePoint,
    spaceAfterList: nonNegativePoint,
    taskGlyphs: z.strictObject({ checked: safeGlyph, unchecked: safeGlyph }).readonly(),
  })
  .readonly();

const tableSpec = z
  .strictObject({
    headerBold: z.boolean(),
    repeatHeaderRow: z.boolean(),
    cellPaddingX: nonNegativeTwip,
    cellPaddingY: nonNegativeTwip,
    borderWidth: eighthOfPoint,
    borderStyle: z.enum(["single", "none", "dashed", "dotted"]),
    horizontalRulesOnly: z.boolean(),
    stripes: z.boolean(),
    fontSize: positivePoint,
    align: horizontalAlign,
    minColumnWidth: positiveTwip,
  })
  .readonly();

const figureSpec = z
  .strictObject({
    align: horizontalAlign,
    maxWidthRatio: z.number().gt(0).max(1),
    spaceBefore: nonNegativePoint,
    spaceAfter: nonNegativePoint,
    border: z.strictObject({ width: eighthOfPoint, color: hexColor }).readonly().nullable(),
  })
  .readonly();

const captionSpec = z
  .strictObject({
    position: z.enum(["above", "below"]),
    figurePrefix: safeText,
    tablePrefix: safeText,
    separator: safeText,
    fontSize: positivePoint,
    italic: z.boolean(),
    color: hexColor,
    align: textAlign,
  })
  .readonly();

const calloutSpec = z
  .strictObject({
    padding: nonNegativeTwip,
    barWidth: eighthOfPoint,
    showLabel: z.boolean(),
    labels: z
      .strictObject({
        info: safeGlyph,
        warning: safeGlyph,
        danger: safeGlyph,
        success: safeGlyph,
        note: safeGlyph,
      })
      .readonly(),
    titleBold: z.boolean(),
    tintedBackground: z.boolean(),
  })
  .readonly();

const footnoteSpec = z
  .strictObject({
    fontSize: positivePoint,
    separatorWidth: eighthOfPoint,
    numberFormat: z.enum(["decimal", "lowerRoman", "symbol"]),
  })
  .readonly();

const tableOfContentsSpec = z
  .strictObject({
    enabled: z.boolean(),
    title: safeText,
    depth: z.number().int().min(1).max(6),
    hyperlinks: z.boolean(),
    showPageNumbers: z.boolean(),
    tabLeader: z.enum(["dot", "hyphen", "none"]),
    pageBreakAfter: z.boolean(),
  })
  .readonly();

const chromeGroupSpec = z
  .strictObject({
    header: chromeSpec.nullable(),
    footer: chromeSpec.nullable(),
    titlePage: titlePageSpec.nullable(),
  })
  .readonly();

const syntaxStyle = z
  .strictObject({
    foreground: hexColor,
    bold: z.boolean(),
    italic: z.boolean(),
  })
  .readonly();

const syntaxSpec = z
  .strictObject({
    keyword: syntaxStyle,
    string: syntaxStyle,
    number: syntaxStyle,
    comment: syntaxStyle,
    function: syntaxStyle,
    type: syntaxStyle,
    variable: syntaxStyle,
    operator: syntaxStyle,
    punctuation: syntaxStyle,
    constant: syntaxStyle,
    tag: syntaxStyle,
    attribute: syntaxStyle,
    plain: syntaxStyle,
  })
  .readonly();

export const themeSchema = z
  .strictObject({
    id: z.string().regex(THEME_ID_PATTERN, "Expected a lowercase kebab-case identifier."),
    label: safeText.min(1),
    description: safeText.nullable(),
    version: z.string().regex(THEME_VERSION_PATTERN, "Expected a semantic version."),
    page: pageSpec,
    type: typeSpec,
    color: colorSpec,
    heading: z
      .tuple([headingSpec, headingSpec, headingSpec, headingSpec, headingSpec, headingSpec])
      .readonly(),
    paragraph: paragraphSpec,
    quote: quoteSpec,
    code: codeSpec,
    list: listSpec,
    table: tableSpec,
    figure: figureSpec,
    caption: captionSpec,
    callout: calloutSpec,
    footnote: footnoteSpec,
    tableOfContents: tableOfContentsSpec,
    chrome: chromeGroupSpec,
    syntax: syntaxSpec,
    formats: z.record(z.string(), jsonObjectSchema).readonly(),
  })
  .readonly();
