import { isIP } from "node:net";
import { z } from "zod";
import { validationError } from "./errors.ts";
import type { AppConfig, EnvironmentSource } from "./types/config.ts";
import type { JsonObject } from "./types/json.ts";

const TRUTHY_ENVIRONMENT_VALUES: ReadonlySet<string> = new Set(["true", "1", "yes", "on"]);
const FALSY_ENVIRONMENT_VALUES: ReadonlySet<string> = new Set(["false", "0", "no", "off", ""]);

const booleanFromEnvironment = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((raw, context) => {
      if (raw === undefined) {
        return defaultValue;
      }
      const normalized = raw.trim().toLowerCase();
      if (TRUTHY_ENVIRONMENT_VALUES.has(normalized)) {
        return true;
      }
      if (FALSY_ENVIRONMENT_VALUES.has(normalized)) {
        return false;
      }
      context.addIssue({
        code: "custom",
        message: "Expected one of true, false, 1, 0, yes, no, on, off.",
      });
      return z.NEVER;
    });

const commaSeparatedList = z
  .string()
  .default("")
  .transform((raw) =>
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

const TRUSTED_PROXY_PRESETS: ReadonlySet<string> = new Set([
  "loopback",
  "linklocal",
  "uniquelocal",
]);
const IPV4_PREFIX_BITS = 32;
const IPV6_PREFIX_BITS = 128;

const isTrustedProxyEntry = (entry: string): boolean => {
  if (TRUSTED_PROXY_PRESETS.has(entry)) {
    return true;
  }
  const [address = "", prefix, ...rest] = entry.split("/");
  const family = isIP(address);
  if (family === 0 || rest.length > 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  const bits = Number(prefix);
  const maximumBits = family === 4 ? IPV4_PREFIX_BITS : IPV6_PREFIX_BITS;
  return /^\d{1,3}$/.test(prefix) && bits <= maximumBits;
};

const trustedProxyList = commaSeparatedList.superRefine((entries, context) => {
  for (const entry of entries) {
    if (!isTrustedProxyEntry(entry)) {
      context.addIssue({
        code: "custom",
        message: `Expected loopback, linklocal, uniquelocal, an IP address or a CIDR range, got ${entry}.`,
      });
    }
  }
});

const positiveInteger = (defaultValue: number, minimum = 1) =>
  z.coerce.number().int().min(minimum).default(defaultValue);

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),

  THEMES_DIR: z.string().default("./themes"),
  ASSETS_DIR: z.string().default("./assets"),
  DEFAULT_THEME: z.string().default("default"),
  DEFAULT_FORMAT: z.string().default("docx"),
  ENABLED_FORMATS: z
    .string()
    .default("docx")
    .transform((raw) =>
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),

  MAX_MARKDOWN_BYTES: positiveInteger(2_000_000),
  MAX_CONCURRENCY: positiveInteger(4),
  CONVERT_TIMEOUT_MS: positiveInteger(30_000),
  MAX_NESTING_DEPTH: positiveInteger(100),

  ALLOW_REMOTE_IMAGES: booleanFromEnvironment(false),
  IMAGE_ALLOWLIST: commaSeparatedList,
  ALLOW_LOCAL_IMAGES: booleanFromEnvironment(false),
  MAX_IMAGE_BYTES: positiveInteger(10_485_760),
  MAX_IMAGE_PIXELS: positiveInteger(40_000_000),
  MAX_IMAGES_PER_DOCUMENT: positiveInteger(100),
  IMAGE_FETCH_TIMEOUT_MS: positiveInteger(5_000),

  STRICT: booleanFromEnvironment(false).optional(),
  ALLOW_RAW_HTML: booleanFromEnvironment(false),

  ENABLE_PREVIEW: booleanFromEnvironment(false),
  ENABLE_THEME_WATCH: booleanFromEnvironment(false),
  ENABLE_SWAGGER_UI: booleanFromEnvironment(false).optional(),
  CORS_ORIGINS: commaSeparatedList,

  TRUST_PROXY: trustedProxyList,
  RATE_LIMIT_ENABLED: booleanFromEnvironment(false).optional(),
  RATE_LIMIT_WINDOW_MS: positiveInteger(60_000),
  RATE_LIMIT_MAX: positiveInteger(300),
  RATE_LIMIT_CONVERT_MAX: positiveInteger(30),
});

const PRODUCTION_LOG_LEVEL = "info";
const DEVELOPMENT_LOG_LEVEL = "debug";

const issuesToDetails = (error: z.ZodError): JsonObject => ({
  issues: error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)),
    message: issue.message,
  })),
});

export const loadConfig = (source: EnvironmentSource = process.env): AppConfig => {
  const parsed = configSchema.safeParse(source);
  if (!parsed.success) {
    throw validationError("Invalid environment configuration.", issuesToDetails(parsed.error));
  }

  const parsedConfig = parsed.data;
  const isProduction = parsedConfig.NODE_ENV === "production";

  if (parsedConfig.ALLOW_RAW_HTML) {
    throw validationError("ALLOW_RAW_HTML must remain false.", {
      variable: "ALLOW_RAW_HTML",
    });
  }

  const config: AppConfig = {
    NODE_ENV: parsedConfig.NODE_ENV,
    LOG_LEVEL:
      parsedConfig.LOG_LEVEL ?? (isProduction ? PRODUCTION_LOG_LEVEL : DEVELOPMENT_LOG_LEVEL),

    THEMES_DIR: parsedConfig.THEMES_DIR,
    ASSETS_DIR: parsedConfig.ASSETS_DIR,
    DEFAULT_THEME: parsedConfig.DEFAULT_THEME,
    DEFAULT_FORMAT: parsedConfig.DEFAULT_FORMAT,
    ENABLED_FORMATS: parsedConfig.ENABLED_FORMATS,

    MAX_MARKDOWN_BYTES: parsedConfig.MAX_MARKDOWN_BYTES,
    MAX_CONCURRENCY: parsedConfig.MAX_CONCURRENCY,
    CONVERT_TIMEOUT_MS: parsedConfig.CONVERT_TIMEOUT_MS,
    MAX_NESTING_DEPTH: parsedConfig.MAX_NESTING_DEPTH,

    ALLOW_REMOTE_IMAGES: parsedConfig.ALLOW_REMOTE_IMAGES,
    IMAGE_ALLOWLIST: parsedConfig.IMAGE_ALLOWLIST,
    ALLOW_LOCAL_IMAGES: parsedConfig.ALLOW_LOCAL_IMAGES,
    MAX_IMAGE_BYTES: parsedConfig.MAX_IMAGE_BYTES,
    MAX_IMAGE_PIXELS: parsedConfig.MAX_IMAGE_PIXELS,
    MAX_IMAGES_PER_DOCUMENT: parsedConfig.MAX_IMAGES_PER_DOCUMENT,
    IMAGE_FETCH_TIMEOUT_MS: parsedConfig.IMAGE_FETCH_TIMEOUT_MS,

    STRICT: parsedConfig.STRICT ?? !isProduction,
    ALLOW_RAW_HTML: false,

    ENABLE_PREVIEW: parsedConfig.ENABLE_PREVIEW,
    ENABLE_THEME_WATCH: parsedConfig.ENABLE_THEME_WATCH,
    ENABLE_SWAGGER_UI: parsedConfig.ENABLE_SWAGGER_UI ?? !isProduction,
    CORS_ORIGINS: parsedConfig.CORS_ORIGINS,

    TRUST_PROXY: parsedConfig.TRUST_PROXY,
    RATE_LIMIT_ENABLED: parsedConfig.RATE_LIMIT_ENABLED ?? isProduction,
    RATE_LIMIT_WINDOW_MS: parsedConfig.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX: parsedConfig.RATE_LIMIT_MAX,
    RATE_LIMIT_CONVERT_MAX: parsedConfig.RATE_LIMIT_CONVERT_MAX,
  };

  assertProductionInvariants(config);
  assertFormatSelectionIsCoherent(config);
  return config;
};

const assertProductionInvariants = (config: AppConfig): void => {
  if (config.NODE_ENV !== "production") {
    return;
  }
  if (config.ENABLE_PREVIEW) {
    throw validationError("ENABLE_PREVIEW must be false in production.", {
      variable: "ENABLE_PREVIEW",
    });
  }
  if (config.ENABLE_THEME_WATCH) {
    throw validationError("ENABLE_THEME_WATCH must be false in production.", {
      variable: "ENABLE_THEME_WATCH",
    });
  }
  if (config.ALLOW_REMOTE_IMAGES && config.IMAGE_ALLOWLIST.length === 0) {
    throw validationError(
      "IMAGE_ALLOWLIST must list at least one host when ALLOW_REMOTE_IMAGES is enabled in production.",
      { variable: "IMAGE_ALLOWLIST" },
    );
  }
};

const assertFormatSelectionIsCoherent = (config: AppConfig): void => {
  if (config.ENABLED_FORMATS.length === 0) {
    throw validationError("ENABLED_FORMATS must list at least one output format.", {
      variable: "ENABLED_FORMATS",
    });
  }
  if (!config.ENABLED_FORMATS.includes(config.DEFAULT_FORMAT)) {
    throw validationError("DEFAULT_FORMAT must be one of ENABLED_FORMATS.", {
      variable: "DEFAULT_FORMAT",
      defaultFormat: config.DEFAULT_FORMAT,
      enabledFormats: [...config.ENABLED_FORMATS],
    });
  }
};
