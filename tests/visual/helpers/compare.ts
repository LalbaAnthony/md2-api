import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { VISUAL_THRESHOLD } from "./environment.ts";

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export interface SizeMismatch {
  readonly kind: "size-mismatch";
  readonly actual: ImageSize;
  readonly expected: ImageSize;
}

export interface PixelComparison {
  readonly kind: "compared";
  readonly size: ImageSize;
  readonly mismatched: number;
  readonly total: number;
  readonly ratio: number;
  readonly diff: Buffer;
}

export type Comparison = SizeMismatch | PixelComparison;

const sizeOf = (image: PNG): ImageSize => ({ width: image.width, height: image.height });

export const comparePng = (actual: Buffer, expected: Buffer): Comparison => {
  const left = PNG.sync.read(actual);
  const right = PNG.sync.read(expected);
  if (left.width !== right.width || left.height !== right.height) {
    return { kind: "size-mismatch", actual: sizeOf(left), expected: sizeOf(right) };
  }
  const diff = new PNG({ width: left.width, height: left.height });
  const mismatched = pixelmatch(right.data, left.data, diff.data, left.width, left.height, {
    threshold: VISUAL_THRESHOLD,
  });
  const total = left.width * left.height;
  return {
    kind: "compared",
    size: sizeOf(left),
    mismatched,
    total,
    ratio: total === 0 ? 0 : mismatched / total,
    diff: PNG.sync.write(diff),
  };
};

export const describeComparison = (comparison: Comparison, label: string): string =>
  comparison.kind === "size-mismatch"
    ? `${label} changed size, rendered ${comparison.actual.width}x${comparison.actual.height} against a baseline of ${comparison.expected.width}x${comparison.expected.height}`
    : `${label} differs by ${comparison.mismatched} pixels of ${comparison.total}, ${(comparison.ratio * 100).toFixed(4)} percent`;
