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
  LOG_REDACTION_PATHS,
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
import { createReadinessState } from "./lib/readiness.ts";
import { healthRoutes } from "./routes/health.ts";
import type { AppConfig } from "./types/config.ts";
import type { ReadinessState } from "./types/api.ts";
import type { JsonObject } from "./types/json.ts";

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

export const buildServer = async (
  config: AppConfig,
  readiness: ReadinessState = createReadinessState(),
): Promise<FastifyInstance> => {
  const exposeDiagnostics = config.NODE_ENV !== "production";

  const app = Fastify({
    logger: buildLoggerOptions(config),
    bodyLimit: config.MAX_MARKDOWN_BYTES,
    genReqId: (request) => readIncomingRequestId(request),
    trustProxy: false,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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
    if (appError.code === "OVERLOADED") {
      void reply.header("Retry-After", String(UNDER_PRESSURE_RETRY_AFTER_SECONDS));
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

  await app.register(healthRoutes(readiness));

  return app;
};
