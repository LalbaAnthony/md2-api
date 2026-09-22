import type { Code, FootnoteDefinition, Root } from "mdast";
import type { Dxa } from "./units.ts";
import type {
  CalloutKind,
  DocumentIr,
  DocumentMeta,
  IrBlock,
  IrCodeLine,
  IrImageAsset,
} from "./ir.ts";
import type { ImageFetchPolicy } from "./images.ts";
import type { JsonObject } from "./json.ts";

export interface DocumentWarning {
  readonly code: string;
  readonly message: string;
  readonly detail: JsonObject;
}

export interface MetadataOverrides {
  readonly title?: string;
  readonly subtitle?: string;
  readonly authors?: readonly string[];
  readonly date?: string;
  readonly subject?: string;
  readonly keywords?: readonly string[];
  readonly language?: string;
}

export interface DocumentOptions {
  readonly tableOfContents?: boolean;
  readonly titlePage?: boolean;
}

export type CodeTokenTable = ReadonlyMap<Code, readonly IrCodeLine[]>;

export type ImageResolutionTable = ReadonlyMap<object, IrImageAsset>;

export type MathTable = ReadonlyMap<object, string | null>;

export interface FootnoteTable {
  readonly numberByIdentifier: ReadonlyMap<string, number>;
  readonly ordered: readonly { readonly id: number; readonly definition: FootnoteDefinition }[];
}

export interface FigureDirective {
  readonly source: string;
  readonly alternativeText: string;
  readonly caption: string | null;
  readonly widthRatio: number;
}

export interface DirectiveIssue {
  readonly path: readonly string[];
  readonly message: string;
}

export type DirectiveOutcome<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly issues: readonly DirectiveIssue[] };

export interface CalloutDirective {
  readonly variant: CalloutKind;
  readonly title: string | null;
}

export interface ColumnsDirective {
  readonly count: number;
}

export interface ImageResolutionOptions {
  readonly policy: ImageFetchPolicy;
  readonly contentWidth: Dxa;
  readonly maxWidthRatio: number;
  readonly strict: boolean;
  readonly sink: WarningSink;
}

export interface NormalizeOptions {
  readonly strict: boolean;
  readonly maxNestingDepth: number;
  readonly contentWidth: Dxa;
  readonly tabWidth: number;
  readonly minimumColumnWidth: Dxa;
  readonly maxWidthRatio: number;
  readonly imagePolicy: ImageFetchPolicy;
  readonly tableOfContentsEnabled: boolean;
  readonly defaultLanguage: string;
  readonly metadata: MetadataOverrides;
  readonly documentOptions: DocumentOptions;
}

export interface NormalizeResult {
  readonly document: DocumentIr;
  readonly warnings: readonly DocumentWarning[];
}

export interface WarningSink {
  add(warning: DocumentWarning): void;
  list(): readonly DocumentWarning[];
}

export interface NormalizePass {
  readonly name: string;
  run(tree: Root): void;
}

export interface FrontmatterOutcome {
  readonly meta: DocumentMeta;
}

export interface AnchorTable {
  readonly bySlug: ReadonlyMap<string, string>;
  readonly byHeading: ReadonlyMap<string, string>;
}

export interface PipelineTimings {
  readonly parseMs: number;
  readonly normalizeMs: number;
}

export interface PipelineOutcome {
  readonly document: DocumentIr;
  readonly warnings: readonly DocumentWarning[];
  readonly timings: PipelineTimings;
}

export interface FlattenInput {
  readonly tree: Root;
  readonly anchors: AnchorTable;
  readonly sink: WarningSink;
  readonly strict: boolean;
  readonly maxNestingDepth: number;
  readonly codeTokens: CodeTokenTable;
  readonly images: ImageResolutionTable;
  readonly math: MathTable;
  readonly footnotes: FootnoteTable;
  readonly contentWidth: Dxa;
  readonly minimumColumnWidth: Dxa;
}

export interface FlattenOutput {
  readonly blocks: readonly IrBlock[];
  readonly headingCount: number;
  readonly wordCount: number;
  readonly codeBlockCount: number;
  readonly tableCount: number;
  readonly imageCount: number;
  readonly footnotes: ReadonlyMap<number, readonly IrBlock[]>;
}
