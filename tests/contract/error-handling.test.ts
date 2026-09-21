import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { imageError, overloadedError } from "../../src/errors.ts";
import { buildTestServer } from "../helpers/build-test-server.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

const withProbeRoutes = async (environment: Record<string, string>): Promise<FastifyInstance> => {
  const instance = await buildTestServer(environment);
  instance.get("/probe/internal", () => {
    throw new Error("internal probe failure");
  });
  instance.get("/probe/client", () => {
    throw imageError("probe image failure", { url: "https://example.invalid/a.png" });
  });
  instance.get("/probe/overloaded", () => {
    throw overloadedError(5);
  });
  instance
    .withTypeProvider<ZodTypeProvider>()
    .post(
      "/probe/validated",
      { schema: { body: z.strictObject({ markdown: z.string().min(1) }) } },
      () => ({ accepted: true }),
    );
  await instance.ready();
  return instance;
};

describe("internal failures", () => {
  it("masks the message and details in production", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/probe/internal" });
    expect(response.statusCode).toBe(500);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("An unexpected error occurred.");
    expect(body.error.stack).toBeUndefined();
  });

  it("exposes the message and stack outside production", async () => {
    app = await withProbeRoutes({ NODE_ENV: "development" });
    const response = await app.inject({ method: "GET", url: "/probe/internal" });
    expect(response.statusCode).toBe(500);
    const body: ErrorResponseBody = response.json();
    expect(body.error.message).toBe("internal probe failure");
    expect(body.error.stack).toBeDefined();
  });
});

describe("client failures", () => {
  it("keeps the code, message and details of an application error", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/probe/client" });
    expect(response.statusCode).toBe(422);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("IMAGE_ERROR");
    expect(body.error.details).toEqual({ url: "https://example.invalid/a.png" });
  });

  it("answers an overload with a Retry-After header", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production" });
    const response = await app.inject({ method: "GET", url: "/probe/overloaded" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("5");
  });

  it("maps a schema violation to a validation error", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production" });
    const response = await app.inject({
      method: "POST",
      url: "/probe/validated",
      payload: { markdown: "" },
    });
    expect(response.statusCode).toBe(400);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(body.error.details)).toContain("markdown");
  });

  it("maps an oversized body to a payload error", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production", MAX_MARKDOWN_BYTES: "32" });
    const response = await app.inject({
      method: "POST",
      url: "/probe/validated",
      payload: { markdown: "x".repeat(4096) },
    });
    expect(response.statusCode).toBe(413);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("cross origin policy", () => {
  it("enables the declared origins in production", async () => {
    app = await withProbeRoutes({
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.com",
    });
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://app.example.com" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("stays disabled in production without declared origins", async () => {
    app = await withProbeRoutes({ NODE_ENV: "production" });
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://app.example.com" },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows any origin outside production", async () => {
    app = await withProbeRoutes({ NODE_ENV: "development" });
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://anything.example.com" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe("https://anything.example.com");
  });
});
