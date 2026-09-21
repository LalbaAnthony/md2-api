import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { createFormatRegistry } from "../../src/formats/registry.ts";
import { convertMarkdown } from "../../src/pipeline/convert.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { normaliseParts } from "../helpers/docx-normalise.ts";
import { createRecordingLogger } from "../helpers/theme-fixtures.ts";
import type { FormatBackend } from "../../src/types/format.ts";

const CORPUS_DIRECTORY = resolve(import.meta.dirname, "corpus");
const SNAPSHOT_DIRECTORY = resolve(import.meta.dirname, "__snapshots__");

const DOCX_PARTS = ["word/document.xml", "word/styles.xml", "word/numbering.xml"];

const corpusNames = readdirSync(CORPUS_DIRECTORY)
  .filter((name) => name.endsWith(".md"))
  .sort();

const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "fatal" });

const registry = createFormatRegistry({ config, logger: createRecordingLogger() });

const backends: readonly FormatBackend[] = registry.backends();

const readCorpus = (name: string): string => readFileSync(resolve(CORPUS_DIRECTORY, name), "utf8");

const convert = async (backend: FormatBackend, markdown: string): Promise<Buffer> => {
  const outcome = await convertMarkdown({
    markdown,
    theme: defaultTheme,
    backend,
    strict: false,
    maxMarkdownBytes: config.MAX_MARKDOWN_BYTES,
    maxNestingDepth: config.MAX_NESTING_DEPTH,
    timeoutMs: config.CONVERT_TIMEOUT_MS,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  return Buffer.from(outcome.result.body);
};

const renderSnapshot = async (backend: FormatBackend, body: Buffer): Promise<string> => {
  if (backend.descriptor.id === "docx") {
    const archive = await readDocxArchive(body);
    return normaliseParts(DOCX_PARTS.map((part) => [part, entryOf(archive, part)]));
  }
  return body.toString("utf8");
};

describe.each(backends.map((backend) => [backend.descriptor.id, backend] as const))(
  "golden corpus for %s",
  (formatId, backend) => {
    it.each(corpusNames)("renders %s", async (name) => {
      const body = await convert(backend, readCorpus(name));
      const snapshot = await renderSnapshot(backend, body);
      await expect(snapshot).toMatchFileSnapshot(
        resolve(SNAPSHOT_DIRECTORY, formatId, `${name}.snap`),
      );
    });

    it.each(corpusNames)("converts %s deterministically", async (name) => {
      const markdown = readCorpus(name);
      const first = await renderSnapshot(backend, await convert(backend, markdown));
      const second = await renderSnapshot(backend, await convert(backend, markdown));
      expect(first).toBe(second);
    });
  },
);

describe("the golden matrix", () => {
  it("covers every registered backend without an exclusion list", () => {
    expect(backends.map((backend) => backend.descriptor.id)).toEqual(registry.ids());
    expect(backends.length).toBeGreaterThan(1);
  });

  it("covers a corpus file for every construction of this lot", () => {
    expect(corpusNames).toContain("headings-all-levels.md");
    expect(corpusNames).toContain("inline-nesting.md");
    expect(corpusNames).toContain("links-duplicate-anchors.md");
    expect(corpusNames).toContain("special-chars-xml.md");
  });
});
