import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { convertMarkdown } from "../../src/pipeline/convert.ts";
import { academicTheme } from "../../src/theme/builtin/academic.theme.ts";
import { corporateTheme } from "../../src/theme/builtin/corporate.theme.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { technicalTheme } from "../../src/theme/builtin/technical.theme.ts";
import { pt } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import { comparePng, describeComparison } from "./helpers/compare.ts";
import { isInsideTestImage, updatesBaselines, VISUAL_TOLERANCE } from "./helpers/environment.ts";
import { listBaselinePages, readBaseline, writeBaselines, writeDiff } from "./helpers/baseline.ts";
import { rasterisePages } from "./helpers/rasterise.ts";
import type { BaselineKey } from "./helpers/baseline.ts";
import type { Theme } from "../../src/types/theme.ts";

const FORMAT_ID = "docx";
const CORPUS_DIRECTORY = resolve(import.meta.dirname, "..", "golden", "corpus");
const CASE_TIMEOUT_MS = 300_000;

const CORPORA: readonly string[] = [
  "kitchen-sink",
  "tables-wide-content",
  "code-highlighted-ts",
  "lists-mixed-nested",
];

const THEMES: readonly Theme[] = [defaultTheme, corporateTheme, academicTheme, technicalTheme];

const MATRIX: readonly BaselineKey[] = THEMES.flatMap((theme) =>
  CORPORA.map((corpus) => ({ formatId: FORMAT_ID, themeId: theme.id, corpus })),
);

const readCorpus = (corpus: string): string =>
  readFileSync(resolve(CORPUS_DIRECTORY, `${corpus}.md`), "utf8");

const render = async (theme: Theme, markdown: string): Promise<Buffer> => {
  const outcome = await convertMarkdown({
    markdown,
    theme,
    backend: docxBackend,
    strict: false,
    maxMarkdownBytes: 2_000_000,
    maxNestingDepth: 100,
    timeoutMs: 120_000,
    imagePolicy: strictImagePolicy({ allowLocal: true, assetsDirectory: "tests/fixtures/assets" }),
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  return Buffer.from(outcome.result.body);
};

const themeOf = (themeId: string): Theme => {
  const found = THEMES.find((theme) => theme.id === themeId);
  if (found === undefined) {
    throw new Error(`Unknown theme in the visual matrix: ${themeId}`);
  }
  return found;
};

const pagesFor = async (key: BaselineKey) =>
  rasterisePages(
    await render(themeOf(key.themeId), readCorpus(key.corpus)),
    `${key.themeId}-${key.corpus}`,
  );

describe("the visual matrix", () => {
  it("covers every built in theme across the four reference documents", () => {
    expect(MATRIX).toHaveLength(THEMES.length * CORPORA.length);
    expect([...new Set(MATRIX.map((key) => key.themeId))]).toEqual([
      "default",
      "corporate",
      "academic",
      "technical",
    ]);
  });

  it("names the corpus files that exist in the golden corpus", () => {
    for (const corpus of CORPORA) {
      expect(readCorpus(corpus).length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!isInsideTestImage())("the rendered pages", () => {
  it.each(MATRIX.map((key) => [`${key.themeId} on ${key.corpus}`, key] as const))(
    "match the baseline for %s",
    async (label, key) => {
      const pages = await pagesFor(key);
      if (updatesBaselines()) {
        await writeBaselines(key, pages);
        expect(pages.length).toBeGreaterThan(0);
        return;
      }
      const recorded = await listBaselinePages(key);
      expect(recorded, `No baseline recorded for ${label}`).not.toHaveLength(0);
      expect(pages.map((page) => page.number)).toEqual(recorded);
      for (const page of pages) {
        const comparison = comparePng(page.png, await readBaseline(key, page.number));
        if (comparison.kind === "compared" && comparison.ratio <= VISUAL_TOLERANCE) {
          continue;
        }
        if (comparison.kind === "compared") {
          await writeDiff(key, page.number, comparison.diff);
        }
        throw new Error(describeComparison(comparison, `${label} page ${page.number}`));
      }
    },
    CASE_TIMEOUT_MS,
  );
});

describe.skipIf(!isInsideTestImage() || updatesBaselines())("a deliberate regression", () => {
  const key: BaselineKey = {
    formatId: FORMAT_ID,
    themeId: "default",
    corpus: "lists-mixed-nested",
  };
  const enlarged: Theme = { ...defaultTheme, type: { ...defaultTheme.type, baseSize: pt(13) } };

  it(
    "fails the comparison when a font size changes",
    async () => {
      const pages = await rasterisePages(
        await render(enlarged, readCorpus(key.corpus)),
        "enlarged",
      );
      const first = pages[0];
      expect(first).toBeDefined();
      const comparison = comparePng(first?.png ?? Buffer.alloc(0), await readBaseline(key, 1));
      const ratio = comparison.kind === "compared" ? comparison.ratio : 1;
      expect(ratio).toBeGreaterThan(VISUAL_TOLERANCE);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "passes the comparison when nothing changes",
    async () => {
      const pages = await rasterisePages(
        await render(defaultTheme, readCorpus(key.corpus)),
        "unchanged",
      );
      const first = pages[0];
      expect(first).toBeDefined();
      const comparison = comparePng(first?.png ?? Buffer.alloc(0), await readBaseline(key, 1));
      expect(comparison.kind).toBe("compared");
      const ratio = comparison.kind === "compared" ? comparison.ratio : 1;
      expect(ratio).toBeLessThanOrEqual(VISUAL_TOLERANCE);
    },
    CASE_TIMEOUT_MS,
  );
});
