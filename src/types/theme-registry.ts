import type { AppConfig } from "./config.ts";
import type { JsonValue } from "./json.ts";
import type { StructuredLogger } from "./logging.ts";
import type { Theme } from "./theme.ts";

export type ThemeOrigin = "builtin" | "directory";

export interface ThemeSummary {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly version: string;
  readonly origin: ThemeOrigin;
  readonly hash: string;
}

export interface ThemeValidationIssue {
  readonly path: readonly string[];
  readonly message: string;
}

export interface ThemeLoadFailure {
  readonly source: string;
  readonly message: string;
  readonly issues: readonly ThemeValidationIssue[];
}

export interface ThemeLoadReport {
  readonly loaded: readonly ThemeSummary[];
  readonly failures: readonly ThemeLoadFailure[];
  readonly overridden: readonly string[];
}

export interface ThemeRecord {
  readonly theme: Theme;
  readonly origin: ThemeOrigin;
  readonly hash: string;
}

export interface ThemeRegistry {
  list(): readonly ThemeSummary[];
  ids(): readonly string[];
  has(themeId: string): boolean;
  get(themeId: string): Theme | null;
  record(themeId: string): ThemeRecord | null;
  report(): ThemeLoadReport;
  reload(): Promise<ThemeLoadReport>;
  onReload(listener: ThemeReloadListener): void;
  close(): Promise<void>;
}

export type ThemeReloadListener = (report: ThemeLoadReport) => void;

export interface ThemeExtensionValidator {
  readonly formatId: string;
  validate(themeId: string, extension: JsonValue): readonly ThemeValidationIssue[];
}

export interface ThemeRegistryOptions {
  readonly config: AppConfig;
  readonly logger: StructuredLogger;
  readonly extensionValidators?: readonly ThemeExtensionValidator[];
}
