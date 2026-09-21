import { sha256Hex } from "../../lib/hash.ts";
import type { DocumentIr, IrBlock, IrImageAsset } from "../../types/ir.ts";
import type { JsonObject, JsonValue } from "../../types/json.ts";
import type { SerialisedAsset, SerialisedDocument } from "../../types/debug-json.ts";

export const DEBUG_JSON_FORMAT_VERSION = 1;

const digestOf = (data: Uint8Array): string => sha256Hex(Buffer.from(data).toString("base64"));

const serialiseAsset = (asset: IrImageAsset): SerialisedAsset => ({
  sourceKey: asset.sourceKey,
  encoding: asset.encoding,
  byteLength: asset.data.byteLength,
  digest: digestOf(asset.data),
  intrinsic: { width: asset.intrinsic.width, height: asset.intrinsic.height },
  rendered: { width: asset.rendered.width, height: asset.rendered.height },
});

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const plainValue = (value: unknown): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (value instanceof Uint8Array) {
    return { byteLength: value.byteLength, digest: digestOf(value) };
  }
  if (Array.isArray(value)) {
    return value.map(plainValue);
  }
  if (isPlainObject(value)) {
    const entries: [string, JsonValue][] = Object.keys(value)
      .sort()
      .map((key) => [key, plainValue(value[key])]);
    return Object.fromEntries(entries);
  }
  return null;
};

const plainBlocks = (blocks: readonly IrBlock[]): JsonValue => blocks.map(plainValue);

const plainObject = (value: object): JsonObject => {
  const serialised = plainValue(value);
  return isPlainObject(serialised) ? serialised : {};
};

export const serialiseDocument = (document: DocumentIr): SerialisedDocument => ({
  formatVersion: DEBUG_JSON_FORMAT_VERSION,
  meta: plainObject(document.meta),
  stats: plainObject(document.stats),
  anchors: [...document.anchors.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([slug, title]) => [slug, title]),
  assets: [...document.assets.values()]
    .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))
    .map(serialiseAsset),
  footnotes: [...document.footnotes.entries()]
    .sort(([left], [right]) => left - right)
    .map(([id, blocks]) => ({ id, blocks: plainBlocks(blocks) })),
  blocks: plainBlocks(document.blocks),
});

export const serialiseDocumentToBytes = (document: DocumentIr): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(serialiseDocument(document), null, 2)}\n`);
