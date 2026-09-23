import { afterEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

describe("GET /preview", () => {
  it("is absent unless the preview is enabled", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/preview" });
    expect(response.statusCode).toBe(404);
  });

  it("serves a self contained page when enabled", async () => {
    app = await startTestServer({ ENABLE_PREVIEW: "true" });
    const response = await app.inject({ method: "GET", url: "/preview" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!doctype html>");
    expect(response.body).not.toContain('src="http');
  });

  it("offers every registered theme", async () => {
    app = await startTestServer({ ENABLE_PREVIEW: "true" });
    const response = await app.inject({ method: "GET", url: "/preview" });
    for (const themeId of ["default", "corporate", "academic", "technical"]) {
      expect(response.body).toContain(`value="${themeId}"`);
    }
  });

  it("offers every active output format", async () => {
    app = await startTestServer({ ENABLE_PREVIEW: "true" });
    const response = await app.inject({ method: "GET", url: "/preview" });
    expect(response.body).toContain('value="docx"');
    expect(response.body).toContain('value="debug-json"');
  });

  it("never starts in production with the preview enabled", async () => {
    await expect(
      startTestServer({ NODE_ENV: "production", ENABLE_PREVIEW: "true" }),
    ).rejects.toThrow();
  });
});

describe("the themes over HTTP", () => {
  it("lists the four built in themes", async () => {
    app = await startTestServer({ THEMES_DIR: "./does-not-exist" });
    const response = await app.inject({ method: "GET", url: "/themes" });
    const body: { themes: { id: string }[] } = response.json();
    expect(body.themes.map((theme) => theme.id)).toEqual([
      "default",
      "corporate",
      "academic",
      "technical",
    ]);
  });

  it("adds the example theme shipped in the theme directory", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/themes" });
    const body: { themes: { id: string; origin: string }[] } = response.json();
    const example = body.themes.find((theme) => theme.id === "example");
    expect(example?.origin).toBe("directory");
  });

  it("converts with the example theme", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "# Title\n\nBody.\n", theme: "example" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("converts with each of them", async () => {
    app = await startTestServer();
    for (const themeId of ["default", "corporate", "academic", "technical"]) {
      const response = await app.inject({
        method: "POST",
        url: "/convert",
        payload: { markdown: "# Title\n\nBody.\n", theme: themeId },
      });
      expect(response.statusCode, themeId).toBe(200);
      expect(response.headers["x-output-format"]).toBe("docx");
    }
  });
});
