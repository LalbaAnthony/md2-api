export const REQUEST_ID_HEADER = "x-request-id";
export const RESPONSE_REQUEST_ID_HEADER = "X-Request-Id";
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export const MEGABYTE = 1_048_576;

export const UNDER_PRESSURE_MAX_EVENT_LOOP_DELAY_MS = 1_000;
export const UNDER_PRESSURE_MAX_HEAP_USED_BYTES = 700 * MEGABYTE;
export const UNDER_PRESSURE_MAX_RSS_BYTES = 900 * MEGABYTE;
export const UNDER_PRESSURE_RETRY_AFTER_SECONDS = 5;

export const API_VERSION_PREFIX = "/v1";

export const SERVER_PORT = 3000;
export const SERVER_HOST = "0.0.0.0";

export const SHUTDOWN_GRACE_PERIOD_MS = 10_000;

export const LOG_REDACTION_PATHS: readonly string[] = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body",
  "body",
  "markdown",
];

export const DEFAULT_DOCUMENT_LANGUAGE = "en";
export const MARKDOWN_CONTENT_TYPES: readonly string[] = [
  "text/markdown",
  "text/x-markdown",
  "text/plain",
];
export const CONVERSION_QUEUE_FACTOR = 8;
