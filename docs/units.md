# Units

The source tree carries no comments (C5). This file is where the unit system is explained.

Layout formats mix five length units. A wrong factor never crashes: it produces a document that
is quietly wrong. Every length in `md2` therefore travels as a branded number, and the only file
allowed to create a branded value is `src/units.ts`.

## The units

| Type         | Name                | Definition              | Where it appears                                        |
| ------------ | ------------------- | ----------------------- | ------------------------------------------------------- |
| `Pt`         | point               | 1/72 inch               | theme typography, spacing, border widths before scaling |
| `HalfPt`     | half point          | 1/144 inch              | OOXML run and paragraph font sizes                      |
| `Dxa`        | twip                | 1/1440 inch             | OOXML lengths: page, margins, indents, column widths    |
| `Eighth`     | eighth of a point   | 1/576 inch              | OOXML border widths                                     |
| `Px`         | pixel               | 1/96 inch by convention | image intrinsic and rendered sizes                      |
| `Emu`        | English metric unit | 1/914400 inch           | OOXML drawing extents                                   |
| `Millimeter` | millimetre          | 1/25.4 inch             | page sizes expressed in ISO paper terms                 |
| `Inch`       | inch                | base unit               | page sizes expressed in US paper terms                  |

## Reference values

| Quantity       | Pt  | HalfPt | Dxa            | Eighth |
| -------------- | --- | ------ | -------------- | ------ |
| Body 11 pt     | 11  | 22     | 220            | -      |
| Body 12 pt     | 12  | 24     | 240            | -      |
| Border 0.5 pt  | 0.5 | -      | -              | 4      |
| Border 1 pt    | 1   | -      | -              | 8      |
| Border 3 pt    | 3   | -      | -              | 24     |
| One inch       | 72  | -      | 1440           | -      |
| Margin 25.4 mm | -   | -      | 1440           | -      |
| A4             | -   | -      | 11906 by 16838 | -      |
| Letter         | -   | -      | 12240 by 15840 | -      |

`tests/unit/units.test.ts` asserts this table entry by entry. Changing a factor breaks a named
test rather than a rendered document.

## Traps

1. A font size in OOXML is a half point. `size: 24` means 12 pt. Write
   `pointToHalfPoint(theme.type.baseSize)` and never a bare number.
2. A border width in OOXML is an eighth of a point. `size: 8` means 1 pt.
3. A twip is 1/1440 inch, so 20 twips make a point. Rounding happens once, at conversion time,
   through `Math.round`, so that two runs of the same input produce the same integers (C15).
4. A pixel has no physical size. The project fixes it at 96 per inch, which makes 15 twips per
   pixel. Any image pipeline that assumes 72 or 300 will drift.
5. Adding two lengths of different units is a compile error by construction: `addDxa` accepts
   `Dxa` only. This is the whole point of the branding.
6. Conversions to the numeric shape a third party library expects happen at the call site of that
   library, inside the backend, never earlier.

## Why assertions live in one file

A branded type cannot be produced without one type assertion. Concentrating every assertion in
`src/units.ts` means the project has exactly one place where a raw number becomes a typed length,
and that place is covered by a truth table. See `docs/adr/0002-branded-units.md`.
