import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { docxBackend } from "../../src/formats/docx/backend.ts";
import { defaultTheme } from "../../src/theme/builtin/default.theme.ts";
import { px } from "../../src/units.ts";
import { entryOf, readDocxArchive } from "../helpers/docx-archive.ts";
import { rootContext, sampleDocument } from "../helpers/format-fixtures.ts";
import type { IrBlock, IrImageAsset } from "../../src/types/ir.ts";
import type { Theme } from "../../src/types/theme.ts";

const assetOf = async (width: number, height: number): Promise<IrImageAsset> => {
  const data = await sharp({
    create: { width, height, channels: 3, background: { r: 47, g: 93, b: 140 } },
  })
    .png()
    .toBuffer();
  return {
    sourceKey: "diagram.png",
    data,
    encoding: "png",
    intrinsic: { width: px(width), height: px(height) },
    rendered: { width: px(width), height: px(height) },
  };
};

const archiveOf = async (blocks: readonly IrBlock[], theme: Theme = defaultTheme) => {
  const result = await docxBackend.convert({
    document: sampleDocument({ blocks }),
    theme,
    strict: false,
  });
  return { archive: await readDocxArchive(Buffer.from(result.body)), warnings: result.warnings };
};

const figureBlock = (asset: IrImageAsset, caption: string | null): IrBlock => ({
  kind: "figure",
  context: rootContext,
  asset,
  caption,
  sequence: 1,
  widthRatio: 1,
});

describe("rendering a figure", () => {
  it("embeds the image as a media part", async () => {
    const { archive, warnings } = await archiveOf([figureBlock(await assetOf(120, 60), null)]);
    const media = [...archive.entries.keys()].filter((name) => name.startsWith("word/media/"));
    expect(media).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("declares the rendered size in emu", async () => {
    const { archive } = await archiveOf([figureBlock(await assetOf(120, 60), null)]);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("<wp:extent");
    expect(xml).toContain("w:drawing");
  });

  it("renders a caption with a sequence field", async () => {
    const { archive } = await archiveOf([figureBlock(await assetOf(60, 30), "The diagram")]);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("Md2FigureCaption");
    expect(xml).toContain("SEQ Figure");
    expect(xml).toContain("The diagram");
  });

  it("places the caption above when the theme asks for it", async () => {
    const above: Theme = {
      ...defaultTheme,
      caption: { ...defaultTheme.caption, position: "above" },
    };
    const { archive } = await archiveOf([figureBlock(await assetOf(60, 30), "Above")], above);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml.indexOf("Md2FigureCaption")).toBeLessThan(xml.indexOf("w:drawing"));
  });

  it("centres the figure when the theme asks for it", async () => {
    const { archive } = await archiveOf([figureBlock(await assetOf(60, 30), null)]);
    expect(entryOf(archive, "word/document.xml")).toContain('<w:jc w:val="center"/>');
  });
});

describe("rendering an inline image", () => {
  it("embeds the image inside the paragraph", async () => {
    const asset = await assetOf(40, 20);
    const { archive, warnings } = await archiveOf([
      {
        kind: "paragraph",
        context: rootContext,
        align: null,
        children: [
          {
            kind: "text",
            value: "before ",
            marks: {
              bold: false,
              italic: false,
              strike: false,
              subscript: false,
              superscript: false,
              code: false,
            },
          },
          { kind: "image", asset, alternativeText: "a diagram" },
        ],
      },
    ]);
    const xml = entryOf(archive, "word/document.xml");
    expect(xml).toContain("w:drawing");
    expect(xml).toContain("before ");
    expect(warnings).toEqual([]);
  });

  it("carries the source key as the alternative text", async () => {
    const { archive } = await archiveOf([figureBlock(await assetOf(40, 20), null)]);
    expect(entryOf(archive, "word/document.xml")).toContain("diagram.png");
  });
});
