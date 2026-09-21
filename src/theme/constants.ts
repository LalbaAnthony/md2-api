import { inchToDxa, millimeterToDxa } from "../units.ts";
import { inch, millimeter } from "../units.ts";
import type { Dxa } from "../types/units.ts";

export const HEX_COLOR_PATTERN = /^[0-9A-Fa-f]{6}$/;
export const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
export const THEME_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export const MINIMUM_BULLET_GLYPHS = 3;
export const MAXIMUM_LIST_LEVELS = 9;

export const THEME_FILE_SUFFIX = ".json";

export const A4_WIDTH: Dxa = millimeterToDxa(millimeter(210));
export const A4_HEIGHT: Dxa = millimeterToDxa(millimeter(297));
export const LETTER_WIDTH: Dxa = inchToDxa(inch(8.5));
export const LETTER_HEIGHT: Dxa = inchToDxa(inch(11));

export const MARGIN_NARROW: Dxa = millimeterToDxa(millimeter(15));
export const MARGIN_NORMAL: Dxa = millimeterToDxa(millimeter(25.4));
export const MARGIN_WIDE: Dxa = millimeterToDxa(millimeter(32));

export const CHROME_MARGIN: Dxa = millimeterToDxa(millimeter(12.5));

export const WHITE_CHANNEL_MAXIMUM = 255;
export const HEX_RADIX = 16;
export const COLOR_CHANNEL_DIGITS = 2;
