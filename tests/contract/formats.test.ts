import { afterEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

interface FormatListBody {
  readonly formats: readonly { readonly id: string; readonly productionReady: boolean }[];
}

describe("GET /formats outside production", () => {
  it("lists the development backend", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/formats" });
    expect(response.statusCode).toBe(200);
    const body: FormatListBody = response.json();
    expect(body.formats.map((format) => format.id)).toEqual(["docx", "debug-json"]);
  });

  it("lists the development backend after the production one", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/formats" });
    const body: FormatListBody = response.json();
    expect(body.formats.map((format) => format.productionReady)).toEqual([true, false]);
  });

  it("describes the capabilities of each format", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/formats" });
    const body: { formats: { capabilities: Record<string, unknown> }[] } = response.json();
    expect(Object.keys(body.formats[0]?.capabilities ?? {}).sort()).toEqual([
      "columns",
      "footnotes",
      "landscapeSections",
      "math",
      "maxListDepth",
      "pageChrome",
      "pagination",
      "syntaxHighlighting",
      "tableOfContents",
      "titlePage",
      "vectorImages",
    ]);
  });
});

describe("GET /formats in production", () => {
  it("never lists a backend that is not production ready", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/formats" });
    const body: FormatListBody = response.json();
    expect(body.formats.map((format) => format.id)).not.toContain("debug-json");
  });

  it("answers 404 on the development backend", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/formats/debug-json" });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("FORMAT_NOT_FOUND");
  });

  it("refuses to start when the development backend is enabled", async () => {
    await expect(
      startTestServer({ NODE_ENV: "production", ENABLED_FORMATS: "docx,debug-json" }),
    ).rejects.toThrow();
  });
});

describe("GET /formats/:id", () => {
  it("returns the descriptor and the theme extension schema", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/formats/debug-json" });
    expect(response.statusCode).toBe(200);
    const body: {
      format: { id: string; mediaType: string; caveats: string[] };
      themeExtensionJsonSchema: unknown;
    } = response.json();
    expect(body.format.id).toBe("debug-json");
    expect(body.format.mediaType).toBe("application/json");
    expect(body.format.caveats.length).toBeGreaterThan(0);
    expect(body.themeExtensionJsonSchema).not.toBeNull();
  });

  it("answers 404 with the available identifiers for an unknown format", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/formats/pdf" });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("FORMAT_NOT_FOUND");
    expect(body.error.details).toEqual({ requested: "pdf", available: ["docx", "debug-json"] });
  });
});

describe("theme caveats per format", () => {
  it("reports the caveats of every active backend on a theme", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/themes/default" });
    const body: { caveats: Record<string, string[]> } = response.json();
    expect(Object.keys(body.caveats)).toEqual(["docx", "debug-json"]);
  });
});
