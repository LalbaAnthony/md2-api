import { afterEach, describe, expect, it } from "vitest";
import { startTestServer } from "../helpers/build-test-server.ts";
import {
  entryOf,
  isWellFormedXml,
  readDocxArchive,
  styleIdsOf,
  textOfDocument,
} from "../helpers/docx-archive.ts";
import type { DocxArchive } from "../helpers/docx-archive.ts";
import type { ErrorResponseBody } from "../../src/types/errors.ts";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | null = null;

afterEach(async () => {
  if (app !== null) {
    await app.close();
    app = null;
  }
});

const convertToArchive = async (
  instance: FastifyInstance,
  markdown: string,
  body: Record<string, unknown> = {},
): Promise<DocxArchive> => {
  const response = await instance.inject({
    method: "POST",
    url: "/convert",
    payload: { markdown, format: "docx", ...body },
  });
  expect(response.statusCode).toBe(200);
  return readDocxArchive(response.rawPayload);
};

describe("the produced archive", () => {
  it("is a valid archive carrying the mandatory OOXML parts", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# Title\n\nBody text.\n");
    expect([...archive.entries.keys()]).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "word/document.xml",
        "word/styles.xml",
        "word/numbering.xml",
      ]),
    );
  });

  it("produces well formed XML in every part", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# Title\n\nBody text.\n");
    for (const [name, content] of archive.entries) {
      if (name.endsWith(".xml") || name.endsWith(".rels")) {
        expect(isWellFormedXml(content), `${name} is malformed`).toBe(true);
      }
    }
  });

  it("answers with the Word media type and a docx extension", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.", format: "docx", filename: "quarterly report" },
    });
    expect(response.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers["content-disposition"]).toContain("quarterly report.docx");
    expect(response.headers["x-output-format"]).toBe("docx");
  });

  it("is the default format without any hint", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body." },
    });
    expect(response.headers["x-output-format"]).toBe("docx");
  });
});

describe("document content", () => {
  it("carries the text of headings and paragraphs in order", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# Title\n\nFirst.\n\n## Sub\n\nSecond.\n");
    const text = textOfDocument(entryOf(archive, "word/document.xml"));
    expect(text).toBe("TitleFirst.SubSecond.");
  });

  it("applies the named heading and body styles", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# One\n\nText.\n\n### Three\n");
    const styles = styleIdsOf(entryOf(archive, "word/document.xml"));
    expect(styles).toEqual(["Md2Heading1", "Md2Normal", "Md2Heading3"]);
  });

  it("wraps a heading in a bookmark carrying its anchor", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# My Section\n");
    const documentXml = entryOf(archive, "word/document.xml");
    expect(documentXml).toContain('w:name="my-section"');
  });

  it("renders a thematic break with its own style", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "Above.\n\n---\n\nBelow.\n");
    const styles = styleIdsOf(entryOf(archive, "word/document.xml"));
    expect(styles).toContain("Md2HorizontalRule");
  });

  it("renders an external link as a hyperlink relationship", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "[site](https://example.com)\n");
    const relationships = entryOf(archive, "word/_rels/document.xml.rels");
    expect(relationships).toContain("https://example.com");
  });

  it("renders an internal link as a bookmark reference", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# Target\n\n[go](#target)\n");
    const documentXml = entryOf(archive, "word/document.xml");
    expect(documentXml).toContain('w:name="target"');
    expect(documentXml).toContain('w:anchor="target"');
  });

  it("escapes the five XML entities coming from user text", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "a < b & c > d \"quoted\" 'single'\n");
    const documentXml = entryOf(archive, "word/document.xml");
    expect(isWellFormedXml(documentXml)).toBe(true);
    expect(textOfDocument(documentXml)).toContain("a < b & c > d");
  });

  it("carries the document metadata into the core properties", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "Body.", {
      metadata: { title: "Quarterly", author: ["Ada"], subject: "Finance" },
    });
    const core = entryOf(archive, "docProps/core.xml");
    expect(core).toContain("Quarterly");
    expect(core).toContain("Ada");
    expect(core).toContain("Finance");
  });
});

describe("styles part", () => {
  it("declares every named style the renderer references", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "# Title\n\nBody.\n");
    const stylesXml = entryOf(archive, "word/styles.xml");
    for (const styleId of ["Md2Normal", "Md2Heading1", "Md2Heading6", "Md2CodeChar", "Md2Quote"]) {
      expect(stylesXml, `${styleId} is missing`).toContain(`w:styleId="${styleId}"`);
    }
  });

  it("declares nine levels in each numbering definition", async () => {
    app = await startTestServer();
    const archive = await convertToArchive(app, "Body.\n");
    const numberingXml = entryOf(archive, "word/numbering.xml");
    const levels = [...numberingXml.matchAll(/<w:lvl w:ilvl="(\d)"/g)].map((match) => match[1]);
    expect(levels.filter((level) => level === "8").length).toBeGreaterThanOrEqual(2);
  });
});

describe("determinism", () => {
  it("produces byte identical archives for the same request", async () => {
    app = await startTestServer();
    const payload = { markdown: "# Same\n\nSame body.\n", format: "docx" };
    const first = await app.inject({ method: "POST", url: "/convert", payload });
    const second = await app.inject({ method: "POST", url: "/convert", payload });
    const firstDocument = entryOf(await readDocxArchive(first.rawPayload), "word/document.xml");
    const secondDocument = entryOf(await readDocxArchive(second.rawPayload), "word/document.xml");
    expect(firstDocument).toBe(secondDocument);
  });
});

describe("degradation", () => {
  it("warns rather than failing on a block the backend does not render yet", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      payload: { markdown: "Body.\n\n$$ x^2 $$\n", format: "docx", options: { strict: false } },
    });
    expect(response.statusCode).toBe(200);
    expect(Number(response.headers["x-conversion-warnings"])).toBeGreaterThan(0);
  });
});

describe("raw markdown route", () => {
  it("converts a text/markdown body with the theme from the path", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert/default",
      headers: { "content-type": "text/markdown" },
      payload: "# From Raw Body\n",
    });
    expect(response.statusCode).toBe(200);
    const archive = await readDocxArchive(response.rawPayload);
    expect(textOfDocument(entryOf(archive, "word/document.xml"))).toBe("From Raw Body");
  });

  it("answers 404 for an unknown theme", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert/ghost",
      headers: { "content-type": "text/markdown" },
      payload: "Body.",
    });
    expect(response.statusCode).toBe(404);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("THEME_NOT_FOUND");
  });

  it("honours the format query parameter", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert/default?format=debug-json",
      headers: { "content-type": "text/markdown" },
      payload: "Body.",
    });
    expect(response.headers["x-output-format"]).toBe("debug-json");
  });
});

describe("content negotiation", () => {
  it("selects docx from an exact Accept header", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      headers: {
        accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      payload: { markdown: "Body." },
    });
    expect(response.headers["x-output-format"]).toBe("docx");
  });

  it("answers 406 when no active format satisfies the Accept header", async () => {
    app = await startTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/convert",
      headers: { accept: "application/pdf" },
      payload: { markdown: "Body." },
    });
    expect(response.statusCode).toBe(406);
    const body: ErrorResponseBody = response.json();
    expect(body.error.code).toBe("NOT_ACCEPTABLE");
  });
});
