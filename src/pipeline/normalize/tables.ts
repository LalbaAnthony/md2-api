import { dxa } from "../../units.ts";
import type { Dxa } from "../../types/units.ts";

export const MAXIMUM_MEASURED_CHARACTERS = 60;
const MINIMUM_MEASURE = 1;

export const measureColumn = (values: readonly string[]): number => {
  let longest = MINIMUM_MEASURE;
  for (const value of values) {
    const length = value.trim().length;
    if (length > longest) {
      longest = length;
    }
  }
  return Math.min(longest, MAXIMUM_MEASURED_CHARACTERS);
};

const distributeResidue = (widths: readonly number[], contentWidth: number): readonly Dxa[] => {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const residue = contentWidth - total;
  const adjusted = [...widths];
  const lastIndex = adjusted.length - 1;
  const last = adjusted[lastIndex];
  if (last !== undefined) {
    adjusted[lastIndex] = last + residue;
  }
  return adjusted.map((width) => dxa(width));
};

const equalWidths = (count: number, contentWidth: number): readonly Dxa[] =>
  distributeResidue(
    Array.from({ length: count }, () => Math.floor(contentWidth / count)),
    contentWidth,
  );

export const computeColumnWidths = (
  measures: readonly number[],
  contentWidth: Dxa,
  minimumColumnWidth: Dxa,
): readonly Dxa[] => {
  const count = measures.length;
  if (count === 0) {
    return [];
  }
  if (minimumColumnWidth * count >= contentWidth) {
    return equalWidths(count, contentWidth);
  }

  const clipped = measures.map((measure) =>
    Math.min(Math.max(Math.round(measure), MINIMUM_MEASURE), MAXIMUM_MEASURED_CHARACTERS),
  );

  const locked = new Array<boolean>(count).fill(false);
  let available: number = contentWidth;

  let lockedSomething = true;
  while (lockedSomething) {
    lockedSomething = false;
    let unlockedMeasure = 0;
    for (let index = 0; index < count; index += 1) {
      if (!locked[index]) {
        unlockedMeasure += clipped[index] ?? MINIMUM_MEASURE;
      }
    }
    if (unlockedMeasure === 0) {
      break;
    }
    for (let index = 0; index < count; index += 1) {
      if (locked[index]) {
        continue;
      }
      const share = (available * (clipped[index] ?? MINIMUM_MEASURE)) / unlockedMeasure;
      if (share < minimumColumnWidth) {
        locked[index] = true;
        available -= minimumColumnWidth;
        lockedSomething = true;
      }
    }
  }

  let unlockedMeasure = 0;
  for (let index = 0; index < count; index += 1) {
    if (!locked[index]) {
      unlockedMeasure += clipped[index] ?? MINIMUM_MEASURE;
    }
  }

  const widths = new Array<number>(count).fill(0);
  for (let index = 0; index < count; index += 1) {
    widths[index] = locked[index]
      ? minimumColumnWidth
      : Math.round((available * (clipped[index] ?? MINIMUM_MEASURE)) / unlockedMeasure);
  }

  return distributeResidue(widths, contentWidth);
};
