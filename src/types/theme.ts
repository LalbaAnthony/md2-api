import type { Dxa, Eighth, Pt } from "./units.ts";
import type { CalloutKind, SyntaxScope, TextAlign } from "./ir.ts";
import type { JsonObject } from "./json.ts";

export type HexColor = string;
export type FontStack = { readonly name: string; readonly fallback: readonly string[] };
export type TextTransform = "none" | "uppercase" | "smallcaps";
export type BorderStyle = "single" | "none" | "dashed" | "dotted";
export type OrderedListFormat =
  "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman";

export interface RuleSpec {
  readonly width: Eighth;
  readonly color: HexColor;
  readonly space: Pt;
}

export interface HeadingSpec {
  readonly size: Pt;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly color: HexColor;
  readonly font: FontStack | null;
  readonly transform: TextTransform;
  readonly letterSpacing: Pt;
  readonly spaceBefore: Pt;
  readonly spaceAfter: Pt;
  readonly lineHeight: number;
  readonly keepWithNext: boolean;
  readonly keepLinesTogether: boolean;
  readonly pageBreakBefore: boolean;
  readonly outlineLevel: number;
  readonly ruleBelow: RuleSpec | null;
  readonly numbered: boolean;
  readonly align: TextAlign;
}

export type ChromeSlot =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "meta"; readonly field: "title" | "author" | "date" | "subject" }
  | { readonly kind: "pageNumber" }
  | { readonly kind: "pageCount" }
  | { readonly kind: "chapter" }
  | { readonly kind: "empty" };

export interface ChromeSpec {
  readonly enabled: boolean;
  readonly slots: readonly [ChromeSlot, ChromeSlot, ChromeSlot];
  readonly fontSize: Pt;
  readonly color: HexColor;
  readonly rule: { readonly width: Eighth; readonly color: HexColor } | null;
  readonly differentFirstPage: boolean;
  readonly differentOddEven: boolean;
}

export interface TitlePageSpec {
  readonly enabled: boolean;
  readonly verticalAlign: "top" | "center";
  readonly titleSize: Pt;
  readonly subtitleSize: Pt;
  readonly showAuthor: boolean;
  readonly showDate: boolean;
  readonly dateFormat: string;
  readonly pageBreakAfter: boolean;
  readonly logo: { readonly path: string; readonly width: Pt } | null;
}

export interface PageMargin {
  readonly top: Dxa;
  readonly right: Dxa;
  readonly bottom: Dxa;
  readonly left: Dxa;
  readonly header: Dxa;
  readonly footer: Dxa;
  readonly gutter: Dxa;
}

export interface PageColumns {
  readonly count: number;
  readonly space: Dxa;
  readonly separator: boolean;
}

export interface PageSpec {
  readonly size: { readonly width: Dxa; readonly height: Dxa };
  readonly orientation: "portrait" | "landscape";
  readonly margin: PageMargin;
  readonly columns: PageColumns | null;
}

export interface TypeSpec {
  readonly body: FontStack;
  readonly heading: FontStack;
  readonly mono: FontStack;
  readonly baseSize: Pt;
  readonly scale: number;
  readonly leading: number;
  readonly hyphenation: boolean;
}

export interface ColorSpec {
  readonly text: HexColor;
  readonly muted: HexColor;
  readonly accent: HexColor;
  readonly link: HexColor;
  readonly linkVisited: HexColor;
  readonly rule: HexColor;
  readonly codeBackground: HexColor;
  readonly codeForeground: HexColor;
  readonly codeBorder: HexColor | null;
  readonly inlineCodeBackground: HexColor;
  readonly inlineCodeForeground: HexColor;
  readonly quoteBar: HexColor;
  readonly quoteForeground: HexColor;
  readonly quoteBackground: HexColor | null;
  readonly tableHeaderBackground: HexColor;
  readonly tableHeaderForeground: HexColor;
  readonly tableStripe: HexColor | null;
  readonly tableBorder: HexColor;
  readonly callout: Readonly<Record<CalloutKind, HexColor>>;
}

export interface ParagraphSpec {
  readonly align: TextAlign;
  readonly spaceBefore: Pt;
  readonly spaceAfter: Pt;
  readonly lineHeight: number;
  readonly firstLineIndent: Dxa | null;
  readonly widowControl: boolean;
}

export interface QuoteSpec {
  readonly indentLeft: Dxa;
  readonly indentRight: Dxa;
  readonly barWidth: Eighth;
  readonly barColor: HexColor;
  readonly italic: boolean;
  readonly fontSize: Pt;
  readonly spaceBefore: Pt;
  readonly spaceAfter: Pt;
  readonly padding: Dxa;
}

export interface CodeSpec {
  readonly fontSize: Pt;
  readonly lineHeight: number;
  readonly padding: Dxa;
  readonly showLineNumbers: boolean;
  readonly lineNumberColor: HexColor;
  readonly showLanguageLabel: boolean;
  readonly wrap: boolean;
  readonly tabWidth: number;
}

export interface ListSpec {
  readonly bulletGlyphs: readonly string[];
  readonly orderedFormats: readonly OrderedListFormat[];
  readonly orderedSuffix: "." | ")" | "";
  readonly indentStep: Dxa;
  readonly hanging: Dxa;
  readonly spaceBetweenItems: Pt;
  readonly spaceAfterList: Pt;
  readonly taskGlyphs: { readonly checked: string; readonly unchecked: string };
}

export interface TableSpec {
  readonly headerBold: boolean;
  readonly repeatHeaderRow: boolean;
  readonly cellPaddingX: Dxa;
  readonly cellPaddingY: Dxa;
  readonly borderWidth: Eighth;
  readonly borderStyle: BorderStyle;
  readonly horizontalRulesOnly: boolean;
  readonly stripes: boolean;
  readonly fontSize: Pt;
  readonly align: "left" | "center";
  readonly minColumnWidth: Dxa;
}

export interface FigureSpec {
  readonly align: "left" | "center";
  readonly maxWidthRatio: number;
  readonly spaceBefore: Pt;
  readonly spaceAfter: Pt;
  readonly border: { readonly width: Eighth; readonly color: HexColor } | null;
}

export interface CaptionSpec {
  readonly position: "above" | "below";
  readonly figurePrefix: string;
  readonly tablePrefix: string;
  readonly separator: string;
  readonly fontSize: Pt;
  readonly italic: boolean;
  readonly color: HexColor;
  readonly align: TextAlign;
}

export interface CalloutSpec {
  readonly padding: Dxa;
  readonly barWidth: Eighth;
  readonly showLabel: boolean;
  readonly labels: Readonly<Record<CalloutKind, string>>;
  readonly titleBold: boolean;
  readonly tintedBackground: boolean;
}

export interface FootnoteSpec {
  readonly fontSize: Pt;
  readonly separatorWidth: Eighth;
  readonly numberFormat: "decimal" | "lowerRoman" | "symbol";
}

export interface TableOfContentsSpec {
  readonly enabled: boolean;
  readonly title: string;
  readonly depth: number;
  readonly hyperlinks: boolean;
  readonly showPageNumbers: boolean;
  readonly tabLeader: "dot" | "hyphen" | "none";
  readonly pageBreakAfter: boolean;
}

export interface ChromeGroupSpec {
  readonly header: ChromeSpec | null;
  readonly footer: ChromeSpec | null;
  readonly titlePage: TitlePageSpec | null;
}

export interface SyntaxStyle {
  readonly foreground: HexColor;
  readonly bold: boolean;
  readonly italic: boolean;
}

export interface Theme {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly version: string;
  readonly page: PageSpec;
  readonly type: TypeSpec;
  readonly color: ColorSpec;
  readonly heading: readonly [
    HeadingSpec,
    HeadingSpec,
    HeadingSpec,
    HeadingSpec,
    HeadingSpec,
    HeadingSpec,
  ];
  readonly paragraph: ParagraphSpec;
  readonly quote: QuoteSpec;
  readonly code: CodeSpec;
  readonly list: ListSpec;
  readonly table: TableSpec;
  readonly figure: FigureSpec;
  readonly caption: CaptionSpec;
  readonly callout: CalloutSpec;
  readonly footnote: FootnoteSpec;
  readonly tableOfContents: TableOfContentsSpec;
  readonly chrome: ChromeGroupSpec;
  readonly syntax: Readonly<Record<SyntaxScope, SyntaxStyle>>;
  readonly formats: Readonly<Record<string, JsonObject>>;
}
