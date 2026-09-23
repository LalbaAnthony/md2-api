import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../../src/server.ts";
import { createReadinessState } from "../../src/lib/readiness.ts";
import { testConfig } from "../helpers/build-test-server.ts";
import type { FastifyInstance } from "fastify";
import type { JsonObject } from "../../src/types/json.ts";

const REQUIRED_FIELDS: readonly string[] = [
  "reqId",
  "themeId",
  "formatId",
  "markdownBytes",
  "blockCount",
  "imageCount",
  "parseMs",
  "normalizeMs",
  "compileMs",
  "renderMs",
  "packMs",
  "totalMs",
  "outputBytes",
  "warningCount",
];

const SECRET = "Pemberley";

const MARKDOWN = `# A heading\n\nA paragraph naming ${SECRET} once.\n`;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

let app: FastifyInstance | null = null;

const startCapturing = async (): Promise<{ readonly lines: string[] }> => {
  const lines: string[] = [];
  const stream = {
    write(line: string): void {
      lines.push(line);
    },
  };
  app = await buildServer(testConfig({ LOG_LEVEL: "info" }), {
    readiness: createReadinessState(),
    logStream: stream,
  });
  await app.ready();
  return { lines };
};

const parsed = (lines: readonly string[]): readonly JsonObject[] =>
  lines
    .map((line) => {
      try {
        const value: unknown = JSON.parse(line);
        return isObject(value) ? value : null;
      } catch {
        return null;
      }
    })
    .filter((entry) => entry !== null);

afterEach(async () => {
  await app?.close();
  app = null;
});

describe("the conversion log line", () => {
  it("carries every field the specification requires", async () => {
    const { lines } = await startCapturing();
    const response = await app?.inject({
      method: "POST",
      url: "/v1/convert",
      payload: { markdown: MARKDOWN },
    });
    expect(response?.statusCode).toBe(200);
    const completed = parsed(lines).find((entry) => entry["msg"] === "Conversion completed.");
    expect(completed, "no conversion log line was written").toBeDefined();
    for (const field of REQUIRED_FIELDS) {
      expect(Object.keys(completed ?? {}), field).toContain(field);
    }
  });

  it("never writes the markdown, not even truncated", async () => {
    const { lines } = await startCapturing();
    await app?.inject({ method: "POST", url: "/v1/convert", payload: { markdown: MARKDOWN } });
    expect(lines.join("\n")).not.toContain(SECRET);
    expect(lines.join("\n")).not.toContain("A heading");
  });

  it("reuses the request identifier of the caller", async () => {
    const { lines } = await startCapturing();
    const requestId = "11111111-2222-4333-8444-555555555555";
    await app?.inject({
      method: "POST",
      url: "/v1/convert",
      headers: { "x-request-id": requestId },
      payload: { markdown: MARKDOWN },
    });
    const completed = parsed(lines).find((entry) => entry["msg"] === "Conversion completed.");
    expect(completed?.["reqId"]).toBe(requestId);
  });

  it("writes one warning line per conversion warning", async () => {
    const { lines } = await startCapturing();
    await app?.inject({
      method: "POST",
      url: "/v1/convert",
      payload: { markdown: "$$x^2$$\n" },
    });
    const warnings = parsed(lines).filter((entry) => entry["level"] === 40);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
