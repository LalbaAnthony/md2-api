import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { compileThemeForDocx } from "../../src/formats/docx/compile/index.ts";
import { validateDocxThemeExtension } from "../../src/formats/docx/theme-extension.ts";
import { jsonObjectSchema } from "../../src/lib/json.ts";
import { convertMarkdown } from "../../src/pipeline/convert.ts";
import { themeSchema } from "../../src/theme/schema.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { Theme } from "../../src/types/theme.ts";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");

const raw: unknown = JSON.parse(
  readFileSync(resolve(repositoryRoot, "themes", "example.json"), "utf8"),
);

const KITCHEN_SINK = readFileSync(
  resolve(repositoryRoot, "tests", "golden", "corpus", "kitchen-sink.md"),
  "utf8",
);

const parsed = themeSchema.safeParse(raw);

const themeOf = (): Theme => {
  if (!parsed.success) {
    throw new Error("The example theme does not satisfy the schema.");
  }
  return parsed.data;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("the example theme", () => {
  it("satisfies the theme schema", () => {
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it("declares the identifier its file name promises", () => {
    expect(themeOf().id).toBe("example");
  });

  it("carries a valid DOCX extension", () => {
    const formats = isRecord(raw) ? raw["formats"] : undefined;
    const docx = isRecord(formats) ? formats["docx"] : undefined;
    const extension = jsonObjectSchema.safeParse(docx);
    expect(extension.success).toBe(true);
    if (!extension.success) {
      return;
    }
    expect(Object.keys(extension.data)).toContain("styleIdPrefix");
    expect(validateDocxThemeExtension(extension.data)).toEqual({ ok: true });
  });

  it("compiles for the DOCX backend", () => {
    const compiled = compileThemeForDocx(themeOf());
    expect(compiled.themeId).toBe("example");
    expect(compiled.headingsAreNumbered).toBe(true);
    for (const entry of compiled.numbering.config) {
      expect(entry.levels).toHaveLength(9);
    }
  });

  it("switches on every optional feature of the schema", () => {
    const theme = themeOf();
    expect(theme.chrome.header).not.toBeNull();
    expect(theme.chrome.footer).not.toBeNull();
    expect(theme.chrome.titlePage).not.toBeNull();
    expect(theme.tableOfContents.enabled).toBe(true);
    expect(theme.code.showLineNumbers).toBe(true);
    expect(theme.code.showLanguageLabel).toBe(true);
    expect(theme.table.stripes).toBe(true);
    expect(theme.figure.border).not.toBeNull();
    expect(theme.paragraph.firstLineIndent).not.toBeNull();
    expect(theme.color.quoteBackground).not.toBeNull();
    expect(theme.color.tableStripe).not.toBeNull();
    expect(theme.color.codeBorder).not.toBeNull();
    expect(theme.heading[0].ruleBelow).not.toBeNull();
  });

  it("uses every kind of chrome slot", () => {
    const theme = themeOf();
    const kinds = [
      ...(theme.chrome.header?.slots ?? []).map((slot) => slot.kind),
      ...(theme.chrome.footer?.slots ?? []).map((slot) => slot.kind),
    ];
    expect([...kinds].sort()).toEqual(
      ["chapter", "empty", "meta", "pageCount", "pageNumber", "text"].sort(),
    );
  });

  it("declares one ordered format per list level", () => {
    expect(themeOf().list.orderedFormats).toHaveLength(9);
  });

  it("renders the whole kitchen sink without a warning in strict mode", async () => {
    const outcome = await convertMarkdown({
      markdown: KITCHEN_SINK,
      theme: themeOf(),
      backend: docxBackend,
      strict: true,
      maxMarkdownBytes: 2_000_000,
      maxNestingDepth: 100,
      timeoutMs: 30_000,
      imagePolicy: strictImagePolicy({
        allowLocal: true,
        assetsDirectory: "tests/fixtures/assets",
      }),
      defaultLanguage: "en",
      metadata: {},
      documentOptions: {},
    });
    expect(outcome.warnings.map((warning) => warning.code)).toEqual([]);
    expect(outcome.result.body.byteLength).toBeGreaterThan(1000);
  });
});
