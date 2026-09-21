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

interface SerialisedBlock {
  readonly kind: string;
  readonly plainText?: string;
  readonly anchor?: string;
  readonly children?: readonly { readonly kind: string; readonly value?: string }[];
}

interface SerialisedDocumentBody {
  readonly formatVersion: number;
  readonly meta: Record<string, unknown>;
  readonly stats: Record<string, number>;
  readonly anchors: readonly (readonly [string, string])[];
  readonly blocks: readonly SerialisedBlock[];
}

const convert = async (
  instance: FastifyInstance,
  markdown: string,
  body: Record<string, unknown> = {},
): Promise<SerialisedDocumentBody> => {
  const response = await instance.inject({
    method: "POST",
    url: "/convert",
    payload: { markdown, format: "debug-json", ...body },
  });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body);
};

describe("POST /convert with debug-json outside production", () => {
  it("returns the serialised intermediate representation", async () => {
    app = await startTestServer();
    const document = await convert(app, "# Title\n\nA paragraph.\n");
    expect(document.formatVersion).toBe(1);
    expect(document.blocks.map((block) => block.kind)).toEqual(["heading", "paragraph"]);
  });

  it("answers with the JSON media type and a download disposition", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Text.", format: "debug-json", filename: "report" },
    });
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toBe(
      "attachment; filename=\"report.json\"; filename*=UTF-8''report.json",
    );
    expect(response.headers["x-output-format"]).toBe("debug-json");
    expect(response.headers["x-conversion-warnings"]).toBe("0");
    expect(response.headers["x-convert-ms"]).toBeDefined();
  });

  it("produces byte identical output for two identical requests", async () => {
    app = await startTestServer();
    const payload = { markdown: "# Same\n\nSame body.\n", format: "debug-json" };
    const first = await app.inject({ method: "POST", url: "/convert", payload });
    const second = await app.inject({ method: "POST", url: "/convert", payload });
    expect(first.body).toBe(second.body);
  });
});

describe("POST /convert with debug-json in production", () => {
  it("answers 404 because the backend is not registered", async () => {
    app = await startTestServer({ NODE_ENV: "production" });
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Text.", format: "debug-json" },
    });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("FORMAT_NOT_FOUND");
  });
});

describe("headings and anchors", () => {
  it("slugs each heading and records the anchor table", async () => {
    app = await startTestServer();
    const document = await convert(app, "# First Section\n\n## Second Section\n");
    expect(document.anchors).toEqual([
      ["first-section", "First Section"],
      ["second-section", "Second Section"],
    ]);
    expect(document.blocks.map((block) => block.anchor)).toEqual([
      "first-section",
      "second-section",
    ]);
  });

  it("gives duplicate headings distinct anchors", async () => {
    app = await startTestServer();
    const document = await convert(app, "# Notes\n\n# Notes\n\n# Notes\n");
    expect(document.blocks.map((block) => block.anchor)).toEqual(["notes", "notes-1", "notes-2"]);
  });

  it("resolves an internal link against the anchor table", async () => {
    app = await startTestServer();
    const document = await convert(app, "# Target Section\n\n[go](#target-section)\n");
    const paragraph = document.blocks[1];
    expect(paragraph?.children?.[0]).toMatchObject({ kind: "link", internal: true });
  });

  it("warns on an internal link that matches no heading", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "[go](#nowhere)\n", format: "debug-json" },
    });
    expect(response.headers["x-conversion-warnings"]).toBe("1");
  });
});

describe("front matter", () => {
  it("fills the document metadata and removes the node", async () => {
    app = await startTestServer();
    const markdown = [
      "---",
      "title: Quarterly Report",
      "author:",
      "  - Ada",
      "  - Grace",
      "keywords: [finance, quarter]",
      "language: fr",
      "project: apollo",
      "---",
      "",
      "Body.",
    ].join("\n");
    const document = await convert(app, markdown);
    expect(document.meta["title"]).toBe("Quarterly Report");
    expect(document.meta["authors"]).toEqual(["Ada", "Grace"]);
    expect(document.meta["keywords"]).toEqual(["finance", "quarter"]);
    expect(document.meta["language"]).toBe("fr");
    expect(document.meta["custom"]).toEqual({ project: "apollo" });
    expect(document.blocks.map((block) => block.kind)).toEqual(["paragraph"]);
  });

  it("lets the request body override the front matter", async () => {
    app = await startTestServer();
    const document = await convert(app, "---\ntitle: From File\n---\n\nBody.", {
      metadata: { title: "From Request", author: ["Someone"] },
    });
    expect(document.meta["title"]).toBe("From Request");
    expect(document.meta["authors"]).toEqual(["Someone"]);
  });

  it("falls back to the default language", async () => {
    app = await startTestServer();
    const document = await convert(app, "Body.");
    expect(document.meta["language"]).toBe("en");
  });
});

describe("inline marks", () => {
  it("merges nested marks onto the text leaves", async () => {
    app = await startTestServer();
    const document = await convert(app, "**bold _both_** plain `code`\n");
    const children = document.blocks[0]?.children ?? [];
    expect(children).toEqual([
      expect.objectContaining({
        kind: "text",
        value: "bold ",
        marks: expect.objectContaining({ bold: true, italic: false }),
      }),
      expect.objectContaining({
        kind: "text",
        value: "both",
        marks: expect.objectContaining({ bold: true, italic: true }),
      }),
      expect.objectContaining({ kind: "text", value: " plain " }),
      expect.objectContaining({
        kind: "inlineCode",
        value: "code",
        marks: expect.objectContaining({ code: true }),
      }),
    ]);
  });

  it("carries strikethrough from the gfm extension", async () => {
    app = await startTestServer();
    const document = await convert(app, "~~gone~~\n");
    expect(document.blocks[0]?.children?.[0]).toMatchObject({
      kind: "text",
      value: "gone",
      marks: expect.objectContaining({ strike: true }),
    });
  });

  it("keeps a hard line break", async () => {
    app = await startTestServer();
    const document = await convert(app, "one  \ntwo\n");
    const kinds = (document.blocks[0]?.children ?? []).map((child) => child.kind);
    expect(kinds).toEqual(["text", "lineBreak", "text"]);
  });
});

describe("link references", () => {
  it("resolves a reference to its definition and drops the definition", async () => {
    app = await startTestServer();
    const document = await convert(app, "See [the site][ref].\n\n[ref]: https://example.com\n");
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]?.children?.[1]).toMatchObject({
      kind: "link",
      url: "https://example.com",
      internal: false,
    });
  });

  it("keeps an unmatched reference as literal text, as CommonMark requires", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "See [the site][missing].\n", format: "debug-json" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-conversion-warnings"]).toBe("0");
    const document: SerialisedDocumentBody = JSON.parse(response.body);
    expect(document.blocks[0]?.children).toEqual([
      expect.objectContaining({ kind: "text", value: "See [the site][missing]." }),
    ]);
  });
});

describe("document statistics", () => {
  it("counts headings and words", async () => {
    app = await startTestServer();
    const document = await convert(app, "# One Two\n\nThree four five.\n");
    expect(document.stats["headings"]).toBe(1);
    expect(document.stats["words"]).toBe(5);
    expect(document.stats["images"]).toBe(0);
  });
});

describe("strict mode", () => {
  it("rejects a construction the pipeline does not handle yet", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "- item\n", format: "debug-json", options: { strict: true } },
    });
    expect(response.statusCode).toBe(422);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("UNSUPPORTED_NODE");
    expect(body.error.details).toMatchObject({ nodeType: "list" });
  });

  it("warns instead of failing outside strict mode", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "- item\n", format: "debug-json", options: { strict: false } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-conversion-warnings"]).toBe("1");
  });

  it("rejects raw HTML", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: {
        markdown: "<div>raw</div>\n",
        format: "debug-json",
        options: { strict: true },
      },
    });
    expect(response.statusCode).toBe(422);
    const body: ErrorResponseBody = response.json();
    expect(body.error.details).toMatchObject({ nodeType: "html" });
  });
});
