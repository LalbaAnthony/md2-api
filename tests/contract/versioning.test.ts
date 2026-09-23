import { afterEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import { API_VERSION_PREFIX } from "../../src/constants.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

describe("API versioning", () => {
  it("serves the business routes under the version prefix", async () => {
    app = await startTestServer();
    for (const url of ["/themes", "/themes/default", "/formats", "/formats/docx"]) {
      const response = await app.inject({ method: "GET", url: `${API_VERSION_PREFIX}${url}` });
      expect(response.statusCode, url).toBe(200);
    }
  });

  it("no longer serves the business routes without the version prefix", async () => {
    app = await startTestServer();
    for (const url of ["/themes", "/themes/default", "/formats", "/formats/docx"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
    }
    const conversion = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "# Title\n" },
    });
    expect(conversion.statusCode).toBe(404);
  });

  it("keeps the operational routes outside the version prefix", async () => {
    app = await startTestServer();
    for (const url of ["/healthz", "/readyz", "/openapi.json"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
      const versioned = await app.inject({ method: "GET", url: `${API_VERSION_PREFIX}${url}` });
      expect(versioned.statusCode, url).toBe(404);
    }
  });

  it("points the preview page at the versioned conversion route", async () => {
    app = await startTestServer({ ENABLE_PREVIEW: "true" });
    const response = await app.inject({ method: "GET", url: "/preview" });
    expect(response.body).toContain(`fetch("${API_VERSION_PREFIX}/convert"`);
  });
});
