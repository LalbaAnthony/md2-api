import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { isAppError } from "../../src/errors.ts";
import { startTestServer, testEnvironment } from "../helpers/build-test-server.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

const start = async (environment: Record<string, string> = {}): Promise<FastifyInstance> => {
  app = await startTestServer(environment);
  return app;
};

const convert = async (
  server: FastifyInstance,
  payload: Record<string, unknown>,
): Promise<{ readonly statusCode: number; readonly body: ErrorResponseBody }> => {
  const response = await server.inject({ method: "POST", url: "/convert", payload });
  return { statusCode: response.statusCode, body: response.json() };
};

afterEach(async () => {
  await app?.close();
  app = null;
});

describe("oversized markdown", () => {
  it("is refused before parsing", async () => {
    const server = await start({ MAX_MARKDOWN_BYTES: "2048" });
    const { statusCode, body } = await convert(server, { markdown: "a".repeat(4096) });
    expect(statusCode).toBe(413);
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("pathological nesting", () => {
  it("is refused once the depth bound is crossed", async () => {
    const server = await start({ MAX_NESTING_DEPTH: "5" });
    const nested = Array.from({ length: 40 }, (_unused, level) => `${"  ".repeat(level)}- item`);
    const { statusCode, body } = await convert(server, { markdown: nested.join("\n") });
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe("NESTING_TOO_DEEP");
  });
});

describe("raw HTML", () => {
  it("is refused in strict mode", async () => {
    const server = await start();
    const { statusCode, body } = await convert(server, {
      markdown: "<div>Injected</div>\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe("UNSUPPORTED_NODE");
  });

  it("cannot be switched on by configuration", () => {
    expect(() => loadConfig(testEnvironment({ ALLOW_RAW_HTML: "true" }))).toThrow();
    expect(loadConfig(testEnvironment()).ALLOW_RAW_HTML).toBe(false);
  });
});

describe("remote images", () => {
  it("are not fetched while the switch is off", async () => {
    const server = await start();
    const { statusCode, body } = await convert(server, {
      markdown: "![A diagram](https://example.invalid/diagram.png)\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe("IMAGE_ERROR");
  });

  it("refuse an empty allowlist in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        LOG_LEVEL: "fatal",
        ALLOW_REMOTE_IMAGES: "true",
        IMAGE_ALLOWLIST: "",
      }),
    ).toThrow();
  });
});

describe("path traversal", () => {
  it("is refused even when local images are allowed", async () => {
    const server = await start({
      ALLOW_LOCAL_IMAGES: "true",
      ASSETS_DIR: "tests/fixtures/assets",
    });
    const { statusCode, body } = await convert(server, {
      markdown: "![Escape](../../../package.json)\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe("IMAGE_ERROR");
  });

  it("refuses a local image while the switch is off", async () => {
    const server = await start();
    const { statusCode } = await convert(server, {
      markdown: "![A diagram](diagram.png)\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
  });
});

describe("XML injection", () => {
  it("escapes markup that looks like OOXML", async () => {
    const server = await start();
    const response = await server.inject({
      method: "POST",
      url: "/convert",
      payload: {
        markdown: "A paragraph with `</w:t></w:r><w:r><w:t>injected` and a ]]> sequence.\n",
        options: { strict: false },
      },
    });
    expect(response.statusCode).toBe(200);
    const archive = response.rawPayload.toString("latin1");
    expect(archive).not.toContain("<w:r><w:t>injected");
  });
});

describe("header injection through the file name", () => {
  it("keeps the content disposition on one line", async () => {
    const server = await start();
    const injected = await server.inject({
      method: "POST",
      url: "/convert",
      payload: {
        markdown: "Body.\n",
        filename: "report\r\nX-Injected: yes",
      },
    });
    expect(injected.statusCode).toBe(400);
    expect(injected.headers["x-injected"]).toBeUndefined();

    const accepted = await server.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.\n", filename: "quarterly report.final" },
    });
    expect(accepted.statusCode).toBe(200);
    const disposition = String(accepted.headers["content-disposition"]);
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toContain(".docx");
  });
});

describe("image bounds", () => {
  it("refuses an image beyond the pixel bound before decoding it whole", async () => {
    const server = await start({
      ALLOW_LOCAL_IMAGES: "true",
      ASSETS_DIR: "tests/fixtures/assets",
      MAX_IMAGE_PIXELS: "1024",
    });
    const { statusCode, body } = await convert(server, {
      markdown: "![Wide](wide.png)\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
    expect(body.error.code).toBe("IMAGE_ERROR");
  });

  it("refuses an image beyond the byte bound", async () => {
    const server = await start({
      ALLOW_LOCAL_IMAGES: "true",
      ASSETS_DIR: "tests/fixtures/assets",
      MAX_IMAGE_BYTES: "512",
    });
    const { statusCode } = await convert(server, {
      markdown: "![Wide](wide.png)\n",
      options: { strict: true },
    });
    expect(statusCode).toBe(422);
  });
});

describe("processor exhaustion", () => {
  it("bounds the conversion with a timeout", async () => {
    const server = await start({ CONVERT_TIMEOUT_MS: "1" });
    const heavy = Array.from({ length: 400 }, (_unused, index) => `## Heading ${String(index)}`);
    const response = await server.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: heavy.join("\n\n") },
    });
    expect([200, 504]).toContain(response.statusCode);
  });

  it("maps an overload to 503 with a retry delay", async () => {
    const server = await start({ MAX_CONCURRENT_CONVERSIONS: "1", CONVERT_QUEUE_LIMIT: "0" });
    const payload = { markdown: "# One\n\nBody.\n" };
    const responses = await Promise.all([
      server.inject({ method: "POST", url: "/convert", payload }),
      server.inject({ method: "POST", url: "/convert", payload }),
      server.inject({ method: "POST", url: "/convert", payload }),
    ]);
    for (const response of responses.filter((entry) => entry.statusCode === 503)) {
      expect(response.headers["retry-after"]).toBeDefined();
    }
    expect(responses.every((response) => [200, 503].includes(response.statusCode))).toBe(true);
  });
});

describe("hostile front matter", () => {
  it("keeps unknown keys out of the known metadata and truncates them", async () => {
    const server = await start();
    const frontMatter = [
      "---",
      "title: A title",
      `intruder: ${"x".repeat(2000)}`,
      "---",
      "",
      "Body.",
      "",
    ].join("\n");
    const response = await server.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: frontMatter, format: "debug-json" },
    });
    expect(response.statusCode).toBe(200);
    const body: { meta: { custom: Record<string, string>; title?: string } } = response.json();
    expect(body.meta.title).toBe("A title");
    expect(body.meta.custom["intruder"]?.length).toBe(500);
  });
});

describe("an unknown theme", () => {
  it("answers 404 rather than falling back", async () => {
    const server = await start();
    const response = await server.inject({ method: "GET", url: "/themes/ghost" });
    expect(response.statusCode).toBe(404);
  });
});

describe("the error hierarchy", () => {
  it("treats a foreign throw as internal rather than trusting it", () => {
    expect(isAppError(new Error("boom"))).toBe(false);
  });
});
