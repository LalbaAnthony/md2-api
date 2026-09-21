export type RuntimeEnvironment = "development" | "test" | "production";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface AppConfig {
  readonly NODE_ENV: RuntimeEnvironment;
  readonly PORT: number;
  readonly HOST: string;
  readonly LOG_LEVEL: LogLevel;

  readonly THEMES_DIR: string;
  readonly ASSETS_DIR: string;
  readonly DEFAULT_THEME: string;
  readonly DEFAULT_FORMAT: string;
  readonly ENABLED_FORMATS: readonly string[];

  readonly MAX_MARKDOWN_BYTES: number;
  readonly MAX_CONCURRENCY: number;
  readonly CONVERT_TIMEOUT_MS: number;
  readonly MAX_NESTING_DEPTH: number;

  readonly ALLOW_REMOTE_IMAGES: boolean;
  readonly IMAGE_ALLOWLIST: readonly string[];
  readonly ALLOW_LOCAL_IMAGES: boolean;
  readonly MAX_IMAGE_BYTES: number;
  readonly MAX_IMAGE_PIXELS: number;
  readonly MAX_IMAGES_PER_DOCUMENT: number;
  readonly IMAGE_FETCH_TIMEOUT_MS: number;

  readonly STRICT: boolean;
  readonly ALLOW_RAW_HTML: false;

  readonly ENABLE_PREVIEW: boolean;
  readonly ENABLE_THEME_WATCH: boolean;
  readonly ENABLE_SWAGGER_UI: boolean;
  readonly CORS_ORIGINS: readonly string[];
}

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;
