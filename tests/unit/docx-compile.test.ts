import { describe, expect, it } from "vitest";
import { compileThemeForDocx } from "../../src/formats/docx/compile/index.ts";
import { allStyleKeys, buildStyleIds } from "../../src/formats/docx/compile/styles.ts";
import { compileNumbering } from "../../src/formats/docx/compile/numbering.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { computeContentWidth } from "../../src/theme/tokens.ts";
import { isHexColor } from "../../src/theme/tokens.ts";
import type { DocxStyleKey } from "../../src/types/docx-theme.ts";
import type { Theme } from "../../src/types/theme.ts";

const compiled = compileThemeForDocx(defaultTheme);

const numbered = (theme: Theme): Theme => ({
  ...theme,
  heading: [
    { ...theme.heading[0], numbered: true },
    theme.heading[1],
    theme.heading[2],
    theme.heading[3],
    theme.heading[4],
    theme.heading[5],
  ],
});

describe("style identifiers", () => {
  it("covers every declared style key", () => {
    const ids = buildStyleIds("Md2");
    expect(Object.keys(ids).sort()).toEqual([...allStyleKeys].sort());
  });

  it("prefixes every identifier", () => {
    for (const id of Object.values(buildStyleIds("Acme"))) {
      expect(id.startsWith("Acme")).toBe(true);
    }
  });

  it("gives a distinct identifier to every key", () => {
    const ids = Object.values(buildStyleIds("Md2"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("compiled styles", () => {
  it("declares a paragraph style for every paragraph key", () => {
    const declared = (compiled.styles.paragraphStyles ?? []).map((style) => style.id);
    const keys: readonly DocxStyleKey[] = [
      "Normal",
      "Heading1",
      "Heading6",
      "Quote",
      "CodeLine",
      "Toc6",
    ];
    for (const key of keys) {
      expect(declared).toContain(compiled.styleIds[key]);
    }
  });

  it("declares a character style for every character key", () => {
    const declared = (compiled.styles.characterStyles ?? []).map((style) => style.id);
    const keys: readonly DocxStyleKey[] = ["CodeChar", "Hyperlink", "Strong", "MathInline"];
    for (const key of keys) {
      expect(declared).toContain(compiled.styleIds[key]);
    }
  });

  it("converts the body size to half points", () => {
    const normal = (compiled.styles.paragraphStyles ?? []).find(
      (style) => style.id === compiled.styleIds.Normal,
    );
    expect(normal?.run?.size).toBe(22);
  });

  it("uses no invalid colour anywhere", () => {
    const serialised = JSON.stringify(compiled.styles);
    for (const match of serialised.matchAll(/"color":"([^"]+)"/g)) {
      expect(isHexColor(match[1] ?? ""), `${match[1] ?? ""} is not a plain hex colour`).toBe(true);
    }
  });

  it("orders heading sizes from largest to smallest", () => {
    const headingKeys: readonly DocxStyleKey[] = [
      "Heading1",
      "Heading2",
      "Heading3",
      "Heading4",
      "Heading5",
      "Heading6",
    ];
    const sizes = headingKeys.map((key) => {
      const id = compiled.styleIds[key];
      return (compiled.styles.paragraphStyles ?? []).find((style) => style.id === id)?.run?.size;
    });
    for (let index = 1; index < sizes.length; index += 1) {
      expect(Number(sizes[index])).toBeLessThan(Number(sizes[index - 1]));
    }
  });
});

describe("compiled numbering", () => {
  it("declares nine levels in the bullet definition", () => {
    const bullet = compiled.numbering.config.find((entry) => entry.reference === "md2-bullet");
    expect(bullet?.levels).toHaveLength(9);
    expect(bullet?.levels.map((level) => level.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("declares nine levels in the ordered definition", () => {
    const ordered = compiled.numbering.config.find((entry) => entry.reference === "md2-ordered");
    expect(ordered?.levels).toHaveLength(9);
  });

  it("cycles the bullet glyphs of the theme", () => {
    const bullet = compiled.numbering.config.find((entry) => entry.reference === "md2-bullet");
    expect(bullet?.levels[0]?.text).toBe(defaultTheme.list.bulletGlyphs[0]);
    expect(bullet?.levels[3]?.text).toBe(defaultTheme.list.bulletGlyphs[0]);
  });

  it("indents each level by the configured step", () => {
    const bullet = compiled.numbering.config.find((entry) => entry.reference === "md2-bullet");
    const first = bullet?.levels[0]?.style?.paragraph?.indent?.left;
    const second = bullet?.levels[1]?.style?.paragraph?.indent?.left;
    expect(Number(second) - Number(first)).toBe(defaultTheme.list.indentStep);
  });

  it("omits the heading numbering when no heading is numbered", () => {
    expect(compiled.numbering.config.map((entry) => entry.reference)).toEqual([
      "md2-bullet",
      "md2-ordered",
    ]);
    expect(compiled.headingsAreNumbered).toBe(false);
  });

  it("emits the heading numbering when a heading is numbered", () => {
    const withNumbers = compileNumbering(numbered(defaultTheme));
    expect(withNumbers.config.map((entry) => entry.reference)).toContain("md2-headings");
    const headings = withNumbers.config.find((entry) => entry.reference === "md2-headings");
    expect(headings?.levels).toHaveLength(9);
    expect(headings?.levels[2]?.text).toBe("%1.%2.%3");
  });
});

describe("the compiled theme as a whole", () => {
  it("carries the identity and the content width", () => {
    expect(compiled.themeId).toBe("default");
    expect(compiled.themeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(compiled.contentWidth).toBe(computeContentWidth(defaultTheme));
    expect(compiled.contentWidth).toBeGreaterThan(0);
  });

  it("carries the page geometry into the section", () => {
    expect(compiled.section.page?.size?.width).toBe(defaultTheme.page.size.width);
    expect(compiled.section.page?.margin?.top).toBe(defaultTheme.page.margin.top);
  });

  it("applies the default theme extension", () => {
    expect(compiled.extension.styleIdPrefix).toBe("Md2");
    expect(compiled.extension.updateFieldsOnOpen).toBe(true);
  });

  it("honours a theme extension from the theme", () => {
    const themed = compileThemeForDocx({
      ...defaultTheme,
      formats: { docx: { styleIdPrefix: "Acme", updateFieldsOnOpen: false } },
    });
    expect(themed.styleIds.Normal).toBe("AcmeNormal");
    expect(themed.extension.updateFieldsOnOpen).toBe(false);
  });

  it("changes its hash when the theme changes", () => {
    const other = compileThemeForDocx({ ...defaultTheme, label: "Changed" });
    expect(other.themeHash).not.toBe(compiled.themeHash);
  });

  it("carries the paragraph behaviour the styles cannot express", () => {
    expect(compiled.paragraphBehaviour.widowControl).toBe(true);
    expect(compiled.paragraphBehaviour.headingPageBreakBefore).toHaveLength(6);
  });
});
