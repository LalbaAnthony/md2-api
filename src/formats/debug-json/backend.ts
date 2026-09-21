import { z } from "zod";
import {
  DEBUG_JSON_FILE_EXTENSION,
  DEBUG_JSON_MEDIA_TYPE,
  debugJsonCapabilities,
  debugJsonCaveats,
} from "./capabilities.ts";
import { jsonValueSchema } from "../../lib/json.ts";
import { serialiseDocumentToBytes } from "./serialise.ts";
import type {
  ConversionRequest,
  ConversionResult,
  FormatBackend,
  FormatDescriptor,
  ThemeExtensionIssue,
  ThemeExtensionValidation,
} from "../../types/format.ts";
import type { JsonObject, JsonValue } from "../../types/json.ts";
import type { Theme } from "../../types/theme.ts";

const themeExtensionSchema = z.strictObject({});

const descriptor: FormatDescriptor = {
  id: "debug-json",
  label: "Debug intermediate representation",
  mediaType: DEBUG_JSON_MEDIA_TYPE,
  fileExtension: DEBUG_JSON_FILE_EXTENSION,
  productionReady: false,
  capabilities: debugJsonCapabilities,
  caveats: debugJsonCaveats,
};

const toJsonSchema = (): JsonValue => {
  const parsed = jsonValueSchema.safeParse(z.toJSONSchema(themeExtensionSchema));
  return parsed.success ? parsed.data : null;
};

const describeThemeCaveats = (theme: Theme): readonly string[] => {
  const caveats: string[] = [];
  if (theme.chrome.header !== null || theme.chrome.footer !== null) {
    caveats.push("Page headers and footers are not represented, this format has no pages.");
  }
  if (theme.chrome.titlePage !== null) {
    caveats.push("The title page is not represented, this format has no pages.");
  }
  if (theme.tableOfContents.enabled) {
    caveats.push("The table of contents is left as a block marker, it is never resolved.");
  }
  if (theme.page.columns !== null) {
    caveats.push("Column layout is not represented.");
  }
  return caveats;
};

export const debugJsonBackend: FormatBackend = {
  descriptor,
  themeExtensionJsonSchema: toJsonSchema(),

  validateThemeExtension(extension: JsonObject): ThemeExtensionValidation {
    const parsed = themeExtensionSchema.safeParse(extension);
    if (parsed.success) {
      return { ok: true };
    }
    const issues: readonly ThemeExtensionIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.map((segment) => String(segment)),
      message: issue.message,
    }));
    return { ok: false, issues };
  },

  describeThemeCaveats,

  warmUp: async () => {
    await Promise.resolve();
  },

  convert: async (request: ConversionRequest): Promise<ConversionResult> => {
    const renderStart = performance.now();
    const body = serialiseDocumentToBytes(request.document);
    const renderMs = performance.now() - renderStart;
    await Promise.resolve();
    return {
      body,
      mediaType: DEBUG_JSON_MEDIA_TYPE,
      fileExtension: DEBUG_JSON_FILE_EXTENSION,
      warnings: [],
      timings: { compileMs: 0, renderMs, packMs: 0 },
    };
  },

  invalidateThemeCache: () => {
    return;
  },
};
