import { describe, expect, it } from "vitest";
import {
  MAXIMUM_MEASURED_CHARACTERS,
  computeColumnWidths,
  measureColumn,
} from "../../src/pipeline/normalize/tables.ts";
import { normalizeDocument } from "../../src/pipeline/normalize/index.ts";
import { parseMarkdown } from "../../src/pipeline/parse.ts";
import { dxa } from "../../src/units.ts";
import type { DocumentIr, IrBlock } from "../../src/types/ir.ts";

const CONTENT_WIDTH = dxa(9026);
const MINIMUM_COLUMN_WIDTH = dxa(680);

const normalize = async (markdown: string): Promise<DocumentIr> => {
  const result = await normalizeDocument(parseMarkdown(markdown), {
    strict: false,
    maxNestingDepth: 100,
    contentWidth: CONTENT_WIDTH,
    tabWidth: 4,
    minimumColumnWidth: MINIMUM_COLUMN_WIDTH,
    defaultLanguage: "en",
    metadata: {},
    documentOptions: {},
  });
  return result.document;
};

const tables = (document: DocumentIr): readonly Extract<IrBlock, { kind: "table" }>[] =>
  document.blocks.filter((block) => block.kind === "table");

const firstTable = (document: DocumentIr): Extract<IrBlock, { kind: "table" }> => {
  const table = tables(document)[0];
  if (table === undefined) {
    throw new Error("The document carries no table.");
  }
  return table;
};

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

const pseudoRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

describe("measuring a column", () => {
  it("takes the longest value", () => {
    expect(measureColumn(["a", "abcd", "ab"])).toBe(4);
  });

  it("ignores the surrounding spaces", () => {
    expect(measureColumn(["  ab  "])).toBe(2);
  });

  it("never reports less than one", () => {
    expect(measureColumn([])).toBe(1);
    expect(measureColumn(["", "   "])).toBe(1);
  });

  it("clips a verbose cell so it cannot absorb the table", () => {
    expect(measureColumn(["x".repeat(500)])).toBe(MAXIMUM_MEASURED_CHARACTERS);
  });
});

describe("the sum of the widths", () => {
  it("equals the usable width exactly on fifty generated cases", () => {
    const random = pseudoRandom(20_260_922);
    for (let index = 0; index < 50; index += 1) {
      const columnCount = 1 + Math.floor(random() * 10);
      const measures = Array.from({ length: columnCount }, () =>
        Math.max(1, Math.floor(random() * 120)),
      );
      const widths = computeColumnWidths(measures, CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
      expect(widths).toHaveLength(columnCount);
      expect(sum(widths), `case ${String(index)} with ${String(columnCount)} columns`).toBe(
        CONTENT_WIDTH,
      );
    }
  });

  it("equals the usable width for every column count up to twenty", () => {
    for (let columnCount = 1; columnCount <= 20; columnCount += 1) {
      const measures = Array.from({ length: columnCount }, (_unused, index) => index + 1);
      const widths = computeColumnWidths(measures, CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
      expect(sum(widths), `${String(columnCount)} columns`).toBe(CONTENT_WIDTH);
    }
  });

  it("equals the usable width when every measure is identical", () => {
    const widths = computeColumnWidths([7, 7, 7], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(sum(widths)).toBe(CONTENT_WIDTH);
  });

  it("equals the usable width when one column dominates", () => {
    const widths = computeColumnWidths([1, 1, 500], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(sum(widths)).toBe(CONTENT_WIDTH);
  });
});

describe("the minimum column width", () => {
  it("never renders a column below the floor", () => {
    const widths = computeColumnWidths([1, 1, 60], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(MINIMUM_COLUMN_WIDTH);
    }
  });

  it("takes the deficit from the columns in excess", () => {
    const widths = computeColumnWidths([1, 1, 1, 60], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(sum(widths)).toBe(CONTENT_WIDTH);
    expect(widths[3]).toBeGreaterThan(widths[0] ?? 0);
  });

  it("splits equally when the floor cannot be honoured", () => {
    const narrow = dxa(1000);
    const widths = computeColumnWidths([1, 2, 3, 4], narrow, MINIMUM_COLUMN_WIDTH);
    expect(sum(widths)).toBe(narrow);
    expect(new Set(widths.slice(0, 3)).size).toBe(1);
  });

  it("returns nothing for a table without columns", () => {
    expect(computeColumnWidths([], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH)).toEqual([]);
  });
});

describe("proportionality", () => {
  it("gives a wider column to a longer measure", () => {
    const widths = computeColumnWidths([5, 20], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(widths[1]).toBeGreaterThan(widths[0] ?? 0);
  });

  it("gives equal columns to equal measures", () => {
    const widths = computeColumnWidths([10, 10, 10], CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(widths[0]).toBe(widths[1]);
  });

  it("keeps an eight column table readable", () => {
    const measures = [4, 12, 8, 30, 6, 18, 9, 22];
    const widths = computeColumnWidths(measures, CONTENT_WIDTH, MINIMUM_COLUMN_WIDTH);
    expect(sum(widths)).toBe(CONTENT_WIDTH);
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(MINIMUM_COLUMN_WIDTH);
    }
  });
});

describe("tables in the intermediate representation", () => {
  const markdown = [
    "| Name | Quantity | Notes |",
    "| :--- | -------: | :---: |",
    "| Bolt | 12 | Steel |",
    "| Nut | 144 | Brass |",
    "",
  ].join("\n");

  it("separates the header row from the body rows", async () => {
    const table = firstTable(await normalize(markdown));
    expect(table.header?.cells).toHaveLength(3);
    expect(table.rows).toHaveLength(2);
  });

  it("records the column alignment of the delimiter row", async () => {
    const table = firstTable(await normalize(markdown));
    expect(table.columnAlign).toEqual(["left", "right", "center"]);
  });

  it("computes widths that fill the usable width", async () => {
    const table = firstTable(await normalize(markdown));
    expect(sum(table.columnWidths)).toBe(CONTENT_WIDTH);
  });

  it("puts paragraphs in every cell, never bare text", async () => {
    const table = firstTable(await normalize(markdown));
    for (const cell of [...(table.header?.cells ?? []), ...table.rows.flatMap((r) => r.cells)]) {
      expect(cell.blocks.every((block) => block.kind === "paragraph")).toBe(true);
      expect(cell.blocks.length).toBeGreaterThan(0);
    }
  });

  it("keeps the inline formatting of a cell", async () => {
    const document = await normalize("| A |\n| - |\n| **bold** and `code` |\n");
    const cell = firstTable(document).rows[0]?.cells[0];
    const first = cell?.blocks[0];
    expect(first?.kind).toBe("paragraph");
    if (first?.kind === "paragraph") {
      expect(first.children.some((child) => child.kind === "inlineCode")).toBe(true);
      expect(first.children.some((child) => child.kind === "text" && child.marks.bold)).toBe(true);
    }
  });

  it("numbers the tables of a document in order", async () => {
    const document = await normalize("| A |\n| - |\n| 1 |\n\ntext\n\n| B |\n| - |\n| 2 |\n");
    expect(tables(document).map((table) => table.sequence)).toEqual([1, 2]);
    expect(document.stats.tables).toBe(2);
  });

  it("pads a ragged row to the widest row", async () => {
    const document = await normalize("| A | B | C |\n| - | - | - |\n| 1 |\n");
    const table = firstTable(document);
    expect(table.rows[0]?.cells).toHaveLength(3);
  });

  it("marks the cells as being inside a table", async () => {
    const table = firstTable(await normalize(markdown));
    const cell = table.rows[0]?.cells[0];
    expect(cell?.blocks[0]?.context.insideTableCell).toBe(true);
  });
});
