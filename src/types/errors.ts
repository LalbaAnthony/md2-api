import type { JsonObject } from "./json.ts";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "THEME_NOT_FOUND"
  | "FORMAT_NOT_FOUND"
  | "NOT_ACCEPTABLE"
  | "UNSUPPORTED_NODE"
  | "UNSUPPORTED_FEATURE"
  | "DIRECTIVE_ERROR"
  | "IMAGE_ERROR"
  | "THEME_EXTENSION_ERROR"
  | "CONVERSION_TIMEOUT"
  | "OVERLOADED"
  | "INTERNAL";

export interface AppErrorOptions {
  readonly details?: JsonObject;
  readonly cause?: unknown;
}

export interface ErrorPayload {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details: JsonObject;
  readonly requestId: string;
  readonly stack?: string;
  readonly cause?: string;
}

export interface ErrorResponseBody {
  readonly error: ErrorPayload;
}

export interface ErrorRenderOptions {
  readonly requestId: string;
  readonly exposeDiagnostics: boolean;
}
