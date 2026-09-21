import type { Dxa, Px } from "./units.ts";

export type TextAlign = "left" | "center" | "right" | "justify";
export type CalloutKind = "info" | "warning" | "danger" | "success" | "note";

export interface DocumentIr {
  readonly meta: DocumentMeta;
  readonly blocks: readonly IrBlock[];
  readonly footnotes: ReadonlyMap<number, readonly IrBlock[]>;
  readonly anchors: ReadonlyMap<string, string>;
  readonly assets: ReadonlyMap<string, IrImageAsset>;
  readonly stats: DocumentStats;
}

export interface DocumentMeta {
  readonly title?: string;
  readonly subtitle?: string;
  readonly authors: readonly string[];
  readonly date?: string;
  readonly subject?: string;
  readonly keywords: readonly string[];
  readonly language: string;
  readonly custom: Readonly<Record<string, string>>;
}

export interface DocumentStats {
  readonly headings: number;
  readonly words: number;
  readonly images: number;
  readonly codeBlocks: number;
  readonly tables: number;
}

export interface BlockContext {
  readonly indentLevel: number;
  readonly listPath: readonly ListFrame[];
  readonly insideQuote: boolean;
  readonly insideCallout: CalloutKind | null;
  readonly insideTableCell: boolean;
  readonly insideFootnote: boolean;
}

export interface ListFrame {
  readonly ordered: boolean;
  readonly level: number;
  readonly instance: number;
  readonly start: number;
  readonly spread: boolean;
}

export type IrBlock =
  | {
      readonly kind: "paragraph";
      readonly context: BlockContext;
      readonly children: readonly IrInline[];
      readonly align: TextAlign | null;
    }
  | {
      readonly kind: "heading";
      readonly context: BlockContext;
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly anchor: string;
      readonly children: readonly IrInline[];
      readonly plainText: string;
    }
  | {
      readonly kind: "listItem";
      readonly context: BlockContext;
      readonly frame: ListFrame;
      readonly checked: boolean | null;
      readonly blocks: readonly IrBlock[];
    }
  | {
      readonly kind: "code";
      readonly context: BlockContext;
      readonly language: string | null;
      readonly lines: readonly IrCodeLine[];
      readonly caption: string | null;
    }
  | {
      readonly kind: "table";
      readonly context: BlockContext;
      readonly header: IrTableRow | null;
      readonly rows: readonly IrTableRow[];
      readonly columnWidths: readonly Dxa[];
      readonly columnAlign: readonly (TextAlign | null)[];
      readonly caption: string | null;
      readonly sequence: number;
    }
  | {
      readonly kind: "figure";
      readonly context: BlockContext;
      readonly asset: IrImageAsset;
      readonly caption: string | null;
      readonly sequence: number;
      readonly widthRatio: number;
    }
  | { readonly kind: "thematicBreak"; readonly context: BlockContext }
  | { readonly kind: "pageBreak"; readonly context: BlockContext }
  | { readonly kind: "tableOfContents"; readonly context: BlockContext }
  | {
      readonly kind: "mathBlock";
      readonly context: BlockContext;
      readonly source: string;
      readonly mathml: string | null;
    }
  | {
      readonly kind: "callout";
      readonly context: BlockContext;
      readonly variant: CalloutKind;
      readonly title: string | null;
      readonly blocks: readonly IrBlock[];
    }
  | {
      readonly kind: "sectionStart";
      readonly context: BlockContext;
      readonly section: SectionOverride;
    };

export interface SectionOverride {
  readonly orientation: "portrait" | "landscape" | null;
  readonly columnCount: number | null;
}

export type IrInline =
  | { readonly kind: "text"; readonly value: string; readonly marks: InlineMarks }
  | { readonly kind: "inlineCode"; readonly value: string; readonly marks: InlineMarks }
  | {
      readonly kind: "link";
      readonly url: string;
      readonly internal: boolean;
      readonly title: string | null;
      readonly children: readonly IrInline[];
    }
  | { readonly kind: "image"; readonly asset: IrImageAsset; readonly alternativeText: string }
  | { readonly kind: "footnoteReference"; readonly id: number }
  | { readonly kind: "lineBreak"; readonly hard: boolean }
  | { readonly kind: "mathInline"; readonly source: string; readonly mathml: string | null };

export interface InlineMarks {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly strike: boolean;
  readonly subscript: boolean;
  readonly superscript: boolean;
  readonly code: boolean;
}

export interface IrCodeLine {
  readonly number: number;
  readonly tokens: readonly IrCodeToken[];
}

export interface IrCodeToken {
  readonly text: string;
  readonly scope: SyntaxScope;
}

export type SyntaxScope =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "type"
  | "variable"
  | "operator"
  | "punctuation"
  | "constant"
  | "tag"
  | "attribute"
  | "plain";

export interface IrTableRow {
  readonly cells: readonly IrTableCell[];
}

export interface IrTableCell {
  readonly blocks: readonly IrBlock[];
  readonly align: TextAlign | null;
}

export interface IrImageAsset {
  readonly sourceKey: string;
  readonly data: Uint8Array;
  readonly encoding: "png" | "jpeg" | "gif" | "bmp";
  readonly intrinsic: { readonly width: Px; readonly height: Px };
  readonly rendered: { readonly width: Px; readonly height: Px };
}
