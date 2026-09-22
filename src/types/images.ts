import type { Px } from "./units.ts";

export type ImageEncoding = "png" | "jpeg" | "gif" | "bmp";

export type DetectedImageFormat =
  "png" | "jpeg" | "gif" | "bmp" | "webp" | "avif" | "tiff" | "svg" | "unknown";

export interface ImageFetchPolicy {
  readonly allowRemote: boolean;
  readonly allowLocal: boolean;
  readonly allowlist: readonly string[];
  readonly assetsDirectory: string;
  readonly maximumBytes: number;
  readonly maximumPixels: number;
  readonly maximumImagesPerDocument: number;
  readonly timeoutMs: number;
}

export interface ImageRequest {
  readonly source: string;
  readonly alternativeText: string;
  readonly widthRatio: number;
  readonly caption: string | null;
}

export interface ResolvedImage {
  readonly bytes: Uint8Array;
  readonly detected: DetectedImageFormat;
}

export interface RenderedImage {
  readonly data: Uint8Array;
  readonly encoding: ImageEncoding;
  readonly intrinsic: { readonly width: Px; readonly height: Px };
  readonly rendered: { readonly width: Px; readonly height: Px };
}

export interface AddressGuardOutcome {
  readonly allowed: boolean;
  readonly reason: string | null;
}

export interface ImageTransportRequest {
  readonly address: string;
  readonly timeoutMs: number;
}

export interface ImageTransportResponse {
  readonly statusCode: number;
  readonly location: string | null;
  readonly body: AsyncIterable<Uint8Array>;
  discard(): void;
}

export interface ImageTransport {
  resolve(hostname: string): Promise<string>;
  request(url: URL, options: ImageTransportRequest): Promise<ImageTransportResponse>;
}
