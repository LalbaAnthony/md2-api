import { createLruCache } from "../../lib/cache.ts";
import { hashJson } from "../../lib/hash.ts";
import {
  DOCX_FILE_EXTENSION,
  DOCX_MEDIA_TYPE,
  docxCapabilities,
  docxCaveats,
} from "./capabilities.ts";
import { compileThemeForDocx } from "./compile/index.ts";
import { packDocument } from "./pack.ts";
import { renderDocument } from "./render/document.ts";
import { docxThemeExtensionJsonSchema, validateDocxThemeExtension } from "./theme-extension.ts";
import type {
  ConversionRequest,
  ConversionResult,
  FormatBackend,
  FormatDescriptor,
} from "../../types/format.ts";
import type { DocxCompiledTheme } from "../../types/docx-theme.ts";
import type { Theme } from "../../types/theme.ts";

const COMPILED_THEME_CACHE_CAPACITY = 64;

const compiledThemes = createLruCache<DocxCompiledTheme>(COMPILED_THEME_CACHE_CAPACITY);

const cacheKeyFor = (theme: Theme): string => `${theme.id}@${hashJson(theme)}`;

const compiledThemeFor = (theme: Theme): DocxCompiledTheme => {
  const key = cacheKeyFor(theme);
  const cached = compiledThemes.get(key);
  if (cached !== null) {
    return cached;
  }
  const compiled = compileThemeForDocx(theme);
  compiledThemes.set(key, compiled);
  return compiled;
};

const descriptor: FormatDescriptor = {
  id: "docx",
  label: "Word document",
  mediaType: DOCX_MEDIA_TYPE,
  fileExtension: DOCX_FILE_EXTENSION,
  productionReady: true,
  capabilities: docxCapabilities,
  caveats: docxCaveats,
};

const describeThemeCaveats = (theme: Theme): readonly string[] => {
  const caveats: string[] = [];
  if (theme.tableOfContents.enabled) {
    caveats.push(
      "The table of contents is a field, it shows as empty until the reader refreshes the fields.",
    );
  }
  if (theme.chrome.titlePage?.logo != null) {
    caveats.push("The title page logo is read from the assets directory at conversion time.");
  }
  if (theme.type.hyphenation) {
    caveats.push("Hyphenation is left to the reader, the document carries no hyphenation table.");
  }
  return caveats;
};

export const docxBackend: FormatBackend = {
  descriptor,
  themeExtensionJsonSchema: docxThemeExtensionJsonSchema(),

  validateThemeExtension: validateDocxThemeExtension,

  describeThemeCaveats,

  warmUp: async () => {
    await Promise.resolve();
  },

  convert: async (request: ConversionRequest): Promise<ConversionResult> => {
    const compileStart = performance.now();
    const compiled = compiledThemeFor(request.theme);
    const compileMs = performance.now() - compileStart;

    const renderStart = performance.now();
    const rendered = renderDocument(compiled, request.document, request.strict);
    const renderMs = performance.now() - renderStart;

    const packStart = performance.now();
    const body = await packDocument(rendered.document);
    const packMs = performance.now() - packStart;

    return {
      body,
      mediaType: DOCX_MEDIA_TYPE,
      fileExtension: DOCX_FILE_EXTENSION,
      warnings: rendered.warnings,
      timings: { compileMs, renderMs, packMs },
    };
  },

  invalidateThemeCache: (themeId: string) => {
    compiledThemes.deleteWhere((key) => key.startsWith(`${themeId}@`));
  },
};
