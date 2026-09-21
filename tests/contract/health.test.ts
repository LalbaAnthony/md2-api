import { afterEach, describe, expect, it } from "vitest";
import { createReadinessState } from "../../src/lib/readiness.ts";
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

describe("GET /healthz", () => {
  it("answers 200 while the service is starting", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("echoes a conforming incoming request identifier", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "incoming-request-0001" },
    });
    expect(response.headers["x-request-id"]).toBe("incoming-request-0001");
  });

  it("replaces a malformed incoming request identifier", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "no" },
    });
    expect(response.headers["x-request-id"]).not.toBe("no");
  });
});

describe("GET /readyz", () => {
  it("reports themes and formats as ready once the server is built", async () => {
    const readiness = createReadinessState();
    app = await startTestServer({}, readiness);
    expect(readiness.themesLoaded).toBe(true);
    expect(readiness.formatsWarmedUp).toBe(true);
  });

  it("answers 503 while a stage is still pending", async () => {
    const readiness = createReadinessState();
    app = await startTestServer({}, readiness);
    readiness.formatsWarmedUp = false;
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "starting",
      themesLoaded: true,
      formatsWarmedUp: false,
    });
  });

  it("answers 200 once themes and formats are ready", async () => {
    const readiness = createReadinessState();
    app = await startTestServer({}, readiness);
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      themesLoaded: true,
      formatsWarmedUp: true,
    });
  });
});

describe("unknown routes", () => {
  it("answers 404 with the shared error envelope", async () => {
    app = await startTestServer();
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof body.error.requestId).toBe("string");
  });
});
