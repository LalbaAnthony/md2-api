import type {
  AppErrorOptions,
  ErrorCode,
  ErrorRenderOptions,
  ErrorResponseBody,
} from "./types/errors.ts";
import type { JsonObject } from "./types/json.ts";

const HTTP_STATUS_BY_ERROR_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  PAYLOAD_TOO_LARGE: 413,
  NESTING_TOO_DEEP: 422,
  THEME_NOT_FOUND: 404,
  FORMAT_NOT_FOUND: 404,
  NOT_ACCEPTABLE: 406,
  UNSUPPORTED_NODE: 422,
  UNSUPPORTED_FEATURE: 422,
  DIRECTIVE_ERROR: 422,
  IMAGE_ERROR: 422,
  THEME_EXTENSION_ERROR: 422,
  CONVERSION_TIMEOUT: 504,
  OVERLOADED: 503,
  INTERNAL: 500,
};

const INTERNAL_PUBLIC_MESSAGE = "An unexpected error occurred.";

export const httpStatusForErrorCode = (code: ErrorCode): number => HTTP_STATUS_BY_ERROR_CODE[code];

export const isErrorCode = (candidate: string): candidate is ErrorCode =>
  Object.prototype.hasOwnProperty.call(HTTP_STATUS_BY_ERROR_CODE, candidate);

export const errorCodes = (): readonly ErrorCode[] =>
  Object.keys(HTTP_STATUS_BY_ERROR_CODE).filter(isErrorCode);

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: JsonObject;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = HTTP_STATUS_BY_ERROR_CODE[code];
    this.details = options.details ?? {};
  }
}

export const isAppError = (candidate: unknown): candidate is AppError =>
  candidate instanceof AppError;

export const validationError = (message: string, details: JsonObject = {}): AppError =>
  new AppError("VALIDATION_ERROR", message, { details });

export const payloadTooLargeError = (message: string, details: JsonObject = {}): AppError =>
  new AppError("PAYLOAD_TOO_LARGE", message, { details });

export const nestingTooDeepError = (depth: number, maximumDepth: number): AppError =>
  new AppError("NESTING_TOO_DEEP", "The document nests blocks beyond the configured limit.", {
    details: { depth, maximumDepth },
  });

export const themeNotFoundError = (themeId: string, available: readonly string[]): AppError =>
  new AppError("THEME_NOT_FOUND", `Unknown theme: ${themeId}`, {
    details: { requested: themeId, available: [...available] },
  });

export const formatNotFoundError = (formatId: string, available: readonly string[]): AppError =>
  new AppError("FORMAT_NOT_FOUND", `Unknown or disabled output format: ${formatId}`, {
    details: { requested: formatId, available: [...available] },
  });

export const notAcceptableError = (accept: string, supported: readonly string[]): AppError =>
  new AppError("NOT_ACCEPTABLE", "No active output format satisfies the Accept header.", {
    details: { accept, supported: [...supported] },
  });

export const unsupportedNodeError = (nodeType: string, details: JsonObject = {}): AppError =>
  new AppError("UNSUPPORTED_NODE", `Unsupported markdown node: ${nodeType}`, {
    details: { ...details, nodeType },
  });

export const unsupportedFeatureError = (capability: string, details: JsonObject = {}): AppError =>
  new AppError(
    "UNSUPPORTED_FEATURE",
    `The selected output format does not support the required capability: ${capability}`,
    { details: { ...details, capability } },
  );

export const directiveError = (message: string, details: JsonObject = {}): AppError =>
  new AppError("DIRECTIVE_ERROR", message, { details });

export const imageError = (message: string, details: JsonObject = {}): AppError =>
  new AppError("IMAGE_ERROR", message, { details });

export const themeExtensionError = (message: string, details: JsonObject = {}): AppError =>
  new AppError("THEME_EXTENSION_ERROR", message, { details });

export const conversionTimeoutError = (timeoutMs: number): AppError =>
  new AppError("CONVERSION_TIMEOUT", "Conversion exceeded the configured time budget.", {
    details: { timeoutMs },
  });

export const overloadedError = (retryAfterSeconds: number): AppError =>
  new AppError("OVERLOADED", "The service is overloaded, retry later.", {
    details: { retryAfterSeconds },
  });

export const internalError = (message: string, cause?: unknown): AppError =>
  new AppError("INTERNAL", message, cause === undefined ? {} : { cause });

export const toAppError = (thrown: unknown): AppError => {
  if (isAppError(thrown)) {
    return thrown;
  }
  if (thrown instanceof Error) {
    return internalError(thrown.message, thrown);
  }
  return internalError(INTERNAL_PUBLIC_MESSAGE, thrown);
};

const describeCause = (cause: unknown): string | null => {
  if (cause === undefined || cause === null) {
    return null;
  }
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (typeof cause === "number" || typeof cause === "boolean" || typeof cause === "bigint") {
    return cause.toString();
  }
  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause);
    } catch {
      return "Unserialisable cause.";
    }
  }
  return `Unserialisable cause of type ${typeof cause}.`;
};

export const toErrorResponseBody = (
  error: AppError,
  options: ErrorRenderOptions,
): ErrorResponseBody => {
  const publicMessage =
    error.code === "INTERNAL" && !options.exposeDiagnostics
      ? INTERNAL_PUBLIC_MESSAGE
      : error.message;

  if (!options.exposeDiagnostics) {
    return {
      error: {
        code: error.code,
        message: publicMessage,
        details: error.code === "INTERNAL" ? {} : error.details,
        requestId: options.requestId,
      },
    };
  }

  const cause = describeCause(error.cause);
  return {
    error: {
      code: error.code,
      message: publicMessage,
      details: error.details,
      requestId: options.requestId,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
      ...(cause === null ? {} : { cause }),
    },
  };
};

export const assertNever = (unreachable: never, context: string): never => {
  throw internalError(`Unhandled variant in ${context}: ${JSON.stringify(unreachable)}`);
};
