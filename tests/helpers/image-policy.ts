import type { ImageFetchPolicy } from "../../src/types/images.ts";

export const strictImagePolicy = (overrides: Partial<ImageFetchPolicy> = {}): ImageFetchPolicy => ({
  allowRemote: false,
  allowLocal: false,
  allowlist: [],
  assetsDirectory: "./assets",
  maximumBytes: 10_485_760,
  maximumPixels: 40_000_000,
  maximumImagesPerDocument: 100,
  timeoutMs: 5_000,
  ...overrides,
});
