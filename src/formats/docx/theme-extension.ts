import { z } from "zod";
import { jsonValueSchema } from "../../lib/json.ts";
import type { JsonObject, JsonValue } from "../../types/json.ts";
import type { DocxThemeExtension } from "../../types/docx-theme.ts";
import type { ThemeExtensionIssue, ThemeExtensionValidation } from "../../types/format.ts";

const DEFAULT_STYLE_ID_PREFIX = "Md2";
const DEFAULT_COMPATIBILITY_MODE_VERSION = 15;

export const docxThemeExtensionSchema = z.strictObject({
  styleIdPrefix: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]{0,15}$/)
    .default(DEFAULT_STYLE_ID_PREFIX),
  compatibilityModeVersion: z
    .number()
    .int()
    .min(12)
    .max(15)
    .default(DEFAULT_COMPATIBILITY_MODE_VERSION),
  updateFieldsOnOpen: z.boolean().default(true),
});

export const parseDocxThemeExtension = (extension: JsonObject): DocxThemeExtension =>
  docxThemeExtensionSchema.parse(extension);

export const validateDocxThemeExtension = (extension: JsonObject): ThemeExtensionValidation => {
  const parsed = docxThemeExtensionSchema.safeParse(extension);
  if (parsed.success) {
    return { ok: true };
  }
  const issues: readonly ThemeExtensionIssue[] = parsed.error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  }));
  return { ok: false, issues };
};

export const docxThemeExtensionJsonSchema = (): JsonValue => {
  const parsed = jsonValueSchema.safeParse(z.toJSONSchema(docxThemeExtensionSchema));
  return parsed.success ? parsed.data : null;
};
