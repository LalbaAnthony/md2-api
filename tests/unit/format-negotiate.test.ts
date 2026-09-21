import { describe, expect, it } from "vitest";
import { isAppError } from "../../src/errors.ts";
import { acceptsAnything, parseAcceptHeader, selectFormat } from "../../src/formats/negotiate.ts";
import { createFormatRegistry } from "../../src/formats/registry.ts";
import { createRecordingLogger } from "../helpers/theme-fixtures.ts";
import { fakeBackend } from "../helpers/format-fixtures.ts";
import type { FormatRegistry } from "../../src/types/format.ts";

const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const registry: FormatRegistry = createFormatRegistry({
  config: { NODE_ENV: "development", ENABLED_FORMATS: ["docx"], DEFAULT_FORMAT: "docx" },
  logger: createRecordingLogger(),
  candidates: [
    fakeBackend("docx", DOCX_MEDIA_TYPE, true),
    fakeBackend("debug-json", "application/json", false),
  ],
});

const expectFailure = (call: () => unknown, code: string): void => {
  try {
    call();
    expect.unreachable("Expected the selection to fail.");
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    if (isAppError(thrown)) {
      expect(thrown.code).toBe(code);
    }
  }
};

describe("parsing an Accept header", () => {
  it("splits and lowercases media types", () => {
    expect(parseAcceptHeader("Application/JSON, text/plain")).toEqual([
      { mediaType: "application/json", quality: 1 },
      { mediaType: "text/plain", quality: 1 },
    ]);
  });

  it("orders by quality, highest first", () => {
    expect(parseAcceptHeader("text/plain;q=0.3, application/json;q=0.9")).toEqual([
      { mediaType: "application/json", quality: 0.9 },
      { mediaType: "text/plain", quality: 0.3 },
    ]);
  });

  it("drops an entry of zero quality", () => {
    expect(parseAcceptHeader("application/json;q=0")).toEqual([]);
  });

  it("treats an unparseable quality as zero", () => {
    expect(parseAcceptHeader("application/json;q=high")).toEqual([]);
  });

  it("returns nothing for an empty header", () => {
    expect(parseAcceptHeader("")).toEqual([]);
    expect(parseAcceptHeader(" , ")).toEqual([]);
  });

  it("recognises a wildcard", () => {
    expect(acceptsAnything(parseAcceptHeader("*/*"))).toBe(true);
    expect(acceptsAnything(parseAcceptHeader("application/json, */*;q=0.1"))).toBe(true);
    expect(acceptsAnything(parseAcceptHeader("application/json"))).toBe(false);
    expect(acceptsAnything([])).toBe(true);
  });
});

describe("precedence", () => {
  it("prefers the body format over everything else", () => {
    const selection = selectFormat(registry, {
      bodyFormat: "debug-json",
      queryFormat: "docx",
      acceptHeader: DOCX_MEDIA_TYPE,
      defaultFormat: "docx",
    });
    expect(selection.backend.descriptor.id).toBe("debug-json");
    expect(selection.source).toBe("body");
  });

  it("prefers the query format over the header and the default", () => {
    const selection = selectFormat(registry, {
      queryFormat: "debug-json",
      acceptHeader: DOCX_MEDIA_TYPE,
      defaultFormat: "docx",
    });
    expect(selection.backend.descriptor.id).toBe("debug-json");
    expect(selection.source).toBe("query");
  });

  it("prefers an exact Accept match over the default", () => {
    const selection = selectFormat(registry, {
      acceptHeader: "application/json",
      defaultFormat: "docx",
    });
    expect(selection.backend.descriptor.id).toBe("debug-json");
    expect(selection.source).toBe("accept");
  });

  it("honours the quality order of the Accept header", () => {
    const selection = selectFormat(registry, {
      acceptHeader: `application/json;q=0.2, ${DOCX_MEDIA_TYPE};q=0.8`,
      defaultFormat: "debug-json",
    });
    expect(selection.backend.descriptor.id).toBe("docx");
  });

  it("falls back to the default format on a wildcard", () => {
    const selection = selectFormat(registry, { acceptHeader: "*/*", defaultFormat: "docx" });
    expect(selection.backend.descriptor.id).toBe("docx");
    expect(selection.source).toBe("default");
  });

  it("falls back to the default format without any hint", () => {
    const selection = selectFormat(registry, { defaultFormat: "docx" });
    expect(selection.source).toBe("default");
  });
});

describe("failures", () => {
  it("rejects an unknown body format", () => {
    expectFailure(
      () => selectFormat(registry, { bodyFormat: "pdf", defaultFormat: "docx" }),
      "FORMAT_NOT_FOUND",
    );
  });

  it("rejects an unknown query format", () => {
    expectFailure(
      () => selectFormat(registry, { queryFormat: "pdf", defaultFormat: "docx" }),
      "FORMAT_NOT_FOUND",
    );
  });

  it("rejects an Accept header that no active format satisfies", () => {
    expectFailure(
      () => selectFormat(registry, { acceptHeader: "application/pdf", defaultFormat: "docx" }),
      "NOT_ACCEPTABLE",
    );
  });

  it("names the supported media types when the Accept header fails", () => {
    try {
      selectFormat(registry, { acceptHeader: "application/pdf", defaultFormat: "docx" });
      expect.unreachable("Expected the selection to fail.");
    } catch (thrown) {
      if (isAppError(thrown)) {
        expect(thrown.details).toEqual({
          accept: "application/pdf",
          supported: [DOCX_MEDIA_TYPE, "application/json"],
        });
      }
    }
  });

  it("rejects a default format that is not registered", () => {
    expectFailure(() => selectFormat(registry, { defaultFormat: "pdf" }), "FORMAT_NOT_FOUND");
  });
});
