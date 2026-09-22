import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { compileThemeForDocx } from "../../src/formats/docx/compile/index.ts";
import { convertMarkdown } from "../../src/pipeline/convert.ts";
import { academicTheme } from "../../src/theme/builtin/academic.theme.ts";
import { corporateTheme } from "../../src/theme/builtin/corporate.theme.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { technicalTheme } from "../../src/theme/builtin/technical.theme.ts";
import { themeSchema } from "../../src/theme/schema.ts";
import { computeContentWidth, isHexColor } from "../../src/theme/tokens.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { ConversionWarning } from "../../src/types/format.ts";
import type { Theme } from "../../src/types/theme.ts";

const KITCHEN_SINK = readFileSync(
  resolve(import.meta.dirname, "..", "golden", "corpus", "kitchen-sink.md"),
  "utf8",
);

const THEMES: readonly (readonly [string, Theme])[] = [
  ["default", defaultTheme],
  ["corporate", corporateTheme],
  ["academic", academicTheme],
  ["technical", technicalTheme],
];

const convert = async (
  theme: Theme,
  markdown: string,
  strict: boolean,
): Promise<{ readonly warnings: readonly ConversionWarning[]; readonly body: Buffer }> => {
  const outcome = await convertMarkdown({
    markdown,
    theme,
    backend: docxBackend,
    strict,
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
  return { warnings: outcome.warnings, body: Buffer.from(outcome.result.body) };
};

describe("the four built in themes", () => {
  it("are all registered", () => {
    expect(THEMES.map(([id]) => id)).toEqual(["default", "corporate", "academic", "technical"]);
  });

  it.each(THEMES)("%s validates against the theme schema", (_id, theme) => {
    const parsed = themeSchema.safeParse(JSON.parse(JSON.stringify(theme)));
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it.each(THEMES)("%s declares its own identifier", (id, theme) => {
    expect(theme.id).toBe(id);
  });

  it.each(THEMES)("%s uses only well formed colours", (_id, theme) => {
    const serialised = JSON.stringify(theme);
    for (const match of serialised.matchAll(
      /"(?:color|foreground|background|[Cc]olor)":"([^"]+)"/g,
    )) {
      expect(isHexColor(match[1] ?? ""), match[1] ?? "").toBe(true);
    }
  });

  it.each(THEMES)("%s leaves a positive content width", (_id, theme) => {
    expect(computeContentWidth(theme)).toBeGreaterThan(0);
  });

  it.each(THEMES)("%s compiles for the DOCX backend", (_id, theme) => {
    const compiled = compileThemeForDocx(theme);
    expect(compiled.themeId).toBe(theme.id);
    expect(compiled.numbering.config.length).toBeGreaterThanOrEqual(2);
    for (const entry of compiled.numbering.config) {
      expect(entry.levels).toHaveLength(9);
    }
  });
});

describe("the kitchen sink", () => {
  it.each(THEMES)("renders with %s without a warning in strict mode", async (_id, theme) => {
    const { warnings } = await convert(theme, KITCHEN_SINK, true);
    expect(warnings.map((warning) => `${warning.code}: ${warning.message}`)).toEqual([]);
  });

  it.each(THEMES)("produces a readable archive with %s", async (_id, theme) => {
    const { body } = await convert(theme, KITCHEN_SINK, true);
    const archive = await readDocxArchive(body);
    expect([...archive.entries.keys()]).toEqual(
      expect.arrayContaining(["word/document.xml", "word/styles.xml", "word/numbering.xml"]),
    );
    expect(entryOf(archive, "word/document.xml").length).toBeGreaterThan(1000);
  });
});

describe("the themes exercise distinct code paths", () => {
  it("only corporate carries a title page", () => {
    expect(corporateTheme.chrome.titlePage?.enabled).toBe(true);
    expect(defaultTheme.chrome.titlePage).toBeNull();
    expect(academicTheme.chrome.titlePage).toBeNull();
    expect(technicalTheme.chrome.titlePage).toBeNull();
  });

  it("only corporate and academic insert a table of contents", () => {
    expect(corporateTheme.tableOfContents.enabled).toBe(true);
    expect(academicTheme.tableOfContents.enabled).toBe(true);
    expect(defaultTheme.tableOfContents.enabled).toBe(false);
    expect(technicalTheme.tableOfContents.enabled).toBe(false);
  });

  it("only academic numbers its headings", () => {
    expect(academicTheme.heading.every((level) => level.numbered)).toBe(true);
    expect(corporateTheme.heading.some((level) => level.numbered)).toBe(false);
  });

  it("only academic justifies and indents the first line", () => {
    expect(academicTheme.paragraph.align).toBe("justify");
    expect(academicTheme.paragraph.firstLineIndent).not.toBeNull();
    expect(defaultTheme.paragraph.firstLineIndent).toBeNull();
  });

  it("only technical numbers code lines and labels the language", () => {
    expect(technicalTheme.code.showLineNumbers).toBe(true);
    expect(technicalTheme.code.showLanguageLabel).toBe(true);
    expect(defaultTheme.code.showLineNumbers).toBe(false);
  });

  it("only academic draws horizontal rules alone in tables", () => {
    expect(academicTheme.table.horizontalRulesOnly).toBe(true);
    expect(corporateTheme.table.horizontalRulesOnly).toBe(false);
  });

  it("corporate and technical stripe their tables", () => {
    expect(corporateTheme.table.stripes).toBe(true);
    expect(technicalTheme.table.stripes).toBe(true);
    expect(academicTheme.table.stripes).toBe(false);
  });

  it("only corporate draws a rule under a heading", () => {
    expect(corporateTheme.heading[0].ruleBelow).not.toBeNull();
    expect(defaultTheme.heading[0].ruleBelow).toBeNull();
  });

  it("each theme uses a distinct typographic signature", () => {
    const signatures = THEMES.map(
      ([, theme]) =>
        `${theme.type.body.name}@${theme.type.baseSize}@${theme.type.leading}@${theme.paragraph.lineHeight}`,
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("each theme uses a distinct page margin or leading", () => {
    const signatures = THEMES.map(([, theme]) => `${theme.page.margin.top}@${theme.type.leading}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("the rendered output differs per theme", () => {
  const sample = "# A heading\n\nA paragraph.\n\n```ts\nconst a = 1;\n```\n";

  it("produces a different document for each theme", async () => {
    const documents = await Promise.all(
      THEMES.map(async ([, theme]) => {
        const { body } = await convert(theme, sample, true);
        const archive = await readDocxArchive(body);
        return entryOf(archive, "word/styles.xml");
      }),
    );
    expect(new Set(documents).size).toBe(documents.length);
  });

  it("numbers the code lines only for technical", async () => {
    const technical = await convert(technicalTheme, sample, true);
    const plain = await convert(defaultTheme, sample, true);
    const technicalXml = entryOf(await readDocxArchive(technical.body), "word/document.xml");
    const plainXml = entryOf(await readDocxArchive(plain.body), "word/document.xml");
    expect(technicalXml).toContain("LineNumber");
    expect(plainXml).not.toContain("LineNumber");
  });

  it("writes a header part only for corporate", async () => {
    const corporate = await convert(corporateTheme, sample, true);
    const academic = await convert(academicTheme, sample, true);
    const corporateNames = [...(await readDocxArchive(corporate.body)).entries.keys()];
    const academicNames = [...(await readDocxArchive(academic.body)).entries.keys()];
    expect(corporateNames.some((name) => name.startsWith("word/header"))).toBe(true);
    expect(academicNames.some((name) => name.startsWith("word/header"))).toBe(false);
  });

  it("writes a footer part for corporate, academic and technical", async () => {
    for (const theme of [corporateTheme, academicTheme, technicalTheme]) {
      const { body } = await convert(theme, sample, true);
      const names = [...(await readDocxArchive(body)).entries.keys()];
      expect(
        names.some((name) => name.startsWith("word/footer")),
        theme.id,
      ).toBe(true);
    }
  });
});
