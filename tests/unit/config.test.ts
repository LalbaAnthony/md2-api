import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { isAppError } from "../../src/errors.ts";

const expectValidationFailure = (load: () => unknown, variable: string): void => {
  try {
    load();
    expect.unreachable("Expected the configuration to be rejected.");
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    if (isAppError(thrown)) {
      expect(thrown.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(thrown.details)).toContain(variable);
    }
  }
};

describe("defaults", () => {
  it("applies documented defaults in development", () => {
    const config = loadConfig({});
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.STRICT).toBe(true);
    expect(config.ENABLE_SWAGGER_UI).toBe(true);
    expect(config.ENABLED_FORMATS).toEqual(["docx"]);
    expect(config.MAX_MARKDOWN_BYTES).toBe(2_000_000);
    expect(config.ALLOW_RAW_HTML).toBe(false);
  });

  it("applies documented defaults in production", () => {
    const config = loadConfig({ NODE_ENV: "production" });
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.STRICT).toBe(false);
    expect(config.ENABLE_SWAGGER_UI).toBe(false);
  });
});

describe("boolean parsing", () => {
  it("treats textual falsehood as false", () => {
    for (const raw of ["false", "0", "no", "off", ""]) {
      expect(loadConfig({ ALLOW_LOCAL_IMAGES: raw }).ALLOW_LOCAL_IMAGES).toBe(false);
    }
  });

  it("treats textual truth as true", () => {
    for (const raw of ["true", "1", "yes", "on", "TRUE"]) {
      expect(loadConfig({ ALLOW_LOCAL_IMAGES: raw }).ALLOW_LOCAL_IMAGES).toBe(true);
    }
  });

  it("rejects an unparseable boolean", () => {
    expectValidationFailure(
      () => loadConfig({ ALLOW_LOCAL_IMAGES: "maybe" }),
      "ALLOW_LOCAL_IMAGES",
    );
  });
});

describe("list parsing", () => {
  it("splits and trims comma separated lists", () => {
    const config = loadConfig({
      ENABLED_FORMATS: "docx, debug-json ",
      DEFAULT_FORMAT: "docx",
      IMAGE_ALLOWLIST: " cdn.example.com ,images.example.org",
      CORS_ORIGINS: "",
    });
    expect(config.ENABLED_FORMATS).toEqual(["docx", "debug-json"]);
    expect(config.IMAGE_ALLOWLIST).toEqual(["cdn.example.com", "images.example.org"]);
    expect(config.CORS_ORIGINS).toEqual([]);
  });
});

describe("production invariants", () => {
  it("refuses a preview route in production", () => {
    expectValidationFailure(
      () => loadConfig({ NODE_ENV: "production", ENABLE_PREVIEW: "true" }),
      "ENABLE_PREVIEW",
    );
  });

  it("refuses theme watching in production", () => {
    expectValidationFailure(
      () => loadConfig({ NODE_ENV: "production", ENABLE_THEME_WATCH: "true" }),
      "ENABLE_THEME_WATCH",
    );
  });

  it("refuses remote images without an allowlist in production", () => {
    expectValidationFailure(
      () => loadConfig({ NODE_ENV: "production", ALLOW_REMOTE_IMAGES: "true" }),
      "IMAGE_ALLOWLIST",
    );
  });

  it("accepts remote images with an allowlist in production", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      ALLOW_REMOTE_IMAGES: "true",
      IMAGE_ALLOWLIST: "cdn.example.com",
    });
    expect(config.ALLOW_REMOTE_IMAGES).toBe(true);
  });

  it("tolerates preview and theme watching outside production", () => {
    const config = loadConfig({ NODE_ENV: "development", ENABLE_PREVIEW: "true" });
    expect(config.ENABLE_PREVIEW).toBe(true);
  });
});

describe("format selection", () => {
  it("refuses a default format absent from the enabled formats", () => {
    expectValidationFailure(
      () => loadConfig({ ENABLED_FORMATS: "docx", DEFAULT_FORMAT: "debug-json" }),
      "DEFAULT_FORMAT",
    );
  });

  it("refuses an empty format list", () => {
    expectValidationFailure(() => loadConfig({ ENABLED_FORMATS: " " }), "ENABLED_FORMATS");
  });
});

describe("locked switches", () => {
  it("refuses to enable raw HTML", () => {
    expectValidationFailure(() => loadConfig({ ALLOW_RAW_HTML: "true" }), "ALLOW_RAW_HTML");
  });
});

describe("numeric bounds", () => {
  it("rejects a port outside the valid range", () => {
    expectValidationFailure(() => loadConfig({ PORT: "70000" }), "PORT");
  });

  it("rejects a non numeric limit", () => {
    expectValidationFailure(() => loadConfig({ MAX_CONCURRENCY: "many" }), "MAX_CONCURRENCY");
  });
});
