import { describe, expect, it } from "vitest";
import {
  addDxa,
  eighth,
  emu,
  halfPt,
  addPt,
  clampDxa,
  dxa,
  dxaToEmu,
  dxaToPixel,
  inch,
  inchToDxa,
  millimeter,
  millimeterToDxa,
  minPixel,
  pixelToDxa,
  pixelToEmu,
  pointToDxa,
  pointToEighth,
  pointToEmu,
  pointToHalfPoint,
  pt,
  px,
  scaleDxa,
  scalePixel,
  scalePt,
  subtractDxa,
} from "../../src/units.ts";

describe("point conversions", () => {
  const pointCases: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [10, 20, 200, 80, 127000],
    [10.5, 21, 210, 84, 133350],
    [11, 22, 220, 88, 139700],
    [12, 24, 240, 96, 152400],
    [0.5, 1, 10, 4, 6350],
    [1, 2, 20, 8, 12700],
    [3, 6, 60, 24, 38100],
    [72, 144, 1440, 576, 914400],
    [0, 0, 0, 0, 0],
  ];

  it.each(pointCases)(
    "converts %d pt to half-points, dxa, eighths and emu",
    (source, expectedHalfPoint, expectedDxa, expectedEighth, expectedEmu) => {
      expect(pointToHalfPoint(pt(source))).toBe(expectedHalfPoint);
      expect(pointToDxa(pt(source))).toBe(expectedDxa);
      expect(pointToEighth(pt(source))).toBe(expectedEighth);
      expect(pointToEmu(pt(source))).toBe(expectedEmu);
    },
  );

  it("rounds half-points to the nearest integer", () => {
    expect(pointToHalfPoint(pt(10.26))).toBe(21);
    expect(pointToHalfPoint(pt(10.24))).toBe(20);
  });
});

describe("absolute length conversions", () => {
  it("maps one inch to 1440 dxa through every entry point", () => {
    expect(inchToDxa(inch(1))).toBe(1440);
    expect(millimeterToDxa(millimeter(25.4))).toBe(1440);
    expect(pointToDxa(pt(72))).toBe(1440);
  });

  it("maps A4 to 11906 by 16838 dxa", () => {
    expect(millimeterToDxa(millimeter(210))).toBe(11906);
    expect(millimeterToDxa(millimeter(297))).toBe(16838);
  });

  it("maps Letter to 12240 by 15840 dxa", () => {
    expect(inchToDxa(inch(8.5))).toBe(12240);
    expect(inchToDxa(inch(11))).toBe(15840);
  });

  it("maps common margins", () => {
    expect(millimeterToDxa(millimeter(20))).toBe(1134);
    expect(millimeterToDxa(millimeter(12.7))).toBe(720);
  });
});

describe("pixel conversions", () => {
  it("round-trips pixels through dxa", () => {
    expect(pixelToDxa(px(96))).toBe(1440);
    expect(dxaToPixel(dxa(1440))).toBe(96);
    expect(dxaToPixel(pixelToDxa(px(37)))).toBe(37);
  });

  it("maps pixels and dxa to emu", () => {
    expect(dxaToEmu(dxa(1440))).toBe(914400);
    expect(pixelToEmu(px(96))).toBe(914400);
  });

  it("scales and compares pixels", () => {
    expect(scalePixel(px(100), 0.5)).toBe(50);
    expect(scalePixel(px(101), 0.5)).toBe(51);
    expect(minPixel(px(10), px(20))).toBe(10);
    expect(minPixel(px(30), px(20))).toBe(20);
  });
});

describe("dxa arithmetic", () => {
  it("adds any number of values", () => {
    expect(addDxa()).toBe(0);
    expect(addDxa(dxa(100))).toBe(100);
    expect(addDxa(dxa(100), dxa(250), dxa(30))).toBe(380);
  });

  it("subtracts, scales and clamps", () => {
    expect(subtractDxa(dxa(1440), dxa(440))).toBe(1000);
    expect(scaleDxa(dxa(1000), 0.333)).toBe(333);
    expect(clampDxa(dxa(50), dxa(100), dxa(200))).toBe(100);
    expect(clampDxa(dxa(300), dxa(100), dxa(200))).toBe(200);
    expect(clampDxa(dxa(150), dxa(100), dxa(200))).toBe(150);
  });
});

describe("point arithmetic", () => {
  it("adds and scales points", () => {
    expect(addPt()).toBe(0);
    expect(addPt(pt(6), pt(4.5))).toBe(10.5);
    expect(scalePt(pt(10), 1.25)).toBe(12.5);
  });
});

describe("plain constructors", () => {
  it("brands a value without changing it", () => {
    expect(pt(11)).toBe(11);
    expect(halfPt(22)).toBe(22);
    expect(px(96)).toBe(96);
    expect(dxa(1440)).toBe(1440);
    expect(eighth(8)).toBe(8);
    expect(emu(914_400)).toBe(914_400);
    expect(millimeter(210)).toBe(210);
    expect(inch(8.5)).toBe(8.5);
  });
});

describe("content width derivation", () => {
  it("derives the usable width of an A4 page with 25.4 mm margins", () => {
    const pageWidth = millimeterToDxa(millimeter(210));
    const margin = millimeterToDxa(millimeter(25.4));
    expect(subtractDxa(pageWidth, addDxa(margin, margin))).toBe(9026);
  });
});
