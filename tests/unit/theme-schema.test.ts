import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { themeSchema } from "../../src/theme/schema.ts";
import type { Theme } from "../../src/types/theme.ts";

type InferredTheme = z.infer<typeof themeSchema>;

const asJson = (theme: Theme): unknown => JSON.parse(JSON.stringify(theme));

const fromCodePoints = (...points: readonly number[]): string => String.fromCodePoint(...points);

describe("schema and interface equivalence", () => {
  it("infers exactly the Theme interface", () => {
    expectTypeOf<InferredTheme>().toEqualTypeOf<Theme>();
    expectTypeOf<Theme>().toEqualTypeOf<InferredTheme>();
  });
});

describe("accepting a valid theme", () => {
  it("accepts the built in default theme after a JSON round trip", () => {
    const parsed = themeSchema.safeParse(asJson(defaultTheme));
    expect(parsed.success).toBe(true);
  });

  it("produces a value equal to the source theme", () => {
    const parsed = themeSchema.parse(asJson(defaultTheme));
    expect(parsed).toEqual(defaultTheme);
  });

  it("freezes the parsed theme", () => {
    const parsed = themeSchema.parse(asJson(defaultTheme));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.page)).toBe(true);
  });
});

const withOverride = (mutate: (draft: Record<string, unknown>) => void): unknown => {
  const draft: Record<string, unknown> = JSON.parse(JSON.stringify(defaultTheme));
  mutate(draft);
  return draft;
};

const firstIssuePath = (candidate: unknown): string => {
  const parsed = themeSchema.safeParse(candidate);
  if (parsed.success) {
    return "";
  }
  const issue = parsed.error.issues[0];
  return issue === undefined ? "" : issue.path.join(".");
};

describe("rejecting invalid themes", () => {
  it("rejects an unknown key at the root", () => {
    const candidate = withOverride((draft) => {
      draft["unexpected"] = true;
    });
    expect(themeSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects an unknown key in a nested object", () => {
    const candidate = withOverride((draft) => {
      const page: Record<string, unknown> = JSON.parse(JSON.stringify(draft["page"]));
      page["bleed"] = 10;
      draft["page"] = page;
    });
    const parsed = themeSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    expect(firstIssuePath(candidate)).toBe("page");
    expect(JSON.stringify(parsed.error?.issues)).toContain("bleed");
  });

  it("rejects a missing key", () => {
    const candidate = withOverride((draft) => {
      delete draft["caption"];
    });
    expect(firstIssuePath(candidate)).toBe("caption");
  });

  it("rejects a colour carrying a hash", () => {
    const candidate = withOverride((draft) => {
      const color: Record<string, unknown> = JSON.parse(JSON.stringify(draft["color"]));
      color["text"] = "#1A1A1A";
      draft["color"] = color;
    });
    expect(firstIssuePath(candidate)).toBe("color.text");
  });

  it("rejects a colour of the wrong length", () => {
    const candidate = withOverride((draft) => {
      const color: Record<string, unknown> = JSON.parse(JSON.stringify(draft["color"]));
      color["accent"] = "ABC";
      draft["color"] = color;
    });
    expect(firstIssuePath(candidate)).toBe("color.accent");
  });

  it("rejects a heading tuple of the wrong length", () => {
    const candidate = withOverride((draft) => {
      const headings: unknown[] = JSON.parse(JSON.stringify(draft["heading"]));
      draft["heading"] = headings.slice(0, 5);
    });
    expect(themeSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects a chrome slot tuple of the wrong length", () => {
    const candidate = withOverride((draft) => {
      draft["chrome"] = {
        header: {
          enabled: true,
          slots: [{ kind: "empty" }, { kind: "pageNumber" }],
          fontSize: 9,
          color: "6B6B6B",
          rule: null,
          differentFirstPage: false,
          differentOddEven: false,
        },
        footer: null,
        titlePage: null,
      };
    });
    expect(themeSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects fewer than three bullet glyphs", () => {
    const candidate = withOverride((draft) => {
      const list: Record<string, unknown> = JSON.parse(JSON.stringify(draft["list"]));
      list["bulletGlyphs"] = ["-", "-"];
      draft["list"] = list;
    });
    expect(firstIssuePath(candidate)).toBe("list.bulletGlyphs");
  });

  it("rejects a figure ratio outside the unit interval", () => {
    for (const ratio of [0, 1.01, -0.5]) {
      const candidate = withOverride((draft) => {
        const figure: Record<string, unknown> = JSON.parse(JSON.stringify(draft["figure"]));
        figure["maxWidthRatio"] = ratio;
        draft["figure"] = figure;
      });
      expect(firstIssuePath(candidate)).toBe("figure.maxWidthRatio");
    }
  });

  it("rejects a non integer twip", () => {
    const candidate = withOverride((draft) => {
      const page: Record<string, unknown> = JSON.parse(JSON.stringify(draft["page"]));
      const size: Record<string, unknown> = JSON.parse(JSON.stringify(page["size"]));
      size["width"] = 11906.5;
      page["size"] = size;
      draft["page"] = page;
    });
    expect(firstIssuePath(candidate)).toBe("page.size.width");
  });

  it("rejects an identifier that is not kebab-case", () => {
    const candidate = withOverride((draft) => {
      draft["id"] = "Not Valid";
    });
    expect(firstIssuePath(candidate)).toBe("id");
  });

  it("rejects a version that is not semantic", () => {
    const candidate = withOverride((draft) => {
      draft["version"] = "one";
    });
    expect(firstIssuePath(candidate)).toBe("version");
  });
});

describe("character bans", () => {
  it("rejects an emoji in a bullet glyph", () => {
    const candidate = withOverride((draft) => {
      const list: Record<string, unknown> = JSON.parse(JSON.stringify(draft["list"]));
      list["bulletGlyphs"] = ["\u{1F536}", "-", "-"];
      draft["list"] = list;
    });
    expect(firstIssuePath(candidate)).toBe("list.bulletGlyphs.0");
  });

  it("rejects an emoji in a callout label", () => {
    const candidate = withOverride((draft) => {
      const callout: Record<string, unknown> = JSON.parse(JSON.stringify(draft["callout"]));
      const labels: Record<string, unknown> = JSON.parse(JSON.stringify(callout["labels"]));
      labels["warning"] = `Warning ${fromCodePoints(0x26a0, 0xfe0f)}`;
      callout["labels"] = labels;
      draft["callout"] = callout;
    });
    expect(firstIssuePath(candidate)).toBe("callout.labels.warning");
  });

  it("rejects an emoji in a task glyph", () => {
    const candidate = withOverride((draft) => {
      const list: Record<string, unknown> = JSON.parse(JSON.stringify(draft["list"]));
      list["taskGlyphs"] = { checked: fromCodePoints(0x2705), unchecked: "[ ]" };
      draft["list"] = list;
    });
    expect(firstIssuePath(candidate)).toBe("list.taskGlyphs.checked");
  });

  it("rejects an em dash in a text field", () => {
    const candidate = withOverride((draft) => {
      draft["label"] = `Default ${fromCodePoints(0x2014)} sober`;
    });
    expect(firstIssuePath(candidate)).toBe("label");
  });

  it("rejects an en dash in a text field", () => {
    const candidate = withOverride((draft) => {
      draft["description"] = `Pages 1${fromCodePoints(0x2013)}2`;
    });
    expect(firstIssuePath(candidate)).toBe("description");
  });

  it("accepts a non emoji typographic glyph", () => {
    const candidate = withOverride((draft) => {
      const list: Record<string, unknown> = JSON.parse(JSON.stringify(draft["list"]));
      list["bulletGlyphs"] = [
        fromCodePoints(0x2022),
        fromCodePoints(0x25e6),
        fromCodePoints(0x25aa),
      ];
      draft["list"] = list;
    });
    expect(themeSchema.safeParse(candidate).success).toBe(true);
  });
});

describe("format extensions", () => {
  it("accepts an arbitrary JSON object per format", () => {
    const candidate = withOverride((draft) => {
      draft["formats"] = { docx: { styleIdPrefix: "Md2", nested: { depth: 2 } } };
    });
    expect(themeSchema.safeParse(candidate).success).toBe(true);
  });

  it("rejects a non object format entry", () => {
    const candidate = withOverride((draft) => {
      draft["formats"] = { docx: "invalid" };
    });
    expect(themeSchema.safeParse(candidate).success).toBe(false);
  });
});
