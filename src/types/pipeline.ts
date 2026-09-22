import type { Root } from "mdast";
import type { Dxa } from "./units.ts";
import type { DocumentIr, DocumentMeta, IrBlock } from "./ir.ts";
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

export interface NormalizeOptions {
  readonly strict: boolean;
  readonly maxNestingDepth: number;
  readonly contentWidth: Dxa;
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
}

export interface FlattenOutput {
  readonly blocks: readonly IrBlock[];
  readonly headingCount: number;
  readonly wordCount: number;
}
