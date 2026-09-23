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

interface OpenApiDocument {
  readonly openapi: string;
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<string, Record<string, unknown>>;
  readonly tags: readonly { readonly name: string }[];
}

const fetchDocument = async (instance: FastifyInstance): Promise<OpenApiDocument> => {
  const response = await instance.inject({ method: "GET", url: "/openapi.json" });
  expect(response.statusCode).toBe(200);
  return response.json();
};

describe("GET /openapi.json", () => {
  it("serves an OpenAPI 3.1 document", async () => {
    app = await startTestServer();
    const document = await fetchDocument(app);
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("md2");
  });

  it("describes every public route", async () => {
    app = await startTestServer();
    const document = await fetchDocument(app);
    expect(Object.keys(document.paths).sort()).toEqual([
      "/healthz",
      "/readyz",
      "/v1/convert",
      "/v1/convert/{themeId}",
      "/v1/formats",
      "/v1/formats/{id}",
      "/v1/themes",
      "/v1/themes/{id}",
    ]);
  });

  it("stays available in production", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const document = await fetchDocument(app);
    expect(document.openapi).toBe("3.1.0");
  });

  it("describes the conversion request body from the route schema", async () => {
    app = await startTestServer();
    const document = await fetchDocument(app);
    const post = document.paths["/v1/convert"]?.["post"];
    expect(JSON.stringify(post)).toContain("markdown");
  });

  it("declares the documented tags", async () => {
    app = await startTestServer();
    const document = await fetchDocument(app);
    expect(document.tags.map((tag) => tag.name)).toEqual([
      "conversion",
      "themes",
      "formats",
      "operations",
    ]);
  });
});

describe("GET /docs", () => {
  it("serves Swagger UI outside production", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/docs/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("swagger");
  });

  it("is absent in production by default", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/docs/" });
    expect(response.statusCode).toBe(404);
  });

  it("can be enabled explicitly in production", async () => {
    app = await startTestServer({ NODE_ENV: "production", ENABLE_SWAGGER_UI: "true" });
    const response = await app.inject({ method: "GET", url: "/docs/" });
    expect(response.statusCode).toBe(200);
  });
});
