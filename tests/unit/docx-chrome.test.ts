import { describe, expect, it } from "vitest";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { compileThemeForDocx } from "../../src/formats/docx/compile/index.ts";
import { chromeTabStops, slotChildren } from "../../src/formats/docx/render/chrome.ts";
import { titlePageIsEnabled } from "../../src/formats/docx/render/document.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { computeContentWidth } from "../../src/theme/tokens.ts";
import { dxa, eighth, pt } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { DocxArchive } from "../helpers/docx-archive.ts";
import type { DocumentMeta } from "../../src/types/ir.ts";
import type { ChromeSpec, Theme, TitlePageSpec } from "../../src/types/theme.ts";
import type { DocumentOptions } from "../../src/types/pipeline.ts";

const TITLE = "Quarterly Report";
const SUBTITLE = "Third quarter";
const DATE = "2026-09-30";
const SUBJECT = "Finance";

const META: DocumentMeta = {
  title: TITLE,
  subtitle: SUBTITLE,
  authors: ["Ada Lovelace", "Grace Hopper"],
  date: DATE,
  subject: SUBJECT,
  keywords: [],
  language: "en",
  custom: {},
};

const headerSpec: ChromeSpec = {
  enabled: true,
  slots: [{ kind: "meta", field: "title" }, { kind: "chapter" }, { kind: "empty" }],
  fontSize: pt(9),
  color: "6B6B6B",
  rule: { width: eighth(4), color: "D5D5D5" },
  differentFirstPage: false,
  differentOddEven: false,
};

const footerSpec: ChromeSpec = {
  enabled: true,
  slots: [{ kind: "meta", field: "author" }, { kind: "pageNumber" }, { kind: "pageCount" }],
  fontSize: pt(9),
  color: "6B6B6B",
  rule: null,
  differentFirstPage: false,
  differentOddEven: false,
};

const titlePageSpec: TitlePageSpec = {
  enabled: true,
  verticalAlign: "center",
  titleSize: pt(28),
  subtitleSize: pt(16),
  showAuthor: true,
  showDate: true,
  dateFormat: "yyyy-MM-dd",
  pageBreakAfter: true,
  logo: null,
};

const themed = (changes: Partial<Theme["chrome"]>, extra: Partial<Theme> = {}): Theme => ({
  ...defaultTheme,
  ...extra,
  chrome: { header: null, footer: null, titlePage: null, ...changes },
});

const archiveOf = async (
  markdown: string,
  theme: Theme,
  options: DocumentOptions = {},
): Promise<DocxArchive> => {
  const normalized = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: computeContentWidth(theme),
    tabWidth: 4,
    minimumColumnWidth: dxa(680),
    maxWidthRatio: 1,
    imagePolicy: strictImagePolicy(),
    tableOfContentsEnabled: theme.tableOfContents.enabled,
    defaultLanguage: "en",
    metadata: {
      title: TITLE,
      subtitle: SUBTITLE,
      authors: META.authors,
      date: DATE,
      subject: SUBJECT,
    },
    documentOptions: options,
  });
  const result = await docxBackend.convert({
    document: normalized.document,
    theme,
    strict: false,
    options,
  });
  return readDocxArchive(Buffer.from(result.body));
};

const namesOf = (archive: DocxArchive): readonly string[] => [...archive.entries.keys()];

describe("chrome slots", () => {
  const compiled = compileThemeForDocx(defaultTheme);

  it("renders a literal text slot", () => {
    expect(slotChildren({ kind: "text", value: "Confidential" }, META, "Heading 1")).toHaveLength(
      1,
    );
  });

  it("renders nothing for an empty slot", () => {
    expect(slotChildren({ kind: "empty" }, META, "Heading 1")).toEqual([]);
  });

  it("computes a centre and a right tab stop from the content width", () => {
    const stops = chromeTabStops(compiled.contentWidth);
    expect(stops).toHaveLength(2);
    expect(stops[0]?.position).toBe(Math.round(compiled.contentWidth / 2));
    expect(stops[1]?.position).toBe(compiled.contentWidth);
  });
});

describe("the header", () => {
  const theme = themed({ header: headerSpec });

  it("is written as a header part", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    expect(namesOf(archive).some((name) => /word\/header\d*\.xml/.test(name))).toBe(true);
  });

  it("carries the metadata of the document", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    const header = namesOf(archive).find((name) => name.startsWith("word/header")) ?? "";
    expect(entryOf(archive, header)).toContain("Quarterly Report");
  });

  it("uses a chapter field rather than literal text", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    const header = namesOf(archive).find((name) => name.startsWith("word/header")) ?? "";
    const xml = entryOf(archive, header);
    expect(xml).toContain("STYLEREF");
    expect(xml).toContain("Heading 1");
  });

  it("lays the slots out with tab stops, never with a table", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    const header = namesOf(archive).find((name) => name.startsWith("word/header")) ?? "";
    const xml = entryOf(archive, header);
    expect(xml).toContain("<w:tabs>");
    expect(xml).not.toContain("<w:tbl>");
  });

  it("separates the three slots with a tab character each", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    const header = namesOf(archive).find((name) => name.startsWith("word/header")) ?? "";
    const xml = entryOf(archive, header);
    expect(xml.split("<w:tab/>")).toHaveLength(3);
  });

  it("draws the rule the theme asks for", async () => {
    const archive = await archiveOf("Body.\n", theme);
    const header = namesOf(archive).find((name) => name.startsWith("word/header")) ?? "";
    expect(entryOf(archive, header)).toContain("D5D5D5");
  });

  it("is absent when the theme declares none", async () => {
    const archive = await archiveOf("Body.\n", defaultTheme);
    expect(namesOf(archive).some((name) => name.startsWith("word/header"))).toBe(false);
  });

  it("is absent when the theme disables it", async () => {
    const archive = await archiveOf(
      "Body.\n",
      themed({ header: { ...headerSpec, enabled: false } }),
    );
    expect(namesOf(archive).some((name) => name.startsWith("word/header"))).toBe(false);
  });
});

describe("a first page that differs", () => {
  it("suppresses the header on the first page and marks the section", async () => {
    const theme = themed({ header: { ...headerSpec, differentFirstPage: true } });
    const archive = await archiveOf("Body.\n", theme);
    expect(entryOf(archive, "word/document.xml")).toContain("<w:titlePg/>");
    expect(namesOf(archive).filter((name) => name.startsWith("word/header"))).toHaveLength(2);
  });

  it("keeps the footer on the first page when only the header differs", async () => {
    const theme = themed({
      header: { ...headerSpec, differentFirstPage: true },
      footer: footerSpec,
    });
    const archive = await archiveOf("Body.\n", theme);
    const footers = namesOf(archive).filter((name) => name.startsWith("word/footer"));
    expect(footers).toHaveLength(2);
    for (const footer of footers) {
      expect(entryOf(archive, footer)).toContain("PAGE");
    }
  });

  it("writes no first page part when no slot asks for one", async () => {
    const archive = await archiveOf("Body.\n", themed({ header: headerSpec }));
    expect(entryOf(archive, "word/document.xml")).not.toContain("<w:titlePg/>");
    expect(namesOf(archive).filter((name) => name.startsWith("word/header"))).toHaveLength(1);
  });
});

describe("odd and even pages", () => {
  const theme = themed({ header: { ...headerSpec, differentOddEven: true } });

  it("declares the setting and mirrors the slots", async () => {
    const archive = await archiveOf("# A chapter\n\nBody.\n", theme);
    expect(entryOf(archive, "word/settings.xml")).toContain("<w:evenAndOddHeaders/>");
    expect(namesOf(archive).filter((name) => name.startsWith("word/header"))).toHaveLength(2);
  });

  it("is absent when the theme does not ask for it", async () => {
    const archive = await archiveOf("Body.\n", themed({ header: headerSpec }));
    expect(entryOf(archive, "word/settings.xml")).toContain('<w:evenAndOddHeaders w:val="false"/>');
  });
});

describe("the footer", () => {
  const theme = themed({ footer: footerSpec });

  it("carries the current page number and the total", async () => {
    const archive = await archiveOf("Body.\n", theme);
    const footer = namesOf(archive).find((name) => name.startsWith("word/footer")) ?? "";
    const xml = entryOf(archive, footer);
    expect(xml).toContain("PAGE");
    expect(xml).toContain("NUMPAGES");
  });

  it("carries the authors of the document", async () => {
    const archive = await archiveOf("Body.\n", theme);
    const footer = namesOf(archive).find((name) => name.startsWith("word/footer")) ?? "";
    expect(entryOf(archive, footer)).toContain("Ada Lovelace, Grace Hopper");
  });
});

describe("the title page", () => {
  const theme = themed({ titlePage: titlePageSpec });

  it("renders the title, the subtitle, the authors and the date", async () => {
    const archive = await archiveOf("# Body heading\n", theme);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("Md2Title");
    expect(xml).toContain("Md2Subtitle");
    expect(xml).toContain("Third quarter");
    expect(xml).toContain("Ada Lovelace, Grace Hopper");
    expect(xml).toContain("2026-09-30");
  });

  it("centres its section vertically when the theme asks for it", async () => {
    const archive = await archiveOf("Body.\n", theme);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain('<w:vAlign w:val="center"/>');
    expect(xml.match(/<w:vAlign/g) ?? []).toHaveLength(1);
  });

  it("leaves its section at the top when the theme asks for it", async () => {
    const top = themed({ titlePage: { ...titlePageSpec, verticalAlign: "top" } });
    const archive = await archiveOf("Body.\n", top);
    expect(entryOf(archive, "word/document.xml")).not.toContain("<w:vAlign");
  });

  it("takes its own section when the theme breaks after it", async () => {
    const archive = await archiveOf("Body.\n", theme);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml.match(/<w:sectPr>/g) ?? []).toHaveLength(2);
  });

  it("uses a different first page when the theme does not break after it", async () => {
    const inline = themed({ titlePage: { ...titlePageSpec, pageBreakAfter: false } });
    const archive = await archiveOf("Body.\n", inline);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("<w:titlePg/>");
    expect(xml.match(/<w:sectPr>/g) ?? []).toHaveLength(1);
  });

  it("is absent when the theme declares none", async () => {
    const archive = await archiveOf("Body.\n", defaultTheme);
    expect(entryOf(archive, "word/document.xml")).not.toContain("Md2Title");
  });

  it("can be switched off by the request", async () => {
    const archive = await archiveOf("Body.\n", theme, { titlePage: false });
    expect(entryOf(archive, "word/document.xml")).not.toContain("Md2Title");
  });

  it("can be switched on by the request", async () => {
    const enabled = themed({ titlePage: { ...titlePageSpec, enabled: false } });
    const archive = await archiveOf("Body.\n", enabled, { titlePage: true });
    expect(entryOf(archive, "word/document.xml")).toContain("Md2Title");
  });

  it("resolves the effective flag from the theme and the request", () => {
    const compiled = compileThemeForDocx(themed({ titlePage: titlePageSpec }));
    expect(titlePageIsEnabled(compiled, {})).toBe(true);
    expect(titlePageIsEnabled(compiled, { titlePage: false })).toBe(false);
    expect(titlePageIsEnabled(compileThemeForDocx(defaultTheme), {})).toBe(false);
    expect(titlePageIsEnabled(compileThemeForDocx(defaultTheme), { titlePage: true })).toBe(true);
  });
});

describe("the table of contents", () => {
  const withContents = (theme: Theme): Theme => ({
    ...theme,
    tableOfContents: { ...theme.tableOfContents, enabled: true },
  });

  it("is inserted when the theme enables it", async () => {
    const archive = await archiveOf("# A heading\n", withContents(defaultTheme));
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("TOC");
    expect(xml).toContain("Md2TocHeading");
    expect(xml).toContain(defaultTheme.tableOfContents.title);
  });

  it("is absent when the theme disables it", async () => {
    const archive = await archiveOf("# A heading\n", defaultTheme);
    expect(entryOf(archive, "word/document.xml")).not.toContain("Md2TocHeading");
  });

  it("follows the title page", async () => {
    const theme = withContents(themed({ titlePage: titlePageSpec }));
    const xml = entryOf(await archiveOf("# A heading\n", theme), "word/document.xml");
    expect(xml.indexOf("Md2Title")).toBeLessThan(xml.indexOf("Md2TocHeading"));
  });

  it("is not duplicated when the document already carries a directive", async () => {
    const archive = await archiveOf("::toc\n\n# A heading\n", withContents(defaultTheme));
    const xml = entryOf(archive, "word/document.xml");
    expect(xml.match(/Md2TocHeading/g) ?? []).toHaveLength(1);
  });

  it("can be switched off by the request", async () => {
    const archive = await archiveOf("# A heading\n", withContents(defaultTheme), {
      tableOfContents: false,
    });
    expect(entryOf(archive, "word/document.xml")).not.toContain("Md2TocHeading");
  });

  it("asks the reader to refresh the fields", async () => {
    const archive = await archiveOf("# A heading\n", withContents(defaultTheme));
    expect(entryOf(archive, "word/settings.xml")).toContain("updateFields");
  });
});
