export interface ConversionLogFields {
  readonly requestId: string;
  readonly themeId: string;
  readonly formatId: string;
  readonly markdownBytes: number;
  readonly blockCount: number;
  readonly imageCount: number;
  readonly parseMs: number;
  readonly normalizeMs: number;
  readonly compileMs: number;
  readonly renderMs: number;
  readonly packMs: number;
  readonly totalMs: number;
  readonly outputBytes: number;
  readonly warningCount: number;
}
