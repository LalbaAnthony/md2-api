import type { JsonObject, JsonValue } from "./json.ts";

export interface SerialisedAsset {
  readonly sourceKey: string;
  readonly encoding: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly intrinsic: { readonly width: number; readonly height: number };
  readonly rendered: { readonly width: number; readonly height: number };
}

export interface SerialisedDocument {
  readonly formatVersion: number;
  readonly meta: JsonObject;
  readonly stats: JsonObject;
  readonly anchors: readonly (readonly [string, string])[];
  readonly assets: readonly SerialisedAsset[];
  readonly footnotes: readonly { readonly id: number; readonly blocks: JsonValue }[];
  readonly blocks: JsonValue;
}
