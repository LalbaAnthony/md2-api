import type { ConversionResult, ConversionWarning, FormatBackend } from "./format.ts";
import type { DocumentOptions, MetadataOverrides } from "./pipeline.ts";
import type { Theme } from "./theme.ts";

export interface ConvertInput {
  readonly markdown: string;
  readonly theme: Theme;
  readonly backend: FormatBackend;
  readonly strict: boolean;
  readonly maxMarkdownBytes: number;
  readonly maxNestingDepth: number;
  readonly timeoutMs: number;
  readonly defaultLanguage: string;
  readonly metadata: MetadataOverrides;
  readonly documentOptions: DocumentOptions;
}

export interface ConvertTimings {
  readonly parseMs: number;
  readonly normalizeMs: number;
  readonly compileMs: number;
  readonly renderMs: number;
  readonly packMs: number;
  readonly totalMs: number;
}

export interface ConvertOutcome {
  readonly result: ConversionResult;
  readonly warnings: readonly ConversionWarning[];
  readonly timings: ConvertTimings;
  readonly blockCount: number;
  readonly imageCount: number;
  readonly markdownBytes: number;
}
