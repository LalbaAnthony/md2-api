import { AlignmentType, LevelFormat } from "docx";
import { MAXIMUM_LIST_LEVELS } from "../../../theme/constants.ts";
import type { ILevelsOptions, INumberingOptions } from "docx";
import type { OrderedListFormat, Theme } from "../../../types/theme.ts";
import type { DocxNumberingReference } from "../../../types/docx-theme.ts";

export const BULLET_REFERENCE = "md2-bullet";
export const ORDERED_REFERENCE = "md2-ordered";
export const HEADINGS_REFERENCE = "md2-headings";

export const numberingReferences: Readonly<Record<DocxNumberingReference, string>> = {
  bullet: BULLET_REFERENCE,
  ordered: ORDERED_REFERENCE,
  headings: HEADINGS_REFERENCE,
};

const levelFormatOf = (
  format: OrderedListFormat,
): (typeof LevelFormat)[keyof typeof LevelFormat] => {
  switch (format) {
    case "decimal":
      return LevelFormat.DECIMAL;
    case "lowerLetter":
      return LevelFormat.LOWER_LETTER;
    case "upperLetter":
      return LevelFormat.UPPER_LETTER;
    case "lowerRoman":
      return LevelFormat.LOWER_ROMAN;
    case "upperRoman":
      return LevelFormat.UPPER_ROMAN;
  }
};

const indentFor = (theme: Theme, level: number) => ({
  left: theme.list.indentStep * (level + 1),
  hanging: theme.list.hanging,
});

const bulletLevels = (theme: Theme): readonly ILevelsOptions[] =>
  Array.from({ length: MAXIMUM_LIST_LEVELS }, (_unused, level) => {
    const glyphs = theme.list.bulletGlyphs;
    const glyph = glyphs[level % glyphs.length] ?? "-";
    return {
      level,
      format: LevelFormat.BULLET,
      text: glyph,
      alignment: AlignmentType.LEFT,
      style: {
        paragraph: { indent: indentFor(theme, level) },
        run: { font: theme.type.body.name },
      },
    };
  });

const orderedLevels = (theme: Theme): readonly ILevelsOptions[] =>
  Array.from({ length: MAXIMUM_LIST_LEVELS }, (_unused, level) => {
    const formats = theme.list.orderedFormats;
    const format = formats[level % formats.length] ?? "decimal";
    return {
      level,
      format: levelFormatOf(format),
      text: `%${String(level + 1)}${theme.list.orderedSuffix}`,
      alignment: AlignmentType.LEFT,
      start: 1,
      style: { paragraph: { indent: indentFor(theme, level) } },
    };
  });

const headingLevels = (theme: Theme): readonly ILevelsOptions[] =>
  Array.from({ length: MAXIMUM_LIST_LEVELS }, (_unused, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: Array.from(
      { length: Math.min(level, 6) + 1 },
      (_ignored, part) => `%${String(part + 1)}`,
    ).join("."),
    alignment: AlignmentType.LEFT,
    start: 1,
    style: { paragraph: { indent: { left: 0, hanging: theme.list.hanging } } },
  }));

export const headingsAreNumbered = (theme: Theme): boolean =>
  theme.heading.some((level) => level.numbered);

export const compileNumbering = (theme: Theme): INumberingOptions => {
  const config = [
    { reference: BULLET_REFERENCE, levels: bulletLevels(theme) },
    { reference: ORDERED_REFERENCE, levels: orderedLevels(theme) },
  ];
  if (!headingsAreNumbered(theme)) {
    return { config };
  }
  return { config: [...config, { reference: HEADINGS_REFERENCE, levels: headingLevels(theme) }] };
};
