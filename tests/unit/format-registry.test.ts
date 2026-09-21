import { describe, expect, it } from "vitest";
import { isAppError } from "../../src/errors.ts";
import { createFormatRegistry } from "../../src/formats/registry.ts";
import { debugJsonBackend } from "../../src/formats/debug-json/backend.ts";
import { createRecordingLogger } from "../helpers/theme-fixtures.ts";
import { fakeBackend } from "../helpers/format-fixtures.ts";
import type { FormatBackend, FormatRegistryConfig } from "../../src/types/format.ts";

const configFor = (
  nodeEnvironment: FormatRegistryConfig["NODE_ENV"],
  enabledFormats: readonly string[],
  defaultFormat = "docx",
): FormatRegistryConfig => ({
  NODE_ENV: nodeEnvironment,
  ENABLED_FORMATS: enabledFormats,
  DEFAULT_FORMAT: defaultFormat,
});

const productionReadyBackend: FormatBackend = fakeBackend(
  "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  true,
);

const candidates: readonly FormatBackend[] = [productionReadyBackend, debugJsonBackend];

describe("registration in development", () => {
  it("registers the development only backend even when it is not enabled", () => {
    const registry = createFormatRegistry({
      config: configFor("development", ["docx"]),
      logger: createRecordingLogger(),
      candidates,
    });
    expect(registry.ids()).toEqual(["docx", "debug-json"]);
  });

  it("registers the development only backend in the test environment", () => {
    const registry = createFormatRegistry({
      config: configFor("test", ["docx"]),
      logger: createRecordingLogger(),
      candidates,
    });
    expect(registry.ids()).toContain("debug-json");
  });

  it("omits a production ready backend that is not enabled", () => {
    const registry = createFormatRegistry({
      config: configFor("development", []),
      logger: createRecordingLogger(),
      candidates,
    });
    expect(registry.ids()).toEqual(["debug-json"]);
  });
});

describe("registration in production", () => {
  it("never registers a backend that is not production ready", () => {
    const registry = createFormatRegistry({
      config: configFor("production", ["docx"]),
      logger: createRecordingLogger(),
      candidates,
    });
    expect(registry.ids()).toEqual(["docx"]);
    expect(registry.resolve("debug-json")).toBeNull();
  });

  it("refuses to start when a backend that is not production ready is enabled", () => {
    try {
      createFormatRegistry({
        config: configFor("production", ["docx", "debug-json"]),
        logger: createRecordingLogger(),
        candidates,
      });
      expect.unreachable("Expected the registry to refuse to start.");
    } catch (thrown) {
      expect(isAppError(thrown)).toBe(true);
      if (isAppError(thrown)) {
        expect(thrown.code).toBe("VALIDATION_ERROR");
        expect(JSON.stringify(thrown.details)).toContain("debug-json");
      }
    }
  });

  it("warns about an enabled format that no backend implements", () => {
    const logger = createRecordingLogger();
    const registry = createFormatRegistry({
      config: configFor("production", ["docx", "pdf"]),
      logger,
      candidates,
    });
    expect(registry.ids()).toEqual(["docx"]);
    expect(
      logger.entries.some(
        (entry) => entry.level === "warn" && entry.message.includes("no backend"),
      ),
    ).toBe(true);
  });
});

describe("resolution", () => {
  const registry = createFormatRegistry({
    config: configFor("development", ["docx"]),
    logger: createRecordingLogger(),
    candidates,
  });

  it("resolves a registered identifier", () => {
    expect(registry.resolve("docx")?.descriptor.id).toBe("docx");
  });

  it("returns null for an unknown identifier", () => {
    expect(registry.resolve("pdf")).toBeNull();
    expect(registry.resolve("")).toBeNull();
  });

  it("lists descriptors, not backends", () => {
    const listed = registry.list();
    expect(listed.map((descriptor) => descriptor.id)).toEqual(["docx", "debug-json"]);
    expect(listed[0]).toHaveProperty("capabilities");
    expect(listed[0]).not.toHaveProperty("convert");
  });
});

describe("lifecycle", () => {
  it("warms every registered backend up", async () => {
    const registry = createFormatRegistry({
      config: configFor("development", ["docx"]),
      logger: createRecordingLogger(),
      candidates,
    });
    await expect(registry.warmUpAll()).resolves.toBeUndefined();
  });

  it("forwards a cache invalidation to every registered backend", () => {
    const registry = createFormatRegistry({
      config: configFor("development", ["docx"]),
      logger: createRecordingLogger(),
      candidates,
    });
    expect(() => {
      registry.invalidateThemeCache("default");
    }).not.toThrow();
  });
});

describe("the real backend table", () => {
  it("exposes debug-json outside production and nothing else yet", () => {
    const registry = createFormatRegistry({
      config: configFor("development", ["docx"]),
      logger: createRecordingLogger(),
    });
    expect(registry.ids()).toEqual(["debug-json"]);
  });

  it("exposes no backend in production while the docx backend does not exist", () => {
    const registry = createFormatRegistry({
      config: configFor("production", ["docx"]),
      logger: createRecordingLogger(),
    });
    expect(registry.ids()).toEqual([]);
  });
});
