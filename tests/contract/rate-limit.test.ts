import { afterEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";

let app: FastifyInstance | null = null;

const start = async (environment: Record<string, string> = {}): Promise<FastifyInstance> => {
  app = await startTestServer({ RATE_LIMIT_ENABLED: "true", ...environment });
  return app;
};

afterEach(async () => {
  await app?.close();
  app = null;
});

const convertPayload = { markdown: "# Title\n\nBody.\n", format: "debug-json" };

const listThemes = (server: FastifyInstance, options: Partial<InjectOptions> = {}) =>
  server.inject({ method: "GET", url: "/v1/themes", ...options });

const expectRateLimited = (response: LightMyRequestResponse): void => {
  expect(response.statusCode).toBe(429);
  const body: ErrorResponseBody = response.json();
  expect(body.error.code).toBe("RATE_LIMITED");
  expect(body.error.requestId).toBe(response.headers["x-request-id"]);
  expect(Number(response.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  expect(body.error.details).toEqual({
    retryAfterSeconds: Number(response.headers["retry-after"]),
  });
};

describe("activation", () => {
  it("stays off outside production by default", async () => {
    app = await startTestServer();
    const response = await listThemes(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBeUndefined();
  });

  it("is on in production by default", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await listThemes(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBe("300");
  });
});

describe("catalogue budget", () => {
  it("answers 429 with the common error body once the budget is spent", async () => {
    const server = await start({ RATE_LIMIT_MAX: "2" });
    const first = await listThemes(server);
    expect(first.statusCode).toBe(200);
    expect(first.headers["ratelimit-limit"]).toBe("2");
    expect(first.headers["ratelimit-remaining"]).toBe("1");
    expect((await listThemes(server)).statusCode).toBe(200);
    expectRateLimited(await listThemes(server));
  });

  it("is shared between the theme and format routes", async () => {
    const server = await start({ RATE_LIMIT_MAX: "2" });
    expect((await listThemes(server)).statusCode).toBe(200);
    expect((await server.inject({ method: "GET", url: "/v1/formats" })).statusCode).toBe(200);
    expectRateLimited(await server.inject({ method: "GET", url: "/v1/formats/docx" }));
  });

  it("opens again once the window has elapsed", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1", RATE_LIMIT_WINDOW_MS: "50" });
    expect((await listThemes(server)).statusCode).toBe(200);
    expectRateLimited(await listThemes(server));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await listThemes(server)).statusCode).toBe(200);
  });
});

describe("conversion budget", () => {
  it("is shared between both conversion routes", async () => {
    const server = await start({ RATE_LIMIT_CONVERT_MAX: "1" });
    const first = await server.inject({
      method: "POST",
      url: "/v1/convert",
      payload: convertPayload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers["ratelimit-limit"]).toBe("1");
    expectRateLimited(
      await server.inject({
        method: "POST",
        url: "/v1/convert/default?format=debug-json",
        headers: { "content-type": "text/markdown" },
        payload: "# Title\n",
      }),
    );
  });

  it("is independent from the catalogue budget", async () => {
    const server = await start({ RATE_LIMIT_CONVERT_MAX: "1", RATE_LIMIT_MAX: "1" });
    expect(
      (await server.inject({ method: "POST", url: "/v1/convert", payload: convertPayload }))
        .statusCode,
    ).toBe(200);
    expect((await listThemes(server)).statusCode).toBe(200);
  });

  it("refuses before the body is parsed", async () => {
    const server = await start({ RATE_LIMIT_CONVERT_MAX: "1", MAX_MARKDOWN_BYTES: "64" });
    await server.inject({ method: "POST", url: "/v1/convert", payload: convertPayload });
    expectRateLimited(
      await server.inject({
        method: "POST",
        url: "/v1/convert",
        payload: { markdown: "x".repeat(4096) },
      }),
    );
  });
});

describe("exempt routes", () => {
  it("keeps probes and documentation reachable once the budgets are spent", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1", RATE_LIMIT_CONVERT_MAX: "1" });
    await listThemes(server);
    await server.inject({ method: "POST", url: "/v1/convert", payload: convertPayload });
    for (const url of ["/healthz", "/readyz", "/openapi.json"]) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await server.inject({ method: "GET", url });
        expect(response.statusCode).toBe(200);
        expect(response.headers["ratelimit-limit"]).toBeUndefined();
      }
    }
  });
});

describe("client identity", () => {
  it("keeps one budget per client address", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1" });
    expect((await listThemes(server, { remoteAddress: "203.0.113.1" })).statusCode).toBe(200);
    expectRateLimited(await listThemes(server, { remoteAddress: "203.0.113.1" }));
    expect((await listThemes(server, { remoteAddress: "203.0.113.2" })).statusCode).toBe(200);
  });

  it("ignores X-Forwarded-For when no proxy is trusted", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1" });
    const gateway = "172.18.0.1";
    expect(
      (
        await listThemes(server, {
          remoteAddress: gateway,
          headers: { "x-forwarded-for": "198.51.100.1" },
        })
      ).statusCode,
    ).toBe(200);
    expectRateLimited(
      await listThemes(server, {
        remoteAddress: gateway,
        headers: { "x-forwarded-for": "198.51.100.2" },
      }),
    );
  });

  it("keys on the forwarded client behind a trusted proxy", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1", TRUST_PROXY: "loopback,uniquelocal" });
    const gateway = "172.18.0.1";
    expect(
      (
        await listThemes(server, {
          remoteAddress: gateway,
          headers: { "x-forwarded-for": "198.51.100.1" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await listThemes(server, {
          remoteAddress: gateway,
          headers: { "x-forwarded-for": "198.51.100.2" },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("cannot be escaped by a spoofed leftmost X-Forwarded-For entry", async () => {
    const server = await start({ RATE_LIMIT_MAX: "1", TRUST_PROXY: "loopback,uniquelocal" });
    const gateway = "172.18.0.1";
    expect(
      (
        await listThemes(server, {
          remoteAddress: gateway,
          headers: { "x-forwarded-for": "192.0.2.1, 198.51.100.7" },
        })
      ).statusCode,
    ).toBe(200);
    expectRateLimited(
      await listThemes(server, {
        remoteAddress: gateway,
        headers: { "x-forwarded-for": "192.0.2.99, 198.51.100.7" },
      }),
    );
  });
});
