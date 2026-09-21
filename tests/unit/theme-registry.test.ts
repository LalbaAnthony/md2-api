import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { isAppError } from "../../src/errors.ts";
import { createThemeRegistry } from "../../src/theme/registry.ts";
import {
  createRecordingLogger,
  createThemeDirectory,
  customTheme,
  removeThemeDirectory,
  themeAsJsonObject,
  writeThemeFile,
} from "../helpers/theme-fixtures.ts";
import type { RecordingLogger } from "../helpers/theme-fixtures.ts";
import type { AppConfig, EnvironmentSource } from "../../src/types/config.ts";
import type { ThemeRegistry } from "../../src/types/theme-registry.ts";

let directory = "";
let logger: RecordingLogger = createRecordingLogger();
let registry: ThemeRegistry | null = null;

beforeEach(async () => {
  directory = await createThemeDirectory();
  logger = createRecordingLogger();
});

afterEach(async () => {
  if (registry !== null) {
    await registry.close();
    registry = null;
  }
  await removeThemeDirectory(directory);
});

const configFor = (overrides: EnvironmentSource = {}): AppConfig =>
  loadConfig({ NODE_ENV: "test", LOG_LEVEL: "fatal", THEMES_DIR: directory, ...overrides });

const build = async (overrides: EnvironmentSource = {}): Promise<ThemeRegistry> => {
  registry = await createThemeRegistry({ config: configFor(overrides), logger });
  return registry;
};

describe("built in themes", () => {
  it("always exposes the default theme", async () => {
    const created = await build();
    expect(created.ids()).toContain("default");
    expect(created.get("default")?.label).toBe("Default");
    expect(created.has("default")).toBe(true);
  });

  it("marks a built in theme as such and hashes it", async () => {
    const created = await build();
    const record = created.record("default");
    expect(record?.origin).toBe("builtin");
    expect(record?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns null for an unknown theme", async () => {
    const created = await build();
    expect(created.get("ghost")).toBeNull();
    expect(created.record("ghost")).toBeNull();
    expect(created.has("ghost")).toBe(false);
  });

  it("tolerates a missing theme directory", async () => {
    registry = await createThemeRegistry({
      config: configFor({ THEMES_DIR: "./does-not-exist" }),
      logger,
    });
    expect(registry.ids()).toEqual(["default"]);
  });
});

describe("themes from the directory", () => {
  it("loads a valid theme file", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    const created = await build();
    expect(created.ids()).toContain("report");
    expect(created.record("report")?.origin).toBe("directory");
  });

  it("gives a different hash to a different theme", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    const created = await build();
    expect(created.record("report")?.hash).not.toBe(created.record("default")?.hash);
  });

  it("overrides a built in theme and warns", async () => {
    const override = themeAsJsonObject();
    override["label"] = "Overridden default";
    await writeThemeFile(directory, "default.json", override);
    const created = await build();
    expect(created.get("default")?.label).toBe("Overridden default");
    expect(created.record("default")?.origin).toBe("directory");
    expect(created.report().overridden).toEqual(["default"]);
    expect(logger.entries.some((entry) => entry.level === "warn")).toBe(true);
  });

  it("rejects a theme whose identifier does not match its file name", async () => {
    await writeThemeFile(directory, "invoice.json", customTheme("report", "Report"));
    const created = await build();
    expect(created.has("report")).toBe(false);
    expect(created.report().failures).toHaveLength(1);
  });
});

describe("invalid themes outside production", () => {
  it("excludes a schema violation and logs an error", async () => {
    const broken = themeAsJsonObject();
    broken["id"] = "broken";
    delete broken["caption"];
    await writeThemeFile(directory, "broken.json", broken);
    const created = await build();
    expect(created.has("broken")).toBe(false);
    expect(created.report().failures[0]?.issues[0]?.path).toEqual(["caption"]);
    expect(logger.entries.some((entry) => entry.level === "error")).toBe(true);
  });

  it("excludes malformed JSON", async () => {
    await writeThemeFile(directory, "malformed.json", "{ not json");
    const created = await build();
    expect(created.report().failures).toHaveLength(1);
    expect(created.ids()).toEqual(["default"]);
  });

  it("keeps the service usable when every file is invalid", async () => {
    await writeThemeFile(directory, "malformed.json", "{ not json");
    const created = await build();
    expect(created.get("default")).not.toBeNull();
  });
});

describe("invalid themes in production", () => {
  it("refuses to start", async () => {
    const broken = themeAsJsonObject();
    broken["id"] = "broken";
    delete broken["caption"];
    await writeThemeFile(directory, "broken.json", broken);
    await expect(
      createThemeRegistry({ config: configFor({ NODE_ENV: "production" }), logger }),
    ).rejects.toSatisfy((thrown: unknown) => isAppError(thrown));
  });

  it("names the offending file in the failure details", async () => {
    await writeThemeFile(directory, "malformed.json", "{ not json");
    try {
      await createThemeRegistry({ config: configFor({ NODE_ENV: "production" }), logger });
      expect.unreachable("Expected the registry to refuse to start.");
    } catch (thrown) {
      expect(isAppError(thrown)).toBe(true);
      if (isAppError(thrown)) {
        expect(thrown.code).toBe("VALIDATION_ERROR");
        expect(JSON.stringify(thrown.details)).toContain("malformed.json");
      }
    }
  });

  it("starts when every theme is valid", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    registry = await createThemeRegistry({
      config: configFor({ NODE_ENV: "production" }),
      logger,
    });
    expect(registry.ids()).toEqual(["default", "report"]);
  });
});

describe("the default theme of the configuration", () => {
  it("refuses to start when it is absent", async () => {
    await expect(
      createThemeRegistry({ config: configFor({ DEFAULT_THEME: "ghost" }), logger }),
    ).rejects.toSatisfy((thrown: unknown) => isAppError(thrown));
  });

  it("accepts a directory theme as the default", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    const created = await build({ DEFAULT_THEME: "report" });
    expect(created.has("report")).toBe(true);
  });
});

describe("reloading", () => {
  it("picks up a theme added after the first load", async () => {
    const created = await build();
    expect(created.has("report")).toBe(false);
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    const report = await created.reload();
    expect(created.has("report")).toBe(true);
    expect(report.loaded.map((summary) => summary.id)).toEqual(["default", "report"]);
  });

  it("notifies its listeners", async () => {
    const created = await build();
    const seen: number[] = [];
    created.onReload((report) => {
      seen.push(report.loaded.length);
    });
    await created.reload();
    expect(seen).toEqual([1]);
  });

  it("keeps a listener free of failures when a theme becomes invalid", async () => {
    const created = await build();
    await writeThemeFile(directory, "broken.json", "{ not json");
    const report = await created.reload();
    expect(report.failures).toHaveLength(1);
    expect(created.has("default")).toBe(true);
  });
});

describe("format extension validation", () => {
  const validatorRejecting = (rejectedThemeId: string) => ({
    formatId: "docx",
    validate: (themeId: string) =>
      themeId === rejectedThemeId ? [{ path: ["styleIdPrefix"], message: "Unknown key." }] : [],
  });
  const acceptingValidator = { formatId: "docx", validate: () => [] };

  it("accepts every theme when the validator reports nothing", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    registry = await createThemeRegistry({
      config: configFor(),
      logger,
      extensionValidators: [acceptingValidator],
    });
    expect(registry.ids()).toEqual(["default", "report"]);
  });

  it("rejects a directory theme whose extension is invalid", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    registry = await createThemeRegistry({
      config: configFor(),
      logger,
      extensionValidators: [validatorRejecting("report")],
    });
    expect(registry.has("report")).toBe(false);
    expect(registry.report().failures[0]?.issues[0]?.path).toEqual([
      "formats",
      "docx",
      "styleIdPrefix",
    ]);
  });

  it("refuses to start when a built in theme carries an invalid extension", async () => {
    await expect(
      createThemeRegistry({
        config: configFor(),
        logger,
        extensionValidators: [validatorRejecting("default")],
      }),
    ).rejects.toSatisfy(
      (thrown: unknown) => isAppError(thrown) && thrown.code === "THEME_EXTENSION_ERROR",
    );
  });
});

describe("watching the theme directory", () => {
  const waitForReload = async (watched: ThemeRegistry): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("The registry did not reload within the expected delay."));
      }, 5_000);
      watched.onReload((report) => {
        clearTimeout(timer);
        resolve(report.loaded.length);
      });
    });

  it("reloads when a theme file appears", async () => {
    const created = await build({ ENABLE_THEME_WATCH: "true" });
    const reloaded = waitForReload(created);
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    expect(await reloaded).toBe(2);
    expect(created.has("report")).toBe(true);
  });

  it("stops watching once closed", async () => {
    const created = await build({ ENABLE_THEME_WATCH: "true" });
    await created.close();
    await created.close();
    expect(created.has("default")).toBe(true);
  });

  it("never watches in production", async () => {
    registry = await createThemeRegistry({
      config: configFor({ NODE_ENV: "production" }),
      logger,
    });
    expect(
      logger.entries.some((entry) => entry.message.includes("Watching the theme directory")),
    ).toBe(false);
  });
});
