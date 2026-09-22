import type { INumberingOptions, ISectionPropertiesOptions, IStylesOptions } from "docx";
import type { Dxa } from "./units.ts";
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
  readonly extension: DocxThemeExtension;
}

export interface DocxThemeExtensionSource {
  readonly raw: JsonObject;
}
