import { describe, expect, it } from "vitest";
import {
  AppError,
  assertNever,
  conversionTimeoutError,
  directiveError,
  errorCodes,
  formatNotFoundError,
  httpStatusForErrorCode,
  imageError,
  internalError,
  isAppError,
  isErrorCode,
  notAcceptableError,
  overloadedError,
  payloadTooLargeError,
  rateLimitedError,
  themeExtensionError,
  themeNotFoundError,
  toAppError,
  toErrorResponseBody,
  unsupportedFeatureError,
  unsupportedNodeError,
  validationError,
} from "../../src/errors.ts";
import type { ErrorCode } from "../../src/types/errors.ts";

const EXPECTED_STATUS: ReadonlyArray<readonly [ErrorCode, number]> = [
  ["VALIDATION_ERROR", 400],
  ["PAYLOAD_TOO_LARGE", 413],
  ["NESTING_TOO_DEEP", 422],
  ["THEME_NOT_FOUND", 404],
  ["FORMAT_NOT_FOUND", 404],
  ["NOT_ACCEPTABLE", 406],
  ["UNSUPPORTED_NODE", 422],
  ["UNSUPPORTED_FEATURE", 422],
  ["DIRECTIVE_ERROR", 422],
  ["IMAGE_ERROR", 422],
  ["THEME_EXTENSION_ERROR", 422],
  ["CONVERSION_TIMEOUT", 504],
  ["RATE_LIMITED", 429],
  ["OVERLOADED", 503],
  ["INTERNAL", 500],
];

describe("code to status mapping", () => {
  it.each(EXPECTED_STATUS)("maps %s to HTTP %d", (code, status) => {
    expect(httpStatusForErrorCode(code)).toBe(status);
  });

  it("covers every declared code exactly once", () => {
    expect([...errorCodes()].sort()).toEqual(EXPECTED_STATUS.map(([code]) => code).sort());
  });

  it("recognises known codes only", () => {
    expect(isErrorCode("INTERNAL")).toBe(true);
    expect(isErrorCode("NOPE")).toBe(false);
  });
});

describe("factories", () => {
  it("builds each documented error with its status and details", () => {
    expect(validationError("bad").statusCode).toBe(400);
    expect(payloadTooLargeError("too big").statusCode).toBe(413);
    expect(themeNotFoundError("ghost", ["default"]).details).toEqual({
      requested: "ghost",
      available: ["default"],
    });
    expect(formatNotFoundError("pdf", ["docx"]).statusCode).toBe(404);
    expect(notAcceptableError("image/png", ["application/pdf"]).statusCode).toBe(406);
    expect(unsupportedNodeError("html").details).toMatchObject({ nodeType: "html" });
    expect(unsupportedFeatureError("columns").details).toMatchObject({ capability: "columns" });
    expect(directiveError("unknown directive").statusCode).toBe(422);
    expect(imageError("unreachable").statusCode).toBe(422);
    expect(themeExtensionError("unknown key").statusCode).toBe(422);
    expect(conversionTimeoutError(30_000).details).toEqual({ timeoutMs: 30_000 });
    expect(overloadedError(5).details).toEqual({ retryAfterSeconds: 5 });
    expect(rateLimitedError(12).statusCode).toBe(429);
    expect(rateLimitedError(12).details).toEqual({ retryAfterSeconds: 12 });
    expect(internalError("boom").statusCode).toBe(500);
  });

  it("recognises its own instances", () => {
    expect(isAppError(validationError("bad"))).toBe(true);
    expect(isAppError(new Error("bad"))).toBe(false);
    expect(isAppError("bad")).toBe(false);
  });
});

describe("wrapping unknown throws", () => {
  it("passes application errors through unchanged", () => {
    const original = imageError("unreachable");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps a native error and keeps the cause", () => {
    const native = new TypeError("bad input");
    const wrapped = toAppError(native);
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.cause).toBe(native);
  });

  it("wraps a non error value", () => {
    const wrapped = toAppError("plain string");
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.cause).toBe("plain string");
  });
});

describe("response rendering", () => {
  it("hides internal details outside development", () => {
    const rendered = toErrorResponseBody(internalError("secret detail", new Error("inner")), {
      requestId: "req-1",
      exposeDiagnostics: false,
    });
    expect(rendered.error.message).toBe("An unexpected error occurred.");
    expect(rendered.error.details).toEqual({});
    expect(rendered.error.stack).toBeUndefined();
    expect(rendered.error.cause).toBeUndefined();
    expect(rendered.error.requestId).toBe("req-1");
  });

  it("keeps client error details outside development", () => {
    const rendered = toErrorResponseBody(themeNotFoundError("ghost", ["default"]), {
      requestId: "req-2",
      exposeDiagnostics: false,
    });
    expect(rendered.error.details).toEqual({ requested: "ghost", available: ["default"] });
  });

  it("exposes stack and cause in development", () => {
    const rendered = toErrorResponseBody(internalError("boom", new Error("inner")), {
      requestId: "req-3",
      exposeDiagnostics: true,
    });
    expect(rendered.error.message).toBe("boom");
    expect(rendered.error.stack).toContain("AppError");
    expect(rendered.error.cause).toBe("Error: inner");
  });

  it("omits an absent cause in development", () => {
    const rendered = toErrorResponseBody(new AppError("IMAGE_ERROR", "no cause"), {
      requestId: "req-4",
      exposeDiagnostics: true,
    });
    expect(rendered.error.cause).toBeUndefined();
  });

  it("describes primitive causes in development", () => {
    expect(
      toErrorResponseBody(internalError("boom", 42), {
        requestId: "req-6",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe("42");
    expect(
      toErrorResponseBody(internalError("boom", true), {
        requestId: "req-7",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe("true");
    expect(
      toErrorResponseBody(internalError("boom", 7n), {
        requestId: "req-8",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe("7");
  });

  it("serialises an object cause in development", () => {
    expect(
      toErrorResponseBody(internalError("boom", { host: "example.invalid" }), {
        requestId: "req-9",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe('{"host":"example.invalid"}');
  });

  it("survives a circular object cause in development", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(
      toErrorResponseBody(internalError("boom", circular), {
        requestId: "req-10",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe("Unserialisable cause.");
  });

  it("names an unserialisable cause kind in development", () => {
    expect(
      toErrorResponseBody(internalError("boom", Symbol("token")), {
        requestId: "req-11",
        exposeDiagnostics: true,
      }).error.cause,
    ).toBe("Unserialisable cause of type symbol.");
  });

  it("describes a non error cause in development", () => {
    const rendered = toErrorResponseBody(internalError("boom", "string cause"), {
      requestId: "req-5",
      exposeDiagnostics: true,
    });
    expect(rendered.error.cause).toBe("string cause");
  });
});

type SampleKind = "first" | "second";

const classifySampleKind = (kind: SampleKind): string => {
  switch (kind) {
    case "first":
      return "leading";
    case "second":
      return "trailing";
    default:
      return assertNever(kind, "classifySampleKind");
  }
};

describe("exhaustiveness guard", () => {
  it("returns the mapped value for every declared variant", () => {
    expect(classifySampleKind("first")).toBe("leading");
    expect(classifySampleKind("second")).toBe("trailing");
  });

  it("throws an internal error when an undeclared variant reaches it", () => {
    const undeclared: SampleKind = JSON.parse('"third"');
    expect(() => classifySampleKind(undeclared)).toThrow(/Unhandled variant/);
  });
});
