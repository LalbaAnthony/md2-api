import type { Dxa, Eighth, Emu, HalfPt, Inch, Millimeter, Pt, Px } from "./types/units.ts";

const TWIPS_PER_INCH = 1440;
const MILLIMETERS_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const HALF_POINTS_PER_POINT = 2;
const TWIPS_PER_POINT = TWIPS_PER_INCH / POINTS_PER_INCH;
const EIGHTHS_PER_POINT = 8;
const EMUS_PER_POINT = 12700;
const TWIPS_PER_PIXEL = 15;

export const pt = (value: number): Pt => value as Pt;
export const halfPt = (value: number): HalfPt => value as HalfPt;
export const px = (value: number): Px => value as Px;
export const dxa = (value: number): Dxa => value as Dxa;
export const eighth = (value: number): Eighth => value as Eighth;
export const emu = (value: number): Emu => value as Emu;
export const millimeter = (value: number): Millimeter => value as Millimeter;
export const inch = (value: number): Inch => value as Inch;

export const pointToHalfPoint = (value: Pt): HalfPt =>
  Math.round(value * HALF_POINTS_PER_POINT) as HalfPt;
export const pointToDxa = (value: Pt): Dxa => Math.round(value * TWIPS_PER_POINT) as Dxa;
export const pointToEighth = (value: Pt): Eighth => Math.round(value * EIGHTHS_PER_POINT) as Eighth;
export const pointToEmu = (value: Pt): Emu => Math.round(value * EMUS_PER_POINT) as Emu;

export const millimeterToDxa = (value: Millimeter): Dxa =>
  Math.round((value / MILLIMETERS_PER_INCH) * TWIPS_PER_INCH) as Dxa;
export const inchToDxa = (value: Inch): Dxa => Math.round(value * TWIPS_PER_INCH) as Dxa;
export const pixelToDxa = (value: Px): Dxa => Math.round(value * TWIPS_PER_PIXEL) as Dxa;
export const dxaToPixel = (value: Dxa): Px => Math.round(value / TWIPS_PER_PIXEL) as Px;
export const dxaToEmu = (value: Dxa): Emu =>
  Math.round((value / TWIPS_PER_POINT) * EMUS_PER_POINT) as Emu;
export const pixelToEmu = (value: Px): Emu => dxaToEmu(pixelToDxa(value));

export const addDxa = (...values: readonly Dxa[]): Dxa =>
  values.reduce<number>((total, current) => total + current, 0) as Dxa;
export const subtractDxa = (left: Dxa, right: Dxa): Dxa => (left - right) as Dxa;
export const scaleDxa = (value: Dxa, factor: number): Dxa => Math.round(value * factor) as Dxa;
export const clampDxa = (value: Dxa, minimum: Dxa, maximum: Dxa): Dxa =>
  Math.min(Math.max(value, minimum), maximum) as Dxa;

export const addPt = (...values: readonly Pt[]): Pt =>
  values.reduce<number>((total, current) => total + current, 0) as Pt;
export const scalePt = (value: Pt, factor: number): Pt => (value * factor) as Pt;

export const scalePixel = (value: Px, factor: number): Px => Math.round(value * factor) as Px;
export const minPixel = (left: Px, right: Px): Px => Math.min(left, right) as Px;
