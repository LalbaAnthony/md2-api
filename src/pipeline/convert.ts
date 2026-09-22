import { conversionTimeoutError } from "../errors.ts";
import { computeContentWidth } from "../theme/tokens.ts";
import { assertMarkdownWithinLimit, markdownByteLength, parseMarkdown } from "./parse.ts";
import { normalizeDocument } from "./normalize/index.ts";
import type { ConvertInput, ConvertOutcome } from "../types/conversion.ts";
import type { ConversionWarning } from "../types/format.ts";
import type { DocumentWarning } from "../types/pipeline.ts";

const toConversionWarning = (documentWarning: DocumentWarning): ConversionWarning => ({
  code: documentWarning.code,
  message: documentWarning.message,
  detail: documentWarning.detail,
});

const withTimeout = async <TValue>(work: Promise<TValue>, timeoutMs: number): Promise<TValue> => {
  const timers: NodeJS.Timeout[] = [];
  const expiry = new Promise<never>((_resolve, reject) => {
    timers.push(
      setTimeout(() => {
        reject(conversionTimeoutError(timeoutMs));
      }, timeoutMs),
    );
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  }
};

const runConversion = async (input: ConvertInput): Promise<ConvertOutcome> => {
  const startedAt = performance.now();
  const markdownBytes = markdownByteLength(input.markdown);

  const parseStart = performance.now();
  const tree = parseMarkdown(input.markdown);
  const parseMs = performance.now() - parseStart;

  const normalizeStart = performance.now();
  const normalized = await normalizeDocument(tree, {
    strict: input.strict,
    maxNestingDepth: input.maxNestingDepth,
    contentWidth: computeContentWidth(input.theme),
    tabWidth: input.theme.code.tabWidth,
    minimumColumnWidth: input.theme.table.minColumnWidth,
    maxWidthRatio: input.theme.figure.maxWidthRatio,
    imagePolicy: input.imagePolicy,
    tableOfContentsEnabled: input.theme.tableOfContents.enabled,
    defaultLanguage: input.defaultLanguage,
    metadata: input.metadata,
    documentOptions: input.documentOptions,
  });
  const normalizeMs = performance.now() - normalizeStart;

  const result = await input.backend.convert({
    document: normalized.document,
    theme: input.theme,
    strict: input.strict,
    options: input.documentOptions,
  });

  return {
    result,
    warnings: [...normalized.warnings.map(toConversionWarning), ...result.warnings],
    timings: {
      parseMs,
      normalizeMs,
      compileMs: result.timings.compileMs,
      renderMs: result.timings.renderMs,
      packMs: result.timings.packMs,
      totalMs: performance.now() - startedAt,
    },
    blockCount: normalized.document.blocks.length,
    imageCount: normalized.document.assets.size,
    markdownBytes,
  };
};

export const convertMarkdown = async (input: ConvertInput): Promise<ConvertOutcome> => {
  assertMarkdownWithinLimit(input.markdown, input.maxMarkdownBytes);
  return withTimeout(runConversion(input), input.timeoutMs);
};
