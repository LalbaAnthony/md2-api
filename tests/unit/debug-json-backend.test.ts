import { describe, expect, it } from "vitest";
import { debugJsonBackend } from "../../src/formats/debug-json/backend.ts";
import { serialiseDocument } from "../../src/formats/debug-json/serialise.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { sampleAsset, sampleDocument } from "../helpers/format-fixtures.ts";
import type { DocumentIr } from "../../src/types/ir.ts";
import type { Theme } from "../../src/types/theme.ts";

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const convert = async (document: DocumentIr = sampleDocument()): Promise<string> => {
  const result = await debugJsonBackend.convert({ document, theme: defaultTheme, strict: false });
  return decode(result.body);
};

describe("descriptor", () => {
  it("declares itself unfit for production", () => {
    expect(debugJsonBackend.descriptor.productionReady).toBe(false);
  });

  it("declares JSON as its media type and extension", () => {
    expect(debugJsonBackend.descriptor.mediaType).toBe("application/json");
    expect(debugJsonBackend.descriptor.fileExtension).toBe("json");
  });

  it("declares no pagination and no page chrome", () => {
    expect(debugJsonBackend.descriptor.capabilities.pagination).toBe(false);
    expect(debugJsonBackend.descriptor.capabilities.pageChrome).toBe(false);
    expect(debugJsonBackend.descriptor.capabilities.tableOfContents).toBe("none");
  });

  it("states its caveats", () => {
    expect(debugJsonBackend.descriptor.caveats.length).toBeGreaterThan(0);
  });
});

describe("conversion", () => {
  it("returns the intermediate representation as JSON", async () => {
    const parsed: { blocks: { kind: string }[]; formatVersion: number } = JSON.parse(
      await convert(),
    );
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "table",
      "thematicBreak",
    ]);
  });

  it("reports its media type and extension in the result", async () => {
    const result = await debugJsonBackend.convert({
      document: sampleDocument(),
      theme: defaultTheme,
      strict: false,
    });
    expect(result.mediaType).toBe("application/json");
    expect(result.fileExtension).toBe("json");
    expect(result.warnings).toEqual([]);
  });

  it("produces byte identical output for the same document", async () => {
    const first = await convert();
    const second = await convert();
    expect(first).toBe(second);
  });

  it("orders object keys deterministically whatever the insertion order", async () => {
    const parsed: { meta: Record<string, unknown> } = JSON.parse(await convert());
    expect(Object.keys(parsed.meta)).toEqual([
      "authors",
      "custom",
      "keywords",
      "language",
      "title",
    ]);
  });

  it("orders anchors and footnotes deterministically", async () => {
    const document = sampleDocument({
      anchors: new Map([
        ["zebra", "Zebra"],
        ["alpha", "Alpha"],
      ]),
      footnotes: new Map([
        [2, []],
        [1, []],
      ]),
    });
    const parsed: {
      anchors: [string, string][];
      footnotes: { id: number }[];
    } = JSON.parse(await convert(document));
    expect(parsed.anchors.map(([slug]) => slug)).toEqual(["alpha", "zebra"]);
    expect(parsed.footnotes.map((footnote) => footnote.id)).toEqual([1, 2]);
  });

  it("replaces image bytes by a length and a digest", async () => {
    const asset = sampleAsset("cover.png", [1, 2, 3, 4]);
    const document = sampleDocument({ assets: new Map([[asset.sourceKey, asset]]) });
    const parsed: {
      assets: { sourceKey: string; byteLength: number; digest: string }[];
    } = JSON.parse(await convert(document));
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]?.byteLength).toBe(4);
    expect(parsed.assets[0]?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(parsed.assets)).not.toContain("data");
  });

  it("gives different digests to different image bytes", () => {
    const first = serialiseDocument(
      sampleDocument({ assets: new Map([["a", sampleAsset("a", [1, 2, 3])]]) }),
    );
    const second = serialiseDocument(
      sampleDocument({ assets: new Map([["a", sampleAsset("a", [1, 2, 4])]]) }),
    );
    expect(first.assets[0]?.digest).not.toBe(second.assets[0]?.digest);
  });

  it("keeps branded lengths as plain numbers", async () => {
    const parsed: { blocks: { kind: string; columnWidths?: number[] }[] } = JSON.parse(
      await convert(),
    );
    const table = parsed.blocks.find((block) => block.kind === "table");
    expect(table?.columnWidths).toEqual([4513, 4513]);
  });
});

describe("theme extension", () => {
  it("accepts an empty extension", () => {
    expect(debugJsonBackend.validateThemeExtension({})).toEqual({ ok: true });
  });

  it("rejects any unknown key", () => {
    const outcome = debugJsonBackend.validateThemeExtension({ styleIdPrefix: "Md2" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.issues.length).toBeGreaterThan(0);
    }
  });

  it("publishes a JSON schema for theme authors", () => {
    expect(debugJsonBackend.themeExtensionJsonSchema).not.toBeNull();
  });
});

describe("theme caveats", () => {
  const withChrome = (theme: Theme): Theme => ({
    ...theme,
    tableOfContents: { ...theme.tableOfContents, enabled: true },
    page: {
      ...theme.page,
      columns: { count: 2, space: theme.page.margin.gutter, separator: true },
    },
  });

  it("reports nothing for a theme without pages furniture", () => {
    expect(debugJsonBackend.describeThemeCaveats(defaultTheme)).toEqual([]);
  });

  it("reports what it cannot represent", () => {
    const caveats = debugJsonBackend.describeThemeCaveats(withChrome(defaultTheme));
    expect(caveats).toHaveLength(2);
    expect(caveats.join(" ")).toContain("table of contents");
  });
});

describe("structured clone safety", () => {
  it("clones the intermediate representation without throwing", () => {
    const asset = sampleAsset("cover.png", [9, 8, 7]);
    const document = sampleDocument({ assets: new Map([[asset.sourceKey, asset]]) });
    const cloned = structuredClone(document);
    expect(cloned.blocks).toEqual(document.blocks);
    expect(cloned.assets.get("cover.png")?.data).toEqual(asset.data);
  });
});

describe("lifecycle", () => {
  it("warms up and invalidates without effect", async () => {
    await expect(debugJsonBackend.warmUp()).resolves.toBeUndefined();
    expect(() => {
      debugJsonBackend.invalidateThemeCache("default");
    }).not.toThrow();
  });
});
