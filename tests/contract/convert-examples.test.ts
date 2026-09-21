import { afterEach, describe, expect, it } from "vitest";
import {
  FULL_MARKDOWN_EXAMPLE,
  MINIMAL_MARKDOWN_EXAMPLE,
  convertMinimalRequestExample,
  convertRequestExample,
  errorResponseExample,
} from "../../src/openapi/examples.ts";
import { convertBodySchema } from "../../src/routes/convert.ts";
import { startTestServer } from "../helpers/build-test-server.ts";
import { entryOf, readDocxArchive, textOfDocument } from "../helpers/docx-archive.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

describe("the documented request examples", () => {
  it("validate against the route schema", () => {
    expect(convertBodySchema.safeParse(convertRequestExample).success).toBe(true);
    expect(convertBodySchema.safeParse(convertMinimalRequestExample).success).toBe(true);
  });

  it("convert successfully", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: convertRequestExample,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-conversion-warnings"]).toBe("0");
  });

  it("convert successfully in their minimal form", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: convertMinimalRequestExample,
    });
    expect(response.statusCode).toBe(200);
  });

  it("carry the markdown the documentation shows", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: MINIMAL_MARKDOWN_EXAMPLE, format: "docx" },
    });
    const archive = await readDocxArchive(response.rawPayload);
    expect(textOfDocument(entryOf(archive, "word/document.xml"))).toContain("Quarterly report");
  });

  it("convert the full example without a warning in strict mode", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: {
        markdown: FULL_MARKDOWN_EXAMPLE,
        format: "docx",
        options: { strict: true },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-conversion-warnings"]).toBe("0");
  });
});

describe("the documented error example", () => {
  it("matches the production shape the service returns", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", theme: "ghost" },
    });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(Object.keys(body.error).sort()).toEqual(Object.keys(errorResponseExample.error).sort());
    expect(body.error.code).toBe(errorResponseExample.error.code);
    expect(Object.keys(body.error.details).sort()).toEqual(
      Object.keys(errorResponseExample.error.details).sort(),
    );
  });
});

describe("request options", () => {
  it("accepts a request carrying only metadata", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", metadata: { subtitle: "A subtitle", date: "2026-03-31" } },
    });
    expect(response.statusCode).toBe(200);
  });

  it("accepts a request carrying only options", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", options: { tableOfContents: true, titlePage: true } },
    });
    expect(response.statusCode).toBe(200);
  });

  it("rejects an unknown key in the body", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", unexpected: true },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an empty markdown body", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a filename carrying a path separator", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", filename: "../escape" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects a markdown payload above the configured limit", async () => {
    app = await startTestServer({ MAX_MARKDOWN_BYTES: "64" });
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "x".repeat(2000) },
    });
    expect(response.statusCode).toBe(413);
  });
});
