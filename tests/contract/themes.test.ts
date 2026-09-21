import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import {
  createThemeDirectory,
  customTheme,
  removeThemeDirectory,
  writeThemeFile,
} from "../helpers/theme-fixtures.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;
let directory = "";

beforeEach(async () => {
  directory = await createThemeDirectory();
});

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
  await removeThemeDirectory(directory);
});

describe("GET /themes", () => {
  it("lists the built in default theme", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes" });
    expect(response.statusCode).toBe(200);
    const body: { themes: { id: string; origin: string }[] } = response.json();
    expect(body.themes.map((summary) => summary.id)).toEqual(["default"]);
    expect(body.themes[0]?.origin).toBe("builtin");
  });

  it("lists a theme added to the theme directory", async () => {
    await writeThemeFile(directory, "report.json", customTheme("report", "Report"));
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes" });
    const body: { themes: { id: string; label: string }[] } = response.json();
    expect(body.themes.map((summary) => summary.id)).toEqual(["default", "report"]);
    expect(body.themes[1]?.label).toBe("Report");
  });

  it("exposes a summary only, never the full theme", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes" });
    const body: { themes: Record<string, unknown>[] } = response.json();
    expect(Object.keys(body.themes[0] ?? {}).sort()).toEqual([
      "description",
      "hash",
      "id",
      "label",
      "origin",
      "version",
    ]);
  });
});

describe("GET /themes/:id", () => {
  it("returns the complete theme", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes/default" });
    expect(response.statusCode).toBe(200);
    const body: { theme: { id: string; page: { size: { width: number } } } } = response.json();
    expect(body.theme.id).toBe("default");
    expect(body.theme.page.size.width).toBe(11906);
  });

  it("returns the derived content box", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes/default" });
    const body: { metrics: { contentWidth: number; contentHeight: number } } = response.json();
    expect(body.metrics.contentWidth).toBe(9026);
    expect(body.metrics.contentHeight).toBe(13958);
  });

  it("returns one caveat entry per active output format", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes/default" });
    const body: { caveats: Record<string, string[]> } = response.json();
    expect(Object.keys(body.caveats)).toEqual(["docx", "debug-json"]);
    expect(body.caveats["debug-json"]).toEqual([]);
    expect(body.caveats["docx"]).toEqual([]);
  });

  it("answers 404 with the available identifiers for an unknown theme", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes/ghost" });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("THEME_NOT_FOUND");
    expect(body.error.details).toEqual({ requested: "ghost", available: ["default"] });
  });

  it("answers 400 for an identifier longer than the schema allows", async () => {
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: `/themes/${"x".repeat(80)}` });
    expect(response.statusCode).toBe(400);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("theme loading at startup", () => {
  it("refuses to build the server in production when a theme is invalid", async () => {
    await writeThemeFile(directory, "broken.json", "{ not json");
    await expect(
      startTestServer({ NODE_ENV: "production", THEMES_DIR: directory }),
    ).rejects.toThrow();
  });

  it("starts outside production when a theme is invalid", async () => {
    await writeThemeFile(directory, "broken.json", "{ not json");
    app = await startTestServer({ THEMES_DIR: directory });
    const response = await app.inject({ method: "GET", url: "/themes" });
    const body: { themes: { id: string }[] } = response.json();
    expect(body.themes.map((summary) => summary.id)).toEqual(["default"]);
  });
});
