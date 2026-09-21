import type { DocumentIr } from "./ir.ts";
import type { Theme } from "./theme.ts";
import type { JsonObject, JsonValue } from "./json.ts";

export type OutputFormatId = "docx" | "debug-json";

export interface FormatDescriptor {
  readonly id: OutputFormatId;
  readonly label: string;
  readonly mediaType: string;
  readonly fileExtension: string;
  readonly productionReady: boolean;
  readonly capabilities: FormatCapabilities;
  readonly caveats: readonly string[];
}

export interface FormatCapabilities {
  readonly pagination: boolean;
  readonly pageChrome: boolean;
  readonly titlePage: boolean;
  readonly tableOfContents: "resolved" | "deferredField" | "none";
  readonly footnotes: "native" | "endnotes" | "inline" | "none";
  readonly math: "native" | "raster" | "source";
  readonly syntaxHighlighting: boolean;
  readonly columns: boolean;
  readonly landscapeSections: boolean;
  readonly vectorImages: boolean;
  readonly maxListDepth: number;
}

export interface ConversionRequest {
  readonly document: DocumentIr;
  readonly theme: Theme;
  readonly strict: boolean;
}

export interface ConversionWarning {
  readonly code: string;
  readonly message: string;
  readonly detail: JsonObject;
}

export interface ConversionTimings {
  readonly compileMs: number;
  readonly renderMs: number;
  readonly packMs: number;
}

export interface ConversionResult {
  readonly body: Uint8Array;
  readonly mediaType: string;
  readonly fileExtension: string;
  readonly warnings: readonly ConversionWarning[];
  readonly timings: ConversionTimings;
}

export type ThemeExtensionValidation =
  { readonly ok: true } | { readonly ok: false; readonly issues: readonly ThemeExtensionIssue[] };

export interface ThemeExtensionIssue {
  readonly path: readonly string[];
  readonly message: string;
}

export interface FormatBackend {
  readonly descriptor: FormatDescriptor;
  readonly themeExtensionJsonSchema: JsonValue | null;
  validateThemeExtension(extension: JsonObject): ThemeExtensionValidation;
  describeThemeCaveats(theme: Theme): readonly string[];
  warmUp(): Promise<void>;
  convert(request: ConversionRequest): Promise<ConversionResult>;
  invalidateThemeCache(themeId: string): void;
}

export interface FormatRegistry {
  resolve(formatId: string): FormatBackend | null;
  list(): readonly FormatDescriptor[];
  ids(): readonly OutputFormatId[];
  backends(): readonly FormatBackend[];
  warmUpAll(): Promise<void>;
  invalidateThemeCache(themeId: string): void;
}

export interface FormatRegistryOptions {
  readonly config: FormatRegistryConfig;
  readonly logger: FormatRegistryLogger;
  readonly candidates?: readonly FormatBackend[];
}

export interface FormatRegistryConfig {
  readonly NODE_ENV: "development" | "test" | "production";
  readonly ENABLED_FORMATS: readonly string[];
  readonly DEFAULT_FORMAT: string;
}

export interface FormatRegistryLogger {
  debug(details: Record<string, unknown>, message: string): void;
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

export interface FormatSelectionInput {
  readonly bodyFormat?: string | undefined;
  readonly queryFormat?: string | undefined;
  readonly acceptHeader?: string | undefined;
  readonly defaultFormat: string;
}

export interface FormatSelection {
  readonly backend: FormatBackend;
  readonly source: "body" | "query" | "accept" | "default";
}

export interface AcceptEntry {
  readonly mediaType: string;
  readonly quality: number;
}
