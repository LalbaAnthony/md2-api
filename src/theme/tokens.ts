import { addDxa, pt, subtractDxa } from "../units.ts";
import {
  COLOR_CHANNEL_DIGITS,
  HEX_COLOR_PATTERN,
  HEX_RADIX,
  WHITE_CHANNEL_MAXIMUM,
} from "./constants.ts";
import { validationError } from "../errors.ts";
import type { Dxa, Pt } from "../types/units.ts";
import type { HexColor, Theme } from "../types/theme.ts";

export const computeContentWidth = (theme: Theme): Dxa => {
  const horizontalMargins = addDxa(
    theme.page.margin.left,
    theme.page.margin.right,
    theme.page.margin.gutter,
  );
  return subtractDxa(theme.page.size.width, horizontalMargins);
};

export const computeContentHeight = (theme: Theme): Dxa =>
  subtractDxa(theme.page.size.height, addDxa(theme.page.margin.top, theme.page.margin.bottom));

export const typeScale = (base: Pt, ratio: number, level: number): Pt =>
  pt(Math.round(base * Math.pow(ratio, level) * 10) / 10);

const parseChannel = (color: HexColor, index: number): number => {
  const start = index * COLOR_CHANNEL_DIGITS;
  const channel = Number.parseInt(color.slice(start, start + COLOR_CHANNEL_DIGITS), HEX_RADIX);
  if (Number.isNaN(channel)) {
    throw validationError("Expected six hexadecimal digits, no hash.", { color });
  }
  return channel;
};

const formatChannel = (channel: number): string => {
  const clamped = Math.min(Math.max(Math.round(channel), 0), WHITE_CHANNEL_MAXIMUM);
  return clamped.toString(HEX_RADIX).padStart(COLOR_CHANNEL_DIGITS, "0").toUpperCase();
};

export const isHexColor = (candidate: string): boolean => HEX_COLOR_PATTERN.test(candidate);

export const mixWithWhite = (color: HexColor, amount: number): HexColor => {
  if (!isHexColor(color)) {
    throw validationError("Expected six hexadecimal digits, no hash.", { color });
  }
  const weight = Math.min(Math.max(amount, 0), 1);
  const channels = [0, 1, 2].map((index) => {
    const original = parseChannel(color, index);
    return original + (WHITE_CHANNEL_MAXIMUM - original) * weight;
  });
  return channels.map(formatChannel).join("");
};

export const tintForBackground = (color: HexColor): HexColor => mixWithWhite(color, 0.88);

export const relativeLuminance = (color: HexColor): number => {
  if (!isHexColor(color)) {
    throw validationError("Expected six hexadecimal digits, no hash.", { color });
  }
  const [red, green, blue] = [0, 1, 2].map((index) => parseChannel(color, index));
  return (
    (0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)) / WHITE_CHANNEL_MAXIMUM
  );
};
