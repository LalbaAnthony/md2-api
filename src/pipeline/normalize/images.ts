import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import sharp from "sharp";
import type { Metadata, Sharp } from "sharp";
import { imageError } from "../../errors.ts";
import { dxaToPixel } from "../../units.ts";
import { px } from "../../units.ts";
import { fetchRemoteImage } from "./image-fetch.ts";
import { isFigureDirective, parseFigureDirective } from "./directives.ts";
import { warning } from "./warnings.ts";
import type { Image, Root, RootContent } from "mdast";
import type { LeafDirective } from "mdast-util-directive";
import type { IrImageAsset } from "../../types/ir.ts";
import type { ImageResolutionOptions, ImageResolutionTable } from "../../types/pipeline.ts";
import type { Dxa } from "../../types/units.ts";
import type {
  DetectedImageFormat,
  ImageEncoding,
  ImageFetchPolicy,
  ImageRequest,
  RenderedImage,
  ResolvedImage,
} from "../../types/images.ts";

const DATA_URI_PREFIX = "data:";
const SVG_RASTER_DENSITY_FACTOR = 2;
const MAXIMUM_RASTER_DENSITY = 300;
const NOMINAL_SVG_DENSITY = 72;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

const containsAscii = (bytes: Uint8Array, text: string, limit: number): boolean => {
  const window = Buffer.from(bytes.subarray(0, limit)).toString("utf8");
  return window.includes(text);
};

export const detectImageFormat = (bytes: Uint8Array): DetectedImageFormat => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return "gif";
  }
  if (startsWith(bytes, [0x42, 0x4d])) {
    return "bmp";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    return "avif";
  }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return "tiff";
  }
  if (containsAscii(bytes, "<svg", 1024)) {
    return "svg";
  }
  return "unknown";
};

const decodeDataUri = (source: string): Uint8Array => {
  const comma = source.indexOf(",");
  if (comma < 0) {
    throw imageError("The data URI carries no payload.", { url: source.slice(0, 32) });
  }
  const header = source.slice(DATA_URI_PREFIX.length, comma);
  const payload = source.slice(comma + 1);
  if (!header.endsWith(";base64")) {
    return Buffer.from(decodeURIComponent(payload), "utf8");
  }
  return Buffer.from(payload, "base64");
};

export const resolveLocalPath = (source: string, assetsDirectory: string): string => {
  const root = resolve(assetsDirectory);
  const candidate = resolve(root, source);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw imageError("The image path escapes the assets directory.", { path: source });
  }
  return candidate;
};

const readLocalImage = async (source: string, policy: ImageFetchPolicy): Promise<Uint8Array> => {
  if (!policy.allowLocal) {
    throw imageError("Local images are disabled.", { path: source });
  }
  if (isAbsolute(source)) {
    throw imageError("An absolute image path is never accepted.", { path: source });
  }
  const target = resolveLocalPath(source, policy.assetsDirectory);
  try {
    return await readFile(target);
  } catch {
    throw imageError("The local image cannot be read.", { path: source });
  }
};

export const resolveImageSource = async (
  source: string,
  policy: ImageFetchPolicy,
): Promise<ResolvedImage> => {
  const bytes = await readImageBytes(source, policy);
  if (bytes.byteLength > policy.maximumBytes) {
    throw imageError("The image exceeds the configured byte limit.", {
      url: source,
      byteLength: bytes.byteLength,
      maximumBytes: policy.maximumBytes,
    });
  }
  const detected = detectImageFormat(bytes);
  if (detected === "unknown") {
    throw imageError("The image bytes match no supported format.", { url: source });
  }
  return { bytes, detected };
};

const readImageBytes = async (source: string, policy: ImageFetchPolicy): Promise<Uint8Array> => {
  if (source.startsWith(DATA_URI_PREFIX)) {
    return decodeDataUri(source);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    if (!policy.allowRemote) {
      throw imageError("Remote images are disabled.", { url: source });
    }
    return fetchRemoteImage(source, policy);
  }
  return readLocalImage(source, policy);
};

const encodingFor = (detected: DetectedImageFormat): ImageEncoding => {
  switch (detected) {
    case "jpeg":
      return "jpeg";
    case "gif":
      return "gif";
    case "bmp":
      return "bmp";
    default:
      return "png";
  }
};

const needsConversion = (detected: DetectedImageFormat): boolean =>
  detected === "webp" || detected === "avif" || detected === "tiff" || detected === "svg";

export const targetWidthPixels = (
  contentWidth: Dxa,
  maxWidthRatio: number,
  ratio: number,
): number => Math.max(1, Math.round(dxaToPixel(contentWidth) * maxWidthRatio * ratio));

export const rasterDensityFor = (nominalWidth: number, targetWidth: number): number => {
  if (nominalWidth <= 0) {
    return NOMINAL_SVG_DENSITY;
  }
  const wanted = (NOMINAL_SVG_DENSITY * SVG_RASTER_DENSITY_FACTOR * targetWidth) / nominalWidth;
  return Math.min(Math.max(Math.round(wanted), NOMINAL_SVG_DENSITY), MAXIMUM_RASTER_DENSITY);
};

const openPipeline = async (
  resolved: ResolvedImage,
  targetWidth: number,
  policy: ImageFetchPolicy,
  source: string,
): Promise<Sharp> => {
  const buffer = Buffer.from(resolved.bytes);
  if (resolved.detected !== "svg") {
    return sharp(buffer, { limitInputPixels: policy.maximumPixels });
  }
  const nominal = await readMetadata(
    sharp(buffer, { density: NOMINAL_SVG_DENSITY, limitInputPixels: policy.maximumPixels }),
    source,
  );
  const density = rasterDensityFor(nominal.width, targetWidth);
  return sharp(buffer, { density, limitInputPixels: policy.maximumPixels });
};

const readMetadata = async (pipeline: Sharp, source: string): Promise<Metadata> => {
  try {
    return await pipeline.metadata();
  } catch (reason) {
    throw imageError("The image cannot be decoded.", {
      url: source,
      reason: reason instanceof Error ? reason.message : "unknown",
    });
  }
};

const encodeImage = async (
  pipeline: Sharp,
  encoding: ImageEncoding,
  source: string,
): Promise<Uint8Array> => {
  try {
    return encoding === "jpeg" ? await pipeline.jpeg().toBuffer() : await pipeline.png().toBuffer();
  } catch (reason) {
    throw imageError("The image cannot be re encoded.", {
      url: source,
      reason: reason instanceof Error ? reason.message : "unknown",
    });
  }
};

export const prepareImage = async (
  resolved: ResolvedImage,
  contentWidth: Dxa,
  maxWidthRatio: number,
  widthRatio: number,
  policy: ImageFetchPolicy,
  source: string,
): Promise<RenderedImage> => {
  const targetWidth = targetWidthPixels(contentWidth, maxWidthRatio, widthRatio);

  const probe = await openPipeline(resolved, targetWidth, policy, source);

  const metadata = await readMetadata(probe, source);
  const intrinsicWidth = metadata.width;
  const intrinsicHeight = metadata.height;
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    throw imageError("The image carries no usable dimensions.", { url: source });
  }
  if (intrinsicWidth * intrinsicHeight > policy.maximumPixels) {
    throw imageError("The image exceeds the configured pixel limit.", {
      url: source,
      pixels: intrinsicWidth * intrinsicHeight,
      maximumPixels: policy.maximumPixels,
    });
  }

  const renderedWidth = Math.min(targetWidth, intrinsicWidth);
  const renderedHeight = Math.max(
    1,
    Math.round((renderedWidth / intrinsicWidth) * intrinsicHeight),
  );

  const mustResize = renderedWidth < intrinsicWidth;
  if (!mustResize && !needsConversion(resolved.detected)) {
    return {
      data: resolved.bytes,
      encoding: encodingFor(resolved.detected),
      intrinsic: { width: px(intrinsicWidth), height: px(intrinsicHeight) },
      rendered: { width: px(renderedWidth), height: px(renderedHeight) },
    };
  }

  let pipeline = probe.clone();
  if (mustResize) {
    pipeline = pipeline.resize({ width: renderedWidth, withoutEnlargement: true });
  }
  const encoding = encodingFor(resolved.detected);
  const data = await encodeImage(pipeline, encoding, source);

  return {
    data,
    encoding: encoding === "jpeg" ? "jpeg" : "png",
    intrinsic: { width: px(intrinsicWidth), height: px(intrinsicHeight) },
    rendered: { width: px(renderedWidth), height: px(renderedHeight) },
  };
};

const collectNodes = (
  nodes: readonly RootContent[],
  images: Image[],
  figures: LeafDirective[],
): void => {
  for (const node of nodes) {
    if (node.type === "image") {
      images.push(node);
      continue;
    }
    if (node.type === "leafDirective" && isFigureDirective(node)) {
      figures.push(node);
      continue;
    }
    if ("children" in node && Array.isArray(node.children)) {
      collectNodes(node.children, images, figures);
    }
  }
};

export const resolveDocumentImages = async (
  tree: Root,
  options: ImageResolutionOptions,
): Promise<ImageResolutionTable> => {
  const images: Image[] = [];
  const figures: LeafDirective[] = [];
  collectNodes(tree.children, images, figures);

  const requests: { readonly node: object; readonly request: ImageRequest }[] = [
    ...images.map((node) => ({
      node,
      request: {
        source: node.url,
        alternativeText: node.alt ?? "",
        widthRatio: 1,
        caption: null,
      },
    })),
    ...figures.flatMap((node) => {
      const parsed = parseFigureDirective(node);
      if (!parsed.ok) {
        return [];
      }
      return [
        {
          node,
          request: {
            source: parsed.value.source,
            alternativeText: parsed.value.alternativeText,
            widthRatio: parsed.value.widthRatio,
            caption: parsed.value.caption,
          },
        },
      ];
    }),
  ];

  const table = new Map<object, IrImageAsset>();
  if (requests.length === 0) {
    return table;
  }
  if (requests.length > options.policy.maximumImagesPerDocument) {
    throw imageError("The document carries more images than the configured limit.", {
      images: requests.length,
      maximumImages: options.policy.maximumImagesPerDocument,
    });
  }

  for (const entry of requests) {
    try {
      const resolved = await resolveImageSource(entry.request.source, options.policy);
      const prepared = await prepareImage(
        resolved,
        options.contentWidth,
        options.maxWidthRatio,
        entry.request.widthRatio,
        options.policy,
        entry.request.source,
      );
      table.set(entry.node, {
        sourceKey: entry.request.source,
        data: prepared.data,
        encoding: prepared.encoding,
        intrinsic: prepared.intrinsic,
        rendered: prepared.rendered,
      });
    } catch (reason) {
      if (options.strict) {
        throw reason;
      }
      options.sink.add(
        warning("IMAGE_UNAVAILABLE", "The image could not be used, it was replaced by its text.", {
          source: entry.request.source,
          reason: reason instanceof Error ? reason.message : "unknown",
        }),
      );
    }
  }

  return table;
};
