import type { INumberingOptions, ISectionPropertiesOptions, IStylesOptions } from "docx";
import type { Dxa, Eighth, Pt } from "./units.ts";
import type { SyntaxScope, TextAlign } from "./ir.ts";
import type { JsonObject } from "./json.ts";

export type DocxParagraphStyleKey =
  | "Normal"
  | "Heading1"
  | "Heading2"
  | "Heading3"
  | "Heading4"
  | "Heading5"
  | "Heading6"
  | "Title"
  | "Subtitle"
  | "Quote"
  | "QuoteAttribution"
  | "CodeBlock"
  | "CodeLine"
  | "CodeCaption"
  | "ListParagraph"
  | "TaskItem"
  | "Caption"
  | "FigureCaption"
  | "TableCaption"
  | "TableCellText"
  | "TableHeaderText"
  | "FootnoteText"
  | "Callout"
  | "CalloutTitle"
  | "TocHeading"
  | "Toc1"
  | "Toc2"
  | "Toc3"
  | "Toc4"
  | "Toc5"
  | "Toc6"
  | "HeaderText"
  | "FooterText"
  | "HorizontalRule";

export type DocxCharacterStyleKey =
  | "CodeChar"
  | "Hyperlink"
  | "InternalLink"
  | "FootnoteRef"
  | "Strong"
  | "Emphasis"
  | "Strike"
  | "LineNumber"
  | "LanguageLabel"
  | "MathInline";

export type DocxStyleKey = DocxParagraphStyleKey | DocxCharacterStyleKey;

export type DocxNumberingReference = "bullet" | "ordered" | "headings";

export interface DocxThemeExtension {
  readonly styleIdPrefix: string;
  readonly compatibilityModeVersion: number;
  readonly updateFieldsOnOpen: boolean;
}

export interface DocxFontNames {
  readonly body: string;
  readonly heading: string;
  readonly mono: string;
}

export interface DocxListSettings {
  readonly indentStep: Dxa;
  readonly hanging: Dxa;
  readonly taskGlyphs: { readonly checked: string; readonly unchecked: string };
}

export interface DocxSyntaxRun {
  readonly color: string;
  readonly bold: boolean;
  readonly italics: boolean;
}

export type DocxSyntaxRuns = Readonly<Record<SyntaxScope, DocxSyntaxRun>>;

export interface DocxCodeSettings {
  readonly background: string;
  readonly border: string | null;
  readonly borderWidth: Eighth;
  readonly padding: Dxa;
  readonly showLineNumbers: boolean;
  readonly showLanguageLabel: boolean;
  readonly fontSize: Pt;
}

export interface DocxTableSettings {
  readonly headerBackground: string;
  readonly stripeBackground: string;
  readonly stripes: boolean;
  readonly repeatHeaderRow: boolean;
  readonly borderColor: string;
  readonly borderWidth: Eighth;
  readonly borderStyle: string;
  readonly horizontalRulesOnly: boolean;
  readonly cellPaddingX: Dxa;
  readonly cellPaddingY: Dxa;
  readonly align: "left" | "center";
}

export interface DocxCaptionSettings {
  readonly position: "above" | "below";
  readonly figurePrefix: string;
  readonly tablePrefix: string;
  readonly separator: string;
  readonly align: TextAlign;
}

export interface DocxFigureSettings {
  readonly align: "left" | "center";
  readonly maxWidthRatio: number;
}

export interface DocxParagraphBehaviour {
  readonly widowControl: boolean;
  readonly headingPageBreakBefore: readonly [boolean, boolean, boolean, boolean, boolean, boolean];
}

export interface DocxCompiledTheme {
  readonly themeId: string;
  readonly themeHash: string;
  readonly styles: IStylesOptions;
  readonly numbering: INumberingOptions;
  readonly section: ISectionPropertiesOptions;
  readonly contentWidth: Dxa;
  readonly styleIds: Readonly<Record<DocxStyleKey, string>>;
  readonly numberingReferences: Readonly<Record<DocxNumberingReference, string>>;
  readonly headingsAreNumbered: boolean;
  readonly paragraphBehaviour: DocxParagraphBehaviour;
  readonly fonts: DocxFontNames;
  readonly list: DocxListSettings;
  readonly code: DocxCodeSettings;
  readonly syntax: DocxSyntaxRuns;
  readonly table: DocxTableSettings;
  readonly caption: DocxCaptionSettings;
  readonly figure: DocxFigureSettings;
  readonly extension: DocxThemeExtension;
}

export interface DocxThemeExtensionSource {
  readonly raw: JsonObject;
}
