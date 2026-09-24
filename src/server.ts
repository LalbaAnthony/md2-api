import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import underPressure from "@fastify/under-pressure";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  API_VERSION_PREFIX,
  CONVERSION_QUEUE_FACTOR,
  LOG_REDACTION_PATHS,
  MARKDOWN_CONTENT_TYPES,
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  RESPONSE_REQUEST_ID_HEADER,
  UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
  UNDER_PRESSURE_MAX_HEAP_USED_BYTES,
  UNDER_PRESSURE_MAX_RSS_BYTES,
  UNDER_PRESSURE_RETRY_AFTER_SECONDS,
} from "./constants.ts";
import {
  AppError,
  isAppError,
  overloadedError,
  payloadTooLargeError,
  toAppError,
  toErrorResponseBody,
  validationError,
} from "./errors.ts";
import { createFormatRegistry } from "./formats/registry.ts";
import { registerRateLimit } from "./lib/rate-limit.ts";
import { createSemaphore } from "./lib/semaphore.ts";
import { warmUpHighlighter } from "./pipeline/normalize/code.ts";
import { registerOpenApi } from "./openapi/register.ts";
import { isJsonObject } from "./lib/json.ts";
import { createReadinessState } from "./lib/readiness.ts";
import { convertRoutes } from "./routes/convert.ts";
import { formatRoutes } from "./routes/formats.ts";
import { healthRoutes } from "./routes/health.ts";
import { previewRoutes } from "./routes/preview.ts";
import { themeRoutes } from "./routes/themes.ts";
import { createThemeRegistry } from "./theme/registry.ts";
import type { AppConfig } from "./types/config.ts";
import type { ReadinessState, ServerDependencies, ThemeCaveatProvider } from "./types/api.ts";
import type { JsonObject, JsonValue } from "./types/json.ts";
import type { FormatRegistry } from "./types/format.ts";
import type { RateLimitPolicy } from "./types/rate-limit.ts";
import type { ThemeExtensionValidator, ThemeRegistry } from "./types/theme-registry.ts";

const FASTIFY_BODY_TOO_LARGE_CODE = "FST_ERR_CTP_BODY_TOO_LARGE";
const UNDER_PRESSURE_CODE = "FST_UNDER_PRESSURE";

const buildLoggerOptions = (config: AppConfig) => {
  const base = {
    level: config.LOG_LEVEL,
    redact: { paths: [...LOG_REDACTION_PATHS], remove: true },
  };
  if (config.NODE_ENV === "production") {
    return base;
  }
  return {
    ...base,
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
    },
  };
};

const readIncomingRequestId = (request: { headers: Record<string, unknown> }): string => {
  const incoming = request.headers[REQUEST_ID_HEADER];
  if (typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  return randomUUID();
};

const zodValidationDetails = (issues: readonly { instancePath?: string; message?: string }[]) => ({
  issues: issues.map((issue) => ({
    path: issue.instancePath ?? "",
    message: issue.message ?? "Invalid value.",
  })),
});

const mapThrownToAppError = (thrown: unknown): AppError => {
  if (isAppError(thrown)) {
    return thrown;
  }
  if (hasZodFastifySchemaValidationErrors(thrown)) {
    const details: JsonObject = zodValidationDetails(thrown.validation);
    return validationError("Request validation failed.", details);
  }
  if (thrown instanceof Error && "code" in thrown) {
    const fastifyCode = Reflect.get(thrown, "code");
    if (fastifyCode === FASTIFY_BODY_TOO_LARGE_CODE) {
      return payloadTooLargeError("Request body exceeds the configured limit.");
    }
    if (fastifyCode === UNDER_PRESSURE_CODE) {
      return overloadedError(UNDER_PRESSURE_RETRY_AFTER_SECONDS);
    }
  }
  return toAppError(thrown);
};

const retryAfterHeaderOf = (appError: AppError): string | null => {
  if (appError.code !== "OVERLOADED" && appError.code !== "RATE_LIMITED") {
    return null;
  }
  const retryAfterSeconds = appError.details["retryAfterSeconds"];
  return typeof retryAfterSeconds === "number"
    ? String(retryAfterSeconds)
    : String(UNDER_PRESSURE_RETRY_AFTER_SECONDS);
};

const rateLimitPolicyOf = (config: AppConfig, max: number): RateLimitPolicy | null =>
  config.RATE_LIMIT_ENABLED ? { max, windowMs: config.RATE_LIMIT_WINDOW_MS } : null;

const asJsonObject = (value: JsonValue): JsonObject => (isJsonObject(value) ? value : {});

const themeCaveatsFrom =
  (formats: FormatRegistry): ThemeCaveatProvider =>
  (theme) =>
    Object.fromEntries(
      formats
        .backends()
        .map((backend) => [backend.descriptor.id, backend.describeThemeCaveats(theme)]),
    );

const themeExtensionValidatorsFrom = (
  formats: FormatRegistry,
): readonly ThemeExtensionValidator[] =>
  formats.backends().map((backend) => ({
    formatId: backend.descriptor.id,
    validate: (_themeId, extension) => {
      const outcome = backend.validateThemeExtension(asJsonObject(extension));
      return outcome.ok ? [] : outcome.issues;
    },
  }));

export const buildServer = async (
  config: AppConfig,
  overrides: Partial<ServerDependencies> = {},
): Promise<FastifyInstance> => {
  const exposeDiagnostics = config.NODE_ENV !== "production";
  const readiness: ReadinessState = overrides.readiness ?? createReadinessState();

  const app = Fastify({
    logger:
      overrides.logStream === undefined
        ? buildLoggerOptions(config)
        : {
            level: config.LOG_LEVEL,
            redact: { paths: [...LOG_REDACTION_PATHS], remove: true },
            stream: overrides.logStream,
          },
    bodyLimit: config.MAX_MARKDOWN_BYTES,
    genReqId: (request) => readIncomingRequestId(request),
    trustProxy: config.TRUST_PROXY.length === 0 ? false : [...config.TRUST_PROXY],
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addContentTypeParser(
    [...MARKDOWN_CONTENT_TYPES],
    { parseAs: "string" },
    (_request, payload, done) => {
      done(null, payload);
    },
  );

  await app.register(helmet, { contentSecurityPolicy: config.NODE_ENV === "production" });

  if (config.NODE_ENV !== "production") {
    await app.register(cors, { origin: true });
  } else if (config.CORS_ORIGINS.length > 0) {
    await app.register(cors, { origin: [...config.CORS_ORIGINS] });
  }

  if (config.NODE_ENV === "production") {
    await app.register(underPressure, {
      maxEventLoopDelay: UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS,
      maxHeapUsedBytes: UNDER_PRESSURE_MAX_HEAP_USED_BYTES,
      maxRssBytes: UNDER_PRESSURE_MAX_RSS_BYTES,
      retryAfter: UNDER_PRESSURE_RETRY_AFTER_SECONDS,
    });
  }

  app.addHook("onSend", async (request, reply) => {
    void reply.header(RESPONSE_REQUEST_ID_HEADER, request.id);
  });

  app.setErrorHandler((thrown, request: FastifyRequest, reply) => {
    const appError = mapThrownToAppError(thrown);
    const body = toErrorResponseBody(appError, {
      requestId: request.id,
      exposeDiagnostics,
    });
    if (appError.statusCode >= 500) {
      request.log.error({ err: appError, code: appError.code }, appError.message);
    } else {
      request.log.warn({ code: appError.code, details: appError.details }, appError.message);
    }
    const retryAfter = retryAfterHeaderOf(appError);
    if (retryAfter !== null) {
      void reply.header("Retry-After", retryAfter);
    }
    return reply.code(appError.statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const notFound = new AppError("VALIDATION_ERROR", "Route not found.", {
      details: { method: request.method, url: request.url },
    });
    return reply.code(404).send(
      toErrorResponseBody(notFound, {
        requestId: request.id,
        exposeDiagnostics,
      }),
    );
  });

  const formats: FormatRegistry =
    overrides.formats ?? createFormatRegistry({ config, logger: app.log });

  const themes: ThemeRegistry =
    overrides.themes ??
    (await createThemeRegistry({
      config,
      logger: app.log,
      extensionValidators: themeExtensionValidatorsFrom(formats),
    }));
  readiness.themesLoaded = true;

  themes.onReload((report) => {
    for (const summary of report.loaded) {
      formats.invalidateThemeCache(summary.id);
    }
  });

  await warmUpHighlighter();
  await formats.warmUpAll();
  readiness.formatsWarmedUp = true;

  app.addHook("onClose", async () => {
    if (overrides.themes === undefined) {
      await themes.close();
    }
  });

  await registerOpenApi(app, config, formats);

  const semaphore = createSemaphore({
    permits: config.MAX_CONCURRENCY,
    maximumQueueLength: config.MAX_CONCURRENCY * CONVERSION_QUEUE_FACTOR,
  });

  const catalogueRateLimit = rateLimitPolicyOf(config, config.RATE_LIMIT_MAX);
  const conversionRateLimit = rateLimitPolicyOf(config, config.RATE_LIMIT_CONVERT_MAX);

  await app.register(healthRoutes(readiness));
  await app.register(
    async (catalogue) => {
      if (catalogueRateLimit !== null) {
        await registerRateLimit(catalogue, catalogueRateLimit);
      }
      await catalogue.register(
        themeRoutes(themes, overrides.themeCaveats ?? themeCaveatsFrom(formats)),
      );
      await catalogue.register(formatRoutes(formats));
    },
    { prefix: API_VERSION_PREFIX },
  );
  await app.register(
    async (conversion) => {
      if (conversionRateLimit !== null) {
        await registerRateLimit(conversion, conversionRateLimit);
      }
      await conversion.register(convertRoutes({ config, themes, formats, semaphore }));
    },
    { prefix: API_VERSION_PREFIX },
  );

  if (config.ENABLE_PREVIEW) {
    await app.register(previewRoutes(themes, formats));
  }

  return app;
};
