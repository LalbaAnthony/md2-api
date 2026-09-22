import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { isAppError } from "../../src/errors.ts";
import {
  detectImageFormat,
  prepareImage,
  resolveImageSource,
  resolveLocalPath,
  targetWidthPixels,
} from "../../src/pipeline/normalize/images.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import { strictImagePolicy } from "../helpers/image-policy.ts";
import type { NormalizeResult } from "../../src/types/pipeline.ts";
import type { ImageFetchPolicy } from "../../src/types/images.ts";

const CONTENT_WIDTH = dxa(9026);

const SVG_SOURCE = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">',
  '<rect width="200" height="100" fill="#1A1A1A"/>',
  '<text x="10" y="55" font-size="20" fill="#FFFFFF">Diagram</text>',
  "</svg>",
].join("");

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "md2-images-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const pngBytes = async (width: number, height: number): Promise<Buffer> =>
  sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

const policyFor = (overrides: Partial<ImageFetchPolicy> = {}): ImageFetchPolicy =>
  strictImagePolicy({ allowLocal: true, assetsDirectory: directory, ...overrides });

const normalize = async (markdown: string, policy: ImageFetchPolicy): Promise<NormalizeResult> =>
  normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: CONTENT_WIDTH,
    tabWidth: 4,
    minimumColumnWidth: dxa(680),
    maxWidthRatio: 1,
    imagePolicy: policy,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });

const expectImageError = async (call: () => Promise<unknown>): Promise<void> => {
  try {
    await call();
    expect.unreachable("Expected an image error.");
  } catch (thrown) {
    expect(isAppError(thrown)).toBe(true);
    if (isAppError(thrown)) {
      expect(thrown.code).toBe("IMAGE_ERROR");
    }
  }
};

describe("detecting the format from the bytes", () => {
  it("recognises png, jpeg, gif and bmp", async () => {
    expect(detectImageFormat(await pngBytes(4, 4))).toBe("png");
    expect(detectImageFormat(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImageFormat(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("gif");
    expect(detectImageFormat(Uint8Array.from([0x42, 0x4d, 0x00, 0x00]))).toBe("bmp");
  });

  it("recognises webp and tiff", async () => {
    const webp = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#000000" },
    })
      .webp()
      .toBuffer();
    expect(detectImageFormat(webp)).toBe("webp");
    expect(detectImageFormat(Uint8Array.from([0x49, 0x49, 0x2a, 0x00]))).toBe("tiff");
  });

  it("recognises an svg document", () => {
    expect(detectImageFormat(Buffer.from(SVG_SOURCE, "utf8"))).toBe("svg");
  });

  it("refuses bytes that match nothing", () => {
    expect(detectImageFormat(Buffer.from("not an image at all", "utf8"))).toBe("unknown");
  });

  it("never trusts a declared type over the bytes", async () => {
    const policy = policyFor();
    await writeFile(join(directory, "liar.png"), Buffer.from("this is not a png", "utf8"));
    await expectImageError(async () => resolveImageSource("liar.png", policy));
  });
});

describe("resolving a local path", () => {
  it("accepts a path inside the assets directory", () => {
    expect(resolveLocalPath("nested/a.png", directory)).toContain("a.png");
  });

  it("refuses a traversal outside the assets directory", () => {
    expect(() => resolveLocalPath("../../etc/passwd", directory)).toThrow();
    expect(() => resolveLocalPath("nested/../../escape.png", directory)).toThrow();
  });

  it("refuses local images when they are disabled", async () => {
    await writeFile(join(directory, "a.png"), await pngBytes(4, 4));
    await expectImageError(async () =>
      resolveImageSource("a.png", policyFor({ allowLocal: false })),
    );
  });

  it("refuses an absolute path even when local images are allowed", async () => {
    await expectImageError(async () => resolveImageSource(join(directory, "a.png"), policyFor()));
  });

  it("reads a file that is inside the directory", async () => {
    await writeFile(join(directory, "a.png"), await pngBytes(8, 8));
    const resolved = await resolveImageSource("a.png", policyFor());
    expect(resolved.detected).toBe("png");
  });
});

describe("data URIs", () => {
  it("decodes a base64 payload", async () => {
    const png = await pngBytes(4, 4);
    const source = `data:image/png;base64,${png.toString("base64")}`;
    const resolved = await resolveImageSource(source, policyFor({ allowLocal: false }));
    expect(resolved.detected).toBe("png");
  });

  it("decodes an unencoded svg payload", async () => {
    const source = `data:image/svg+xml,${encodeURIComponent(SVG_SOURCE)}`;
    const resolved = await resolveImageSource(source, policyFor({ allowLocal: false }));
    expect(resolved.detected).toBe("svg");
  });

  it("refuses a data URI without a payload", async () => {
    await expectImageError(async () => resolveImageSource("data:image/png;base64", policyFor()));
  });
});

describe("remote images", () => {
  it("are refused when the switch is off", async () => {
    await expectImageError(async () =>
      resolveImageSource("https://cdn.example.com/a.png", policyFor()),
    );
  });
});

describe("bounds", () => {
  it("refuses a payload above the byte limit", async () => {
    await writeFile(join(directory, "big.png"), await pngBytes(64, 64));
    await expectImageError(async () =>
      resolveImageSource("big.png", policyFor({ maximumBytes: 16 })),
    );
  });

  it("refuses an image above the pixel limit", async () => {
    const resolved = { bytes: await pngBytes(400, 400), detected: "png" as const };
    await expectImageError(async () =>
      prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor({ maximumPixels: 1000 }), "big.png"),
    );
  });

  it("refuses a document above the image count limit", async () => {
    await writeFile(join(directory, "a.png"), await pngBytes(4, 4));
    const markdown = "![one](a.png) ![two](a.png) ![three](a.png)\n";
    await expect(normalize(markdown, policyFor({ maximumImagesPerDocument: 2 }))).rejects.toSatisfy(
      (thrown: unknown) => isAppError(thrown),
    );
  });
});

describe("sizing", () => {
  it("computes the target width from the content box and the ratios", () => {
    expect(targetWidthPixels(CONTENT_WIDTH, 1, 1)).toBe(602);
    expect(targetWidthPixels(CONTENT_WIDTH, 0.5, 1)).toBe(301);
    expect(targetWidthPixels(CONTENT_WIDTH, 1, 0.5)).toBe(301);
  });

  it("never enlarges an image beyond its intrinsic width", async () => {
    const resolved = { bytes: await pngBytes(120, 60), detected: "png" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor(), "small.png");
    expect(prepared.intrinsic.width).toBe(120);
    expect(prepared.rendered.width).toBe(120);
  });

  it("shrinks a wide image to the content box and keeps the ratio", async () => {
    const resolved = { bytes: await pngBytes(2000, 1000), detected: "png" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor(), "wide.png");
    expect(prepared.rendered.width).toBe(602);
    expect(prepared.rendered.height).toBe(301);
    expect(prepared.intrinsic.width).toBe(2000);
  });

  it("honours a width ratio below one", async () => {
    const resolved = { bytes: await pngBytes(2000, 1000), detected: "png" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 0.5, policyFor(), "wide.png");
    expect(prepared.rendered.width).toBe(301);
  });
});

describe("rasterising an SVG", () => {
  it("turns a textual SVG into a PNG", async () => {
    const resolved = { bytes: Buffer.from(SVG_SOURCE, "utf8"), detected: "svg" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor(), "d.svg");
    expect(prepared.encoding).toBe("png");
    expect(detectImageFormat(prepared.data)).toBe("png");
    expect(prepared.data.byteLength).toBeGreaterThan(0);
  });

  it("keeps the aspect ratio of the source", async () => {
    const resolved = { bytes: Buffer.from(SVG_SOURCE, "utf8"), detected: "svg" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor(), "d.svg");
    expect(prepared.intrinsic.width / prepared.intrinsic.height).toBeCloseTo(2, 1);
  });

  it("carries the drawn pixels, not an empty canvas", async () => {
    const resolved = { bytes: Buffer.from(SVG_SOURCE, "utf8"), detected: "svg" as const };
    const prepared = await prepareImage(resolved, CONTENT_WIDTH, 1, 1, policyFor(), "d.svg");
    const statistics = await sharp(Buffer.from(prepared.data)).stats();
    const channel = statistics.channels[0];
    expect(channel?.max).toBeGreaterThan(channel?.min ?? 0);
  });
});

describe("converting formats that Word does not read", () => {
  it("turns a webp into a png", async () => {
    const webp = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#204080" },
    })
      .webp()
      .toBuffer();
    const prepared = await prepareImage(
      { bytes: webp, detected: "webp" },
      CONTENT_WIDTH,
      1,
      1,
      policyFor(),
      "a.webp",
    );
    expect(prepared.encoding).toBe("png");
    expect(detectImageFormat(prepared.data)).toBe("png");
  });

  it("leaves a jpeg as a jpeg", async () => {
    const jpeg = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#204080" },
    })
      .jpeg()
      .toBuffer();
    const prepared = await prepareImage(
      { bytes: jpeg, detected: "jpeg" },
      CONTENT_WIDTH,
      1,
      1,
      policyFor(),
      "a.jpg",
    );
    expect(prepared.encoding).toBe("jpeg");
  });
});

describe("images in a document", () => {
  it("records the asset and counts it", async () => {
    await writeFile(join(directory, "a.png"), await pngBytes(40, 20));
    const result = await normalize("![alt text](a.png)\n", policyFor());
    expect(result.document.assets.size).toBe(1);
    expect(result.document.stats.images).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("falls back to the alternative text when the image is unusable", async () => {
    const result = await normalize("![the alt text](missing.png)\n", policyFor());
    expect(result.document.assets.size).toBe(0);
    expect(result.warnings.map((entry) => entry.code)).toEqual(["IMAGE_UNAVAILABLE"]);
    const paragraph = result.document.blocks[0];
    if (paragraph?.kind === "paragraph") {
      expect(paragraph.children[0]).toMatchObject({ kind: "text", value: "the alt text" });
    }
  });

  it("fails in strict mode instead of falling back", async () => {
    await expect(
      normalizeDocument(parseMarkdown("![alt](missing.png)\n"), {
        strict: true,
        maxNestingDepth: 100,
        contentWidth: CONTENT_WIDTH,
        tabWidth: 4,
        minimumColumnWidth: dxa(680),
        maxWidthRatio: 1,
        imagePolicy: policyFor(),
        defaultLanguage: "en",
        metadata: {},
        documentOptions: {},
      }),
    ).rejects.toSatisfy((thrown: unknown) => isAppError(thrown));
  });
});

describe("the figure directive", () => {
  it("produces a figure block with its caption and ratio", async () => {
    await writeFile(join(directory, "d.svg"), Buffer.from(SVG_SOURCE, "utf8"));
    const result = await normalize(
      '::figure{src="d.svg" alt="A diagram" width="60%" caption="The diagram"}\n',
      policyFor(),
    );
    const figure = result.document.blocks[0];
    expect(figure?.kind).toBe("figure");
    if (figure?.kind === "figure") {
      expect(figure.caption).toBe("The diagram");
      expect(figure.widthRatio).toBeCloseTo(0.6, 5);
      expect(figure.sequence).toBe(1);
      expect(figure.asset.encoding).toBe("png");
    }
  });

  it("numbers the figures of a document in order", async () => {
    await writeFile(join(directory, "a.png"), await pngBytes(20, 10));
    const result = await normalize('::figure{src="a.png"}\n\n::figure{src="a.png"}\n', policyFor());
    const sequences = result.document.blocks
      .filter((block) => block.kind === "figure")
      .map((block) => block.sequence);
    expect(sequences).toEqual([1, 2]);
  });

  it("degrades a directive without a source", async () => {
    const result = await normalize('::figure{alt="no source"}' + "\n", policyFor());
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
    expect(result.document.blocks).toEqual([]);
  });

  it("degrades an unknown attribute", async () => {
    const result = await normalize('::figure{src="a.png" unexpected="x"}' + "\n", policyFor());
    expect(result.warnings.map((entry) => entry.code)).toEqual(["DIRECTIVE_INVALID"]);
  });
});
