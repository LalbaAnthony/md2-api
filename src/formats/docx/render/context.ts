import type { ConversionWarning } from "../../../types/format.ts";
import type { DocumentIr } from "../../../types/ir.ts";
import type { DocxCompiledTheme } from "../../../types/docx-theme.ts";
import type { DocxRenderContext, DocxWarningCollector } from "../../../types/docx-render.ts";
import type { JsonObject } from "../../../types/json.ts";

export const createWarningCollector = (): DocxWarningCollector => {
  const collected: ConversionWarning[] = [];
  return {
    add: (warning) => {
      collected.push(warning);
    },
    list: () => collected,
  };
};

export const createRenderContext = (
  compiled: DocxCompiledTheme,
  document: DocumentIr,
  strict: boolean,
): DocxRenderContext => ({
  compiled,
  document,
  strict,
  warnings: createWarningCollector(),
});

export const unsupportedBlockWarning = (
  kind: string,
  detail: JsonObject = {},
): ConversionWarning => ({
  code: "BLOCK_NOT_RENDERED",
  message: `The DOCX backend does not render '${kind}' yet, the block was skipped.`,
  detail: { ...detail, kind },
});

export const mathFallbackWarning = (kind: string): ConversionWarning => ({
  code: "MATH_RENDERED_AS_SOURCE",
  message:
    "The DOCX backend renders mathematics as its source, it declares the capability math as source.",
  detail: { kind },
});
