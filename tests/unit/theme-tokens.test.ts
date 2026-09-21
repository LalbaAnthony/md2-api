import { describe, expect, it } from "vitest";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import {
  computeContentHeight,
  computeContentWidth,
  isHexColor,
  mixWithWhite,
  relativeLuminance,
  tintForBackground,
  typeScale,
} from "../../src/theme/tokens.ts";
import { isAppError } from "../../src/errors.ts";
import { dxa, pt } from "../../src/units.ts";
import type { Theme } from "../../src/types/theme.ts";

const withPage = (
  width: number,
  left: number,
  right: number,
  gutter: number,
  height: number,
  top: number,
  bottom: number,
): Theme => ({
  ...defaultTheme,
  page: {
    ...defaultTheme.page,
    size: { width: dxa(width), height: dxa(height) },
    margin: {
      ...defaultTheme.page.margin,
      left: dxa(left),
      right: dxa(right),
      gutter: dxa(gutter),
      top: dxa(top),
      bottom: dxa(bottom),
    },
  },
});

describe("content box", () => {
  it("subtracts both margins and the gutter from the page width", () => {
    expect(computeContentWidth(withPage(11906, 1440, 1440, 0, 16838, 1440, 1440))).toBe(9026);
    expect(computeContentWidth(withPage(11906, 1440, 1440, 720, 16838, 1440, 1440))).toBe(8306);
  });

  it("subtracts the vertical margins from the page height", () => {
    expect(computeContentHeight(withPage(11906, 1440, 1440, 0, 16838, 1440, 1440))).toBe(13958);
  });

  it("stays positive for every built in theme", () => {
    expect(computeContentWidth(defaultTheme)).toBeGreaterThan(0);
    expect(computeContentHeight(defaultTheme)).toBeGreaterThan(0);
  });
});

describe("type scale", () => {
  it("returns the base size at level zero", () => {
    expect(typeScale(pt(11), 1.2, 0)).toBe(11);
  });

  it("grows by the ratio at each level", () => {
    expect(typeScale(pt(10), 1.2, 1)).toBe(12);
    expect(typeScale(pt(10), 1.2, 2)).toBe(14.4);
  });

  it("shrinks below the base size at a negative level", () => {
    expect(typeScale(pt(12), 1.2, -1)).toBe(10);
  });

  it("rounds to a tenth of a point", () => {
    expect(typeScale(pt(11), 1.25, 3)).toBe(21.5);
  });
});

describe("colour helpers", () => {
  it("recognises a six digit colour without a hash", () => {
    expect(isHexColor("1A1A1A")).toBe(true);
    expect(isHexColor("#1A1A1A")).toBe(false);
    expect(isHexColor("1A1A1")).toBe(false);
    expect(isHexColor("GGGGGG")).toBe(false);
  });

  it("leaves a colour unchanged at weight zero", () => {
    expect(mixWithWhite("2F5D8C", 0)).toBe("2F5D8C");
  });

  it("reaches white at weight one", () => {
    expect(mixWithWhite("2F5D8C", 1)).toBe("FFFFFF");
  });

  it("mixes halfway", () => {
    expect(mixWithWhite("000000", 0.5)).toBe("808080");
  });

  it("clamps a weight outside the unit interval", () => {
    expect(mixWithWhite("000000", -1)).toBe("000000");
    expect(mixWithWhite("000000", 5)).toBe("FFFFFF");
  });

  it("produces a light tint for a callout background", () => {
    const tint = tintForBackground("9C2C2C");
    expect(isHexColor(tint)).toBe(true);
    expect(relativeLuminance(tint)).toBeGreaterThan(relativeLuminance("9C2C2C"));
  });

  it("orders black, mid grey and white by luminance", () => {
    expect(relativeLuminance("000000")).toBe(0);
    expect(relativeLuminance("FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("808080")).toBeGreaterThan(0);
    expect(relativeLuminance("808080")).toBeLessThan(1);
  });

  it("rejects a malformed colour", () => {
    for (const call of [() => mixWithWhite("nope", 0.5), () => relativeLuminance("12345")]) {
      try {
        call();
        expect.unreachable("Expected a validation error.");
      } catch (thrown) {
        expect(isAppError(thrown)).toBe(true);
      }
    }
  });
});

describe("the default theme", () => {
  it("uses no emoji and no long dash in its text", () => {
    const serialised = JSON.stringify(defaultTheme);
    expect(serialised).not.toContain(String.fromCodePoint(0x2013));
    expect(serialised).not.toContain(String.fromCodePoint(0x2014));
  });

  it("declares six heading levels with strictly decreasing sizes", () => {
    expect(defaultTheme.heading).toHaveLength(6);
    const sizes = defaultTheme.heading.map((level) => level.size);
    for (let index = 1; index < sizes.length; index += 1) {
      expect(sizes[index]).toBeLessThan(sizes[index - 1] ?? 0);
    }
  });

  it("declares outline levels from zero to five", () => {
    expect(defaultTheme.heading.map((level) => level.outlineLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("declares a style for every syntax scope", () => {
    expect(Object.keys(defaultTheme.syntax)).toHaveLength(13);
    for (const style of Object.values(defaultTheme.syntax)) {
      expect(isHexColor(style.foreground)).toBe(true);
    }
  });

  it("declares a colour and a label for every callout kind", () => {
    expect(Object.keys(defaultTheme.color.callout)).toEqual([
      "info",
      "warning",
      "danger",
      "success",
      "note",
    ]);
    expect(Object.keys(defaultTheme.callout.labels)).toEqual([
      "info",
      "warning",
      "danger",
      "success",
      "note",
    ]);
  });

  it("fits A4 exactly", () => {
    expect(defaultTheme.page.size.width).toBe(11906);
    expect(defaultTheme.page.size.height).toBe(16838);
  });

  it("carries neither a title page nor a table of contents", () => {
    expect(defaultTheme.chrome.titlePage).toBeNull();
    expect(defaultTheme.tableOfContents.enabled).toBe(false);
  });
});
